// Industries, resources, disasters, and Town Crier news templates.
'use strict';

// Categories: food (eaten), mat (timber+stone, builds), lux (wine/furs/gems/salt), ore (arms & coin)
const INDUSTRY_TYPES = {
  farm:      { name: 'Farmstead',    icon: '🌾', base: 1.3, cat: 'food' },
  fishery:   { name: 'Fishing Dock', icon: '🐟', base: 1.1, cat: 'food' },
  lumber:    { name: 'Lumber Camp',  icon: '🪓', base: 1.0, cat: 'mat' },
  quarry:    { name: 'Quarry',       icon: '⛏️', base: 0.9, cat: 'mat' },
  mine:      { name: 'Mine',         icon: '⚒️', base: 0.9, cat: 'ore' },
  vineyard:  { name: 'Vineyard',     icon: '🍇', base: 0.8, cat: 'lux' },
  trapper:   { name: 'Trapper Camp', icon: '🦊', base: 0.7, cat: 'lux' },
  herbalist: { name: 'Herbalist',    icon: '🌿', base: 0.6, cat: 'lux' },
  saltworks: { name: 'Saltworks',    icon: '🧂', base: 0.8, cat: 'lux' }
};

// Which industry fits a tile; returns type key or null. `s` is the owning settlement.
function industryForTile(world, i, s) {
  const b = world.biome[i];
  const x = i % world.W, y = (i / world.W) | 0;
  let coastal = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (world.inBounds(x + dx, y + dy)) {
      const nb = world.biome[world.idx(x + dx, y + dy)];
      if (nb === BIOME.SHALLOW || nb === BIOME.OCEAN) coastal = true;
    }
  }
  const warm = world.temp[i] > 0.55;
  const options = [];
  if (coastal && b !== BIOME.SNOWPEAK) options.push('fishery');
  if ((b === BIOME.GRASS || b === BIOME.BEACH) && world.fert[i] > 0.5) options.push('farm');
  if (b === BIOME.GRASS && world.river[i] > 0) options.push('farm');
  if (b === BIOME.FOREST || b === BIOME.DENSEFOREST) options.push('lumber');
  if (b === BIOME.TAIGA) options.push(world.rng ? 'lumber' : 'lumber', 'trapper');
  if (b === BIOME.TUNDRA) options.push('trapper');
  if (b === BIOME.HILLS) options.push(warm && world.fert[i] > 0.45 ? 'vineyard' : 'quarry', 'quarry');
  if (b === BIOME.MOUNTAIN || b === BIOME.SNOWPEAK) options.push('mine');
  if (b === BIOME.SWAMP) options.push('herbalist');
  if (b === BIOME.DESERT || b === BIOME.BADLANDS) options.push('saltworks');
  return options.length ? options : null;
}

const DISASTER_TYPES = {
  fire:     { name: 'Great Fire',  icon: '🔥', god: true },
  flood:    { name: 'Flood',       icon: '🌊', god: true },
  quake:    { name: 'Earthquake',  icon: '🪨', god: true },
  storm:    { name: 'Tempest',     icon: '🌀', god: true },
  drought:  { name: 'Drought',     icon: '☀️', god: true },
  blizzard: { name: 'Blizzard',    icon: '❄️', god: false },
  meteor:   { name: 'Starfall',    icon: '☄️', god: true },
  plague:   { name: 'Plague',      icon: '🦠', god: true }
};

// --- The Town Crier ---
// %s settlement, %n nation, %d deity, %r race plural, %x other settlement
const CRIER_FLUFF = [
  'Goat elected reeve of %s after clerical error; approval soars.',
  'Tavern brawl in %s ends in marriage proposal. Both parties confused but committed.',
  'Turnip shaped exactly like %d draws pilgrims to %s. Priests decline comment.',
  'Bard of %s fined for aggressive lute solos after curfew.',
  'Wizard near %s turns self into newt. Colleagues say he is getting better.',
  '%s pie-eating contest won by same halfling for seventh year. Judges demand inquiry.',
  'Chickens of %s refuse to lay until "conditions improve," says local witch.',
  'Militia of %s drills with brooms after armory key lost. Morale surprisingly high.',
  'Two farmers of %s feud over prize pig; pig flees to %x, seeks asylum.',
  'Gravedigger of %s reports his customers "quieter than usual." Experts relieved.',
  'Merchant of %s sells "authentic dragon teeth." Blacksmith recognizes own nails.',
  'Cow in %s speaks in riddles; druids fascinated, farmer just wants milk.',
  'Apprentice in %s summons 400 frogs instead of familiar. Swamp "delighted."',
  'Innkeeper of %s waters down ale; villagers water down rent.',
  'Street prophet of %s predicts doom for third year running. "Any day now."',
  'Ratcatcher of %s promoted to alderman. Rats reportedly filing appeal.',
  'Baker of %s bakes 12-foot loaf to spite rival in %x. Rival responds with cheese.',
  'Watchman of %s arrests own reflection. Mirror held without bail.',
  'Children of %s claim old well is haunted. Old well claims children are annoying.',
  'Fishwife of %s slaps nobleman with halibut; crowds demand encore.',
  'Sheep of %s form orderly queue at shearing. Shepherd deeply unsettled.',
  'Local %s man insists he saw a beholder. It was a very round owl.',
  'Alchemist of %s invents potion of minor inconvenience. Sales inexplicable.',
  'Pigeon delivers tax notice to wrong barony; war narrowly avoided.',
  'Druid of %s marries an oak. Acorns expected by spring.'
];

const CRIER_TRADE = [
  'Grain prices soar in %s as wagons fail to arrive. Bakers blame everyone.',
  'Glut of fish floods the %s market. Cats declare golden age.',
  'Caravan masters of %s demand hazard pay, citing "an unreasonable number of wolves."',
  '%s dockworkers strike for shorter piers. Negotiations ongoing.',
  'Fur prices tumble in %s; local dandies devastated.',
  'Wine of %s pronounced "technically drinkable" by royal taster. Sales triple.'
];
