/* fousio.js — motion and the few interactive bits (spellbook filter, lightbox, viewers). */
(function () {
  'use strict';
  const doc = document.documentElement;
  doc.classList.add('js');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ── top bar: hairline once the page scrolls, and the section you are in ──
  const top = $('.top');
  const onScroll = () => top && top.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const navLinks = $$('.top nav a[href^="#"]');
  if (navLinks.length) {
    const map = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => a.classList.remove('on'));
        const a = map.get(e.target.id);
        if (a) a.classList.add('on');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  // ── count-up numbers ──
  function countUp(el) {
    const to = parseFloat(el.dataset.count), from = parseFloat(el.dataset.from || 0);
    const prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '', dec = parseInt(el.dataset.dec || '0', 10);
    const fmt = (v) => prefix + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + suffix;
    if (reduced) { el.textContent = fmt(to); return; }
    const dur = parseFloat(el.dataset.dur || 1400), t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── reveal on scroll (also starts count-ups and bar fills inside) ──
  const pending = new Set();
  const show = (el) => {
    if (!pending.has(el)) return;
    pending.delete(el);
    el.classList.add('in');
    $$('[data-count]', el).forEach((n) => { if (!n.dataset.done) { n.dataset.done = 1; countUp(n); } });
    if (el.dataset.count && !el.dataset.done) { el.dataset.done = 1; countUp(el); }
    io.unobserve(el);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) show(e.target); }),
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  $$('[data-reveal], .abil, .tier, .comp, .schools-wrap, .slots-wrap, [data-count]').forEach((el) => { pending.add(el); io.observe(el); });
  // Belt and braces: an anchor jump or a paused tab can skip the observer's first pass,
  // so also sweep whatever is on screen on load, scroll and resize.
  let sweeping = 0;
  const sweep = () => {
    sweeping = 0;
    const H = window.innerHeight;
    pending.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < H * 0.97 && r.bottom > 0) show(el);
    });
  };
  const soon = () => { if (!sweeping) sweeping = requestAnimationFrame(sweep); };
  window.addEventListener('scroll', soon, { passive: true });
  window.addEventListener('resize', soon);
  window.addEventListener('load', () => { sweep(); setTimeout(sweep, 500); });
  setTimeout(sweep, 350);

  // ── ability rings: arc length from the score (30 is a full circle) ──
  $$('.abil').forEach((a) => {
    const c = $('.arc', a); if (!c) return;
    const r = parseFloat(c.getAttribute('r')), len = 2 * Math.PI * r;
    const score = parseFloat(a.dataset.score || 10);
    a.style.setProperty('--len', len.toFixed(1));
    a.style.setProperty('--off', (len * (1 - Math.min(score, 30) / 30)).toFixed(1));
  });

  // ── path to 12: progress bar follows the horizontal scroll ──
  $$('.path').forEach((p) => {
    const track = $('.path-track', p), bar = $('.path-bar i', p);
    if (!track || !bar) return;
    const upd = () => {
      const max = track.scrollWidth - track.clientWidth;
      bar.style.width = (max <= 0 ? 100 : 12 + 88 * (track.scrollLeft / max)) + '%';
    };
    track.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  });

  // ── spellbook: grouped chips, level + school filters, search, and a spell card ──
  const book = $('#book');
  if (book) {
    const chips = $$('button.sp', book), groups = $$('.sgroup', book), count = $('#book-count');
    const data = JSON.parse(($('#spell-data') || {}).textContent || '{}');
    const state = { lv: 'all', school: 'all', q: '' };
    const apply = () => {
      let n = 0;
      const q = state.q.trim().toLowerCase();
      chips.forEach((c) => {
        const ok = (state.school === 'all' || c.dataset.school === state.school) && (!q || c.dataset.q.indexOf(q) !== -1);
        c.hidden = !ok;
      });
      groups.forEach((g) => {
        const vis = (state.lv === 'all' || g.dataset.lv === state.lv) && $$('button.sp:not([hidden])', g).length > 0;
        g.hidden = !vis;
        if (vis) n += $$('button.sp:not([hidden])', g).length;
      });
      if (count) count.textContent = n + (n === 1 ? ' spell' : ' spells');
    };
    $$('[data-filter]').forEach((group) => {
      group.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        $$('button', group).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        state[group.dataset.filter] = b.dataset.v;
        apply();
      });
    });
    const input = $('#book-q');
    if (input) input.addEventListener('input', () => { state.q = input.value; apply(); });
    apply();

    const drawer = $('#spell-drawer');
    let current = null;
    const close = () => {
      if (!drawer) return;
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
      if (current) { current.setAttribute('aria-expanded', 'false'); current = null; }
    };
    const open = (chip) => {
      const s = data[chip.dataset.id]; if (!s || !drawer) return;
      if (current) current.setAttribute('aria-expanded', 'false');
      current = chip; chip.setAttribute('aria-expanded', 'true');
      drawer.className = 'drawer sch-' + (s.school || 'None');
      $('.dk', drawer).textContent = s.kind;
      $('.dn', drawer).textContent = s.name;
      const body = $('.dd', drawer);
      body.textContent = '';
      (s.desc || 'No description in the game files.').split('\n').filter(Boolean).forEach((p) => {
        const el = document.createElement('p'); el.textContent = p; body.appendChild(el);
      });
      $('.dm', drawer).textContent = s.meta || '';
      drawer.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => drawer.classList.add('open'));
    };
    book.addEventListener('click', (e) => {
      const c = e.target.closest('button.sp'); if (!c) return;
      if (current === c) close(); else open(c);
    });
    if (drawer) {
      $('.x', drawer).addEventListener('click', close);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      document.addEventListener('click', (e) => { if (current && !drawer.contains(e.target) && !e.target.closest('button.sp')) close(); });
    }
  }

  // ── horizontal tracks: arrow buttons ──
  $$('[data-scroll]').forEach((b) => b.addEventListener('click', () => {
    const t = document.getElementById(b.dataset.scroll); if (!t) return;
    t.scrollBy({ left: (b.dataset.dir === 'prev' ? -1 : 1) * t.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  }));
  // each arrow dims at its end of the track; the pair hides when everything already fits
  new Set($$('[data-scroll]').map((b) => b.dataset.scroll)).forEach((id) => {
    const t = document.getElementById(id); if (!t) return;
    const btns = $$('[data-scroll="' + id + '"]');
    const sync = () => {
      const max = t.scrollWidth - t.clientWidth;
      btns[0].parentElement.classList.toggle('is-static', max <= 8);   // slack for scroll-snap padding
      btns.forEach((b) => { b.disabled = b.dataset.dir === 'prev' ? t.scrollLeft <= 8 : t.scrollLeft >= max - 8; });
    };
    t.addEventListener('scroll', sync, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(t); else window.addEventListener('resize', sync);
    sync();
  });

  // ── gallery lightbox ──
  const dlg = $('dialog.lightbox');
  if (dlg) {
    const img = $('img', dlg);
    $$('[data-full]').forEach((b) => b.addEventListener('click', () => {
      img.src = b.dataset.full; img.alt = b.dataset.alt || '';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }));
    dlg.addEventListener('click', () => dlg.close());
  }

  // ── hero portrait: a little depth when the pointer moves ──
  const portrait = $('.portrait img');
  if (portrait && !reduced && window.matchMedia('(pointer: fine)').matches) {
    let raf = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        portrait.style.translate = (tx * -10).toFixed(1) + 'px ' + (ty * -8).toFixed(1) + 'px';
      });
    });
  }

  // ── 3D viewers: start when their stage scrolls near the viewport ──
  if (window.FousioViewer) {
    const stages = $$('[data-model]');
    const start = (el) => {
      if (el._viewer) return;
      const o = {};
      const narrow = window.innerWidth < 600;
      ['spin', 'elevation', 'fov', 'fit', 'tilt', 'float', 'exposure', 'lift', 'level', 'roughness'].forEach((k) => {
        const m = el.dataset[k + 'Mobile'];                  // data-fit-mobile etc. win on phones
        if (narrow && m !== undefined) o[k] = parseFloat(m);
        else if (el.dataset[k] !== undefined) o[k] = parseFloat(el.dataset[k]);
      });
      o.src = el.dataset.model;
      try { el._viewer = new window.FousioViewer(el, o); } catch (err) { el.classList.add('fv-error'); }
    };
    const vio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { start(e.target); vio.unobserve(e.target); } }), { rootMargin: '300px' });
    stages.forEach((el) => vio.observe(el));
    const near = () => stages.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 300 && r.bottom > -300) start(el);
    });
    window.addEventListener('scroll', near, { passive: true });
    window.addEventListener('load', near);
    setTimeout(near, 400);

    // variant switcher (circlet page)
    $$('[data-variants]').forEach((bar) => {
      const target = document.getElementById(bar.dataset.variants);
      const cap = document.getElementById(bar.dataset.caption);
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || !target) return;
        $$('button', bar).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        start(target);
        target._viewer.load(b.dataset.src, { roughness: b.dataset.rough ? parseFloat(b.dataset.rough) : undefined, level: parseFloat(b.dataset.level || '0') });
        if (cap && b.dataset.cap) cap.textContent = b.dataset.cap;
      });
    });
  }
})();
