# Realms of the Sword Coast

A **Faerûn-flavored living-world simulator** in the spirit of Cities: Skylines meets a D&D campaign map.
There is no plot and no player-character — you are an observer god watching centuries of history unfold:
settlements are born, realms rise and fall, wars rage, faiths spread, magic advances, and dragons burn
the unwary. Every world is procedurally generated and every run tells a different story.

## How to run

**Option 1 (simplest):** double-click `index.html` — it runs entirely in the browser, no install needed.

**Option 2 (local server):**
```
npx http-server -p 8321 .
```
then open http://localhost:8321

## What you'll see

- **Procedural worlds** — continents, mountains, rivers, forests, swamps, deserts, tundra, and coasts,
  generated fresh from any seed you type into the top bar.
- **Living settlements that sprawl** — thorps grow into hamlets, villages, towns, cities, and (rarely) a
  metropolis, following the classic D&D settlement categories. Towns physically spread across the map tile
  by tile as they grow; walls trace the city bounds, piers reach into the harbor, and temples, markets, and
  mage towers rise in the center.
- **A real economy** — settlements work the land around them: farmsteads, fishing docks, lumber camps,
  quarries, mines, vineyards, fur trappers, herbalists, and saltworks, all placed by biome and climate.
  Towns eat food, build with timber and stone, and crave luxuries; surpluses flow along trade routes to
  hungry neighbors. Cut the routes — by war, storm, or drought — and cities starve. Famines are real.
- **Nations** — when a town grows large enough it crowns a ruler and founds a realm (each with a
  personality: Warlike, Mercantile, Scholarly, Zealous, or Reclusive). Realms expand, absorb neighbors,
  declare wars, sack cities, and sometimes vanish from the map entirely.
- **Trade** — caravans crawl along gold-dashed roads, ships ply blue sea lanes, and high-magic realms
  bind their cities with violet teleportation circles. Roads emerge from repeated use.
- **Religion** — a pantheon of 16 Forgotten Realms deities. Faith spreads along trade routes; zealous
  realms launch holy wars. Toggle the Faith overlay to watch spheres of worship glow and shift.
- **Magic** — realms advance from Hedge Craft to Mythal Weaving. Wizard towers hasten the art;
  wild magic surges occasionally wreck a city block or two.
- **Places of power** — dragon lairs, ancient ruins, wizard towers, sacred groves, mithral veins,
  lich crypts, and elder portals dot the wilderness. Adventuring parties ride out from taverns to
  delve ruins, break orc hordes, seal crypts... and get eaten by dragons.
- **Disasters** — great fires, floods, earthquakes, sea tempests, droughts, blizzards, plagues, and the
  occasional falling star (which leaves a crater full of star metal for adventurers to fight over).
- **The Hand of the Gods** — a toolbar of divine powers: found settlements, place industries, bless a
  town... or personally deliver the meteor. Pick a tool, click the map; right-click to put it down.
- **The Town Crier** — a scrolling news ticker of world happenings and extremely important local news
  ("Goat elected reeve after clerical error; approval soars").
- **The Chronicle** — every event is written to a running history in Dale Reckoning dates
  ("13 Eleasis, 1226 DR"). Click an entry to jump the camera there.

## Controls

| Input | Action |
|---|---|
| Drag / mouse wheel | Pan / zoom the map |
| Click a settlement, site, or realm | Inspect it (works on any tile of a town's sprawl) |
| God toolbar (bottom) | Pick a power, click the map · right-click / Esc to cancel |
| Space | Pause / resume |
| 1 / 2 / 3 | Simulation speed |
| Minimap (bottom right) | Click to jump |
| Legend button | Pantheon & map key |
| New World | Regenerate from a seed |

## Credits

- **Art:** [Kenney](https://kenney.nl) — *Medieval RTS* and *Fantasy UI Borders* packs (CC0, public domain)
- **Fonts:** Cinzel and IM Fell English (SIL Open Font License, via Google Fonts)
- All code is vanilla JavaScript + Canvas — no frameworks, no build step.

*Inspired by the Forgotten Realms campaign setting. This is a non-commercial fan project; all
original setting names are the property of Wizards of the Coast.*
