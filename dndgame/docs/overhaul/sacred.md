# sacred — sacred and courtly polyphony (`src/core/music_sacred.js`)

Owner: the `sacred` agent (Music fleet). Branches `overhaul/sacred` (first
attempt, stopped by the usage limit) and `overhaul/sacred-r2` (finished, landed).

## Plan

One book, `build(h)` -> `{ tracks, groups }`, every track with `contexts` and
`weight` (OVERHAUL.md 4.7). Sung voices (`voiceBass..voiceTreble`, `choirMen`),
organs, harp, vielle, recorder and bells; `room: 'chapel'` on the sacred pieces.
Written to sound acceptable on the old aliases and better on the audio agent's
real models, which landed mid-way (formant voices, KS plucks, rooms, loudness).

## The book (14 tracks, all landed)

| id | in-world title | form, mode | contexts |
|---|---|---|---|
| `dawnOrganum` | Lathander's Dawn Organum | organum triplum on *Viderunt omnes*, F | temple |
| `tyrConductus` | Conductus of the Even-Handed | 3-voice conductus with caudae, A | temple, castle |
| `helmFaburden` | Faburden for the Vigilant One | psalm alternatim, chant / faburden, D over G | temple, castle |
| `doomguideDies` | The Doomguides' Dies Irae | chant, enchiriadis organum, drone, bell, D | crypt, dungeon |
| `alustrielBallade` | Ballade for Lady Alustriel | Ars Nova ballade, double leading tones, G | castle, city |
| `moonbridgeRondeau` | Rondeau of the Moonbridge | Machaut-style rondeau ABaAabAB, hocket, F | castle, festival, city |
| `bindersMotet` | The Binder's Motet | Ars Antiqua motet on *Ave maris stella*, D | title |
| `seluneGymel` | Selûne's Gymel | English gymel + third voice, lullaby, C | night |
| `dragonspearPlanctus` | Planctus for the Fallen of Dragonspear | planctus over drone, organum at the fifth, E | lament, defeat |
| `blackHandHocket` | Hocket of the Black Hand | isorhythmic motet on *Dies irae*, hocket, alta capella, D | boss, battle |
| `mysteriesChant` | Chant for the Lady of Mysteries | fragmentary chant, psaltery, strict organum, D | mystery |
| `tempusConductus` | Conductus for the Foehammer | short conductus + cauda, a fanfare (5 bars), G | victory |
| `wayfireSong` | Song at the Wayfire | strophic 3-voice English discant song, 6/8, D | camp |
| `pilgrimStella` | The Pilgrims' Star (Stella splendens) | Llibre Vermell virelai, 2 voices + drone | road, travel, field, festival, village |

Arranged public-domain material (source named in each track header):
*Viderunt omnes* (GregoBase 1745), *Dies irae* (GregoBase 1198), *Ave maris
stella* (GregoBase 9733), *Stella splendens* (Llibre Vermell, both voices, from
Ali Corbin's abc transcription). Everything else is original in period forms.
Sung vowels come from real period texts (Dies irae, Ave maris stella, Psalm 120
Vulgate + Gloria Patri, Psalm 84:11, Victimae paschali, Veni Creator, Planctus
Karoli, a 14th-c. English lullaby, Sumer is icumen in, Machaut's *Rose, liz*,
the Stella refrain); only vowels reach the synth.

## How to use / extend

- Notation helpers at the top of the book: `line()` (note-name strings,
  durations carried forward, `-` ties, `r` rests), `modal()` (first rhythmic
  mode, long + breve per perfection, auto-chosen breves), `organal()`
  (enchiriadis organum with a floor and the occursus), `faburden()`,
  `beats()`, `words()` / `underlay()` (syllables, see below), `track()`.
- `node tools/sacred/check.mjs [id] [--dis]` — headless: instrument ids,
  ranges, steps, durations, NaN, contexts, overlaps, melted sung notes, and a
  counterpoint report (strong-beat consonance, parallels). Keep it at 0 errors,
  0 warnings. `tools/music-check.mjs` (audio agent's) must stay clean too.
- `node tools/sacred/render.mjs [id[@bar] ...] [--secs N]` — renders through
  `Audio.render()` (instruments, room, mastering, loudness normalisation) in
  headless Chromium; WAVs + metrics.json in `output/music/sacred/`.
  `--loudness` measures exactly as `core/music_loudness.js` is generated.

## Rules learned the hard way

1. **The singers are legato.** A sung line that never overlaps itself is sung
   on one breath; only a change of vowel re-articulates. A repeated pitch on
   the same vowel is ONE note. Before the fix 282 of 2709 sung notes melted
   (a psalm recitation became a drone). Put words under syllabic lines
   (`words(evs, latin, beat)`, `underlay(ref, evs)` for the other voices) and
   let `repercuss()` (inside `track()`) re-strike repeats within melismas.
2. **Loudness is normalised by the engine now.** `core/music_loudness.js`
   holds a measured level per track id; the measurement INCLUDES the track's
   `gain`, so changing a track's gain or notes without re-measuring its row
   makes it play too hot or too soft. After editing a track, run
   `render.mjs --loudness` and update its row (only your rows).
3. Only contexts in the §4.7 list are legal (`wilds` is a track id, not a
   context). Today the game requests town/inn/shop/tense/dungeon/field/
   temple/wilds/city/boss/battle/title/victory/camp/cave/forest/undermountain
   and night via trackForBiome; `crypt`, `castle`, `festival`, `road`,
   `mystery`, `lament`, `defeat` need the score agent's map wiring.
4. `symphonia` starts at G3 in the audio model; a low bourdon drone belongs
   on `hurdygurdy`.

## Verification (final state)

- check.mjs: 14 tracks, 0 errors, 0 warnings; strong beats 100% consonant in
  12 tracks; doomguideDies 91% (the enchiriadis floor producing the seconds it
  historically does), pilgrimStella 92% (the source's own F/G seconds), and
  the organum 99%. Melted sung notes: 0 (was 282).
- music-check.mjs: 0 errors (1 warning, `city`, not this book).
- Renders (24 s, normalised, game default volume): every track -31.9..-33.9 dB
  RMS, peaks -15.7..-20.9 dBFS, 0 clipped samples, 0 NaN; mid-piece sections
  rendered too. WAVs in `output/music/sacred/`.
- Regress suite green (the stamp check is refreshed by land.sh).
