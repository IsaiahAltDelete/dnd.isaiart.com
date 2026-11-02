// data/items_gear.js — the mundane half of the item catalogue: every 2024 PHB
// weapon and armour, ammunition, adventuring gear, tools, consumables, Sword
// Coast trade goods, the eight Weapon Mastery properties, and shop stock lists.
//
// Pure data. Nothing is imported; nothing here mutates. The catalogue is deep
// frozen, so `rules/` and `ui/` may read it freely and must clone to instance.
//
// Vocabulary used by consumables (`use.kind`):
//   'heal'    { dice }                          restore hit points
//   'cure'    { conditions:[] }                 end conditions / disease / poison
//   'buff'    { effect:{ id,name,dur,mech } }   apply a timed effect
//   'spell'   { spellId, level }                cast a spell from the item
//   'throw'   { range, save|attack, damage }    improvised grenade (flasks)
//   'utility' { tag }                           freeform, handled by scene code
//   'resource'{ charges, recharge }             kits with limited uses

// ---------------------------------------------------------------------------
// deepFreeze — recursive Object.freeze for exported catalogues (HARD RULE 8).
// ---------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ---------------------------------------------------------------------------
// Entry builders. Small, pure, and only here so ~240 entries stay consistent:
// every item is guaranteed id, name, kind, desc, cost, weight, rarity, icon,
// tint, stack and sellable no matter which section wrote it.
// ---------------------------------------------------------------------------

/** Base item. `o` overrides any default; unknown keys pass straight through. */
function mk(id, name, o = {}) {
  const { desc = '', kind = 'gear', cost = 0, weight = 0, rarity = 'common',
    icon = 'bag', tint = '#b3a482', stack = false, sellable = true, ...rest } = o;
  return { id, name, kind, desc, cost, weight, rarity, icon, tint, stack, sellable, ...rest };
}

/** Weapon. `cat` is 'simple'|'martial'; `props` uses the spec's exact strings. */
function weap(id, name, o) {
  const ranged = (o.props || []).includes('ranged');
  return mk(id, name, {
    kind: 'weapon',
    icon: o.icon || (ranged ? 'bow' : 'sword'),
    tint: o.tint || '#c9d2e0',
    cost: o.cost, weight: o.weight, desc: o.desc,
    category: o.cat,
    die: o.die,
    dtype: o.dtype,
    props: o.props || [],
    versatileDie: o.versatileDie || null,
    range: o.range || null,
    mastery: o.mastery,
    ammoType: o.ammoType || null,
    magic: null,
    ...(o.extra || {}),
  });
}

/** Armour. Heavy armour passes addDex:false; shields use `shieldOf` instead. */
function armr(id, name, o) {
  return mk(id, name, {
    kind: 'armor',
    icon: o.icon || 'armor',
    tint: o.tint || '#9aa4b4',
    cost: o.cost, weight: o.weight, desc: o.desc,
    ac: o.ac,
    addDex: o.addDex !== false,
    dexCap: o.dexCap ?? null,
    category: o.cat,
    strReq: o.strReq || 0,
    stealthDis: !!o.stealthDis,
    slot: 'armor',
  });
}

/** A potion / oil / elixir. */
function potion(id, name, o) {
  return mk(id, name, {
    kind: 'potion', icon: o.icon || 'potion', tint: o.tint || '#e0405a',
    weight: o.weight ?? 0.5, stack: true,
    cost: o.cost, desc: o.desc, rarity: o.rarity || 'common', use: o.use,
    ...(o.extra || {}),
  });
}

/** A spell scroll. */
function scroll(id, name, o) {
  return mk(id, name, {
    kind: 'scroll', icon: 'scroll', tint: o.tint || '#e8e0c8',
    weight: 0, stack: true,
    cost: o.cost, desc: o.desc, rarity: o.rarity || 'common',
    spellLevel: o.spellLevel,
    use: o.use,
  });
}

/** A tool, kit, gaming set or musical instrument. */
function tool(id, name, o) {
  return mk(id, name, {
    kind: 'tool', icon: o.icon || 'anvil', tint: o.tint || '#b98a4a',
    cost: o.cost, weight: o.weight, desc: o.desc,
    toolCategory: o.toolCategory || 'artisan',
    ability: o.ability || 'int',
    ...(o.extra || {}),
  });
}

// Every entry is pushed here, then folded into the GEAR object at the bottom.
const ALL = [];

// ===========================================================================
// 1. WEAPONS — the complete 2024 Player's Handbook table, with Mastery
// ===========================================================================

// --- simple melee ----------------------------------------------------------
ALL.push(
  weap('club', 'Club', {
    cat: 'simple', die: '1d4', dtype: 'bludgeoning', props: ['light'], mastery: 'slow',
    cost: 0.1, weight: 2, icon: 'hammer', tint: '#8a5a30',
    desc: "A shaped length of oak, banded at the head. The floor of the Sleeping Giant is swept clear of them every morning.",
  }),
  weap('dagger', 'Dagger', {
    cat: 'simple', die: '1d4', dtype: 'piercing', props: ['finesse', 'light', 'thrown'],
    range: [20, 60], mastery: 'nick', cost: 2, weight: 1, icon: 'dagger',
    desc: "A finger-length of good Neverwinter steel. Quick to draw, quicker to hide, and welcome in any coat lining.",
  }),
  weap('greatclub', 'Greatclub', {
    cat: 'simple', die: '1d8', dtype: 'bludgeoning', props: ['two-handed'], mastery: 'push',
    cost: 0.2, weight: 10, icon: 'hammer', tint: '#7a4f2a',
    desc: "A tree limb trimmed to a handle and left otherwise alone. Hill giants make them from whole trunks; the rest of us settle for less.",
  }),
  weap('handaxe', 'Handaxe', {
    cat: 'simple', die: '1d6', dtype: 'slashing', props: ['light', 'thrown'],
    range: [20, 60], mastery: 'vex', cost: 5, weight: 2, icon: 'axe',
    desc: "A woodsman's axe balanced for the throw. Half the farmsteads along the Triboar Trail keep one propped by the door.",
  }),
  weap('javelin', 'Javelin', {
    cat: 'simple', die: '1d6', dtype: 'piercing', props: ['thrown'],
    range: [30, 120], mastery: 'slow', cost: 0.5, weight: 2, icon: 'spear',
    desc: "A light iron-headed throwing spear, sold in sheaves of six. Lords' Alliance caravan guards carry them out of pure habit.",
  }),
  weap('light-hammer', 'Light Hammer', {
    cat: 'simple', die: '1d4', dtype: 'bludgeoning', props: ['light', 'thrown'],
    range: [20, 60], mastery: 'nick', cost: 2, weight: 2, icon: 'hammer',
    desc: "A one-handed smith's hammer with a leather-wrapped grip, thrown as readily as swung.",
  }),
  weap('mace', 'Mace', {
    cat: 'simple', die: '1d6', dtype: 'bludgeoning', props: [], mastery: 'sap',
    cost: 5, weight: 4, icon: 'mace',
    desc: "A flanged head on a steel haft: an honest weapon for breaking dishonest armour. The war-priests of Tempus favour it.",
  }),
  weap('quarterstaff', 'Quarterstaff', {
    cat: 'simple', die: '1d6', dtype: 'bludgeoning', props: ['versatile'], versatileDie: '1d8',
    mastery: 'topple', cost: 0.2, weight: 4, icon: 'staff', tint: '#a97c46',
    desc: "Six feet of ash, iron-shod at both ends. Every hedge wizard and footsore pilgrim on the High Road leans on one.",
  }),
  weap('sickle', 'Sickle', {
    cat: 'simple', die: '1d4', dtype: 'slashing', props: ['light'], mastery: 'nick',
    cost: 1, weight: 2, icon: 'dagger', tint: '#b8c0cc',
    desc: "A curved harvesting blade. Chauntea's field-priests bless them at Greengrass, and goblins steal them soon after.",
  }),
  weap('spear', 'Spear', {
    cat: 'simple', die: '1d6', dtype: 'piercing', props: ['thrown', 'versatile'],
    versatileDie: '1d8', range: [20, 60], mastery: 'sap', cost: 1, weight: 3, icon: 'spear',
    desc: "An ash shaft with a leaf-shaped head. The oldest weapon on the Sword Coast, and still the most common.",
  }),
);

// --- simple ranged ---------------------------------------------------------
ALL.push(
  weap('dart', 'Dart', {
    cat: 'simple', die: '1d4', dtype: 'piercing', props: ['finesse', 'thrown'],
    range: [20, 60], mastery: 'vex', cost: 0.05, weight: 0.25, icon: 'spear', stack: true,
    desc: "A weighted iron dart with a scrap of feather for fletching. Sold by the tin along the Neverwinter docks.",
  }),
  weap('light-crossbow', 'Light Crossbow', {
    cat: 'simple', die: '1d8', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'loading', 'two-handed'], range: [80, 320],
    mastery: 'slow', cost: 25, weight: 5, ammoType: 'bolt', tint: '#8a5a30',
    desc: "A simple stirrup crossbow. Slow to crank, but a farmhand with one can put a bolt clean through a bugbear.",
  }),
  weap('shortbow', 'Shortbow', {
    cat: 'simple', die: '1d6', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'two-handed'], range: [80, 320],
    mastery: 'vex', cost: 25, weight: 2, ammoType: 'arrow', tint: '#8a5a30',
    desc: "A short recurve of horn and yew, easy to loose from horseback or from a crowded corridor.",
  }),
  weap('sling', 'Sling', {
    cat: 'simple', die: '1d4', dtype: 'bludgeoning',
    props: ['ranged', 'ammunition'], range: [30, 120],
    mastery: 'slow', cost: 0.1, weight: 0, ammoType: 'bullet', tint: '#a8895e',
    desc: "A leather cradle and two cords. The halfling shepherds of Alderleaf Farm bring down crows with them at forty paces.",
  }),
);

// --- martial melee ---------------------------------------------------------
ALL.push(
  weap('battleaxe', 'Battleaxe', {
    cat: 'martial', die: '1d8', dtype: 'slashing', props: ['versatile'], versatileDie: '1d10',
    mastery: 'topple', cost: 10, weight: 4, icon: 'axe',
    desc: "A bearded axe head on a two-foot haft. The dwarves of Clan Rockseeker will argue its virtues until the ale runs dry.",
  }),
  weap('flail', 'Flail', {
    cat: 'martial', die: '1d8', dtype: 'bludgeoning', props: [], mastery: 'sap',
    cost: 10, weight: 2, icon: 'mace',
    desc: "A spiked ball on a short chain, made to swing around a shield's edge. Awkward to carry, ruinous to meet.",
  }),
  weap('glaive', 'Glaive', {
    cat: 'martial', die: '1d10', dtype: 'slashing', props: ['heavy', 'reach', 'two-handed'],
    mastery: 'graze', cost: 20, weight: 6, icon: 'spear',
    desc: "A long single-edged blade fixed to a six-foot pole. A wall of steel held out at arm's length.",
  }),
  weap('greataxe', 'Greataxe', {
    cat: 'martial', die: '1d12', dtype: 'slashing', props: ['heavy', 'two-handed'],
    mastery: 'cleave', cost: 30, weight: 7, icon: 'axe',
    desc: "A great crescent of iron, heavy enough to split a shield and the arm behind it. Uthgardt heirlooms, most of them.",
  }),
  weap('greatsword', 'Greatsword', {
    cat: 'martial', die: '2d6', dtype: 'slashing', props: ['heavy', 'two-handed'],
    mastery: 'graze', cost: 50, weight: 6, icon: 'sword',
    desc: "Five feet of blade gripped in both hands. A knight's weapon, and a sellsword's entire pension.",
  }),
  weap('halberd', 'Halberd', {
    cat: 'martial', die: '1d10', dtype: 'slashing', props: ['heavy', 'reach', 'two-handed'],
    mastery: 'cleave', cost: 20, weight: 6, icon: 'axe',
    desc: "Axe, spike and hook on a single shaft. Neverwinter's guard drill with them daily in the Protector's Enclave.",
  }),
  weap('lance', 'Lance', {
    cat: 'martial', die: '1d10', dtype: 'piercing', props: ['heavy', 'reach', 'two-handed'],
    mastery: 'topple', cost: 10, weight: 6, icon: 'spear',
    desc: "A long tapering spear meant to be couched from the saddle: useless afoot, terrible at the charge.",
    extra: { note: 'You have Disadvantage when you use a Lance to attack a target within 5 feet. It also requires two hands unless you are mounted.' },
  }),
  weap('longsword', 'Longsword', {
    cat: 'martial', die: '1d8', dtype: 'slashing', props: ['versatile'], versatileDie: '1d10',
    mastery: 'sap', cost: 15, weight: 3, icon: 'sword',
    desc: "The straight cross-hilted blade of the Sword Coast: balanced, versatile, and worth more than the horse you rode in on.",
  }),
  weap('maul', 'Maul', {
    cat: 'martial', die: '2d6', dtype: 'bludgeoning', props: ['heavy', 'two-handed'],
    mastery: 'topple', cost: 10, weight: 10, icon: 'hammer',
    desc: "A two-handed sledge with a blunt iron head. Subtlety is not among the goods on offer.",
  }),
  weap('morningstar', 'Morningstar', {
    cat: 'martial', die: '1d8', dtype: 'piercing', props: [], mastery: 'sap',
    cost: 15, weight: 4, icon: 'mace',
    desc: "A studded steel head that punches through mail where a mace would only dent it.",
  }),
  weap('pike', 'Pike', {
    cat: 'martial', die: '1d10', dtype: 'piercing', props: ['heavy', 'reach', 'two-handed'],
    mastery: 'push', cost: 5, weight: 18, icon: 'spear',
    desc: "Eighteen feet of spear braced against the ground. A hedge of them stops a charge; one alone is merely very long.",
  }),
  weap('rapier', 'Rapier', {
    cat: 'martial', die: '1d8', dtype: 'piercing', props: ['finesse'], mastery: 'vex',
    cost: 25, weight: 2, icon: 'sword', tint: '#dbe2ee',
    desc: "A slender thrusting blade with a swept guard, much in fashion among Waterdhavian duellists.",
  }),
  weap('scimitar', 'Scimitar', {
    cat: 'martial', die: '1d6', dtype: 'slashing', props: ['finesse', 'light'], mastery: 'nick',
    cost: 25, weight: 3, icon: 'sword',
    desc: "A curved Calishite blade, light and wickedly fast out of the draw-cut.",
  }),
  weap('shortsword', 'Shortsword', {
    cat: 'martial', die: '1d6', dtype: 'piercing', props: ['finesse', 'light'], mastery: 'vex',
    cost: 10, weight: 2, icon: 'sword',
    desc: "A broad stabbing blade for close quarters, standard issue in a hundred mercenary companies.",
  }),
  weap('trident', 'Trident', {
    cat: 'martial', die: '1d8', dtype: 'piercing', props: ['thrown', 'versatile'],
    versatileDie: '1d10', range: [20, 60], mastery: 'topple', cost: 5, weight: 4, icon: 'spear',
    desc: "A three-tined fishing spear, sacred to Umberlee's drowned faithful all along the coast.",
  }),
  weap('warhammer', 'Warhammer', {
    cat: 'martial', die: '1d8', dtype: 'bludgeoning', props: ['versatile'], versatileDie: '1d10',
    mastery: 'push', cost: 15, weight: 5, icon: 'hammer',
    desc: "A short-hafted hammer with a wicked back-spike, blessed on the forge-altars of Moradin.",
  }),
  weap('war-pick', 'War Pick', {
    cat: 'martial', die: '1d8', dtype: 'piercing', props: ['versatile'], versatileDie: '1d10',
    mastery: 'sap', cost: 5, weight: 2, icon: 'hammer',
    desc: "A pick-headed hammer for punching through plate and stone alike. Phandalin's miners swear by the lighter version.",
  }),
  weap('whip', 'Whip', {
    cat: 'martial', die: '1d4', dtype: 'slashing', props: ['finesse', 'reach'], mastery: 'slow',
    cost: 2, weight: 3, icon: 'staff', tint: '#7a5230',
    desc: "Ten feet of braided leather with a bite at the end. It reaches where a sword cannot.",
  }),
);

// --- martial ranged --------------------------------------------------------
ALL.push(
  weap('blowgun', 'Blowgun', {
    cat: 'martial', die: '1', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'loading'], range: [25, 100],
    mastery: 'vex', cost: 10, weight: 1, ammoType: 'needle', tint: '#6f5a3a',
    desc: "A lacquered wooden tube for a single needle. Silent, insulting, and lethal with the right coating on the point.",
  }),
  weap('hand-crossbow', 'Hand Crossbow', {
    cat: 'martial', die: '1d6', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'light', 'loading'], range: [30, 120],
    mastery: 'vex', cost: 75, weight: 3, ammoType: 'bolt', tint: '#8a5a30',
    desc: "A small one-handed crossbow, beloved of drow raiders and of Zhentarim who prefer their allies quiet.",
  }),
  weap('heavy-crossbow', 'Heavy Crossbow', {
    cat: 'martial', die: '1d10', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'heavy', 'loading', 'two-handed'], range: [100, 400],
    mastery: 'push', cost: 50, weight: 18, ammoType: 'bolt', tint: '#7a4f2a',
    desc: "A windlass-cranked crossbow that punches through mail at a hundred paces, provided you are given the time to load it.",
  }),
  weap('longbow', 'Longbow', {
    cat: 'martial', die: '1d8', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'heavy', 'two-handed'], range: [150, 600],
    mastery: 'slow', cost: 50, weight: 2, ammoType: 'arrow', tint: '#9a6a34',
    desc: "A six-foot yew warbow. It takes a lifetime of shoulders to draw one, and it will reach clean across a valley.",
  }),
  weap('musket', 'Musket', {
    cat: 'martial', die: '1d12', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'loading', 'two-handed'], range: [40, 120],
    mastery: 'slow', cost: 500, weight: 10, ammoType: 'firearm-bullet', tint: '#6a5a48',
    desc: "A smokepowder longarm out of the House of Gond. Rare, loud, and priced as though the Wonderbringer minted it himself.",
  }),
  weap('pistol', 'Pistol', {
    cat: 'martial', die: '1d10', dtype: 'piercing',
    props: ['ranged', 'ammunition', 'loading'], range: [30, 90],
    mastery: 'vex', cost: 250, weight: 3, ammoType: 'firearm-bullet', tint: '#6a5a48',
    desc: "A short smokepowder arm from the workshops of Gond. Temperamental, deafening, and devastating across a table.",
  }),
);

// ===========================================================================
// 2. ARMOUR — light, medium, heavy, and the shield
// ===========================================================================

ALL.push(
  armr('padded-armor', 'Padded Armor', {
    cat: 'light', ac: 11, cost: 5, weight: 8, stealthDis: true, tint: '#c2a878',
    desc: "Quilted layers of cloth and batting. Cheap, warm in a Nightal wind, and it rustles like a sack of dry leaves.",
  }),
  armr('leather-armor', 'Leather Armor', {
    cat: 'light', ac: 11, cost: 10, weight: 10, tint: '#a0682f',
    desc: "Boiled and moulded hide over a supple jerkin. The Sword Coast's standing answer to a knife in the dark.",
  }),
  armr('studded-leather', 'Studded Leather Armor', {
    cat: 'light', ac: 12, cost: 45, weight: 13, tint: '#8a5a2e',
    desc: "Leather reinforced with close-set iron rivets. The finest armour any self-respecting burglar will admit to owning.",
  }),
  armr('hide-armor', 'Hide Armor', {
    cat: 'medium', ac: 12, dexCap: 2, cost: 10, weight: 12, tint: '#8c6a44',
    desc: "Thick furs and pelts stitched over hardened plates. Uthgardt work, and it smells honestly of the work.",
  }),
  armr('chain-shirt', 'Chain Shirt', {
    cat: 'medium', ac: 13, dexCap: 2, cost: 50, weight: 20, tint: '#9aa4b4',
    desc: "A shirt of interlocking rings worn under ordinary clothes: quiet enough for a Harper, stout enough for a brawl.",
  }),
  armr('scale-mail', 'Scale Mail', {
    cat: 'medium', ac: 14, dexCap: 2, cost: 50, weight: 45, stealthDis: true, tint: '#8f9aa8',
    desc: "Overlapping metal scales riveted to a leather backing. It clatters like a coin-purse, but it turns a blade.",
  }),
  armr('breastplate', 'Breastplate', {
    cat: 'medium', ac: 14, dexCap: 2, cost: 400, weight: 20, tint: '#c9d2e0',
    desc: "A fitted steel cuirass over leather, leaving the limbs free. Neverwinter's officers wear them on parade and in the field alike.",
  }),
  armr('half-plate', 'Half Plate Armor', {
    cat: 'medium', ac: 15, dexCap: 2, cost: 750, weight: 40, stealthDis: true, tint: '#d3dbe8',
    desc: "Shaped plates buckled over mail across most of the body. A knight's kit without a knight's purse behind it.",
  }),
  armr('ring-mail', 'Ring Mail', {
    cat: 'heavy', ac: 14, addDex: false, cost: 30, weight: 40, stealthDis: true, tint: '#8b93a0',
    desc: "Leather sewn with heavy iron rings. Outmoded, cheap, and still a great deal better than nothing at all.",
  }),
  armr('chain-mail', 'Chain Mail', {
    cat: 'heavy', ac: 16, addDex: false, cost: 75, weight: 55, strReq: 13, stealthDis: true, tint: '#9aa4b4',
    desc: "A full riveted hauberk with coif and gauntlets. Heavy, hot, and reliably still alive at the end of the day.",
  }),
  armr('splint-armor', 'Splint Armor', {
    cat: 'heavy', ac: 17, addDex: false, cost: 200, weight: 60, strReq: 15, stealthDis: true, tint: '#aab3c0',
    desc: "Vertical strips of steel riveted to a leather backing, favoured by the Lords' Alliance road-wardens on the High Road.",
  }),
  armr('plate-armor', 'Plate Armor', {
    cat: 'heavy', ac: 18, addDex: false, cost: 1500, weight: 65, strReq: 15, stealthDis: true, tint: '#e0e6f0',
    desc: "A full harness of shaped steel, fitted to one body and worth a working farmstead. The Order of the Gauntlet wears little else.",
  }),
  mk('shield', 'Shield', {
    kind: 'shield', ac: 2, addDex: false, cost: 10, weight: 6, icon: 'shield', tint: '#d3a24a', slot: 'shield',
    desc: "A banded wooden shield faced in hide and steel. The Lionshield Coster stamps its blue lion on every one it sells.",
  }),
);

// ===========================================================================
// 3. AMMUNITION
// ===========================================================================

ALL.push(
  mk('arrow', 'Arrow', {
    kind: 'ammo', cost: 0.05, weight: 0.05, stack: true, icon: 'spear', tint: '#b8945c',
    ammoType: 'arrow', bundle: 20, slot: 'ammo',
    desc: "A goose-fletched shaft of ash. Barthen's sells them by the sheaf of twenty and counts every one.",
  }),
  mk('arrow-silvered', 'Silvered Arrow', {
    kind: 'ammo', cost: 5, weight: 0.05, stack: true, icon: 'spear', tint: '#dfe6f0',
    ammoType: 'arrow', bundle: 1, slot: 'ammo',
    desc: "An arrowhead washed in silver at ten gold pieces the ounce. Lycanthropes on the Triboar Trail have made it a sound investment.",
  }),
  mk('crossbow-bolt', 'Crossbow Bolt', {
    kind: 'ammo', cost: 0.05, weight: 0.075, stack: true, icon: 'spear', tint: '#a8843c',
    ammoType: 'bolt', bundle: 20, slot: 'ammo',
    desc: "A short, thick quarrel with a squared iron head, sold in a hardwood case of twenty.",
  }),
  mk('sling-bullet', 'Sling Bullet', {
    kind: 'ammo', cost: 0.002, weight: 0.075, stack: true, icon: 'spear', tint: '#9a9a9a',
    ammoType: 'bullet', bundle: 20, slot: 'ammo',
    desc: "A cast lead pellet, far deadlier than a river stone and cheaper than a mug of small beer.",
  }),
  mk('blowgun-needle', 'Blowgun Needle', {
    kind: 'ammo', cost: 0.02, weight: 0.02, stack: true, icon: 'spear', tint: '#c0c8d4',
    ammoType: 'needle', bundle: 50, slot: 'ammo',
    desc: "A slender fletched needle in a wax-sealed tube of fifty, ready to take a coat of something unpleasant.",
  }),
  mk('firearm-bullet', 'Firearm Bullet', {
    kind: 'ammo', cost: 0.3, weight: 0.1, stack: true, icon: 'spear', tint: '#8a8a96',
    ammoType: 'firearm-bullet', bundle: 10, slot: 'ammo',
    desc: "A lead ball and a paper cartridge of smokepowder, packed ten to a tin by the Gondar artificers of Lantan.",
  }),
);

// ===========================================================================
// 4. ADVENTURING GEAR
// ===========================================================================

ALL.push(
  mk('abacus', 'Abacus', {
    cost: 2, weight: 2, icon: 'dice', tint: '#a97c46',
    desc: "Beads on brass rods. Halia Thornton keeps one on the Exchange counter and uses it to make her prices sound inevitable.",
  }),
  mk('backpack', 'Backpack', {
    cost: 2, weight: 5, icon: 'bag', tint: '#8a5a30', capacity: 30,
    desc: "A canvas pack on leather straps, holding a cubic foot of whatever you have decided is essential.",
  }),
  mk('ball-bearings', 'Ball Bearings', {
    cost: 1, weight: 2, stack: true, icon: 'target', tint: '#b0b6c0',
    desc: "A pouch of a thousand tiny steel spheres. Spilled across a corridor they turn a pursuit into a comedy.",
    use: { kind: 'throw', tag: 'ball-bearings', area: 10, save: { ability: 'dex', dc: 10 }, effect: 'prone' },
  }),
  mk('basket', 'Basket', { cost: 0.4, weight: 2, icon: 'bag', tint: '#c2a06a', desc: "A lidded wicker basket, good for eggs, mushrooms, or a very patient cat." }),
  mk('bedroll', 'Bedroll', {
    cost: 1, weight: 7, icon: 'bag', tint: '#7a6a4a',
    desc: "Waxed canvas over a wool blanket. The difference between a Long Rest and a long night on the Triboar Trail.",
  }),
  mk('bell', 'Bell', { cost: 1, weight: 0, icon: 'thunder', tint: '#d3a24a', desc: "A small hand bell. Tied to a trip-line it has saved more caravans than any sword." }),
  mk('blanket', 'Blanket', { cost: 0.5, weight: 3, icon: 'cloak', tint: '#8a6a8a', desc: "Heavy undyed wool. Trilena Stonehill sells them to travellers who underestimated the Sword Mountains." }),
  mk('block-and-tackle', 'Block and Tackle', { cost: 1, weight: 5, icon: 'anvil', tint: '#8a5a30', desc: "Pulleys and rope that let one adventurer lift four times their own weight, slowly and with much complaint." }),
  mk('book', 'Book', { cost: 25, weight: 5, icon: 'book', tint: '#8a2c1e', desc: "A bound volume of vellum: philosophy, ledgers, verse, or a treatise on the ruins beneath Phandalin. Oghma smiles on the reader." }),
  mk('bottle-glass', 'Glass Bottle', { cost: 2, weight: 2, icon: 'flask', tint: '#7fd0c8', desc: "A stoppered bottle of green Waterdhavian glass holding a pint and a half of whatever you dare pour into it." }),
  mk('bucket', 'Bucket', { cost: 0.05, weight: 2, icon: 'bag', tint: '#7a5230', desc: "An iron-hooped wooden bucket. Three gallons of well water, or one extremely indignant mimic." }),
  mk('caltrops', 'Caltrops', {
    cost: 1, weight: 2, stack: true, icon: 'target', tint: '#9aa4b4',
    desc: "A bag of twenty four-pointed spikes that always land point upward. Scatter them behind you and let the goblins learn.",
    use: { kind: 'throw', tag: 'caltrops', area: 5, save: { ability: 'dex', dc: 15 }, damage: { dice: '1', type: 'piercing' }, effect: 'speed-10' },
  }),
  mk('candle', 'Candle', {
    cost: 0.01, weight: 0, stack: true, icon: 'candle', tint: '#f0d264',
    desc: "A tallow candle burning for an hour: bright light 5 feet, dim light 5 feet beyond that.",
    use: { kind: 'utility', tag: 'light', bright: 5, dim: 10, duration: '1 hour' },
  }),
  mk('case-crossbow-bolt', 'Crossbow Bolt Case', { cost: 1, weight: 1, icon: 'bag', tint: '#8a5a30', desc: "A hardwood case holding twenty bolts, worn where a cold hand can find it." }),
  mk('case-map-scroll', 'Map or Scroll Case', { cost: 1, weight: 1, icon: 'scroll', tint: '#b8945c', desc: "A capped leather tube for ten sheets of parchment or one rolled map, waxed against Sword Coast rain." }),
  mk('chain', 'Chain', { cost: 5, weight: 10, icon: 'lock', tint: '#8b93a0', desc: "Ten feet of heavy iron chain with a breaking strain most creatures would rather not test." }),
  mk('chalk', 'Chalk', { cost: 0.01, weight: 0, stack: true, icon: 'scroll', tint: '#f6efe0', desc: "A stick of white chalk. Mark the turnings, or you will meet your own footprints in the dark under Wave Echo Cave." }),
  mk('chest', 'Chest', { cost: 5, weight: 25, icon: 'chest', tint: '#8a5a30', desc: "A banded wooden chest of twelve cubic feet, heavy enough that thieves usually settle for the contents." }),
  mk('climbers-kit', "Climber's Kit", {
    cost: 25, weight: 12, icon: 'bag', tint: '#a9793f',
    desc: "Pitons, boot tips, gloves and a harness. Anchored properly, a fall becomes an embarrassment rather than a funeral.",
  }),
  mk('clothes-fine', 'Fine Clothes', { kind: 'cloak', cost: 15, weight: 6, icon: 'cloak', tint: '#7a3050', slot: 'cloak', desc: "Silk, buttons and careful tailoring. In Waterdeep the right coat opens doors no writ of the Lords Alliance will." }),
  mk('clothes-traveler', "Traveler's Clothes", { kind: 'cloak', cost: 2, weight: 4, icon: 'cloak', tint: '#6a5a44', slot: 'cloak', desc: "Sturdy boots, wool trousers, a hooded cloak: everything a Sword Coast road asks for and nothing it will ruin." }),
  mk('cloak-common', 'Common Cloak', { kind: 'cloak', cost: 0.5, weight: 3, icon: 'cloak', tint: '#5a6a7a', slot: 'cloak', desc: "Undyed wool with a bone toggle. It sheds rain for about an hour and pretends to for another two." }),
  mk('robe', 'Robe', { cost: 1, weight: 4, icon: 'cloak', tint: '#4a3f7a', desc: "Deep-sleeved scholar's robes of the sort worn from Blackstaff Tower down to the meanest hedge-wizard's cottage." }),
  mk('costume', 'Costume', { cost: 5, weight: 4, icon: 'cloak', tint: '#c05a9a', desc: "Motley, paint and a false beard. Half the trick is behaving as though nobody could possibly be looking." }),
  mk('crowbar', 'Crowbar', {
    cost: 2, weight: 5, icon: 'hammer', tint: '#8b93a0',
    desc: "Two feet of forged iron. It grants Advantage on Strength checks wherever leverage can be applied, which is often.",
    mech: { advCheck: 'str-leverage' },
  }),
  mk('flask', 'Flask', { cost: 0.02, weight: 1, icon: 'flask', tint: '#b0b6c0', desc: "A pewter flask holding a pint. What goes in it is your own business." }),
  mk('grappling-hook', 'Grappling Hook', { cost: 2, weight: 4, icon: 'anvil', tint: '#8b93a0', desc: "Four iron flukes on a ring. Thrown well it catches a battlement; thrown badly it catches you on the way down." }),
  mk('hammer', 'Hammer', { cost: 1, weight: 3, icon: 'hammer', tint: '#8a5a30', desc: "A plain carpenter's hammer, ideal for pitons, coffin lids and other doors that were not meant to open." }),
  mk('healers-kit', "Healer's Kit", {
    cost: 5, weight: 3, icon: 'plus', tint: '#5fd07a', charges: 10,
    desc: "Bandages, salve and splints, ten uses to the roll. Spend one to stabilize a dying companion with no roll at all.",
    use: { kind: 'resource', charges: 10, tag: 'stabilize' },
  }),
  mk('hunting-trap', 'Hunting Trap', {
    cost: 5, weight: 25, icon: 'target', tint: '#7a7f88',
    desc: "A saw-toothed steel jaw on a spring. Whatever steps in takes 1d4 piercing damage and stays until it wrenches itself free.",
    use: { kind: 'utility', tag: 'trap', damage: { dice: '1d4', type: 'piercing' }, save: { ability: 'dex', dc: 13 }, escapeDC: 13 },
  }),
  mk('ink', 'Ink', { cost: 10, weight: 0, icon: 'scroll', tint: '#2a2a3a', desc: "A one-ounce bottle of iron-gall ink: expensive, permanent, and the entire reason scribes are paid." }),
  mk('ink-pen', 'Ink Pen', { cost: 0.02, weight: 0, icon: 'scroll', tint: '#e8e0c8', desc: "A cut goose quill, cheap enough to lose and sharp enough to sign a Zhentarim contract you will later regret." }),
  mk('jug', 'Jug', { cost: 0.02, weight: 4, icon: 'flask', tint: '#a9793f', desc: "A glazed earthenware jug holding a gallon of ale, oil or well water." }),
  mk('ladder', 'Ladder (10 ft.)', { cost: 0.1, weight: 25, icon: 'anvil', tint: '#a97c46', desc: "Ten feet of pegged pine: absurd in a dungeon corridor, irreplaceable at the bottom of a shaft." }),
  mk('lamp', 'Lamp', {
    cost: 0.5, weight: 1, icon: 'candle', tint: '#f0b03a',
    desc: "An open oil lamp casting bright light 15 feet and dim light 30 beyond, burning six hours on a flask of oil.",
    use: { kind: 'utility', tag: 'light', bright: 15, dim: 45, duration: '6 hours' },
  }),
  mk('lantern-hooded', 'Hooded Lantern', {
    cost: 5, weight: 2, icon: 'candle', tint: '#f0c85a',
    desc: "A shuttered lantern: bright light 30 feet, dim 30 beyond, and a hood that drops it to a 5-foot glow when something is listening.",
    use: { kind: 'utility', tag: 'light', bright: 30, dim: 60, duration: '6 hours', hoodable: true },
  }),
  mk('lantern-bullseye', 'Bullseye Lantern', {
    cost: 10, weight: 2, icon: 'candle', tint: '#ffd24a',
    desc: "A lensed lantern throwing a 60-foot cone of bright light and 60 more of dim. The tunnel-wardens of the Mere carry nothing else.",
    use: { kind: 'utility', tag: 'light', bright: 60, dim: 120, cone: true, duration: '6 hours' },
  }),
  mk('lock', 'Lock', { cost: 10, weight: 1, icon: 'lock', tint: '#d3a24a', desc: "A key and a warded lock. Picking it wants thieves' tools and a DC 15 Dexterity check, or a very loud hammer." }),
  mk('magnifying-glass', 'Magnifying Glass', { cost: 100, weight: 0, icon: 'eye', tint: '#bfe6ff', desc: "A ground crystal lens in a brass ring. It reads a forger's tremor, and on a bright day it will light a fire in a minute." }),
  mk('manacles', 'Manacles', { cost: 2, weight: 6, icon: 'lock', tint: '#8b93a0', desc: "Wrist irons fitting Small or Medium prisoners. DC 20 to slip, DC 20 to pick, and Harbin Wester prefers you use them." }),
  mk('map', 'Map', { cost: 1, weight: 0, icon: 'map', tint: '#e8e0c8', desc: "An inked chart of some stretch of the Sword Coast: accurate about roads, optimistic about everything else." }),
  mk('mess-kit', 'Mess Kit', { cost: 0.2, weight: 1, icon: 'flask', tint: '#b0b6c0', desc: "Tin cup, tin plate and cutlery, all nested and all rattling at exactly the wrong moment." }),
  mk('mirror', 'Steel Mirror', { cost: 5, weight: 0.5, icon: 'eye', tint: '#dfe6f0', desc: "A polished steel hand mirror: for shaving, for peering round corners, and for not meeting a basilisk's gaze." }),
  mk('net', 'Net', {
    cost: 1, weight: 3, icon: 'bag', tint: '#a08a5a',
    desc: "A weighted ten-foot net. A Large or smaller creature caught in it is Restrained until it cuts its way loose.",
    use: { kind: 'throw', range: [5, 15], effect: 'restrained', escapeDC: 10 },
  }),
  mk('oil-flask', 'Flask of Oil', {
    cost: 0.1, weight: 1, stack: true, icon: 'flask', tint: '#c8a05a',
    desc: "A pint of lamp oil. Thrown, it coats a target and waits; the next open flame does the rest.",
    use: { kind: 'throw', range: [20, 60], damage: { dice: '5', type: 'fire' }, tag: 'oil' },
  }),
  mk('paper', 'Paper', { cost: 0.2, weight: 0, stack: true, icon: 'scroll', tint: '#f6efe0', desc: "A sheet of pressed rag paper, smoother than parchment and twice as fussy about damp." }),
  mk('parchment', 'Parchment', { cost: 0.1, weight: 0, stack: true, icon: 'scroll', tint: '#e8e0c8', desc: "A scraped sheet of calfskin. It survives a river crossing, which paper resolutely does not." }),
  mk('perfume', 'Perfume', { cost: 5, weight: 0, icon: 'flask', tint: '#e0a0d0', desc: "A vial of Calishite attar. In the right parlour it is worth more than a sword; in a goblin warren it is worth nothing." }),
  mk('piton', 'Piton', { cost: 0.05, weight: 0.25, stack: true, icon: 'spear', tint: '#8b93a0', desc: "An iron spike with a ring, hammered into rock or a door frame to hold a rope, a pulley, or a door shut." }),
  mk('pole', 'Pole (10 ft.)', { cost: 0.05, weight: 7, icon: 'staff', tint: '#a97c46', desc: "Ten feet of pine: the most reliable trap-detection device ever devised, and the cheapest." }),
  mk('pot-iron', 'Iron Pot', { cost: 2, weight: 10, icon: 'flask', tint: '#5a5a62', desc: "A one-gallon cauldron. It cooks stew, boils water and, at need, makes an unconvincing helmet." }),
  mk('pouch', 'Pouch', { cost: 0.5, weight: 1, icon: 'bag', tint: '#8a5a30', desc: "A drawstring belt pouch of a fifth of a cubic foot: coins, bullets, spell components, secrets." }),
  mk('quiver', 'Quiver', { cost: 1, weight: 1, icon: 'bag', tint: '#8a5a30', desc: "A stiffened leather quiver for twenty arrows, worn at hip or shoulder as your draw prefers." }),
  mk('ram-portable', 'Portable Ram', { cost: 4, weight: 35, icon: 'hammer', tint: '#7a5230', desc: "An iron-shod beam with two handles. Advantage on Strength checks to break down doors, provided a friend takes the other end." }),
  mk('rope-hempen', 'Hempen Rope (50 ft.)', { cost: 1, weight: 5, icon: 'bag', tint: '#c2a06a', desc: "Fifty feet of hemp: two hit points, DC 17 to burst. Every party owns one and nobody remembers buying it." }),
  mk('rope-silk', 'Silk Rope (50 ft.)', { cost: 10, weight: 5, icon: 'bag', tint: '#e0d8c0', desc: "Fifty feet of silk line, lighter and stronger than hemp and far quieter going over a wall." }),
  mk('sack', 'Sack', { cost: 0.01, weight: 0.5, icon: 'bag', tint: '#c2a06a', desc: "A burlap sack holding a cubic foot. Loot goes in; dignity does not come out." }),
  mk('shovel', 'Shovel', { cost: 2, weight: 5, icon: 'hammer', tint: '#8a5a30', desc: "An iron-bladed spade. Graves, latrines and buried Netherese strongboxes all begin the same way." }),
  mk('signal-whistle', 'Signal Whistle', { cost: 0.05, weight: 0, icon: 'wind', tint: '#c0c8d4', desc: "A bone whistle heard a quarter-mile off. Agree the signals first or you have merely told the wolves where you are." }),
  mk('silver-comb', 'Silver Comb', { kind: 'quest', cost: 0, weight: 0, icon: 'misc', tint: '#d9e2ed', desc: "Sister Garaele's silver comb, intended as a courteous gift for Agatha of Conyberry." }),
  mk('signet-ring', 'Signet Ring', { kind: 'gem', cost: 5, weight: 0, icon: 'ring', tint: '#e3b34a', desc: "A ring cut with a house sigil for sealing wax. In Waterdeep the seal travels further than the hand that wears it." }),
  mk('soap', 'Soap', { cost: 0.02, weight: 0, icon: 'bag', tint: '#e8e0c8', desc: "A cake of lye soap. Sister Garaele holds that Tymora favours the clean; the innkeeper agrees for other reasons." }),
  mk('spikes-iron', 'Iron Spikes (10)', { cost: 1, weight: 5, stack: true, icon: 'spear', tint: '#8b93a0', desc: "Ten heavy spikes for wedging doors shut behind you: the oldest and best trick in Undermountain." }),
  mk('spyglass', 'Spyglass', { cost: 1000, weight: 1, icon: 'eye', tint: '#bfe6ff', desc: "A brass tube of Lantanese lenses magnifying twofold. Worth a lord's ransom, and cheap at the price on an open road." }),
  mk('tent', 'Tent', { cost: 2, weight: 20, icon: 'bag', tint: '#8a7a5a', desc: "Oiled canvas for two. It keeps out rain, wind, and roughly none of the noises of Neverwinter Wood." }),
  mk('tinderbox', 'Tinderbox', { cost: 0.5, weight: 1, icon: 'flame', tint: '#f07a2a', desc: "Flint, steel and char-cloth in a tin. A torch takes an action; a campfire takes a minute and a little cursing." }),
  mk('torch', 'Torch', {
    cost: 0.01, weight: 1, stack: true, icon: 'flame', tint: '#f07a2a',
    desc: "A pitch-soaked brand burning one hour: bright light 20 feet, dim 20 beyond. Swung in anger it deals 1 fire damage.",
    use: { kind: 'utility', tag: 'light', bright: 20, dim: 40, duration: '1 hour' },
  }),
  mk('vial', 'Vial', { cost: 1, weight: 0, icon: 'flask', tint: '#b0b6c0', desc: "A stoppered glass vial holding four ounces of liquid, or one very carefully bottled idea." }),
  mk('waterskin', 'Waterskin', { cost: 0.2, weight: 5, icon: 'flask', tint: '#8a6a44', desc: "A four-pint skin, full. On the Triboar Trail in Flamerule it is the most valuable thing you own." }),
  mk('whetstone', 'Whetstone', { cost: 0.01, weight: 1, icon: 'gem', tint: '#8b93a0', desc: "A block of grit-stone. Nothing sharpens a blade, or an evening's silence, quite so well." }),
);

// ===========================================================================
// 5. SPELLCASTING FOCUSES — kind 'focus' equips to the off hand
// ===========================================================================

ALL.push(
  mk('arcane-focus', 'Arcane Focus', {
    kind: 'focus', cost: 10, weight: 2, icon: 'gem', tint: '#a76ad8', slot: 'offHand',
    focusType: 'arcane', mech: { spellFocus: 'arcane' },
    desc: "A rod, orb or carved staff-head attuned to the Weave, standing in for the fiddlier material components of a spell.",
  }),
  mk('crystal', 'Crystal', {
    kind: 'focus', cost: 10, weight: 1, icon: 'gem', tint: '#63d6d0', slot: 'offHand',
    focusType: 'arcane', mech: { spellFocus: 'arcane' },
    desc: "A flawed quartz prism on a thong. Mystra's faithful say the Weave prefers an honest flaw to a perfect stone.",
  }),
  mk('orb', 'Orb', {
    kind: 'focus', cost: 20, weight: 3, icon: 'gem', tint: '#4a7ad0', slot: 'offHand',
    focusType: 'arcane', mech: { spellFocus: 'arcane' },
    desc: "A heavy sphere of smoked glass that holds a spell's shape a heartbeat longer than the air around it.",
  }),
  mk('rod', 'Rod', {
    kind: 'focus', cost: 10, weight: 2, icon: 'wand', tint: '#8a5a30', slot: 'offHand',
    focusType: 'arcane', mech: { spellFocus: 'arcane' },
    desc: "A short banded rod of blackwood. The wizards of Neverwinter's Blacklake district favour them for their lack of ostentation.",
  }),
  mk('focus-wand', 'Wand (Arcane Focus)', {
    kind: 'focus', cost: 10, weight: 1, icon: 'wand', tint: '#c3a2ff', slot: 'offHand',
    focusType: 'arcane', mech: { spellFocus: 'arcane' },
    desc: "A slender rowan wand with a copper core: no charges, no magic of its own, simply a good place to put a spell.",
  }),
  mk('holy-symbol', 'Holy Symbol', {
    kind: 'focus', cost: 5, weight: 1, icon: 'holy', tint: '#ffe9a8', slot: 'offHand',
    focusType: 'holy', mech: { spellFocus: 'holy' },
    desc: "An amulet, emblem or reliquary bearing a god's sign: Tymora's coin, Lathander's rising sun, Tempus's flaming sword.",
  }),
  mk('holy-symbol-emblem', 'Emblem of Faith', {
    kind: 'focus', cost: 5, weight: 0, icon: 'holy', tint: '#ffd24a', slot: 'offHand',
    focusType: 'holy', mech: { spellFocus: 'holy' },
    desc: "A sigil worked into a shield's face or stitched over the heart, so both hands stay free for the god's work.",
  }),
  mk('reliquary', 'Reliquary', {
    kind: 'focus', cost: 5, weight: 2, icon: 'holy', tint: '#e3b34a', slot: 'offHand',
    focusType: 'holy', mech: { spellFocus: 'holy' },
    desc: "A small hinged casket holding a saint's fingerbone or a splinter of an altar. Ilmater's shrines sell them cheap and mean it.",
  }),
  mk('druidic-focus', 'Druidic Focus', {
    kind: 'focus', cost: 1, weight: 1, icon: 'leaf', tint: '#5fae52', slot: 'offHand',
    focusType: 'druidic', mech: { spellFocus: 'druidic' },
    desc: "A sprig of mistletoe, a totem of antler and bone, or a wand of living yew, cut with the Old Faith's permission.",
  }),
  mk('yew-wand', 'Yew Wand', {
    kind: 'focus', cost: 10, weight: 1, icon: 'leaf', tint: '#7ac06a', slot: 'offHand',
    focusType: 'druidic', mech: { spellFocus: 'druidic' },
    desc: "A green wand cut from a living yew and never allowed to dry. Reidoth of Thundertree carries one older than the ruin he guards.",
  }),
  mk('component-pouch', 'Component Pouch', {
    kind: 'focus', cost: 25, weight: 2, icon: 'bag', tint: '#8a5a30', slot: 'offHand',
    focusType: 'component', mech: { spellFocus: 'component' },
    desc: "A compartmented belt pouch of bat guano, powdered iron, chalk and worse. It covers every material component with no listed cost.",
  }),
  mk('spellbook', 'Spellbook', {
    kind: 'gear', cost: 50, weight: 3, icon: 'book', tint: '#4a3f7a',
    desc: "A hundred blank vellum pages bound in tooled leather. A wizard's whole fortune, and the first thing they save from a fire.",
  }),
);

// ===========================================================================
// 6. EQUIPMENT PACKS — bundled kit, sold at a small discount
// ===========================================================================

ALL.push(
  mk('burglars-pack', "Burglar's Pack", {
    cost: 16, weight: 42, icon: 'bag', tint: '#5a5a7a',
    desc: "Everything wanted for a quiet evening in somebody else's house: bearings, a crowbar, a hooded lantern and a great deal of rope.",
    contents: [['backpack', 1], ['ball-bearings', 1], ['candle', 10], ['crowbar', 1], ['lantern-hooded', 1],
      ['oil-flask', 7], ['rations', 5], ['rope-hempen', 1], ['tinderbox', 1]],
  }),
  mk('diplomats-pack', "Diplomat's Pack", {
    cost: 39, weight: 39, icon: 'bag', tint: '#7a3050',
    desc: "Fine clothes, ink and a lamp to write by. The Lords' Alliance outfits its envoys from this list and adds nothing.",
    contents: [['chest', 1], ['case-map-scroll', 2], ['clothes-fine', 1], ['ink', 1], ['ink-pen', 1],
      ['lamp', 1], ['oil-flask', 2], ['paper', 5], ['perfume', 1], ['tinderbox', 1]],
  }),
  mk('dungeoneers-pack', "Dungeoneer's Pack", {
    cost: 12, weight: 55, icon: 'bag', tint: '#6a5a44',
    desc: "Crowbar, hammer, pitons and torches. Barthen's sells more of these than anything else, and asks no questions about why.",
    contents: [['backpack', 1], ['crowbar', 1], ['hammer', 1], ['piton', 10], ['torch', 10],
      ['tinderbox', 1], ['rations', 10], ['waterskin', 1], ['rope-hempen', 1]],
  }),
  mk('entertainers-pack', "Entertainer's Pack", {
    cost: 40, weight: 38, icon: 'bag', tint: '#c05a9a',
    desc: "Costumes, candles and a disguise kit. Everything needed to be three different people in one evening at the Stonehill.",
    contents: [['backpack', 1], ['bedroll', 1], ['costume', 2], ['candle', 5], ['rations', 5],
      ['waterskin', 1], ['disguise-kit', 1]],
  }),
  mk('explorers-pack', "Explorer's Pack", {
    cost: 10, weight: 55, icon: 'bag', tint: '#5fae52',
    desc: "Bedroll, rope, torches and ten days of hard rations: the standard kit for anyone walking out past the Triboar Trail.",
    contents: [['backpack', 1], ['bedroll', 1], ['mess-kit', 1], ['tinderbox', 1], ['torch', 10],
      ['rations', 10], ['waterskin', 1], ['rope-hempen', 1]],
  }),
  mk('priests-pack', "Priest's Pack", {
    cost: 33, weight: 29, icon: 'bag', tint: '#ffe9a8',
    desc: "Candles, a blanket, a vial of holy water and rations for a week. Sister Garaele packs them herself for pilgrims on the road.",
    contents: [['backpack', 1], ['blanket', 1], ['candle', 10], ['holy-water', 1], ['tinderbox', 1],
      ['rations', 7], ['waterskin', 1], ['clothes-traveler', 1]],
  }),
  mk('scholars-pack', "Scholar's Pack", {
    cost: 40, weight: 22, icon: 'bag', tint: '#4a7ad0',
    desc: "A book, ink, parchment and enough lamp oil to read all the way to a conclusion you would rather not have reached.",
    contents: [['backpack', 1], ['book', 1], ['ink', 1], ['ink-pen', 1], ['parchment', 10],
      ['lamp', 1], ['oil-flask', 10], ['tinderbox', 1]],
  }),
);

// ===========================================================================
// 7. TOOLS, KITS, GAMING SETS AND INSTRUMENTS
// ===========================================================================

ALL.push(
  tool('artisans-tools', "Artisan's Tools", { cost: 15, weight: 6, ability: 'int', icon: 'anvil', desc: "A tradesman's roll of tools for whichever craft you were raised to. Proficiency covers the one set you learned." }),
  tool('alchemists-supplies', "Alchemist's Supplies", { cost: 50, weight: 8, ability: 'int', icon: 'flask', tint: '#5fae52', desc: "Retorts, burners and a case of reagents. With time it makes acid, alchemist's fire, and a smell nobody forgives." }),
  tool('brewers-supplies', "Brewer's Supplies", { cost: 20, weight: 9, ability: 'int', icon: 'flask', tint: '#c8a05a', desc: "Mash tun, siphon and hydrometer. Grista keeps a set behind the Sleeping Giant's bar and threatens anyone who touches it." }),
  tool('calligraphers-supplies', "Calligrapher's Supplies", { cost: 10, weight: 5, ability: 'int', icon: 'scroll', tint: '#e8e0c8', desc: "Cut nibs, inks and a straight-edge. Deneir's scribes claim a well-formed letter is a small prayer." }),
  tool('carpenters-tools', "Carpenter's Tools", { cost: 8, weight: 6, ability: 'str', icon: 'hammer', desc: "Saw, plane, chisels and a square. Half of Phandalin was raised again from ruin with sets like this one." }),
  tool('cartographers-tools', "Cartographer's Tools", { cost: 15, weight: 6, ability: 'wis', icon: 'map', tint: '#e8e0c8', desc: "Callipers, quills and a scriber. A good map of the Sword Mountains sells in Waterdeep for more than the journey cost." }),
  tool('cobblers-tools', "Cobbler's Tools", { cost: 5, weight: 5, ability: 'dex', icon: 'boots', tint: '#8a5a30', desc: "Hammer, awl, lasts and waxed thread. The least glamorous proficiency on the Sword Coast, and the most missed at mile twenty." }),
  tool('cooks-utensils', "Cook's Utensils", { cost: 1, weight: 8, ability: 'wis', icon: 'flask', tint: '#c8a05a', desc: "Knives, ladle and a good pan. A cook in the party turns a Short Rest from an obligation into a pleasure." }),
  tool('glassblowers-tools', "Glassblower's Tools", { cost: 30, weight: 5, ability: 'int', icon: 'flask', tint: '#7fd0c8', desc: "Blowpipe, marver and shears. Waterdhavian glass is the standard against which every other city measures its failures." }),
  tool('jewelers-tools', "Jeweler's Tools", { cost: 25, weight: 2, ability: 'int', icon: 'gem', tint: '#63d6d0', desc: "Loupe, files and pliers. With them you can tell a Starmetal Hills garnet from coloured glass before you pay for it." }),
  tool('leatherworkers-tools', "Leatherworker's Tools", { cost: 5, weight: 5, ability: 'dex', icon: 'armor', tint: '#a0682f', desc: "Knives, punches and edgers for making and mending anything from a scabbard to a suit of studded leather." }),
  tool('masons-tools', "Mason's Tools", { cost: 10, weight: 8, ability: 'str', icon: 'hammer', tint: '#9aa4b4', desc: "Trowel, hammer and chisels. Useful for building walls and rather more useful for finding the loose stone in someone else's." }),
  tool('painters-supplies', "Painter's Supplies", { cost: 10, weight: 5, ability: 'wis', icon: 'scroll', tint: '#c05a9a', desc: "Brushes, palette and pigments ground from Sword Coast earths. Sune's clergy consider the work a devotion." }),
  tool('potters-tools', "Potter's Tools", { cost: 10, weight: 3, ability: 'int', icon: 'flask', tint: '#a9793f', desc: "Ribs, needles and a wire. Shards tell a scholar more about a dead Netherese town than any surviving chronicle." }),
  tool('smiths-tools', "Smith's Tools", { cost: 20, weight: 8, ability: 'str', icon: 'anvil', tint: '#c9d2e0', desc: "Hammers, tongs and a portable anvil. Given an hour and a forge, a smith turns a battered blade back into a weapon." }),
  tool('tinkers-tools', "Tinker's Tools", { cost: 50, weight: 10, ability: 'dex', icon: 'anvil', tint: '#d3a24a', desc: "Whetstone, solder, files and scrap. A tinker can patch anything for an hour, which is often precisely long enough." }),
  tool('weavers-tools', "Weaver's Tools", { cost: 1, weight: 5, ability: 'dex', icon: 'cloak', tint: '#c05a9a', desc: "Thread, needles and a small loom. Banners, bandages and a convincing set of somebody else's livery." }),
  tool('woodcarvers-tools', "Woodcarver's Tools", { cost: 1, weight: 5, ability: 'dex', icon: 'dagger', tint: '#a97c46', desc: "Knife, gouge and small saw. Arrows, wands and holy symbols all begin as an afternoon and a piece of good ash." }),

  tool('disguise-kit', 'Disguise Kit', { cost: 25, weight: 3, ability: 'cha', toolCategory: 'kit', icon: 'eye', tint: '#c05a9a', desc: "Paints, false hair and padding. Doppelgangers find it charmingly primitive; Harper agents find it entirely sufficient." }),
  tool('forgery-kit', 'Forgery Kit', { cost: 15, weight: 5, ability: 'dex', toolCategory: 'kit', icon: 'scroll', tint: '#e8e0c8', desc: "Seals, wax, blank parchment and several colours of ink. The Zhentarim regard a good forgery as a form of honesty about power." }),
  tool('herbalism-kit', 'Herbalism Kit', { cost: 5, weight: 3, ability: 'int', toolCategory: 'kit', icon: 'leaf', tint: '#5fae52', desc: "Clippers, mortar and pouches. With it and a day's work you can brew a Potion of Healing from what grows beside the road." }),
  tool('navigators-tools', "Navigator's Tools", { cost: 25, weight: 2, ability: 'wis', toolCategory: 'kit', icon: 'map', tint: '#4a7ad0', desc: "Sextant, compass and callipers. On the High Road they are a luxury; on the Sea of Swords they are the whole crew's lives." }),
  tool('poisoners-kit', "Poisoner's Kit", { cost: 50, weight: 2, ability: 'int', toolCategory: 'kit', icon: 'poison', tint: '#8fd06a', desc: "Vials, glass stirrers and a mask. Talona's gift, and an offence worth hanging for in every city on the coast." }),
  tool('thieves-tools', "Thieves' Tools", { cost: 25, weight: 1, ability: 'dex', toolCategory: 'kit', icon: 'key', tint: '#d3a24a', desc: "Picks, tension wrenches, a mirror and small shears. Proficiency turns a locked door into a brief pause in the conversation." }),
  tool('gaming-dice', 'Dice Set', { cost: 0.1, weight: 0, ability: 'wis', toolCategory: 'gaming', icon: 'dice', tint: '#f6efe0', desc: "Bone dice in a cup. Every taproom from Leilon to Waterdeep runs on them, and half of them are weighted." }),
  tool('gaming-cards', 'Playing Card Set', { cost: 0.5, weight: 0, ability: 'wis', toolCategory: 'gaming', icon: 'dice', tint: '#c8452f', desc: "A painted deck for Talis or Elvish Whist. Cheating is expected; being caught is not." }),
  tool('gaming-dragonchess', 'Dragonchess Set', { cost: 1, weight: 0.5, ability: 'int', toolCategory: 'gaming', icon: 'dice', tint: '#63d6d0', desc: "Three tiers, sylph to dragon. A wizard's game, and a slow way to learn how someone thinks." }),
  tool('gaming-three-dragon-ante', 'Three-Dragon Ante Set', { cost: 1, weight: 0, ability: 'cha', toolCategory: 'gaming', icon: 'dice', tint: '#e3b34a', desc: "The card game of the Sword Coast. Fortunes, ships and the occasional castle have changed hands over a single Gold Dragon." }),

  tool('bagpipes', 'Bagpipes', { cost: 30, weight: 6, ability: 'cha', toolCategory: 'instrument', icon: 'wind', tint: '#5a8a4a', desc: "A droning bellows-pipe out of the Uthgardt uplands. Beloved in the North and merely tolerated everywhere else." }),
  tool('drum', 'Drum', { cost: 6, weight: 3, ability: 'cha', toolCategory: 'instrument', icon: 'thunder', tint: '#8a5a30', desc: "A hide-headed hand drum. Marching time, a heartbeat, or a signal carried further than any shout." }),
  tool('dulcimer', 'Dulcimer', { cost: 25, weight: 10, ability: 'cha', toolCategory: 'instrument', icon: 'staff', tint: '#a97c46', desc: "A hammered box of strung wire. Heavy to carry and the sweetest thing in a common room on a wet Uktar night." }),
  tool('flute', 'Flute', { cost: 2, weight: 1, ability: 'cha', toolCategory: 'instrument', icon: 'wind', tint: '#c0c8d4', desc: "A simple wooden flute, cheap enough for a farm child and good enough for Milil's temple." }),
  tool('lute', 'Lute', { cost: 35, weight: 2, ability: 'cha', toolCategory: 'instrument', icon: 'staff', tint: '#c2a06a', desc: "A pear-bodied lute of Amnian make. The Harpers took their name and their sigil from an older cousin of this instrument." }),
  tool('lyre', 'Lyre', { cost: 30, weight: 2, ability: 'cha', toolCategory: 'instrument', icon: 'staff', tint: '#e3b34a', desc: "A gilt-framed lyre strung with gut. Elvish players of Evermeet claim it is the only honest instrument." }),
  tool('horn', 'Horn', { cost: 3, weight: 2, ability: 'cha', toolCategory: 'instrument', icon: 'wind', tint: '#b8945c', desc: "A curved hunting horn of ox horn and brass, heard a mile down the Triboar Trail on a still morning." }),
  tool('pan-flute', 'Pan Flute', { cost: 12, weight: 2, ability: 'cha', toolCategory: 'instrument', icon: 'wind', tint: '#a97c46', desc: "Bound reeds of graded length. The satyr-pipes of the Old Faith, played at Greengrass and best not danced to." }),
  tool('shawm', 'Shawm', { cost: 2, weight: 1, ability: 'cha', toolCategory: 'instrument', icon: 'wind', tint: '#8a6a44', desc: "A reeded pipe with a bell mouth: piercing, brassy, and impossible to ignore, which is entirely the point." }),
  tool('viol', 'Viol', { cost: 30, weight: 1, ability: 'cha', toolCategory: 'instrument', icon: 'staff', tint: '#8a2c1e', desc: "A bowed viol with a fretted neck. In Waterdeep's better houses a bard without one is simply a person talking." }),
);

// ===========================================================================
// 8. POTIONS, OILS AND ALCHEMICAL CONSUMABLES
// ===========================================================================

ALL.push(
  potion('potion-healing', 'Potion of Healing', {
    cost: 50, rarity: 'common', tint: '#e0405a',
    desc: "Red liquid that glimmers when shaken. Drink it as a Bonus Action to regain 2d4 + 2 hit points.",
    use: { kind: 'heal', dice: '2d4+2' },
  }),
  potion('potion-greater-healing', 'Potion of Greater Healing', {
    cost: 100, rarity: 'uncommon', tint: '#ff5f7a',
    desc: "A deeper red, thicker on the tongue, and worth every coin when the Redbrands have you cornered. Restores 4d4 + 4 hit points.",
    use: { kind: 'heal', dice: '4d4+4' },
  }),
  potion('potion-superior-healing', 'Potion of Superior Healing', {
    cost: 500, rarity: 'rare', tint: '#ff86a0',
    desc: "Blood-bright and faintly warm through the glass. Restores 8d4 + 8 hit points.",
    use: { kind: 'heal', dice: '8d4+8' },
  }),
  potion('potion-supreme-healing', 'Potion of Supreme Healing', {
    cost: 1350, rarity: 'very-rare', tint: '#ffc0d0',
    desc: "It shines like a small sunrise trapped in a vial. Restores 10d4 + 20 hit points, which is most of a life.",
    use: { kind: 'heal', dice: '10d4+20' },
  }),
  potion('antitoxin', 'Antitoxin', {
    cost: 50, rarity: 'common', weight: 0, icon: 'flask', tint: '#7fd06a',
    desc: "A bitter draught from the Shrine of Luck's stillroom. For one hour you have Advantage on saving throws against poison.",
    use: { kind: 'buff', effect: { id: 'antitoxin', name: 'Antitoxin', dur: '1 hour', mech: { advSaveVs: ['poison'] } } },
  }),
  potion('potion-climbing', 'Potion of Climbing', {
    cost: 75, rarity: 'common', tint: '#a9793f',
    desc: "Brown, chalky, and separated into three unappetising layers. For an hour you have a Climb Speed equal to your walking speed and Advantage on Athletics checks to climb.",
    use: { kind: 'buff', effect: { id: 'climbing', name: 'Climbing', dur: '1 hour', mech: { climbSpeed: 'walk', advCheck: 'athletics-climb' } } },
  }),
  potion('potion-fire-breath', 'Potion of Fire Breath', {
    cost: 150, rarity: 'uncommon', tint: '#ff7a2a',
    desc: "Orange fluid with a wisp of flame curling inside the glass. For an hour you can exhale a 30-foot cone of fire for 4d6 damage, three times.",
    use: { kind: 'buff', effect: { id: 'fire-breath', name: 'Fire Breath', dur: '1 hour', uses: 3, mech: { breathWeapon: { die: '4d6', type: 'fire', shape: 'cone', length: 30, save: 'dex' } } } },
  }),
  potion('potion-giant-strength-hill', 'Potion of Hill Giant Strength', {
    cost: 400, rarity: 'uncommon', tint: '#c8a05a',
    desc: "Cloudy liquid with a floating sliver of fingernail. For an hour your Strength becomes 21.",
    use: { kind: 'buff', effect: { id: 'giant-strength', name: 'Hill Giant Strength', dur: '1 hour', mech: { setAbility: { str: 21 } } } },
  }),
  potion('potion-giant-strength-frost', 'Potion of Frost Giant Strength', {
    cost: 800, rarity: 'rare', tint: '#8fd0ff',
    desc: "Cold to the touch even in Flamerule. For an hour your Strength becomes 23.",
    use: { kind: 'buff', effect: { id: 'giant-strength', name: 'Frost Giant Strength', dur: '1 hour', mech: { setAbility: { str: 23 } } } },
  }),
  potion('potion-giant-strength-stone', 'Potion of Stone Giant Strength', {
    cost: 800, rarity: 'rare', tint: '#9aa4b4',
    desc: "Grey and gritty, with the weight of a much larger vial. For an hour your Strength becomes 23.",
    use: { kind: 'buff', effect: { id: 'giant-strength', name: 'Stone Giant Strength', dur: '1 hour', mech: { setAbility: { str: 23 } } } },
  }),
  potion('potion-giant-strength-fire', 'Potion of Fire Giant Strength', {
    cost: 1500, rarity: 'rare', tint: '#ff5f3a',
    desc: "It smells of forge-smoke and steams when uncorked. For an hour your Strength becomes 25.",
    use: { kind: 'buff', effect: { id: 'giant-strength', name: 'Fire Giant Strength', dur: '1 hour', mech: { setAbility: { str: 25 } } } },
  }),
  potion('potion-giant-strength-cloud', 'Potion of Cloud Giant Strength', {
    cost: 3000, rarity: 'very-rare', tint: '#dfe6f0',
    desc: "Pale vapour that never quite settles. For an hour your Strength becomes 27.",
    use: { kind: 'buff', effect: { id: 'giant-strength', name: 'Cloud Giant Strength', dur: '1 hour', mech: { setAbility: { str: 27 } } } },
  }),
  potion('potion-giant-strength-storm', 'Potion of Storm Giant Strength', {
    cost: 10000, rarity: 'legendary', tint: '#c3a2ff',
    desc: "Lightning crawls the inside of the glass. For an hour your Strength becomes 29, and doors stop being obstacles.",
    use: { kind: 'buff', effect: { id: 'giant-strength', name: 'Storm Giant Strength', dur: '1 hour', mech: { setAbility: { str: 29 } } } },
  }),
  potion('potion-growth', 'Potion of Growth', {
    cost: 270, rarity: 'uncommon', tint: '#e0a0d0',
    desc: "A red-and-blue swirl that never mixes. For a minute you are Large, with Advantage on Strength checks and +1d4 damage on weapon hits.",
    use: { kind: 'spell', spellId: 'enlarge-reduce', level: 4, variant: 'enlarge' },
  }),
  potion('potion-heroism', 'Potion of Heroism', {
    cost: 180, rarity: 'rare', tint: '#ffd24a',
    desc: "Blue fluid with a rising bubble in the shape of a heart. You gain 10 temporary hit points for an hour and are Blessed throughout.",
    use: { kind: 'buff', effect: { id: 'heroism', name: 'Heroism', dur: '1 hour', tempHp: 10, mech: { blessed: true } } },
  }),
  potion('potion-invisibility', 'Potion of Invisibility', {
    cost: 500, rarity: 'very-rare', tint: '#bfe6ff',
    desc: "The vial looks empty; the liquid is simply already doing its work. You are Invisible for an hour, or until you attack or cast a spell.",
    use: { kind: 'spell', spellId: 'invisibility', level: 2 },
  }),
  potion('potion-resistance', 'Potion of Resistance', {
    cost: 300, rarity: 'uncommon', tint: '#8fd0ff',
    desc: "Each batch is tinted for a different element. For an hour you have Resistance to one damage type of the brewer's choosing.",
    use: { kind: 'buff', effect: { id: 'resistance', name: 'Resistance', dur: '1 hour', mech: { resist: ['choose'] } } },
  }),
  potion('potion-speed', 'Potion of Speed', {
    cost: 500, rarity: 'very-rare', tint: '#ffe066',
    desc: "Yellow fluid streaked with black that will not stop churning. For a minute you gain the effects of Haste, and the crash afterwards.",
    use: { kind: 'spell', spellId: 'haste', level: 3 },
  }),
  potion('potion-water-breathing', 'Potion of Water Breathing', {
    cost: 180, rarity: 'uncommon', tint: '#4fc8d8',
    desc: "Cloudy green, smelling of the sea, with a jellyfish-shaped bubble drifting in it. You can breathe underwater for an hour.",
    use: { kind: 'buff', effect: { id: 'water-breathing', name: 'Water Breathing', dur: '1 hour', mech: { waterBreathing: true } } },
  }),
  potion('potion-mind-reading', 'Potion of Mind Reading', {
    cost: 400, rarity: 'rare', tint: '#c07af0',
    desc: "Viscous violet fluid that glints like a watching eye. You may cast Detect Thoughts, save DC 13, with no components.",
    use: { kind: 'spell', spellId: 'detect-thoughts', level: 2, dc: 13 },
  }),
  potion('potion-animal-friendship', 'Potion of Animal Friendship', {
    cost: 200, rarity: 'uncommon', tint: '#7ac06a',
    desc: "Muddy water with a drifting circle of fish scales. You may cast Animal Friendship, save DC 13, for an hour.",
    use: { kind: 'spell', spellId: 'animal-friendship', level: 1, dc: 13 },
  }),
  potion('potion-gaseous-form', 'Potion of Gaseous Form', {
    cost: 300, rarity: 'rare', tint: '#c8d0dc',
    desc: "The fog inside the vial moves against the tilt of your hand. You become a cloud of mist for an hour or until you end it.",
    use: { kind: 'spell', spellId: 'gaseous-form', level: 3 },
  }),
  potion('potion-flying', 'Potion of Flying', {
    cost: 600, rarity: 'very-rare', tint: '#bfd8ff',
    desc: "Clear fluid with a single floating white feather. For an hour you have a Fly Speed equal to your walking speed, and can hover.",
    use: { kind: 'buff', effect: { id: 'flying', name: 'Flying', dur: '1 hour', mech: { flySpeed: 'walk', hover: true } } },
  }),
  potion('potion-clairvoyance', 'Potion of Clairvoyance', {
    cost: 450, rarity: 'rare', tint: '#a9d8ff',
    desc: "An eyeball bobs in the yellow liquid and dissolves the moment you drink. You may cast Clairvoyance.",
    use: { kind: 'spell', spellId: 'clairvoyance', level: 3 },
  }),
  potion('potion-vitality', 'Potion of Vitality', {
    cost: 1000, rarity: 'very-rare', tint: '#ff9ac0',
    desc: "Crimson shot through with drifting motes of light. It removes Exhaustion, cures disease and poison, and restores all your Hit Dice.",
    use: { kind: 'cure', conditions: ['exhaustion', 'poisoned', 'diseased'], restoreHitDice: 'all' },
  }),
  potion('oil-slipperiness', 'Oil of Slipperiness', {
    cost: 480, rarity: 'uncommon', icon: 'flask', tint: '#a9d8ff',
    desc: "A thick grey oil. Applied to a creature it acts as Freedom of Movement for eight hours; poured on the ground it becomes Grease.",
    use: { kind: 'spell', spellId: 'freedom-of-movement', level: 4 },
  }),
  potion('alchemists-fire', "Alchemist's Fire", {
    cost: 50, rarity: 'common', icon: 'flame', tint: '#ff7a2a', weight: 1,
    desc: "Sticky amber fluid that takes light the instant air touches it. Thrown as an improvised weapon, it burns for 1d4 fire damage each turn until put out.",
    use: { kind: 'throw', range: [20, 60], attack: 'ranged', damage: { dice: '1d4', type: 'fire' }, ongoing: true, endDC: 10 },
  }),
  potion('acid-vial', 'Vial of Acid', {
    cost: 25, rarity: 'common', icon: 'acid', tint: '#8fd06a', weight: 1,
    desc: "Green fluid in a wax-stoppered vial that eats through the cork given a season. Thrown, it deals 2d6 acid damage on a hit.",
    use: { kind: 'throw', range: [20, 60], attack: 'ranged', damage: { dice: '2d6', type: 'acid' } },
  }),
  potion('holy-water', 'Flask of Holy Water', {
    cost: 25, rarity: 'common', icon: 'holy', tint: '#ffe9a8', weight: 1,
    desc: "Water blessed at the Shrine of Luck and sealed with Tymora's coin-mark. Thrown at a Fiend or Undead it deals 2d8 radiant damage.",
    use: { kind: 'throw', range: [20, 60], attack: 'ranged', damage: { dice: '2d8', type: 'radiant' }, onlyVs: ['fiend', 'undead'] },
  }),
  potion('poison-basic', 'Basic Poison', {
    cost: 100, rarity: 'common', icon: 'poison', tint: '#8fd06a', weight: 0,
    desc: "A vial of dark distillate enough to coat one blade or three pieces of ammunition. DC 10 Constitution save or 1d4 poison damage, for one minute.",
    use: { kind: 'utility', tag: 'coat-weapon', save: { ability: 'con', dc: 10 }, damage: { dice: '1d4', type: 'poison' }, duration: '1 minute' },
  }),
);

// ===========================================================================
// 9. SPELL SCROLLS — one generic scroll per spell level, plus staples
// ===========================================================================

ALL.push(
  scroll('scroll-cantrip', 'Spell Scroll (Cantrip)', {
    cost: 30, rarity: 'common', spellLevel: 0, tint: '#d8d0b8',
    desc: "A single sheet of scribed vellum holding a cantrip. Reading it aloud spends the scroll and the words together.",
    use: { kind: 'spell', spellId: null, level: 0, random: true },
  }),
  scroll('scroll-1', 'Spell Scroll (1st Level)', {
    cost: 60, rarity: 'common', spellLevel: 1, tint: '#cfe0b8',
    desc: "A 1st-level spell inked in a scribe's careful hand. Save DC 13, attack bonus +5 if the spell needs either.",
    use: { kind: 'spell', spellId: null, level: 1, dc: 13, atk: 5, random: true },
  }),
  scroll('scroll-2', 'Spell Scroll (2nd Level)', {
    cost: 120, rarity: 'uncommon', spellLevel: 2, tint: '#b8dcc0',
    desc: "A 2nd-level spell on good parchment, sealed in a case. Save DC 13, attack bonus +5.",
    use: { kind: 'spell', spellId: null, level: 2, dc: 13, atk: 5, random: true },
  }),
  scroll('scroll-3', 'Spell Scroll (3rd Level)', {
    cost: 200, rarity: 'uncommon', spellLevel: 3, tint: '#a8d0e0',
    desc: "A 3rd-level spell, the ink faintly luminous in the dark. Save DC 15, attack bonus +7.",
    use: { kind: 'spell', spellId: null, level: 3, dc: 15, atk: 7, random: true },
  }),
  scroll('scroll-4', 'Spell Scroll (4th Level)', {
    cost: 320, rarity: 'rare', spellLevel: 4, tint: '#9ac0f0',
    desc: "A 4th-level spell. Cast it untrained and a failed DC 14 check unravels the magic and the scroll both. Save DC 15, attack +7.",
    use: { kind: 'spell', spellId: null, level: 4, dc: 15, atk: 7, checkDC: 14, random: true },
  }),
  scroll('scroll-5', 'Spell Scroll (5th Level)', {
    cost: 640, rarity: 'rare', spellLevel: 5, tint: '#a89af0',
    desc: "A 5th-level spell, the vellum warm to the touch. Save DC 17, attack bonus +9; DC 15 to cast off your own list.",
    use: { kind: 'spell', spellId: null, level: 5, dc: 17, atk: 9, checkDC: 15, random: true },
  }),
  scroll('scroll-6', 'Spell Scroll (6th Level)', {
    cost: 1280, rarity: 'very-rare', spellLevel: 6, tint: '#c07af0',
    desc: "A 6th-level spell in silver ink on black vellum. Save DC 17, attack bonus +9; DC 16 to cast off your own list.",
    use: { kind: 'spell', spellId: null, level: 6, dc: 17, atk: 9, checkDC: 16, random: true },
  }),
  scroll('scroll-7', 'Spell Scroll (7th Level)', {
    cost: 2600, rarity: 'very-rare', spellLevel: 7, tint: '#d07ad0',
    desc: "A 7th-level spell sealed with lead. Save DC 18, attack bonus +10; DC 17 to cast off your own list.",
    use: { kind: 'spell', spellId: null, level: 7, dc: 18, atk: 10, checkDC: 17, random: true },
  }),
  scroll('scroll-8', 'Spell Scroll (8th Level)', {
    cost: 5000, rarity: 'very-rare', spellLevel: 8, tint: '#e07ab0',
    desc: "An 8th-level spell. The Blackstaff's archives keep theirs behind glass and a great deal of warding. Save DC 18, attack +10.",
    use: { kind: 'spell', spellId: null, level: 8, dc: 18, atk: 10, checkDC: 18, random: true },
  }),
  scroll('scroll-9', 'Spell Scroll (9th Level)', {
    cost: 10000, rarity: 'legendary', spellLevel: 9, tint: '#ffb03a',
    desc: "A 9th-level spell, and a small fortune in one sheet. Save DC 19, attack bonus +11; DC 19 to cast off your own list.",
    use: { kind: 'spell', spellId: null, level: 9, dc: 19, atk: 11, checkDC: 19, random: true },
  }),
  scroll('scroll-cure-wounds', 'Spell Scroll: Cure Wounds', {
    cost: 60, rarity: 'common', spellLevel: 1, tint: '#e0405a',
    desc: "Ilmater's mercy in nine lines of red ink. Casts Cure Wounds at 1st level.",
    use: { kind: 'spell', spellId: 'cure-wounds', level: 1 },
  }),
  scroll('scroll-magic-missile', 'Spell Scroll: Magic Missile', {
    cost: 60, rarity: 'common', spellLevel: 1, tint: '#c3a2ff',
    desc: "Three darts of force, scribed for the desperate and the unarmed. Casts Magic Missile at 1st level.",
    use: { kind: 'spell', spellId: 'magic-missile', level: 1 },
  }),
  scroll('scroll-identify', 'Spell Scroll: Identify', {
    cost: 60, rarity: 'common', spellLevel: 1, tint: '#a9d8ff',
    desc: "The scribes of Candlekeep sell these by the crate, and every treasure hunter on the Coast buys them. Casts Identify.",
    use: { kind: 'spell', spellId: 'identify', level: 1 },
  }),
  scroll('scroll-lesser-restoration', 'Spell Scroll: Lesser Restoration', {
    cost: 120, rarity: 'uncommon', spellLevel: 2, tint: '#8fd06a',
    desc: "For blindness, deafness, disease and poison. Sister Garaele keeps three at the Shrine of Luck and will part with two.",
    use: { kind: 'spell', spellId: 'lesser-restoration', level: 2 },
  }),
  scroll('scroll-fireball', 'Spell Scroll: Fireball', {
    cost: 200, rarity: 'uncommon', spellLevel: 3, tint: '#ff6a2a',
    desc: "A 20-foot sphere of flame folded into a page. Read it carefully, and not indoors. Casts Fireball at 3rd level.",
    use: { kind: 'spell', spellId: 'fireball', level: 3 },
  }),
  scroll('scroll-revivify', 'Spell Scroll: Revivify', {
    cost: 300, rarity: 'uncommon', spellLevel: 3, tint: '#ffd24a',
    desc: "One minute of grace and 300 gp of diamond dust, and Kelemvor lets go. Casts Revivify.",
    use: { kind: 'spell', spellId: 'revivify', level: 3 },
  }),
);

// ===========================================================================
// 10. FOOD, DRINK AND SWORD COAST TRADE GOODS
// ===========================================================================

ALL.push(
  mk('rations', 'Rations (1 day)', {
    kind: 'food', cost: 0.5, weight: 2, stack: true, icon: 'leaf', tint: '#c8a05a',
    desc: "Dried beef, hard biscuit, nuts and a strip of salt fish. Dull, dense, and the whole of a day on the road.",
    use: { kind: 'utility', tag: 'ration' },
  }),
  mk('trail-bread', 'Trail Bread', {
    kind: 'food', cost: 0.2, weight: 1, stack: true, icon: 'leaf', tint: '#d8b878',
    desc: "Twice-baked loaves from Trilena Stonehill's oven. They keep a tenday and could stop a sling bullet.",
    use: { kind: 'heal', dice: '1d4' },
  }),
  mk('goodberry-preserve', 'Alderleaf Preserves', {
    kind: 'food', cost: 1, weight: 1, stack: true, icon: 'heart', tint: '#c8455a',
    desc: "Qelline Alderleaf's berry preserve, put up in a wax-sealed crock. Restores 1d6 hit points and tastes of a better summer.",
    use: { kind: 'heal', dice: '1d6' },
  }),
  mk('neverwinter-ale', 'Neverwinter Ale', {
    kind: 'food', cost: 0.2, weight: 2, stack: true, icon: 'flask', tint: '#c8a05a',
    desc: "A tankard of the dark brew shipped down the High Road from the City of Skilled Hands. Toblen keeps a barrel on tap.",
    use: { kind: 'buff', effect: { id: 'ale', name: 'Warmed by Ale', dur: '1 hour', tempHp: 2 } },
  }),
  mk('shadowdark-ale', 'Shadowdark Ale', {
    kind: 'food', cost: 0.5, weight: 2, stack: true, icon: 'flask', tint: '#5a4a3a',
    desc: "Dwarven black ale brewed underhill and strong enough to walk on. Grista serves it at the Sleeping Giant without apology.",
    use: { kind: 'buff', effect: { id: 'ale-strong', name: 'Dwarven Courage', dur: '1 hour', tempHp: 4, mech: { advSaveVs: ['frightened'] } } },
  }),
  mk('zzar', 'Zzar', {
    kind: 'food', cost: 2, weight: 2, stack: true, icon: 'flask', tint: '#e0a0d0',
    desc: "Waterdeep's fortified sparkling wine, drunk with almonds by people who wish you to know they can afford almonds.",
  }),
  mk('evermead', 'Evermead', {
    kind: 'food', cost: 30, weight: 2, stack: true, icon: 'flask', tint: '#ffe9a8', rarity: 'uncommon',
    desc: "Honey mead out of Evermeet, aged past a human lifetime. One cup is said to make a mortal weep for reasons they cannot name.",
    use: { kind: 'heal', dice: '2d4+2' },
  }),
  mk('luirens-best', "Luiren's Best", {
    kind: 'food', cost: 5, weight: 2, stack: true, icon: 'flask', tint: '#d8a058',
    desc: "Halfling brandy from the far south, traded up the Coast a cask at a time and never in quantity.",
  }),
  mk('saerloonian-glowfire', 'Saerloonian Glowfire', {
    kind: 'food', cost: 12, weight: 2, stack: true, icon: 'flask', tint: '#7fd0c8',
    desc: "Sembian wine that glows faintly green in the dark. A curiosity in Neverwinter and a status symbol in Waterdeep.",
  }),
  mk('iriaeboran-north-brew', 'Iriaeboran North Brew', {
    kind: 'food', cost: 1, weight: 2, stack: true, icon: 'flask', tint: '#8a6a3a',
    desc: "A bitter, black, deeply unfriendly beer. Caravan drivers on the Triboar Trail drink it to stay awake and to have something to complain about.",
  }),
  mk('ore-sample-phandalin', 'Phandalin Ore Sample', {
    kind: 'material', cost: 10, weight: 3, stack: true, icon: 'gem', tint: '#a08a6a',
    desc: "A fist of raw ore chipped from the hills above town. Halia Thornton will assay it at the Miner's Exchange and quote you a fair-sounding price.",
  }),
  mk('silver-ore-wave-echo', 'Wave Echo Silver Ore', {
    kind: 'material', cost: 45, weight: 4, stack: true, icon: 'gem', tint: '#dfe6f0',
    desc: "Bright silver from the Lost Mine of Phandelver, still faintly warm from the Forge of Spells. Smiths pay well and ask no questions.",
  }),
  mk('platinum-ingot', 'Platinum Ingot', {
    kind: 'material', cost: 100, weight: 5, stack: true, icon: 'coin', tint: '#e0e6f0',
    desc: "A stamped bar out of the Sword Mountains diggings. Heavy, cold, and accepted anywhere on the Coast without argument.",
  }),
  mk('coster-crate', 'Lionshield Coster Crate', {
    kind: 'quest', cost: 0, weight: 40, icon: 'chest', tint: '#4a7ad0', sellable: false,
    desc: "A stamped crate of arms bound for Linene Graywind's shop, blue lion burned into the lid. The Cragmaw goblins have been taking rather a lot of these.",
  }),
  mk('redbrand-cloak', 'Redbrand Cloak', {
    kind: 'quest', cost: 2, weight: 2, stack: true, icon: 'cloak', tint: '#c8452f',
    desc: "A scarlet cloak stripped from one of Glasstaff's bullies. Harbin Wester pays a small bounty for each, and pretends he never asked.",
  }),
  mk('goblin-totem', 'Cragmaw Totem', {
    kind: 'quest', cost: 1, weight: 1, stack: true, icon: 'skull', tint: '#7a8a4a',
    desc: "A bundle of feathers, teeth and stolen ribbon marking a Cragmaw warband. Proof of a job done, and worth a copper to a collector.",
  }),
  mk('dragon-cult-token', 'Cult of the Dragon Token', {
    kind: 'quest', cost: 5, weight: 0, stack: true, icon: 'skull', tint: '#5a8a4a',
    desc: "A black scale bound in wire, carried by the cultists nosing about Thundertree. The Order of the Gauntlet buys every one it can find.",
  }),
  mk('gem-malachite', 'Malachite', { kind: 'gem', cost: 10, weight: 0, stack: true, icon: 'gem', tint: '#3f9a5a', desc: "Banded green stone, cut cheap and sold often. Ten gold, and the Exchange will not haggle." }),
  mk('gem-quartz', 'Smoky Quartz', { kind: 'gem', cost: 10, weight: 0, stack: true, icon: 'gem', tint: '#9a8a7a', desc: "A grey-brown crystal from the Sword Mountains. Common enough that wizards use them for practice focuses." }),
  mk('gem-moonstone', 'Moonstone', { kind: 'gem', cost: 50, weight: 0, stack: true, icon: 'gem', tint: '#cfe0ff', desc: "A pale blue sheen moves under the surface. Selune's faithful set them into temple floors by the hundred." }),
  mk('gem-onyx', 'Onyx', { kind: 'gem', cost: 50, weight: 0, stack: true, icon: 'gem', tint: '#2a2a34', desc: "Black banded stone. Necromancers want it for Animate Dead, which is why respectable jewellers keep a ledger of buyers." }),
  mk('gem-amber', 'Amber', { kind: 'gem', cost: 100, weight: 0, stack: true, icon: 'gem', tint: '#e0a83a', desc: "Fossil resin the colour of good ale, sometimes with a thousand-year-old insect inside and furious about it." }),
  mk('gem-jade', 'Jade', { kind: 'gem', cost: 100, weight: 0, stack: true, icon: 'gem', tint: '#4fbf8a', desc: "Deep green stone carried up the trade roads from Kara-Tur. Worth a hundred gold and twice that to the right collector." }),
  mk('gem-pearl', 'Pearl', { kind: 'gem', cost: 100, weight: 0, stack: true, icon: 'gem', tint: '#f0e8dc', desc: "Umberlee's tithe, dredged from the Sea of Swords. A hundred gold, and a component for spells you should not cast lightly." }),
  mk('gem-black-pearl', 'Black Pearl', { kind: 'gem', cost: 500, weight: 0, stack: true, icon: 'gem', tint: '#4a4a5a', desc: "A rare dark pearl with an oily rainbow. Five hundred gold on any wharf between here and Baldur's Gate." }),
  mk('gem-emerald', 'Emerald', { kind: 'gem', cost: 1000, weight: 0, stack: true, icon: 'gem', tint: '#2fbf6a', desc: "Brilliant green beryl. A thousand gold, and Claugiyliamatar of Kryptgarden is said to sleep on a great many of them." }),
  mk('gem-ruby', 'Ruby', { kind: 'gem', cost: 1000, weight: 0, stack: true, icon: 'gem', tint: '#e02a4a', desc: "Clear red corundum, the fire held still. A thousand gold, and a favourite of anyone who scribes fire magic." }),
  mk('gem-diamond', 'Diamond', { kind: 'gem', cost: 5000, weight: 0, stack: true, icon: 'gem', tint: '#eaf2ff', desc: "Flawless white stone worth five thousand gold. Ground to dust it buys a soul back from Kelemvor, which is the only price that matters." }),
  mk('diamond-dust', 'Diamond Dust (100 gp)', { kind: 'material', cost: 100, weight: 0, stack: true, icon: 'gem', tint: '#dfe6f0', desc: "A twist of paper holding a hundred gold pieces' worth of ground diamond, the component every serious healer carries." }),
);

// ===========================================================================
// 11. THE CATALOGUE
// ===========================================================================

/** Every mundane item in the game, keyed by id and deep frozen. */
export const GEAR = deepFreeze(Object.fromEntries(ALL.map((e) => [e.id, e])));
export const GEAR_IDS = Object.freeze(Object.keys(GEAR));

/** Weapon ids carrying each mastery property, for the tables below. */
function weaponsWithMastery(id) {
  return Object.freeze(ALL.filter((e) => e.kind === 'weapon' && e.mastery === id).map((e) => e.id));
}

// ===========================================================================
// 12. WEAPON MASTERY — the eight 2024 properties
// The `mech` block is what rules/actions.js reads when a hit lands; the text is
// what the character sheet shows.
// ===========================================================================

export const WEAPON_MASTERY = deepFreeze({
  cleave: {
    id: 'cleave', name: 'Cleave', icon: 'axe', tint: '#c8452f',
    desc: "If you hit a creature with a melee attack roll using this weapon, you can make an attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn.",
    mech: { onHit: { extraTargetAdjacent: true, adjacentRange: 5, damageNoMod: true, oncePerTurn: true, requires: 'melee' } },
    weapons: weaponsWithMastery('cleave'),
  },
  graze: {
    id: 'graze', name: 'Graze', icon: 'sword', tint: '#e3b34a',
    desc: "If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.",
    mech: { onMiss: { damage: 'abilityMod', type: 'weapon', noBonuses: true } },
    weapons: weaponsWithMastery('graze'),
  },
  nick: {
    id: 'nick', name: 'Nick', icon: 'dagger', tint: '#5fd07a',
    desc: "When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.",
    mech: { lightAttackFree: true, oncePerTurn: true, requires: 'light' },
    weapons: weaponsWithMastery('nick'),
  },
  push: {
    id: 'push', name: 'Push', icon: 'hammer', tint: '#6ac0f0',
    desc: "If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.",
    mech: { onHit: { push: 10, sizeMax: 'large', direction: 'away' } },
    weapons: weaponsWithMastery('push'),
  },
  sap: {
    id: 'sap', name: 'Sap', icon: 'mace', tint: '#a76ad8',
    desc: "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.",
    mech: { onHit: { disadvantageNextAttack: true, duration: 'until-your-next-turn-start' } },
    weapons: weaponsWithMastery('sap'),
  },
  slow: {
    id: 'slow', name: 'Slow', icon: 'frost', tint: '#63d6d0',
    desc: "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet.",
    mech: { onHit: { speedPenalty: 10, stacks: false, duration: 'until-your-next-turn-start', requiresDamage: true } },
    weapons: weaponsWithMastery('slow'),
  },
  topple: {
    id: 'topple', name: 'Topple', icon: 'staff', tint: '#f07a2a',
    desc: "If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition.",
    mech: { onHit: { save: 'con', dc: 'weaponDC', condition: 'prone' } },
    weapons: weaponsWithMastery('topple'),
  },
  vex: {
    id: 'vex', name: 'Vex', icon: 'eye', tint: '#ffd24a',
    desc: "If you hit a creature with this weapon and deal damage to it, you have Advantage on your next attack roll against that creature before the end of your next turn.",
    mech: { onHit: { advantageNextAttack: true, requiresDamage: true, duration: 'until-your-next-turn-end' } },
    weapons: weaponsWithMastery('vex'),
  },
});

// ===========================================================================
// 13. AMMUNITION TYPES — which quiver feeds which weapon
// ===========================================================================

export const AMMO_TYPES = deepFreeze({
  arrow: {
    id: 'arrow', name: 'Arrows', itemId: 'arrow', container: 'quiver',
    bundle: 20, bundleCost: 1, weapons: ['shortbow', 'longbow'], variants: ['arrow', 'arrow-silvered'],
    desc: "Fletched shafts for a bow. Half of any volley can be recovered after a fight if you are willing to look for them.",
  },
  bolt: {
    id: 'bolt', name: 'Crossbow Bolts', itemId: 'crossbow-bolt', container: 'case-crossbow-bolt',
    bundle: 20, bundleCost: 1, weapons: ['light-crossbow', 'hand-crossbow', 'heavy-crossbow'], variants: ['crossbow-bolt'],
    desc: "Short square-headed quarrels. Heavier than arrows, and they punch above their weight at close range.",
  },
  bullet: {
    id: 'bullet', name: 'Sling Bullets', itemId: 'sling-bullet', container: 'pouch',
    bundle: 20, bundleCost: 0.04, weapons: ['sling'], variants: ['sling-bullet'],
    desc: "Cast lead pellets. Cheaper than any other ammunition on the Sword Coast by a wide margin.",
  },
  needle: {
    id: 'needle', name: 'Blowgun Needles', itemId: 'blowgun-needle', container: 'pouch',
    bundle: 50, bundleCost: 1, weapons: ['blowgun'], variants: ['blowgun-needle'],
    desc: "Slender fletched needles, sold in a wax-sealed tube and usually bought alongside something to dip them in.",
  },
  'firearm-bullet': {
    id: 'firearm-bullet', name: 'Firearm Bullets', itemId: 'firearm-bullet', container: 'pouch',
    bundle: 10, bundleCost: 3, weapons: ['pistol', 'musket'], variants: ['firearm-bullet'],
    desc: "Lead ball and smokepowder cartridge, made in Lantan and sold at a price that reflects the shipping.",
  },
});

// ===========================================================================
// 14. TOOL KITS — ability, sample Utilize DCs, and what each can craft
// ===========================================================================

const TOOL_DETAIL = {
  'artisans-tools': { utilize: [['Repair a damaged object', 12], ['Judge the quality of a piece of work', 10]] },
  'alchemists-supplies': { utilize: [['Identify a substance', 15], ['Start a fire without a flame', 15]], craft: ['acid-vial', 'alchemists-fire', 'oil-flask', 'antitoxin'] },
  'brewers-supplies': { utilize: [['Detect poison in a drink', 15], ['Purify a gallon of fouled water', 12]], craft: ['neverwinter-ale', 'shadowdark-ale'] },
  'calligraphers-supplies': { utilize: [['Write text that cannot easily be forged', 15], ['Recognise a forged hand', 12]], craft: ['scroll-cantrip'] },
  'carpenters-tools': { utilize: [['Seal a door shut', 20], ['Build a simple wooden structure', 13]], craft: ['ladder', 'pole', 'chest', 'torch'] },
  'cartographers-tools': { utilize: [['Draft a map of a small area', 15], ['Estimate a settlement from a map', 13]], craft: ['map'] },
  'cobblers-tools': { utilize: [['Find a hollow heel', 15], ['Repair boots after a hard march', 10]] },
  'cooks-utensils': { utilize: [['Improve a ration into a meal', 10], ['Detect spoiled food', 15]], craft: ['rations', 'trail-bread'] },
  'glassblowers-tools': { utilize: [['Discern what a glass object once held', 15]], craft: ['bottle-glass', 'vial', 'magnifying-glass'] },
  'jewelers-tools': { utilize: [['Appraise a gem', 15], ['Discern a stone of magical origin', 15]], craft: ['diamond-dust', 'signet-ring'] },
  'leatherworkers-tools': { utilize: [['Identify a hide by touch', 10], ['Add a hidden pocket', 15]], craft: ['leather-armor', 'studded-leather', 'hide-armor', 'quiver', 'pouch'] },
  'masons-tools': { utilize: [['Chisel a hole through a wall', 15], ['Find a loose or false stone', 15]] },
  'painters-supplies': { utilize: [['Paint a likeness from memory', 13], ['Judge a painting as genuine', 15]] },
  'potters-tools': { utilize: [['Reconstruct a shattered vessel', 15], ['Date a shard by its glaze', 13]], craft: ['jug', 'pot-iron'] },
  'smiths-tools': { utilize: [['Pry apart metal bars', 20], ['Repair a damaged weapon or armour', 15]], craft: ['chain-mail', 'shield', 'longsword', 'warhammer', 'spikes-iron', 'piton'] },
  'tinkers-tools': { utilize: [['Patch an object for one hour', 10], ['Assemble a mechanical toy', 15]], craft: ['lantern-hooded', 'lock', 'manacles', 'bell'] },
  'weavers-tools': { utilize: [['Mend a garment invisibly', 12], ['Sew a hidden message into cloth', 15]], craft: ['cloak-common', 'clothes-traveler', 'costume', 'net', 'rope-hempen'] },
  'woodcarvers-tools': { utilize: [['Carve a pattern into wood', 10], ['Whittle a working replacement part', 15]], craft: ['arrow', 'crossbow-bolt', 'focus-wand', 'yew-wand', 'quarterstaff', 'club'] },
  'disguise-kit': { utilize: [['Change your appearance', 13], ['Spot a disguise in use', 15]], craft: ['costume'] },
  'forgery-kit': { utilize: [['Mimic a signature or seal', 15], ['Age a document convincingly', 13]] },
  'herbalism-kit': { utilize: [['Identify a plant', 10], ['Brew a Potion of Healing over a day', 15]], craft: ['potion-healing', 'antitoxin', 'goodberry-preserve'] },
  'navigators-tools': { utilize: [['Plot a course', 10], ['Determine your position by the stars', 15]], craft: ['map'] },
  'poisoners-kit': { utilize: [['Apply poison to a blade', 10], ['Detect a poison by smell', 15]], craft: ['poison-basic', 'antitoxin'] },
  'thieves-tools': { utilize: [['Pick a lock', 15], ['Disarm a trap', 15], ['Set a simple snare', 13]] },
  'gaming-dice': { utilize: [['Detect loaded dice', 10], ['Win a wager', 15]] },
  'gaming-cards': { utilize: [['Cheat without being seen', 15], ['Read an opponent', 13]] },
  'gaming-dragonchess': { utilize: [['Outplay an opponent', 15], ['Judge how a rival thinks', 13]] },
  'gaming-three-dragon-ante': { utilize: [['Bluff a hand through', 15], ['Read the table', 13]] },
  bagpipes: { utilize: [['Perform for a crowd', 13], ['Rally allies with a marching tune', 15]] },
  drum: { utilize: [['Keep a marching pace', 10], ['Signal across a battlefield', 13]] },
  dulcimer: { utilize: [['Perform for a crowd', 13]] },
  flute: { utilize: [['Perform for a crowd', 12], ['Soothe a beast', 15]] },
  lute: { utilize: [['Perform for a crowd', 13], ['Earn a night of board and lodging', 15]] },
  lyre: { utilize: [['Perform for a crowd', 13]] },
  horn: { utilize: [['Sound an alarm heard a mile off', 10]] },
  'pan-flute': { utilize: [['Perform for a crowd', 13], ['Play an Old Faith rite', 15]] },
  shawm: { utilize: [['Perform for a crowd', 12], ['Drown out a conversation', 10]] },
  viol: { utilize: [['Perform for a crowd', 14]] },
};

/** Tool id -> { id, name, itemId, category, ability, cost, weight, desc, utilize, craft }. */
export const TOOL_KITS = deepFreeze(Object.fromEntries(
  ALL.filter((e) => e.kind === 'tool').map((t) => {
    const d = TOOL_DETAIL[t.id] || {};
    return [t.id, {
      id: t.id,
      name: t.name,
      itemId: t.id,
      desc: t.desc,
      category: t.toolCategory,
      ability: t.ability,
      cost: t.cost,
      weight: t.weight,
      utilize: (d.utilize || []).map(([name, dc]) => ({ name, dc })),
      craft: d.craft || [],
    }];
  }),
));

// ===========================================================================
// 15. SHOP TABLES — Phandalin first, then the wider Sword Coast
// stock entries are [itemId, quantity (Infinity = always available), minPartyLevel]
// ===========================================================================

export const SHOP_TABLES = deepFreeze({
  'barthens-provisions': {
    id: 'barthens-provisions',
    name: "Barthen's Provisions",
    keeper: 'Elmar Barthen',
    greeting: "Barthen's, friend. Rope, rations, lamp oil, and no credit past a tenday. Ander, fetch the ledger.",
    markup: 1, buyback: 0.5, restockDays: 3,
    stock: [
      ['rations', Infinity, 1], ['torch', Infinity, 1], ['tinderbox', Infinity, 1],
      ['rope-hempen', Infinity, 1], ['backpack', Infinity, 1], ['bedroll', Infinity, 1],
      ['waterskin', Infinity, 1], ['oil-flask', Infinity, 1], ['candle', Infinity, 1],
      ['sack', Infinity, 1], ['pouch', Infinity, 1], ['mess-kit', Infinity, 1],
      ['crowbar', 3, 1], ['hammer', 3, 1], ['piton', 40, 1], ['shovel', 2, 1],
      ['grappling-hook', 3, 1], ['pole', 2, 1], ['lantern-hooded', 2, 1], ['lamp', 3, 1],
      ['chalk', 20, 1], ['blanket', 4, 1], ['clothes-traveler', 3, 1], ['cloak-common', 4, 1],
      ['tent', 2, 1], ['mirror', 2, 1], ['signal-whistle', 4, 1], ['whetstone', 6, 1],
      ['explorers-pack', 3, 1], ['dungeoneers-pack', 3, 1], ['burglars-pack', 1, 2],
      ['scholars-pack', 1, 2], ['priests-pack', 1, 2],
      ['healers-kit', 3, 1], ['herbalism-kit', 1, 2], ['climbers-kit', 1, 3],
      ['hunting-trap', 2, 2], ['caltrops', 4, 2], ['ball-bearings', 4, 2],
      ['ink', 2, 2], ['ink-pen', 4, 1], ['parchment', 20, 1], ['case-map-scroll', 2, 1],
      ['rope-silk', 1, 4], ['spikes-iron', 4, 2], ['ram-portable', 1, 3],
      ['trail-bread', Infinity, 1], ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1],
      ['sling-bullet', Infinity, 1], ['quiver', 3, 1],
    ],
  },
  'lionshield-coster': {
    id: 'lionshield-coster',
    name: 'Lionshield Coster',
    keeper: 'Linene Graywind',
    greeting: "Every blade here came up the Trail under the blue lion, and I sell to the honest. Prices are what they are, so mind the stamp.",
    markup: 1.1, buyback: 0.45, restockDays: 5,
    stock: [
      // The Coast armory: finite stock, with campaign-level availability.
      ["silvered-spear",3,2], ["coast-cutlass",4,1], ["boar-spear",4,1], ["dockworkers-cudgel",5,1],
      ['dagger', Infinity, 1], ['shortsword', 6, 1], ['longsword', 4, 1], ['handaxe', 6, 1],
      ['battleaxe', 3, 1], ['mace', 4, 1], ['warhammer', 3, 1], ['spear', 6, 1],
      ['javelin', 12, 1], ['quarterstaff', 6, 1], ['club', 6, 1], ['light-hammer', 4, 1],
      ['sickle', 3, 1], ['greatclub', 2, 1], ['scimitar', 3, 2], ['rapier', 3, 2],
      ['morningstar', 2, 2], ['war-pick', 3, 2], ['flail', 2, 3], ['trident', 2, 2],
      ['glaive', 1, 3], ['halberd', 1, 3], ['greataxe', 2, 3], ['greatsword', 2, 3],
      ['maul', 1, 3], ['pike', 2, 3], ['lance', 1, 5], ['whip', 2, 2],
      ['shortbow', 3, 1], ['longbow', 2, 3], ['light-crossbow', 3, 1],
      ['heavy-crossbow', 1, 4], ['hand-crossbow', 1, 5], ['sling', 4, 1], ['blowgun', 1, 3], ['dart', 20, 1],
      ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1], ['sling-bullet', Infinity, 1],
      ['blowgun-needle', 50, 3], ['arrow-silvered', 10, 4], ['quiver', 4, 1], ['case-crossbow-bolt', 3, 1],
      ['padded-armor', 2, 1], ['leather-armor', 4, 1], ['studded-leather', 2, 2],
      ['hide-armor', 3, 1], ['chain-shirt', 2, 2], ['scale-mail', 2, 2],
      ['ring-mail', 2, 2], ['chain-mail', 1, 4], ['breastplate', 1, 5],
      ['half-plate', 1, 6], ['splint-armor', 1, 6], ['plate-armor', 1, 8],
      ['shield', 6, 1], ['smiths-tools', 1, 2],
    ],
  },
  'shrine-of-luck': {
    id: 'shrine-of-luck',
    name: 'Shrine of Luck',
    keeper: 'Sister Garaele',
    greeting: "Tymora smiles on those who move. Take what you need for the road, leave what you can in the bowl, and come back alive.",
    markup: 1, buyback: 0.4, restockDays: 7,
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 3, 4],
      ['potion-superior-healing', 1, 8], ['antitoxin', 4, 1], ['holy-water', 4, 1],
      ['holy-symbol', 3, 1], ['holy-symbol-emblem', 2, 1], ['reliquary', 2, 2],
      ['druidic-focus', 2, 1], ['candle', Infinity, 1], ['blanket', 4, 1],
      ['priests-pack', 2, 1], ['healers-kit', 4, 1], ['herbalism-kit', 2, 1],
      ['scroll-cure-wounds', 3, 2], ['scroll-lesser-restoration', 2, 4],
      ['scroll-revivify', 1, 6], ['scroll-identify', 2, 2],
      ['potion-heroism', 1, 6], ['potion-resistance', 1, 5], ['potion-vitality', 1, 10],
      ['diamond-dust', 2, 5], ['book', 1, 1], ['robe', 2, 1],
    ],
  },
  'miners-exchange': {
    id: 'miners-exchange',
    name: "Phandalin Miner's Exchange",
    keeper: 'Halia Thornton',
    greeting: "The Exchange assays, certifies and buys. Ore, gems, curiosities out of old holes in the ground. And if you want work of a quieter sort, we can talk about that too.",
    markup: 1.15, buyback: 0.65, restockDays: 6,
    stock: [
      ['ore-sample-phandalin', 8, 1], ['silver-ore-wave-echo', 2, 4], ['platinum-ingot', 3, 5],
      ['gem-malachite', 6, 1], ['gem-quartz', 6, 1], ['gem-moonstone', 3, 3],
      ['gem-onyx', 3, 3], ['gem-amber', 2, 4], ['gem-jade', 2, 5], ['gem-pearl', 2, 5],
      ['gem-black-pearl', 1, 8], ['gem-emerald', 1, 10], ['gem-ruby', 1, 10],
      ['jewelers-tools', 1, 2], ['masons-tools', 2, 1], ['smiths-tools', 2, 1],
      ['tinkers-tools', 1, 3], ['shovel', 4, 1], ['piton', 60, 1], ['hammer', 4, 1],
      ['pot-iron', 2, 1], ['lantern-bullseye', 2, 3], ['climbers-kit', 2, 2],
      ['abacus', 2, 1], ['chest', 2, 1], ['lock', 3, 2], ['manacles', 2, 2],
      ['war-pick', 4, 1], ['diamond-dust', 1, 6], ['forgery-kit', 1, 5], ['poisoners-kit', 1, 6],
    ],
  },
  'stonehill-inn': {
    id: 'stonehill-inn',
    name: 'Stonehill Inn',
    keeper: 'Toblen Stonehill',
    greeting: "Room's two silver, stew's a copper, and Trilena bakes at dawn. Sit by the fire and tell me what the road looks like.",
    markup: 1, buyback: 0.35, restockDays: 1,
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['neverwinter-ale', Infinity, 1],
      ['waterskin', 6, 1], ['goodberry-preserve', 4, 1], ['blanket', 4, 1],
      ['bedroll', 3, 1], ['candle', Infinity, 1], ['soap', 6, 1], ['mess-kit', 4, 1],
      ['cooks-utensils', 1, 1], ['gaming-dice', 3, 1], ['gaming-cards', 2, 1],
      ['gaming-three-dragon-ante', 1, 2], ['lute', 1, 2], ['flute', 2, 1], ['drum', 1, 1],
      ['iriaeboran-north-brew', 6, 1], ['zzar', 2, 3], ['luirens-best', 2, 4],
      ['torch', Infinity, 1], ['tinderbox', 3, 1],
    ],
  },
  'neverwinter-market': {
    id: 'neverwinter-market',
    name: "Protector's Enclave Market",
    keeper: 'Bran Hornraven',
    greeting: "Neverwinter's rebuilt itself twice in my lifetime and I've sold to every crew that did it. Coin first, questions after.",
    markup: 1.2, buyback: 0.5, restockDays: 4,
    stock: [
      ['potion-healing', Infinity, 3], ['potion-greater-healing', 6, 4],
      ['potion-superior-healing', 2, 8], ['potion-climbing', 2, 3],
      ['potion-water-breathing', 2, 4], ['potion-animal-friendship', 2, 3],
      ['potion-fire-breath', 2, 5], ['potion-growth', 1, 5], ['potion-resistance', 2, 5],
      ['potion-giant-strength-hill', 1, 6], ['potion-gaseous-form', 1, 8],
      ['alchemists-fire', 6, 2], ['acid-vial', 6, 2], ['holy-water', 4, 2], ['poison-basic', 3, 4],
      ['scroll-1', 4, 2], ['scroll-2', 3, 4], ['scroll-3', 2, 6], ['scroll-cantrip', 4, 1],
      ['scroll-fireball', 1, 6], ['scroll-identify', 3, 2],
      ['breastplate', 2, 5], ['half-plate', 1, 6], ['splint-armor', 1, 6], ['plate-armor', 1, 8],
      ['rapier', 4, 3], ['longsword', 4, 2], ['greatsword', 3, 3], ['longbow', 3, 3],
      ['heavy-crossbow', 2, 4], ['hand-crossbow', 2, 5], ['arrow-silvered', 20, 4],
      ['arcane-focus', 3, 1], ['orb', 2, 2], ['rod', 2, 2], ['crystal', 3, 1],
      ['focus-wand', 3, 1], ['component-pouch', 4, 1], ['spellbook', 3, 1],
      ['alchemists-supplies', 2, 3], ['navigators-tools', 2, 3], ['cartographers-tools', 2, 2],
      ['thieves-tools', 3, 2], ['disguise-kit', 2, 3], ['spyglass', 1, 9],
      ['diplomats-pack', 2, 3], ['entertainers-pack', 2, 2], ['scholars-pack', 3, 2],
      ['rope-silk', 3, 3], ['lantern-bullseye', 3, 2], ['manacles', 3, 2],
      ['neverwinter-ale', Infinity, 1], ['saerloonian-glowfire', 2, 5],
    ],
  },
  'waterdeep-bazaar': {
    id: 'waterdeep-bazaar',
    name: 'The Market of Waterdeep',
    keeper: 'Esvele Amblecrown',
    greeting: "The Market never closes and never sleeps, dear. Whatever you want exists somewhere in this square. Whether you can pay for it is between you and Waukeen.",
    markup: 1.3, buyback: 0.55, restockDays: 3,
    stock: [
      // The Coast armory: finite stock, with campaign-level availability.
      ["silvered-rapier",3,3], ["longbow-of-warning",1,4], ["phalar-aluve",1,6], ["moonreef-trident",1,6], ["stormglass-longbow",1,7], ["surveyors-compass",2,3], ["streetrunner-boots",2,3], ["second-wind-draught",8,1], ["clearhead-tonic",5,2],
      ['potion-healing', Infinity, 5], ['potion-greater-healing', Infinity, 5],
      ['potion-superior-healing', 4, 8], ['potion-supreme-healing', 1, 13],
      ['potion-heroism', 2, 6], ['potion-invisibility', 1, 9], ['potion-speed', 1, 10],
      ['potion-flying', 1, 9], ['potion-mind-reading', 2, 7], ['potion-clairvoyance', 1, 8],
      ['potion-vitality', 1, 11], ['oil-slipperiness', 1, 7],
      ['potion-giant-strength-frost', 1, 8], ['potion-giant-strength-stone', 1, 8],
      ['potion-giant-strength-fire', 1, 11], ['potion-giant-strength-cloud', 1, 14],
      ['scroll-2', 4, 4], ['scroll-3', 3, 6], ['scroll-4', 2, 8], ['scroll-5', 2, 10],
      ['scroll-6', 1, 12], ['scroll-7', 1, 14], ['scroll-8', 1, 16],
      ['scroll-revivify', 2, 6], ['scroll-lesser-restoration', 3, 4],
      ['plate-armor', 2, 8], ['half-plate', 3, 6], ['breastplate', 3, 5],
      ['musket', 1, 10], ['pistol', 1, 9], ['firearm-bullet', 60, 9],
      ['spyglass', 2, 9], ['magnifying-glass', 3, 4], ['poisoners-kit', 2, 6],
      ['forgery-kit', 2, 5], ['jewelers-tools', 2, 3], ['glassblowers-tools', 1, 4],
      ['gem-moonstone', 4, 4], ['gem-jade', 3, 5], ['gem-pearl', 4, 5],
      ['gem-black-pearl', 2, 8], ['gem-emerald', 2, 10], ['gem-ruby', 2, 10],
      ['gem-diamond', 1, 14], ['diamond-dust', 6, 5],
      ['viol', 2, 3], ['lyre', 2, 3], ['dulcimer', 1, 3], ['bagpipes', 1, 3],
      ['clothes-fine', 4, 3], ['perfume', 4, 3], ['signet-ring', 3, 3],
      ['zzar', Infinity, 3], ['evermead', 2, 8], ['saerloonian-glowfire', 3, 5],
      ['luirens-best', 3, 4], ['diplomats-pack', 3, 3],
    ],
  },
  'yawning-portal': {
    id: 'yawning-portal',
    name: 'The Yawning Portal',
    keeper: 'Durnan',
    greeting: "One gold to go down the well. Two to be hauled back up, if you're still in one piece to be hauled. Buy your rope before you climb, not after.",
    markup: 1.25, buyback: 0.5, restockDays: 2,
    stock: [
      ['rope-hempen', Infinity, 1], ['rope-silk', Infinity, 5], ['torch', Infinity, 1],
      ['oil-flask', Infinity, 1], ['lantern-hooded', Infinity, 3], ['lantern-bullseye', 6, 4],
      ['piton', Infinity, 1], ['spikes-iron', Infinity, 2], ['grappling-hook', 8, 1],
      ['chalk', Infinity, 1], ['pole', 6, 1], ['crowbar', 6, 1], ['ram-portable', 3, 4],
      ['rations', Infinity, 1], ['waterskin', Infinity, 1], ['healers-kit', 8, 1],
      ['potion-healing', Infinity, 4], ['potion-greater-healing', 6, 6],
      ['potion-superior-healing', 3, 10], ['antitoxin', 6, 3],
      ['alchemists-fire', 8, 4], ['acid-vial', 8, 4], ['holy-water', 8, 4],
      ['caltrops', 6, 3], ['ball-bearings', 6, 3], ['hunting-trap', 4, 4],
      ['thieves-tools', 6, 3], ['climbers-kit', 4, 3], ['manacles', 4, 3],
      ['dungeoneers-pack', Infinity, 1], ['explorers-pack', Infinity, 1],
      ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1], ['arrow-silvered', 30, 6],
      ['neverwinter-ale', Infinity, 1], ['shadowdark-ale', Infinity, 1],
      ['iriaeboran-north-brew', Infinity, 1], ['zzar', 6, 5],
      ['scroll-1', 3, 3], ['scroll-2', 2, 5], ['scroll-3', 2, 7], ['scroll-4', 1, 9],
    ],
  },

  // =========================================================================
  // 15b. THE ROAD SOUTH — Waterdeep to Nashkel (SOUTHERN CHARTER §4.1)
  //
  // ui/shop.js merges a SHOP_TABLES entry over its FALLBACK_SHOPS entry and
  // the table wins, so these carry the whole definition: the keeper, the sprite
  // hook (`npc`), the counter kind, the music cue and the services. Every stock
  // row is [itemId, quantity (Infinity = always on the shelf), minPartyLevel].
  //
  // The economy of the road: Daggerford and the Way Inn price like the frontier
  // (markup 1.0–1.05), Beregost a little above it, and the further south you go
  // the more Amn is in the arithmetic. Nothing here is invented — every keeper
  // is canon or built from the naming tables in docs/SETTING.md §5.
  // =========================================================================

  'daggerford-provisions': {
    id: 'daggerford-provisions',
    name: "Ironeater's Smithy",
    keeper: 'Derval Ironeater', npc: 'derval-ironeater',
    kind: 'smith', music: 'shop',
    greeting: "Shoeing, mending, sharpening. I do not enchant, I do not know anybody who does, and I would thank you not to ask a fourth time.",
    markup: 1.05, buyback: 0.5, restockDays: 5,
    services: ['repair'],
    stock: [
      ['dagger', Infinity, 1], ['handaxe', 8, 1], ['shortsword', 6, 1], ['longsword', 5, 1],
      ['battleaxe', 4, 1], ['mace', 5, 1], ['warhammer', 4, 1], ['spear', 8, 1],
      ['javelin', 16, 1], ['war-pick', 4, 1], ['morningstar', 3, 1], ['maul', 2, 3],
      ['greataxe', 3, 3], ['greatsword', 3, 3], ['halberd', 2, 4], ['glaive', 2, 4],
      ['light-crossbow', 4, 1], ['heavy-crossbow', 2, 4], ['shortbow', 3, 1], ['longbow', 2, 3],
      ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1], ['arrow-silvered', 20, 6],
      ['quiver', 4, 1], ['case-crossbow-bolt', 3, 1], ['whetstone', 8, 1],
      ['leather-armor', 4, 1], ['studded-leather', 3, 2], ['hide-armor', 3, 1],
      ['chain-shirt', 3, 2], ['scale-mail', 3, 2], ['ring-mail', 2, 2],
      ['chain-mail', 2, 4], ['breastplate', 2, 5], ['splint-armor', 1, 6],
      ['half-plate', 1, 7], ['plate-armor', 1, 9], ['shield', 6, 1],
      ['smiths-tools', 2, 1], ['hammer', 4, 1], ['spikes-iron', 20, 1],
      ['longsword-plus1', 1, 9], ['battleaxe-plus1', 1, 9], ['shield-plus1', 1, 10],
    ],
  },
  'river-shining-tavern': {
    id: 'river-shining-tavern',
    name: 'The River Shining Tavern',
    keeper: 'Filarion Filvendorson', npc: 'filarion-filvendorson',
    kind: 'inn', music: 'inn',
    greeting: "Best beds between Waterdeep and the Gate, and I will argue that with anyone who has slept in both. Elverquisst is upstairs. Everything else is on the board.",
    markup: 1, buyback: 0.35, restockDays: 1,
    services: ['room-common', 'room-private', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', 8, 1],
      ['neverwinter-ale', Infinity, 1], ['iriaeboran-north-brew', 8, 1], ['zzar', 6, 1],
      ['luirens-best', 4, 1], ['evermead', 2, 9], ['saerloonian-glowfire', 3, 7],
      ['goodberry-preserve', 6, 1], ['blanket', 6, 1], ['bedroll', 4, 1],
      ['candle', Infinity, 1], ['soap', 8, 1], ['mess-kit', 6, 1],
      ['gaming-dice', 4, 1], ['gaming-cards', 3, 1], ['gaming-three-dragon-ante', 2, 1],
      ['lute', 1, 2], ['flute', 2, 1], ['clothes-traveler', 4, 1],
      ['potion-healing', 4, 1], ['healers-kit', 3, 1],
    ],
    fill: { kinds: ['food'], maxCost: 30, count: 12 },
  },
  'happy-cow': {
    id: 'happy-cow',
    name: 'The Happy Cow',
    keeper: 'Fulbar Hardcheese', npc: 'fulbar-hardcheese',
    kind: 'inn', music: 'inn',
    greeting: "Copper a bowl, copper a bed, and if the man beside you is snoring that is between you and him. Sit anywhere. Nobody here minds.",
    markup: 0.95, buyback: 0.3, restockDays: 1,
    services: ['room-common', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['shadowdark-ale', Infinity, 1],
      ['neverwinter-ale', Infinity, 1], ['iriaeboran-north-brew', 10, 1],
      ['goodberry-preserve', 8, 1], ['blanket', 8, 1], ['bedroll', 6, 1],
      ['waterskin', 10, 1], ['sack', 10, 1], ['torch', Infinity, 1], ['candle', Infinity, 1],
      ['gaming-dice', 6, 1], ['drum', 1, 1], ['pan-flute', 1, 1],
    ],
    fill: { kinds: ['food'], maxCost: 6, count: 10 },
  },
  'morninglow-tower': {
    id: 'morninglow-tower',
    name: 'Morninglow Tower',
    keeper: 'Lucian Dlusker', npc: 'lucian-dlusker',
    kind: 'temple', music: 'temple',
    greeting: "The Keeper of the Yellow Sun bids you welcome. Amaunator's law is written and it is fixed, and so are our prices. Tell me where it hurts.",
    markup: 1, buyback: 0.4, restockDays: 6,
    services: ['heal', 'lesser-restoration', 'remove-curse', 'revivify'],
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 4, 5],
      ['potion-superior-healing', 2, 9], ['antitoxin', 6, 1], ['holy-water', 8, 1],
      ['holy-symbol', 4, 1], ['holy-symbol-emblem', 4, 1], ['reliquary', 3, 1],
      ['candle', Infinity, 1],
      ['priests-pack', 3, 1], ['healers-kit', 5, 1], ['herbalism-kit', 2, 1],
      ['scroll-cure-wounds', 4, 2], ['scroll-lesser-restoration', 3, 5],
      ['scroll-revivify', 2, 8], ['scroll-identify', 2, 3],
      ['potion-heroism', 2, 8], ['potion-resistance', 2, 7], ['potion-vitality', 1, 12],
      ['diamond-dust', 4, 6], ['robe', 3, 1], ['book', 2, 1], ['mace', 3, 1],
      ['lightbringer', 1, 11],
    ],
  },
  'way-inn-common': {
    id: 'way-inn-common',
    name: 'The Way Inn',
    keeper: 'Gorstag Amblecrown', npc: 'gorstag-amblecrown',
    kind: 'inn', music: 'inn',
    greeting: "Gates shut at dusk and they stay shut. Beds, feed, hot food, and the road board by the fire — chalk your own line on it if you have news worth the chalk.",
    markup: 1, buyback: 0.4, restockDays: 2,
    services: ['room-common', 'room-private', 'meal', 'repair'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['neverwinter-ale', Infinity, 1], ['shadowdark-ale', Infinity, 1], ['zzar', 4, 3],
      ['bedroll', Infinity, 1], ['blanket', Infinity, 1], ['tent', 4, 1], ['tinderbox', 8, 1],
      ['torch', Infinity, 1], ['oil-flask', Infinity, 1], ['lantern-hooded', 4, 1],
      ['rope-hempen', 8, 1], ['piton', 40, 1], ['grappling-hook', 4, 1],
      ['explorers-pack', 4, 1], ['dungeoneers-pack', 3, 1], ['healers-kit', 5, 1],
      ['clothes-traveler', 5, 1], ['cloak-common', 5, 1], ['boots-of-striding-and-springing', 1, 12],
      ['map', 6, 1], ['case-map-scroll', 4, 1], ['cartographers-tools', 1, 4],
      ['navigators-tools', 1, 4], ['potion-healing', 6, 1], ['potion-greater-healing', 2, 7],
      ['hunting-trap', 3, 1], ['gaming-dice', 4, 1], ['horn', 2, 1],
    ],
    fill: { kinds: ['food', 'gear'], maxCost: 30, count: 20 },
  },
  'sea-bounty': {
    id: 'sea-bounty',
    name: 'The Sea Bounty',
    keeper: 'Westra Helder', npc: 'westra-helder',
    kind: 'inn', music: 'inn',
    greeting: "Fish, beer, and a bed that does not move under you. Passage to the isles is a different conversation and it happens down at the shingle, not in here.",
    markup: 1, buyback: 0.4, restockDays: 2,
    services: ['room-common', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['neverwinter-ale', Infinity, 1], ['shadowdark-ale', Infinity, 1],
      ['rope-hempen', Infinity, 1], ['rope-silk', 2, 6], ['net', 6, 1], ['hunting-trap', 3, 1],
      ['oil-flask', Infinity, 1], ['lantern-hooded', 4, 1], ['lantern-bullseye', 2, 4],
      ['navigators-tools', 2, 3], ['spyglass', 1, 9], ['block-and-tackle', 3, 1],
      ['bucket', 6, 1], ['sack', 10, 1], ['basket', 6, 1],
      ['potion-water-breathing', 2, 7], ['potion-climbing', 2, 4], ['antitoxin', 4, 1],
      ['trident', 4, 1], ['spear', 6, 1], ['dagger', 8, 1],
      ['mariners-armor', 1, 10], ['cap-of-water-breathing', 1, 11],
    ],
    fill: { kinds: ['food', 'gear'], maxCost: 25, count: 16 },
  },
  'friendly-arm-common': {
    id: 'friendly-arm-common',
    name: 'The Friendly Arm',
    keeper: 'Bentley Mirrorshade', npc: 'bentley-mirrorshade',
    kind: 'inn', music: 'inn',
    greeting: "Walls, a gate, and a gnome who has cleared worse out of his own cellar than whatever is following you. Sit down. Nothing gets in here.",
    markup: 1.05, buyback: 0.45, restockDays: 2,
    services: ['room-common', 'room-private', 'meal', 'repair'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['neverwinter-ale', Infinity, 1], ['iriaeboran-north-brew', Infinity, 1],
      ['luirens-best', 6, 1], ['zzar', 4, 3], ['evermead', 2, 10],
      ['bedroll', Infinity, 1], ['blanket', Infinity, 1], ['tent', 3, 1],
      ['torch', Infinity, 1], ['oil-flask', Infinity, 1], ['tinderbox', 8, 1],
      ['rope-hempen', 8, 1], ['grappling-hook', 4, 1], ['crowbar', 4, 1],
      ['explorers-pack', 4, 1], ['dungeoneers-pack', 3, 1], ['burglars-pack', 2, 4],
      ['healers-kit', 6, 1], ['herbalism-kit', 2, 1], ['climbers-kit', 2, 3],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 4, 7],
      ['potion-superior-healing', 1, 11], ['antitoxin', 5, 1], ['holy-water', 4, 3],
      ['thieves-tools', 3, 3], ['tinkers-tools', 2, 3], ['gaming-dice', 4, 1],
      ['lantern-hooded', 4, 1], ['sending-stones', 1, 12],
    ],
    fill: { kinds: ['food', 'gear', 'tool'], maxCost: 60, count: 22 },
  },
  'garl-shrine': {
    id: 'garl-shrine',
    name: "The Shrine of Garl Glittergold",
    keeper: 'Gellana Mirrorshade', npc: 'gellana-mirrorshade',
    kind: 'temple', music: 'temple',
    greeting: "Garl laughs first and mends afterwards, and I have found that order works. Sit on the stool. Tell me what happened, and do not leave out the stupid part.",
    markup: 1, buyback: 0.4, restockDays: 6,
    services: ['heal', 'lesser-restoration', 'remove-curse'],
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 3, 6],
      ['antitoxin', 6, 1], ['holy-water', 6, 1], ['healers-kit', 6, 1],
      ['herbalism-kit', 3, 1], ['holy-symbol', 3, 1], ['holy-symbol-emblem', 3, 1],
      ['priests-pack', 3, 1], ['candle', Infinity, 1], ['blanket', 4, 1],
      ['scroll-cure-wounds', 3, 2], ['scroll-lesser-restoration', 2, 6],
      ['scroll-identify', 2, 3], ['potion-resistance', 1, 8],
      ['keoghtoms-ointment', 1, 11], ['gaming-dice', 4, 1], ['robe', 2, 1],
    ],
  },
  'feldeposts-inn': {
    id: 'feldeposts-inn',
    name: "Feldepost's Inn",
    keeper: 'Feldepost', npc: 'feldepost',
    kind: 'inn', music: 'inn',
    greeting: "Quiet house. Good wine, older company, and no singing after the second bell. If that does not suit you, the Jovial Juggler is up the road and they will have you.",
    markup: 1.1, buyback: 0.4, restockDays: 3,
    services: ['room-private', 'room-common', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1],
      ['zzar', Infinity, 1], ['luirens-best', 8, 1], ['evermead', 3, 9],
      ['saerloonian-glowfire', 4, 6], ['neverwinter-ale', Infinity, 1],
      ['blanket', 6, 1], ['bedroll', 4, 1], ['soap', 8, 1], ['perfume', 4, 3],
      ['clothes-fine', 3, 4], ['clothes-traveler', 4, 1], ['candle', Infinity, 1],
      ['gaming-cards', 3, 1], ['gaming-dragonchess', 2, 3], ['viol', 1, 4],
      ['ink', 3, 1], ['ink-pen', 6, 1], ['parchment', 30, 1], ['book', 2, 1],
    ],
    fill: { kinds: ['food'], maxCost: 40, count: 12 },
  },
  'jovial-juggler': {
    id: 'jovial-juggler',
    name: 'The Jovial Juggler',
    keeper: 'Kithri Greenbottle', npc: 'kithri-greenbottle',
    kind: 'inn', music: 'inn',
    greeting: "Play something and the first cup is on the house. Play it badly and the second one is too, because that is funnier. Beds upstairs, board by the door.",
    markup: 1, buyback: 0.4, restockDays: 2,
    services: ['room-common', 'room-private', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1],
      ['neverwinter-ale', Infinity, 1], ['shadowdark-ale', Infinity, 1],
      ['iriaeboran-north-brew', 8, 1], ['luirens-best', 6, 1], ['zzar', 4, 3],
      ['lute', 2, 1], ['lyre', 2, 1], ['flute', 3, 1], ['drum', 2, 1],
      ['horn', 2, 1], ['viol', 1, 3], ['dulcimer', 1, 3], ['bagpipes', 1, 3],
      ['shawm', 2, 1], ['pan-flute', 2, 1], ['entertainers-pack', 3, 1],
      ['costume', 4, 1], ['disguise-kit', 2, 4], ['gaming-dice', 6, 1],
      ['gaming-cards', 4, 1], ['bedroll', 4, 1], ['blanket', 6, 1],
      ['potion-healing', 4, 1], ['pipes-of-haunting', 1, 12],
    ],
    fill: { kinds: ['food'], maxCost: 20, count: 10 },
  },
  'burning-wizard': {
    id: 'burning-wizard',
    name: 'The Burning Wizard',
    keeper: 'Marta Domine', npc: 'marta-domine',
    kind: 'inn', music: 'inn',
    greeting: "Drink at the bar, bleed outside, and whatever you are buying that is not on the shelf, ask for it once and quietly.",
    markup: 1.05, buyback: 0.5, restockDays: 3,
    services: ['room-common', 'meal'],
    stock: [
      ['shadowdark-ale', Infinity, 1], ['neverwinter-ale', Infinity, 1],
      ['iriaeboran-north-brew', Infinity, 1], ['rations', Infinity, 1],
      ['trail-bread', Infinity, 1], ['bedroll', 4, 1], ['blanket', 4, 1],
      ['dagger', 8, 1], ['club', 6, 1], ['shortsword', 4, 1], ['handaxe', 4, 1],
      ['thieves-tools', 4, 3], ['poisoners-kit', 2, 6], ['forgery-kit', 1, 6],
      ['poison-basic', 4, 5], ['acid-vial', 6, 3], ['alchemists-fire', 4, 3],
      ['caltrops', 6, 2], ['ball-bearings', 6, 2], ['manacles', 3, 2],
      ['gaming-dice', 6, 1], ['potion-healing', 4, 1], ['antitoxin', 4, 2],
      ['dagger-of-venom', 1, 12], ['dust-of-disappearance', 1, 11],
    ],
    fill: { kinds: ['food'], maxCost: 10, count: 8 },
  },
  'song-of-the-morning': {
    id: 'song-of-the-morning',
    name: 'The Song of the Morning',
    keeper: 'Kelddath Ormlyr', npc: 'kelddath-ormlyr',
    kind: 'temple', music: 'temple',
    greeting: "Lathander's house at Beregost, and the greatest of his houses south of Waterdeep — which I say without pride, because it only means we have the most work. What do you need?",
    markup: 1.05, buyback: 0.45, restockDays: 5,
    services: ['heal', 'lesser-restoration', 'remove-curse', 'revivify', 'identify'],
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', Infinity, 6],
      ['potion-superior-healing', 3, 10], ['potion-supreme-healing', 1, 13],
      ['antitoxin', 8, 1], ['holy-water', Infinity, 1], ['keoghtoms-ointment', 2, 10],
      ['holy-symbol', 6, 1], ['holy-symbol-emblem', 6, 1], ['reliquary', 4, 1],
      ['priests-pack', 4, 1], ['healers-kit', 8, 1], ['herbalism-kit', 3, 1],
      ['scroll-cure-wounds', 6, 2], ['scroll-lesser-restoration', 4, 5],
      ['scroll-revivify', 3, 8], ['scroll-identify', 4, 3], ['scroll-3', 2, 9],
      ['potion-heroism', 3, 8], ['potion-resistance', 3, 7], ['potion-vitality', 1, 12],
      ['diamond-dust', 8, 6], ['robe', 4, 1], ['book', 3, 1],
      ['mace', 4, 1], ['mace-plus1', 2, 9], ['shield', 4, 1], ['shield-plus1', 1, 11],
      ['periapt-of-wound-closure', 1, 12], ['lightbringer', 1, 11],
      ['mace-of-disruption', 1, 14],
    ],
  },
  'thunderhammer-smithy': {
    id: 'thunderhammer-smithy',
    name: 'Thunderhammer Smithy',
    keeper: 'Taerom "Thunderhammer" Fuiruim', npc: 'taerom-fuiruim',
    kind: 'smith', music: 'shop',
    greeting: "Everything on that wall I made, and everything I made will outlast you. Full plate is six tendays and I will not be hurried on it. Pick something up.",
    markup: 1.1, buyback: 0.5, restockDays: 6,
    services: ['repair'],
    stock: [
      // The Coast armory: finite stock, with campaign-level availability.
      ["vicious-longsword",1,5], ["vicious-war-pick",1,5], ["silvered-rapier",2,3], ["silvered-spear",3,2], ["boar-spear",4,1],
      ['dagger', Infinity, 1], ['shortsword', 8, 1], ['longsword', 8, 1], ['scimitar', 5, 1],
      ['rapier', 5, 2], ['handaxe', 8, 1], ['battleaxe', 6, 1], ['greataxe', 4, 3],
      ['greatsword', 4, 3], ['maul', 3, 3], ['mace', 6, 1], ['warhammer', 6, 1],
      ['morningstar', 4, 2], ['war-pick', 5, 1], ['flail', 3, 3], ['trident', 3, 2],
      ['halberd', 3, 4], ['glaive', 3, 4], ['pike', 3, 3], ['lance', 2, 6],
      ['spear', 8, 1], ['javelin', 20, 1], ['light-hammer', 6, 1], ['whip', 2, 2],
      ['light-crossbow', 4, 1], ['heavy-crossbow', 3, 4], ['hand-crossbow', 2, 6],
      ['shortbow', 4, 1], ['longbow', 3, 3], ['sling', 6, 1],
      ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1], ['sling-bullet', Infinity, 1],
      ['arrow-silvered', 30, 6], ['quiver', 6, 1], ['case-crossbow-bolt', 4, 1],
      ['padded-armor', 3, 1], ['leather-armor', 5, 1], ['studded-leather', 4, 2],
      ['hide-armor', 4, 1], ['chain-shirt', 4, 2], ['scale-mail', 4, 2],
      ['ring-mail', 3, 2], ['chain-mail', 3, 4], ['breastplate', 2, 5],
      ['splint-armor', 2, 6], ['half-plate', 2, 7], ['plate-armor', 2, 9],
      ['shield', 8, 1], ['smiths-tools', 3, 1], ['whetstone', 12, 1],
      ['longsword-plus1', 1, 10], ['warhammer-plus1', 1, 10], ['handaxe-plus1', 1, 9],
      ['shield-plus1', 2, 10], ['chain-shirt-plus1', 1, 11], ['dwarven-thrower', 1, 15],
    ],
  },
  'high-hedge': {
    id: 'high-hedge',
    name: 'High Hedge',
    keeper: 'Thalantyr', npc: 'thalantyr',
    kind: 'exchange', music: 'shop',
    greeting: "The skeletons in the garden are mine, they are perfectly well behaved, and I would rather discuss what you came for. Conjuration is my discipline. Everything else I merely sell.",
    markup: 1.25, buyback: 0.5, restockDays: 8,
    services: ['identify'],
    premium: { kinds: ['gem', 'material', 'scroll'], mult: 0.7 },
    stock: [
      ['scroll-cantrip', 6, 1], ['scroll-1', 5, 3], ['scroll-2', 4, 5], ['scroll-3', 3, 7],
      ['scroll-4', 2, 9], ['scroll-5', 2, 11], ['scroll-6', 1, 13],
      ['scroll-identify', 5, 3], ['scroll-magic-missile', 4, 2], ['scroll-fireball', 2, 8],
      ['scroll-revivify', 1, 9], ['scroll-lesser-restoration', 2, 6],
      ['arcane-focus', 4, 1], ['component-pouch', 6, 1], ['crystal', 4, 1],
      ['orb', 3, 1], ['rod', 3, 1], ['focus-wand', 4, 1], ['yew-wand', 3, 1],
      ['spellbook', 4, 1], ['ink', 6, 1], ['ink-pen', 8, 1], ['parchment', 40, 1],
      ['book', 4, 1], ['case-map-scroll', 4, 1], ['vial', 10, 1], ['flask', 10, 1],
      ['diamond-dust', 6, 5], ['gem-onyx', 4, 4], ['gem-amber', 3, 6], ['gem-jade', 2, 7],
      ['gem-moonstone', 4, 4], ['gem-quartz', 6, 1], ['gem-pearl', 2, 7],
      ['potion-healing', 6, 1], ['potion-greater-healing', 3, 7],
      ['potion-invisibility', 1, 11], ['potion-gaseous-form', 1, 11],
      ['potion-mind-reading', 1, 10], ['potion-fire-breath', 2, 7], ['potion-growth', 1, 8],
      ['alchemists-supplies', 2, 4], ['alchemists-fire', 6, 3], ['acid-vial', 6, 3],
      // The back of the shop. `thalantyrs-bargain` is what makes these worth
      // his while; the level gate is what stops a passing party buying it early.
      ['wand-of-magic-missiles', 1, 11], ['wand-of-magic-detection', 1, 10],
      ['wand-of-web', 1, 12], ['wand-of-secrets', 1, 11],
      ['staff-of-the-adder', 1, 12], ['driftglobe', 2, 9], ['immovable-rod', 1, 12],
      ['bag-of-holding', 1, 12], ['pearl-of-power', 1, 13],
    ],
  },
  'candlekeep-gatehouse': {
    id: 'candlekeep-gatehouse',
    name: 'The Candlekeep Gatehouse',
    keeper: 'Great Reader Sariel Amakiir', npc: 'sariel-amakiir',
    kind: 'exchange', music: 'temple',
    greeting: "The gate price is one written work the library does not hold. Everything on this table is what the Avowed will sell you instead, and I am obliged to say it is not the same thing.",
    markup: 1.3, buyback: 0.55, restockDays: 10,
    services: ['identify'],
    premium: { kinds: ['scroll', 'gear'], mult: 0.75 },
    stock: [
      ['book', Infinity, 1], ['parchment', Infinity, 1], ['paper', Infinity, 1],
      ['ink', 8, 1], ['ink-pen', 12, 1], ['case-map-scroll', 8, 1], ['map', 10, 1],
      ['spellbook', 4, 1], ['scholars-pack', 4, 1], ['calligraphers-supplies', 3, 2],
      ['cartographers-tools', 3, 3], ['navigators-tools', 2, 3], ['magnifying-glass', 4, 3],
      ['abacus', 4, 1], ['chest', 3, 1], ['lock', 4, 2], ['candle', Infinity, 1],
      ['lamp', 4, 1], ['lantern-hooded', 3, 1], ['robe', 4, 1], ['clothes-fine', 2, 5],
      ['scroll-cantrip', 6, 1], ['scroll-1', 4, 3], ['scroll-2', 4, 5], ['scroll-3', 3, 7],
      ['scroll-4', 2, 9], ['scroll-5', 2, 11], ['scroll-6', 1, 13], ['scroll-7', 1, 15],
      ['scroll-identify', 6, 3], ['scroll-lesser-restoration', 2, 6],
      ['helm-of-comprehending-languages', 1, 11], ['headband-of-intellect', 1, 13],
      ['tome-of-clear-thought', 1, 16], ['tome-of-understanding', 1, 16],
      ['rod-of-alertness', 1, 15], ['crystal-ball', 1, 17],
      ['potion-healing', 4, 1], ['potion-clairvoyance', 1, 11], ['potion-mind-reading', 2, 10],
    ],
  },
  'nashkel-store': {
    id: 'nashkel-store',
    name: 'The Nashkel Store',
    keeper: 'Berrun Ghastkill', npc: 'berrun-ghastkill',
    kind: 'general', music: 'shop',
    greeting: "Mayor of Nashkel and I keep the store, which people find funny until they need either. Ore assayed while you wait. Amnish coin, Amnish rates, no arguing.",
    markup: 1.15, buyback: 0.5, restockDays: 5,
    services: ['appraise', 'repair'],
    premium: { kinds: ['gem', 'material'], mult: 0.9 },
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['torch', Infinity, 1], ['oil-flask', Infinity, 1], ['tinderbox', Infinity, 1],
      ['lantern-hooded', 6, 1], ['lantern-bullseye', 4, 4], ['candle', Infinity, 1],
      ['rope-hempen', Infinity, 1], ['rope-silk', 2, 7], ['piton', Infinity, 1],
      ['spikes-iron', Infinity, 1], ['shovel', 8, 1], ['hammer', 6, 1], ['crowbar', 6, 1],
      ['pole', 6, 1], ['grappling-hook', 5, 1], ['ram-portable', 2, 5],
      ['climbers-kit', 4, 3], ['healers-kit', 6, 1], ['bedroll', 6, 1], ['blanket', 6, 1],
      ['sack', Infinity, 1], ['basket', 6, 1], ['bucket', 6, 1], ['chalk', Infinity, 1],
      ['war-pick', 6, 1], ['masons-tools', 3, 1], ['smiths-tools', 2, 1],
      ['jewelers-tools', 1, 4], ['tinkers-tools', 2, 3],
      ['ore-sample-phandalin', 6, 1], ['platinum-ingot', 3, 8], ['diamond-dust', 3, 7],
      ['gem-malachite', 8, 1], ['gem-quartz', 8, 1], ['gem-onyx', 4, 5],
      ['gem-moonstone', 3, 5], ['gem-amber', 2, 8],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 4, 8],
      ['antitoxin', 6, 1], ['dungeoneers-pack', 4, 1], ['explorers-pack', 4, 1],
      ['goggles-of-night', 1, 12],
    ],
    fill: { kinds: ['gear', 'tool'], maxCost: 40, count: 24 },
  },
  'nashkel-inn': {
    id: 'nashkel-inn',
    name: 'The Nashkel Inn',
    keeper: 'Vitiare Calabra', npc: 'vitiare-calabra',
    kind: 'inn', music: 'inn',
    greeting: "Beds, board, and every rumour that comes up the Cloudpeaks road, which lately is all about the mine. Amnish silver, if you have it. Baldurian if you must.",
    markup: 1.1, buyback: 0.35, restockDays: 2,
    services: ['room-common', 'room-private', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['neverwinter-ale', Infinity, 1], ['shadowdark-ale', Infinity, 1],
      ['zzar', 6, 3], ['luirens-best', 4, 1], ['saerloonian-glowfire', 2, 8],
      ['bedroll', 4, 1], ['blanket', 6, 1], ['soap', 6, 1], ['candle', Infinity, 1],
      ['gaming-dice', 4, 1], ['gaming-cards', 3, 1], ['lute', 1, 3],
      ['potion-healing', 4, 1], ['healers-kit', 3, 1], ['clothes-traveler', 3, 1],
    ],
    fill: { kinds: ['food'], maxCost: 25, count: 10 },
  },

  // =========================================================================
  // 15c. BALDUR'S GATE — the Outer City (SOUTHERN CHARTER §1.3)
  //
  // Everything outside the walls: mud, tents, ox-pens and the black market. The
  // markups are the lowest in the south and the buyback rates the best, because
  // out here nobody asks where a thing came from and nobody has a licence to
  // lose. Brem's counter in Sow's Foot pays better for stolen goods than the
  // Counting House pays for honest ones, which is the whole argument the Outer
  // City has with the Upper.
  // =========================================================================

  'blackgate-yard': {
    id: 'blackgate-yard',
    name: 'The Blackgate Yard',
    keeper: 'Gorstag Evenwood', npc: 'gorstag-evenwood',
    kind: 'general', music: 'shop',
    greeting: "Feed, tack, wheels, axles, and every kind of rope a wagon can want. If you are going through that gate today, buy it here — inside the wall they will charge you double for worse.",
    markup: 1, buyback: 0.5, restockDays: 3,
    services: ['repair'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['rope-hempen', Infinity, 1], ['rope-silk', 3, 7], ['block-and-tackle', 4, 1],
      ['chain', 6, 1], ['sack', Infinity, 1], ['basket', 8, 1], ['bucket', 8, 1],
      ['mess-kit', 8, 1],
      ['tent', 6, 1], ['bedroll', Infinity, 1], ['blanket', Infinity, 1],
      ['torch', Infinity, 1], ['oil-flask', Infinity, 1], ['lantern-hooded', 6, 1],
      ['tinderbox', Infinity, 1], ['whetstone', 10, 1], ['hammer', 6, 1],
      ['crowbar', 6, 1], ['shovel', 6, 1], ['piton', Infinity, 1], ['spikes-iron', Infinity, 1],
      ['grappling-hook', 6, 1], ['pole', 8, 1], ['ladder', 3, 1], ['net', 4, 1],
      ['hunting-trap', 4, 1], ['manacles', 4, 2], ['lock', 4, 2], ['chest', 3, 1],
      ['explorers-pack', 6, 1], ['dungeoneers-pack', 4, 1], ['healers-kit', 6, 1],
      ['carpenters-tools', 3, 1], ['leatherworkers-tools', 3, 1], ['smiths-tools', 2, 1],
      ['cartographers-tools', 2, 4], ['navigators-tools', 2, 4], ['map', 8, 1],
      ['clothes-traveler', 6, 1], ['cloak-common', 6, 1], ['boots-of-striding-and-springing', 1, 13],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 3, 9],
    ],
    fill: { kinds: ['gear', 'tool'], maxCost: 35, count: 26 },
  },
  'little-calimshan-bazaar': {
    id: 'little-calimshan-bazaar',
    name: 'The Little Calimshan Bazaar',
    keeper: 'Zasheida Pashar', npc: 'zasheida-pashar',
    kind: 'general', music: 'shop',
    greeting: "You are welcome, you are very welcome, sit — no, sit. Now. Silk, saffron, pepper by the ounce, and one or two things I keep behind the curtain. Which are we discussing?",
    markup: 1.2, buyback: 0.55, restockDays: 4,
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['clothes-fine', 6, 1], ['clothes-traveler', 8, 1], ['cloak-common', 8, 1],
      ['robe', 6, 1], ['costume', 4, 1], ['perfume', 10, 1], ['soap', 12, 1],
      ['mirror', 6, 1], ['jug', 8, 1], ['bottle-glass', 10, 1], ['vial', 12, 1],
      ['flask', 12, 1], ['pot-iron', 6, 1], ['cooks-utensils', 4, 1], ['mess-kit', 8, 1],
      ['brewers-supplies', 2, 3], ['weavers-tools', 2, 2], ['potters-tools', 2, 2],
      ['painters-supplies', 2, 2], ['glassblowers-tools', 1, 5],
      ['gaming-three-dragon-ante', 3, 1], ['gaming-dragonchess', 2, 3],
      ['zzar', 8, 1], ['luirens-best', 6, 1], ['saerloonian-glowfire', 4, 6],
      ['evermead', 2, 11], ['scimitar', 6, 1], ['dagger', 10, 1], ['whip', 4, 2],
      ['hand-crossbow', 2, 7], ['blowgun', 3, 3], ['blowgun-needle', 60, 3],
      ['glamoured-studded-leather', 1, 13], ['hat-of-disguise', 1, 12],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 4, 9],
      ['antitoxin', 8, 1], ['poison-basic', 4, 8], ['poisoners-kit', 2, 9],
      ['herbalism-kit', 4, 1], ['alchemists-supplies', 3, 5],
      ['gem-amber', 3, 8], ['gem-jade', 2, 9], ['gem-pearl', 3, 8], ['signet-ring', 6, 1],
    ],
    fill: { kinds: ['gear', 'tool', 'food'], maxCost: 60, count: 28 },
  },
  'khemeds-house': {
    id: 'khemeds-house',
    name: "Khemed's Coffee House",
    keeper: 'Khemed Rein', npc: 'khemed-rein',
    kind: 'inn', music: 'inn',
    greeting: "Sit. The little cups are the strong ones. Whatever you have come to ask about, somebody in this room already knows it and will tell you for a second cup.",
    markup: 1, buyback: 0.35, restockDays: 1,
    services: ['room-common', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['goodberry-preserve', 8, 1], ['luirens-best', 6, 1], ['zzar', 6, 1],
      ['neverwinter-ale', Infinity, 1], ['blanket', 8, 1], ['bedroll', 6, 1],
      ['candle', Infinity, 1], ['mess-kit', 8, 1], ['pot-iron', 4, 1],
      ['gaming-three-dragon-ante', 4, 1], ['gaming-dice', 6, 1], ['pan-flute', 2, 1],
      ['potion-healing', 4, 1], ['healers-kit', 4, 1],
    ],
    fill: { kinds: ['food'], maxCost: 15, count: 10 },
  },
  'sows-foot-market': {
    id: 'sows-foot-market',
    name: "The Sow's Foot Market",
    keeper: 'Brem', npc: 'brem',
    kind: 'exchange', music: 'shop',
    greeting: "No ledger, no receipt, no questions, and no complaints afterwards. You will not find a better price for that than mine, and you will not find anybody else willing to take it.",
    markup: 0.9, buyback: 0.72, restockDays: 4,
    premium: { kinds: ['gem', 'ring', 'amulet', 'material'], mult: 0.85 },
    stock: [
      ['thieves-tools', Infinity, 1], ['forgery-kit', 3, 6], ['poisoners-kit', 3, 7],
      ['disguise-kit', 4, 4], ['manacles', 6, 1], ['lock', 8, 1], ['crowbar', 8, 1],
      ['caltrops', 10, 1], ['ball-bearings', 10, 1], ['magnifying-glass', 2, 3],
      ['poison-basic', 6, 6], ['acid-vial', 8, 1], ['alchemists-fire', 8, 1],
      ['dagger', Infinity, 1], ['shortsword', 8, 1], ['club', 10, 1], ['sling', 8, 1],
      ['hand-crossbow', 3, 8], ['light-crossbow', 5, 1], ['crossbow-bolt', Infinity, 1],
      ['dart', 40, 1], ['sling-bullet', Infinity, 1], ['blowgun', 4, 3], ['blowgun-needle', 80, 3],
      ['leather-armor', 6, 1], ['studded-leather', 4, 1], ['chain-shirt', 3, 3],
      ['burglars-pack', 4, 1], ['rope-silk', 4, 6], ['grappling-hook', 8, 1],
      ['climbers-kit', 4, 2], ['lantern-bullseye', 4, 3], ['chalk', Infinity, 1],
      ['shadowdark-ale', Infinity, 1], ['rations', Infinity, 1], ['trail-bread', Infinity, 1],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 4, 9], ['antitoxin', 8, 1],
      ['dagger-plus1', 2, 10], ['dagger-of-venom', 1, 12], ['dust-of-disappearance', 2, 11],
      ['cloak-of-elvenkind', 1, 12], ['boots-of-elvenkind', 1, 12],
      ['slippers-of-spider-climbing', 1, 13], ['bag-of-holding', 1, 13],
      ['ring-of-mind-shielding', 1, 14], ['cape-of-the-mountebank', 1, 15],
    ],
    fill: { kinds: ['tool', 'gear'], maxCost: 50, count: 24 },
  },
  'twin-songs-shrines': {
    id: 'twin-songs-shrines',
    name: 'The Shrines of Twin Songs',
    keeper: 'Dawnbringer Jhessail Dundragon', npc: 'jhessail-dundragon',
    kind: 'temple', music: 'temple',
    greeting: "Every god is legal in Twin Songs and every one of them has a bowl on this street. Lathander keeps this one. Tell me which of them you need, and I will walk you to the right door.",
    markup: 1, buyback: 0.4, restockDays: 5,
    services: ['heal', 'lesser-restoration', 'remove-curse', 'revivify'],
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 6, 8],
      ['potion-superior-healing', 2, 12], ['antitoxin', Infinity, 1],
      ['holy-water', Infinity, 1], ['healers-kit', Infinity, 1], ['herbalism-kit', 4, 1],
      ['holy-symbol', 8, 1], ['holy-symbol-emblem', 8, 1], ['reliquary', 6, 1],
      ['druidic-focus', 4, 1], ['priests-pack', 5, 1], ['candle', Infinity, 1],
      ['blanket', 8, 1], ['robe', 6, 1], ['book', 4, 1],
      ['scroll-cure-wounds', 6, 1], ['scroll-lesser-restoration', 4, 5],
      ['scroll-revivify', 2, 9], ['scroll-identify', 4, 3],
      ['potion-heroism', 2, 9], ['potion-resistance', 3, 8],
      ['diamond-dust', 6, 6], ['keoghtoms-ointment', 1, 12],
      ['mace', 4, 1], ['shield', 4, 1], ['brooch-of-shielding', 1, 13],
    ],
  },
  'tumbledown-warden': {
    id: 'tumbledown-warden',
    name: "The Gravewarden's Lodge",
    keeper: 'Kosef Shemov', npc: 'kosef-shemov',
    kind: 'general', music: 'town',
    greeting: "Kelemvor's ground and Kelemvor's book. Oil, water, salt, a good shovel. What comes off the dead I am not supposed to sell, and I will thank you to buy it quickly.",
    markup: 1.05, buyback: 0.55, restockDays: 5,
    premium: { kinds: ['gem'], mult: 0.75 },
    stock: [
      ['holy-water', Infinity, 1], ['oil-flask', Infinity, 1], ['torch', Infinity, 1],
      ['lantern-hooded', 5, 1], ['lantern-bullseye', 3, 4], ['tinderbox', Infinity, 1],
      ['shovel', Infinity, 1], ['crowbar', 8, 1], ['pole', 8, 1], ['rope-hempen', Infinity, 1],
      ['spikes-iron', Infinity, 1], ['chalk', Infinity, 1], ['sack', Infinity, 1],
      ['manacles', 4, 1], ['chain', 6, 1], ['bell', 6, 1], ['mirror', 4, 1],
      ['masons-tools', 3, 1], ['healers-kit', 6, 1], ['antitoxin', 8, 1],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 3, 9],
      ['scroll-cure-wounds', 3, 1], ['scroll-identify', 2, 4],
      ['holy-symbol', 4, 1], ['reliquary', 4, 1], ['candle', Infinity, 1],
      ['mace', 4, 1], ['war-pick', 4, 1], ['arrow-silvered', 30, 8],
      // Grave-goods. He knows. Everybody knows.
      ['gem-onyx', 6, 5], ['gem-quartz', 8, 1], ['gem-malachite', 8, 1],
      ['gem-moonstone', 4, 6], ['gem-amber', 2, 9], ['signet-ring', 8, 1],
      ['clothes-fine', 3, 6], ['book', 3, 1],
    ],
    fill: { kinds: ['gear'], maxCost: 25, count: 18 },
  },
  'sharess-caress': {
    id: 'sharess-caress',
    name: "Sharess' Caress",
    keeper: 'Kallista', npc: 'kallista',
    kind: 'inn', music: 'inn',
    greeting: "Welcome to the Caress, and welcome to the bridge — you will find we are much the same thing. Baths on the lower floor, beds on the upper, and everything is negotiable.",
    markup: 1.15, buyback: 0.4, restockDays: 2,
    services: ['room-private', 'room-common', 'meal'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1],
      ['zzar', Infinity, 1], ['luirens-best', 8, 1], ['evermead', 3, 10],
      ['saerloonian-glowfire', 6, 6], ['neverwinter-ale', Infinity, 1],
      ['perfume', 12, 1], ['soap', 12, 1], ['clothes-fine', 6, 1], ['costume', 6, 1],
      ['mirror', 8, 1], ['blanket', 8, 1], ['bedroll', 6, 1], ['candle', Infinity, 1],
      ['gaming-dice', 8, 1], ['gaming-cards', 6, 1], ['gaming-three-dragon-ante', 4, 1],
      ['lute', 2, 1], ['lyre', 2, 1], ['viol', 1, 4], ['entertainers-pack', 3, 1],
      ['disguise-kit', 3, 5], ['potion-healing', 6, 1], ['antitoxin', 6, 1],
      ['potion-heroism', 1, 10],
    ],
    fill: { kinds: ['food'], maxCost: 35, count: 12 },
  },
  'danthelons-dancing-axe': {
    id: 'danthelons-dancing-axe',
    name: "Danthelon's Dancing Axe",
    keeper: 'Danthelon', npc: 'danthelon',
    kind: 'smith', music: 'shop',
    greeting: "DANTHELON'S! Best steel south of the Chionthar, and I will say that as loud as you like! Pick it up! Swing it! You cannot break it and I would love to watch you try!",
    markup: 1.1, buyback: 0.5, restockDays: 4,
    services: ['repair'],
    stock: [
      ['dagger', Infinity, 1], ['handaxe', Infinity, 1], ['battleaxe', 8, 1],
      ['greataxe', 6, 1], ['shortsword', 8, 1], ['longsword', 8, 1], ['greatsword', 5, 1],
      ['scimitar', 6, 1], ['rapier', 5, 1], ['mace', 8, 1], ['warhammer', 8, 1],
      ['maul', 4, 1], ['morningstar', 5, 1], ['flail', 4, 1], ['war-pick', 6, 1],
      ['spear', Infinity, 1], ['javelin', Infinity, 1], ['trident', 5, 1],
      ['halberd', 4, 1], ['glaive', 4, 1], ['pike', 4, 1], ['lance', 2, 8],
      ['quarterstaff', 8, 1], ['club', 8, 1], ['greatclub', 5, 1], ['light-hammer', 8, 1],
      ['sickle', 5, 1], ['whip', 3, 1], ['dart', 40, 1],
      ['shortbow', 5, 1], ['longbow', 4, 1], ['light-crossbow', 5, 1],
      ['heavy-crossbow', 4, 1], ['hand-crossbow', 2, 9], ['sling', 8, 1],
      ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1], ['sling-bullet', Infinity, 1],
      ['arrow-silvered', 40, 8], ['quiver', 8, 1], ['case-crossbow-bolt', 6, 1],
      ['padded-armor', 4, 1], ['leather-armor', 6, 1], ['studded-leather', 5, 1],
      ['hide-armor', 5, 1], ['chain-shirt', 5, 1], ['scale-mail', 5, 1],
      ['ring-mail', 4, 1], ['chain-mail', 4, 1], ['breastplate', 3, 1],
      ['splint-armor', 3, 1], ['half-plate', 2, 1], ['plate-armor', 2, 8],
      ['shield', 10, 1], ['smiths-tools', 3, 1], ['whetstone', 16, 1],
      ['longsword-plus1', 2, 10], ['battleaxe-plus1', 2, 10], ['handaxe-plus1', 2, 9],
      ['warhammer-plus1', 2, 10], ['spear-plus1', 2, 9], ['shortsword-plus1', 2, 10],
      ['shield-plus1', 2, 10], ['leather-armor-plus1', 1, 11], ['scale-mail-plus1', 1, 12],
      ['greataxe-plus2', 1, 14], ['dragon-slayer', 1, 15],
    ],
  },
  'rivington-provisions': {
    id: 'rivington-provisions',
    name: 'Tallstag Provisions',
    keeper: 'Arveene Tallstag', npc: 'arveene-tallstag',
    kind: 'general', music: 'shop',
    greeting: "Grown here, salted here, sold here. The tents on the road get the same price you do — I will not have it said otherwise, and I would rather you did not argue about it.",
    markup: 1, buyback: 0.45, restockDays: 3,
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['goodberry-preserve', Infinity, 1], ['neverwinter-ale', Infinity, 1],
      ['shadowdark-ale', Infinity, 1], ['mess-kit', 10, 1], ['pot-iron', 6, 1],
      ['cooks-utensils', 4, 1], ['blanket', Infinity, 1], ['bedroll', Infinity, 1],
      ['tent', 5, 1], ['sack', Infinity, 1], ['basket', 10, 1], ['bucket', 10, 1],
      ['torch', Infinity, 1], ['candle', Infinity, 1], ['tinderbox', Infinity, 1],
      ['oil-flask', Infinity, 1], ['soap', 12, 1], ['clothes-traveler', 8, 1],
      ['cloak-common', 8, 1], ['rope-hempen', 8, 1], ['hunting-trap', 4, 1],
      ['healers-kit', 8, 1], ['herbalism-kit', 4, 1], ['antitoxin', 8, 1],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 3, 9],
      ['sickle', 6, 1], ['club', 8, 1], ['sling', 6, 1], ['sling-bullet', Infinity, 1],
      ['brewers-supplies', 2, 1], ['carpenters-tools', 2, 1],
    ],
    fill: { kinds: ['food', 'gear'], maxCost: 25, count: 22 },
  },

  // =========================================================================
  // 15d. BALDUR'S GATE — the Lower City and the Upper (CHARTER §1.1–1.2)
  //
  // Inside the walls the markups climb: Heapside prices like the docks, Eastway
  // like a street with money on it, and the Wide like somewhere that knows you
  // have nowhere else to go. The Counting House pays the best rate in the game
  // for gems and worked metal (`premium.mult` 0.98) because that is its whole
  // business, and Sorcerous Sundries is the only real magic shop south of
  // Waterdeep, which is exactly why Rolan can charge what he charges.
  // =========================================================================

  'gray-harbour-chandlery': {
    id: 'gray-harbour-chandlery',
    name: 'The Gray Harbour Chandlery',
    keeper: 'Bran Windrivver', npc: 'bran-windrivver',
    kind: 'general', music: 'shop',
    greeting: "ROPE! OIL! BISCUIT! POWDER AND SHOT IF YOU HAVE THE PAPER FOR IT! — sorry. Sorry. Force of habit. What do you want, friend?",
    markup: 1.05, buyback: 0.5, restockDays: 3,
    services: ['repair'],
    stock: [
      ['rope-hempen', Infinity, 1], ['rope-silk', 6, 6], ['block-and-tackle', 6, 1],
      ['chain', 8, 1], ['grappling-hook', 10, 1], ['net', 8, 1], ['pole', 10, 1],
      ['oil-flask', Infinity, 1], ['torch', Infinity, 1], ['tinderbox', Infinity, 1],
      ['lantern-hooded', 8, 1], ['lantern-bullseye', 5, 4], ['candle', Infinity, 1],
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['whetstone', 10, 1],
      ['sack', Infinity, 1], ['basket', 10, 1], ['bucket', 10, 1], ['chest', 4, 1],
      ['arrow', Infinity, 1], ['crossbow-bolt', Infinity, 1], ['sling-bullet', Infinity, 1],
      ['arrow-silvered', 40, 7], ['blowgun-needle', 80, 3], ['firearm-bullet', 60, 10],
      ['quiver', 8, 1], ['case-crossbow-bolt', 6, 1],
      ['navigators-tools', 4, 3], ['cartographers-tools', 3, 3], ['spyglass', 2, 9],
      ['carpenters-tools', 3, 1], ['leatherworkers-tools', 3, 1], ['smiths-tools', 2, 1],
      ['map', 10, 1], ['case-map-scroll', 6, 1], ['climbers-kit', 5, 2],
      ['healers-kit', 8, 1], ['antitoxin', 8, 1], ['potion-healing', Infinity, 1],
      ['potion-greater-healing', 4, 9], ['potion-water-breathing', 3, 8],
      ['trident', 6, 1], ['spear', 8, 1], ['dagger', Infinity, 1],
      ['mariners-armor', 1, 11], ['folding-boat', 1, 15], ['decanter-of-endless-water', 1, 14],
    ],
    fill: { kinds: ['gear', 'tool'], maxCost: 45, count: 26 },
  },
  'water-queens-house': {
    id: 'water-queens-house',
    name: "The Water Queen's House",
    keeper: 'Mother of Storms Vonda Pisacar', npc: 'vonda-pisacar',
    kind: 'temple', music: 'temple',
    greeting: "Umberlee grants nothing and sells everything, and I am only the hand that takes the coin. Her price is high. It is also the last one you will be offered.",
    markup: 1.35, buyback: 0.35, restockDays: 6,
    services: ['heal', 'lesser-restoration', 'remove-curse', 'revivify'],
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 5, 9],
      ['potion-superior-healing', 3, 12], ['potion-supreme-healing', 1, 14],
      ['antitoxin', Infinity, 1], ['holy-water', Infinity, 1],
      ['potion-water-breathing', 5, 8], ['potion-resistance', 3, 9],
      ['keoghtoms-ointment', 2, 12], ['healers-kit', 8, 1],
      ['holy-symbol', 6, 1], ['reliquary', 5, 1], ['candle', Infinity, 1],
      ['scroll-cure-wounds', 5, 1], ['scroll-lesser-restoration', 4, 6],
      ['scroll-revivify', 3, 9], ['scroll-identify', 3, 4], ['scroll-4', 1, 12],
      ['diamond-dust', 8, 6], ['gem-pearl', 4, 8], ['gem-black-pearl', 2, 12],
      ['trident', 4, 1], ['net', 6, 1], ['robe', 4, 1],
      ['cloak-of-the-manta-ray', 1, 13], ['cap-of-water-breathing', 1, 12],
      ['ring-of-water-walking', 1, 14], ['trident-of-fish-command', 1, 13],
    ],
  },
  'low-lantern': {
    id: 'low-lantern',
    name: 'The Low Lantern',
    keeper: 'Captain Marta Agosto', npc: 'marta-agosto',
    kind: 'inn', music: 'inn',
    greeting: "Three decks, and the further down you go the better the odds get and the worse the company. The house takes its cut on every one of them. Mind the step.",
    markup: 1.2, buyback: 0.62, restockDays: 2,
    services: ['room-common', 'room-private', 'meal'],
    premium: { kinds: ['gem', 'ring', 'amulet'], mult: 0.8 },
    stock: [
      ['shadowdark-ale', Infinity, 1], ['neverwinter-ale', Infinity, 1],
      ['iriaeboran-north-brew', Infinity, 1], ['zzar', Infinity, 1],
      ['luirens-best', 8, 1], ['evermead', 3, 11], ['saerloonian-glowfire', 6, 7],
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1],
      ['gaming-dice', Infinity, 1], ['gaming-cards', Infinity, 1],
      ['gaming-three-dragon-ante', 6, 1], ['gaming-dragonchess', 3, 3],
      ['blanket', 8, 1], ['bedroll', 6, 1], ['candle', Infinity, 1],
      ['dagger', Infinity, 1], ['hand-crossbow', 2, 9], ['thieves-tools', 5, 3],
      ['forgery-kit', 2, 7], ['disguise-kit', 3, 5], ['potion-healing', Infinity, 1],
      ['potion-greater-healing', 4, 9], ['antitoxin', 6, 1], ['poison-basic', 3, 8],
      ['clothes-fine', 4, 6], ['signet-ring', 6, 1], ['gem-quartz', 6, 1],
      ['gem-moonstone', 4, 7], ['gem-onyx', 4, 6], ['gem-pearl', 3, 8],
      ['stone-of-good-luck', 1, 14],
    ],
    fill: { kinds: ['food'], maxCost: 40, count: 12 },
  },
  'counting-house': {
    id: 'counting-house',
    name: 'The Counting House',
    keeper: 'Chief Teller Amafrey Whitburn', npc: 'amafrey-whitburn',
    kind: 'exchange', music: 'shop',
    greeting: "Item, weight, assay, rate, total. In that order, and I do not vary it for anybody. Put it on the cloth and we will both look at it at the same time.",
    markup: 1.2, buyback: 0.6, restockDays: 7,
    services: ['appraise', 'identify'],
    // The best rate in the game for gems, worked metal and jewellery. This is
    // the whole reason to haul a hoard back to Baldur's Gate rather than sell
    // it at the first counter on the road.
    premium: { kinds: ['gem', 'material', 'ring', 'amulet'], mult: 0.98 },
    stock: [
      ['gem-malachite', Infinity, 1], ['gem-quartz', Infinity, 1], ['gem-onyx', 8, 1],
      ['gem-moonstone', 8, 1], ['gem-amber', 6, 5], ['gem-jade', 5, 7],
      ['gem-pearl', 6, 7], ['gem-black-pearl', 3, 10], ['gem-emerald', 2, 12],
      ['gem-ruby', 2, 12], ['gem-diamond', 1, 15], ['diamond-dust', Infinity, 5],
      ['platinum-ingot', 6, 6], ['silver-ore-wave-echo', 4, 5], ['ore-sample-phandalin', 8, 1],
      ['signet-ring', Infinity, 1], ['jewelers-tools', 4, 3], ['abacus', 8, 1],
      ['chest', 6, 1], ['lock', 8, 1], ['manacles', 4, 1], ['ink', 8, 1],
      ['ink-pen', 12, 1], ['parchment', Infinity, 1], ['book', 6, 1],
      ['case-map-scroll', 6, 1], ['clothes-fine', 4, 6], ['magnifying-glass', 6, 3],
      ['scroll-identify', 4, 4], ['sending-stones', 1, 13],
      ['ring-of-mind-shielding', 1, 15], ['amulet-of-proof-against-detection', 1, 15],
    ],
  },
  'bloomridge-market': {
    id: 'bloomridge-market',
    name: 'The Bloomridge Market',
    keeper: 'Esvele Amblecrown', npc: 'esvele-amblecrown',
    kind: 'general', music: 'shop',
    greeting: "Cut this morning, and I will not tell you which garden. Flowers, herbs, honey, and remedies my grandmother swore by — she lived to ninety, so take that how you like.",
    markup: 1.15, buyback: 0.45, restockDays: 2,
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['goodberry-preserve', Infinity, 1],
      ['waterskin', Infinity, 1], ['neverwinter-ale', Infinity, 1], ['zzar', 8, 1],
      ['luirens-best', 6, 1], ['herbalism-kit', Infinity, 1], ['healers-kit', Infinity, 1],
      ['antitoxin', Infinity, 1], ['potion-healing', Infinity, 1],
      ['potion-greater-healing', 5, 9], ['potion-superior-healing', 1, 13],
      ['keoghtoms-ointment', 1, 12], ['potion-animal-friendship', 2, 9],
      ['perfume', Infinity, 1], ['soap', Infinity, 1], ['candle', Infinity, 1],
      ['basket', Infinity, 1], ['bucket', 10, 1], ['jug', 10, 1], ['bottle-glass', 12, 1],
      ['vial', Infinity, 1], ['flask', Infinity, 1], ['mess-kit', 8, 1],
      ['cooks-utensils', 4, 1], ['brewers-supplies', 3, 1], ['alchemists-supplies', 3, 6],
      ['druidic-focus', 4, 1], ['clothes-fine', 3, 6], ['clothes-traveler', 6, 1],
      ['sickle', 6, 1], ['poisoners-kit', 1, 10],
    ],
    fill: { kinds: ['food', 'gear'], maxCost: 30, count: 20 },
  },
  'blushing-mermaid': {
    id: 'blushing-mermaid',
    name: 'The Blushing Mermaid',
    keeper: 'Kethra Buckman', npc: 'kethra-buckman',
    kind: 'inn', music: 'inn',
    greeting: "Beds are upstairs, blood goes outside, and the board by the door is anybody's. Nothing that happens in here surprises me. Nothing ever has.",
    markup: 1.05, buyback: 0.5, restockDays: 2,
    services: ['room-common', 'room-private', 'meal'],
    stock: [
      ['shadowdark-ale', Infinity, 1], ['neverwinter-ale', Infinity, 1],
      ['iriaeboran-north-brew', Infinity, 1], ['zzar', 8, 1], ['luirens-best', 6, 1],
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['bedroll', Infinity, 1], ['blanket', Infinity, 1], ['candle', Infinity, 1],
      ['torch', Infinity, 1], ['oil-flask', Infinity, 1], ['tinderbox', 10, 1],
      ['dagger', Infinity, 1], ['club', 10, 1], ['shortsword', 6, 1],
      ['leather-armor', 5, 1], ['studded-leather', 3, 1],
      ['thieves-tools', 5, 3], ['manacles', 5, 1], ['caltrops', 8, 1],
      ['healers-kit', 8, 1], ['antitoxin', 8, 1], ['potion-healing', Infinity, 1],
      ['potion-greater-healing', 4, 9], ['gaming-dice', Infinity, 1],
      ['gaming-cards', 8, 1], ['lute', 1, 1], ['drum', 2, 1],
      ['explorers-pack', 5, 1], ['dungeoneers-pack', 4, 1], ['burglars-pack', 3, 3],
    ],
    fill: { kinds: ['food', 'gear'], maxCost: 30, count: 18 },
  },
  'high-house-of-wonders': {
    id: 'high-house-of-wonders',
    name: 'The High House of Wonders',
    keeper: 'High Artificer Fonkin Timbers', npc: 'fonkin-timbers',
    kind: 'smith', music: 'shop',
    greeting: "Gond's house! Yes! Come in, mind the escapement, that arm does move — no, it is meant to do that. Now. Tools, steel, alchemy, or something that has not been named yet?",
    markup: 1.2, buyback: 0.55, restockDays: 4,
    services: ['repair', 'identify'],
    stock: [
      ['smiths-tools', Infinity, 1], ['tinkers-tools', Infinity, 1], ['masons-tools', 6, 1],
      ['carpenters-tools', 6, 1], ['jewelers-tools', 4, 3], ['glassblowers-tools', 3, 4],
      ['leatherworkers-tools', 4, 1], ['woodcarvers-tools', 4, 1], ['cobblers-tools', 4, 1],
      ['potters-tools', 4, 1], ['weavers-tools', 4, 1], ['painters-supplies', 4, 1],
      ['calligraphers-supplies', 3, 2], ['cartographers-tools', 4, 3],
      ['navigators-tools', 3, 3], ['artisans-tools', 6, 1], ['alchemists-supplies', 5, 4],
      ['thieves-tools', 6, 3], ['forgery-kit', 2, 7],
      ['hammer', Infinity, 1], ['crowbar', Infinity, 1], ['whetstone', Infinity, 1],
      ['spikes-iron', Infinity, 1], ['piton', Infinity, 1], ['chain', 8, 1],
      ['lock', Infinity, 1], ['manacles', 6, 1], ['chest', 5, 1], ['abacus', 8, 1],
      ['magnifying-glass', 6, 3], ['spyglass', 3, 9], ['mirror', 8, 1],
      ['lantern-hooded', Infinity, 1], ['lantern-bullseye', 8, 4], ['bell', 8, 1],
      ['alchemists-fire', Infinity, 1], ['acid-vial', Infinity, 1], ['oil-flask', Infinity, 1],
      ['caltrops', 10, 1], ['ball-bearings', 10, 1], ['hunting-trap', 6, 1],
      ['ram-portable', 4, 4], ['block-and-tackle', 6, 1], ['ladder', 4, 1],
      ['musket', 1, 12], ['pistol', 2, 11], ['firearm-bullet', 80, 11],
      ['heavy-crossbow', 5, 1], ['hand-crossbow', 3, 8], ['light-crossbow', 6, 1],
      ['crossbow-bolt', Infinity, 1], ['case-crossbow-bolt', 8, 1],
      ['breastplate', 3, 1], ['half-plate', 2, 1], ['splint-armor', 3, 1],
      ['plate-armor', 2, 9], ['shield', 8, 1], ['shield-plus1', 2, 11],
      ['warhammer-plus1', 1, 11], ['quarterstaff-plus1', 1, 10],
      ['driftglobe', 3, 10], ['alchemy-jug', 1, 13], ['chime-of-opening', 1, 15],
      ['lantern-of-revealing', 1, 14], ['immovable-rod', 1, 13], ['wind-fan', 1, 13],
      ['horn-of-blasting', 1, 16],
    ],
  },
  'shrine-of-suffering': {
    id: 'shrine-of-suffering',
    name: 'The Shrine of the Suffering',
    keeper: 'Brother Anton Calabra', npc: 'anton-calabra',
    kind: 'temple', music: 'temple',
    greeting: "Ilmater's house. Sit down; there is a bench and there is always a place on it. Pay what you can. If that is nothing, then it is nothing, and we will not discuss it again.",
    markup: 0.6, buyback: 0.4, restockDays: 4,
    services: ['heal', 'lesser-restoration', 'remove-curse', 'revivify'],
    stock: [
      ['potion-healing', Infinity, 1], ['potion-greater-healing', Infinity, 8],
      ['potion-superior-healing', 2, 12], ['antitoxin', Infinity, 1],
      ['holy-water', Infinity, 1], ['healers-kit', Infinity, 1],
      ['herbalism-kit', Infinity, 1], ['goodberry-preserve', 8, 1],
      ['blanket', Infinity, 1], ['bedroll', Infinity, 1], ['soap', Infinity, 1],
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['candle', Infinity, 1], ['robe', 6, 1], ['holy-symbol', 6, 1],
      ['holy-symbol-emblem', 6, 1], ['priests-pack', 5, 1],
      ['scroll-cure-wounds', Infinity, 1], ['scroll-lesser-restoration', 4, 5],
      ['scroll-revivify', 2, 9], ['diamond-dust', 6, 6],
      ['keoghtoms-ointment', 1, 12], ['periapt-of-wound-closure', 1, 14],
    ],
  },
  'the-undercellar': {
    id: 'the-undercellar',
    name: 'The Undercellar',
    keeper: 'Nal Dumein', npc: 'nal-dumein',
    kind: 'exchange', music: 'shop',
    greeting: "Down here we do not have a name for anything, which saves everybody a great deal of trouble. Show me. Quietly. Oh — oh, that is lovely. Where did you not get that?",
    markup: 1.15, buyback: 0.7, restockDays: 4,
    premium: { kinds: ['gem', 'ring', 'amulet', 'cloak', 'material'], mult: 0.82 },
    stock: [
      ['thieves-tools', Infinity, 1], ['poisoners-kit', 5, 6], ['forgery-kit', 4, 6],
      ['disguise-kit', 5, 4], ['burglars-pack', 5, 1], ['climbers-kit', 6, 2],
      ['rope-silk', 8, 6], ['grappling-hook', Infinity, 1], ['chalk', Infinity, 1],
      ['ball-bearings', Infinity, 1], ['caltrops', Infinity, 1],
      ['poison-basic', 8, 6], ['acid-vial', Infinity, 1], ['alchemists-fire', Infinity, 1],
      ['antitoxin', Infinity, 1], ['potion-healing', Infinity, 1],
      ['potion-greater-healing', 5, 9], ['potion-invisibility', 1, 12],
      ['potion-gaseous-form', 1, 12], ['oil-slipperiness', 1, 12],
      ['dagger', Infinity, 1], ['shortsword', 8, 1], ['rapier', 5, 1],
      ['hand-crossbow', 4, 8], ['blowgun', 6, 1], ['blowgun-needle', Infinity, 1],
      ['crossbow-bolt', Infinity, 1], ['dart', Infinity, 1],
      ['leather-armor', 6, 1], ['studded-leather', 5, 1], ['chain-shirt', 4, 1],
      ['lantern-bullseye', 6, 3], ['manacles', 8, 1], ['lock', 8, 1],
      ['dagger-plus1', 2, 10], ['dagger-of-venom', 2, 12], ['shortsword-plus1', 1, 11],
      ['dust-of-disappearance', 3, 11], ['cloak-of-elvenkind', 2, 12],
      ['boots-of-elvenkind', 2, 12], ['slippers-of-spider-climbing', 1, 13],
      ['ring-of-invisibility', 1, 17], ['cape-of-the-mountebank', 1, 15],
      ['bag-of-holding', 1, 12], ['gem-onyx', 6, 5], ['gem-moonstone', 5, 6],
      ['gem-pearl', 4, 8], ['gem-black-pearl', 2, 12], ['signet-ring', 10, 1],
    ],
  },
  'elfsong-tavern': {
    id: 'elfsong-tavern',
    name: 'The Elfsong Tavern',
    keeper: 'Alan Alyth', npc: 'alan-alyth',
    kind: 'inn', music: 'inn',
    greeting: "Welcome to the Elfsong. The rooms are good, the kitchen is better, and if you hear singing you are not the first and it means you no harm. Please do not ask me about it.",
    markup: 1.15, buyback: 0.45, restockDays: 2,
    services: ['room-private', 'room-common', 'meal', 'repair'],
    stock: [
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['goodberry-preserve', Infinity, 1], ['neverwinter-ale', Infinity, 1],
      ['iriaeboran-north-brew', Infinity, 1], ['zzar', Infinity, 1],
      ['luirens-best', Infinity, 1], ['saerloonian-glowfire', 8, 6], ['evermead', 4, 10],
      ['shadowdark-ale', Infinity, 1], ['blanket', Infinity, 1], ['bedroll', Infinity, 1],
      ['soap', Infinity, 1], ['candle', Infinity, 1], ['mess-kit', 10, 1],
      ['clothes-fine', 5, 5], ['clothes-traveler', 8, 1], ['cloak-common', 8, 1],
      ['lute', 3, 1], ['lyre', 3, 1], ['flute', 4, 1], ['viol', 2, 3],
      ['dulcimer', 2, 3], ['pan-flute', 3, 1], ['entertainers-pack', 4, 1],
      ['diplomats-pack', 3, 4], ['gaming-three-dragon-ante', 5, 1],
      ['gaming-dragonchess', 3, 3], ['gaming-cards', 6, 1], ['gaming-dice', 8, 1],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', 4, 9],
      ['healers-kit', 8, 1], ['book', 4, 1], ['ink', 6, 1], ['parchment', Infinity, 1],
    ],
    fill: { kinds: ['food'], maxCost: 40, count: 14 },
  },
  'sorcerous-sundries': {
    id: 'sorcerous-sundries',
    name: 'Sorcerous Sundries',
    keeper: 'Rolan', npc: 'rolan',
    kind: 'exchange', music: 'shop',
    greeting: "Yes, it is the only real magic shop between here and Waterdeep. No, that is not why the prices are what they are. Tell me what you need and do not touch the upper shelves.",
    markup: 1.4, buyback: 0.5, restockDays: 8,
    services: ['identify'],
    premium: { kinds: ['scroll', 'wand', 'rod', 'gem'], mult: 0.75 },
    stock: [
      // The Coast armory: finite stock, with campaign-level availability.
      ["everburn-blade",1,4], ["gold-wyrmling-staff",1,6], ["sorrow",1,5], ["knife-undermountain-king",1,10], ["flame-tongue-rapier",1,8], ["flame-tongue-scimitar",1,8], ["frost-brand-greatsword",1,12], ["cinderward-ring",1,5],
      ['scroll-cantrip', Infinity, 1], ['scroll-1', Infinity, 3], ['scroll-2', 8, 5],
      ['scroll-3', 6, 7], ['scroll-4', 4, 9], ['scroll-5', 3, 11], ['scroll-6', 2, 13],
      ['scroll-7', 1, 15], ['scroll-8', 1, 17], ['scroll-identify', Infinity, 3],
      ['scroll-magic-missile', 6, 2], ['scroll-fireball', 3, 8],
      ['scroll-cure-wounds', 6, 2], ['scroll-lesser-restoration', 4, 5],
      ['scroll-revivify', 3, 9],
      ['arcane-focus', Infinity, 1], ['component-pouch', Infinity, 1],
      ['crystal', 8, 1], ['orb', 6, 1], ['rod', 6, 1], ['focus-wand', 8, 1],
      ['yew-wand', 6, 1], ['druidic-focus', 5, 1], ['spellbook', 8, 1],
      ['ink', Infinity, 1], ['ink-pen', Infinity, 1], ['parchment', Infinity, 1],
      ['book', 6, 1], ['case-map-scroll', 8, 1], ['vial', Infinity, 1],
      ['diamond-dust', Infinity, 5], ['gem-onyx', 6, 5], ['gem-amber', 4, 7],
      ['gem-moonstone', 6, 5], ['gem-jade', 3, 9], ['gem-pearl', 4, 8],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', Infinity, 8],
      ['potion-superior-healing', 3, 12], ['potion-invisibility', 2, 11],
      ['potion-flying', 1, 13], ['potion-speed', 1, 14], ['potion-mind-reading', 2, 10],
      ['potion-clairvoyance', 1, 12], ['potion-gaseous-form', 2, 12],
      ['potion-resistance', 3, 9], ['potion-heroism', 3, 9],
      ['wand-of-magic-missiles', 2, 11], ['wand-of-magic-detection', 2, 10],
      ['wand-of-secrets', 1, 11], ['wand-of-web', 1, 12], ['wand-of-enemy-detection', 1, 13],
      ['wand-of-the-war-mage-plus1', 1, 12], ['wand-of-fear', 1, 14],
      ['rod-of-the-pact-keeper-plus1', 1, 12], ['rod-of-alertness', 1, 15],
      ['staff-of-defense', 1, 13], ['staff-of-charming', 1, 14],
      ['pearl-of-power', 2, 12], ['bag-of-holding', 2, 11], ['driftglobe', 3, 9],
      ['brooch-of-shielding', 1, 12], ['cloak-of-protection', 1, 13],
      ['ring-of-protection', 1, 15], ['hat-of-wizardry', 1, 12],
      ['circlet-of-blasting', 1, 13], ['robe-of-useful-items', 1, 12],
      ['gloves-of-missile-snaring', 1, 12], ['bracers-of-defense', 1, 14],
      ['helm-of-comprehending-languages', 1, 11], ['medallion-of-thoughts', 1, 13],
      ['crystal-ball', 1, 18],
    ],
  },
  'bg-wide-market': {
    id: 'bg-wide-market',
    name: 'The Wide',
    keeper: 'Aseir Basha', npc: 'aseir-basha',
    kind: 'general', music: 'shop',
    greeting: "The finest stall on the finest square in the finest city on this coast, and I say that having stood in all three. Everything is here. Everything is dear. Both are the point.",
    markup: 1.35, buyback: 0.5, restockDays: 3,
    services: ['repair', 'identify'],
    stock: [
      // The Coast armory: finite stock, with campaign-level availability.
      ["coast-cutlass",4,1], ["harbor-hookglaive",3,2], ["dockside-lash",2,3], ["lamplighters-mace",1,5], ["defender-flail",1,6], ["duelists-wraps",1,6], ["second-wind-draught",8,1], ["clearhead-tonic",6,2],
      ['rations', Infinity, 1], ['trail-bread', Infinity, 1], ['waterskin', Infinity, 1],
      ['torch', Infinity, 1], ['oil-flask', Infinity, 1], ['tinderbox', Infinity, 1],
      ['rope-hempen', Infinity, 1], ['rope-silk', Infinity, 6], ['backpack', Infinity, 1],
      ['bedroll', Infinity, 1], ['blanket', Infinity, 1], ['tent', 6, 1],
      ['lantern-hooded', Infinity, 1], ['lantern-bullseye', 8, 4], ['candle', Infinity, 1],
      ['healers-kit', Infinity, 1], ['herbalism-kit', 6, 1], ['climbers-kit', 6, 2],
      ['explorers-pack', Infinity, 1], ['dungeoneers-pack', Infinity, 1],
      ['scholars-pack', 6, 2], ['diplomats-pack', 5, 4], ['priests-pack', 5, 1],
      ['entertainers-pack', 4, 2], ['burglars-pack', 4, 3],
      ['spyglass', 3, 9], ['magnifying-glass', 6, 3], ['perfume', Infinity, 1],
      ['soap', Infinity, 1], ['clothes-fine', 8, 4], ['clothes-traveler', Infinity, 1],
      ['cloak-common', Infinity, 1], ['signet-ring', Infinity, 1], ['mirror', 8, 1],
      ['jewelers-tools', 4, 3], ['cartographers-tools', 4, 3], ['navigators-tools', 4, 3],
      ['alchemists-supplies', 4, 5], ['thieves-tools', 6, 3], ['disguise-kit', 4, 4],
      ['gaming-three-dragon-ante', 6, 1], ['lute', 3, 1], ['lyre', 3, 1], ['viol', 2, 4],
      ['zzar', Infinity, 1], ['luirens-best', Infinity, 1], ['evermead', 4, 10],
      ['saerloonian-glowfire', 8, 6], ['neverwinter-ale', Infinity, 1],
      ['potion-healing', Infinity, 1], ['potion-greater-healing', Infinity, 8],
      ['potion-superior-healing', 3, 12], ['antitoxin', Infinity, 1],
      ['holy-water', Infinity, 1], ['alchemists-fire', Infinity, 1], ['acid-vial', Infinity, 1],
      ['scroll-1', 6, 3], ['scroll-2', 4, 5], ['scroll-3', 3, 8], ['scroll-identify', 6, 3],
      ['longsword', 8, 1], ['rapier', 6, 1], ['shortsword', 8, 1], ['dagger', Infinity, 1],
      ['longbow', 5, 1], ['heavy-crossbow', 4, 1], ['arrow', Infinity, 1],
      ['crossbow-bolt', Infinity, 1], ['arrow-silvered', 40, 8],
      ['studded-leather', 6, 1], ['chain-shirt', 5, 1], ['breastplate', 3, 1],
      ['half-plate', 2, 1], ['shield', 8, 1],
      ['gem-moonstone', 6, 5], ['gem-onyx', 6, 5], ['gem-amber', 4, 8],
      ['gem-jade', 3, 9], ['gem-pearl', 4, 8], ['diamond-dust', 8, 6],
      ['boots-of-elvenkind', 1, 13], ['cloak-of-protection', 1, 14],
      ['eyes-of-the-eagle', 1, 13], ['gauntlets-of-ogre-power', 1, 14],
    ],
    fill: { kinds: ['gear', 'tool', 'food'], maxCost: 80, count: 34 },
  },
  'unrolling-scroll': {
    id: 'unrolling-scroll',
    name: 'The Unrolling Scroll',
    keeper: 'Loremaster Erdan Galanodel', npc: 'erdan-galanodel',
    kind: 'exchange', music: 'temple',
    greeting: "Oghma's house, and the only shelf in the Upper City where a thing is filed by what it says rather than who wrote it. Ask. It is what the Binder made us for.",
    markup: 1.25, buyback: 0.5, restockDays: 7,
    services: ['identify', 'lesser-restoration'],
    premium: { kinds: ['scroll', 'gear'], mult: 0.72 },
    stock: [
      ['book', Infinity, 1], ['parchment', Infinity, 1], ['paper', Infinity, 1],
      ['ink', Infinity, 1], ['ink-pen', Infinity, 1], ['case-map-scroll', Infinity, 1],
      ['map', Infinity, 1], ['spellbook', 6, 1], ['scholars-pack', 6, 1],
      ['calligraphers-supplies', 4, 2], ['cartographers-tools', 4, 3],
      ['magnifying-glass', 6, 3], ['abacus', 6, 1], ['lamp', 8, 1],
      ['lantern-hooded', 6, 1], ['candle', Infinity, 1], ['robe', 6, 1],
      ['scroll-cantrip', Infinity, 1], ['scroll-1', 8, 3], ['scroll-2', 6, 5],
      ['scroll-3', 4, 7], ['scroll-4', 3, 9], ['scroll-5', 2, 11], ['scroll-6', 1, 13],
      ['scroll-identify', Infinity, 3], ['scroll-cure-wounds', 5, 2],
      ['scroll-lesser-restoration', 4, 5], ['scroll-revivify', 2, 9],
      ['holy-symbol', 5, 1], ['holy-symbol-emblem', 5, 1], ['arcane-focus', 5, 1],
      ['component-pouch', 6, 1], ['crystal', 5, 1], ['orb', 4, 1],
      ['helm-of-comprehending-languages', 1, 12], ['headband-of-intellect', 1, 14],
      ['medallion-of-thoughts', 1, 14], ['tome-of-clear-thought', 1, 17],
      ['pearl-of-power', 1, 13], ['driftglobe', 2, 10],
    ],
  },
  'watch-armoury': {
    id: 'watch-armoury',
    name: 'The Watch Armoury',
    keeper: 'Armiger Delg Ironfist', npc: 'delg-ironfist',
    kind: 'smith', music: 'shop',
    greeting: "Watch pattern. Watch stamp. Watch prices. You would not be standing in this yard without a writ, so I will not ask to see it and you will not make me.",
    markup: 1.15, buyback: 0.5, restockDays: 6,
    services: ['repair'],
    stock: [
      ['longsword', Infinity, 1], ['shortsword', Infinity, 1], ['mace', Infinity, 1],
      ['warhammer', 8, 1], ['spear', Infinity, 1], ['javelin', Infinity, 1],
      ['halberd', 6, 1], ['glaive', 6, 1], ['pike', 6, 1], ['war-pick', 8, 1],
      ['morningstar', 6, 1], ['battleaxe', 8, 1], ['greatsword', 5, 1],
      ['light-crossbow', Infinity, 1], ['heavy-crossbow', 6, 1], ['longbow', 5, 1],
      ['crossbow-bolt', Infinity, 1], ['arrow', Infinity, 1], ['arrow-silvered', 60, 8],
      ['quiver', 10, 1], ['case-crossbow-bolt', 10, 1], ['manacles', Infinity, 1],
      ['chain-shirt', Infinity, 1], ['scale-mail', 8, 1], ['ring-mail', 6, 1],
      ['chain-mail', 6, 1], ['breastplate', 5, 1], ['splint-armor', 4, 1],
      ['half-plate', 3, 1], ['plate-armor', 2, 10], ['shield', Infinity, 1],
      ['studded-leather', 8, 1], ['smiths-tools', 4, 1], ['whetstone', Infinity, 1],
      ['healers-kit', 8, 1], ['potion-healing', Infinity, 1],
      ['potion-greater-healing', 5, 10], ['antitoxin', 8, 1],
      ['longsword-plus1', 3, 11], ['shield-plus1', 3, 11], ['mace-plus1', 2, 11],
      ['spear-plus1', 2, 10], ['chain-mail-plus1', 1, 13], ['breastplate-plus2', 1, 15],
      ['shield-plus2', 1, 15], ['weapon-of-warning', 1, 14],
    ],
  },
});

// ===========================================================================
// 16. HELPERS (pure lookups only)
// ===========================================================================

const KIND_INDEX = (() => {
  const m = {};
  for (const e of ALL) (m[e.kind] ||= []).push(e.id);
  for (const k of Object.keys(m)) Object.freeze(m[k]);
  return Object.freeze(m);
})();

/** Every gear id of a given kind ('weapon', 'armor', 'potion', 'tool', ...). */
export function gearByKind(kind) {
  return (KIND_INDEX[kind] || []).slice();
}

/** Every kind present in this catalogue. */
export function gearKinds() {
  return Object.keys(KIND_INDEX);
}

/** Weapon ids of a category, optionally filtered to one mastery property. */
export function weaponsByCategory(category, mastery = null) {
  return ALL.filter((e) => e.kind === 'weapon' && e.category === category
    && (!mastery || e.mastery === mastery)).map((e) => e.id);
}

/** Armour ids of a category: 'light' | 'medium' | 'heavy' | 'clothing'. */
export function armorByCategory(category) {
  return ALL.filter((e) => e.kind === 'armor' && e.category === category).map((e) => e.id);
}

/** The ammunition item a weapon consumes, or null. */
export function ammoFor(weaponId) {
  const w = GEAR[weaponId];
  return w && w.ammoType ? (AMMO_TYPES[w.ammoType]?.itemId || null) : null;
}

/** Flattened contents of an equipment pack: [[itemId, qty], ...]. */
export function packContents(packId) {
  const p = GEAR[packId];
  return p && p.contents ? p.contents.map((e) => [e[0], e[1]]) : [];
}

/** Shop stock filtered to what a party of this level is allowed to see. */
export function shopStock(shopId, partyLevel = 1) {
  const s = SHOP_TABLES[shopId];
  if (!s) return [];
  return s.stock
    .filter((row) => partyLevel >= (row[2] || 1) && GEAR[row[0]])
    .map((row) => ({ id: row[0], qty: row[1], minLevel: row[2] || 1 }));
}
