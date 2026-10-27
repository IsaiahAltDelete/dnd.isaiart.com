(() => {
  "use strict";

  const API_URL = "https://api.open5e.com/v2/spells/?document__key__in=srd-2014&limit=500&fields=key,name,desc,level,higher_level,school,classes,range_text,ritual,casting_time,reaction_condition,verbal,somatic,material,material_specified,duration,concentration,attack_roll,damage_roll,damage_types,saving_throw_ability";
  const CACHE_KEY = "arcana-index:open5e-v2:srd-2014";
  const FAVORITES_KEY = "arcana-index:favorites";
  const SLOTS_KEY = "arcana-index:slots";
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const PHONE = window.matchMedia("(max-width: 760px)");

  const SCHOOL_META = {
    abjuration: { name: "Abjuration", color: "#1F5F7A" },
    conjuration: { name: "Conjuration", color: "#3B4F8F" },
    divination: { name: "Divination", color: "#5E3F86" },
    enchantment: { name: "Enchantment", color: "#8A3B6B" },
    evocation: { name: "Evocation", color: "#9C2B1B" },
    illusion: { name: "Illusion", color: "#4A5A66" },
    necromancy: { name: "Necromancy", color: "#2F5D3A" },
    transmutation: { name: "Transmutation", color: "#8A5A1C" }
  };

  // Spell slots by character level (index 0 = level 1), from the 5e class tables.
  const FULL_SLOTS = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1]
  ];
  const PACT_SLOTS = [
    [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
    [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]
  ];

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
    reaction_condition: options.reaction || "",
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

  // A small offline folio, shown until (or if never) the live archive answers.
  const FALLBACK_SPELLS = [
    offlineSpell("fireball", "Fireball", 3, "evocation", ["Sorcerer", "Wizard"], "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.", { range: "150 feet", damage: "8d6", damageType: "fire", save: "dexterity", material: true, materialText: "A tiny ball of bat guano and sulfur.", higher: "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd." }),
    offlineSpell("mage-hand", "Mage Hand", 0, "conjuration", ["Bard", "Sorcerer", "Warlock", "Wizard"], "A spectral, floating hand appears at a point you choose within range. You can use your action to control the hand to manipulate an object, open an unlocked door or container, or retrieve an item from an open container.", { range: "30 feet", duration: "1 minute" }),
    offlineSpell("shield", "Shield", 1, "abjuration", ["Sorcerer", "Wizard"], "An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack.", { time: "reaction", reaction: "which you take when you are hit by an attack or targeted by the magic missile spell", duration: "1 round", range: "Self" }),
    offlineSpell("cure-wounds", "Cure Wounds", 1, "evocation", ["Bard", "Cleric", "Druid", "Paladin", "Ranger"], "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.", { range: "Touch", higher: "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st." }),
    offlineSpell("misty-step", "Misty Step", 2, "conjuration", ["Sorcerer", "Warlock", "Wizard"], "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.", { time: "bonus-action", range: "Self", somatic: false }),
    offlineSpell("counterspell", "Counterspell", 3, "abjuration", ["Sorcerer", "Warlock", "Wizard"], "You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect.", { time: "reaction", reaction: "which you take when you see a creature within 60 feet of you casting a spell", range: "60 feet", verbal: false }),
    offlineSpell("detect-magic", "Detect Magic", 1, "divination", ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Wizard"], "For the duration, you sense the presence of magic within 30 feet of you.", { range: "Self", duration: "10 minutes", ritual: true, concentration: true }),
    offlineSpell("invisibility", "Invisibility", 2, "illusion", ["Bard", "Sorcerer", "Warlock", "Wizard"], "A creature you touch becomes invisible until the spell ends. The spell ends for a target that attacks or casts a spell.", { range: "Touch", duration: "1 hour", concentration: true, material: true, materialText: "An eyelash encased in gum arabic." }),
    offlineSpell("polymorph", "Polymorph", 4, "transmutation", ["Bard", "Druid", "Sorcerer", "Wizard"], "This spell transforms a creature that you can see within range into a new form.", { range: "60 feet", duration: "1 hour", concentration: true, save: "wisdom", material: true, materialText: "A caterpillar cocoon." }),
    offlineSpell("revivify", "Revivify", 3, "necromancy", ["Cleric", "Paladin"], "You touch a creature that has died within the last minute. That creature returns to life with 1 hit point.", { range: "Touch", material: true, materialText: "Diamonds worth 300 gp, which the spell consumes." }),
    offlineSpell("eldritch-blast", "Eldritch Blast", 0, "evocation", ["Warlock"], "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage.", { range: "120 feet", attack: true, damage: "1d10", damageType: "force" }),
    offlineSpell("wish", "Wish", 9, "conjuration", ["Sorcerer", "Wizard"], "Wish is the mightiest spell a mortal creature can cast. By simply speaking aloud, you can alter the very foundations of reality in accord with your desires.", { range: "Self", somatic: false })
  ];

  const $ = (selector) => document.querySelector(selector);
  const els = {
    search: $("#search"),
    levelSeg: $("#level-seg"),
    classFilter: $("#class-filter"),
    schoolFilter: $("#school-filter"),
    concFilter: $("#conc-filter"),
    ritualFilter: $("#ritual-filter"),
    mineFilter: $("#mine-filter"),
    summary: $("#summary"),
    clearFilters: $("#clear-filters"),
    tableWrap: $("#table-wrap"),
    rows: $("#spell-rows"),
    empty: $("#empty"),
    dataStatus: $("#data-status"),
    folio: $("#folio"),
    folioBody: $("#folio-body"),
    folioEmpty: $("#folio-empty"),
    backBtn: $("#back-btn"),
    backLabel: $("#back-label"),
    prevBtn: $("#prev-btn"),
    prevName: $("#prev-name"),
    nextBtn: $("#next-btn"),
    nextName: $("#next-name"),
    line: $("#sp-line"),
    name: $("#sp-name"),
    classes: $("#sp-classes"),
    stats: $("#sp-stats"),
    glance: $("#sp-glance"),
    text: $("#sp-text"),
    higher: $("#sp-higher"),
    scale: $("#sp-scale"),
    material: $("#sp-material"),
    saveBtn: $("#save-btn"),
    saveLabel: $("#save-label"),
    copyBtn: $("#copy-btn"),
    printBtn: $("#print-btn"),
    randomBtn: $("#random-btn"),
    randomLink: $("#random-link"),
    navCount: $("#nav-count"),
    mineList: $("#mine-list"),
    slotClass: $("#slot-class"),
    slotLevel: $("#slot-level"),
    slotGrid: $("#slot-grid"),
    restBtn: $("#rest-btn"),
    toast: $("#toast")
  };

  const state = { query: "", level: "", classKey: "", school: "", conc: false, ritual: false, mine: false };
  let allSpells = [];
  let byKey = new Map();
  let filtered = [];
  let current = null;
  let autoPicked = false;
  let hashHandled = false;
  let toastTimer = 0;
  let favorites = new Set(readJSON(FAVORITES_KEY, [], Array.isArray));
  let slots = readJSON(SLOTS_KEY, { cls: "full", level: 5, used: {} }, (value) => value && typeof value === "object");

  /* ---------- storage ---------- */

  function readJSON(key, fallback, isValid) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value !== null && isValid(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage is a convenience; the page still works for this visit without it.
    }
  }

  function readCache() {
    const cached = readJSON(CACHE_KEY, null, (value) => Array.isArray(value.spells) && value.spells.length >= 250);
    return cached;
  }

  /* ---------- formatting ---------- */

  function normalizeSpell(raw) {
    const schoolKey = String(raw.school?.key || raw.school?.index || "unknown").toLowerCase();
    return {
      key: String(raw.key || raw.index || raw.name).replace(/\s+/g, "-").toLowerCase(),
      name: String(raw.name || "Unnamed spell"),
      level: Number(raw.level) || 0,
      school: { key: schoolKey, name: String(raw.school?.name || SCHOOL_META[schoolKey]?.name || "Unknown") },
      classes: Array.isArray(raw.classes) ? raw.classes.map((item) => ({
        key: String(item.key || item.index || item.name).toLowerCase(),
        name: String(item.name || "Unknown")
      })) : [],
      desc: Array.isArray(raw.desc) ? raw.desc.join("\n\n") : String(raw.desc || ""),
      higher_level: Array.isArray(raw.higher_level) ? raw.higher_level.join("\n\n") : String(raw.higher_level || ""),
      range_text: String(raw.range_text || raw.range || "Varies"),
      ritual: Boolean(raw.ritual),
      casting_time: String(raw.casting_time || "action"),
      reaction_condition: String(raw.reaction_condition || ""),
      verbal: Boolean(raw.verbal),
      somatic: Boolean(raw.somatic),
      material: Boolean(raw.material),
      material_specified: String(raw.material_specified || ""),
      duration: String(raw.duration || "instantaneous"),
      concentration: Boolean(raw.concentration),
      attack_roll: Boolean(raw.attack_roll),
      damage_roll: String(raw.damage_roll || ""),
      damage_types: Array.isArray(raw.damage_types) ? raw.damage_types.map(String) : [],
      saving_throw_ability: String(raw.saving_throw_ability || "")
    };
  }

  const slug = (spell) => spell.key.replace(/^srd_/, "");
  const capitalize = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);
  const ordinal = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
  const schoolMeta = (key) => SCHOOL_META[key] || { name: "Unknown", color: "#766649" };

  function levelLine(spell) {
    const school = spell.school.name.toLowerCase();
    const base = spell.level === 0 ? `${capitalize(school)} cantrip` : `${ordinal(spell.level)}-level ${school}`;
    return spell.ritual ? `${base} (ritual)` : base;
  }

  function castingTime(spell, compact) {
    const raw = spell.casting_time.toLowerCase().replace(/[-_]/g, " ").trim();
    const timed = raw.match(/^(\d+)\s*(minute|hour)s?$/);
    if (compact) {
      if (raw === "action") return "Action";
      if (raw === "bonus action") return "Bonus";
      if (raw === "reaction") return "Reaction";
      if (timed) return `${timed[1]} ${timed[2] === "minute" ? "min" : "hr"}`;
      return capitalize(raw);
    }
    let text = timed ? `${timed[1]} ${timed[2]}${timed[1] === "1" ? "" : "s"}` : `1 ${raw}`;
    if (raw === "reaction" && spell.reaction_condition) text += `, ${spell.reaction_condition}`;
    return text;
  }

  function duration(spell) {
    const text = spell.duration.toLowerCase();
    if (spell.concentration && !text.startsWith("concentration")) return `Concentration, up to ${text}`;
    return capitalize(text);
  }

  function rangeText(spell, compact) {
    const text = capitalize(spell.range_text);
    if (!compact) return text;
    return text.replace(/\s*\(.*\)$/, "").replace(/\bfeet\b/i, "ft").replace(/\bfoot\b/i, "ft");
  }

  function components(spell) {
    return [spell.verbal && "V", spell.somatic && "S", spell.material && "M"].filter(Boolean).join(", ") || "None";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
      .replace(/\b_(.+?)_\b/g, "<i>$1</i>");
  }

  // Open5e text is light markdown: paragraphs, **bold** lead-ins, bullet lists, ### headings and pipe tables.
  function renderText(text) {
    const lines = String(text).split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith("|")) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
        i--;
        const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        const body = rows.filter((row) => !/^\|[\s|:-]+\|?$/.test(row));
        const [head, ...rest] = body;
        out.push(`<div class="sb-text-wide"><table><thead><tr>${cells(head).map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rest.map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      } else if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*]\s+/, ""));
        i--;
        out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      } else if (/^#{1,6}\s+/.test(line)) {
        out.push(`<h4>${inline(line.replace(/^#{1,6}\s+/, ""))}</h4>`);
      } else {
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    return out.join("");
  }

  function glance(spell) {
    const items = [];
    if (spell.damage_roll) items.push(`${spell.damage_roll} ${spell.damage_types.join(" or ")}`.trim());
    if (spell.attack_roll) items.push("Spell attack");
    if (spell.saving_throw_ability) {
      const half = /half as much/i.test(spell.desc) ? ", half on success" : "";
      items.push(`${capitalize(spell.saving_throw_ability)} save${half}`);
    }
    const area = `${spell.range_text} ${spell.desc}`.match(/\b(\d+)-foot[- ](?:radius[- ])?(sphere|cube|cone|line|cylinder|square|radius)\b/i);
    if (area) items.push(`${area[1]}-ft ${area[2].toLowerCase()}`);
    if (spell.concentration) items.push("Concentration");
    if (spell.ritual) items.push("Ritual");
    return items;
  }

  // Damage at every slot (or, for cantrips, every tier), when the text states a plain dice increase.
  function scalingTable(spell) {
    const base = spell.damage_roll.match(/^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/);
    if (!base) return "";
    const [, count, die, bonus] = base;
    const plus = bonus ? ` + ${bonus}` : "";
    if (spell.level === 0) {
      const tiers = spell.higher_level.match(/5th level \((\d+d\d+)\),\s*11th level \((\d+d\d+)\),\s*and 17th level \((\d+d\d+)\)/i);
      if (!tiers) return "";
      const cols = [["1st", spell.damage_roll], ["5th", tiers[1]], ["11th", tiers[2]], ["17th", tiers[3]]];
      return table("Damage by character level", "Level", cols);
    }
    const step = spell.higher_level.match(/the damage (?:\([^)]*\) )?increases by (\d+)d(\d+) for each slot level above/i);
    if (!step || step[2] !== die) return "";
    const cols = [];
    for (let slot = spell.level; slot <= 9; slot++) {
      cols.push([ordinal(slot), `${Number(count) + Number(step[1]) * (slot - spell.level)}d${die}${plus}`]);
    }
    return table("Damage by slot", "Slot", cols);

    function table(caption, label, cols) {
      return `<table><caption>${caption}</caption><tbody>
        <tr><th scope="row">${label}</th>${cols.map(([head], index) => `<td class="${index === 0 ? "base" : ""}">${head}</td>`).join("")}</tr>
        <tr><th scope="row">${escapeHtml(capitalize(spell.damage_types[0] || "Damage"))}</th>${cols.map(([, dice], index) => `<td${index === 0 ? ' style="font-weight:bold"' : ""}>${dice}</td>`).join("")}</tr>
      </tbody></table>`;
    }
  }

  /* ---------- the index ---------- */

  function setArchive(spells, status) {
    allSpells = spells.map(normalizeSpell).filter((spell) => spell.name)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    byKey = new Map(allSpells.map((spell) => [spell.key, spell]));
    els.dataStatus.textContent = status;
    syncClassOptions();
    applyFilters();
    const fromHash = spellFromHash();
    const quiet = { reading: false, scroll: false, hash: false };
    if (fromHash) {
      // A shared link opens straight to its spell, on phones too, but only on the first load.
      openSpell(fromHash.key, { ...quiet, reading: !hashHandled });
      hashHandled = true;
    } else if (current && !autoPicked && byKey.has(current.key)) openSpell(current.key, quiet);
    else if (!PHONE.matches && filtered.length) {
      // Nothing chosen yet: show the first spell so the right-hand page is never blank.
      openSpell(filtered[0].key, quiet);
      autoPicked = true;
    }
    renderMine();
  }

  function syncClassOptions() {
    const previous = els.classFilter.value;
    const classes = new Map();
    allSpells.forEach((spell) => spell.classes.forEach((item) => classes.set(item.key, item.name)));
    els.classFilter.innerHTML = '<option value="">Any class</option>' + [...classes.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, name]) => `<option value="${escapeHtml(key)}">${escapeHtml(name)}</option>`).join("");
    if (classes.has(previous)) els.classFilter.value = previous;
  }

  function applyFilters() {
    state.query = els.search.value.trim().toLocaleLowerCase();
    state.classKey = els.classFilter.value;
    state.school = els.schoolFilter.value;
    state.conc = els.concFilter.checked;
    state.ritual = els.ritualFilter.checked;
    state.mine = els.mineFilter.checked;

    filtered = allSpells.filter((spell) => {
      if (state.level !== "" && String(spell.level) !== state.level) return false;
      if (state.classKey && !spell.classes.some((item) => item.key === state.classKey)) return false;
      if (state.school && spell.school.key !== state.school) return false;
      if (state.conc && !spell.concentration) return false;
      if (state.ritual && !spell.ritual) return false;
      if (state.mine && !favorites.has(spell.key)) return false;
      if (!state.query) return true;
      return `${spell.name} ${spell.desc} ${spell.damage_types.join(" ")} ${spell.school.name}`.toLocaleLowerCase().includes(state.query);
    });

    els.levelSeg.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.level === state.level));
    });
    renderRows();
    els.tableWrap.scrollTop = 0;
    renderSummary();
    renderPager();
  }

  function renderRows() {
    els.rows.innerHTML = filtered.map((spell) => {
      const meta = schoolMeta(spell.school.key);
      const saved = favorites.has(spell.key);
      const tags = [
        saved ? '<svg class="sb-star" viewBox="0 0 16 16" role="img" aria-label="In my spellbook"><path d="M8 1.2l2 4.3 4.7.6-3.4 3.3.9 4.7L8 11.8l-4.2 2.3.9-4.7L1.3 6.1 6 5.5z"/></svg>' : "",
        spell.concentration ? '<span class="sb-tag" title="Concentration">C</span>' : "",
        spell.ritual ? '<span class="sb-tag" title="Ritual">R</span>' : ""
      ].join("");
      return `<tr data-key="${escapeHtml(spell.key)}"${current?.key === spell.key ? ' aria-current="true"' : ""}>
        <td><button type="button" class="sb-open" data-open="${escapeHtml(spell.key)}"><span class="sb-lvl" aria-hidden="true">${spell.level === 0 ? "C" : spell.level}</span>${escapeHtml(spell.name)}</button></td>
        <td><span class="sb-dot" style="background:${meta.color}" aria-hidden="true"></span>${escapeHtml(spell.school.name)}</td>
        <td>${escapeHtml(castingTime(spell, true))}</td>
        <td>${escapeHtml(rangeText(spell, true))}</td>
        <td>${tags}</td>
      </tr>`;
    }).join("");
    els.empty.hidden = filtered.length > 0;
  }

  function renderSummary() {
    const parts = [];
    if (state.classKey) parts.push(els.classFilter.selectedOptions[0]?.textContent);
    if (state.level !== "") parts.push(state.level === "0" ? "Cantrips" : `${ordinal(Number(state.level))} level`);
    if (state.school) parts.push(schoolMeta(state.school).name);
    if (state.conc) parts.push("Concentration");
    if (state.ritual) parts.push("Ritual");
    if (state.mine) parts.push("My spellbook");
    if (state.query) parts.push(`matching “${els.search.value.trim()}”`);
    const count = `${filtered.length} ${filtered.length === 1 ? "spell" : "spells"}`;
    els.summary.textContent = parts.length ? `${parts.join(" · ")} · ${count}` : `All levels and classes · ${count}`;
    els.clearFilters.hidden = parts.length === 0;
  }

  function clearFilters() {
    els.search.value = "";
    state.level = "";
    els.classFilter.value = "";
    els.schoolFilter.value = "";
    els.concFilter.checked = false;
    els.ritualFilter.checked = false;
    els.mineFilter.checked = false;
    applyFilters();
  }

  /* ---------- the folio ---------- */

  function openSpell(key, { reading = true, scroll = true, hash = true } = {}) {
    const spell = byKey.get(key);
    if (!spell) return;
    current = spell;
    autoPicked = false;

    els.folioEmpty.hidden = true;
    els.folioBody.hidden = false;
    els.line.textContent = levelLine(spell);
    els.name.textContent = spell.name;
    els.classes.textContent = spell.classes.map((item) => item.name).join(", ");

    const stats = [
      ["Casting Time", capitalize(castingTime(spell, false)), spell.reaction_condition && spell.casting_time === "reaction"],
      ["Range", rangeText(spell, false)],
      ["Components", components(spell)],
      ["Duration", duration(spell)]
    ];
    els.stats.innerHTML = stats.map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ""}><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    els.glance.innerHTML = glance(spell).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

    els.text.innerHTML = renderText(spell.desc || "No description survives for this spell.");
    const first = els.text.firstElementChild;
    if (first?.tagName === "P" && spell.desc.length > 220 && /^[A-Za-z]/.test(first.textContent)) first.classList.add("dropcap");
    els.higher.innerHTML = spell.higher_level ? renderText(`**${spell.level === 0 ? "Cantrip Upgrade." : "At Higher Levels."}** ${spell.higher_level}`) : "";
    els.scale.innerHTML = spell.damage_roll && spell.higher_level ? scalingTable(spell) : "";
    els.material.textContent = spell.material && spell.material_specified ? `Material: ${spell.material_specified}` : "";

    renderSave();
    renderPager();
    els.rows.querySelectorAll("tr[aria-current]").forEach((row) => row.removeAttribute("aria-current"));
    const row = els.rows.querySelector(`tr[data-key="${CSS.escape(spell.key)}"]`);
    if (row) {
      row.setAttribute("aria-current", "true");
      keepRowVisible(row);
    }
    els.mineList.querySelectorAll("button").forEach((button) => button.setAttribute("aria-current", String(button.dataset.open === spell.key)));

    if (hash) history.replaceState(null, "", `#${slug(spell)}`);
    document.title = `${spell.name} · The Grand Spellbook`;

    if (PHONE.matches) {
      if (reading) {
        document.body.classList.add("sb-reading");
        els.folio.scrollTop = 0;
        els.folio.focus({ preventScroll: true });
      }
    } else if (scroll) {
      const top = els.folio.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.7) els.folio.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function keepRowVisible(row) {
    const wrap = els.tableWrap;
    if (wrap.scrollHeight <= wrap.clientHeight) return;
    const head = wrap.querySelector("thead").offsetHeight;
    const rowTop = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
    if (rowTop - head < wrap.scrollTop) wrap.scrollTop = rowTop - head - 4;
    else if (rowTop + row.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = rowTop + row.offsetHeight - wrap.clientHeight + 4;
  }

  function closeReading() {
    if (!document.body.classList.contains("sb-reading")) return;
    document.body.classList.remove("sb-reading");
    const button = current && els.rows.querySelector(`[data-open="${CSS.escape(current.key)}"]`);
    if (button) {
      button.scrollIntoView({ block: "center" });
      button.focus({ preventScroll: true });
    }
  }

  function neighbours() {
    if (!current) return [null, null];
    let list = filtered;
    let index = list.indexOf(current);
    if (index === -1) {
      list = allSpells;
      index = list.indexOf(current);
    }
    return [list[index - 1] || null, list[index + 1] || null];
  }

  function renderPager() {
    const [prev, next] = neighbours();
    els.prevBtn.disabled = !prev;
    els.nextBtn.disabled = !next;
    els.prevName.textContent = prev ? prev.name : "";
    els.nextName.textContent = next ? next.name : "";
    els.prevBtn.setAttribute("aria-label", prev ? `Previous spell: ${prev.name}` : "No previous spell");
    els.nextBtn.setAttribute("aria-label", next ? `Next spell: ${next.name}` : "No next spell");
    const parts = [];
    if (state.classKey) parts.push(els.classFilter.selectedOptions[0]?.textContent);
    if (state.level !== "") parts.push(state.level === "0" ? "Cantrips" : ordinal(Number(state.level)));
    els.backLabel.textContent = parts.length ? parts.join(" · ") : "Index";
  }

  function stepSpell(offset) {
    const [prev, next] = neighbours();
    const target = offset < 0 ? prev : next;
    if (target) openSpell(target.key, { reading: false, scroll: false });
    if (PHONE.matches) els.folio.scrollTop = 0;
  }

  function spellFromHash() {
    const id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    if (!id || ["index", "mine", "book", "random", "folio"].includes(id)) return null;
    return byKey.get(`srd_${id}`) || byKey.get(id) || null;
  }

  function randomSpell() {
    const pool = filtered.length ? filtered : allSpells;
    if (pool.length) openSpell(pool[Math.floor(Math.random() * pool.length)].key);
  }

  /* ---------- my spellbook ---------- */

  function renderSave() {
    if (!current) return;
    const saved = favorites.has(current.key);
    els.saveBtn.setAttribute("aria-pressed", String(saved));
    els.saveLabel.textContent = saved ? "In My Spellbook" : "Add to My Spellbook";
  }

  function toggleSaved() {
    if (!current) return;
    const saved = favorites.has(current.key);
    if (saved) favorites.delete(current.key);
    else favorites.add(current.key);
    writeJSON(FAVORITES_KEY, [...favorites]);
    renderSave();
    renderMine();
    if (state.mine) applyFilters();
    else renderRows();
    showToast(saved ? `${current.name} removed from your spellbook.` : `${current.name} added to your spellbook.`);
  }

  function renderMine() {
    const saved = [...favorites].map((key) => byKey.get(key)).filter(Boolean)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    els.navCount.textContent = String(saved.length);
    els.mineList.innerHTML = saved.length
      ? saved.map((spell) => `<li><button type="button" data-open="${escapeHtml(spell.key)}" aria-current="${current?.key === spell.key}">${escapeHtml(spell.name)}<span class="lv">${spell.level === 0 ? "C" : ordinal(spell.level)}</span></button></li>`).join("")
      : '<li class="empty">Nothing saved yet.</li>';
  }

  function slotRows() {
    const level = Math.min(20, Math.max(1, Number(slots.level) || 1));
    if (slots.cls === "pact") {
      const [count, slotLevel] = PACT_SLOTS[level - 1];
      return [[slotLevel, count]];
    }
    if (slots.cls === "half") {
      if (level < 2) return [];
      return FULL_SLOTS[Math.ceil(level / 2) - 1].map((count, index) => [index + 1, count]);
    }
    return FULL_SLOTS[level - 1].map((count, index) => [index + 1, count]);
  }

  function renderSlots() {
    els.slotClass.value = slots.cls;
    els.slotLevel.value = String(slots.level);
    const rows = slotRows();
    els.restBtn.textContent = slots.cls === "pact" ? "Short or long rest" : "Long rest";
    if (!rows.length) {
      els.slotGrid.innerHTML = '<p class="none">Paladins and rangers gain spell slots at 2nd level.</p>';
      return;
    }
    els.slotGrid.innerHTML = rows.map(([slotLevel, count]) => {
      const used = Math.min(count, Number(slots.used[slotLevel]) || 0);
      const pips = Array.from({ length: count }, (_, index) =>
        `<button type="button" class="sb-pip" data-slot="${slotLevel}" data-index="${index}" aria-pressed="${index < used}" aria-label="${ordinal(slotLevel)}-level slot ${index + 1} of ${count}${index < used ? ", spent" : ""}"></button>`
      ).join("");
      return `<span>${ordinal(slotLevel)}</span><span class="sb-pips">${pips}</span>`;
    }).join("");
  }

  function saveSlots() {
    writeJSON(SLOTS_KEY, slots);
    renderSlots();
  }

  /* ---------- misc ---------- */

  async function copySpell() {
    if (!current) return;
    const spell = current;
    const text = [
      spell.name,
      capitalize(levelLine(spell)),
      `Casting Time: ${capitalize(castingTime(spell, false))}`,
      `Range: ${rangeText(spell, false)}`,
      `Components: ${components(spell)}${spell.material_specified ? ` (${spell.material_specified.replace(/\.$/, "")})` : ""}`,
      `Duration: ${duration(spell)}`,
      "",
      spell.desc.replace(/\*\*/g, ""),
      spell.higher_level ? `\nAt Higher Levels. ${spell.higher_level}` : ""
    ].join("\n").trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast(`${spell.name} copied.`);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  async function syncLiveArchive() {
    const cached = readCache();
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 14000);
    try {
      const response = await fetch(API_URL, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`Archive returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.results) || payload.results.length < 250) throw new Error("Archive response was incomplete");
      writeJSON(CACHE_KEY, { timestamp: Date.now(), spells: payload.results });
      setArchive(payload.results, "");
    } catch (error) {
      console.warn("Live archive unavailable; continuing with what is on hand.", error);
      if (!cached) els.dataStatus.textContent = `The full archive could not be reached, so this is an offline sample of ${allSpells.length} spells.`;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function bindEvents() {
    let searchTimer = 0;
    els.search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFilters, 120);
    });
    [els.classFilter, els.schoolFilter, els.concFilter, els.ritualFilter, els.mineFilter].forEach((element) => {
      element.addEventListener("change", applyFilters);
    });
    els.levelSeg.addEventListener("click", (event) => {
      const button = event.target.closest("[data-level]");
      if (!button) return;
      state.level = state.level === button.dataset.level ? "" : button.dataset.level;
      applyFilters();
    });
    els.clearFilters.addEventListener("click", clearFilters);

    els.rows.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open]");
      if (button) openSpell(button.dataset.open);
    });
    els.mineList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open]");
      if (button) openSpell(button.dataset.open);
    });

    els.prevBtn.addEventListener("click", () => stepSpell(-1));
    els.nextBtn.addEventListener("click", () => stepSpell(1));
    els.backBtn.addEventListener("click", closeReading);
    els.saveBtn.addEventListener("click", toggleSaved);
    els.copyBtn.addEventListener("click", copySpell);
    els.printBtn.addEventListener("click", () => window.print());
    els.randomBtn.addEventListener("click", randomSpell);
    els.randomLink.addEventListener("click", (event) => {
      event.preventDefault();
      randomSpell();
    });

    window.addEventListener("hashchange", () => {
      const spell = spellFromHash();
      if (spell && spell !== current) openSpell(spell.key, { hash: false });
    });
    PHONE.addEventListener("change", () => {
      if (!PHONE.matches) document.body.classList.remove("sb-reading");
    });

    els.slotClass.addEventListener("change", () => {
      slots = { ...slots, cls: els.slotClass.value, used: {} };
      saveSlots();
    });
    els.slotLevel.addEventListener("change", () => {
      slots = { ...slots, level: Number(els.slotLevel.value), used: {} };
      saveSlots();
    });
    els.slotGrid.addEventListener("click", (event) => {
      const pip = event.target.closest(".sb-pip");
      if (!pip) return;
      const slotLevel = pip.dataset.slot;
      const index = Number(pip.dataset.index);
      const used = Number(slots.used[slotLevel]) || 0;
      slots.used = { ...slots.used, [slotLevel]: index < used ? index : index + 1 };
      saveSlots();
      els.slotGrid.querySelector(`.sb-pip[data-slot="${slotLevel}"][data-index="${index}"]`)?.focus();
    });
    els.restBtn.addEventListener("click", () => {
      slots.used = {};
      saveSlots();
      showToast("Spell slots restored.");
    });

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(tag);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        closeReading();
        els.search.focus();
      } else if (event.key === "Escape" && document.body.classList.contains("sb-reading")) {
        closeReading();
      }
    });
  }

  function init() {
    els.schoolFilter.innerHTML = '<option value="">Any school</option>' + Object.entries(SCHOOL_META)
      .map(([key, meta]) => `<option value="${key}">${meta.name}</option>`).join("");
    els.slotLevel.innerHTML = Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}">Level ${index + 1}</option>`).join("");
    if (!["full", "half", "pact"].includes(slots.cls)) slots.cls = "full";
    if (!slots.used || typeof slots.used !== "object") slots.used = {};
    bindEvents();
    renderSlots();
    const cached = readCache();
    if (cached) setArchive(cached.spells, "");
    else setArchive(FALLBACK_SPELLS, "Fetching the full archive…");
    syncLiveArchive();
  }

  init();
})();
