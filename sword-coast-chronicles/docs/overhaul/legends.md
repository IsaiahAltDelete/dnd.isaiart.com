# Familiar faces of the Realms

Three optional conversations place famous travelers alongside the existing local cast. These are original encounters for this campaign, not claims about a canonical itinerary.

| Visitor | Where to find them | Local lead |
| --- | --- | --- |
| Drizzt Do'Urden | Neverwinter Wood, beside the northern trail just south of the stream bridge | Ask Toblen about interesting travelers, or Volo about famous people |
| Elminster Aumar | Candlekeep approach, outside the library gate | Ask Volo about the old mage |
| Alustriel Silverhand | Waterdeep's Yawning Portal, near Volo and the tables | Ask Durnan about the silver-haired traveler |

Each has four conversation topics, a distinct composed sprite and matching portrait colors. Drizzt repairs a merchant's pack, Elminster corrects a book that cites him, and Alustriel sorts correspondence between meetings. Their dialogue assumes lives already underway: companionship, errands, quiet humor and practical advice. Meeting them records a flag; revisiting grants no gold, items or experience.

Volo also speaks of the Companions of the Hall, Laeral and Vajra. Jaheira has a small story about a letter from Minsc and Boo. Those references do not spawn additional characters. The three visitors are social cameos using the existing noncombat NPC setting; this pass does not add recruitable companions, legendary combat stat blocks or quests.

## Lore grounding

- [D&D Beyond: Legendary Heroes — The Forgotten Realms' Greatest](https://www.dndbeyond.com/posts/2026-legendary-heroes-the-forgotten-realms-greatest): established identities and relationships, including Drizzt and Guenhwyvar, Elminster of Shadowdale, Alustriel's former rule of Silverymoon, Laeral and Vajra, Minsc and Boo.
- [D&D Beyond: Who Are the Wizards Three in Vecna: Eve of Ruin?](https://www.dndbeyond.com/posts/1703-who-are-the-wizards-three-in-vecna-eve-of-ruin): Alustriel's history and traveling role.

Candlekeep is explicitly Elminster's errand, not his home. Alustriel is visiting her sister, not presented as Silverymoon's current ruler. All dialogue and the specific visits are original campaign writing.

## Verification

`tools/legends-check.mjs` checks catalog registration, dialogue destinations, exit routes, reward safety, portrait identities and the four local leads. `tools/legends-playtest.mjs` drives actual interaction and menu input in a disposable browser origin at 800×480 and 1200×720. The live preview and paused campaign are not used by these fixtures.

Final critic result: **8.7/10 — PASS** on the first of three allowed attempts; no blocking defects. All conversation routes passed at both preview sizes with zero console errors, and the original web-game client opened Drizzt's conversation successfully. Natural campaign discovery, historical-save coverage, long-term revisit variety, every reputation/weather state and audio were not assessed.
