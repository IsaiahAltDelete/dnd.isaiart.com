// Canvas rendering: prebaked terrain, overlay layers, animated life on top.
'use strict';

const TS = 16; // world pixels per tile on the base layer

const SPRITE_FILES = {
  keep: 'Structure/medievalStructure_01.png',
  castle: 'Structure/medievalStructure_02.png',
  gate: 'Structure/medievalStructure_03.png',
  church: 'Structure/medievalStructure_04.png',
  tower: 'Structure/medievalStructure_05.png',
  inn: 'Structure/medievalStructure_09.png',
  houseSmall: 'Structure/medievalStructure_10.png',
  statue: 'Structure/medievalStructure_12.png',
  millBlades: 'Structure/medievalStructure_13.png',
  houseA: 'Structure/medievalStructure_17.png',
  houseB: 'Structure/medievalStructure_18.png',
  barn: 'Structure/medievalStructure_19.png',
  market: 'Structure/medievalStructure_22.png',
  tent: 'Structure/medievalStructure_23.png',
  cyp1: 'Environment/medievalEnvironment_01.png',
  pine1: 'Environment/medievalEnvironment_02.png',
  pine2: 'Environment/medievalEnvironment_03.png',
  log: 'Environment/medievalEnvironment_05.png',
  rockA: 'Environment/medievalEnvironment_07.png',
  rockB: 'Environment/medievalEnvironment_08.png',
  rockC: 'Environment/medievalEnvironment_10.png',
  rockD: 'Environment/medievalEnvironment_11.png',
  bush: 'Environment/medievalEnvironment_12.png',
  brownA: 'Environment/medievalEnvironment_14.png',
  brownB: 'Environment/medievalEnvironment_16.png',
  brownC: 'Environment/medievalEnvironment_18.png',
  bush2: 'Environment/medievalEnvironment_19.png',
  flame: 'Environment/medievalEnvironment_20.png',
  cyp2: 'Environment/medievalEnvironment_21.png',
  knight: 'Unit/medievalUnit_02.png',
  monk: 'Unit/medievalUnit_05.png',
  raider: 'Unit/medievalUnit_09.png',
  hero: 'Unit/medievalUnit_17.png',
  miner: 'Unit/medievalUnit_22.png',
  peasant: 'Unit/medievalUnit_24.png'
};

const BIOME_COLORS = {
  [BIOME.DEEP]: ['#1b3a5c', '#16334f'],
  [BIOME.OCEAN]: ['#265a86', '#21506f'],
  [BIOME.SHALLOW]: ['#3d7fa6', '#377295'],
  [BIOME.BEACH]: ['#d9c690', '#cdbb82'],
  [BIOME.GRASS]: ['#7aa15a', '#6e9450'],
  [BIOME.FOREST]: ['#5c8a4a', '#527d42'],
  [BIOME.DENSEFOREST]: ['#47703c', '#3e6334'],
  [BIOME.HILLS]: ['#8d9463', '#7f8659'],
  [BIOME.MOUNTAIN]: ['#8f8a7d', '#817c70'],
  [BIOME.SNOWPEAK]: ['#dfe4e6', '#cfd6da'],
  [BIOME.TUNDRA]: ['#b3b8a3', '#a6ab97'],
  [BIOME.TAIGA]: ['#7f957a', '#73886f'],
  [BIOME.SWAMP]: ['#5d7050', '#536547'],
  [BIOME.DESERT]: ['#d3b878', '#c6ab6c'],
  [BIOME.BADLANDS]: ['#b08d5f', '#a17f54']
};

function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

class Renderer {
  constructor(canvas, world, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.sim = sim;
    this.sprites = {};
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.overlay = 'political'; // political | faith | trade | none
    this.showTrade = true;
    this.showLabels = true;
    this.time = 0;
    this.selected = null; // {kind, obj}
    this.WPX = world.W * TS;
    this.HPX = world.H * TS;
    this.terrainLayer = this.makeLayer();
    this.politicalLayer = this.makeLayer();
    this.faithLayer = this.makeLayer();
    this.tradeLayer = this.makeLayer();
    this.nationLabels = [];
    sim.onTerritoryChange = () => { this.redrawPolitical(); this.redrawFaith(); };
    sim.onTradeChange = () => { this.redrawTrade(); this.redrawFaith(); };
  }

  makeLayer() {
    const c = document.createElement('canvas');
    c.width = this.WPX; c.height = this.HPX;
    return c;
  }

  loadSprites(onDone) {
    const entries = Object.entries(SPRITE_FILES);
    let left = entries.length;
    for (const [key, file] of entries) {
      const img = new Image();
      img.onload = () => { if (--left === 0) onDone(); };
      img.onerror = () => { console.warn('missing sprite', file); if (--left === 0) onDone(); };
      img.src = 'assets/kenney-medieval/PNG/Retina/' + file;
      this.sprites[key] = img;
    }
  }

  // ---------- static terrain ----------
  bakeTerrain() {
    const g = this.terrainLayer.getContext('2d');
    const w = this.world;
    g.clearRect(0, 0, this.WPX, this.HPX);
    // tiles
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        const i = w.idx(x, y);
        const b = w.biome[i];
        const cols = BIOME_COLORS[b];
        const h = tileHash(x, y);
        g.fillStyle = cols[h > 0.5 ? 0 : 1];
        g.fillRect(x * TS, y * TS, TS, TS);
        // elevation shading on land
        if (w.isLand(i)) {
          const e = w.elev[i];
          if (e > 0.6) {
            g.fillStyle = `rgba(255,255,255,${(e - 0.6) * 0.25})`;
            g.fillRect(x * TS, y * TS, TS, TS);
          }
          // speckle
          if (h < 0.3) {
            g.fillStyle = 'rgba(0,0,0,0.05)';
            g.fillRect(x * TS + ((h * 97) % 1) * 12, y * TS + ((h * 43) % 1) * 12, 3, 3);
          }
        } else {
          // subtle wave streaks
          if (h < 0.18) {
            g.fillStyle = 'rgba(255,255,255,0.07)';
            g.fillRect(x * TS + 2, y * TS + ((h * 53) % 1) * 12, TS - 6, 1.5);
          }
        }
      }
    }
    // coast edging
    g.fillStyle = 'rgba(20,40,60,0.35)';
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        const i = w.idx(x, y);
        if (!w.isWater(i)) continue;
        const landUp = y > 0 && w.isLand(w.idx(x, y - 1));
        const landL = x > 0 && w.isLand(w.idx(x - 1, y));
        const landR = x < w.W - 1 && w.isLand(w.idx(x + 1, y));
        const landD = y < w.H - 1 && w.isLand(w.idx(x, y + 1));
        if (landUp) g.fillRect(x * TS, y * TS, TS, 2.5);
        if (landD) g.fillRect(x * TS, (y + 1) * TS - 2.5, TS, 2.5);
        if (landL) g.fillRect(x * TS, y * TS, 2.5, TS);
        if (landR) g.fillRect((x + 1) * TS - 2.5, y * TS, 2.5, TS);
      }
    }
    // rivers
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const path of w.riverPaths) {
      for (const pass of [0, 1]) {
        g.beginPath();
        let flow = 1;
        for (let k = 0; k < path.length; k++) {
          const px = (path[k] % w.W) * TS + TS / 2;
          const py = ((path[k] / w.W) | 0) * TS + TS / 2;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        flow = Math.min(4.5, 1.2 + path.length * 0.02);
        g.strokeStyle = pass === 0 ? 'rgba(25,55,90,0.5)' : '#3d7fa6';
        g.lineWidth = pass === 0 ? flow + 2 : flow;
        g.stroke();
      }
    }
    this.bakeDecor(g);
  }

  bakeDecor(g) {
    const w = this.world;
    const sp = this.sprites;
    const draw = (img, x, y, size) => {
      if (img && img.complete && img.naturalWidth) g.drawImage(img, x - size / 2, y - size, size, size);
    };
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        const i = w.idx(x, y);
        const b = w.biome[i];
        const h = tileHash(x, y);
        const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
        const jx = (tileHash(x + 999, y) - 0.5) * 9, jy = (tileHash(x, y + 999) - 0.5) * 9;
        if (b === BIOME.FOREST && h < 0.75) {
          draw(h < 0.4 ? sp.cyp1 : sp.cyp2, cx + jx, cy + 6 + jy, 13);
        } else if (b === BIOME.DENSEFOREST) {
          draw(h < 0.5 ? sp.cyp1 : sp.cyp2, cx + jx - 3, cy + 5 + jy, 14);
          if (h < 0.6) draw(sp.cyp2, cx + jx + 4, cy + 8, 11);
        } else if (b === BIOME.TAIGA && h < 0.8) {
          draw(h < 0.45 ? sp.pine1 : sp.pine2, cx + jx, cy + 6 + jy, 13);
        } else if (b === BIOME.MOUNTAIN) {
          draw(h < 0.5 ? sp.rockC : sp.rockD, cx + jx * 0.5, cy + 6, 15);
        } else if (b === BIOME.SNOWPEAK && h < 0.14) {
          draw(sp.rockB, cx + jx * 0.5, cy + 6, 12);
        } else if (b === BIOME.HILLS && h < 0.35) {
          draw(h < 0.18 ? sp.rockA : sp.bush, cx + jx, cy + 5 + jy, 10);
        } else if (b === BIOME.BADLANDS && h < 0.45) {
          draw(h < 0.25 ? sp.brownA : sp.brownC, cx + jx, cy + 6 + jy, 12);
        } else if (b === BIOME.DESERT && h < 0.12) {
          draw(sp.brownB, cx + jx, cy + 5 + jy, 9);
        } else if (b === BIOME.SWAMP && h < 0.5) {
          draw(h < 0.3 ? sp.bush2 : sp.log, cx + jx, cy + 5 + jy, 10);
        } else if (b === BIOME.GRASS && h < 0.06) {
          draw(sp.bush, cx + jx, cy + 5 + jy, 8);
        } else if (b === BIOME.TUNDRA && h < 0.1) {
          draw(sp.rockA, cx + jx, cy + 5 + jy, 8);
        }
      }
    }
  }

  // ---------- overlay layers ----------
  redrawPolitical() {
    const g = this.politicalLayer.getContext('2d');
    const w = this.world;
    g.clearRect(0, 0, this.WPX, this.HPX);
    const centroids = {};
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        const nid = w.nationMap[w.idx(x, y)];
        if (nid < 0) continue;
        const n = this.sim.nations[nid];
        if (!n || n.dead) continue;
        g.fillStyle = n.color + '30';
        g.fillRect(x * TS, y * TS, TS, TS);
        const c = centroids[nid] || (centroids[nid] = { x: 0, y: 0, count: 0 });
        c.x += x; c.y += y; c.count++;
        // borders
        const check = (nx, ny, ex, ey, ew, eh) => {
          const other = w.inBounds(nx, ny) ? w.nationMap[w.idx(nx, ny)] : -2;
          if (other !== nid) {
            g.fillStyle = n.color + 'cc';
            g.fillRect(ex, ey, ew, eh);
          }
        };
        check(x, y - 1, x * TS, y * TS, TS, 1.6);
        check(x, y + 1, x * TS, (y + 1) * TS - 1.6, TS, 1.6);
        check(x - 1, y, x * TS, y * TS, 1.6, TS);
        check(x + 1, y, (x + 1) * TS - 1.6, y * TS, 1.6, TS);
      }
    }
    this.nationLabels = [];
    for (const [nid, c] of Object.entries(centroids)) {
      if (c.count < 12) continue;
      const n = this.sim.nations[+nid];
      this.nationLabels.push({ x: (c.x / c.count + 0.5) * TS, y: (c.y / c.count + 0.5) * TS, name: n.name, color: n.color, size: Math.min(30, 10 + Math.sqrt(c.count) * 1.4) });
    }
  }

  redrawFaith() {
    const g = this.faithLayer.getContext('2d');
    g.clearRect(0, 0, this.WPX, this.HPX);
    for (const s of this.sim.livingSettlements()) {
      const d = DEITIES[s.deity];
      if (!d) continue;
      const r = (3 + s.tier * 1.8) * TS;
      const cx = s.x * TS + TS / 2, cy = s.y * TS + TS / 2;
      const grad = g.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      grad.addColorStop(0, d.color + '85');
      grad.addColorStop(1, d.color + '00');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  redrawTrade() {
    const g = this.tradeLayer.getContext('2d');
    const w = this.world;
    g.clearRect(0, 0, this.WPX, this.HPX);
    // roads from usage
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        const use = w.roadUse[w.idx(x, y)];
        if (use > 0.8) {
          g.fillStyle = `rgba(120,90,50,${Math.min(0.5, use * 0.13)})`;
          g.fillRect(x * TS + 4, y * TS + 4, TS - 8, TS - 8);
        }
      }
    }
    g.lineCap = 'round';
    for (const rt of this.sim.routes) {
      const a = this.sim.settlements[rt.a], b = this.sim.settlements[rt.b];
      if (rt.teleport) {
        // arcane arc between the two cities
        g.strokeStyle = 'rgba(160,90,220,0.7)';
        g.lineWidth = 1.6;
        g.setLineDash([2, 6]);
        const ax = a.x * TS + TS / 2, ay = a.y * TS + TS / 2;
        const bx = b.x * TS + TS / 2, by = b.y * TS + TS / 2;
        const mx = (ax + bx) / 2, my = (ay + by) / 2 - Math.hypot(bx - ax, by - ay) * 0.18;
        g.beginPath();
        g.moveTo(ax, ay);
        g.quadraticCurveTo(mx, my, bx, by);
        g.stroke();
        continue;
      }
      if (!rt.path) continue;
      g.strokeStyle = rt.sea ? 'rgba(140,200,235,0.55)' : 'rgba(205,170,110,0.6)';
      g.lineWidth = rt.sea ? 1.4 : 1.6;
      g.setLineDash(rt.sea ? [5, 5] : [3, 4]);
      g.beginPath();
      for (let k = 0; k < rt.path.length; k++) {
        const px = (rt.path[k] % w.W) * TS + TS / 2;
        const py = ((rt.path[k] / w.W) | 0) * TS + TS / 2;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.setLineDash([]);
  }

  // ---------- frame ----------
  frame(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const { cam } = this;
    const cw = this.canvas.width, ch = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom);
    ctx.imageSmoothingEnabled = cam.zoom < 2.5;
    ctx.drawImage(this.terrainLayer, 0, 0);
    if (this.overlay === 'political') ctx.drawImage(this.politicalLayer, 0, 0);
    if (this.overlay === 'faith') ctx.drawImage(this.faithLayer, 0, 0);
    if (this.showTrade || this.overlay === 'trade') ctx.drawImage(this.tradeLayer, 0, 0);
    this.drawSites(ctx);
    this.drawIndustries(ctx);
    this.drawSettlements(ctx);
    this.drawCaravans(ctx);
    this.drawDisasters(ctx);
    this.drawToolGhost(ctx);
    this.drawArmies(ctx);
    this.drawHordes(ctx);
    this.drawAdventurers(ctx);
    this.drawDragons(ctx);
    this.drawBattles(ctx);
    this.drawSelection(ctx);
    this.drawLabels(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  spr(ctx, key, wx, wy, size, groundY = null) {
    const img = this.sprites[key];
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, wx - size / 2, (groundY ?? wy) - size, size, size);
    }
  }

  drawSettlements(ctx) {
    const sim = this.sim, w = this.world;
    for (const s of sim.livingSettlements()) {
      const cx = s.x * TS + TS / 2, cy = s.y * TS + TS / 2;
      const urbanSet = s.urban.length > 4 ? new Set(s.urban) : null;
      // --- sprawl: each urban tile gets cleared ground + houses ---
      for (const u of s.urban) {
        const ux = u % w.W, uy = (u / w.W) | 0;
        const px = ux * TS, py = uy * TS;
        const h = tileHash(ux, uy);
        ctx.fillStyle = h > 0.5 ? 'rgba(206,190,152,0.92)' : 'rgba(196,180,142,0.92)';
        ctx.fillRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
        // faint street lines toward center
        ctx.strokeStyle = 'rgba(130,110,80,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + TS / 2, py + TS / 2);
        ctx.lineTo(px + TS / 2 + Math.sign(s.x - ux) * TS / 2, py + TS / 2 + Math.sign(s.y - uy) * TS / 2);
        ctx.stroke();
        if (u === w.idx(s.x, s.y)) continue; // center drawn last, on top
        const houses = s.tier >= 5 ? 3 : s.tier >= 2 ? 2 : 1;
        for (let k = 0; k < houses; k++) {
          const hh = tileHash(ux * 7 + k, uy * 13 + k);
          const key = hh < 0.4 ? 'houseA' : hh < 0.75 ? 'houseB' : 'houseSmall';
          const ox = ((tileHash(ux + k * 31, uy) - 0.5) * 8);
          const oy = ((tileHash(ux, uy + k * 17) - 0.5) * 7);
          this.spr(ctx, key, px + TS / 2 + ox, py + TS / 2 + 5 + oy, 8.5 + hh * 2);
        }
      }
      // --- walls trace the edge of the town ---
      if (s.walls && urbanSet) {
        ctx.strokeStyle = '#7d7466';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'square';
        for (const u of s.urban) {
          const ux = u % w.W, uy = (u / w.W) | 0;
          const px = ux * TS, py = uy * TS;
          if (!urbanSet.has(u - w.W)) { ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + TS, py + 1); ctx.stroke(); }
          if (!urbanSet.has(u + w.W)) { ctx.beginPath(); ctx.moveTo(px, py + TS - 1); ctx.lineTo(px + TS, py + TS - 1); ctx.stroke(); }
          if (!urbanSet.has(u - 1)) { ctx.beginPath(); ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + TS); ctx.stroke(); }
          if (!urbanSet.has(u + 1)) { ctx.beginPath(); ctx.moveTo(px + TS - 1, py); ctx.lineTo(px + TS - 1, py + TS); ctx.stroke(); }
        }
      }
      // --- docks: pier into the nearest water ---
      if (s.port) this.drawPier(ctx, s);
      // --- civic center ---
      const t = s.tier;
      if (t === 0) {
        this.spr(ctx, 'tent', cx, cy + 6, 10);
      } else if (t <= 2) {
        this.spr(ctx, 'houseA', cx - 3, cy + 6, 10);
        if (t === 2) this.spr(ctx, 'inn', cx + 4, cy + 7, 10);
        if (s.temple) this.spr(ctx, 'church', cx + 1, cy - 2, 11);
      } else if (t <= 4) {
        this.spr(ctx, 'inn', cx - 4, cy + 7, 11);
        this.spr(ctx, 'gate', cx + 3, cy + 2, 12);
        if (s.temple) this.spr(ctx, 'church', cx - 4, cy - 2, 12);
        if (s.market) this.spr(ctx, 'market', cx + 6, cy + 9, 9);
      } else {
        this.spr(ctx, 'inn', cx - 6, cy + 9, 11);
        this.spr(ctx, s.capital ? 'keep' : 'castle', cx, cy + 2, t >= 6 ? 18 : 15);
        if (s.temple) this.spr(ctx, 'church', cx - 7, cy - 3, 12);
        if (s.market) this.spr(ctx, 'market', cx + 7, cy + 11, 9);
        if (s.mageTower) this.spr(ctx, 'tower', cx + 8, cy - 4, 12);
      }
      // nation banner
      const n = sim.nationOf(s);
      if (n && !n.dead) {
        ctx.fillStyle = n.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.5;
        const bx = cx - 1.5, by = cy - 12 - s.tier * 1.2;
        ctx.fillRect(bx, by, 3 + (s.capital ? 2 : 0), 2.4 + (s.capital ? 1 : 0));
        ctx.strokeRect(bx, by, 3 + (s.capital ? 2 : 0), 2.4 + (s.capital ? 1 : 0));
        ctx.fillStyle = 'rgba(60,45,30,0.9)';
        ctx.fillRect(bx - 0.6, by, 0.7, 12 + s.tier * 1.2);
      }
      // plague / famine markers
      if (s.plague > 0) {
        const pul = 0.5 + Math.sin(this.time * 4) * 0.3;
        ctx.fillStyle = `rgba(120,200,60,${pul})`;
        ctx.beginPath();
        ctx.arc(cx + 8, cy - 8, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (s.famine) {
        const pul = 0.5 + Math.sin(this.time * 3 + 1) * 0.3;
        ctx.font = '6px serif';
        ctx.globalAlpha = pul;
        ctx.fillText('🍞', cx - 10, cy - 8);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawPier(ctx, s) {
    const w = this.world;
    // find a water neighbor of any urban tile, closest to center
    if (s.pierAt === undefined || (s.pierAt && w.urbanMap[s.pierFrom] !== s.id)) {
      s.pierAt = null;
      outer:
      for (const u of s.urban) {
        const ux = u % w.W, uy = (u / w.W) | 0;
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
          if (!w.inBounds(ux + dx, uy + dy)) continue;
          const ni = w.idx(ux + dx, uy + dy);
          if (w.isWater(ni)) { s.pierAt = { x: ux, y: uy, dx, dy }; s.pierFrom = u; break outer; }
        }
      }
    }
    const p = s.pierAt;
    if (!p) return;
    const bx = p.x * TS + TS / 2 + p.dx * TS * 0.4;
    const by = p.y * TS + TS / 2 + p.dy * TS * 0.4;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.atan2(p.dy, p.dx));
    ctx.fillStyle = '#7a5c39';
    ctx.fillRect(0, -1.8, TS * 0.85, 3.6);                    // planks
    ctx.fillStyle = '#5d4527';
    for (let k = 2; k < TS * 0.85; k += 4) ctx.fillRect(k, -2.4, 1, 4.8); // posts
    ctx.restore();
    // moored ship (bobs gently)
    const sx = bx + p.dx * TS * 1.1, sy = by + p.dy * TS * 1.1 + Math.sin(this.time * 1.5 + s.id) * 0.6;
    ctx.fillStyle = '#6b4a2f';
    ctx.beginPath();
    ctx.moveTo(sx - 3.2, sy); ctx.lineTo(sx + 3.2, sy); ctx.lineTo(sx + 1.8, sy + 2.2); ctx.lineTo(sx - 1.8, sy + 2.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e0ce';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4.5); ctx.lineTo(sx + 2.8, sy - 0.5); ctx.lineTo(sx, sy - 0.5);
    ctx.closePath(); ctx.fill();
  }

  drawIndustries(ctx) {
    const w = this.world;
    for (const s of this.sim.livingSettlements()) {
      for (const ind of s.industries) {
        const px = ind.x * TS, py = ind.y * TS;
        const cx = px + TS / 2, cy = py + TS / 2;
        const h = tileHash(ind.x, ind.y);
        if (ind.burnedTtl > 0) {
          ctx.fillStyle = 'rgba(30,24,18,0.75)';
          ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
          if (ind.burnedTtl > 20) this.spr(ctx, 'flame', cx, cy + 5, 9);
          continue;
        }
        switch (ind.type) {
          case 'farm': {
            ctx.fillStyle = 'rgba(196,178,102,0.9)';
            ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
            ctx.strokeStyle = 'rgba(140,120,60,0.8)';
            ctx.lineWidth = 1;
            for (let k = 3.5; k < TS - 1; k += 3.5) {
              ctx.beginPath(); ctx.moveTo(px + 1.5, py + k); ctx.lineTo(px + TS - 1.5, py + k); ctx.stroke();
            }
            if (h < 0.35) { this.spr(ctx, 'barn', px + 4, py + 5, 8); }
            if (s.mill && h >= 0.35 && h < 0.6) {
              this.spr(ctx, 'barn', cx, cy + 4, 8);
              this.spr(ctx, 'millBlades', cx, cy - 1, 8);
            }
            break;
          }
          case 'fishery': {
            this.spr(ctx, 'houseSmall', cx - 2, cy + 5, 8);
            ctx.strokeStyle = 'rgba(90,70,45,0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx + 2, cy + 2); ctx.lineTo(cx + 6, cy + 5); ctx.stroke(); // net pole
            ctx.fillStyle = 'rgba(220,215,190,0.55)';
            ctx.fillRect(cx + 2, cy + 2, 4, 3);
            break;
          }
          case 'lumber': {
            this.spr(ctx, 'log', cx - 3, cy + 5, 9);
            this.spr(ctx, 'log', cx + 1, cy + 7, 8);
            this.spr(ctx, 'pine1', cx + 4, cy + 2, 8);
            break;
          }
          case 'quarry': {
            ctx.fillStyle = 'rgba(150,145,132,0.9)';
            ctx.fillRect(px + 2, py + 3, TS - 4, TS - 6);
            ctx.fillStyle = 'rgba(105,100,90,0.9)';
            ctx.fillRect(px + 4, py + 5, 5, 4);
            this.spr(ctx, 'rockA', cx + 3, cy + 6, 8);
            break;
          }
          case 'mine': {
            this.spr(ctx, 'rockC', cx, cy + 6, 11);
            ctx.fillStyle = '#241c12';
            ctx.fillRect(cx - 2, cy - 1, 4, 4); // adit
            this.spr(ctx, 'miner', cx + 5, cy + 6, 6);
            break;
          }
          case 'vineyard': {
            ctx.fillStyle = 'rgba(150,170,90,0.85)';
            ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
            ctx.strokeStyle = 'rgba(80,100,45,0.9)';
            ctx.lineWidth = 1.2;
            for (let k = 3.5; k < TS - 1; k += 4) {
              ctx.beginPath(); ctx.moveTo(px + k, py + 2); ctx.lineTo(px + k, py + TS - 2); ctx.stroke();
            }
            ctx.fillStyle = 'rgba(90,40,90,0.9)';
            for (let k = 0; k < 4; k++) ctx.fillRect(px + 3 + k * 3.4, py + 3 + ((h * (k + 3)) % 1) * 8, 1.6, 1.6);
            break;
          }
          case 'trapper': {
            this.spr(ctx, 'tent', cx - 2, cy + 5, 8);
            ctx.fillStyle = 'rgba(140,90,50,0.9)';
            ctx.fillRect(cx + 3, cy + 1, 3, 4); // hung furs
            break;
          }
          case 'herbalist': {
            this.spr(ctx, 'bush', cx - 3, cy + 5, 7);
            this.spr(ctx, 'bush2', cx + 3, cy + 6, 7);
            this.spr(ctx, 'houseSmall', cx, cy + 1, 7);
            break;
          }
          case 'saltworks': {
            ctx.fillStyle = 'rgba(235,230,215,0.85)';
            ctx.fillRect(px + 2, py + 3, 5, 4);
            ctx.fillRect(px + 8, py + 7, 5, 4);
            ctx.strokeStyle = 'rgba(120,110,90,0.7)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(px + 2, py + 3, 5, 4);
            ctx.strokeRect(px + 8, py + 7, 5, 4);
            break;
          }
        }
      }
    }
  }

  drawDisasters(ctx) {
    const list = this.sim.activeDisasters || [];
    for (const d of list) {
      const cx = d.x * TS + TS / 2, cy = d.y * TS + TS / 2;
      const R = d.radius * TS;
      switch (d.type) {
        case 'fire': {
          for (let k = 0; k < 5; k++) {
            const a = this.time * 2 + k * 1.3;
            const fx = cx + Math.cos(a * 1.7 + k) * R * 0.5;
            const fy = cy + Math.sin(a + k * 2) * R * 0.35;
            this.spr(ctx, 'flame', fx, fy + 4, 7 + Math.sin(this.time * 8 + k) * 2);
          }
          ctx.fillStyle = `rgba(255,120,30,${0.12 + Math.sin(this.time * 6) * 0.05})`;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'flood': {
          ctx.fillStyle = `rgba(60,120,180,${0.3 + Math.sin(this.time * 2) * 0.1})`;
          ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'quake': {
          ctx.strokeStyle = `rgba(70,50,30,${Math.min(1, d.ttl / 10)})`;
          ctx.lineWidth = 1.4;
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            let jx = cx - R * 0.7, jy = cy + (k - 1) * 6;
            ctx.moveTo(jx, jy);
            for (let seg = 0; seg < 6; seg++) {
              jx += R * 0.23;
              jy += (tileHash(seg + k * 7, d.x + seg) - 0.5) * 9;
              ctx.lineTo(jx, jy);
            }
            ctx.stroke();
          }
          break;
        }
        case 'storm': {
          ctx.strokeStyle = 'rgba(120,140,170,0.7)';
          ctx.lineWidth = 1.6;
          for (let k = 0; k < 3; k++) {
            const a0 = this.time * 3 + k * 2.1;
            ctx.beginPath();
            ctx.arc(cx, cy, R * (0.3 + k * 0.25), a0, a0 + 3.5);
            ctx.stroke();
          }
          break;
        }
        case 'drought': {
          ctx.fillStyle = 'rgba(220,180,60,0.10)';
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(220,170,50,0.35)';
          ctx.setLineDash([4, 5]);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'blizzard': {
          ctx.fillStyle = 'rgba(240,246,250,0.8)';
          for (let k = 0; k < 14; k++) {
            const fx = cx + Math.sin(k * 39 + this.time * (1 + (k % 3))) * R;
            const fy = cy + ((this.time * 12 + k * 17) % (R * 2)) - R;
            ctx.fillRect(fx, fy, 1.4, 1.4);
          }
          break;
        }
        case 'meteor': {
          if (d.ttl > 18) {
            const t = (26 - d.ttl) / 8;
            const sx = cx + 60 - t * 60, sy = cy - 90 + t * 90;
            ctx.strokeStyle = 'rgba(255,190,90,0.9)';
            ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(sx + 14, sy - 20); ctx.lineTo(sx, sy); ctx.stroke();
            ctx.fillStyle = '#ffd080';
            ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
          } else {
            const age = 1 - d.ttl / 18;
            ctx.strokeStyle = `rgba(255,140,50,${1 - age})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(cx, cy, 4 + age * 26, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(80,60,40,${0.5 - age * 0.4})`;
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
      }
    }
  }

  drawSites(ctx) {
    for (const site of this.world.sites) {
      const cx = site.x * TS + TS / 2, cy = site.y * TS + TS / 2;
      switch (site.type) {
        case 'dragonLair': {
          this.spr(ctx, 'rockD', cx, cy + 6, 16);
          if (site.dragon && !site.dragon.slain) {
            const gl = 0.4 + Math.sin(this.time * 2 + site.x) * 0.2;
            ctx.fillStyle = `rgba(255,120,30,${gl})`;
            ctx.beginPath();
            ctx.arc(cx, cy + 1, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'ruin': case 'battlefield':
          if (site.active) { this.spr(ctx, 'statue', cx - 2, cy + 5, 9); this.spr(ctx, 'rockA', cx + 4, cy + 6, 7); }
          else this.spr(ctx, 'rockA', cx, cy + 5, 7);
          break;
        case 'wizardTower': {
          this.spr(ctx, 'tower', cx, cy + 6, 14);
          const gl = 0.5 + Math.sin(this.time * 3 + site.y) * 0.3;
          ctx.fillStyle = `rgba(150,110,255,${gl})`;
          ctx.beginPath();
          ctx.arc(cx, cy - 8, 1.6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'grove': {
          this.spr(ctx, 'cyp1', cx - 4, cy + 5, 12);
          this.spr(ctx, 'cyp2', cx + 4, cy + 6, 12);
          this.spr(ctx, 'cyp1', cx, cy + 9, 10);
          const gl = 0.25 + Math.sin(this.time * 1.5 + site.x) * 0.15;
          ctx.fillStyle = `rgba(180,255,180,${gl})`;
          ctx.beginPath();
          ctx.arc(cx, cy + 2, 5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'mine':
          this.spr(ctx, 'rockB', cx - 3, cy + 6, 11);
          this.spr(ctx, 'miner', cx + 4, cy + 6, 7);
          if (!site.depleted) {
            ctx.fillStyle = `rgba(160,220,255,${0.5 + Math.sin(this.time * 2.5 + site.id) * 0.25})`;
            ctx.fillRect(cx - 2, cy + 1, 1.6, 1.6);
            ctx.fillRect(cx + 1, cy - 1, 1.3, 1.3);
          }
          break;
        case 'crypt': {
          this.spr(ctx, 'statue', cx, cy + 6, 10);
          if (site.lichActive && !site.sealed) {
            const gl = 0.4 + Math.sin(this.time * 5) * 0.3;
            ctx.fillStyle = `rgba(120,255,160,${gl})`;
            ctx.beginPath();
            ctx.arc(cx, cy - 5, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'portal': {
          const pulse = (this.time % 3) / 3;
          ctx.strokeStyle = `rgba(190,110,240,${0.8 - pulse * 0.6})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 2, 4 + pulse * 5, (4 + pulse * 5) * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(230,180,255,0.9)';
          ctx.beginPath();
          ctx.ellipse(cx, cy + 2, 3.2, 5, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }
  }

  drawCaravans(ctx) {
    for (let r = 0; r < this.sim.routes.length; r++) {
      const rt = this.sim.routes[r];
      if (!rt.path || rt.path.length < 4) continue;
      const w = this.world;
      if (rt.stormTtl > 0) continue; // ships shelter in port
      const count = 1 + Math.min(2, Math.floor((rt.flow || 0) / 2.5));
      for (let c = 0; c < count; c++) {
        const phase = ((this.time * 0.06 + r * 0.37 + c * 0.5) % 1);
        const fpos = phase * (rt.path.length - 1);
        const k = Math.floor(fpos), f = fpos - k;
        const i0 = rt.path[k], i1 = rt.path[Math.min(k + 1, rt.path.length - 1)];
        const x = ((i0 % w.W) + ((i1 % w.W) - (i0 % w.W)) * f) * TS + TS / 2;
        const y = (((i0 / w.W) | 0) + (((i1 / w.W) | 0) - ((i0 / w.W) | 0)) * f) * TS + TS / 2;
        if (rt.sea) {
          // little ship: hull + sail
          ctx.fillStyle = '#6b4a2f';
          ctx.beginPath();
          ctx.moveTo(x - 2.4, y); ctx.lineTo(x + 2.4, y); ctx.lineTo(x + 1.4, y + 1.8); ctx.lineTo(x - 1.4, y + 1.8);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e8e0ce';
          ctx.beginPath();
          ctx.moveTo(x, y - 3.4); ctx.lineTo(x + 2.2, y - 0.4); ctx.lineTo(x, y - 0.4);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = '#caa96a';
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  drawArmies(ctx) {
    for (const a of this.sim.armies) {
      if (a.done) continue;
      const n = this.sim.nations[a.nationId];
      const x = a.x * TS + TS / 2, y = a.y * TS + TS / 2;
      ctx.fillStyle = n.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(x, y + 1, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.spr(ctx, 'knight', x, y + 4, 8);
    }
  }

  drawHordes(ctx) {
    for (const h of this.sim.hordes) {
      if (h.dead) continue;
      const x = h.x * TS + TS / 2, y = h.y * TS + TS / 2;
      const pul = 0.75 + Math.sin(this.time * 3 + h.x) * 0.25;
      ctx.fillStyle = h.color;
      ctx.globalAlpha = pul;
      ctx.beginPath();
      ctx.arc(x, y + 1, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(40,0,0,0.8)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      this.spr(ctx, 'raider', x - 2, y + 4, 7);
      this.spr(ctx, 'raider', x + 2, y + 5, 7);
    }
  }

  drawAdventurers(ctx) {
    for (const p of this.sim.adventurers) {
      if (p.dead || p.resolved) continue;
      const x = p.x * TS + TS / 2, y = p.y * TS + TS / 2;
      ctx.fillStyle = 'rgba(255,235,150,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      this.spr(ctx, 'hero', x, y + 3, 6.5);
    }
  }

  drawDragons(ctx) {
    for (const raid of this.sim.dragonRaids) {
      const site = this.world.sites[raid.siteId];
      const target = this.sim.settlements[raid.targetId];
      if (!site || !target) continue;
      const t = raid.returning ? 1 - raid.progress : raid.progress;
      const x = (site.x + (target.x - site.x) * t) * TS + TS / 2;
      const y = (site.y + (target.y - site.y) * t) * TS + TS / 2 - 6;
      const d = site.dragon;
      const flap = Math.sin(this.time * 10) * 3;
      ctx.fillStyle = d.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.6;
      // body
      ctx.beginPath();
      ctx.ellipse(x, y, 4.5, 1.8, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // wings
      ctx.beginPath();
      ctx.moveTo(x - 1, y);
      ctx.quadraticCurveTo(x - 6, y - 5 - flap, x - 10, y - 2 - flap);
      ctx.quadraticCurveTo(x - 6, y + 1, x - 1, y + 0.5);
      ctx.moveTo(x + 1, y);
      ctx.quadraticCurveTo(x + 6, y - 5 - flap, x + 10, y - 2 - flap);
      ctx.quadraticCurveTo(x + 6, y + 1, x + 1, y + 0.5);
      ctx.fill(); ctx.stroke();
      // tail + head
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.quadraticCurveTo(x - 8, y + 2, x - 9.5, y + 0.5);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = d.color;
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x + 5.2, y - 0.6, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x, y + 9, 4, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBattles(ctx) {
    for (const b of this.sim.battles) {
      const x = b.x * TS + TS / 2, y = b.y * TS + TS / 2;
      const age = 1 - b.ttl / 16;
      ctx.strokeStyle = `rgba(255,80,40,${1 - age})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 3 + age * 12, 0, Math.PI * 2);
      ctx.stroke();
      // crossed swords
      ctx.strokeStyle = `rgba(255,220,180,${1 - age})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3);
      ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3);
      ctx.stroke();
    }
  }

  drawToolGhost(ctx) {
    if (!this.activeTool || !this.hoverTile) return;
    const { x, y } = this.hoverTile;
    if (!this.world.inBounds(x, y)) return;
    const px = x * TS, py = y * TS;
    const pulse = 0.55 + Math.sin(this.time * 5) * 0.2;
    ctx.strokeStyle = `rgba(255,220,130,${pulse})`;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(px + 1, py + 1, TS - 2, TS - 2);
    ctx.font = '9px serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = pulse + 0.2;
    ctx.fillText(this.activeTool.icon, px + TS / 2, py + TS / 2 + 3);
    ctx.globalAlpha = 1;
  }

  drawSelection(ctx) {
    const sel = this.selected;
    if (!sel) return;
    let x, y;
    if (sel.kind === 'settlement' || sel.kind === 'site') { x = sel.obj.x; y = sel.obj.y; }
    else return;
    const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
    const r = 11 + Math.sin(this.time * 4) * 1.5;
    ctx.strokeStyle = 'rgba(255,215,120,0.9)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLabels(ctx) {
    if (!this.showLabels) return;
    const z = this.cam.zoom;
    // settlement names
    if (z >= 1.3) {
      ctx.textAlign = 'center';
      for (const s of this.sim.livingSettlements()) {
        if (s.tier < 2 && z < 2.4) continue;
        const cx = s.x * TS + TS / 2, cy = s.y * TS + TS / 2;
        const fs = Math.max(4, (5 + s.tier * 0.7) / Math.sqrt(z) * 1.4);
        ctx.font = `${s.capital ? 'bold ' : ''}${fs}px "IM Fell English", serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillText(s.name, cx + 0.5, cy + 14 + s.tier + 0.5);
        ctx.fillStyle = s.capital ? '#ffe9b0' : '#f2ead8';
        ctx.fillText(s.name, cx, cy + 14 + s.tier);
      }
    }
    // nation names
    if (this.overlay === 'political' && z < 3) {
      ctx.textAlign = 'center';
      for (const nl of this.nationLabels) {
        const fs = nl.size / Math.max(0.8, z * 0.55);
        ctx.font = `600 ${fs}px Cinzel, serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(nl.name.toUpperCase(), nl.x + 1, nl.y + 1);
        ctx.fillStyle = 'rgba(255,248,230,0.82)';
        ctx.fillText(nl.name.toUpperCase(), nl.x, nl.y);
      }
    }
    // site names at high zoom
    if (z >= 2.6) {
      ctx.textAlign = 'center';
      ctx.font = `4.5px "IM Fell English", serif`;
      for (const site of this.world.sites) {
        if (!site.active && site.type !== 'dragonLair') continue;
        const cx = site.x * TS + TS / 2, cy = site.y * TS + TS / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillText(site.name, cx + 0.4, cy + 12.4);
        ctx.fillStyle = '#d8c9f0';
        ctx.fillText(site.name, cx, cy + 12);
      }
    }
  }
}
