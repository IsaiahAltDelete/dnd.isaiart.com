# title — the title screen as the showcase of the layered renderer

Role: Interface fleet, `title`. Owns `src/ui/title.js`; new modules
`src/ui/title_vista.js` (the Sword Coast vista) and `src/ui/title_logo.js`
(the logotype and its heraldic device).

## Plan
1. [x] Vista module: every depth prerendered ONCE into offscreen canvases, in a
   dusk palette and a night palette, pixel by pixel (no antialiasing), and
   cross-faded in sixteen cached steps (a frame costs one drawImage per depth).
   Depths, far to near, each on its own world layer (res 1, z 11-17, so F10
   shows and toggles them): sky (dithered dusk bands arcing round the setting
   sun; stars; Selune and her Tears at night), clouds (two drifting strips,
   underlit at dusk, moon-silvered at night), the Sword Mountains in haze
   (alpenglow on west faces), the Sea of Swords (sun path glints, a cog under
   sail, window reflections at night), Neverwinter on its headland (walls,
   towers, Castle Never; windows light one by one), gulls, and the near cliff
   road with a lantern-lit waystation (torches, chimney smoke, surf at the
   cliff foot). Halos go on the standard `glow` layer.
2. [x] Slow parallax drift (camera sine pan, integer px per depth) and idle motion.
3. [x] Night drift: after 20 s without input the scene dissolves toward night
   over 24 s (sun sinks, stars thicken, moon rises, windows light); a key, a
   click or a moved mouse brings dusk back in 5 s.
4. [x] Logotype on the menu layer, authored at the fine grid: Lombardic
   capitals built from swept strokes (swelling stems, pen slits, hairline
   serifs), the O of COAST a compass rose on a lapis card, a sword laid under
   the words as the rule, CHRONICLES in the same alphabet at half size between
   lozenge flourishes; burnished gilt, bevels, bronze extrusion, keyline;
   a shine sweep every 6.5 s. Prerendered once.
5. [x] Menu as a vellum panel in the kit's theme (rubricated entries in the
   display face, lamplit selection via menukit), fine hint line, fine version
   string, "Press any key" in the display face. Every existing flow kept: new
   / continue / load / settings / bestiary / credits, audio gate, keyboard +
   mouse, J bestiary and 1 new game quick keys.
6. [x] Verify + land (increment 1 landed at 86ff1ff).
7. [ ] Polish: headland and plateau texture, lit windows at dusk, city
   reflection, night check, frame-time measurement.

## Notes
- `output/title/logoprev.mjs` (scratch, git-ignored) composites `buildLogo()`
  over a captured frame in node: iterate on the letters without a browser.
  `buildLogo()` is pure for exactly that reason.
- The traveller stands at the foot of the road (350, 237) so the figure's
  24px height reads as foreground; beside the waystation's 9px door it read
  as a giant.
