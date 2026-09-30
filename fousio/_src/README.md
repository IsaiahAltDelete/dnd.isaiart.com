# /fousio — how the pages are made

Fousio's character sheet, his two signature artifacts and a sheet for every item he
carried, all read out of his Baldur's Gate 3 save. Folders starting with `_` are not
published by GitHub Pages, so everything here stays out of the site.

```
fousio/
  index.html            the character sheet            (generated)
  staff/  circlet/      the two artifacts, with 3D     (generated)
  items/<slug>/         one sheet per item             (generated)
  assets/
    fousio.css  fousio.js  viewer.js   styles, motion, the GLB turntable
    vendor/three.min.js                three.js r160 (MIT), vendored so nothing loads from a CDN
    models/*.glb, circlets.json        the staff and the nine circlet looks
    img/                               photos (photo mode) and items/ (in-game item art)
  _src/
    build_site.py       data/*.json -> the pages above
    data/               fousio.json, artifacts.json, icons.json (what the pages are built from)
    save/               the save reader (below)
    models/             make_models.py, which builds the GLBs
```

## Rebuild the pages

```
python fousio/_src/build_site.py
```

Bump `V` in `build_site.py` when you change `assets/*.css|js`, so browsers fetch the new files.

## Read a save again

The save reader needs Python 3 with Pillow and pythonnet, LSLib's Divine
(`~/Documents/BG3Modding/Packed/Tools`) and `bg3.py` from `ClaudeStuff/modworkshop/tools`
(paths in `save/paths.py`, overridable with environment variables). It works in a scratch
folder (`%TEMP%/fousio-sheet`), never in the repo.

```
cd fousio/_src/save
python run.py "Fousio-57912622555__QuickSave_583" --playtime "290h 22m" --difficulty Custom
python ../build_site.py
```

`run.py` unpacks the save, extracts the game's race/class/feat tables, stats, root
templates and English text, extracts the same from every mod in the Mods folder, then:

| step | writes |
|---|---|
| `build_data.py` | the character: scores, level-ups, spellbook, gear, companions, journey |
| `build_artifacts.py` | the Staff of the Fixed Star and the Circlet of Nous |
| `derive.py` | AC, spell DC, spell attack, saves and skills, each with its sources |
| `icons.py` | item art as WebP in `assets/img/items/` |

Use `--skip-game-data` to reuse the extracted game and mod data from an earlier run.
Playtime and difficulty are not stored in a readable form in the save, so they are passed in.

### The save format

A save's `Globals.lsf` carries the game's ECS world as one binary blob ("LSMF") that no
public tool reads; `save/lsmf.py` documents what was worked out: a table of 351 packed
types (components, the structs they point into, enum tables), per-type lists of owning
entities, pointers as offsets, arrays as begin/end pairs, strings as pointer + length and
GUIDs in LSLib's byte order. Items and characters still carry their stats names and
statuses in the older regions of the same file, which `prepare.py` pairs with their entities.

## Credits and licences

- Game data, item art and base-game names: Baldur's Gate 3 © Larian Studios, shown here as fan content.
- Items from other mods keep their authors' names and art: Fade's Equipment Distribution,
  Fade's Assorted Treasure Expansion, Underwear of Rituals, Mystra's Spells, 2024 Spell Updates
  and others, credited on each item's sheet.
- The Staff of the Fixed Star and the braille circlets are Isaiah's own models (BG3 Forge and
  the braillecrown generator in ClaudeStuff); see `models/README.md`.
- three.js r160, MIT licence (`assets/vendor/three-LICENSE.txt`).
- Photos: in-game photo mode.
