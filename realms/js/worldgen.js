// Procedural world generation: continents, climate, rivers, biomes, sites.
'use strict';

const BIOME = {
  DEEP: 0, OCEAN: 1, SHALLOW: 2, BEACH: 3,
  GRASS: 4, FOREST: 5, DENSEFOREST: 6, HILLS: 7,
  MOUNTAIN: 8, SNOWPEAK: 9, TUNDRA: 10, TAIGA: 11,
  SWAMP: 12, DESERT: 13, BADLANDS: 14
};

const BIOME_INFO = [
  { key: 'deep',        name: 'Trackless Sea',  water: true,  fert: 0,    moveCost: 0 },
  { key: 'ocean',       name: 'Open Sea',       water: true,  fert: 0,    moveCost: 0 },
  { key: 'shallow',     name: 'Coastal Waters', water: true,  fert: 0,    moveCost: 0 },
  { key: 'beach',       name: 'Shore',          water: false, fert: 0.25, moveCost: 1.2 },
  { key: 'grass',       name: 'Grasslands',     water: false, fert: 1.0,  moveCost: 1.0 },
  { key: 'forest',      name: 'Woodlands',      water: false, fert: 0.65, moveCost: 1.6 },
  { key: 'denseforest', name: 'Deep Forest',    water: false, fert: 0.45, moveCost: 2.4 },
  { key: 'hills',       name: 'Highlands',      water: false, fert: 0.5,  moveCost: 1.8 },
  { key: 'mountain',    name: 'Mountains',      water: false, fert: 0.15, moveCost: 4.5 },
  { key: 'snowpeak',    name: 'Frozen Peaks',   water: false, fert: 0.02, moveCost: 7 },
  { key: 'tundra',      name: 'Frozen Wastes',  water: false, fert: 0.15, moveCost: 1.6 },
  { key: 'taiga',       name: 'Winterwood',     water: false, fert: 0.35, moveCost: 1.9 },
  { key: 'swamp',       name: 'Mire',           water: false, fert: 0.3,  moveCost: 2.8 },
  { key: 'desert',      name: 'Burning Sands',  water: false, fert: 0.1,  moveCost: 1.7 },
  { key: 'badlands',    name: 'Badlands',       water: false, fert: 0.2,  moveCost: 1.9 }
];

const SITE_TYPES = {
  dragonLair:  { name: 'Dragon Lair',    icon: 'lair' },
  ruin:        { name: 'Ancient Ruins',  icon: 'ruin' },
  wizardTower: { name: 'Wizard Tower',   icon: 'tower' },
  grove:       { name: 'Sacred Grove',   icon: 'grove' },
  mine:        { name: 'Mithral Vein',   icon: 'mine' },
  crypt:       { name: 'Lich Crypt',     icon: 'crypt' },
  portal:      { name: 'Elder Portal',   icon: 'portal' },
  battlefield: { name: 'Old Battlefield', icon: 'ruin' }
};

const RUIN_NAMES = ['Ithkar', 'Uvaeren', 'Ostoria', 'Sarshel', 'Andalbruin', 'Myth Rhynn', 'Delzimmer', 'Oreme', 'Tzindylspar', 'Rulvadar', 'Sess\'kar', 'Olothontor'];
const TOWER_NAMES = ['the Verdigris Spire', 'Manywards Tower', 'the Leaning Athenaeum', 'Sorrowspindle', 'the Glass Bastion', 'Nightspire', 'the Copper Orrery', 'Wyrmward Tower'];
const GROVE_NAMES = ['the Elder Circle', 'Moonshadow Glade', 'the Weeping Oaks', 'Thornheart Grove', 'the Silver Boughs', 'Deepmoss Ring'];
const MINE_NAMES = ['Glimmerdeep', 'the Shining Seam', 'Delvedark Vein', 'the Argent Lode', 'Hoardheart Mine', 'the Star Vein'];
const CRYPT_NAMES = ['the Sunless Barrow', 'Wormbone Crypt', 'the Whispering Vault', 'Duskmarrow Tomb', 'the Pale Sepulcher'];
const PORTAL_NAMES = ['the Yawning Gate', 'the Shimmering Arch', 'the Worldsmouth', 'the Farstep Ring'];

class World {
  constructor(seedStr) {
    this.seedStr = seedStr;
    const seed = hashStringToSeed(seedStr);
    this.rng = new RNG(seed);
    this.W = 176;
    this.H = 120;
    const n = this.W * this.H;
    this.elev = new Float32Array(n);
    this.moist = new Float32Array(n);
    this.temp = new Float32Array(n);
    this.biome = new Uint8Array(n);
    this.river = new Uint8Array(n);        // flow amount 0..255
    this.fert = new Float32Array(n);
    this.nationMap = new Int16Array(n).fill(-1);
    this.settleMap = new Int16Array(n).fill(-1);
    this.urbanMap = new Int16Array(n).fill(-1);     // settlement id whose town sprawls here
    this.industryMap = new Int16Array(n).fill(-1);  // settlement id whose industry works here
    this.roadUse = new Float32Array(n);     // trade traffic → drawn roads
    this.sites = [];
    this.riverPaths = [];
    this.generate(seed);
  }

  idx(x, y) { return y * this.W + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  isWater(i) { return BIOME_INFO[this.biome[i]].water; }
  isLand(i) { return !BIOME_INFO[this.biome[i]].water; }

  generate(seed) {
    const { W, H } = this;
    const elevNoise = new Noise2D(seed ^ 0x1111);
    const moistNoise = new Noise2D(seed ^ 0x2222);
    const warpNoise = new Noise2D(seed ^ 0x3333);
    const detailNoise = new Noise2D(seed ^ 0x4444);

    // --- Elevation: warped fBm shaped into continents with soft edge falloff
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        const nx = x / W, ny = y / H;
        const wx = warpNoise.fbm(nx * 3 + 7, ny * 3, 3) * 0.25;
        const wy = warpNoise.fbm(nx * 3, ny * 3 + 13, 3) * 0.25;
        let e = elevNoise.fbm((nx + wx) * 4.2, (ny + wy) * 4.2, 6);
        e = (e - 0.5) * 1.9 + 0.5;
        // edge falloff (island-ish continents, less harsh on x for a wider landmass)
        const dx = Math.abs(nx - 0.5) * 2, dy = Math.abs(ny - 0.5) * 2;
        const d = Math.pow(Math.max(dx, dy), 3.2);
        e -= d * 0.55;
        // ridge detail for mountain chains
        const r = Math.abs(detailNoise.fbm(nx * 9, ny * 9, 4) - 0.5) * 2;
        e += (1 - r) * 0.16 * Math.max(0, e - 0.5);
        this.elev[i] = e;
      }
    }

    // --- Moisture & temperature
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        this.moist[i] = moistNoise.fbm(x / W * 5 + 31, y / H * 5, 5);
        const lat = y / H; // 0 north (cold) → 1 south (hot)
        const jitter = (detailNoise.at(x / W * 8, y / H * 8) - 0.5) * 0.12;
        this.temp[i] = Math.min(1, Math.max(0, lat * 1.15 - 0.05 + jitter - Math.max(0, this.elev[i] - 0.62) * 1.4));
      }
    }

    this.classify();
    this.carveRivers(seed);
    this.classify(); // re-run: rivers can moisten surroundings into swamp
    this.computeFertility();
    this.placeSites();
  }

  classify() {
    const n = this.W * this.H;
    for (let i = 0; i < n; i++) {
      const e = this.elev[i], m = this.moist[i], t = this.temp[i];
      let b;
      if (e < 0.30) b = BIOME.DEEP;
      else if (e < 0.415) b = BIOME.OCEAN;
      else if (e < 0.45) b = BIOME.SHALLOW;
      else if (e < 0.465) b = BIOME.BEACH;
      else if (e > 0.80) b = t < 0.45 ? BIOME.SNOWPEAK : BIOME.MOUNTAIN;
      else if (e > 0.70) b = BIOME.HILLS;
      else if (t < 0.18) b = m > 0.55 ? BIOME.TAIGA : BIOME.TUNDRA;
      else if (t > 0.78 && m < 0.40) b = e > 0.62 ? BIOME.BADLANDS : BIOME.DESERT;
      else if (m > 0.72 && e < 0.52) b = BIOME.SWAMP;
      else if (m > 0.62) b = BIOME.DENSEFOREST;
      else if (m > 0.48) b = BIOME.FOREST;
      else b = BIOME.GRASS;
      this.biome[i] = b;
    }
    // beaches only next to water
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = this.idx(x, y);
        if (this.biome[i] === BIOME.BEACH && !this.hasWaterNeighbor(x, y)) this.biome[i] = BIOME.GRASS;
      }
    }
  }

  hasWaterNeighbor(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (this.inBounds(x + dx, y + dy) && this.isWater(this.idx(x + dx, y + dy))) return true;
    }
    return false;
  }

  carveRivers(seed) {
    const rng = new RNG(seed ^ 0x5555);
    const { W, H } = this;
    // candidate sources: high land
    const sources = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = this.idx(x, y);
      if (this.elev[i] > 0.68 && this.isLand(i)) sources.push(i);
    }
    rng.shuffle(sources);
    const count = Math.min(26, sources.length);
    for (let s = 0; s < count; s++) {
      let cur = sources[s];
      let x = cur % W, y = Math.floor(cur / W);
      const path = [];
      const seen = new Set();
      let flow = 1;
      for (let step = 0; step < 400; step++) {
        const i = this.idx(x, y);
        if (this.isWater(i)) break;
        path.push(i);
        seen.add(i);
        if (this.river[i] > 0) { // merge into existing river
          for (let k = 0; k < path.length; k++) { /* joined */ }
          break;
        }
        // descend: pick lowest neighbor with meander noise
        let best = -1, bestE = Infinity;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx2 = x + dx, ny2 = y + dy;
          if (!this.inBounds(nx2, ny2)) continue;
          const ni = this.idx(nx2, ny2);
          if (seen.has(ni)) continue;
          const e = this.elev[ni] + rng.float() * 0.015;
          if (e < bestE) { bestE = e; best = ni; }
        }
        if (best < 0) break;
        x = best % W; y = Math.floor(best / W);
        flow = Math.min(flow + 0.35, 8);
      }
      if (path.length > 5) {
        let f = 1;
        for (const i of path) {
          f = Math.min(f + 0.3, 9);
          this.river[i] = Math.min(255, this.river[i] + Math.round(f * 10));
          this.moist[i] = Math.min(1, this.moist[i] + 0.10);
          // moisten banks
          const px = i % W, py = Math.floor(i / W);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (this.inBounds(px + dx, py + dy)) {
              const bi = this.idx(px + dx, py + dy);
              this.moist[bi] = Math.min(1, this.moist[bi] + 0.05);
            }
          }
        }
        this.riverPaths.push(path);
      }
    }
  }

  computeFertility() {
    const { W, H } = this;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        let f = BIOME_INFO[this.biome[i]].fert;
        if (this.river[i] > 0) f += 0.5;
        else {
          // river or coast adjacency bonus
          let nearWater = false, nearRiver = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!this.inBounds(x + dx, y + dy)) continue;
            const ni = this.idx(x + dx, y + dy);
            if (this.river[ni] > 0) nearRiver = true;
            if (this.isWater(ni)) nearWater = true;
          }
          if (nearRiver) f += 0.3;
          if (nearWater) f += 0.25;
        }
        this.fert[i] = f;
      }
    }
  }

  // Fertility of the area around a tile (for settlement placement/growth)
  areaFertility(x, y, r = 2) {
    let sum = 0, cnt = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!this.inBounds(x + dx, y + dy)) continue;
      const i = this.idx(x + dx, y + dy);
      if (this.isLand(i)) { sum += this.fert[i]; cnt++; }
    }
    return cnt ? sum / cnt : 0;
  }

  placeSites() {
    const rng = this.rng;
    const { W, H } = this;
    const usedNames = { ruin: 0, tower: 0, grove: 0, mine: 0, crypt: 0, portal: 0 };
    const taken = [];
    const farFromTaken = (x, y, minD) => taken.every(t => (t.x - x) ** 2 + (t.y - y) ** 2 > minD * minD);

    const tryPlace = (type, biomes, count, minDist, nameArr, nameKey, extra) => {
      let placed = 0, tries = 0;
      while (placed < count && tries < 4000) {
        tries++;
        const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
        const i = this.idx(x, y);
        if (!biomes.includes(this.biome[i])) continue;
        if (!farFromTaken(x, y, minDist)) continue;
        const site = {
          id: this.sites.length, type, x, y,
          name: nameArr ? (nameArr[(usedNames[nameKey]++) % nameArr.length]) : SITE_TYPES[type].name,
          discovered: true, active: true
        };
        if (extra) Object.assign(site, extra(site));
        this.sites.push(site);
        taken.push({ x, y });
        placed++;
      }
    };

    // Dragon lairs: remote wild places; dragon kind depends on terrain
    let lairN = rng.int(4, 6);
    let placedLairs = 0, tries = 0;
    while (placedLairs < lairN && tries < 6000) {
      tries++;
      const x = rng.int(4, W - 5), y = rng.int(4, H - 5);
      const i = this.idx(x, y);
      const b = this.biome[i];
      let kindKey = null;
      if (b === BIOME.MOUNTAIN) kindKey = 'mountain';
      else if (b === BIOME.SNOWPEAK || b === BIOME.TUNDRA) kindKey = 'snow';
      else if (b === BIOME.SWAMP) kindKey = 'swamp';
      else if (b === BIOME.DENSEFOREST) kindKey = 'forest';
      else if (b === BIOME.DESERT || b === BIOME.BADLANDS) kindKey = 'desert';
      if (!kindKey || !farFromTaken(x, y, 18)) continue;
      const dk = DRAGON_KINDS[kindKey];
      const dname = DRAGON_NAMES[placedLairs % DRAGON_NAMES.length];
      this.sites.push({
        id: this.sites.length, type: 'dragonLair', x, y,
        name: 'Lair of ' + dname, discovered: true, active: true,
        dragon: { name: dname, kind: dk.kind, color: dk.color, flavor: dk.flavor, awake: false, hoard: rng.int(200, 900), power: rng.range(0.9, 2.2), slain: false, raidCooldown: rng.int(40, 120) }
      });
      taken.push({ x, y });
      placedLairs++;
    }

    tryPlace('ruin', [BIOME.GRASS, BIOME.FOREST, BIOME.DENSEFOREST, BIOME.HILLS, BIOME.DESERT, BIOME.BADLANDS, BIOME.TUNDRA], rng.int(9, 13), 8,
      RUIN_NAMES.map(n => 'Ruins of ' + n), 'ruin', s => ({ treasure: rng.int(80, 400), danger: rng.range(0.2, 0.9), explored: 0 }));
    tryPlace('wizardTower', [BIOME.GRASS, BIOME.HILLS, BIOME.FOREST, BIOME.BADLANDS], rng.int(2, 4), 22,
      TOWER_NAMES, 'tower', () => ({ arcane: rng.range(0.5, 1.5) }));
    tryPlace('grove', [BIOME.FOREST, BIOME.DENSEFOREST, BIOME.TAIGA], rng.int(3, 5), 14,
      GROVE_NAMES, 'grove', () => ({}));
    tryPlace('mine', [BIOME.MOUNTAIN, BIOME.HILLS], rng.int(4, 6), 12,
      MINE_NAMES, 'mine', () => ({ richness: rng.range(0.5, 1.5), depleted: false }));
    tryPlace('crypt', [BIOME.SWAMP, BIOME.TUNDRA, BIOME.BADLANDS, BIOME.DENSEFOREST], rng.int(2, 3), 20,
      CRYPT_NAMES, 'crypt', () => ({ lichActive: false, sealed: false, stirTimer: rng.int(150, 500) }));
    tryPlace('portal', [BIOME.GRASS, BIOME.HILLS, BIOME.DESERT, BIOME.TUNDRA, BIOME.FOREST], rng.int(1, 2), 30,
      PORTAL_NAMES, 'portal', () => ({ lastPulse: 0 }));
  }
}
