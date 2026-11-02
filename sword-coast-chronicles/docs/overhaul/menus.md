# menus — every menu-type scene in the illuminated-manuscript kit

Role: Interface fleet, `menus`. Owns `ui/menus.js` (Pause, Party, Inventory,
Spellbook, Journal, Map, Options, Bestiary, Save), `ui/dialogue.js`
(presentation), `ui/shop.js` (drawing only — the economy agent owns its logic),
`ui/restui.js`, `ui/levelup.js`, `ui/charcreate.js`, `ui/cheatmenu.js`, and the
new `ui/menukit.js` (shared chrome). Helpers: `tools/menus/gallery.js` (one
browser run photographs every scene), `tools/menus/unpack.mjs`,
`tools/menus/kitguide.js` (the kit style guide as PNGs).

## Plan
1. `ui/menukit.js`: the chrome every menu screen shares, so the whole game
   reads as one product — the desk backdrop, the rubricated screen heading,
   section heads, fine key strip, fine key/value rows, the selected-row
   treatment, the parchment page.
2. menus.js helpers (hintBar, sectionHead, kv, headers) delegate to it; Pause
   and Options first.
3. Options gains the customization settings: Interface Theme, HUD Preset,
   Arrange HUD, Pixel Filter, Scanlines, Encounter Pacing (all are
   SETTING_SPEC keys the other agents read), and the Minstrel's Songbook
   (Audio.tracks / TRACKS titles, play buttons, favourites in
   `Save.settings.musicFavorites`). Every cross-module call guarded.
4. Dialogue: drop-cap initial on each new speaker line, name plate, framed
   portrait, choices, typewriter.
5. Party / Inventory / Spellbook / Journal (parchment) / Map / Bestiary / Save:
   fine type for secondary text, title-face headers, clear selection.
6. Shop (new draw functions only), Rest / Camp, Level-up, Cheats.
7. Character creation: large integer-scale appearance preview with pose
   previews when `actorPoseFrames` exists.

## Rules
- Keep the existing geometry constants (CONTENT_BOTTOM 210, MSG_Y 212,
  HINT_Y 224) so every screen's hit rects keep working.
- The inventory stays dark: regress samples its top strip for white snow.
- charcreate regress checks (setClass / warn / randomiseAll / finish) must
  stay green.

## Status
- [x] menukit + helpers (desk, header, rubrics, fine key strip, kv, selRow, scroll, page)
- [x] Pause, Options (+ Style page: theme, HUD preset, Arrange HUD, pixel filter, scanlines; encounter pacing on Combat; Songs page = Minstrel's Songbook)
- [x] Dialogue (r2): 3x painted bust in a gilt frame, name cartouche + title, drop cap per speech, fine keys, choice slips
- [x] Party, Inventory, Spellbook, Journal (parchment), Map (scribe's plan), Bestiary (parchment stat block), Save (r2)
- [ ] Shop, Rest, Camp, Level-up, Cheats
- [ ] Character creation appearance preview

## r2 notes (resumed run)
- menukit grew: `frame` (gilt picture frame), `portrait` (painted bust at a whole
  device-pixel scale, creature sprite head, signet), `plate` (cartouche), `tabs`
  (bookmark tabs, same geometry as UI.tabs, so hit rects are unchanged),
  `chip` (fine tag), `meter`, `statBox`, `capPara` (fine prose opening on a drop cap).
- Every `UI.tabs` call in my files is `MK.tabs` now; `sectionHead` is a fine rubric.
- Lists keep the body face; selected rows no longer switch to bold `md`
  (that re-truncated the name on selection).
- Map: `ui/hudmap.js` gained a one-line export `planCanvas(map)` (hud agent's
  file) so the Map screen draws the same scribe's plan as the minimap, blown up
  at a whole number of device pixels per tile and fitted to the surveyed box.
- tools/menus/gallery.js seeds quests, gear, bestiary kills and a pending level
  so every page has something on it.
