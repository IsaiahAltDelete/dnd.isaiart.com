// Boot, camera, input, game loop.
'use strict';

class Game {
  constructor() {
    this.canvas = document.getElementById('map');
    this.speed = 1; // index into SPEEDS
    this.SPEEDS = [0, 2, 6, 16]; // ticks per second
    this.simAccum = 0;
    this.lastFrame = performance.now();
    this.uiTimer = 0;
    this.mmTimer = 0;
    this.newWorld(String(Math.floor(Math.random() * 1e9)));
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(t => this.loop(t));
    // rAF stops in hidden tabs; keep the world alive in the background
    setInterval(() => {
      if (!document.hidden || !this.sim) return;
      const tps = this.SPEEDS[this.speed];
      for (let i = 0; i < tps / 4; i++) this.sim.tick();
      this.lastFrame = performance.now();
    }, 250);
  }

  newWorld(seedStr) {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('seed-display').textContent = 'Seed: ' + seedStr;
    // defer so the loading screen paints
    setTimeout(() => {
      this.world = new World(seedStr);
      this.sim = new Sim(this.world, seedStr);
      this.renderer = new Renderer(this.canvas, this.world, this.sim);
      if (!this.ui) {
        this.ui = new UI(this);
      } else {
        this.ui.game = this;
        this.ui.logEl.innerHTML = '';
        this.ui.inspectorPanel.classList.add('hidden');
      }
      this.sim.onEvent = ev => this.ui.addEvent(ev);
      this.sim.onNews = () => this.ui.refreshCrier();
      this.activeTool = null;
      this.ui.resetTool();
      this.sim.pushNews('The Town Crier begins its rounds. All the news that fits on parchment.');
      this.renderer.loadSprites(() => {
        this.renderer.bakeTerrain();
        this.sim.recomputeTerritory();
        this.sim.recomputeTrade();
        this.renderer.redrawPolitical();
        this.renderer.redrawFaith();
        this.renderer.redrawTrade();
        this.ui.rebuildLog();
        this.ui.refreshRealms();
        this.ui.refreshStatus();
        this.ui.refreshMinimap();
        this.fitCamera();
        document.getElementById('loading').classList.add('hidden');
      });
    }, 30);
  }

  resize() {
    this.canvas.width = Math.max(320, window.innerWidth);
    this.canvas.height = Math.max(240, window.innerHeight);
    if (this.renderer) this.clampCamera();
  }

  fitCamera() {
    this.resize();
    const r = this.renderer;
    r.cam.zoom = Math.max(0.5, Math.max(this.canvas.width / r.WPX, this.canvas.height / r.HPX) * 1.02);
    r.cam.x = (r.WPX - this.canvas.width / r.cam.zoom) / 2;
    r.cam.y = (r.HPX - this.canvas.height / r.cam.zoom) / 2;
  }

  clampCamera() {
    const r = this.renderer;
    const vw = this.canvas.width / r.cam.zoom, vh = this.canvas.height / r.cam.zoom;
    const mx = 120, my = 120;
    r.cam.x = Math.max(-mx, Math.min(r.WPX - vw + mx, r.cam.x));
    r.cam.y = Math.max(-my, Math.min(r.HPX - vh + my, r.cam.y));
  }

  centerOn(tx, ty, zoom = null) {
    const r = this.renderer;
    if (zoom) r.cam.zoom = zoom;
    r.cam.x = tx * TS - this.canvas.width / r.cam.zoom / 2;
    r.cam.y = ty * TS - this.canvas.height / r.cam.zoom / 2;
    this.clampCamera();
  }

  screenToWorld(px, py) {
    const r = this.renderer;
    return { x: px / r.cam.zoom + r.cam.x, y: py / r.cam.zoom + r.cam.y };
  }

  bindInput() {
    const cv = this.canvas;
    let dragging = false, moved = 0, lastX = 0, lastY = 0;
    cv.addEventListener('mousedown', e => {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', e => {
      if (dragging && moved < 5 && e.target === cv) this.handleClick(e.clientX, e.clientY);
      dragging = false;
    });
    window.addEventListener('mousemove', e => {
      if (dragging) {
        const r = this.renderer;
        r.cam.x -= (e.clientX - lastX) / r.cam.zoom;
        r.cam.y -= (e.clientY - lastY) / r.cam.zoom;
        moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
        this.clampCamera();
        this.ui.hideTooltip();
      } else if (e.target === cv && this.renderer) {
        const wpt = this.screenToWorld(e.clientX, e.clientY);
        const hx = Math.floor(wpt.x / TS), hy = Math.floor(wpt.y / TS);
        this.renderer.hoverTile = { x: hx, y: hy };
        if (this.activeTool) this.ui.hideTooltip();
        else this.ui.showTooltip(e.clientX, e.clientY, hx, hy);
      }
    });
    cv.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (this.activeTool) this.ui.resetTool();
    });
    cv.addEventListener('mouseleave', () => this.ui && this.ui.hideTooltip());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = this.renderer;
      const before = this.screenToWorld(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      r.cam.zoom = Math.max(0.5, Math.min(7, r.cam.zoom * factor));
      const after = this.screenToWorld(e.clientX, e.clientY);
      r.cam.x += before.x - after.x;
      r.cam.y += before.y - after.y;
      this.clampCamera();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Escape' && this.activeTool) this.ui.resetTool();
      if (e.code === 'Space') {
        e.preventDefault();
        this.speed = this.speed === 0 ? 1 : 0;
        document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', +b.dataset.speed === this.speed));
      }
      if (e.key >= '1' && e.key <= '3') {
        this.speed = +e.key;
        document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', +b.dataset.speed === this.speed));
      }
    });
  }

  handleClick(px, py) {
    const wpt = this.screenToWorld(px, py);
    const tx = wpt.x / TS, ty = wpt.y / TS;
    // god tools intercept clicks
    if (this.activeTool) {
      const gx = Math.floor(tx), gy = Math.floor(ty);
      let result;
      if (this.activeTool.kind === 'found') result = this.sim.godFound(gx, gy);
      else if (this.activeTool.kind === 'industry') result = this.sim.godIndustry(this.activeTool.type, gx, gy);
      else if (this.activeTool.kind === 'bless') result = this.sim.godBless(gx, gy);
      else if (this.activeTool.kind === 'disaster') {
        result = this.sim.triggerDisaster(this.activeTool.type, gx, gy, true);
        if (result === false) result = 'The gods find no purchase here.';
      }
      if (result !== true) this.ui.toast(result || 'It cannot be done.');
      return;
    }
    // clicked town sprawl or industry selects its settlement directly
    let best = null;
    const gx = Math.floor(tx), gy = Math.floor(ty);
    if (this.world.inBounds(gx, gy)) {
      const gi = this.world.idx(gx, gy);
      const owner = this.world.urbanMap[gi] >= 0 ? this.world.urbanMap[gi]
        : this.world.industryMap[gi] >= 0 ? this.world.industryMap[gi] : -1;
      if (owner >= 0 && !this.sim.settlements[owner].dead) best = { kind: 'settlement', obj: this.sim.settlements[owner] };
    }
    // else nearest settlement, then site
    let bd = 2.2 * 2.2;
    if (!best) for (const s of this.sim.livingSettlements()) {
      const d2 = (s.x + 0.5 - tx) ** 2 + (s.y + 0.5 - ty) ** 2;
      if (d2 < bd) { bd = d2; best = { kind: 'settlement', obj: s }; }
    }
    if (!best) {
      bd = 2.2 * 2.2;
      for (const site of this.world.sites) {
        const d2 = (site.x + 0.5 - tx) ** 2 + (site.y + 0.5 - ty) ** 2;
        if (d2 < bd) { bd = d2; best = { kind: 'site', obj: site }; }
      }
    }
    if (best) {
      if (best.kind === 'settlement') this.ui.selectSettlement(best.obj);
      else this.ui.selectSite(best.obj);
    } else {
      this.renderer.selected = null;
      this.ui.inspectorPanel.classList.add('hidden');
    }
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    // self-heal if the window had no size at boot (hidden tab, embedded preview)
    if (this.renderer && window.innerWidth > 0 &&
        (this.canvas.width !== Math.max(320, window.innerWidth) || !(this.renderer.cam.zoom >= 0.5))) {
      this.fitCamera();
    }
    if (this.sim && this.renderer && this.renderer.terrainBaked !== false) {
      // simulation ticks
      const tps = this.SPEEDS[this.speed];
      if (tps > 0) {
        this.simAccum += dt * tps;
        let steps = 0;
        while (this.simAccum >= 1 && steps < 6) {
          this.sim.tick();
          this.simAccum -= 1;
          steps++;
        }
        if (this.simAccum > 6) this.simAccum = 0;
      }
      this.renderer.frame(dt);
      // periodic UI refresh
      this.uiTimer += dt;
      if (this.uiTimer > 0.6) {
        this.uiTimer = 0;
        this.ui.refreshStatus();
        this.ui.refreshRealms();
        // refresh open inspector
        const sel = this.renderer.selected;
        if (sel && !this.ui.inspectorPanel.classList.contains('hidden')) {
          if (sel.kind === 'settlement' && !sel.obj.dead) this.ui.selectSettlement(sel.obj);
          else if (sel.kind === 'site') this.ui.selectSite(sel.obj);
        }
      }
      this.mmTimer += dt;
      if (this.mmTimer > 2) {
        this.mmTimer = 0;
        this.ui.refreshMinimap();
      }
    }
    requestAnimationFrame(t => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
