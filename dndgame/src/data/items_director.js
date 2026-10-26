// data/items_director.js — the things the world director's work is about: letters to carry, strongboxes to take back, herbs for a fever, a ledger someone would kill to keep.
//
// Merged into data/items.js ITEMS like GEAR and MAGIC_ITEMS. Same shape as
// items_gear.js `mk`. All `kind: 'quest'`, unsellable, so none of them can be
// farmed for coin or mistaken for loot.

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

function mk(id, name, o = {}) {
  const { desc = '', kind = 'quest', cost = 0, weight = 0, rarity = 'common',
    icon = 'bag', tint = '#b3a482', stack = false, sellable = false, ...rest } = o;
  return { id, name, kind, desc, cost, weight, rarity, icon, tint, stack, sellable, ...rest };
}

const ALL = [
  mk('sealed-letter', 'Sealed Letter', { icon: 'scroll', tint: '#d8c9a0', weight: 0,
    desc: 'A folded letter under a plain wax seal with a harp pressed faintly into it. You were asked not to read it, and asked in a way that made it clear someone would know.' }),
  mk('dispatch-case', 'Alliance Dispatch Case', { icon: 'scroll', tint: '#6a8ac8', weight: 1,
    desc: 'A leather tube stamped with the crossed keys of the Lords\' Alliance. Orders, reports, a warrant perhaps. The seal is to be broken by the addressee and nobody else.' }),
  mk('wrapped-parcel', 'Wrapped Parcel', { icon: 'bag', tint: '#8a6a3a', weight: 3,
    desc: 'A heavy parcel in oiled cloth, tied with more knots than it needs. It does not rattle, which is somehow worse.' }),
  mk('medicine-chest', 'Physician\'s Chest', { icon: 'chest', tint: '#c8b28a', weight: 6,
    desc: 'A small iron-cornered chest of bandages, salves, willow bark and stoppered bottles, packed by a priest who expects them all to be used.' }),
  mk('physic-herbs', 'Feverfew and Willow Bark', { icon: 'leaf', tint: '#8fbf5a', weight: 1, stack: true,
    desc: 'A bundle of feverfew, still flowering, and strips of white willow bark. Steeped together they break a fever, and Sister Garaele swears by them for cackle fever.' }),
  mk('greengrass-posies', 'Wild Posies', { icon: 'leaf', tint: '#e08ab0', weight: 0, stack: true,
    desc: 'An armful of wild spring flowers picked well past where the near meadows end. Every sill in town wants some for Greengrass.' }),
  mk('strongbox', 'Iron Strongbox', { icon: 'chest', tint: '#7a7f8a', weight: 12,
    desc: 'A banded iron box with a lock that has been pried at and has held. Whatever it keeps, somebody wants it back badly enough to pay for the carrying.' }),
  mk('silver-strongbox', 'Alliance Silver Strongbox', { icon: 'chest', tint: '#dfe6f0', weight: 20,
    desc: 'An iron strongbox stamped with the crossed keys of the Lords\' Alliance, heavy with assayed Phandalin silver. Every stamp on it will be remembered by somebody.' }),
  mk('stolen-ledger', 'Merchant\'s Second Ledger', { icon: 'book', tint: '#5a4a3a', weight: 2,
    desc: 'The ledger that is not shown to the tax clerks: who was paid, for what, and how much went where it should not have. Several people would be ruined by it.' }),
  mk('zhent-ledger', 'Exchange\'s Other Ledger', { icon: 'book', tint: '#2a2a34', weight: 2,
    desc: 'Black boards, a winged-serpent clasp, and pages of payments in a cipher any Harper could read in an evening. The Miner\'s Exchange would very much like it back.' }),
  mk('shrine-reliquary', 'Shrine Reliquary', { icon: 'holy', tint: '#e3b34a', weight: 3,
    desc: 'A small gilt box, its glass lid cracked, holding a saint\'s knucklebone and a scrap of vestment. It was taken from a shrine by people who did not believe in it.' }),
  mk('family-heirloom', 'Family Heirloom', { icon: 'gem', tint: '#c07af0', weight: 0,
    desc: 'A worn signet brooch with a family\'s mark on it, worth a few gold to a jeweller and everything to the family that lost it.' }),
];

/** Every director quest item, keyed by id and deep frozen. */
export const DIRECTOR_ITEMS = deepFreeze(Object.fromEntries(ALL.map((e) => [e.id, e])));
