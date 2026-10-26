export const meta = {
  name: 'overhaul-sandbox',
  description: 'Sandbox fleet: 2024-rules crafting and gathering, tavern pastimes (Three-Dragon Ante, dice, fishing, performing), the Chronicle library (bestiary, books, atlas)',
  phases: [
    { title: 'Livelihoods', detail: 'crafting + gathering; tavern pastimes' },
    { title: 'Library', detail: 'bestiary, readable books, atlas' },
  ],
}

const RESULT = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    branch: { type: 'string' },
    landed: { type: 'boolean', description: 'true only if tools/land.sh printed LANDED' },
    landSha: { type: 'string' },
    summary: { type: 'string', description: '4-10 plain sentences for the user: what changed and how it plays now' },
    changes: { type: 'array', items: { type: 'string' } },
    verification: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
    followups: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'branch', 'landed', 'summary', 'changes', 'verification', 'followups', 'problems'],
}

const PRE = (role) => `You are the "${role}" agent, one of about thirty agents in six parallel fleets overhauling *Sword Coast Chronicles*, a zero-dependency browser RPG (vanilla ES modules + Canvas2D, a full D&D 5.5e 2024 rules engine, the Forgotten Realms' Sword Coast). You run in your OWN git worktree of the repo (your cwd). The main checkout C:/Users/Dizzy/Documents/DND GAME is shared: never edit or commit there directly.

The user wants the game to feel like "a full open world scenario", "sandboxed so you can do anything", "a unique project of its own ... customizable, unique, and never ending of an adventure". Your fleet adds ways to live in the world, not just fight in it.

RESUMED RUN - READ FIRST. An earlier attempt at these roles was stopped by the account usage limit. If branch overhaul/${role} exists it holds that attempt, ending in a "WIP checkpoint" commit that may be mid-edit: create overhaul/${role}-r2 from it (git checkout -b overhaul/${role}-r2 overhaul/${role}), read docs/overhaul/${role}.md, check what is there actually works, and CONTINUE - never redo finished work. The usage limit can stop you again at any time, so: land a solid, working increment as early as you can (sh tools/land.sh) and land again as you improve; commit after every meaningful step; spend tokens on the work, not on re-reading - use grep and sed -n ranges on big files (several are 100-480 KB) instead of full reads, and read each doc once.

STEP 1. Read docs/OVERHAUL.md in full. It is binding: vision and identity (an illuminated manuscript you can walk around in), non-negotiables (Forgotten Realms canon only, never coin portmanteau fantasy names, no external asset files, old saves must keep loading, all randomness via core/rng.js), the deeds channel (rules/deeds.js: report what the player did with noteDeed), file ownership (section 5 - you own only NEW files; hooks into others' files must be tiny, guarded and reported), and the work + landing protocol (section 6). Read docs/SETTING.md, docs/CONTINUE.md, progress.md and the relevant parts of docs/SPEC.md, and the existing code you hook into (world/overworld.js interaction, ui/dialogue.js, ui/menus.js pause menu, data/items*.js, rules/character.js skills and tool proficiencies, state.js).
STEP 2. Branch per section 6 (overhaul/${role}; if it exists a previous attempt was interrupted: branch overhaul/${role}-r2 from it and continue from docs/overhaul/${role}.md). Plan in docs/overhaul/${role}.md. Commit.
STEP 3. Build it, committing after every milestone. Rules faithful to the D&D 2024 Player's Handbook where they apply (skill and tool checks, DCs, proficiency). Screens drawn through the UI kit (UI.* in ui/kit.js - the Interface fleet is restyling it concurrently, so your screens inherit the new look); any new sprites authored with the pixel-art skill / PixelForge per OVERHAUL.md rule 2, using render/palette.js ramps.
STEP 4. Verify with scripted playtests (tools/shot.mjs --script drives the real game: window.SC, import('/src/...')), headless Node tests of your rules modules, save/load round-trips, zero console errors, node tools/regress-run.mjs green, tools/stamp.mjs --check clean. LOOK at every screen you make (Read the PNGs) and polish it. Then land with: sh tools/land.sh (resolve conflicts in your worktree, re-test, re-land; land in increments if useful).
STEP 5. Return the structured result; "landed" true only if land.sh printed LANDED for your final state.

Other fleets land on main continuously (Stage layers, UI kit, HUD bark API, factions, economy with priceFor / ownedProperties, world director with rumors and events, companions). Merge main periodically and use their APIs behind guards - read their docs/overhaul/<role>.md notes.
Machine: 2-core laptop shared by ~12 agents; browser runs are rationed by tools/browserlock.mjs - batch checks into one --script run. Node: C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe (system node is v14: do not use it).
`

function depText(deps) {
  const done = deps.filter(Boolean)
  if (!done.length) return ''
  return '\nALREADY LANDED ON MAIN BEFORE YOU STARTED:\n' + done.map((d) =>
    `- ${d.role} (landed: ${d.landed}): ${d.summary}\n  Followups: ${(d.followups || []).join(' | ')}`).join('\n') + '\n'
}

function run(role, phase, brief, deps = []) {
  return agent(PRE(role) + depText(deps) + '\nYOUR ASSIGNMENT\n' + brief, { label: role, phase, schema: RESULT, isolation: 'worktree' })
}

const CRAFTING = `Crafting and gathering: rules/crafting.js, data/recipes.js, data/gathering.js, world/gathering.js, ui/crafting.js (all new).
- Rules per the 2024 Player's Handbook crafting rules as faithfully as you know them: crafting nonmagical gear needs proficiency with the right tool (Smith's Tools, Leatherworker's Tools, Carpenter's Tools, Tinker's Tools, Woodcarver's Tools...), raw materials costing part of the item's price, and time scaled to its cost; Herbalism Kit for Potions of Healing and antitoxin; Alchemist's Supplies for acid, alchemist's fire and similar; Cook's Utensils for meals; Calligrapher's Supplies with the spell for scribing Spell Scrolls. Show the rule text you implement in your notes. Where the rules leave a gap, choose the simplest fair ruling and say so.
- Gathering: herbs (Wisdom (Survival) or Intelligence (Nature) checks; Herbalism Kit helps), ore veins, timber, hides and meat from beasts after a fight, fish at shores and rivers (if the pastimes agent's fishing lands, share the fish items), by biome and season, respawning over days. Nodes are visible in the world as small entities with their own pixel art (a tuft of silverleaf, a glinting seam) and are gathered with the interact key (a small, guarded hook in overworld interaction).
- Stations: forges in smithies, alchemy benches (temples, wizards' shops), campfire cooking at a rest (meals granting modest, rules-honest benefits such as temporary hit points or advantage on a specific check for the day - no invented plus-ones), and a workbench at owned property (ownedProperties from rules/economy.js - guard).
- Recipes: repairs, ammunition, potions, meals, refined trade goods (ore -> ingots, hides -> leather), gifts for NPCs and companions, spell scrolls. Crafted goods sell through the economy (priceFor if present).
- UI: a crafting screen with the kit: a recipe book by station, materials held versus needed, time cost, the check with the roll shown, progress for multi-day work (time passes via state.js advanceTime).
- Report crafting deeds via noteDeed.
Acceptance: a scripted run gathering herbs, brewing a Potion of Healing, smithing an item at a forge, cooking a meal at camp; screenshots of the gathering nodes and the crafting screen.`

const PASTIMES = `Tavern pastimes and activities: rules/pastimes.js, data/pastimes.js, ui/pastimes.js (+ ui/pastimes/* if you want one file per game), all new.
- Three-Dragon Ante, the card game every Realms tavern plays: a playable version against NPC opponents with personalities and tells, wagers, and its own pixel-art card faces (the chromatic and metallic dragon suits, Bahamut, Tiamat, mortals). Follow the published game's mechanics as faithfully as you reasonably can; write all rules text yourself.
- Dice: a period dice game (knucklebones, or Hazard - a real medieval game) with wagers; cheating with Sleight of Hand against the table's passive Perception, with consequences if caught (a brawl, a ban, a crime deed).
- Arm wrestling (Strength (Athletics) contest over rounds with a timing element), drinking contests (Constitution saves, poisoned condition on a bad loss), and performing for coin (Charisma (Performance); bards shine; play a real track from the score while performing - Audio.music with a tavern context or a specific track).
- Fishing at water tiles with a rod bought at general stores: a short timing minigame, fish as items (cookable if the crafting agent's cooking lands - guard).
- Hooks (tiny, guarded, reported): innkeepers and tavern patrons offer games (a dialogue fallback option or an interaction with tavern tables), and pastimes appear in the pause menu if you are at a tavern. Report deeds (gamble, cheat, win, lose) via noteDeed.
- Every screen drawn with the kit on the menu layer; the card art and tables must be beautiful pixel art.
Acceptance: scripted games of each pastime to completion, a win and a loss, a caught cheat; screenshots of a Three-Dragon Ante hand, the dice table, fishing and a performance.`

const CODEX = `The Chronicle library: ui/codex.js, data/books.js, data/codex.js (all new) - the showpiece of the 'illuminated manuscript' identity.
- Bestiary: entries unlock as creatures are met and slain (state.js recordKill / st.bestiary - read how kills are recorded), showing the creature's actual art (the game's monster sprites at an integer scale), size, type, CR, original lore in a canon voice, and weaknesses revealed by a knowledge check per creature type (Arcana, Nature, Religion, History as in the 2024 rules) or by enough kills.
- Books: 30-40 readable books found on bookshelves and lecterns across the world (interact with the tile; a small guarded hook) and sold by booksellers: original short texts grounded in canon - the Calendar of Harptos, Lathander the Morninglord, the founding of Neverwinter, the Spellplague and the Second Sundering in brief, the Phandelver's Pact and Wave Echo Cave, the Lords of Waterdeep, the Flaming Fist, a Harper ballad, a torn Zhentarim ledger, a dwarven lay of Mithral Hall, an herbal. Some teach (a small, rules-honest benefit, such as advantage on the next knowledge check about a creature type); some point to treasure or quests (use the world director's generator if it has landed - guard).
- Atlas of discovered places with descriptions, and a heraldry roll of the factions (read data/factions.js if it exists).
- UI: a manuscript reader drawn with the kit - parchment pages, drop-cap initials, rubricated headings, marginal ornaments, page-turn animation, illustrations (the monster art; small pixel vignettes). Open it from the pause menu and a hotkey (tiny guarded hooks).
Acceptance: screenshots of a bestiary page, a book spread and the atlas; a scripted run unlocking entries.`

phase('Livelihoods')
const craftP = run('crafting', 'Livelihoods', CRAFTING)
const pastP = run('pastimes', 'Livelihoods', PASTIMES)
const codexP = Promise.race([craftP, pastP]).then(() => run('codex', 'Library', CODEX))
const roles = ['crafting', 'pastimes', 'codex']
const results = await Promise.all([craftP, pastP, codexP])
return results.map((r, i) => r || { role: roles[i], landed: false, summary: 'agent returned nothing', problems: ['null result'] })
