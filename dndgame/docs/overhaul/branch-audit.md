# Saved feature branch audit — 21 October 2026

Compared the current workspace with the saved branch tips. These are surviving
implementation checkpoints, not a list of features already playable in this build.

| Branch | Saved work | Integration still needed |
| --- | --- | --- |
| `overhaul/stage-r2` | Commit `8135aa6`: expose render surfaces; clear the display when the flat buffer is unavailable. | Three-line Stage patch is absent from the workspace. Review against current compositor before applying. |
| Pastimes | `10c3e0f`, `a2c5353`: activity data, rules, Three Dragon Ante engine and tests. | Scenes, player access, visual assets and world hooks. |
| Crafting | `737001a`, `3ff42b5`: recipes, gathering data/rules, herbs, nodes and workbench art. | Gathering interactions, crafting scenes and asset integration. |
| Travel | `04f293b`, `5d6e426`, `8c44b4e`: routes, journey rules/tests, mounts and art. | Route desks, journey UI and world integration. Current illustrated location transitions are a different, integrated feature. |
| Ambience | `88228d9`, `ab381c4`, `4ec3c88`: DSP, ambience engine, render tool and documentation. | Audio/settings integration and scene hooks. The current simpler ambience implementation is not this branch engine. |

Do not merge these branches wholesale into the accumulated local work. Their
shared files predate the accepted art, city-life, combat and music changes.
Port each feature with its UI and tests as a separate reviewed implementation.
The audit is complete; the branch-only features themselves are not complete.
