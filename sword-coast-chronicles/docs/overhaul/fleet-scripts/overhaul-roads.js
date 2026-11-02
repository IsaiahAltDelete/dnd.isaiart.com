export const meta = {
  name: 'overhaul-roads',
  description: 'Roads fleet: mounts, ships, caravans and a parchment travel map; procedural ambient soundscapes and a richer SFX palette',
  phases: [
    { title: 'Roads', detail: 'travel + mounts; ambience + sfx' },
  ],
}

const RESULT = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    branch: { type: 'string' },
    landed: { type: 'boolean', description: 'true only if tools/land.sh printed LANDED' },
    landSha: { type: 'string' },
    summary: { type: 'string', description: '4-10 plain sentences for the user: what changed and how it plays or sounds now' },
    changes: { type: 'array', items: { type: 'string' } },
    verification: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
    followups: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'branch', 'landed', 'summary', 'changes', 'verification', 'followups', 'problems'],
}

const PRE = (role) => `You are the "${role}" agent, one of about thirty agents in six parallel fleets overhauling *Sword Coast Chronicles*, a zero-dependency browser RPG (vanilla ES modules + Canvas2D + WebAudio, a full D&D 5.5e 2024 rules engine, the Forgotten Realms' Sword Coast). You run in your OWN git worktree of the repo (your cwd). The main checkout C:/Users/Dizzy/Documents/DND GAME is shared: never edit or commit there directly.

The user wants "a full open world scenario", "a unique project of its own ... customizable, unique, and never ending of an adventure".

RESUMED RUN - READ FIRST. An earlier attempt at these roles was stopped by the account usage limit. If branch overhaul/${role} exists it holds that attempt, ending in a "WIP checkpoint" commit that may be mid-edit: create overhaul/${role}-r2 from it (git checkout -b overhaul/${role}-r2 overhaul/${role}), read docs/overhaul/${role}.md, check what is there actually works, and CONTINUE - never redo finished work. The usage limit can stop you again at any time, so: land a solid, working increment as early as you can (sh tools/land.sh) and land again as you improve; commit after every meaningful step; spend tokens on the work, not on re-reading - use grep and sed -n ranges on big files (several are 100-480 KB) instead of full reads, and read each doc once.

STEP 1. Read docs/OVERHAUL.md in full. It is binding: vision and identity, non-negotiables (Forgotten Realms canon only, never coin portmanteau fantasy names, no external asset files - art and sound are procedural or PixelForge-compiled, old saves must keep loading, all randomness via core/rng.js), the deeds channel (rules/deeds.js), file ownership (section 5 - you own only NEW files; hooks into others' files must be tiny, guarded and reported), and the work + landing protocol (section 6). Read docs/SETTING.md, docs/CONTINUE.md, progress.md, the relevant parts of docs/SPEC.md, and the existing code you hook into.
STEP 2. Branch per section 6 (overhaul/${role}; if it exists a previous attempt was interrupted: branch overhaul/${role}-r2 from it and continue from docs/overhaul/${role}.md). Plan in docs/overhaul/${role}.md. Commit.
STEP 3. Build it, committing after every milestone.
STEP 4. Verify (scripted playtests via tools/shot.mjs --script with window.SC and import('/src/...'), headless Node tests, save/load round-trips, zero console errors, node tools/regress-run.mjs green, tools/stamp.mjs --check clean), LOOK at every screen you make (Read the PNGs), then land with: sh tools/land.sh (resolve conflicts in your worktree, re-test, re-land; land in increments if useful).
STEP 5. Return the structured result; "landed" true only if land.sh printed LANDED for your final state.

Other fleets land on main continuously (Stage layers, UI kit, HUD, encounters director, world director, economy, factions, audio synthesis). Merge main periodically and use their APIs behind guards - read their docs/overhaul/<role>.md notes.
Machine: 2-core laptop shared by ~12 agents; browser runs are rationed by tools/browserlock.mjs - batch checks into one --script run. Node: C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe (system node is v14: do not use it).
`

function run(role, phase, brief) {
  return agent(PRE(role) + '\nYOUR ASSIGNMENT\n' + brief, { label: role, phase, schema: RESULT, isolation: 'worktree' })
}

const TRAVEL = `Travel across the Sword Coast: rules/travel.js, ui/travelmap.js, data/routes.js, mount sprites named 'mount-*' (all new; tiny guarded hooks elsewhere).
- Read how maps link today (world/maps.js WORLD_NODES / links, the region packs, warps, travelTo in world/overworld.js) and keep every existing warp working.
- Mounts: buy and stable riding horses, ponies and mules (the economy agent may add a pack mule or cart for carrying capacity - read its notes and share one concept rather than duplicating). Riding raises overworld walking speed and draws the party mounted: author horse and pony sprites in four directions with walk frames using the pixel-art skill / PixelForge and render/palette.js ramps, 16px-tile scale, drawn under the rider (coordinate with render/actor.js by composing, not by editing it). Dismount automatically in battle and indoors. Upkeep via stables at inns.
- Ships: paid passage between the ports that exist as maps (find the dock/quay maps: Neverwinter, Waterdeep, Baldur's Gate and any others), from a harbourmaster or captain NPC at the docks, with days passing (state.js advanceTime), a sea-crossing event roll (the encounters director's hooks if present - guard), and arrival at the destination's quay.
- Caravans and fast travel: join a merchant caravan along a trade route (time passes, safer roads, a chance of a road event), and fast travel between places you have discovered (inns, waystones, towns) on a world travel map, costing time and rations, with road events that can interrupt.
- The travel map: a beautiful parchment map of the Sword Coast in pixel art, drawn procedurally with the UI kit (coastline, the Sword Mountains, Neverwinter Wood, the High Road, the Triboar Trail, the Trade Way, the Chionthar), discovered places, routes, the party's position, and markers for world events or quests if the director exposes them (guard). Open it from the pause menu and a hotkey (tiny guarded hooks).
- Report travel deeds via noteDeed where meaningful.
Acceptance: a scripted run buying a horse and riding, booking ship passage Waterdeep -> Baldur's Gate (or whichever ports exist), a caravan trip and a fast-travel hop; screenshots of the travel map and a mounted party in town.`

const AMBIENCE = `Ambient soundscapes and a richer sound-effect palette: core/ambience.js and core/sfx_extra.js (new). You need the WebAudio context and a bus from core/audio.js: add at most a tiny, guarded hook there (e.g. Audio.context getter and an ambience gain node), because the audio agent owns and is heavily editing audio.js right now - merge main before landing and keep the hook minimal.
- Procedural ambience beds chosen by biome, time of day, weather and indoor/outdoor (read the map's biome/indoor fields and the state clock): birdsong (synthesised calls that differ by biome, a dawn chorus), wind (filtered noise with gusts), crickets and frogs at night, owls, water lapping on coasts and rivers, market crowd murmur (a babble built from filtered, formant-shaped noise), tavern chatter with clinks and a crackling hearth, temple quiet with distant chant (reuse the sung voices if the audio agent has landed them), dungeon drips and distant rumbles, cave echo, rain on roofs versus rain on leaves, thunder with the existing lightning hook (FX.onLightning).
- Positional one-shots from the world: a smith's hammer near forges, a dog's bark, a bell tower striking the hour, a fountain, a creaking sign - panned by screen position, attenuated by distance.
- SFX palette: footsteps per surface (grass, stone, wood, snow, water, sand), door creaks, chest opening, coin clinks, UI clicks and page turns that suit the gilt manuscript UI, weapon swings and impacts by weapon type and armour type, spell sfx per damage type (so the VFX library can pair them - document the names).
- Volume: Save.settings.volAmbience (default sensible), respected live; ambience ducks under music stingers and fades in menus.
- Performance: node counts and scheduling cost measured; nothing leaks across map changes.
- Verify by offline renders to WAV in output/ambience/ (OfflineAudioContext in headless Chromium via tools/shot.mjs --script, return base64, write with Node) and by a scripted walk through several biomes checking the right beds switch in.
Acceptance: WAV renders of each bed and a list of what plays where in your notes.`

phase('Roads')
const travelP = run('travel', 'Roads', TRAVEL)
const ambP = run('ambience', 'Roads', AMBIENCE)
const roles = ['travel', 'ambience']
const results = await Promise.all([travelP, ambP])
return results.map((r, i) => r || { role: roles[i], landed: false, summary: 'agent returned nothing', problems: ['null result'] })
