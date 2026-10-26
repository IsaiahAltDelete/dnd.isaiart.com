# NPC behavior, reputation and trade — 20 Oct 2026

The user's next pass after the saved checkpoint queue connects actions to local
reactions and merchant terms. This is a bounded systems pass, not a replacement
of authored quests, faction relationships or the town schedule system.

## Player behavior

- NPCs remember being attacked, witnessing an assault, receiving help and
  serving a customer. Paying a fine clears the legal penalty, not those memories.
  A contextual opening precedes authored dialogue; existing quest choices remain.
- Witnesses must have sight of the assault. Animals do not report crimes.
  Wary civilians keep a short distance; guards face the party and keep their post.
  These reactions require sight, and civilians return home after panic ends.
  Villains retain their authored civic attitudes and their personal memories.
- Local standing is separate from faction reputation and follows the parent
  region into interiors. It ranges from -50 to +50. Trusted starts at +10,
  Respected at +25, Distrusted at -10 and Feared at -25.
- Help, rescues and completed jobs improve standing, capped at 12 earned points
  per regional day. Quest IDs receive credit once. Private job acceptance and
  abandonment are not public wrongdoing. Trade itself earns no reputation.
- Trusted/Respected standing reduces goods prices by 5/10% and improves offers
  by 5/10%; Distrusted/Feared adds 10/20% to goods and reduces offers by 10/20%.
  Existing bounty and charm factors multiply goods prices. Service fees stay
  fixed; displayed integer prices remain authoritative after rounding and caps.
- Selling a stocked item fills depleted shelf space, up to the original stock.
  Unlimited staples now remain available (Infinity formerly became zero).
  Offers cannot exceed same-counter purchase prices or the cheapest repeatable
  unlimited supply price with maximum ordinary discounts. Finite supplies can
  still support trading between merchants. Capped offers are labeled in details.

## Implementation and verification

`src/rules/reputation.js` owns lazy `state.social` data. `deeds.js` applies public
standing; crime reporting owns personal victim/witness memories. Map definitions
provide regional lookup without introducing a rules-to-world import cycle.
Existing faction data, save version and tile IDs are unchanged. Old saves begin
neutral; previous deeds are not retroactively replayed.

`tools/society-check.js` runs under `tools/shot.mjs`: 35 passing checks cover
regional isolation, private offers, caps/deduplication, villains, commerce,
market ceilings, memory, actual wall occlusion, AI recovery and saving. The full
browser regression suite passes 33 checks with no page errors. Evidence lives
in `output/society/`; native captures and desktop rendering were inspected.
The web-game skill client also exercised keyboard navigation, insufficient
funds and successful purchases (gold 50 -> 49 -> 48).

Critic history: **7.9 -> 8.3 -> 8.6, PASS** (8.5 target, three attempts).
Three defects corrected for round 2: private
acceptance leaking into public standing, villains inheriting civic gratitude,
and wary NPCs reacting through walls. Round 2 found role-only villains still
inherited civic gratitude. Round 3 extends the exception to direct/nested roles
and tags, with tests for the actual Astele Keene record. The same independent
critic marked every prior defect fixed, with none remaining in this scope.
No runtime changes were made after the final review.

Not assessed: long-campaign economic balance, every authored schedule,
exhaustive historical saves and continuous movement feel. Changes remain local,
uncommitted and undeployed.
