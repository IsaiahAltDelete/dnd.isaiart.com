# kit — the illuminated-manuscript interface kit

Owner files: `src/ui/kit.js`, `src/ui/ornament.js`, `kit-test.html`, plus the new
`src/ui/glyphs.js` (the typefaces as pure data, loadable in node).
Hook outside my files: one `uiTheme` entry in `SETTING_SPEC` (core/save.js) so
the theme survives the settings sanitiser (which drops unknown keys) and the
Options > Display screen lists it for free.

## Plan (all done unless marked)
1. Font engine on faces, not one bitmap. A face is a glyph table + cell
   metrics; a size token picks (face, scale, bold, grid).
2. Drop caps: `UI.initial`.
3. Panels rebuilt as materials with fine-grid borders; themes re-point the
   five base styles.
4. Themes persisted in `Save.settings.uiTheme`.
5. Widgets: buttons, meters, tabs, rows, tooltips, chips, cursor, dividers,
   scrollbars, keycaps, icons — all with a fine-grid pass.
6. ornament.js as the low-level toolbox (kit imports it; no cycle).
7. kit-test.html as the living style guide.

## How to use it (for the other agents)

### Text sizes
| size | face | on a fine (2x) layer | on 1x |
|---|---|---|---|
| `sm` `md` `lg` `lgb` `xl` `xxl` | body 5x7 | unchanged | unchanged |
| `fine` / `fineb` | body at half size | 3px advance, 5px lines | -> `sm` / `md` |
| `xs` | compact 4x6, small caps, tabular digits | 2.5px caps, 4px lines | -> `sm` |
| `title` | Lombardic caps + textura, 8px caps | same (gilt bevels on the fine grid) | same |
| `titleLg` | the same at 2x, 16px caps | same | same |

- `UI.text(ctx, x, y, s, { size, gilt: true })` bevels the text in gold (or
  in `color`: `gilt: true, color: '#c0392e'` is a rubric red, lapis works too).
  `keyline: '#000'` adds a one-device-pixel outline.
- `UI.heading(ctx, x, y, 'Journal of Deeds', { size: 'title', rule: 120 })` —
  rubricated heading: gilt first capital, the rest in `color`, optional
  fleuron rule under it.
- `UI.initial(ctx, x, y, 'T', { size: 'lg'|'sm', ground: 'lapis'|'rubric'|'verdigris'|hex })`
  -> `{x,y,w,h}`: a drop cap (24px or 14px box) with penwork and a vine
  hanging below the box. Flow text from `x + w + 3`.
- `measure / wrapLines / fit` take an optional last `res` (1|2). Without one
  they assume the resolution of the last context the kit drew to. The whole
  UI is on one kind of layer, so this is exact in practice; pass `res` (or
  measure after at least one draw) when it matters on the very first frame.
- `UI.fineReady(ctx)` tells you whether fine sizes will render fine.
- No tofu: every face has all printable ASCII, the accented Latin letters
  (generated from base + mark, Faerûn included) and the pictograms in `UI.G`.
  Unknown accented letters fall back to their base letter (NFD).

### Surfaces
Base styles (re-skinned by the theme): `window dark plain inset gold`.
Always available by name: `parchment iron timber leather danger magic banner
seal vellum steel brass`. The BORDER WIDTH of every existing style is
unchanged (ring counts), so `ix/iy/iw/ih` never moved.
- `banner` takes `color` (the field) and hangs from a rod 2px above `y`; its
  interior stops above the swallowtail.
- `UI.ribbon(ctx, cx, y, label)` — a title ribbon with folded tails
  (`UI.window` now uses it for its title).
- `UI.seal(ctx, cx, cy, { r, letter | icon, color })` — a wax seal.
- `UI.setTheme('folio'|'timber'|'iron'|'parchment', persist = true)`,
  `UI.theme`, `UI.THEMES`, `UI.themeName(id)`. The Options screen already
  cycles it through `SETTING_SPEC.uiTheme`; the kit re-applies on every
  settings save (EV_SETTINGS). Every theme keeps panel fills dark enough for
  `COLORS.ink`; `PANEL_INK.gold` follows the theme (steel in iron).

### Widgets
- `button(..., { hover, pressed })` are new states; `style: 'seal'` is the
  red wax face for a decisive action.
- `bar(..., { id })`: the kit remembers the last value per id and drains a
  damage ghost after a hit (0.35s hold, then 90%/s), and sparks the leading
  edge after a heal. An explicit `ghost` still wins.
- `UI.scrollbar(ctx, x, y, h, top, rows, n)` — the list's scrollbar, exported.
- `divider(..., { ornament: true })` puts a fleuron at the centre of the rule
  (automatic on fine layers for rules >= 60px); a `label` now breaks the rule
  instead of painting a background patch (`bg` is ignored).
- Icons on fine layers are re-baked at device resolution (Scale2x where it
  fits, then a keyline and upper-left light). New icons: quill, banner, seal, lute.

### ornament.js exports
`resOf, makeCanvas, stamp, rivet, boss, fleuron, corners, deckle, vine, grain,
hairFrame, medievalPanel, GILT, RUBRIC, LAPIS, VERDIGRIS`.
`medievalPanel` kept its signature and geometry (3px border, rivets at the
corners) and gained fine brass edging and wood grain.

## Rules learned the hard way
- A fine layer is detected by `ctx.getTransform().a >= 2`. Inside
  `Stage.fine()` (transform back to 1) the fine sizes fall back — which is
  right, because there the caller is already drawing in fine px.
- Never scale a text shadow with the display face: at titleLg a 2px shadow
  reads as a second letter. The display face keeps a 1px shadow at any size.
- Grain at 1x is dirt: each speck is a whole logical pixel. It is kept to
  under half strength there.
- Clip paths antialias: the banner's swallowtail is drawn row by row instead.

## Status
- [x] faces, sizes, fine grid, fallbacks, measure/wrap/fit on every size
- [x] drop caps, headings, gilt / rubric / lapis text
- [x] materials + themes + persistence
- [x] widgets + icons fine pass
- [x] style guide (kit-test.html)
- [ ] verify on the real Stage once it lands (fine text on real 2x layers)
