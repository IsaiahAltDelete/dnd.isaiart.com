(() => {
  "use strict";

  const API_URL = "https://api.open5e.com/v2/spells/?document__key__in=srd-2014&limit=500&fields=key,name,desc,level,higher_level,school,classes,range_text,ritual,casting_time,reaction_condition,verbal,somatic,material,material_specified,duration,concentration,attack_roll,damage_roll,damage_types,saving_throw_ability";
  const CACHE_KEY = "arcana-index:open5e-v2:srd-2014";
  const FAVORITES_KEY = "arcana-index:favorites";
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const PAGE_SIZE = 24;

  const SCHOOL_META = {
    abjuration: { name: "Abjuration", color: "#4eb7bd", glyph: "⟐" },
    conjuration: { name: "Conjuration", color: "#6e8ed8", glyph: "◈" },
    divination: { name: "Divination", color: "#ae79d6", glyph: "◉" },
    enchantment: { name: "Enchantment", color: "#d9a84f", glyph: "✦" },
    evocation: { name: "Evocation", color: "#d85c50", glyph: "✹" },
    illusion: { name: "Illusion", color: "#8da4b2", glyph: "◌" },
    necromancy: { name: "Necromancy", color: "#65aa72", glyph: "☽" },
    transmutation: { name: "Transmutation", color: "#d4834f", glyph: "⟁" }
  };

  const offlineSpell = (key, name, level, school, classes, desc, options = {}) => ({
    key: `srd_${key}`,
    name,
    level,
    school: { key: school, name: SCHOOL_META[school].name },
    classes: classes.map((className) => ({ key: `srd_${className.toLowerCase()}`, name: className })),
    desc,
    higher_level: options.higher || "",
    range_text: options.range || "Varies",
    casting_time: options.time || "action",
    duration: options.duration || "instantaneous",
    ritual: Boolean(options.ritual),
    concentration: Boolean(options.concentration),
    verbal: options.verbal !== false,
    somatic: options.somatic !== false,
    material: Boolean(options.material),
    material_specified: options.materialText || "",
    attack_roll: Boolean(options.attack),
    damage_roll: options.damage || "",
    damage_types: options.damageType ? [options.damageType] : [],
    saving_throw_ability: options.save || ""
  });

  const FALLBACK_SPELLS = [
    offlineSpell("fireball", "Fireball", 3, "evocation", ["Sorcerer", "Wizard"], "A bright streak blooms into a roaring sphere of flame. Creatures caught in the blast attempt a Dexterity saving throw.", { range: "150 feet", damage: "8d6", damageType: "fire", save: "dexterity", material: true, materialText: "Sulfur and bat guano.", higher: "The damage increases when cast with a spell slot above 3rd level." }),
    offlineSpell("mage-hand", "Mage Hand", 0, "conjuration", ["Bard", "Sorcerer", "Warlock", "Wizard"], "A spectral hand appears at a point within range and manipulates a nearby object at your direction.", { range: "30 feet", duration: "1 minute", somatic: true }),
    offlineSpell("shield", "Shield", 1, "abjuration", ["Sorcerer", "Wizard"], "An invisible barrier of magical force protects you until the start of your next turn.", { time: "reaction", duration: "1 round", range: "Self" }),
    offlineSpell("cure-wounds", "Cure Wounds", 1, "evocation", ["Bard", "Cleric", "Druid", "Paladin", "Ranger"], "A creature you touch regains hit points as restorative magic closes its wounds.", { range: "Touch" }),
    offlineSpell("misty-step", "Misty Step", 2, "conjuration", ["Sorcerer", "Warlock", "Wizard"], "Briefly surrounded by silver mist, you teleport to an unoccupied space you can see.", { time: "bonus action", range: "Self" }),
    offlineSpell("counterspell", "Counterspell", 3, "abjuration", ["Sorcerer", "Warlock", "Wizard"], "You interrupt a creature in the act of casting, attempting to unravel its spell before it takes effect.", { time: "reaction", range: "60 feet" }),
    offlineSpell("detect-magic", "Detect Magic", 1, "divination", ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Wizard"], "You sense the presence of magic nearby and may perceive the school of a visible magical aura.", { range: "Self", duration: "10 minutes", ritual: true, concentration: true }),
    offlineSpell("invisibility", "Invisibility", 2, "illusion", ["Bard", "Sorcerer", "Warlock", "Wizard"], "A creature you touch becomes unseen until the spell ends or it reveals itself through hostile action.", { range: "Touch", duration: "1 hour", concentration: true, material: true }),
    offlineSpell("polymorph", "Polymorph", 4, "transmutation", ["Bard", "Druid", "Sorcerer", "Wizard"], "You transform a creature into a new beast form for the duration.", { range: "60 feet", duration: "1 hour", concentration: true, save: "wisdom", material: true }),
    offlineSpell("revivify", "Revivify", 3, "necromancy", ["Cleric", "Paladin"], "You return a creature that has very recently died to life with a spark of vitality.", { range: "Touch", material: true, materialText: "Diamonds worth 300 gp, consumed by the spell." }),
    offlineSpell("eldritch-blast", "Eldritch Blast", 0, "evocation", ["Warlock"], "A beam of crackling energy streaks toward a creature within range.", { range: "120 feet", attack: true, damage: "1d10", damageType: "force" }),
    offlineSpell("wish", "Wish", 9, "conjuration", ["Sorcerer", "Wizard"], "The mightiest mortal magic reshapes reality by duplicating a lesser spell or producing an extraordinary effect.", { range: "Self" })
  ];

  const els = {
    search: document.querySelector("#search"),
    classFilter: document.querySelector("#class-filter"),
    levelFilter: document.querySelector("#level-filter"),
    schoolFilter: document.querySelector("#school-filter"),
    sortFilter: document.querySelector("#sort-filter"),
    schoolSpectrum: document.querySelector("#school-spectrum"),
    resultCount: document.querySelector("#result-count"),
    activeQuery: document.querySelector("#active-query"),
    spellGrid: document.querySelector("#spell-grid"),
    emptyState: document.querySelector("#empty-state"),
    loadMore: document.querySelector("#load-more"),
    loadMoreCount: document.querySelector("#load-more-count"),
    clearFilters: document.querySelector("#clear-filters"),
    emptyClear: document.querySelector("#empty-clear"),
    randomSpell: document.querySelector("#random-spell"),
    navFavorites: document.querySelector("#nav-favorites"),
    favoriteCount: document.querySelector("#favorite-count"),
    dataStatus: document.querySelector("#data-status"),
    statusOrb: document.querySelector("#status-orb"),
    heroCount: document.querySelector("#hero-count"),
    dialog: document.querySelector("#spell-dialog"),
    folio: document.querySelector("#folio"),
    dialogMark: document.querySelector("#dialog-mark"),
    dialogSchool: document.querySelector("#dialog-school"),
    dialogName: document.querySelector("#dialog-name"),
    dialogSubtitle: document.querySelector("#dialog-subtitle"),
    dialogMeta: document.querySelector("#dialog-meta"),
    dialogBadges: document.querySelector("#dialog-badges"),
    dialogDescription: document.querySelector("#dialog-description"),
    higherSection: document.querySelector("#higher-section"),
    dialogHigher: document.querySelector("#dialog-higher"),
    closeDialog: document.querySelector("#close-dialog"),
    dialogFavorite: document.querySelector("#dialog-favorite"),
    copySpell: document.querySelector("#copy-spell"),
    toast: document.querySelector("#toast")
  };

  const state = {
    query: "",
    classKey: "",
    level: "",
    school: "",
    sort: "name",
    favoritesOnly: false,
    visible: PAGE_SIZE
  };

  let allSpells = [];
  let filteredSpells = [];
  let activeSpell = null;
  let toastTimer = 0;
  let favorites = readFavorites();

  function readFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch {
      // Favorites remain usable for this session when storage is unavailable.
    }
  }

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !Array.isArray(cached.spells) || cached.spells.length < 250) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function saveCache(spells) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), spells }));
    } catch {
      // A full cache is an enhancement; live data still works without it.
    }
  }

  function normalizeSpell(raw) {
    const schoolKey = String(raw.school?.key || raw.school?.index || "unknown").toLowerCase();
    return {
      key: String(raw.key || raw.index || raw.name).replace(/\s+/g, "-").toLowerCase(),
      name: String(raw.name || "Unnamed spell"),
      level: Number(raw.level) || 0,
      school: {
        key: schoolKey,
        name: String(raw.school?.name || SCHOOL_META[schoolKey]?.name || "Unknown")
      },
      classes: Array.isArray(raw.classes) ? raw.classes.map((item) => ({
        key: String(item.key || item.index || item.name).toLowerCase(),
        name: String(item.name || "Unknown")
      })) : [],
      desc: Array.isArray(raw.desc) ? raw.desc.join("\n\n") : String(raw.desc || "No inscription survives for this spell."),
      higher_level: Array.isArray(raw.higher_level) ? raw.higher_level.join("\n\n") : String(raw.higher_level || ""),
      range_text: String(raw.range_text || raw.range || "Varies"),
      ritual: Boolean(raw.ritual),
      casting_time: String(raw.casting_time || "Varies"),
      reaction_condition: String(raw.reaction_condition || ""),
      verbal: Boolean(raw.verbal ?? raw.components?.includes?.("V")),
      somatic: Boolean(raw.somatic ?? raw.components?.includes?.("S")),
      material: Boolean(raw.material === true || raw.components?.includes?.("M")),
      material_specified: typeof raw.material === "string" ? raw.material : String(raw.material_specified || ""),
      duration: String(raw.duration || "Varies"),
      concentration: Boolean(raw.concentration),
      attack_roll: Boolean(raw.attack_roll),
      damage_roll: String(raw.damage_roll || ""),
      damage_types: Array.isArray(raw.damage_types) ? raw.damage_types.map(String) : [],
      saving_throw_ability: String(raw.saving_throw_ability || "")
    };
  }

  function setArchive(spells, status, statusClass) {
    allSpells = spells.map(normalizeSpell).filter((spell) => spell.name);
    syncFilterOptions();
    els.heroCount.textContent = String(allSpells.length);
    els.dataStatus.textContent = status;
    els.statusOrb.className = `status-orb ${statusClass || ""}`.trim();
    els.spellGrid.setAttribute("aria-busy", "false");
    applyFilters(true);
  }

  function syncFilterOptions() {
    const previousClass = els.classFilter.value;
    const classes = new Map();
    allSpells.forEach((spell) => spell.classes.forEach((item) => classes.set(item.key, item.name)));
    const sortedClasses = [...classes.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    els.classFilter.innerHTML = '<option value="">All classes</option>' + sortedClasses
      .map(([key, name]) => `<option value="${escapeHtml(key)}">${escapeHtml(name)}</option>`)
      .join("");
    if (classes.has(previousClass)) els.classFilter.value = previousClass;
  }

  function buildSchoolControls() {
    els.schoolFilter.innerHTML = '<option value="">All schools</option>' + Object.entries(SCHOOL_META)
      .map(([key, meta]) => `<option value="${key}">${meta.name}</option>`)
      .join("");

    els.schoolSpectrum.innerHTML = [
      '<button class="school-chip active" type="button" data-school="" style="--school:#c8a96b"><i></i>All schools</button>',
      ...Object.entries(SCHOOL_META).map(([key, meta]) =>
        `<button class="school-chip" type="button" data-school="${key}" style="--school:${meta.color}"><i></i>${meta.name}</button>`
      )
    ].join("");
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function levelLabel(level, compact = false) {
    if (Number(level) === 0) return "Cantrip";
    if (compact) return `Level ${level}`;
    const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
    return `${level}${suffix}-level`;
  }

  function componentsFor(spell) {
    return [spell.verbal && "V", spell.somatic && "S", spell.material && "M"].filter(Boolean);
  }

  function applyFilters(resetVisible = true) {
    state.query = els.search.value.trim();
    state.classKey = els.classFilter.value;
    state.level = els.levelFilter.value;
    state.school = els.schoolFilter.value;
    state.sort = els.sortFilter.value;
    if (resetVisible) state.visible = PAGE_SIZE;

    const query = state.query.toLocaleLowerCase();
    filteredSpells = allSpells.filter((spell) => {
      const searchField = `${spell.name} ${spell.desc} ${spell.school.name} ${spell.classes.map((item) => item.name).join(" ")}`.toLocaleLowerCase();
      const matchesQuery = !query || searchField.includes(query);
      const matchesClass = !state.classKey || spell.classes.some((item) => item.key === state.classKey);
      const matchesLevel = state.level === "" || String(spell.level) === state.level;
      const matchesSchool = !state.school || spell.school.key === state.school;
      const matchesFavorite = !state.favoritesOnly || favorites.has(spell.key);
      return matchesQuery && matchesClass && matchesLevel && matchesSchool && matchesFavorite;
    });

    filteredSpells.sort((a, b) => {
      if (state.sort === "level-asc") return a.level - b.level || a.name.localeCompare(b.name);
      if (state.sort === "level-desc") return b.level - a.level || a.name.localeCompare(b.name);
      if (state.sort === "school") return a.school.name.localeCompare(b.school.name) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

    updateSchoolChips();
    renderResults();
  }

  function updateSchoolChips() {
    els.schoolSpectrum.querySelectorAll(".school-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.school === state.school);
    });
  }

  function getSchoolMeta(key) {
    return SCHOOL_META[key] || { name: "Arcane", color: "#c8a96b", glyph: "✧" };
  }

  function spellCard(spell, index) {
    const meta = getSchoolMeta(spell.school.key);
    const classes = spell.classes.length ? spell.classes.map((item) => item.name).join(", ") : "Unbound tradition";
    const traits = [
      spell.ritual && "Ritual",
      spell.concentration && "Focus",
      spell.damage_roll && spell.damage_roll,
      spell.saving_throw_ability && `${titleCase(spell.saving_throw_ability)} save`
    ].filter(Boolean).slice(0, 3);
    const favorite = favorites.has(spell.key);
    const safeKey = escapeHtml(spell.key);

    return `
      <article class="spell-card" style="--school:${meta.color};animation-delay:${Math.min(index, 9) * 35}ms">
        <button class="spell-card__open" type="button" data-open="${safeKey}" aria-label="Read ${escapeHtml(spell.name)}">
          <span class="spell-card__topline">
            <span class="spell-card__school"><i aria-hidden="true">${meta.glyph}</i>${escapeHtml(spell.school.name)}</span>
            <span class="spell-card__level">${levelLabel(spell.level, true)}</span>
          </span>
          <h3>${escapeHtml(spell.name)}</h3>
          <p class="spell-card__classes">${escapeHtml(classes)}</p>
          <span class="spell-card__footer">
            <span class="spell-card__traits">${traits.map((trait) => `<span class="trait">${escapeHtml(trait)}</span>`).join("")}</span>
            <span class="spell-card__read">Read folio <b aria-hidden="true">→</b></span>
          </span>
        </button>
        <button class="favorite-button ${favorite ? "active" : ""}" type="button" data-favorite="${safeKey}" aria-label="${favorite ? "Remove" : "Add"} ${escapeHtml(spell.name)} ${favorite ? "from" : "to"} my grimoire" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button>
      </article>`;
  }

  function renderResults() {
    const visibleSpells = filteredSpells.slice(0, state.visible);
    els.resultCount.textContent = String(filteredSpells.length);
    els.spellGrid.innerHTML = visibleSpells.map(spellCard).join("");
    els.emptyState.hidden = filteredSpells.length !== 0;
    els.spellGrid.hidden = filteredSpells.length === 0;

    const remaining = Math.max(0, filteredSpells.length - visibleSpells.length);
    els.loadMore.hidden = remaining === 0;
    els.loadMoreCount.textContent = remaining ? `${remaining} inscriptions remain` : "";
    els.activeQuery.textContent = describeActiveQuery();
    renderFavoriteCount();
  }

  function describeActiveQuery() {
    const parts = [];
    if (state.query) parts.push(`matching “${state.query}”`);
    if (state.classKey) parts.push(`for ${els.classFilter.selectedOptions[0]?.textContent}`);
    if (state.level !== "") parts.push(state.level === "0" ? "among cantrips" : `at level ${state.level}`);
    if (state.school) parts.push(`within ${getSchoolMeta(state.school).name}`);
    if (state.favoritesOnly) parts.push("saved in your grimoire");
    return parts.length ? `Showing spells ${parts.join(" · ")}.` : "Showing the complete fifth-edition SRD archive.";
  }

  function renderFavoriteCount() {
    els.favoriteCount.textContent = String(favorites.size);
    els.navFavorites.setAttribute("aria-pressed", String(state.favoritesOnly));
  }

  function toggleFavorite(key) {
    const spell = allSpells.find((item) => item.key === key);
    if (!spell) return;
    const wasFavorite = favorites.has(key);
    if (wasFavorite) favorites.delete(key);
    else favorites.add(key);
    saveFavorites();
    showToast(wasFavorite ? `${spell.name} removed from your grimoire.` : `${spell.name} added to your grimoire.`);
    if (state.favoritesOnly) applyFilters(false);
    else renderResults();
    if (activeSpell?.key === key) updateDialogFavorite();
  }

  function openSpell(key) {
    const spell = allSpells.find((item) => item.key === key);
    if (!spell) return;
    activeSpell = spell;
    const meta = getSchoolMeta(spell.school.key);
    const components = componentsFor(spell);
    const classes = spell.classes.length ? spell.classes.map((item) => item.name).join(", ") : "Unbound tradition";

    els.folio.style.setProperty("--school", meta.color);
    els.dialogMark.textContent = meta.glyph;
    els.dialogSchool.textContent = spell.school.name;
    els.dialogName.textContent = spell.name;
    els.dialogSubtitle.textContent = `${levelLabel(spell.level)} ${spell.school.name.toLowerCase()}`;
    els.dialogMeta.innerHTML = [
      ["Casting time", spell.casting_time + (spell.reaction_condition ? ` — ${spell.reaction_condition}` : "")],
      ["Range", spell.range_text],
      ["Duration", spell.duration],
      ["Classes", classes]
    ].map(([label, value]) => `<div class="meta-item"><b>${escapeHtml(label)}</b><span title="${escapeHtml(titleCase(value))}">${escapeHtml(titleCase(value))}</span></div>`).join("");

    const badges = [
      { label: levelLabel(spell.level, true), accent: true },
      components.length && { label: `Components ${components.join(" · ")}` },
      spell.ritual && { label: "Ritual" },
      spell.concentration && { label: "Concentration" },
      spell.attack_roll && { label: "Attack roll" },
      spell.saving_throw_ability && { label: `${titleCase(spell.saving_throw_ability)} save` },
      spell.damage_roll && { label: `${spell.damage_roll} ${spell.damage_types.join(" ")}` }
    ].filter(Boolean);
    els.dialogBadges.innerHTML = badges.map((badge) => `<span class="folio-badge ${badge.accent ? "folio-badge--accent" : ""}">${escapeHtml(badge.label)}</span>`).join("");

    let description = spell.desc;
    if (spell.material && spell.material_specified) description += `\n\nMaterial: ${spell.material_specified}`;
    els.dialogDescription.innerHTML = paragraphs(description);
    els.higherSection.hidden = !spell.higher_level;
    els.dialogHigher.innerHTML = spell.higher_level ? paragraphs(spell.higher_level) : "";
    updateDialogFavorite();

    if (!els.dialog.open) els.dialog.showModal();
    document.body.classList.add("dialog-open");
  }

  function updateDialogFavorite() {
    if (!activeSpell) return;
    const favorite = favorites.has(activeSpell.key);
    els.dialogFavorite.classList.toggle("active", favorite);
    els.dialogFavorite.innerHTML = favorite
      ? '<span aria-hidden="true">★</span> Saved in my grimoire'
      : '<span aria-hidden="true">☆</span> Add to my grimoire';
    els.dialogFavorite.setAttribute("aria-pressed", String(favorite));
  }

  function closeDialog() {
    if (els.dialog.open) els.dialog.close();
  }

  async function copyActiveSpell() {
    if (!activeSpell) return;
    const spell = activeSpell;
    const details = [
      spell.name,
      `${levelLabel(spell.level)} ${spell.school.name.toLowerCase()}`,
      `Casting Time: ${titleCase(spell.casting_time)}`,
      `Range: ${titleCase(spell.range_text)}`,
      `Duration: ${titleCase(spell.duration)}`,
      `Components: ${componentsFor(spell).join(", ") || "None"}`,
      "",
      spell.desc,
      spell.higher_level ? `\nAt Higher Levels: ${spell.higher_level}` : ""
    ].filter((line) => line !== "").join("\n");

    try {
      await navigator.clipboard.writeText(details);
      showToast("Spell details copied to the clipboard.");
    } catch {
      const area = document.createElement("textarea");
      area.value = details;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showToast("Spell details copied to the clipboard.");
    }
  }

  function clearFilters() {
    els.search.value = "";
    els.classFilter.value = "";
    els.levelFilter.value = "";
    els.schoolFilter.value = "";
    els.sortFilter.value = "name";
    state.favoritesOnly = false;
    applyFilters(true);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function paragraphs(text) {
    return String(text)
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    })[character]);
  }

  async function syncLiveArchive() {
    const cached = readCache();
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      els.dataStatus.textContent = "Live archive cached";
      els.statusOrb.className = "status-orb live";
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 14000);
    try {
      const response = await fetch(API_URL, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Archive returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.results) || payload.results.length < 250) throw new Error("Archive response was incomplete");
      saveCache(payload.results);
      const previousCount = allSpells.length;
      setArchive(payload.results, "Live archive attuned", "live");
      if (previousCount < payload.results.length) showToast(`${payload.results.length} spells are now attuned.`);
    } catch (error) {
      console.warn("Live archive unavailable; continuing with the local folio.", error);
      if (cached) {
        els.dataStatus.textContent = "Cached archive available";
        els.statusOrb.className = "status-orb live";
      } else {
        els.dataStatus.textContent = "Offline folio available";
        els.statusOrb.className = "status-orb offline";
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function bindEvents() {
    let searchTimer = 0;
    els.search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => applyFilters(true), 120);
    });
    [els.classFilter, els.levelFilter, els.schoolFilter, els.sortFilter].forEach((element) => {
      element.addEventListener("change", () => applyFilters(true));
    });

    els.schoolSpectrum.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-school]");
      if (!chip) return;
      els.schoolFilter.value = chip.dataset.school;
      applyFilters(true);
    });

    els.spellGrid.addEventListener("click", (event) => {
      const favoriteButton = event.target.closest("[data-favorite]");
      if (favoriteButton) {
        toggleFavorite(favoriteButton.dataset.favorite);
        return;
      }
      const openButton = event.target.closest("[data-open]");
      if (openButton) openSpell(openButton.dataset.open);
    });

    els.loadMore.addEventListener("click", () => {
      state.visible += PAGE_SIZE;
      renderResults();
    });
    els.clearFilters.addEventListener("click", clearFilters);
    els.emptyClear.addEventListener("click", clearFilters);
    els.randomSpell.addEventListener("click", () => {
      const pool = filteredSpells.length ? filteredSpells : allSpells;
      if (pool.length) openSpell(pool[Math.floor(Math.random() * pool.length)].key);
    });
    els.navFavorites.addEventListener("click", () => {
      state.favoritesOnly = !state.favoritesOnly;
      applyFilters(true);
      document.querySelector("#results-title").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.closeDialog.addEventListener("click", closeDialog);
    els.dialog.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      activeSpell = null;
    });
    els.dialog.addEventListener("click", (event) => {
      const rect = els.folio.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closeDialog();
    });
    els.dialogFavorite.addEventListener("click", () => activeSpell && toggleFavorite(activeSpell.key));
    els.copySpell.addEventListener("click", copyActiveSpell);

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && !els.dialog.open && !["INPUT", "SELECT", "TEXTAREA"].includes(tag)) {
        event.preventDefault();
        els.search.focus();
      }
    });
  }

  function init() {
    buildSchoolControls();
    bindEvents();
    const cached = readCache();
    if (cached) setArchive(cached.spells, "Archive restored", "live");
    else setArchive(FALLBACK_SPELLS, "Attuning live archive…", "");
    syncLiveArchive();
  }

  init();
})();
