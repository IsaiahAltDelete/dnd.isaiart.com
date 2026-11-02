# secular — secular dance and song polyphony (`src/core/music_secular.js`)

Owner: the `secular` agent (Music fleet). Branches `overhaul/secular` (r1, WIP)
and `overhaul/secular-r2` (landed).

## What is there

One book, `build(h)` -> `{ tracks, groups: { secular } }` (OVERHAUL.md 4.7),
merged into TRACKS by music.js. Every track has an in-world `title`,
`contexts` (the fine place it was written for AND the broad context the game
asks for today, so it is heard before the score agent wires finer contexts),
`weight`, `room` ('tavern' | 'open' | 'hall') and a comment header giving form,
mode, voices, source if arranged, and where it plays.

| id | title | form | contexts |
|---|---|---|---|
| yawningPortalRota | The Yawning Portal Rota | rota + pes, arr. *Sumer is icumen in* (c.1250) | tavern inn festival |
| elfsongTourdion | The Elfsong Tourdion | tourdion, arr. Attaingnant (1530) | tavern inn festival |
| jewelPavane | Pavane of the Jewel of the North | pavane, arr. Arbeau *Belle qui tiens ma vie* (1589) | city castle town |
| calishiteMourisque | The Calishite Mourisque | basse danse, arr. Susato *La Mourisque* (1551) | city market coast town |
| drawnSteelEstampie | The Estampie of Drawn Steel | estampie, 3 puncta, canon in III | battle |
| phandalinEstampie | The Phandalin Market Estampie | estampie royale, shared ouvert/clos, double-leading-tone clos | town market village |
| greengrassBranles | The Branles of Greengrass | branle double + branle gay, 4-part, handbells | festival market village |
| neverwinterWoodCaccia | Caccia of the Neverwinter Wood | caccia: canon at the unison over a ground, horn calls | forest |
| flamingFistSaltarello | The Flaming Fist Saltarello | saltarello, aperto/chiuso, loud band (triumphant) | battle victory |
| dolphinBridgeBallata | Ballata of the Dolphin Bridge | Landini ballata (ripresa, piedi, volta), Landini cadences, sung | city castle town |
| seaOfSwordsCarole | The Sea of Swords Carole | carole: 3-part burden + solo verse, 6/8 sway | coast |
| delzounBasseDanse | The Delzoun Basse Danse | basse danse: tenor in equal breves, discant, bassus; drone only under D bars | hills mountain |
| brokenShieldEstampie | The Estampie of the Broken Shield-Wall | estampie over a descending ostinato, Phrygian clos (desperate) | battle boss |
| rageOfDragons | The Rage of Dragons | parallel-fifth organum tenor, hammering shawm, big drums, gong | dragon boss |
| mereLament | Lament of the Mere of Dead Men, with its Rotta | lamento + rotta (the Add. 29987 pairing) | marsh tense |
| highRoadPassamezzo | The High Road Passamezzo | divisions on the passamezzo antico | road travel field |
| triboarEstampie | The Triboar Estampie | estampie, punctum III in hocket | tavern inn village |
| dockWardIstampitta | The Dock Ward Istampitta | istampitta: imitation at the fifth down a circle of fifths | city market |
| daggerfordPastourelle | The Daggerford Pastourelle | pastourelle: sung verse A A' B + refrain, vielle, harp | inn tavern night |

The four arrangements were made by r1; everything added in r2 is original, in
the forms and modes of its century. That is deliberate: the PD pieces named in
the brief (La Rotta, Lamento di Tristano, the Add. 29987 saltarelli, Kalenda
Maya, the Palastinalied, Arbeau's branles) could not be checked against an
edition from this sandbox, and an arrangement that is wrong but labelled as the
real piece is worse than an honest original. OVERHAUL.md 2.7 prefers originals.

## Notation helpers (inside build)

- `abc(src, { key, unit, beat, weak, shift })` — ABC lines to events. `unit` is
  the steps of one ABC length unit (2 = quaver, 4 = crotchet, 8 = minim).
- `seq`, `stack`, `times`, `move`, `up`, `loud`, `wrap` (fold a delayed canon
  voice onto the loop), `sing(evs, vowels)`, `drums(kit, ...bars)`, `hold`.
- `puncta(bodies, ouvert, clos, o)` — each body twice, open then closed ending.
- `rolls(bass, beat, lift, q)` — root / fifth / octave plucks per bass note,
  clamped inside the note so a pluck never rings over the next chord.
- `dia(evs, n, key)` — transpose by scale steps (imitation at the fifth, sequences).
- `hocket(evs)` — split a line between two players note by note.
- `rotta(evs, beat)` — re-time a duple line as its long-short triple afterdance.

## Verification

- `$NODE tools/secular/check.mjs [ids] [--dis]`: instrument ids, drum ids,
  rooms, vowels, contexts, integer steps inside loopBars*16, durations > 0, no
  NaN, compass per instrument, overlapping mono lines, and a counterpoint report
  on every beat (BEAT table per track; `[fromStep, beat]` pairs for metre
  changes). r2 tracks: 100% of beats consonant; the r1 arrangements 90-100%
  (their period passing notes).
- `$NODE tools/secular/balance.js` via `tools/music-render.mjs --script ...
  --ids a,b` — each layer rendered solo; used to set every layer gain so the
  tune leads (measured, not guessed: e.g. the first score's `shawm` sits ~14 dB
  under `shawmAlto` at the same gain, and `bagpipe` ~15 dB under the rest).
- `tools/music-render.mjs --tracks <all 19> --seconds 24 --out output/music/secular
  --json output/music/secular/stats.json`: WAVs to audition; normalised
  loudness -31.5..-33.1 dB, peaks -16..-19 dBFS, 0 clipped samples, no silence.
  `--realtime` (live scheduler) checked on rageOfDragons and triboarEstampie.
- `tools/music-check.mjs`: 0 errors.

## Decisions and rules learned

- A plucked accompaniment written as chord rolls must be clamped to the bass
  note's length: the octave pluck of a whole-note roll rang two steps into the
  next bar and made 20% of the passamezzo's and Triboar's beats clash.
- A roll of root-fifth-octave only works over a root; where the bass takes a
  chord's fifth (a 6/4, a fourth under the tune) the bass moves to the third
  instead (first inversion), which is also the period's habit.
- A monophonic instrument layer holding two drone notes is two layers
  (`drone`, `droneFifth`); names starting `drone` are left out of the
  counterpoint report.
- Loudness: `tools/music-render.mjs --loudness` sets REFERENCE to the median of
  all tracks, so adding 19 dense tracks moved it from -33.3 to -30.7 dB and
  would have raised the whole score 2.6 dB against the SFX. The tool now takes
  `--reference <dB>`; the table was regenerated with `--reference -33.3`.

## Left / followups

- The game still asks for 'wilds' (marsh, ruins, ash-waste in trackForBiome),
  which is a track id, not a context; `mereLament` answers `marsh` and `tense`.
  The score agent should map marsh biomes to the `marsh` context.
- 'shop' has no secular track (the first score's `shop` answers it).
- Songbook UI: every track has a title, so `Audio.contextTracks()` can list them.
