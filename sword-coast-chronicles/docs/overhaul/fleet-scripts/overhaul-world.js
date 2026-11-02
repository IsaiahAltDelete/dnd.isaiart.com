export const meta = {
  name: 'overhaul-world',
  description: 'World fleet: encounter director with lore and parley, world director (events, rumors, endless quests), economy and trading, factions and founding your own, NPC life, companions',
  phases: [
    { title: 'Directors', detail: 'encounter director; world director' },
    { title: 'Society', detail: 'economy and trade; factions and your own company' },
    { title: 'People', detail: 'NPC schedules/memory/gossip; companions' },
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
    verification: { type: 'array', items: { type: 'string' }, description: 'what you checked and the evidence (scripted playtests, transcripts, screenshots, tests)' },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'worktree-relative paths of the best PNGs / transcripts' },
    followups: { type: 'array', items: { type: 'string' }, description: 'APIs added, hooks left, facts later agents / the orchestrator must know' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'branch', 'landed', 'summary', 'changes', 'verification', 'followups', 'problems'],
}

const PRE = (role) => `You are the "${role}" agent, one of about two dozen agents in four parallel fleets overhauling *Sword Coast Chronicles*, a zero-dependency browser RPG (vanilla ES modules + Canvas2D, a full D&D 5.5e 2024 rules engine, the Forgotten Realms' Sword Coast). You run in your OWN git worktree of the repo (your cwd). The main checkout C:/Users/Dizzy/Documents/DND GAME is shared: never edit or commit there directly.

The user's words for this fleet: "i hate the constant 0 lore ambushes. its cool every once in a while but that feels like the only thing going on. it should feel sandboxed so you can do anything but id like if you could do more with a little logic. also if you can sandbox the world more thad be awesome. buying and selling stuff, trading, factions, creating factions, a full open world scenario." And: "make it feel like its a unique project of its own. make it feel customizable, unique, and never ending of an adventure." Also: NPC improvements and companions fleshed out.

RESUMED RUN - READ FIRST. An earlier attempt at these roles was stopped by the account usage limit. If branch overhaul/${role} exists it holds that attempt, ending in a "WIP checkpoint" commit that may be mid-edit: create overhaul/${role}-r2 from it (git checkout -b overhaul/${role}-r2 overhaul/${role}), read docs/overhaul/${role}.md, check what is there actually works, and CONTINUE - never redo finished work. The usage limit can stop you again at any time, so: land a solid, working increment as early as you can (sh tools/land.sh) and land again as you improve; commit after every meaningful step; spend tokens on the work, not on re-reading - use grep and sed -n ranges on big files (several are 100-480 KB) instead of full reads, and read each doc once.

STEP 1. Read docs/OVERHAUL.md in full. It is binding: vision, non-negotiables (Forgotten Realms canon only, never coin portmanteau fantasy names, old saves must keep loading, all randomness via core/rng.js), the world-state keys and the deeds channel (4.8 - rules/deeds.js already exists: report what the player did with noteDeed, listen with onDeed), file ownership (section 5), and the work + landing protocol (section 6). Read docs/SETTING.md (canon places and naming tables), docs/CONTINUE.md and progress.md for history, and the parts of docs/SPEC.md relevant to you. Read the existing code you are extending before designing - much already exists (reputation in state.js, FACTION_CONTRACTS and generateQuest in data/quests.js, RECRUITS in data/npcs.js, roamers and ambush contests in world/overworld.js and rules/scaling.js, shops in ui/shop.js, dialogue trees and fallback greetings in ui/dialogue.js).
STEP 2. Branch per section 6 (overhaul/${role}; if it already exists a previous attempt was interrupted: branch overhaul/${role}-r2 from it and continue from docs/overhaul/${role}.md). Write your plan to docs/overhaul/${role}.md. Commit.
STEP 3. Do the work below, committing after every milestone. Design for depth and player agency: systems that combine (a rumor leads to a caravan that a faction wants robbed and a companion objects), not one-off content. Keep rules faithful to D&D 5.5e where they touch the rules (skill checks, DCs, conditions).
STEP 4. Verify with scripted playtests (tools/shot.mjs --script drives the real game in headless Chromium: window.SC, import('/src/...'), advance time with window.advanceTime(ms) or state.js advanceTime), save/load round-trips (a save made before your change must still load: test with a fresh game saved on main's code if you can, or at least a state object missing your keys), zero console errors, node tools/regress-run.mjs green, tools/stamp.mjs --check clean. Put transcripts of what a player would experience in docs/overhaul/${role}.md. Then land with: sh tools/land.sh (resolve conflicts in your worktree keeping both sides' intent, re-test, re-land; landing in increments is fine).
STEP 5. Return the structured result. "landed" must be true only if land.sh printed LANDED for your final state.

UI: the Interface fleet is concurrently restyling the UI kit (ui/kit.js), adding render/stage.js layers and ui/layout.js widgets, and restyling menus/dialogue/shop presentation. Draw any new screens through the UI kit (UI.* calls) so they inherit the new look; register new HUD widgets with Layout if it exists on main (guard). Merge main periodically ('git merge main') to pick up other fleets' work.
Machine notes: 2-core laptop shared by ~8 agents; browser runs are rationed by tools/browserlock.mjs - batch checks into one --script run. Headless pure-logic tests with Node (import the modules directly) are cheap - prefer them for simulation. Node: C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe (system node is v14: do not use it).
`

function depText(deps) {
  const done = deps.filter(Boolean)
  if (!done.length) return ''
  return '\nALREADY LANDED ON MAIN BEFORE YOU STARTED (merge main first; read their docs/overhaul/<role>.md):\n' + done.map((d) =>
    `- ${d.role} (landed: ${d.landed}): ${d.summary}\n  Followups from ${d.role}: ${(d.followups || []).join(' | ')}`).join('\n') + '\n'
}

function run(role, phase, brief, deps = []) {
  return agent(PRE(role) + depText(deps) + '\nYOUR ASSIGNMENT\n' + brief, {
    label: role, phase, schema: RESULT, isolation: 'worktree',
  })
}

const ENCOUNTERS = `Build the encounter director: rules/encounters.js, data/encounters.js, rules/scaling.js, and the overworld's encounter/roamer code in world/overworld.js.
- First understand today's system end to end: grass ambushes (_rollEncounter, encounterRate, ENCOUNTER_GRACE, Save.settings.wildEncounters), roaming packs (_spawnRoamers, MonsterEntity, groupId), ambushContest, the hand-authored map.encounterTable entries, _pushBattle and battlemap arenas, region clearing.
- Encounters become SITUATIONS with who / why / what they want, tied to region, time, weather, faction presence and the party's history: a Cragmaw raiding party hauling stolen Phandalin goods; Zhentarim toll-takers on the Triboar Trail; a merchant caravan under attack (help it for reward and standing); refugees fleeing orcs; a wounded Harper courier with a message; pilgrims bound for a shrine of Lathander; a hunting party; a Flaming Fist patrol near Baldur's Gate; bandits who will bargain; wolves circling a lone shepherd; a lost child; a green hag's bargain in the marsh; undead at night near barrows; an owlbear defending cubs you could leave be; Uthgardt raiders in the north; Cult of the Dragon near the Mere of Dead Men; gnolls; orcs of Many-Arrows; Xanathar Guild thugs in Waterdeep's sewers. Canon creatures and groups per region (docs/SETTING.md).
- Most encounters are VISIBLE: roaming groups with intent (patrol routes, camps with fires and tents, caravans travelling the roads, hunters stalking game) you can approach, avoid, shadow, sneak past or ambush yourself. True ambushes are rare, usually telegraphed (tracks, a broken cart, circling crows, 'the birds have gone quiet'), and always open with a line that says who they are and why.
- Parley before steel: approaching a group opens a short situational standoff (a generated DialogueScene tree or a compact standoff scene drawn with the UI kit) with context-appropriate options: talk, pay or bribe, intimidate (Intimidation vs their Wisdom), persuade, deceive, trade, share food, surrender, slip away (Stealth vs passive Perception), strike first (surprise), flee. Outcomes: fight, pass, trade, a quest hook, a rumor, allies for the fight, a grudge. Use real 5.5e checks and show the roll.
- Pacing: a tension budget - quiet stretches, landmarks and non-combat events between dangers; no back-to-back fights without context. Save.settings.encounterPacing ('calm'|'normal'|'perilous', default 'normal') and the existing wildEncounters setting both respected (the menus agent adds the UI).
- Hooks for other agents (keep them tiny and guarded): consult st.world.regionControl if the factions agent has set it, and activeEventsFor(st, mapId) from rules/worlddirector.js if it exists (the director agent is building it in parallel - read its notes after merging main) so events spawn encounters (a missing caravan's survivors, a festival's pilgrims). Report deeds via noteDeed: kill, spare, flee, rescue, bribe, parley.
- Remembered history: a cleared camp stays cleared for a while; goblins you spared remember; a bandit leader you let go may return with an offer.
- Verify with scripted playtests: walk the player across several wild maps in a --script with time advancing, logging each encounter and why; capture a parley scene and a visible camp.
Acceptance: a 60-minute simulated journey whose log reads like a story with variety and reasons, where fights are a minority of encounters, plus screenshots.`

const DIRECTOR = `Make it a never-ending adventure: the world director - rules/worlddirector.js, data/rumors.js, and the quest generator in data/quests.js.
- World events on the Calendar of Harptos (use the game's calendar in constants/state) with causes, stages and consequences: festivals (Greengrass, Midsummer, Highharvestide, the Feast of the Moon, Shieldmeet), market days, a goblin raid on Phandalin's outskirts, sickness in a district, a dragon sighted near Icespire Peak, a caravan missing on the Triboar Trail, a noble wedding in Waterdeep, bounties posted, floods, a failed harvest raising grain prices, faction skirmishes (Zhentarim against the Lords' Alliance), and at higher levels darker stirrings (a cult in the Mere of Dead Men, a lich's servants). Events advance by in-game day whether or not the player intervenes; outcomes change the world (prices, region control, who is present, encounter tables). Export activeEventsFor(st, mapId) for the encounters agent and eventPriceModifiers(st, mapId) for the economy agent (both land in parallel; keep the contracts in your notes).
- Rumors: data/rumors.js templates plus rumors generated from events, deeds (rules/deeds.js onDeed - the party's own deeds become gossip) and faction moves; rumorsFor(st, npc) picks what a given NPC would plausibly know (by map, role, faction); some rumors are wrong or exaggerated. Rumors point to quests and places.
- Procedural quests forever: extend generateQuest (keep its signature) or add a generator building quests from events, rumors and faction needs with varied objectives (retrieve, escort, investigate, clear a lair, deliver, rescue, negotiate, hunt a named beast in its lair), scaled to level, pointing at real map locations, offered by quest-givers and at notice boards (the architecture agent is adding a NOTICE_BOARD tile - read its notes after merging main). Make sure generated quests actually complete through the existing quest machinery (progressQuests in state.js).
- Points of interest and renewal: lairs that repopulate after weeks, landmarks discovered, dungeons that change (world/mapgen.js already makes procedural dungeons).
- A chronicle: chronicle(st) returning the notable happenings of the world and of the party for the journal (the menus agent owns menus.js - add at most a guarded hook to show it, and document the data shape).
Acceptance: a headless simulation of 60 in-game days (import the modules in Node with a real newGameState) printing the event log, rumor samples per town, and 10 generated quests - varied, canon, sensible - saved into your notes.`

const ECONOMY = `Build a living economy and trading: rules/economy.js, data/tradegoods.js, ui/shop.js logic, property ownership. The menus agent is restyling shop.js drawing concurrently: keep your edits to logic and put any new panels in separate functions.
- Regional prices: each settlement has supply and demand per category (Phandalin: cheap ore and tools, dear luxuries; Neverwinter: cheap crafted goods and glass; Waterdeep: the best selection and high prices for rarities; Baldur's Gate: cheap imports, dear arms; Daggerford: cheap grain and wool...). Prices drift daily and respond to world events (use eventPriceModifiers(st, mapId) from rules/worlddirector.js if it exists - guard it). Selling the same thing floods the market; merchants have limited coin that refills over days; stock restocks weekly with variety; rare items rotate.
- Trade goods (data/tradegoods.js): bulk commodities with weight and origins (wool, grain, salt, ale, wine, timber, iron ore, furs, spices, silk, dwarven steel, Neverwinter glass, Amnian dyes...) so buying low and selling high across towns is a real way to play; carrying capacity matters (pack weight; a mule or cart can be bought to raise it).
- Haggling: a Persuasion check option (Deception or Intimidation as alternatives) adjusting prices for that visit, with consequences for failures; faction and reputation discounts (use factionStanding(st, id) from rules/factions.js if present - guard).
- Barter: trade items for items with value balance.
- Property: buy a house, shop or warehouse in a town (st.economy.property), with stash storage, upkeep and upgrades; an owned shop earns (or loses) money weekly. The factions agent will let the player's founded company use owned property as its headquarters: expose ownedProperties(st) and propertyAt(st, mapId).
- Paid jobs for trade: courier runs and caravan escorts from merchants (the director owns general quest generation; you own trade jobs).
- Shop UI: price context (arrows versus the regional average), a market panel ('what sells well here'), a haggle action, sell-all-of-a-kind; drawn with the UI kit.
- Report trade and haggle deeds via noteDeed.
Acceptance: a scripted test buying goods in Phandalin and selling them in Neverwinter at a profit, prices moving when the market floods, property bought and persisting across save and reload.`

const FACTIONS = `Factions with consequences, and founding your own: rules/factions.js, data/factions.js, ui/factions.js (new scene), and the faction code in state.js (keep reputation / REP_RANKS / addReputation working for existing callers and saves).
- Canon factions with relations (allied / rival / enemy) and canon rank ladders: Harpers (Watcher, Harpshadow, Brightcandle, Wise Owl, High Harper), Zhentarim (Fang, Wolf, Viper, Ardragon, Dread Lord), Lords' Alliance (Cloak, Redknife, Stingblade, Warduke, Lioncrown), Order of the Gauntlet (Chevall, Marcheon, Whitehawk, Vindicator, Righteous Hand), Emerald Enclave (Springwarden, Summerstrider, Autumnreaver, Winterstalker, Master of the Wild), plus the Flaming Fist, the Cult of the Dragon, the Red Wizards of Thay, the Xanathar Guild, the City Watch of Waterdeep, the Uthgardt tribes and the Cragmaw goblins.
- Standing moves with deeds (listen with onDeed): saving a caravan pleases the Lords' Alliance; robbing merchants angers them and may please the Zhentarim; killing a faction's agents angers it and pleases its enemies. Rank-ups grant perks (discounts, safe houses, faction gear, guards' attitude, access to faction contracts). Integrate FACTION_CONTRACTS / generateQuest: contracts offered by faction contacts and notice boards.
- Region control: st.world.regionControl - which faction holds sway where, shifting slowly with events and the player's actions; exported for the encounters, economy and NPC-life agents (regionControl(st, mapId)).
- FOUND YOUR OWN COMPANY - the heart of the never-ending sandbox: name it (with name suggestions in canon style), design its heraldry (field tincture, an ordinary and a charge from pixel-art charges - stag, lion, tower, sword, moon, rose, anchor, dragon, owl, hammer - obeying the rule of tincture) with a live preview, choose a creed (mercenary company, merchant house, adventuring guild, knightly order, thieves' guild, druid circle). Headquarters: an owned property (ownedProperties(st) from rules/economy.js - guard) or a camp. Recruit members (RECRUITS plus generated hirelings with SETTING.md names), assign them to missions that resolve over in-game days (trade runs, patrols, scouting, recruitment, sabotage, diplomacy) with reported results (coin, rumors/intel, standing with other factions, injury or loss). Renown grows; other factions react with offers, alliances, rivalries and threats. The company's banner can fly over its HQ (hook for the art side documented in notes).
- UI: ui/factions.js scene drawn with the UI kit - tabs for Standings (every faction, rank, a relations web), Your Company (heraldry, members, missions board, treasury, HQ), and Contracts. Open it from the pause menu and a hotkey (small guarded hooks; say so in your report).
- Persist everything in st.factions.
Acceptance: a scripted test founding a company, designing heraldry, recruiting, running a mission over several days, and ranking up with a canon faction; screenshots of each tab.`

const NPCLIFE = `Make NPCs feel alive: rules/npclife.js, NPC behaviour in world/entity.js (not its draw code - the lighting agent owns that), data/npcs_extra.js.
- Daily schedules by role: shopkeepers keep hours (open 8-18, a shut shop says so), then the inn in the evening, home at night; farmers in the fields; guards patrol and change shift; priests at dawn prayers; children at play by day; lamplighters at dusk; drunks late. Movement along paths on the map with the existing pathfinding, interiors where feasible. Coarse ticks (every in-game 10 minutes), paths cached, cheap.
- Memory and reaction: NPCs remember deeds they witnessed or heard about (rules/deeds.js, plus rumors via rumorsFor(st, npc) from rules/worlddirector.js - guard it), and greetings change with reputation, fame, crimes (fear, suspicion, respect), faction standing (regionControl / factionStanding from rules/factions.js - guard) and a per-NPC disposition that grows with gifts, help and quests. Barks as the player passes, via hud.bark(target, text, opts) if the hud agent has landed it (check main); otherwise a minimal guarded speech bubble.
- Gossip in dialogue: fallback trees and barks mention rumors the NPC would know.
- Personality traits (grumpy, cheerful, pious, greedy, nervous, curious...) varying lines for minor and generated NPCs; any new names from docs/SETTING.md tables.
- Ambient street life: people carrying goods, pairs in conversation, market crowds by day, quiet streets at night with the watch and lamplighters.
- Keep npccheck.html clean; regress green.
Acceptance: Phandalin at 09:00, 13:00, 20:00 and 02:00 showing different crowds; a transcript of greetings changing after a crime and after a good deed.`

const COMPANIONS = `Flesh out the companions: rules/companions.js, data/companions.js, world/party.js.
- Read RECRUITS (data/npcs.js), Party (reserve, recruiting at inns) and how a recruit joins. Give every recruitable companion a real personality: backstory, voice, likes and dislikes, faction ties, a three-step personal quest built on the existing quest machinery, and approval (-100..100) moved by the party's deeds (onDeed from rules/deeds.js: a Tyrran paladin dislikes cruelty and theft, a rogue dislikes zeal, a druid likes beasts spared). Add 6-8 new companions grounded in canon with docs/SETTING.md names and varied species, class and faction (for example a Harper bard, a Zhentarim deserter, a paladin of Tyr, an Emerald Enclave druid, a shield dwarf of Mithral Hall, a tiefling warlock from Baldur's Gate's Lower City).
- Thresholds: friend, confidant, rival; at the floor they leave with a farewell scene. Loyalty rewards at high approval (a unique feat, item or combat bonus beside the player).
- Banter: ambient party chatter triggered by places, events, weather and time (via hud.bark if the hud agent has landed it - check main; otherwise a guarded minimal bubble), pairwise banter between companions, interjections on dialogue choices, and camp conversations at a long rest (a 'Talk around the fire' option in ui/restui.js - a small guarded hook).
- Persist in st.companions.
Acceptance: a scripted test recruiting companions, doing deeds that shift approval, triggering banter and camp talk, and starting a personal quest; transcripts in your notes and a screenshot of a camp conversation.`

phase('Directors')
const encP = run('encounters', 'Directors', ENCOUNTERS)
const dirP = run('director', 'Directors', DIRECTOR)
const econP = Promise.race([encP, dirP]).then(() => Promise.allSettled([encP, dirP])).then((s) => run('economy', 'Society', ECONOMY, s.map((x) => x.value).filter((v) => v && v.landed)))
const facP = Promise.all([encP, dirP]).then(([e, d]) => run('factions', 'Society', FACTIONS, [e, d]))
const npcP = Promise.all([dirP, facP]).then(([d, f]) => run('npclife', 'People', NPCLIFE, [d, f]))
const compP = Promise.all([facP, econP]).then(([f, e]) => run('companions', 'People', COMPANIONS, [f, e]))

const roles = ['encounters', 'director', 'economy', 'factions', 'npclife', 'companions']
const results = await Promise.all([encP, dirP, econP, facP, npcP, compP])
return results.map((r, i) => r || { role: roles[i], landed: false, summary: 'agent returned nothing', problems: ['null result'] })
