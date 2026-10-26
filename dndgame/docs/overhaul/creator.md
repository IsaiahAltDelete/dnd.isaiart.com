# Character creator revamp — 21 October 2026

The creator now groups its existing twelve pages into **Origins**, **Training**,
**Personal**, and **Review**. Pages keep full names, incomplete choices are marked,
and players can explore their appearance or identity before finishing rules
choices. Next still checks the current page; Create checks the complete draft.

The Hero panel pairs the existing detailed portrait with the actual equipped
game sprite. Facing is controlled manually in a geometric cycle, with a separate
walk/idle switch. The Sheet tab retains derived combat statistics. Both use the
same character build as final creation.

Surprise me generates a draft and stops at Review. Review offers a story/bond,
an editable checklist, and specific reasons for any missing choices. A missing
lineage opens its actual selection page. Existing class/species choice stashes,
recruit cancellation and companion locks are preserved.

## Controls

- Click chapters or use **Shift+Q / Shift+R** to move between them.
- **Q / R** goes back/next; **Z / Enter** chooses or edits a highlighted row.
- **Tab** cycles subsections; **1–5** selects visible subsections.
- **J / K** rotates the sprite, **M** toggles walking, **I** switches Hero/Sheet.
- Wheel over the middle pane scrolls explanations; left/right also scrolls when
  the highlighted option is not adjustable. **E** goes to a missing choice.

Long mechanical values now wrap in full. Explanations and missing-choice reasons
use the larger body face; compact type is reserved for secondary controls and
metadata. The details pane scrolls when needed.

## Verification

All evidence is under `output/creator/`; generated captures are git-ignored.

| Evidence | Result | Scope |
| --- | --- | --- |
| `r2/report.json` | 56 pass | 800×480, mouse and keyboard navigation, customization, name entry, validation, explicit creation |
| `r2-secondary/report.json` | 56 pass | Same checks at 1200×720 |
| `controls/report.json` | 8 pass | Four facings, long appearance list, cantrip selection/deselection, spellbook, feature sections, point buy |
| `readability/report.json` | 5 pass | Actual drawn resistance/damage strings, body font, missing-choice reasons and wheel scrolling |
| `regress.txt` | 33 pass | Existing game regression suite, including randomized creator builds and entry into the world |
| `skill/` | Screenshot and text state | Adapted develop-web-game client using normal directional input |

Catalogue page coverage includes directly staged wizard, paladin and advanced
warlock drafts; those rendering checks are not described as complete manual
creation runs. Tested final creation preserves the preview name, appearance,
HP and AC. No page or draw failures in the final runs.

Critic history: **8.1 → 8.6/10, PASSED** on round two. The two findings were overly
small body text and permanently truncated mechanical values. The same critic
confirmed both fixed in fresh primary and secondary captures; no remaining
must-fix issue was found. Target 8.5, maximum three attempts. No runtime edits
after the passing review. All 150 module hashes are current; diff whitespace
checks pass.

The live localhost:8765 campaign and saves were not touched. No commit or
deployment. Exhaustive build combinations, gamepad/device coverage and full
campaign progression are outside this bounded creator pass.
