// The living world: settlements grow, realms rise, wars rage, faith and magic spread.
'use strict';

const TIERS = [
  { name: 'Thorp', min: 0 },
  { name: 'Hamlet', min: 100 },
  { name: 'Village', min: 400 },
  { name: 'Town', min: 1200 },
  { name: 'Large Town', min: 3000 },
  { name: 'City', min: 7000 },
  { name: 'Large City', min: 15000 },
  { name: 'Metropolis', min: 30000 }
];

const NATION_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d68910', '#16a085',
  '#cb4335', '#5d6d7e', '#af601a', '#884ea0', '#1f618d', '#239b56',
  '#b7950b', '#a04000', '#6c3483', '#148f77', '#922b21', '#2471a3',
  '#9a7d0a', '#717d7e', '#b03a2e', '#7d3c98'
];

const START_YEAR = 1200;

function tierOf(pop) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (pop >= TIERS[i].min) t = i;
  return t;
}

class Sim {
  constructor(world, seedStr) {
    this.world = world;
    this.rng = new RNG(hashStringToSeed(seedStr + ':sim'));
    this.names = new NameGen(this.rng);
    this.tickCount = 0;
    this.settlements = [];
    this.nations = [];
    this.armies = [];
    this.adventurers = [];
    this.hordes = [];
    this.dragonRaids = [];   // in-flight dragon attacks (visual + resolve)
    this.battles = [];       // recent battle markers {x,y,ttl}
    this.routes = [];        // {a,b,path,sea}
    this.wars = [];          // {a,b,score,weariness,holy,startTick}
    this.relations = new Map();
    this.truces = new Map();
    this.events = [];
    this.onEvent = null;
    this.territoryDirty = true;
    this.tradeDirty = true;
    this.plagueActive = false;
    this.stats = { year: START_YEAR, totalPop: 0 };
    this.seedSettlements();
  }

  // ---------- helpers ----------
  dateStr(tick = this.tickCount) {
    const t = tick;
    const year = START_YEAR + Math.floor(t / 36);
    const m = Math.floor((t % 36) / 3);
    const day = (t % 3) * 10 + 3;
    return `${day} ${MONTHS[m]}, ${year} DR`;
  }
  get year() { return START_YEAR + Math.floor(this.tickCount / 36); }

  log(cat, text, x = -1, y = -1) {
    const ev = { tick: this.tickCount, date: this.dateStr(), cat, text, x, y };
    this.events.push(ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    if (this.onEvent) this.onEvent(ev);
  }

  relKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  getRel(a, b) { return this.relations.get(this.relKey(a, b)) ?? 0; }
  setRel(a, b, v) { this.relations.set(this.relKey(a, b), Math.max(-100, Math.min(100, v))); }
  atWar(a, b) { return this.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)); }
  nationOf(s) { return s.nationId >= 0 ? this.nations[s.nationId] : null; }
  livingSettlements() { return this.settlements.filter(s => !s.dead); }

  isPort(x, y) {
    const w = this.world;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (w.inBounds(x + dx, y + dy)) {
        const b = w.biome[w.idx(x + dx, y + dy)];
        if (b === BIOME.SHALLOW || b === BIOME.OCEAN) return true;
      }
    }
    return false;
  }

  raceForSpot(x, y) {
    const w = this.world, b = w.biome[w.idx(x, y)];
    const r = this.rng;
    if (b === BIOME.FOREST || b === BIOME.DENSEFOREST) return r.weighted([['elf', 5], ['human', 3], ['halfling', 1]]);
    if (b === BIOME.MOUNTAIN || b === BIOME.SNOWPEAK) return 'dwarf';
    if (b === BIOME.HILLS) return r.weighted([['dwarf', 4], ['gnome', 3], ['human', 3]]);
    if (b === BIOME.BADLANDS || b === BIOME.DESERT) return r.weighted([['orc', 6], ['human', 2]]);
    if (b === BIOME.TUNDRA || b === BIOME.TAIGA) return r.weighted([['human', 4], ['dwarf', 2], ['orc', 2]]);
    if (b === BIOME.SWAMP) return r.weighted([['human', 3], ['orc', 2]]);
    return r.weighted([['human', 8], ['halfling', 3], ['elf', 1], ['gnome', 1]]);
  }

  pickDeity(settlement) {
    const w = this.world, r = this.rng;
    const b = w.biome[w.idx(settlement.x, settlement.y)];
    const pairs = [];
    for (let i = 0; i < DEITIES.length; i++) {
      const d = DEITIES[i];
      let wgt = 1;
      if (d.races.includes(settlement.race)) wgt += 4;
      if (d.likes.includes('coast') && settlement.port) wgt += 2;
      if (d.likes.includes('grass') && b === BIOME.GRASS) wgt += 2;
      if (d.likes.includes('forest') && (b === BIOME.FOREST || b === BIOME.DENSEFOREST)) wgt += 2;
      if (d.likes.includes('mountain') && (b === BIOME.MOUNTAIN || b === BIOME.HILLS)) wgt += 2;
      if (d.likes.includes('badlands') && (b === BIOME.BADLANDS || b === BIOME.DESERT)) wgt += 2;
      pairs.push([i, wgt]);
    }
    return r.weighted(pairs);
  }

  // ---------- world seeding ----------
  seedSettlements() {
    const w = this.world, r = this.rng;
    const spots = [];
    for (let tries = 0; tries < 9000 && spots.length < 400; tries++) {
      const x = r.int(3, w.W - 4), y = r.int(3, w.H - 4);
      const i = w.idx(x, y);
      if (!w.isLand(i)) continue;
      const b = w.biome[i];
      if (b === BIOME.SNOWPEAK || b === BIOME.MOUNTAIN) continue;
      let score = w.areaFertility(x, y);
      if (w.river[i] > 0) score += 0.35;
      if (this.isPort(x, y)) score += 0.3;
      if (score < 0.6) continue;
      spots.push({ x, y, score });
    }
    spots.sort((a, b) => b.score - a.score);
    const chosen = [];
    for (const s of spots) {
      if (chosen.length >= 15) break;
      if (chosen.every(c => (c.x - s.x) ** 2 + (c.y - s.y) ** 2 > 14 * 14)) chosen.push(s);
    }
    for (const c of chosen) {
      this.foundSettlement(c.x, c.y, this.raceForSpot(c.x, c.y), r.int(80, 350), -1, true);
    }
    this.log('misc', `In the Year of Quiet Roads, ${chosen.length} scattered settlements cling to the wilderness of a young land.`);
  }

  foundSettlement(x, y, race, pop, nationId, silent = false) {
    const w = this.world;
    const s = {
      id: this.settlements.length,
      name: this.names.settlement(race),
      x, y, race, pop,
      nationId,
      deity: -1,
      temple: false, walls: false, mill: false, market: false, mageTower: false,
      port: this.isPort(x, y),
      garrisonBoost: 0,
      plague: 0,
      routes: [],
      dead: false,
      foundedTick: this.tickCount,
      capital: false,
      urban: [],
      industries: [],
      supply: { food: 1, mat: 1, lux: 1, ore: 0 },
      prod: { food: 0, mat: 0, lux: 0, ore: 0 },
      famine: false,
      droughtTtl: 0,
      floodTtl: 0
    };
    s.tier = tierOf(s.pop);
    s.deity = this.pickDeity(s);
    this.settlements.push(s);
    w.settleMap[w.idx(x, y)] = s.id;
    this.updateFootprint(s);
    this.updateIndustries(s);
    this.territoryDirty = true;
    this.tradeDirty = true;
    if (!silent) {
      const founder = nationId >= 0 ? this.nations[nationId].name : `${RACES[race].adj} settlers`;
      this.log('settlement', `⛺ ${s.name} founded by ${founder}.`, x, y);
    }
    return s;
  }

  // ---------- town footprint & industries ----------
  updateFootprint(s) {
    const w = this.world;
    const want = Math.min(26, 1 + Math.floor(s.pop / 650));
    if (s.urban.length === 0) {
      const c = w.idx(s.x, s.y);
      s.urban.push(c);
      w.urbanMap[c] = s.id;
    }
    while (s.urban.length > Math.max(1, want)) {
      const freed = s.urban.pop();
      if (w.urbanMap[freed] === s.id) w.urbanMap[freed] = -1;
    }
    let guard = 0;
    while (s.urban.length < want && guard++ < 60) {
      // grow into the best adjacent land tile
      let best = -1, bestScore = -Infinity;
      for (const u of s.urban) {
        const ux = u % w.W, uy = (u / w.W) | 0;
        for (const [dx, dy] of DIRS8) {
          const nx = ux + dx, ny = uy + dy;
          if (!w.inBounds(nx, ny)) continue;
          const ni = w.idx(nx, ny);
          if (w.urbanMap[ni] >= 0 || w.industryMap[ni] >= 0 || !w.isLand(ni)) continue;
          const b = w.biome[ni];
          if (b === BIOME.SNOWPEAK) continue;
          if (b === BIOME.MOUNTAIN && s.race !== 'dwarf') continue;
          // keep a green belt between neighboring towns
          let foreign = false;
          for (const [gx, gy] of DIRS8) {
            if (!w.inBounds(nx + gx, ny + gy)) continue;
            const oi = w.urbanMap[w.idx(nx + gx, ny + gy)];
            if (oi >= 0 && oi !== s.id) { foreign = true; break; }
          }
          if (foreign) continue;
          const d2 = (nx - s.x) ** 2 + (ny - s.y) ** 2;
          const score = w.fert[ni] - d2 * 0.04 - BIOME_INFO[b].moveCost * 0.12 + tileHash(nx, ny) * 0.15;
          if (score > bestScore) { bestScore = score; best = ni; }
        }
      }
      if (best < 0) break;
      s.urban.push(best);
      w.urbanMap[best] = s.id;
    }
  }

  updateIndustries(s) {
    const w = this.world, r = this.rng;
    const want = Math.min(6, 1 + s.tier);
    s.industries = s.industries.filter(ind => {
      if (w.industryMap[w.idx(ind.x, ind.y)] !== s.id) return false;
      return true;
    });
    if (s.industries.length >= want) return;
    // what does this settlement lack?
    const lack = { food: s.supply.food < 1.05, mat: s.supply.mat < 1.05, lux: s.tier >= 3, ore: true };
    let guard = 0;
    while (s.industries.length < want && guard++ < 40) {
      let best = null, bestScore = 0.1;
      for (let tries = 0; tries < 30; tries++) {
        const ang = r.range(0, Math.PI * 2), dist = r.range(1.5, 5.5);
        const x = Math.round(s.x + Math.cos(ang) * dist), y = Math.round(s.y + Math.sin(ang) * dist);
        if (!w.inBounds(x, y)) continue;
        const i = w.idx(x, y);
        if (!w.isLand(i) || w.urbanMap[i] >= 0 || w.industryMap[i] >= 0 || w.settleMap[i] >= 0) continue;
        const opts = industryForTile(w, i, s);
        if (!opts) continue;
        const type = r.pick(opts);
        const cat = INDUSTRY_TYPES[type].cat;
        let score = 0.3 + (lack[cat] ? 0.8 : 0) + w.fert[i] * 0.3 - dist * 0.05;
        if (s.industries.some(ind => ind.type === type)) score -= 0.25; // variety
        if (score > bestScore) { bestScore = score; best = { type, x, y, i }; }
      }
      if (!best) break;
      w.industryMap[best.i] = s.id;
      s.industries.push({ type: best.type, x: best.x, y: best.y, burnedTtl: 0 });
    }
  }

  removeIndustry(s, ind) {
    const w = this.world;
    const i = w.idx(ind.x, ind.y);
    if (w.industryMap[i] === s.id) w.industryMap[i] = -1;
    s.industries = s.industries.filter(x => x !== ind);
  }

  // ---------- economy: production, needs, trade flows ----------
  economyTick() {
    const w = this.world;
    const live = this.livingSettlements();
    for (const s of live) {
      const prod = { food: 0, mat: 0, lux: 0, ore: 0 };
      const workScale = Math.min(5, 0.5 + s.pop / 2000);
      for (const ind of s.industries) {
        if (ind.burnedTtl > 0) { ind.burnedTtl--; continue; }
        const def = INDUSTRY_TYPES[ind.type];
        let out = def.base * workScale;
        if (ind.type === 'farm') {
          out *= 0.6 + w.fert[w.idx(ind.x, ind.y)] * 0.6;
          if (s.mill) out *= 1.25;
          if (s.droughtTtl > 0) out *= 0.35;
          if (s.floodTtl > 0) out *= 0.5;
        }
        if (ind.type === 'fishery' && s.stormTtl > 0) out *= 0.3;
        prod[def.cat] += out;
      }
      // nearby mithral vein boosts ore & lux
      for (const site of w.sites) {
        if (site.type === 'mine' && !site.depleted && (site.x - s.x) ** 2 + (site.y - s.y) ** 2 < 100) {
          prod.ore += 1.5 * site.richness;
          prod.lux += 0.5 * site.richness;
        }
      }
      s.prod = prod;
      s.needs = {
        food: s.pop / 750,
        mat: s.pop / 2200,
        lux: s.tier >= 4 ? s.pop / 3800 : 0
      };
      s.avail = { food: prod.food, mat: prod.mat, lux: prod.lux, ore: prod.ore };
      if (s.droughtTtl > 0) s.droughtTtl--;
      if (s.floodTtl > 0) s.floodTtl--;
      if (s.stormTtl > 0) s.stormTtl--;
    }
    // trade flows along routes: surplus feeds deficit, gold is taxed
    const sorted = [...this.routes].sort((a, b) => (a.path ? a.path.length : 5) - (b.path ? b.path.length : 5));
    for (const rt of sorted) {
      if (rt.stormTtl > 0) { rt.stormTtl--; continue; }
      const a = this.settlements[rt.a], b = this.settlements[rt.b];
      if (a.dead || b.dead) continue;
      const cap = (rt.sea ? 5 : 3) + (rt.teleport ? 6 : 0);
      rt.flow = 0;
      for (const cat of ['food', 'mat', 'lux']) {
        for (const [from, to] of [[a, b], [b, a]]) {
          const surplus = from.avail[cat] - from.needs[cat] * 1.05;
          const deficit = to.needs[cat] - to.avail[cat];
          if (surplus > 0.1 && deficit > 0.05) {
            const amt = Math.min(surplus * 0.6, deficit, cap);
            from.avail[cat] -= amt;
            to.avail[cat] += amt;
            rt.flow += amt;
            const fn = this.nationOf(from), tn = this.nationOf(to);
            if (fn) fn.gold += amt * 0.35;
            if (tn) tn.gold += amt * 0.1;
          }
        }
      }
    }
    // final supply ratios + famine tracking
    for (const s of live) {
      s.supply = {
        food: s.needs.food > 0.01 ? Math.min(2, s.avail.food / s.needs.food) : 2,
        mat: s.needs.mat > 0.01 ? Math.min(2, s.avail.mat / s.needs.mat) : 2,
        lux: s.needs.lux > 0.01 ? Math.min(2, s.avail.lux / s.needs.lux) : 2,
        ore: s.avail.ore
      };
      const starving = s.supply.food < 0.6 && s.pop > 250;
      if (starving && !s.famine) {
        s.famine = true;
        this.log('trade', `🍞 Famine grips ${s.name}! The granaries are bare and the roads bring nothing.`, s.x, s.y);
        this.pushNews(`Bread riots in ${s.name} as grain wagons fail to arrive. Bakers blame everyone.`);
      } else if (!starving && s.famine) {
        s.famine = false;
        this.log('trade', `🍞 The famine in ${s.name} breaks at last; carts of grain roll through the gates.`, s.x, s.y);
      }
      // ore arms the realm
      const n = this.nationOf(s);
      if (n) n.oreStock = Math.min(60, (n.oreStock || 0) * 0.98 + s.avail.ore * 0.05);
    }
  }

  // ---------- per-tick systems ----------
  tick() {
    this.tickCount++;
    const t = this.tickCount;
    if (t % 4 === 0) this.economyTick();
    this.growSettlements();
    this.disastersTick();
    if (t % 10 === 0) this.newsTick();
    if (t % 3 === 0) this.trySpawnColonies();
    if (t % 2 === 0) this.nationFormation();
    if (t % 4 === 0) this.diplomacy();
    this.warsTick();
    this.armiesTick();
    if (t % 8 === 0) this.religionTick();
    if (t % 6 === 0) this.magicTick();
    this.monstersTick();
    this.adventurersTick();
    this.plagueTick();
    if (t % 30 === 0) this.randomEvents();
    if (this.territoryDirty && t % 6 === 0) this.recomputeTerritory();
    if ((this.tradeDirty && t % 12 === 0) || t % 48 === 0) this.recomputeTrade();
    this.battles = this.battles.filter(b => --b.ttl > 0);
    if (t % 36 === 0) this.yearReport();
  }

  growSettlements() {
    const w = this.world, r = this.rng;
    for (const s of this.livingSettlements()) {
      const race = RACES[s.race];
      const fert = w.areaFertility(s.x, s.y);
      const nation = this.nationOf(s);
      const magicLvl = nation ? nation.magicLevel : 0;
      // capacity: land + supply of building materials + trade + buildings
      let cap = 250 + 3000 * fert;
      cap *= 1 + s.routes.length * 0.18;
      cap *= 0.7 + 0.3 * Math.min(1, s.supply.mat);          // no timber & stone, no growth
      if (s.tier >= 4) cap *= 1 + 0.12 * Math.min(1, s.supply.lux); // luxuries draw the wealthy
      if (s.port) cap *= 1.4;
      if (s.market) cap *= 1.2;
      if (s.capital) cap *= 1.3;
      cap *= 1 + magicLvl * 0.06;
      // nearby grove bonus for elves
      for (const site of w.sites) {
        if (site.active && site.type === 'grove' && s.race === 'elf' && (site.x - s.x) ** 2 + (site.y - s.y) ** 2 < 144) cap *= 1.25;
      }
      let rate = 0.0045 * race.growth * (0.5 + fert * 0.7);
      // the belly rules: fed towns grow, hungry towns wither
      const food = s.supply.food;
      if (food >= 1) rate *= 1 + Math.min(0.15, (food - 1) * 0.15);
      else if (food >= 0.6) rate *= (food - 0.6) / 0.4;
      else rate = -0.012 * (0.6 - food) / 0.6 - 0.004;
      if (s.plague > 0) rate -= 0.03;
      const nAtWar = nation && this.wars.some(wr => wr.a === nation.id || wr.b === nation.id);
      if (nAtWar) rate -= 0.002;
      // logistic growth
      s.pop += s.pop * rate * (rate > 0 ? (1 - s.pop / cap) : 1);
      s.pop = Math.max(5, s.pop);
      // sprawl and industry keep pace (staggered so it's cheap)
      if ((this.tickCount + s.id) % 10 === 0) {
        this.updateFootprint(s);
        this.updateIndustries(s);
      }
      const newTier = tierOf(s.pop);
      if (newTier > s.tier) {
        s.tier = newTier;
        if (newTier >= 2) this.log('settlement', `🏘️ ${s.name} has grown into a ${TIERS[newTier].name.toLowerCase()} (${Math.round(s.pop).toLocaleString()} souls).`, s.x, s.y);
        this.territoryDirty = true;
        this.tradeDirty = true;
      } else if (newTier < s.tier) {
        s.tier = newTier;
      }
      // construction
      if (!s.temple && s.tier >= 2 && r.chance(0.02)) {
        s.temple = true;
        const d = DEITIES[s.deity];
        this.log('religion', `⛪ A temple to ${d.name}, ${d.title}, is consecrated in ${s.name}.`, s.x, s.y);
      }
      if (!s.mill && s.tier >= 2 && fert > 0.7 && r.chance(0.025)) s.mill = true;
      if (!s.market && s.tier >= 3 && s.routes.length >= 2 && r.chance(0.02)) {
        s.market = true;
        this.log('trade', `🪙 A grand market opens in ${s.name}; caravans crowd its gates.`, s.x, s.y);
      }
      if (!s.walls && s.tier >= 3 && r.chance(0.015)) {
        s.walls = true;
        this.log('settlement', `🧱 ${s.name} raises stone walls against the perils of the wild.`, s.x, s.y);
      }
      if (!s.mageTower && s.tier >= 5 && r.chance(0.008)) {
        s.mageTower = true;
        this.log('magic', `🔮 A wizards' guild raises its tower over ${s.name}.`, s.x, s.y);
      }
    }
  }

  trySpawnColonies() {
    const w = this.world, r = this.rng;
    for (const s of this.livingSettlements()) {
      if (s.pop < 800 || !r.chance(0.03)) continue;
      // find a spot: ring 6..15 away, unclaimed, decent fertility
      let best = null, bestScore = 0.55;
      for (let tries = 0; tries < 25; tries++) {
        const ang = r.range(0, Math.PI * 2), dist = r.range(6, 15);
        const x = Math.round(s.x + Math.cos(ang) * dist), y = Math.round(s.y + Math.sin(ang) * dist);
        if (!w.inBounds(x, y)) continue;
        const i = w.idx(x, y);
        if (!w.isLand(i) || w.settleMap[i] >= 0) continue;
        const b = w.biome[i];
        if (b === BIOME.SNOWPEAK) continue;
        if (b === BIOME.MOUNTAIN && s.race !== 'dwarf') continue;
        // not too close to others
        let tooClose = false;
        for (const o of this.livingSettlements()) {
          if ((o.x - x) ** 2 + (o.y - y) ** 2 < 36) { tooClose = true; break; }
        }
        if (tooClose) continue;
        let score = w.areaFertility(x, y) * (RACES[s.race].terrain[BIOME_INFO[b].key] || 0.8);
        if (s.race === 'dwarf') {
          for (const site of w.sites) if (site.type === 'mine' && !site.depleted && (site.x - x) ** 2 + (site.y - y) ** 2 < 64) score += 0.6;
        }
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
      if (best) {
        const pop = Math.round(s.pop * r.range(0.04, 0.08));
        s.pop -= pop;
        const c = this.foundSettlement(best.x, best.y, s.race, pop, s.nationId, true);
        this.log('settlement', `⛺ Settlers from ${s.name} strike out and found ${c.name}.`, best.x, best.y);
      }
    }
  }

  nationFormation() {
    const r = this.rng;
    for (const s of this.livingSettlements()) {
      if (s.nationId >= 0 || s.pop < 1200) continue;
      if (this.nations.length >= NATION_COLORS.length) break;
      const id = this.nations.length;
      const nation = {
        id,
        name: this.names.nation(s.race, s.name),
        race: s.race,
        color: NATION_COLORS[id % NATION_COLORS.length],
        capitalId: s.id,
        personality: r.pick(PERSONALITIES),
        ruler: this.names.ruler(s.race),
        gold: 50,
        arcane: 0,
        magicLevel: 0,
        stateDeity: s.deity,
        armyCooldown: 0,
        dead: false,
        foundedTick: this.tickCount
      };
      this.nations.push(nation);
      s.nationId = id;
      s.capital = true;
      this.log('nation', `👑 ${nation.name} is proclaimed! ${nation.ruler} rules from ${s.name}. (${nation.personality.name})`, s.x, s.y);
      // nearby independent settlements of same race may join
      for (const o of this.livingSettlements()) {
        if (o.nationId >= 0 || o.id === s.id) continue;
        const d2 = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
        if (d2 < 20 * 20 && (o.race === s.race ? r.chance(0.8) : r.chance(0.25))) {
          o.nationId = id;
        }
      }
      this.territoryDirty = true;
    }
    // small independents near a nation get absorbed peacefully over time
    for (const s of this.livingSettlements()) {
      if (s.nationId >= 0 || s.pop > 900 || !r.chance(0.02)) continue;
      let nearest = null, nd = 15 * 15;
      for (const o of this.livingSettlements()) {
        if (o.nationId < 0) continue;
        const d2 = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
        if (d2 < nd) { nd = d2; nearest = o; }
      }
      if (nearest && (nearest.race === s.race || r.chance(0.3))) {
        s.nationId = nearest.nationId;
        this.log('nation', `🤝 ${s.name} swears fealty to ${this.nations[s.nationId].name}.`, s.x, s.y);
        this.territoryDirty = true;
      }
    }
  }

  livingNations() { return this.nations.filter(n => !n.dead); }
  nationSettlements(id) { return this.settlements.filter(s => !s.dead && s.nationId === id); }
  nationPop(id) { return this.nationSettlements(id).reduce((a, s) => a + s.pop, 0); }

  diplomacy() {
    const r = this.rng;
    const nations = this.livingNations();
    for (let i = 0; i < nations.length; i++) {
      for (let j = i + 1; j < nations.length; j++) {
        const a = nations[i], b = nations[j];
        const key = this.relKey(a.id, b.id);
        let rel = this.relations.get(key) ?? 0;
        let drift = 0.3; // slow reversion to neutral-friendly
        if (rel > 0) drift = -0.1;
        if (a.race === b.race) drift += 0.15;
        if (a.stateDeity === b.stateDeity) drift += 0.2;
        else if (a.personality.key === 'zealous' || b.personality.key === 'zealous') drift -= 0.7;
        if (a.personality.key === 'aggressive' || b.personality.key === 'aggressive') drift -= 0.55;
        if ((a.race === 'orc') !== (b.race === 'orc')) drift -= 0.8;
        // trade between them
        const trades = this.routes.some(rt => {
          const sa = this.settlements[rt.a], sb = this.settlements[rt.b];
          return (sa.nationId === a.id && sb.nationId === b.id) || (sa.nationId === b.id && sb.nationId === a.id);
        });
        if (trades) drift += 0.5;
        // border friction
        const friction = this.borderFriction?.[this.relKey(a.id, b.id)] || 0;
        drift -= Math.min(1.2, friction * 0.012);
        rel = Math.max(-100, Math.min(100, rel + drift + r.range(-0.4, 0.4)));
        this.relations.set(key, rel);

        // declare war?
        if (rel < -55 && !this.atWar(a.id, b.id) && (this.truces.get(key) || 0) < this.tickCount) {
          const agg = a.personality.key === 'aggressive' ? a : b.personality.key === 'aggressive' ? b : (r.chance(0.5) ? a : b);
          const def = agg === a ? b : a;
          const holy = (agg.personality.key === 'zealous' && agg.stateDeity !== def.stateDeity);
          const oddsOk = this.nationPop(agg.id) > this.nationPop(def.id) * 0.5;
          if ((friction > 5 || holy || r.chance(0.25)) && oddsOk && r.chance(0.35)) {
            this.wars.push({ a: agg.id, b: def.id, score: 0, weariness: 0, holy, startTick: this.tickCount });
            const why = holy ? `a holy war in the name of ${DEITIES[agg.stateDeity].name}` : 'war over land and grievance';
            this.log('war', `⚔️ ${agg.name} declares ${why} upon ${def.name}!`, this.settlements[agg.capitalId].x, this.settlements[agg.capitalId].y);
            this.tradeDirty = true;
          }
        }
      }
    }
  }

  warsTick() {
    const r = this.rng;
    for (const w of [...this.wars]) {
      w.weariness += 0.15 + Math.abs(w.score) * 0.002;
      const a = this.nations[w.a], b = this.nations[w.b];
      if (a.dead || b.dead || w.weariness > r.range(55, 110)) {
        this.endWar(w, a.dead ? w.b : b.dead ? w.a : (w.score > 10 ? w.a : w.score < -10 ? w.b : -1));
      }
    }
  }

  endWar(war, victorId) {
    this.wars = this.wars.filter(x => x !== war);
    const a = this.nations[war.a], b = this.nations[war.b];
    const key = this.relKey(war.a, war.b);
    this.truces.set(key, this.tickCount + 36 * this.rng.int(4, 10));
    this.setRel(war.a, war.b, -15);
    if (victorId >= 0 && !this.nations[victorId].dead) {
      const v = this.nations[victorId], l = victorId === war.a ? b : a;
      this.log('war', `🕊️ Peace: ${v.name} triumphs over ${l.name}; envoys sign the treaty under truce banners.`);
    } else if (!a.dead && !b.dead) {
      this.log('war', `🕊️ ${a.name} and ${b.name} sign a weary peace; nothing is settled.`);
    }
    // disband war armies
    for (const ar of this.armies) {
      if ((ar.nationId === war.a || ar.nationId === war.b) && ar.mission === 'attack') ar.done = true;
    }
    this.tradeDirty = true;
  }

  armiesTick() {
    const r = this.rng, w = this.world;
    // raise armies
    for (const war of this.wars) {
      for (const nid of [war.a, war.b]) {
        const n = this.nations[nid];
        if (n.dead || n.armyCooldown-- > 0) continue;
        const myArmies = this.armies.filter(ar => ar.nationId === nid && !ar.done);
        if (myArmies.length >= 2 + Math.floor(this.nationPop(nid) / 9000)) continue;
        const pop = this.nationPop(nid);
        if (pop < 1500 || n.gold < 40) continue;
        n.gold -= 40;
        n.armyCooldown = r.int(6, 14);
        const home = this.settlements[n.capitalId];
        if (!home || home.dead) continue;
        const enemyId = nid === war.a ? war.b : war.a;
        const targets = this.nationSettlements(enemyId);
        if (!targets.length) continue;
        targets.sort((s1, s2) => ((s1.x - home.x) ** 2 + (s1.y - home.y) ** 2) - ((s2.x - home.x) ** 2 + (s2.y - home.y) ** 2));
        const target = r.chance(0.75) ? targets[0] : r.pick(targets);
        const path = findPath(w, home.x, home.y, target.x, target.y, 'land');
        if (!path) continue;
        const str = Math.min(600, 60 + pop / 28) * (1 + n.magicLevel * 0.08) * r.range(0.85, 1.15);
        this.armies.push({
          id: this.armies.length + this.tickCount * 1000,
          nationId: nid, x: home.x, y: home.y,
          strength: str, path, pathPos: 0,
          targetId: target.id, mission: 'attack', done: false
        });
      }
    }
    // defensive armies vs hordes
    for (const h of this.hordes) {
      if (h.dead) continue;
      const i = w.idx(Math.round(h.x), Math.round(h.y));
      const nid = w.nationMap[i];
      if (nid >= 0 && !this.nations[nid].dead && r.chance(0.15)) {
        const already = this.armies.some(ar => !ar.done && ar.nationId === nid && ar.mission === 'hunt' && ar.huntId === h.id);
        if (!already && this.nations[nid].gold >= 25) {
          const n = this.nations[nid];
          const home = this.settlements[n.capitalId];
          if (home && !home.dead) {
            n.gold -= 25;
            const path = findPath(w, home.x, home.y, Math.round(h.x), Math.round(h.y), 'land');
            if (path) {
              this.armies.push({
                id: this.armies.length + this.tickCount * 1000,
                nationId: nid, x: home.x, y: home.y,
                strength: Math.min(500, 50 + this.nationPop(nid) / 35),
                path, pathPos: 0, mission: 'hunt', huntId: h.id, done: false
              });
            }
          }
        }
      }
    }
    // move & fight
    for (const ar of this.armies) {
      if (ar.done) continue;
      const speed = 2;
      for (let step = 0; step < speed && ar.pathPos < ar.path.length - 1; step++) {
        ar.pathPos++;
        const i = ar.path[ar.pathPos];
        ar.x = i % w.W; ar.y = (i / w.W) | 0;
      }
      if (ar.mission === 'hunt') {
        const h = this.hordes.find(h2 => h2.id === ar.huntId);
        if (!h || h.dead) { ar.done = true; continue; }
        const d2 = (h.x - ar.x) ** 2 + (h.y - ar.y) ** 2;
        if (d2 < 4) {
          // field battle vs horde
          const n = this.nations[ar.nationId];
          const roll = ar.strength * r.range(0.7, 1.3) - h.strength * r.range(0.7, 1.3);
          this.battles.push({ x: h.x, y: h.y, ttl: 14 });
          if (roll > 0) {
            h.dead = true;
            ar.strength *= 0.75;
            ar.done = true;
            this.log('monster', `🛡️ The banners of ${n.name} break the ${h.name} in open battle!`, h.x, h.y);
          } else {
            ar.done = true;
            h.strength *= 0.8;
            this.log('monster', `💀 An army of ${n.name} is slaughtered by the ${h.name}.`, h.x, h.y);
          }
        } else if (ar.pathPos >= ar.path.length - 1) {
          // re-path toward moving horde
          const path = findPath(w, Math.round(ar.x), Math.round(ar.y), Math.round(h.x), Math.round(h.y), 'land');
          if (path) { ar.path = path; ar.pathPos = 0; } else ar.done = true;
        }
        continue;
      }
      // attack mission
      const target = this.settlements[ar.targetId];
      if (!target || target.dead || target.nationId === ar.nationId) { ar.done = true; continue; }
      if (!this.atWar(ar.nationId, target.nationId)) { ar.done = true; continue; }
      if (ar.pathPos >= ar.path.length - 1) {
        this.resolveSiege(ar, target);
      } else {
        // meet enemy army en route?
        for (const other of this.armies) {
          if (other === ar || other.done) continue;
          if (!this.atWar(ar.nationId, other.nationId)) continue;
          const d2 = (other.x - ar.x) ** 2 + (other.y - ar.y) ** 2;
          if (d2 <= 2) {
            const rollA = ar.strength * r.range(0.75, 1.25);
            const rollB = other.strength * r.range(0.75, 1.25);
            this.battles.push({ x: ar.x, y: ar.y, ttl: 14 });
            const na = this.nations[ar.nationId], nb = this.nations[other.nationId];
            if (rollA > rollB) {
              other.done = true; ar.strength *= 0.7;
              this.adjustWarScore(ar.nationId, other.nationId, 6);
              this.log('war', `⚔️ Armies clash in the field — ${na.name} routs the host of ${nb.name}!`, ar.x, ar.y);
            } else {
              ar.done = true; other.strength *= 0.7;
              this.adjustWarScore(other.nationId, ar.nationId, 6);
              this.log('war', `⚔️ Armies clash in the field — ${nb.name} routs the host of ${na.name}!`, ar.x, ar.y);
            }
            break;
          }
        }
      }
    }
    this.armies = this.armies.filter(a => !a.done);
  }

  adjustWarScore(winnerId, loserId, amt) {
    for (const w of this.wars) {
      if (w.a === winnerId && w.b === loserId) w.score += amt;
      else if (w.a === loserId && w.b === winnerId) w.score -= amt;
    }
  }

  resolveSiege(army, target) {
    const r = this.rng;
    const defNation = this.nationOf(target);
    let garrison = target.pop / 14;
    if (target.walls) garrison *= 1.7;
    if (target.capital) garrison *= 1.25;
    if (defNation) garrison *= 1 + defNation.magicLevel * 0.08;
    const atk = army.strength * r.range(0.75, 1.25);
    const def = garrison * r.range(0.75, 1.25);
    this.battles.push({ x: target.x, y: target.y, ttl: 16 });
    const attacker = this.nations[army.nationId];
    if (atk > def) {
      army.strength *= 0.6;
      target.pop *= r.range(0.78, 0.9);
      const oldNationId = target.nationId;
      if (target.tier <= 1 && r.chance(0.4)) {
        this.razeSettlement(target, `put to the torch by the armies of ${attacker.name}`);
      } else {
        target.nationId = army.nationId;
        if (target.capital) target.capital = false;
        this.log('war', `🔥 ${target.name} falls! The banners of ${attacker.name} fly over its gates.`, target.x, target.y);
      }
      this.adjustWarScore(army.nationId, oldNationId, 12);
      army.done = true;
      this.territoryDirty = true;
      this.tradeDirty = true;
      // did the loser lose their capital / everything?
      if (oldNationId >= 0) this.checkNationCollapse(oldNationId);
    } else {
      army.done = true;
      this.adjustWarScore(target.nationId, army.nationId, 8);
      this.log('war', `🛡️ ${target.name} holds! The siege by ${attacker.name} is broken at the walls.`, target.x, target.y);
    }
  }

  checkNationCollapse(nid) {
    const n = this.nations[nid];
    if (n.dead) return;
    const mine = this.nationSettlements(nid);
    if (mine.length === 0) {
      n.dead = true;
      this.log('nation', `🏴 ${n.name} is no more; its lands are divided among the victors.`);
      for (const w of [...this.wars]) if (w.a === nid || w.b === nid) this.endWar(w, w.a === nid ? w.b : w.a);
      return;
    }
    const capital = this.settlements[n.capitalId];
    if (!capital || capital.dead || capital.nationId !== nid) {
      // crown a new capital
      mine.sort((a, b) => b.pop - a.pop);
      n.capitalId = mine[0].id;
      mine[0].capital = true;
      this.log('nation', `👑 The court of ${n.name} flees to ${mine[0].name}.`, mine[0].x, mine[0].y);
    }
  }

  razeSettlement(s, reason) {
    const w = this.world;
    s.dead = true;
    s.pop = 0;
    w.settleMap[w.idx(s.x, s.y)] = -1;
    for (const u of s.urban) if (w.urbanMap[u] === s.id) w.urbanMap[u] = -1;
    for (const ind of s.industries) {
      const i = w.idx(ind.x, ind.y);
      if (w.industryMap[i] === s.id) w.industryMap[i] = -1;
    }
    s.urban = [];
    s.industries = [];
    // leave a battlefield ruin
    w.sites.push({
      id: w.sites.length, type: 'battlefield', x: s.x, y: s.y,
      name: 'Ruins of ' + s.name, discovered: true, active: true,
      treasure: this.rng.int(30, 150), danger: 0.4, explored: 0
    });
    this.log('war', `🔥 ${s.name} is ${reason}. Only ashes remain.`, s.x, s.y);
    this.territoryDirty = true;
    this.tradeDirty = true;
  }

  // ---------- religion & magic ----------
  religionTick() {
    const r = this.rng;
    // faith spreads along trade routes (larger, temple-having settlements convert partners)
    for (const rt of this.routes) {
      const a = this.settlements[rt.a], b = this.settlements[rt.b];
      if (a.dead || b.dead || a.deity === b.deity) continue;
      const big = a.pop > b.pop ? a : b, small = big === a ? b : a;
      if ((small.faithCooldown || 0) > this.tickCount) continue;
      let p = 0.02 + (big.temple ? 0.03 : 0);
      if (small.temple) p *= 0.4;
      const bigNation = this.nationOf(big);
      if (bigNation && bigNation.personality.key === 'zealous') p *= 2;
      if (r.chance(p)) {
        small.faithCooldown = this.tickCount + 72; // ~2 years before another turning
        const od = DEITIES[small.deity], nd = DEITIES[big.deity];
        small.deity = big.deity;
        small.temple = false; // must rebuild for the new faith
        this.log('religion', `🕯️ ${small.name} turns from ${od.name} to the worship of ${nd.name}.`, small.x, small.y);
      }
    }
    // zealous nations push the state faith
    for (const n of this.livingNations()) {
      const cap = this.settlements[n.capitalId];
      if (cap && !cap.dead) n.stateDeity = cap.deity;
      if (n.personality.key !== 'zealous') continue;
      for (const s of this.nationSettlements(n.id)) {
        if (s.deity !== n.stateDeity && r.chance(0.06)) {
          s.deity = n.stateDeity;
          s.temple = false;
        }
      }
    }
  }

  magicTick() {
    const r = this.rng, w = this.world;
    const thresholds = [90, 280, 800, 2200, 6000];
    for (const n of this.livingNations()) {
      const mine = this.nationSettlements(n.id);
      let gain = 0.3;
      for (const s of mine) {
        if (s.mageTower) gain += 0.8;
        if (s.tier >= 5) gain += 0.3;
      }
      // wizard towers in territory
      for (const site of w.sites) {
        if (site.type === 'wizardTower' && site.active) {
          const i = w.idx(site.x, site.y);
          if (w.nationMap[i] === n.id) gain += site.arcane;
        }
      }
      if (n.personality.key === 'scholarly') gain *= 1.8;
      if (n.race === 'elf' || n.race === 'gnome') gain *= 1.3;
      if (n.race === 'orc') gain *= 0.4;
      n.arcane += gain;
      if (n.magicLevel < 5 && n.arcane > thresholds[n.magicLevel]) {
        n.magicLevel++;
        const lvl = MAGIC_LEVELS[n.magicLevel];
        this.log('magic', `✨ ${n.name} attains ${lvl.name} — ${lvl.desc.toLowerCase()}.`);
        if (n.magicLevel === 4) {
          this.log('magic', `🌀 Teleportation circles now bind the great cities of ${n.name}; distance means little to its merchants.`);
        }
      }
      // wild magic surge
      if (n.magicLevel >= 3 && r.chance(0.004)) {
        const victim = r.pick(mine.filter(s => s.mageTower)) || r.pick(mine);
        if (victim) {
          victim.pop *= 0.93;
          this.log('magic', `⚡ A wild magic surge wracks ${victim.name}! Strange lights, stranger losses.`, victim.x, victim.y);
        }
      }
      // gold income
      for (const s of mine) {
        n.gold += (s.pop / 1200) * (1 + s.routes.length * 0.25) * (s.market ? 1.4 : 1);
      }
      n.gold = Math.min(n.gold, 3000);
    }
  }

  // ---------- monsters, sites, adventurers ----------
  monstersTick() {
    const r = this.rng, w = this.world;
    // dragons
    for (const site of w.sites) {
      if (site.type !== 'dragonLair') continue;
      const d = site.dragon;
      if (d.slain) {
        // decades later, a young wyrm may claim the empty lair
        if (this.tickCount - (d.slainTick || 0) > 400 && r.chance(0.0015)) {
          const newName = r.pick(DRAGON_NAMES);
          Object.assign(d, { name: newName, awake: false, hoard: r.int(100, 300), power: r.range(0.8, 1.5), slain: false, raidCooldown: r.int(60, 150) });
          site.name = 'Lair of ' + newName;
          site.active = true;
          this.log('monster', `🐉 A young wyrm claims the old lair — shepherds name it ${newName}, and bar their doors.`, site.x, site.y);
        }
        continue;
      }
      if (--d.raidCooldown <= 0) {
        // find a rich target
        let best = null, bestVal = 400;
        for (const s of this.livingSettlements()) {
          const d2 = (s.x - site.x) ** 2 + (s.y - site.y) ** 2;
          if (d2 > 34 * 34) continue;
          if (s.pop > bestVal) { bestVal = s.pop; best = s; }
        }
        if (best) {
          d.awake = true;
          this.dragonRaids.push({ siteId: site.id, targetId: best.id, progress: 0, returning: false });
          this.log('monster', `🐉 ${d.name}, ${d.flavor}, takes wing from ${site.name}!`, site.x, site.y);
          d.raidCooldown = r.int(70, 200);
        } else {
          d.raidCooldown = r.int(30, 60);
        }
      }
    }
    // in-flight dragon raids
    for (const raid of this.dragonRaids) {
      raid.progress += 0.12;
      if (raid.progress >= 1) {
        const site = w.sites[raid.siteId];
        const target = this.settlements[raid.targetId];
        if (!raid.returning) {
          raid.returning = true;
          raid.progress = 0;
          if (target && !target.dead) {
            const d = site.dragon;
            const loss = target.pop * r.range(0.08, 0.18);
            target.pop -= loss;
            const loot = r.int(50, 250);
            d.hoard += loot;
            this.battles.push({ x: target.x, y: target.y, ttl: 16 });
            this.log('monster', `🔥 ${d.name} burns ${target.name}! ${Math.round(loss)} souls lost, its hoard swells.`, target.x, target.y);
            if (target.pop < 40 && r.chance(0.5)) this.razeSettlement(target, `reduced to cinders by ${d.name}`);
          }
        } else {
          raid.done = true;
          site.dragon.awake = false;
        }
      }
    }
    this.dragonRaids = this.dragonRaids.filter(x => !x.done);

    // lich crypts stir
    for (const site of w.sites) {
      if (site.type !== 'crypt' || site.sealed) continue;
      if (!site.lichActive && --site.stirTimer <= 0) {
        site.lichActive = true;
        this.log('monster', `💀 Something ancient stirs in ${site.name}. The dead do not rest there.`, site.x, site.y);
      }
      if (site.lichActive && r.chance(0.02)) {
        this.spawnHorde(site.x, site.y, 'undead host', r.range(70, 200), '#9db8a4');
      }
    }
    // orc hordes from the wild
    if (this.tickCount % 36 === 0 && r.chance(0.5)) {
      // spawn at a wild badlands/mountain/tundra tile away from civilization
      for (let tries = 0; tries < 60; tries++) {
        const x = r.int(2, w.W - 3), y = r.int(2, w.H - 3);
        const i = w.idx(x, y);
        const b = w.biome[i];
        if (![BIOME.BADLANDS, BIOME.MOUNTAIN, BIOME.TUNDRA, BIOME.HILLS].includes(b)) continue;
        if (w.nationMap[i] >= 0) continue;
        const kind = r.weighted([['orc horde', 6], ['goblin swarm', 3], ['gnoll pack', 2]]);
        this.spawnHorde(x, y, kind, r.range(60, 190), kind === 'orc horde' ? '#7a8f4a' : kind === 'goblin swarm' ? '#a8b23c' : '#b08040');
        break;
      }
    }
    // portals pulse
    for (const site of w.sites) {
      if (site.type !== 'portal') continue;
      if (r.chance(0.004)) {
        if (r.chance(0.5)) {
          let nearest = null, nd = Infinity;
          for (const s of this.livingSettlements()) {
            const d2 = (s.x - site.x) ** 2 + (s.y - site.y) ** 2;
            if (d2 < nd) { nd = d2; nearest = s; }
          }
          if (nearest && nd < 900) {
            nearest.pop += 30;
            const n = this.nationOf(nearest);
            if (n) n.gold += 60;
            this.log('misc', `🌌 Planar traders step through ${site.name}, bearing outlandish goods to ${nearest.name}.`, site.x, site.y);
          }
        } else {
          this.spawnHorde(site.x, site.y, 'planar incursion', r.range(50, 160), '#c060d0');
          this.log('monster', `🌌 ${site.name} flares — something hungry crosses over!`, site.x, site.y);
        }
      }
    }
    // hordes move & raid
    for (const h of this.hordes) {
      if (h.dead) continue;
      if (!h.targetId || r.chance(0.05)) {
        let best = null, bd = 42 * 42;
        for (const s of this.livingSettlements()) {
          const d2 = (s.x - h.x) ** 2 + (s.y - h.y) ** 2;
          if (d2 < bd) { bd = d2; best = s; }
        }
        h.targetId = best ? best.id : null;
        if (!best) h.wanderAngle = r.range(0, Math.PI * 2);
      }
      const target = h.targetId != null ? this.settlements[h.targetId] : null;
      if (target && !target.dead) {
        const dx = target.x - h.x, dy = target.y - h.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1.5) {
          // raid!
          let garrison = target.pop / 16 * (target.walls ? 1.8 : 1);
          const roll = h.strength * r.range(0.7, 1.3) - garrison * r.range(0.7, 1.3);
          this.battles.push({ x: target.x, y: target.y, ttl: 14 });
          if (roll > 0) {
            const loss = target.pop * r.range(0.1, 0.25);
            target.pop -= loss;
            h.strength += loss * 0.05;
            this.log('monster', `🪓 The ${h.name} sacks ${target.name}! ${Math.round(loss)} slain or carried off.`, target.x, target.y);
            if (target.pop < 30) this.razeSettlement(target, `overrun by the ${h.name}`);
            h.targetId = null;
            if (r.chance(0.35)) h.dead = true; // sated, they scatter
          } else {
            h.strength *= 0.6;
            this.log('monster', `🛡️ ${target.name} repels the ${h.name} at its walls!`, target.x, target.y);
            h.targetId = null;
            if (h.strength < 30) h.dead = true;
          }
        } else {
          const sp = 1.1 / Math.max(dist, 1);
          const nx = h.x + dx * sp, ny = h.y + dy * sp;
          const ni = w.idx(Math.round(nx), Math.round(ny));
          if (w.inBounds(Math.round(nx), Math.round(ny)) && w.isLand(ni)) { h.x = nx; h.y = ny; }
          else h.targetId = null;
        }
      } else {
        h.x += Math.cos(h.wanderAngle || 0) * 0.8;
        h.y += Math.sin(h.wanderAngle || 0) * 0.8;
        if (!w.inBounds(Math.round(h.x), Math.round(h.y)) || w.isWater(w.idx(Math.round(h.x), Math.round(h.y)))) {
          h.x -= Math.cos(h.wanderAngle || 0) * 0.8;
          h.y -= Math.sin(h.wanderAngle || 0) * 0.8;
          h.wanderAngle = r.range(0, Math.PI * 2);
        }
        if (r.chance(0.01)) h.dead = true; // melts back into the wild
      }
    }
    this.hordes = this.hordes.filter(h => !h.dead);
  }

  spawnHorde(x, y, name, strength, color) {
    this.hordes.push({ id: 'h' + this.tickCount + '_' + Math.round(x) + '_' + Math.round(y), x, y, name, strength, color, dead: false, targetId: null });
    if (name !== 'undead host') this.log('monster', `🪓 A ${name} gathers in the wilds — scouts count ${Math.round(strength * 10)} raiders.`, x, y);
  }

  adventurersTick() {
    const r = this.rng, w = this.world;
    // spawn parties from towns+
    if (this.tickCount % 6 === 0) {
      const towns = this.livingSettlements().filter(s => s.tier >= 3);
      if (towns.length && r.chance(0.5)) {
        const home = r.pick(towns);
        // choose a quest: threats first, then treasure
        let target = null, quest = null;
        const threats = [];
        for (const site of w.sites) {
          if ((site.questCd || 0) > this.tickCount) continue;
          if (site.type === 'dragonLair' && site.dragon && !site.dragon.slain && site.dragon.hoard > 1400) threats.push({ site, quest: 'dragon', w: 3 });
          if (site.type === 'crypt' && site.lichActive && !site.sealed) threats.push({ site, quest: 'lich', w: 4 });
        }
        for (const h of this.hordes) if (!h.dead) threats.push({ horde: h, quest: 'horde', w: 2 });
        const ruins = w.sites.filter(s => (s.type === 'ruin' || s.type === 'battlefield') && s.active && s.treasure > 40);
        if (threats.length && r.chance(0.55)) {
          const pickT = r.weighted(threats.map(t => [t, t.w]));
          quest = pickT.quest;
          target = pickT.site || pickT.horde;
        } else if (ruins.length) {
          quest = 'delve';
          target = r.pick(ruins);
        }
        if (target) {
          const nation = this.nationOf(home);
          const party = {
            id: 'p' + this.tickCount,
            homeId: home.id, x: home.x, y: home.y,
            tx: target.x, ty: target.y,
            power: r.range(0.5, 1.4) + (nation ? nation.magicLevel * 0.15 : 0),
            quest, targetSiteId: target.id !== undefined && target.site !== null && quest !== 'horde' ? target.id : null,
            targetHordeId: quest === 'horde' ? target.id : null,
            name: this.partyName(r),
            dead: false, doneTick: null
          };
          this.adventurers.push(party);
        }
      }
    }
    // move & resolve
    for (const p of this.adventurers) {
      if (p.dead || p.resolved) continue;
      if (p.quest === 'horde') {
        const h = this.hordes.find(h2 => h2.id === p.targetHordeId);
        if (!h || h.dead) { p.resolved = true; continue; }
        p.tx = h.x; p.ty = h.y;
      }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.2) {
        this.resolveQuest(p);
      } else {
        const sp = Math.min(2.2, dist) / dist;
        p.x += dx * sp * 1.2;
        p.y += dy * sp * 1.2;
      }
    }
    this.adventurers = this.adventurers.filter(p => !p.resolved || (this.tickCount - (p.doneTick || 0)) < 3);
  }

  partyName(r) {
    const a = ['Company', 'Fellowship', 'Band', 'Blades', 'Order', 'Seekers', 'Wardens'];
    const b = ['of the Gilded Rose', 'of the Broken Tower', 'of the Silver Owl', 'of the Red Lantern', 'of the Last Light', 'of the Wandering Eye', 'of the Iron Oath', 'of the Laughing Griffon'];
    return `${r.pick(a)} ${r.pick(b)}`;
  }

  resolveQuest(p) {
    const r = this.rng, w = this.world;
    const home = this.settlements[p.homeId];
    p.resolved = true;
    p.doneTick = this.tickCount;
    const reward = (gold, msg, x, y) => {
      if (home && !home.dead) {
        const n = this.nationOf(home);
        if (n) n.gold += gold;
        home.pop += gold * 0.15;
      }
      this.log('misc', msg, x, y);
    };
    if (p.quest === 'dragon') {
      const site = w.sites[p.targetSiteId];
      const d = site && site.dragon;
      if (!d || d.slain) return;
      const odds = p.power / (p.power + d.power * (1.8 + d.hoard / 800));
      if (r.chance(odds * 0.3)) {
        d.slain = true;
        d.slainTick = this.tickCount;
        site.active = false;
        this.battles.push({ x: site.x, y: site.y, ttl: 20 });
        reward(d.hoard, `🗡️ The ${p.name} slays ${d.name}! Wagons of hoard-gold roll home to ${home ? home.name : 'their vaults'}.`, site.x, site.y);
      } else if (r.chance(0.6)) {
        d.hoard += 30;
        site.questCd = this.tickCount + r.int(70, 140);
        this.log('monster', `☠️ The ${p.name} enters ${site.name}... and does not return.`, site.x, site.y);
      } else {
        site.questCd = this.tickCount + r.int(40, 90);
        this.log('misc', `🏃 The ${p.name} flees ${site.name}, singed but wiser.`, site.x, site.y);
      }
    } else if (p.quest === 'lich') {
      const site = w.sites[p.targetSiteId];
      if (!site || site.sealed) return;
      site.questCd = this.tickCount + r.int(30, 70);
      if (r.chance(p.power * 0.25)) {
        site.sealed = true;
        site.lichActive = false;
        reward(200, `🗡️ The ${p.name} casts down the horror of ${site.name}; the crypt is sealed with silver and prayer.`, site.x, site.y);
      } else if (r.chance(0.5)) {
        this.log('monster', `☠️ Screams echo from ${site.name}. The ${p.name} joins its silent garrison.`, site.x, site.y);
      }
    } else if (p.quest === 'horde') {
      const h = this.hordes.find(h2 => h2.id === p.targetHordeId);
      if (!h || h.dead) return;
      if (r.chance(p.power * 100 / (p.power * 100 + h.strength))) {
        h.strength *= 0.5;
        if (h.strength < 40) {
          h.dead = true;
          reward(60, `🗡️ The ${p.name} scatters the ${h.name} to the winds!`, h.x, h.y);
        } else {
          this.log('misc', `🗡️ The ${p.name} bloodies the ${h.name}, thinning its ranks.`, h.x, h.y);
        }
      } else if (r.chance(0.4)) {
        this.log('monster', `☠️ The ${p.name} is overrun by the ${h.name}.`, h.x, h.y);
      }
    } else if (p.quest === 'delve') {
      const site = w.sites[p.targetSiteId];
      if (!site || !site.active) return;
      if (r.chance(1 - site.danger * 0.5)) {
        const loot = Math.min(site.treasure, r.int(40, 160));
        site.treasure -= loot;
        site.explored++;
        reward(loot, `🏺 The ${p.name} returns from ${site.name} laden with relics of the elder days.`, site.x, site.y);
        if (site.treasure <= 20) {
          site.active = false;
          this.log('misc', `🕳️ ${site.name} is picked clean; only bats and echoes remain.`, site.x, site.y);
        }
      } else if (r.chance(0.45)) {
        this.log('monster', `☠️ The ${p.name} vanishes into ${site.name}. Locals bar their doors at night.`, site.x, site.y);
      }
    }
  }

  // ---------- plague ----------
  plagueTick() {
    const r = this.rng;
    const infected = this.livingSettlements().filter(s => s.plague > 0);
    if (!this.plagueActive && r.chance(0.0012) && this.tickCount > 200) {
      const candidates = this.livingSettlements().filter(s => s.tier >= 4);
      if (candidates.length) {
        const s = r.pick(candidates);
        s.plague = r.int(15, 35);
        this.plagueActive = true;
        this.log('misc', `🦠 A shivering sickness breaks out in ${s.name}. Clerics burn juniper in the streets.`, s.x, s.y);
      }
    }
    for (const s of infected) {
      let death = 0.018;
      if (s.temple && ['Ilmater', 'Lathander'].includes(DEITIES[s.deity].name)) death *= 0.5;
      s.pop *= 1 - death;
      s.plague--;
      if (s.plague <= 0) {
        s.plagueImmune = this.tickCount + 250; // survivors carry resistance for years
        this.log('misc', `🌿 The plague burns out in ${s.name}.`, s.x, s.y);
      }
      // spread along routes
      for (const rt of this.routes) {
        if (rt.a !== s.id && rt.b !== s.id) continue;
        const other = this.settlements[rt.a === s.id ? rt.b : rt.a];
        if (!other.dead && other.plague <= 0 && (other.plagueImmune || 0) < this.tickCount && r.chance(0.04)) {
          other.plague = r.int(12, 30);
          this.log('misc', `🦠 The sickness spreads along the trade roads to ${other.name}.`, other.x, other.y);
        }
      }
    }
    if (this.plagueActive && infected.length === 0 && !this.livingSettlements().some(s => s.plague > 0)) {
      this.plagueActive = false;
    }
  }

  randomEvents() {
    const r = this.rng;
    const roll = r.float();
    const towns = this.livingSettlements().filter(s => s.tier >= 2);
    if (!towns.length) return;
    if (roll < 0.12) {
      const s = r.pick(towns);
      s.pop *= 1.06;
      this.log('misc', `🌾 A bountiful harvest blesses the fields around ${s.name}.`, s.x, s.y);
    } else if (roll < 0.18) {
      const s = r.pick(towns);
      s.pop *= 0.96;
      this.log('misc', `❄️ A brutal winter grips ${s.name}; the old and the poor suffer worst.`, s.x, s.y);
    } else if (roll < 0.22) {
      const d = r.pick(DEITIES);
      this.log('religion', `☄️ A comet crosses the heavens. Priests of ${d.name} call it an omen.`);
    } else if (roll < 0.26 && this.livingNations().length >= 2) {
      const ns = r.shuffle([...this.livingNations()]).slice(0, 2);
      if (!this.atWar(ns[0].id, ns[1].id)) {
        this.setRel(ns[0].id, ns[1].id, this.getRel(ns[0].id, ns[1].id) + 15);
        this.log('nation', `💍 A royal marriage binds ${ns[0].name} and ${ns[1].name} in friendship.`);
      }
    } else if (roll < 0.30) {
      const s = r.pick(towns.filter(t => t.tier >= 3) || towns);
      if (s) {
        const n = this.nationOf(s);
        if (n) n.gold += 80;
        this.log('trade', `🎪 A grand fair is held at ${s.name}; merchants come from a hundred leagues.`, s.x, s.y);
      }
    }
  }

  yearReport() {
    const pops = this.livingSettlements().reduce((a, s) => a + s.pop, 0);
    this.stats.totalPop = pops;
    this.stats.year = this.year;
  }

  // ---------- disasters ----------
  disastersTick() {
    const r = this.rng;
    if (!this.activeDisasters) this.activeDisasters = [];
    this.activeDisasters = this.activeDisasters.filter(d => --d.ttl > 0);
    const live = this.livingSettlements();
    if (!live.length) return;
    const p = Math.min(0.02, 0.003 + live.length * 0.00008);
    if (!r.chance(p)) return;
    const w = this.world;
    // pick a disaster whose preconditions exist
    const candidates = [];
    const towns = live.filter(s => s.tier >= 2);
    if (towns.length) candidates.push(['fire', 3]);
    const wet = live.filter(s => s.port || w.river[w.idx(s.x, s.y)] > 0 || this.nearRiver(s));
    if (wet.length) candidates.push(['flood', 2]);
    const mountainous = live.filter(s => this.nearBiome(s, [BIOME.MOUNTAIN, BIOME.SNOWPEAK], 8));
    if (mountainous.length) candidates.push(['quake', 1.5]);
    const ports = live.filter(s => s.port);
    if (ports.length) candidates.push(['storm', 2.5]);
    const farming = live.filter(s => s.industries.some(i => i.type === 'farm') && w.temp[w.idx(s.x, s.y)] > 0.4);
    if (farming.length) candidates.push(['drought', 2]);
    const cold = live.filter(s => w.temp[w.idx(s.x, s.y)] < 0.3);
    if (cold.length) candidates.push(['blizzard', 1.5]);
    candidates.push(['meteor', 0.25]);
    const type = r.weighted(candidates);
    const pickFrom = { fire: towns, flood: wet, quake: mountainous, storm: ports, drought: farming, blizzard: cold }[type];
    const target = pickFrom ? r.pick(pickFrom) : null;
    this.triggerDisaster(type, target ? target.x : r.int(4, w.W - 5), target ? target.y : r.int(4, w.H - 5), false);
  }

  nearRiver(s) {
    const w = this.world;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (w.inBounds(s.x + dx, s.y + dy) && w.river[w.idx(s.x + dx, s.y + dy)] > 0) return true;
    }
    return false;
  }
  nearBiome(s, biomes, rad) {
    const w = this.world;
    for (let dy = -rad; dy <= rad; dy += 2) for (let dx = -rad; dx <= rad; dx += 2) {
      if (w.inBounds(s.x + dx, s.y + dy) && biomes.includes(w.biome[w.idx(s.x + dx, s.y + dy)])) return true;
    }
    return false;
  }

  settlementAt(x, y, rad = 2.5) {
    let best = null, bd = rad * rad;
    for (const s of this.livingSettlements()) {
      const d2 = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d2 < bd) { bd = d2; best = s; }
    }
    return best;
  }

  triggerDisaster(type, x, y, byGod) {
    const r = this.rng, w = this.world;
    if (!this.activeDisasters) this.activeDisasters = [];
    const s = this.settlementAt(x, y, type === 'drought' || type === 'storm' ? 9 : 3.5);
    const wrath = byGod ? ' Priests call it the wrath of the gods.' : '';
    const vis = (ttl, radius) => this.activeDisasters.push({ type, x: s && type !== 'meteor' ? s.x : x, y: s && type !== 'meteor' ? s.y : y, ttl, radius });
    switch (type) {
      case 'fire': {
        if (!s) return false;
        const loss = s.pop * r.range(0.08, 0.2);
        s.pop -= loss;
        const burnable = s.industries.filter(i => i.type !== 'quarry' && i.type !== 'mine');
        if (burnable.length && r.chance(0.6)) r.pick(burnable).burnedTtl = 30;
        vis(24, 1 + s.tier * 0.4);
        this.log('misc', `🔥 A great fire sweeps ${s.name}! ${Math.round(loss)} souls lost, whole streets in ash.${wrath}`, s.x, s.y);
        this.pushNews(`Great fire in ${s.name}. Cause disputed: cow, comet, or the baker again.`);
        break;
      }
      case 'flood': {
        if (!s) return false;
        s.pop *= r.range(0.92, 0.97);
        s.floodTtl = 16;
        vis(20, 2.5);
        this.log('misc', `🌊 The waters rise and drown the lowlands of ${s.name}.${wrath}`, s.x, s.y);
        this.pushNews(`Flood in ${s.name}; ducks pronounce it "an improvement."`);
        break;
      }
      case 'quake': {
        if (!s) return false;
        s.pop *= r.range(0.85, 0.94);
        if (s.walls && r.chance(0.5)) { s.walls = false; this.log('misc', `🪨 The walls of ${s.name} are thrown down by the shaking earth.`, s.x, s.y); }
        vis(18, 3);
        this.log('misc', `🪨 An earthquake rends the land beneath ${s.name}!${wrath}`, s.x, s.y);
        break;
      }
      case 'storm': {
        if (!s) return false;
        s.pop *= r.range(0.96, 0.99);
        s.stormTtl = 20;
        for (const rt of this.routes) {
          if (rt.sea && (rt.a === s.id || rt.b === s.id)) rt.stormTtl = 20;
        }
        vis(22, 4);
        this.log('misc', `🌀 A howling tempest scatters the fleets of ${s.name}; the sea lanes are closed.${wrath}`, s.x, s.y);
        this.pushNews(`${s.name} dockworkers refuse to name the storm, fearing it will "get ideas."`);
        break;
      }
      case 'drought': {
        let hit = 0;
        for (const o of this.livingSettlements()) {
          if ((o.x - x) ** 2 + (o.y - y) ** 2 < 144) { o.droughtTtl = 45; hit++; }
        }
        if (!hit) return false;
        vis(45, 12);
        this.log('misc', `☀️ A merciless drought settles over the lands${s ? ' around ' + s.name : ''}; the fields crack and wither.${wrath}`, x, y);
        break;
      }
      case 'blizzard': {
        if (!s) return false;
        s.pop *= r.range(0.94, 0.98);
        s.droughtTtl = Math.max(s.droughtTtl, 15);
        vis(20, 3);
        this.log('misc', `❄️ A killing blizzard buries ${s.name}; wolves grow bold at the gates.${wrath}`, s.x, s.y);
        break;
      }
      case 'meteor': {
        const i = w.idx(Math.round(x), Math.round(y));
        vis(26, 2);
        if (s) {
          s.pop *= r.range(0.5, 0.75);
          this.log('monster', `☄️ A star falls upon ${s.name}! The sky burns and the earth answers.${wrath}`, x, y);
          if (s.pop < 60) this.razeSettlement(s, 'obliterated by the falling star');
        } else {
          this.log('monster', `☄️ A star falls in the wilds, gouging a smoking crater.${wrath}`, x, y);
        }
        if (w.isLand(i)) {
          w.sites.push({
            id: w.sites.length, type: 'ruin', x: Math.round(x), y: Math.round(y),
            name: 'Starfall Crater', discovered: true, active: true,
            treasure: r.int(200, 600), danger: 0.5, explored: 0
          });
        }
        this.pushNews(`Star metal! Prospectors and cultists race to the new crater. Neither group is welcome.`);
        break;
      }
      case 'plague': {
        const t = s || this.rng.pick(this.livingSettlements().filter(v => v.tier >= 3));
        if (!t) return false;
        t.plague = r.int(15, 35);
        this.plagueActive = true;
        this.log('misc', `🦠 A shivering sickness breaks out in ${t.name}.${wrath}`, t.x, t.y);
        break;
      }
    }
    return true;
  }

  // ---------- god tools ----------
  godFound(x, y) {
    const w = this.world;
    if (!w.inBounds(x, y)) return 'Beyond the edge of the world.';
    const i = w.idx(x, y);
    if (!w.isLand(i)) return 'The sea is no place for a town.';
    if (w.biome[i] === BIOME.SNOWPEAK) return 'Nothing lives on the frozen peaks.';
    if (w.urbanMap[i] >= 0 || w.settleMap[i] >= 0) return 'A town already stands here.';
    for (const o of this.livingSettlements()) {
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < 16) return 'Too close to ' + o.name + '.';
    }
    const s = this.foundSettlement(x, y, this.raceForSpot(x, y), 120, -1, true);
    this.log('settlement', `⛺ ${s.name} founded — settlers say a divine hand guided them here.`, x, y);
    this.pushNews(`Settlers of ${s.name} insist "a voice from the sky" chose the spot. Property values soar.`);
    this.territoryDirty = true;
    this.tradeDirty = true;
    return true;
  }

  godIndustry(type, x, y) {
    const w = this.world;
    if (!w.inBounds(x, y)) return 'Beyond the edge of the world.';
    const i = w.idx(x, y);
    if (!w.isLand(i)) return 'That would sink.';
    if (w.urbanMap[i] >= 0 || w.industryMap[i] >= 0 || w.settleMap[i] >= 0) return 'This ground is already worked.';
    const opts = industryForTile(w, i, null);
    if (!opts || !opts.includes(type)) return `The land here does not suit a ${INDUSTRY_TYPES[type].name.toLowerCase()}.`;
    let owner = this.settlementAt(x, y, 7);
    if (!owner) return 'No settlement close enough to work it.';
    w.industryMap[i] = owner.id;
    owner.industries.push({ type, x, y, burnedTtl: 0 });
    this.log('trade', `${INDUSTRY_TYPES[type].icon} A new ${INDUSTRY_TYPES[type].name.toLowerCase()} rises outside ${owner.name}.`, x, y);
    return true;
  }

  godBless(x, y) {
    const s = this.settlementAt(x, y, 4);
    if (!s) return 'No settlement here to bless.';
    s.pop *= 1.12;
    s.droughtTtl = 0;
    s.floodTtl = 0;
    s.plague = 0;
    s.famine = false;
    const d = DEITIES[s.deity];
    this.log('religion', `🌟 A golden radiance falls upon ${s.name}; the priests of ${d.name} claim the credit.`, s.x, s.y);
    this.pushNews(`Miracle in ${s.name}! Crops double overnight. Local skeptic "reviewing position."`);
    return true;
  }

  // ---------- the town crier ----------
  pushNews(text) {
    if (!this.news) this.news = [];
    this.news.push({ tick: this.tickCount, text });
    if (this.news.length > 30) this.news.splice(0, this.news.length - 30);
    if (this.onNews) this.onNews();
  }

  newsTick() {
    const r = this.rng;
    const live = this.livingSettlements().filter(s => s.tier >= 1);
    if (!live.length || !r.chance(0.5)) return;
    const s = r.pick(live);
    const x = r.pick(live.filter(o => o.id !== s.id)) || s;
    const pool = r.chance(0.22) ? CRIER_TRADE : CRIER_FLUFF;
    let text = r.pick(pool)
      .replace(/%s/g, s.name)
      .replace(/%x/g, x.name)
      .replace(/%d/g, DEITIES[r.int(0, DEITIES.length - 1)].name)
      .replace(/%r/g, RACES[s.race].plural.toLowerCase());
    this.pushNews(text);
  }

  // ---------- territory ----------
  recomputeTerritory() {
    const w = this.world;
    w.nationMap.fill(-1);
    const dist = new Float32Array(w.W * w.H).fill(Infinity);
    const queue = [];
    for (const s of this.livingSettlements()) {
      if (s.nationId < 0) continue;
      const i = w.idx(s.x, s.y);
      const radius = 4 + s.tier * 1.6 + (s.capital ? 2 : 0);
      queue.push({ i, d: 0, nid: s.nationId, max: radius });
      dist[i] = 0;
      w.nationMap[i] = s.nationId;
    }
    // BFS (approx multi-source with per-source radius)
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur.d >= cur.max) continue;
      const cx = cur.i % w.W, cy = (cur.i / w.W) | 0;
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (!w.inBounds(nx, ny)) continue;
        const ni = w.idx(nx, ny);
        if (w.isWater(ni)) continue;
        const stepCost = BIOME_INFO[w.biome[ni]].moveCost > 3 ? 2.2 : 1;
        const nd = cur.d + ((dx && dy) ? 1.414 : 1) * stepCost;
        if (nd < dist[ni] && nd < cur.max) {
          dist[ni] = nd;
          w.nationMap[ni] = cur.nid;
          queue.push({ i: ni, d: nd, nid: cur.nid, max: cur.max });
        }
      }
    }
    // border friction between nation pairs
    this.borderFriction = {};
    for (let y = 0; y < w.H - 1; y++) {
      for (let x = 0; x < w.W - 1; x++) {
        const a = w.nationMap[w.idx(x, y)];
        const bR = w.nationMap[w.idx(x + 1, y)];
        const bD = w.nationMap[w.idx(x, y + 1)];
        for (const b of [bR, bD]) {
          if (a >= 0 && b >= 0 && a !== b) {
            const k = this.relKey(a, b);
            this.borderFriction[k] = (this.borderFriction[k] || 0) + 1;
          }
        }
      }
    }
    this.territoryDirty = false;
    if (this.onTerritoryChange) this.onTerritoryChange();
  }

  // ---------- trade ----------
  recomputeTrade() {
    const w = this.world;
    // decay old road usage so roads can shift over the centuries
    for (let i = 0; i < w.roadUse.length; i++) w.roadUse[i] *= 0.4;
    this.routes = [];
    for (const s of this.settlements) s.routes = [];
    const live = this.livingSettlements().filter(s => s.pop >= 60);
    const seen = new Set();
    for (const s of live) {
      const maxRoutes = 1 + Math.min(4, Math.floor(s.tier / 1.5) + 1);
      const cands = live
        .filter(o => o.id !== s.id)
        .map(o => ({ o, d2: (o.x - s.x) ** 2 + (o.y - s.y) ** 2 }))
        .filter(c => c.d2 < 55 * 55)
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, 8);
      let made = s.routes.length;
      for (const { o } of cands) {
        if (made >= maxRoutes) break;
        const key = s.id < o.id ? s.id + '_' + o.id : o.id + '_' + s.id;
        if (seen.has(key)) continue;
        // nations at war don't trade
        if (s.nationId >= 0 && o.nationId >= 0 && this.atWar(s.nationId, o.nationId)) continue;
        // orc settlements only trade with orcs (mostly)
        if ((s.race === 'orc') !== (o.race === 'orc') && this.rng.chance(0.8)) continue;
        let path = null, sea = false;
        const landPath = findPath(w, s.x, s.y, o.x, o.y, 'land', 120);
        if (s.port && o.port) {
          const seaPath = findPath(w, s.x, s.y, o.x, o.y, 'sea', 150);
          if (seaPath && (!landPath || seaPath.length * 0.8 < landPath.length)) { path = seaPath; sea = true; }
        }
        if (!path) path = landPath;
        if (!path) continue;
        seen.add(key);
        const route = { a: s.id, b: o.id, path, sea };
        this.routes.push(route);
        s.routes.push(route);
        o.routes.push(route);
        made++;
        if (!sea) for (const i of path) w.roadUse[i] += 1;
      }
    }
    // teleportation circles: high-magic nations link their two biggest cities
    for (const n of this.livingNations()) {
      if (n.magicLevel < 4) continue;
      const cities = this.nationSettlements(n.id).filter(s => s.tier >= 5).sort((a, b) => b.pop - a.pop);
      if (cities.length >= 2) {
        const [a, b] = cities;
        const route = { a: a.id, b: b.id, path: null, sea: false, teleport: true };
        this.routes.push(route);
        a.routes.push(route);
        b.routes.push(route);
      }
    }
    this.tradeDirty = false;
    if (this.onTradeChange) this.onTradeChange();
  }
}
