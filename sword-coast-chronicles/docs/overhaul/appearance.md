# Appearance customization

The creator now has Body, Hair and Dress tabs. Hair adds side part, undercut,
locs, afro, low bun and twin braids (18 total choices). Each new cut has an
editable 16x24 PixelForge source with front, side and back grids; right mirrors
left. Portraits interpret the same choice with matching silhouettes. Braids
and locs have anchored roots and moving tips during walking. Front hair and
beards render over collars so clothing no longer erases their lower edge.

Dress exposes 16 existing garment cuts as explicit cosmetic choices, including
doublets, noble dress, coats, robes, jerkins, ranger clothes, monk wraps,
vestments, druidwear, gambesons, peasant clothes, furs, tabards and armour looks.
Equipment restores the original equipped-armour/class fallback. This changes
appearance only: equipped items and AC are untouched. Cloaks, boots, colours
and the calling's emblem remain independently configurable. Headgear lives
beside hair controls, with a hint to choose None when inspecting a cut.
Leather and Linen controls recolour their matching portrait and sprite
materials; material-specific hints identify which swatch affects each cut.

`appearance.wardrobe` is intentionally separate from the old `outfitStyle`:
legacy characters often carried `outfit-tunic` as an unused default. Treating
that old value as a deliberate override would unexpectedly undress old saves.
Missing or unknown wardrobe values preserve the old resolver. The portrait
and world sprite use this shared resolver; the composed sprite cache includes
the new field. Class emblems also resolve consistently in both renderers.

## Verification

- `tools/appearance-playtest.mjs`: isolated browser origin, actual tab/keyboard,
  rotation, walking, campaign creation and combat entry. Checks all 16 frames
  for each new hairstyle, distinct garment renders/cache changes, armour-stat
  invariance, old/unknown values, save serialization round-trip, helm occlusion
  and class revisiting. Final round2:139 checks at each of800x480 and1200x720.
  Warm-cache on/off/on probes restore exact original bard and cleric pixels;
  keyboard emblem and material colour controls change the actual rendered pixels.
- Existing `tools/creator-playtest.mjs`:56 checks pass after the new tabs.
- `tools/appearance-probe.js`: real portrait/actor comparison sheet, four
  facings and primary game-size sprites. Evidence in `output/appearance`.
- Six new `.pxa` sources pass strict lint. Narrow documented exemptions:
  alternating pixels at two-pixel braid crossings (`orphan`) and the filled
  shaved-scalp plane (`doubles`). Other cuts have no skipped rules.
- General regressions:33 pass. Required web-game client completed; screenshot
  and `render_game_to_text` inspected.39 authored modules and156 import-map
  hashes current; `git diff --check` clean.

## Critic result

**8.1 -> 8.6 PASS**, second of three allowed attempts, target8.5. Round1 found
stale emblem pixels and differing jerkin/ranger material channels. Round2
fixed both, added the Linen control and material hints, and verified actual
pixel changes. Reports: `output/appearance/critic-r1.md` and `critic-r2.md`.
No runtime changes after the passing review.

The secondary side/back captures show Bald after keyboard cycling; primary
captures and `gallery-r2.png` cover Twin Braids. Still screenshots cannot
certify continuous motion feel, all species/gear combinations, or gamepad use.
The original live campaign and its open creator draft are preserved.
The fresh user-facing preview is open on Hair at
`http://127.0.0.1:8765/?appearance-preview`.
