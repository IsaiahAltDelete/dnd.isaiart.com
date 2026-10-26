// DOM panels: chronicle, realms list, inspector, minimap, tooltip, legend.
'use strict';

const CAT_ICONS = {
  settlement: '🏘️', nation: '👑', war: '⚔️', religion: '🕯️',
  magic: '✨', monster: '🐉', trade: '🪙', misc: '📜'
};

class UI {
  constructor(game) {
    this.game = game;
    this.logEl = document.getElementById('event-log');
    this.realmsEl = document.getElementById('realms-list');
    this.inspectorEl = document.getElementById('inspector-content');
    this.inspectorTitle = document.getElementById('inspector-title');
    this.inspectorPanel = document.getElementById('inspector');
    this.dateEl = document.getElementById('date-display');
    this.popEl = document.getElementById('pop-display');
    this.tooltipEl = document.getElementById('tooltip');
    this.minimap = document.getElementById('minimap');
    this.filter = 'all';
    this.lastRealmRefresh = 0;
    this.bindStaticControls();
  }

  bindStaticControls() {
    const g = this.game;
    document.querySelectorAll('[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        g.speed = +btn.dataset.speed;
        document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    document.querySelectorAll('[data-overlay]').forEach(btn => {
      btn.addEventListener('click', () => {
        g.renderer.overlay = btn.dataset.overlay;
        document.querySelectorAll('[data-overlay]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    document.getElementById('toggle-trade').addEventListener('click', e => {
      g.renderer.showTrade = !g.renderer.showTrade;
      e.currentTarget.classList.toggle('active', g.renderer.showTrade);
    });
    document.getElementById('toggle-labels').addEventListener('click', e => {
      g.renderer.showLabels = !g.renderer.showLabels;
      e.currentTarget.classList.toggle('active', g.renderer.showLabels);
    });
    document.getElementById('btn-newworld').addEventListener('click', () => {
      const seed = document.getElementById('seed-input').value.trim() || String(Math.floor(Math.random() * 1e9));
      g.newWorld(seed);
    });
    document.getElementById('btn-legend').addEventListener('click', () => {
      document.getElementById('legend-modal').classList.toggle('hidden');
    });
    document.getElementById('legend-close').addEventListener('click', () => {
      document.getElementById('legend-modal').classList.add('hidden');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('tab-chronicle').classList.toggle('hidden', btn.dataset.tab !== 'chronicle');
        document.getElementById('tab-realms').classList.toggle('hidden', btn.dataset.tab !== 'realms');
      });
    });
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
        this.rebuildLog();
      });
    });
    document.getElementById('inspector-close').addEventListener('click', () => {
      this.game.renderer.selected = null;
      this.inspectorPanel.classList.add('hidden');
    });
    this.buildLegend();
    this.buildToolbar();
    // minimap interactions
    this.minimap.addEventListener('mousedown', e => this.minimapJump(e));
    this.minimap.addEventListener('mousemove', e => { if (e.buttons & 1) this.minimapJump(e); });
  }

  // ---------- god tools ----------
  buildToolbar() {
    const bar = document.getElementById('godbar');
    const tools = [
      { kind: 'inspect', icon: '👁️', name: 'Inspect (default)' },
      { kind: 'found', icon: '⛺', name: 'Found a settlement' },
      ...Object.entries(INDUSTRY_TYPES).map(([key, d]) => ({ kind: 'industry', type: key, icon: d.icon, name: 'Build: ' + d.name })),
      { kind: 'bless', icon: '🌟', name: 'Bless a settlement' },
      ...Object.entries(DISASTER_TYPES).filter(([, d]) => d.god).map(([key, d]) => ({ kind: 'disaster', type: key, icon: d.icon, name: 'Unleash: ' + d.name }))
    ];
    bar.innerHTML = '<span class="godbar-label">Hand of the Gods</span>';
    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.textContent = tool.icon;
      btn.title = tool.name;
      btn.className = 'god-btn' + (tool.kind === 'inspect' ? ' active' : '');
      if (tool.kind === 'bless') btn.classList.add('god-bless');
      if (tool.kind === 'disaster') btn.classList.add('god-wrath');
      btn.addEventListener('click', () => {
        this.game.activeTool = tool.kind === 'inspect' ? null : tool;
        this.game.renderer.activeTool = this.game.activeTool;
        bar.querySelectorAll('.god-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
      bar.appendChild(btn);
    }
  }

  resetTool() {
    this.game.activeTool = null;
    this.game.renderer.activeTool = null;
    const bar = document.getElementById('godbar');
    bar.querySelectorAll('.god-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  }

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // ---------- the town crier ----------
  refreshCrier() {
    const news = this.game.sim.news || [];
    if (!news.length) return;
    const items = news.slice(-7).reverse().map(n => n.text);
    const text = items.join('   ✦   ');
    const el = document.getElementById('crier-text');
    if (el.dataset.content !== text) {
      el.dataset.content = text;
      el.innerHTML = `<span>${text}   ✦   </span><span>${text}   ✦   </span>`;
      const secs = Math.max(20, text.length * 0.35);
      el.style.animationDuration = secs + 's';
    }
  }

  minimapJump(e) {
    const g = this.game;
    const rect = this.minimap.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const r = g.renderer;
    r.cam.x = fx * r.WPX - g.canvas.width / r.cam.zoom / 2;
    r.cam.y = fy * r.HPX - g.canvas.height / r.cam.zoom / 2;
    g.clampCamera();
  }

  buildLegend() {
    const el = document.getElementById('legend-body');
    let html = '<h3>The Pantheon</h3><div class="deity-grid">';
    for (const d of DEITIES) {
      html += `<div class="deity-row"><span class="chip" style="background:${d.color}"></span><b>${d.name}</b> <i>${d.title}</i> — ${d.domain}</div>`;
    }
    html += '</div><h3>Places of Power</h3><div class="deity-grid">';
    const sites = [
      ['🐉', 'Dragon Lair — a wyrm sleeps on its hoard, and wakes hungry'],
      ['🏛️', 'Ancient Ruins — treasure for those bold enough to delve'],
      ['🗼', 'Wizard Tower — hastens the arcane arts of its realm'],
      ['🌳', 'Sacred Grove — blessed ground, beloved of elves'],
      ['⛏️', 'Mithral Vein — riches for the settlement that works it'],
      ['💀', 'Lich Crypt — sooner or later, the dead stir'],
      ['🌀', 'Elder Portal — traders and terrors from beyond'],
    ];
    for (const [ic, txt] of sites) html += `<div class="deity-row"><span class="ic">${ic}</span>${txt}</div>`;
    html += '</div><h3>Industries</h3><div class="deity-grid">';
    for (const [, d] of Object.entries(INDUSTRY_TYPES)) {
      const catName = { food: 'food', mat: 'building materials', lux: 'luxuries', ore: 'ore' }[d.cat];
      html += `<div class="deity-row"><span class="ic">${d.icon}</span>${d.name} — produces ${catName}</div>`;
    }
    html += `<div class="deity-row dim" style="margin-top:4px">Towns eat food, build with materials, and crave luxuries.
      Surpluses flow along trade routes to hungry neighbors — cut the routes and cities starve.</div>`;
    html += '</div><h3>Hand of the Gods</h3><div class="deity-grid">';
    html += `<div class="deity-row"><span class="ic">⛺</span>Found settlements and industries with the toolbar below, or bless a town.</div>`;
    html += `<div class="deity-row"><span class="ic">☄️</span>Or visit fire, flood, quake, tempest, drought, plague, and falling stars upon mortals.</div>`;
    html += `<div class="deity-row"><span class="ic">🖱️</span>Pick a tool, click the map. Right-click or Esc returns to inspection.</div>`;
    html += '</div><h3>Reading the Map</h3><div class="deity-grid">';
    const notes = [
      ['🚩', 'Banners show a settlement\'s realm; larger banner = capital'],
      ['🏘️', 'Towns sprawl across tiles as they grow; walls trace the city bounds'],
      ['➰', 'Gold dashes: caravan roads · Blue dashes: sea lanes · Violet arcs: teleport circles'],
      ['⚔️', 'Red rings flare where battles are fought'],
      ['🟢', 'A sickly green dot marks plague; a flickering 🍞 marks famine'],
    ];
    for (const [ic, txt] of notes) html += `<div class="deity-row"><span class="ic">${ic}</span>${txt}</div>`;
    html += '</div>';
    el.innerHTML = html;
  }

  // ---------- chronicle ----------
  addEvent(ev) {
    if (this.filter !== 'all' && ev.cat !== this.filter) return;
    this.appendEventEl(ev);
    while (this.logEl.children.length > 120) this.logEl.removeChild(this.logEl.lastChild);
  }

  appendEventEl(ev) {
    const div = document.createElement('div');
    div.className = 'event cat-' + ev.cat;
    div.innerHTML = `<span class="ev-date">${ev.date}</span><span class="ev-text">${ev.text}</span>`;
    if (ev.x >= 0) {
      div.classList.add('clickable');
      div.addEventListener('click', () => this.game.centerOn(ev.x, ev.y, 3));
    }
    this.logEl.insertBefore(div, this.logEl.firstChild);
  }

  rebuildLog() {
    this.logEl.innerHTML = '';
    const evs = this.game.sim.events.filter(e => this.filter === 'all' || e.cat === this.filter);
    for (const ev of evs.slice(-120)) this.appendEventEl(ev);
  }

  // ---------- realms ----------
  refreshRealms() {
    const sim = this.game.sim;
    const nations = sim.livingNations()
      .map(n => ({ n, pop: sim.nationPop(n.id), count: sim.nationSettlements(n.id).length }))
      .sort((a, b) => b.pop - a.pop);
    if (!nations.length) {
      this.realmsEl.innerHTML = '<div class="hint">No realms yet — the land is young. Settlements will crown their first rulers as they grow into towns.</div>';
      return;
    }
    let html = '';
    for (const { n, pop, count } of nations) {
      const wars = sim.wars.filter(w => w.a === n.id || w.b === n.id);
      html += `<div class="realm-row clickable" data-nation="${n.id}">
        <span class="chip" style="background:${n.color}"></span>
        <div class="realm-info">
          <div class="realm-name">${n.name} ${wars.length ? '⚔️' : ''}</div>
          <div class="realm-sub">${Math.round(pop).toLocaleString()} souls · ${count} settlements · ${MAGIC_LEVELS[n.magicLevel].name}</div>
        </div>
      </div>`;
    }
    this.realmsEl.innerHTML = html;
    this.realmsEl.querySelectorAll('[data-nation]').forEach(row => {
      row.addEventListener('click', () => {
        const n = sim.nations[+row.dataset.nation];
        this.selectNation(n);
        const cap = sim.settlements[n.capitalId];
        if (cap) this.game.centerOn(cap.x, cap.y, 2);
      });
    });
  }

  // ---------- inspector ----------
  selectSettlement(s) {
    const sim = this.game.sim;
    this.game.renderer.selected = { kind: 'settlement', obj: s };
    const n = sim.nationOf(s);
    const d = DEITIES[s.deity];
    const founded = START_YEAR + Math.floor(s.foundedTick / 36);
    const b = [];
    if (s.temple) b.push('⛪ Temple');
    if (s.walls) b.push('🧱 Walls');
    if (s.market) b.push('🪙 Market');
    if (s.mill) b.push('🌾 Mill');
    if (s.mageTower) b.push('🔮 Mage Tower');
    if (s.port) b.push('⚓ Port');
    const indCounts = {};
    for (const ind of s.industries) indCounts[ind.type] = (indCounts[ind.type] || 0) + 1;
    const indStr = Object.entries(indCounts)
      .map(([k, c]) => `${INDUSTRY_TYPES[k].icon} ${INDUSTRY_TYPES[k].name}${c > 1 ? ' ×' + c : ''}`)
      .join(' · ');
    const supplyBar = (label, v) => {
      const pct = Math.round(Math.min(1.5, v) / 1.5 * 100);
      const col = v >= 1 ? '#7fb069' : v >= 0.7 ? '#d9a94c' : '#c0503a';
      return `<div class="supply-row"><span class="supply-label">${label}</span><span class="supply-track"><span class="supply-fill" style="width:${pct}%;background:${col}"></span></span><span class="supply-val">${v >= 1.5 ? 'surplus' : Math.round(v * 100) + '%'}</span></div>`;
    };
    this.inspectorTitle.textContent = s.name;
    this.inspectorEl.innerHTML = `
      <div class="insp-row"><b>${TIERS[s.tier].name}</b> of ${Math.round(s.pop).toLocaleString()} ${RACES[s.race].plural.toLowerCase()}</div>
      <div class="insp-row">${n ? `<span class="chip" style="background:${n.color}"></span>${n.name}${s.capital ? ' <b>(capital)</b>' : ''}` : '<i>Independent freehold</i>'}</div>
      <div class="insp-row">Worships <b style="color:${d.color}">${d.name}</b>, ${d.title}</div>
      <div class="insp-row">${b.length ? b.join(' · ') : '<i>No notable structures</i>'}</div>
      <div class="insp-row">${indStr || '<i>No industries yet</i>'}</div>
      <div class="insp-row">
        ${supplyBar('Food', s.supply.food)}
        ${supplyBar('Materials', s.supply.mat)}
        ${s.tier >= 4 ? supplyBar('Luxuries', s.supply.lux) : ''}
      </div>
      <div class="insp-row">${s.routes.length} trade route${s.routes.length === 1 ? '' : 's'}</div>
      ${s.famine ? '<div class="insp-row warn">🍞 Famine! The town starves.</div>' : ''}
      ${s.plague > 0 ? '<div class="insp-row warn">🦠 Plague-stricken!</div>' : ''}
      ${s.droughtTtl > 0 ? '<div class="insp-row warn">☀️ Drought withers the fields.</div>' : ''}
      ${s.stormTtl > 0 ? '<div class="insp-row warn">🌀 Storms close the sea lanes.</div>' : ''}
      <div class="insp-row dim">Founded ${founded} DR</div>`;
    this.inspectorPanel.classList.remove('hidden');
  }

  selectSite(site) {
    this.game.renderer.selected = { kind: 'site', obj: site };
    this.inspectorTitle.textContent = site.name;
    let body = `<div class="insp-row"><b>${SITE_TYPES[site.type].name}</b></div>`;
    if (site.type === 'dragonLair' && site.dragon) {
      const d = site.dragon;
      body += d.slain
        ? `<div class="insp-row">The bones of <b>${d.name}</b> molder here. The wyrm is slain.</div>`
        : `<div class="insp-row">Home to <b style="color:${d.color}">${d.name}</b>, ${d.flavor}.</div>
           <div class="insp-row">Hoard: ~${d.hoard.toLocaleString()} gold</div>
           <div class="insp-row">${d.awake ? '🔥 <b>The dragon is on the wing!</b>' : '😴 The wyrm slumbers... for now.'}</div>`;
    } else if (site.type === 'ruin' || site.type === 'battlefield') {
      body += site.active
        ? `<div class="insp-row">Remaining treasure: ~${Math.max(0, Math.round(site.treasure))} gold</div><div class="insp-row">Delved ${site.explored} time${site.explored === 1 ? '' : 's'}</div>`
        : '<div class="insp-row"><i>Picked clean by adventurers.</i></div>';
    } else if (site.type === 'wizardTower') {
      body += `<div class="insp-row">Arcane radiance: ${site.arcane.toFixed(1)} — hastens the magic of whichever realm claims these lands.</div>`;
    } else if (site.type === 'crypt') {
      body += site.sealed ? '<div class="insp-row">Sealed with silver and prayer.</div>'
        : site.lichActive ? '<div class="insp-row warn">💀 <b>The lich is awake.</b> Undead pour forth.</div>'
        : '<div class="insp-row">Quiet. Too quiet.</div>';
    } else if (site.type === 'mine') {
      body += `<div class="insp-row">Richness: ${(site.richness * 100).toFixed(0)}% — nearby settlements prosper.</div>`;
    } else if (site.type === 'grove') {
      body += '<div class="insp-row">Ancient and holy. Elven folk settle gladly in its shadow.</div>';
    } else if (site.type === 'portal') {
      body += '<div class="insp-row">A door to elsewhere. Sometimes traders come through. Sometimes... other things.</div>';
    }
    this.inspectorEl.innerHTML = body;
    this.inspectorPanel.classList.remove('hidden');
  }

  selectNation(n) {
    const sim = this.game.sim;
    this.game.renderer.selected = null;
    const setts = sim.nationSettlements(n.id);
    const pop = sim.nationPop(n.id);
    const wars = sim.wars.filter(w => w.a === n.id || w.b === n.id)
      .map(w => sim.nations[w.a === n.id ? w.b : w.a].name);
    const rels = sim.livingNations().filter(o => o.id !== n.id)
      .map(o => ({ o, r: sim.getRel(n.id, o.id) }))
      .sort((a, b) => b.r - a.r);
    const relLine = r => `<div class="insp-row dim"><span class="chip" style="background:${r.o.color}"></span>${r.o.name}: <b style="color:${r.r > 20 ? '#8fd18f' : r.r < -20 ? '#e08080' : '#ccc'}">${r.r > 20 ? 'friendly' : r.r < -50 ? 'hostile' : r.r < -20 ? 'cold' : 'neutral'}</b></div>`;
    this.inspectorTitle.textContent = n.name;
    this.inspectorEl.innerHTML = `
      <div class="insp-row"><span class="chip" style="background:${n.color}"></span><b>${n.ruler}</b></div>
      <div class="insp-row">${n.personality.name} ${RACES[n.race].adj} realm — <i>${n.personality.desc.toLowerCase()}</i></div>
      <div class="insp-row">${Math.round(pop).toLocaleString()} souls in ${setts.length} settlements</div>
      <div class="insp-row">State faith: <b>${DEITIES[n.stateDeity].name}</b></div>
      <div class="insp-row">Magic: <b>${MAGIC_LEVELS[n.magicLevel].name}</b> · Treasury: ${Math.round(n.gold)} gold</div>
      ${wars.length ? `<div class="insp-row warn">⚔️ At war with ${wars.join(', ')}</div>` : ''}
      ${rels.slice(0, 2).map(relLine).join('')}
      ${rels.length > 2 ? relLine(rels[rels.length - 1]) : ''}`;
    this.inspectorPanel.classList.remove('hidden');
  }

  // ---------- tooltip ----------
  showTooltip(px, py, tx, ty) {
    const g = this.game, w = g.world, sim = g.sim;
    if (!w.inBounds(tx, ty)) { this.tooltipEl.classList.add('hidden'); return; }
    const i = w.idx(tx, ty);
    const lines = [];
    const sid = w.settleMap[i];
    // nearby settlement?
    let hovered = null;
    for (const s of sim.livingSettlements()) {
      if ((s.x - tx) ** 2 + (s.y - ty) ** 2 <= 1.5) { hovered = s; break; }
    }
    if (hovered) {
      lines.push(`<b>${hovered.name}</b> — ${TIERS[hovered.tier].name}, ${Math.round(hovered.pop).toLocaleString()} ${RACES[hovered.race].plural.toLowerCase()}`);
    }
    for (const site of w.sites) {
      if ((site.x - tx) ** 2 + (site.y - ty) ** 2 <= 1.5) { lines.push(`<b>${site.name}</b> — ${SITE_TYPES[site.type].name}`); break; }
    }
    if (!hovered && w.urbanMap[i] >= 0 && !sim.settlements[w.urbanMap[i]].dead) {
      lines.push(`Streets of <b>${sim.settlements[w.urbanMap[i]].name}</b>`);
    }
    if (w.industryMap[i] >= 0) {
      const owner = sim.settlements[w.industryMap[i]];
      const ind = owner && !owner.dead ? owner.industries.find(v => v.x === tx && v.y === ty) : null;
      if (ind) lines.push(`${INDUSTRY_TYPES[ind.type].icon} ${INDUSTRY_TYPES[ind.type].name} of <b>${owner.name}</b>`);
    }
    lines.push(BIOME_INFO[w.biome[i]].name + (w.river[i] > 0 ? ' · river' : ''));
    const nid = w.nationMap[i];
    if (nid >= 0 && !sim.nations[nid].dead) lines.push(`<span class="chip" style="background:${sim.nations[nid].color}"></span>${sim.nations[nid].name}`);
    this.tooltipEl.innerHTML = lines.join('<br>');
    this.tooltipEl.classList.remove('hidden');
    const pad = 14;
    this.tooltipEl.style.left = Math.min(px + pad, window.innerWidth - 240) + 'px';
    this.tooltipEl.style.top = Math.min(py + pad, window.innerHeight - 80) + 'px';
  }
  hideTooltip() { this.tooltipEl.classList.add('hidden'); }

  // ---------- top bar + minimap ----------
  refreshStatus() {
    const sim = this.game.sim;
    this.dateEl.textContent = sim.dateStr();
    const pop = sim.livingSettlements().reduce((a, s) => a + s.pop, 0);
    this.popEl.textContent = `${Math.round(pop).toLocaleString()} souls · ${sim.livingNations().length} realms`;
  }

  refreshMinimap() {
    const g = this.game, r = g.renderer, w = g.world;
    const mm = this.minimap;
    const ctx = mm.getContext('2d');
    ctx.clearRect(0, 0, mm.width, mm.height);
    ctx.drawImage(r.terrainLayer, 0, 0, mm.width, mm.height);
    ctx.drawImage(r.politicalLayer, 0, 0, mm.width, mm.height);
    // viewport rect
    const sx = mm.width / r.WPX, sy = mm.height / r.HPX;
    const vw = g.canvas.width / r.cam.zoom, vh = g.canvas.height / r.cam.zoom;
    ctx.strokeStyle = 'rgba(255,230,160,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.cam.x * sx, r.cam.y * sy, vw * sx, vh * sy);
  }
}
