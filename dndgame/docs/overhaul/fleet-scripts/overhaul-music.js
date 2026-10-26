export const meta = {
  name: 'overhaul-music',
  description: 'Music fleet: polyphony-grade synthesis (sung voices, Karplus-Strong, rooms), sacred and secular medieval polyphony books, score integration',
  phases: [
    { title: 'Voices', detail: 'audio synthesis + sacred polyphony' },
    { title: 'Dances', detail: 'secular polyphony' },
    { title: 'Score', detail: 'contexts, mix, songbook, audition page' },
  ],
}

const RESULT = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    branch: { type: 'string' },
    landed: { type: 'boolean', description: 'true only if tools/land.sh printed LANDED' },
    landSha: { type: 'string' },
    summary: { type: 'string', description: '4-10 plain sentences for the user: what changed and why it sounds better' },
    changes: { type: 'array', items: { type: 'string' } },
    verification: { type: 'array', items: { type: 'string' }, description: 'what you checked and the evidence (renders, measurements, tests)' },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'worktree-relative paths of WAV renders or pages worth auditioning' },
    followups: { type: 'array', items: { type: 'string' }, description: 'facts later agents / the orchestrator must know' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'branch', 'landed', 'summary', 'changes', 'verification', 'followups', 'problems'],
}

const PRE = (role) => `You are the "${role}" agent, one of about two dozen agents in four parallel fleets overhauling *Sword Coast Chronicles*, a zero-dependency browser RPG (vanilla ES modules, WebAudio, Forgotten Realms). You run in your OWN git worktree of the repo (your cwd). The main checkout C:/Users/Dizzy/Documents/DND GAME is shared: never edit or commit there directly.

RESUMED RUN - READ FIRST. An earlier attempt at these roles was stopped by the account usage limit. If branch overhaul/${role} exists it holds that attempt, ending in a "WIP checkpoint" commit that may be mid-edit: create overhaul/${role}-r2 from it (git checkout -b overhaul/${role}-r2 overhaul/${role}), read docs/overhaul/${role}.md, check what is there actually works, and CONTINUE - never redo finished work. The usage limit can stop you again at any time, so: land a solid, working increment as early as you can (sh tools/land.sh) and land again as you improve; commit after every meaningful step; spend tokens on the work, not on re-reading - use grep and sed -n ranges on big files (several are 100-480 KB) instead of full reads, and read each doc once.

STEP 1. Read docs/OVERHAUL.md in full (binding; section 4.7 is the music contract, section 5 ownership, section 6 how to work and land). Read the long music section of progress.md (the SPECTRA / section: / orchestral work - why the old score sounded like beeps and how that was fixed), then core/music.js and core/audio.js end to end.
STEP 2. Branch per section 6 (overhaul/${role}; if it already exists a previous attempt was interrupted: branch overhaul/${role}-r2 from it and continue from docs/overhaul/${role}.md). Write your plan to docs/overhaul/${role}.md. Commit.
STEP 3. Do the work below, committing after every milestone.
STEP 4. Verify, then land with: sh tools/land.sh (resolve conflicts in your worktree, re-test, re-land; landing in increments is fine).
STEP 5. Return the structured result. "landed" must be true only if land.sh printed LANDED for your final state.

You cannot hear. So verify by measurement and by rendering: (a) headless module import with the bundled Node to validate every pattern (MIDI range per instrument, steps inside loopBars*16, no NaN, durations > 0, instrument ids exist); (b) OfflineAudioContext renders inside headless Chromium via tools/shot.mjs --scenario none --script probe.js, measuring peak, RMS, clipping, silence, spectral features, and writing 16-bit WAV files (write a tiny WAV encoder in the probe; return base64 from page.evaluate and write it to output/music/ with Node) so the user can audition them later. Keep renders short (10-30 s) - the machine is a 2-core laptop shared by ~8 agents and browser runs are rationed by tools/browserlock.mjs.
Node: C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe (system node is v14: do not use it).
Copyright: medieval/Renaissance works and plainchant are public domain and may be arranged; never transcribe anything modern or copyrighted (a previous session correctly declined a Baldur's Gate 3 song). Track titles are in-world names in the Realms voice (e.g. 'Lathander's Dawn Organum', 'The Triboar Estampie'); arrangements of real period pieces also note the source in a comment.
`

function depText(deps) {
  const done = deps.filter(Boolean)
  if (!done.length) return ''
  return '\nALREADY LANDED ON MAIN BEFORE YOU STARTED (merge main first):\n' + done.map((d) =>
    `- ${d.role} (landed: ${d.landed}): ${d.summary}\n  Followups from ${d.role}: ${(d.followups || []).join(' | ')}`).join('\n') + '\n'
}

function run(role, phase, brief, deps = []) {
  return agent(PRE(role) + depText(deps) + '\nYOUR ASSIGNMENT\n' + brief, {
    label: role, phase, schema: RESULT, isolation: 'worktree',
  })
}

const AUDIO = `Make the synthesis worthy of real polyphony: core/audio.js and the INSTRUMENTS section of core/music.js (replace the PENDING_VOICES aliases with real models as you implement each).
- Sung voices: formant synthesis for voiceBass / voiceTenor / voiceAlto / voiceTreble - a band-limited glottal source (sawtooth or pulse with slight jitter and shimmer, vibrato that blooms after onset), 3-5 formant bandpass filters per vowel with per-range formant tables, per-layer 'vowel' ('a','o','u','e','i') with smooth morphing, soft consonant-like onsets (a short filtered noise burst), breath. choirMen / choirFull as sections using the existing section/detune/smear/width machinery. The result should read as monks or a chapel choir, not an organ.
- Plucked strings via Karplus-Strong rendered once into AudioBuffers and cached per (instrument, pitch): lutePlucked (double courses, slight detune), harpGothic, psalteryStruck, citole, gittern; re-point lute/harp/psaltery if KS is clearly better.
- Bowed vielle / rebec / viol with bow noise and delayed vibrato; reeds (shawmAlto, shawmTenor, crumhorn, dulcian, bagpipe chanter); brass (sackbut, cornett); organs (portative, positive with stopped-pipe partials and a chiff attack); symphonia (hurdy-gurdy drone + trompette buzz); bells / handbells with inharmonic partials and long tails.
- Percussion ids: add nakers, nakersHi, tambourine, bellTower, handbell, cymbalettes to the noise-layer drum switch; unknown ids stay silent, never throw.
- Rooms: per-track 'room' ('hall'|'chapel'|'tavern'|'open'|'cave') with procedurally generated convolution IRs (noise times exponential decay, early reflections, pre-delay, damping), cached; chapel long enough (3-5 s) for organum.
- Layer options: vowel, ornament ('mordent'|'trill'|'grace' on long notes), swing, humanize (ms), pan.
- Context rotation in Audio.music exactly per 4.7: a context id with several tracks picks one seeded by map + in-game day and rotates to another same-context track after a few loops, crossfading; plain track ids still play that track. Tracks may be long; keep the scheduler lookahead cheap and allocation-free per tick.
- Mastering: gentle bus compression / limiting so stacked voices plus reverb never clip; per-track loudness normalisation from offline RMS.
- Do not break sfx or existing tracks; they should sound at least as good.
- Verify: offline renders of each new instrument on a scale and a chord (WAV in output/music/instruments/), formant peaks near the expected vowel formants (FFT in the page), no clipping on the loudest existing tracks, CPU/node counts.`

const SACRED = `Compose sacred and courtly polyphony: core/music_sacred.js (build(h) returns { tracks, groups }; each track may declare contexts and weight per OVERHAUL.md 4.7).
- Forms, as originals in authentic style or arrangements of public-domain works: Notre-Dame organum (duplum/triplum over sustained tenor notes of a chant, florid upper voices in modal rhythm), conductus (note-against-note, three voices), an Ars Antiqua motet (tenor cantus firmus in ostinato rhythm with duplum and triplum), Ars Nova ballade / virelai / rondeau in the style of Machaut (isorhythm, double-leading-tone cadences, hocket), English gymel and faburden (parallel sixth-three sonorities), Llibre Vermell pilgrim songs (PD: Stella splendens, Ad mortem festinamus, Polorum regina), plainchant over drone (Dies irae is PD), Cantigas de Santa Maria (PD: e.g. 'Santa Maria, strela do dia', 'Des oge mais'), Veni Creator, Ave maris stella.
- Cover these places and moods (10-12 tracks minimum, 16-64 bars each, with sections so loops do not wear): temple of Lathander (bright dawn organum), temples of Tyr/Torm/Helm (stern conductus), crypt and undead (Dies irae, low voices and a tolling bell), castle and court (Machaut-style ballade on vielle, harp, recorder), a grand alternative title theme (organum or motet), night (a gentle gymel lullaby), lament (a planctus), boss (a menacing motet with hocket and nakers), mystery (fragmentary chant with psaltery), a short victory conductus, camp (a simple three-voice song round a fire).
- Use the sung voices (voiceBass..voiceTreble with vowels), organs, harp, vielle, recorder, bells; room 'chapel' for sacred pieces. They are aliased today and become real as the audio agent lands; your tracks must sound acceptable both ways.
- Real counterpoint: independent voices, contrary motion, perfect consonances on strong beats in organum (parallels are correct there), thirds and sixths in the English style, modal cadences, proper voice ranges. A comment header per track: form, mode, voices, source if arranged, where it plays.
- Verify with headless validation of every pattern and offline WAV renders of every track (output/music/sacred/).`

const SECULAR = `Compose secular medieval and early-Renaissance polyphony: core/music_secular.js (build(h) returns { tracks, groups }; contexts and weight per OVERHAUL.md 4.7).
- Forms: estampie (royal and Italian istampitta, puncta with ouvert/clos endings), saltarello, trotto, ductia, carole, rota/canon (arrange 'Sumer is icumen in', a PD 13th-century rota with its pes), caccia (canonic hunting song), ballata with Landini cadences, pastourelle; Renaissance dances (PD: Susato's Danserye 1551, Arbeau's Orchesographie 1589 branles and the pavane 'Belle qui tiens ma vie', tourdion; Praetorius' Terpsichore 1612); PD medieval pieces: La Rotta, Lamento di Tristano, Trotto, the Saltarelli of BL Add. 29987, Kalenda Maya, the Palastinalied.
- Places and moods (14-16 tracks minimum, with real three- and four-voice polyphony, imitation, rhythmic modes, drones only as support): several towns (Phandalin market, Neverwinter, Waterdeep's bustle, Baldur's Gate harbour), village, tavern and inn (lively estampies, drinking songs, a ballad), market and festival (branles, tambourine), road and travel (walking tunes with variations), forest (caccia with horns and recorders), hills and mountain (a low dwarven consort: sackbut, dulcian, drones), coast (a swaying 6/8 sea song), battle in 2-3 variants (driving estampie with nakers and shawms: normal, desperate, triumphant), dragon (shawms, sackbuts, big drums), marsh / tense.
- Use lute/gittern/citole, vielle/rebec, recorder/shawm/crumhorn/bagpipe, sackbut/cornett, symphonia, and period percussion (tabor, nakers, frame drum, tambourine). Rooms: 'tavern' / 'open' / 'hall'.
- Comment header per track (form, mode, voices, source if arranged, where it plays).
- Verify with headless validation of every pattern and offline WAV renders of every track (output/music/secular/).`

const SCORE = `Integrate and curate the whole score after the audio, sacred and secular agents have landed (merge main first).
- Tag contexts and weights on every track, old and new. Route the world to them: every map's music field (world/maps*.js) and trackForBiome should reach context rotations (e.g. Waterdeep -> city, temples -> temple, crypts -> crypt, inns -> inn/tavern, Undermountain -> underdark/dungeon); battle music chooses a variant by encounter difficulty or boss; night rotations at night. Grep every Audio.music(...) call site in src/ and make sure each asks for a sensible context.
- Revise the weakest old tracks in core/music.js to use real polyphony and the new instruments (keep their ids).
- Mix: offline-render every track, normalise loudness, fix clipping, balance voices.
- Songbook API: Audio.catalogue() -> [{ id, title, form, contexts, mood }] for the jukebox in the options menu (the menus agent may already have landed a UI that reads Audio.tracks or Audio.catalogue - wire it up).
- Produce output/music/index.html: a local page listing WAV renders of every track with titles, forms and contexts so the user can audition the whole score (output/ is git-ignored; also write a short docs/overhaul/score.md listing every track).`

phase('Voices')
const audioP = Promise.resolve({"role":"audio","branch":"overhaul/audio-r2","landed":true,"landSha":"main","summary":"core/synth.js now holds the instrument DSP: formant sung voices with vowels, Karplus-Strong plucks, bowed/reed/brass/pipe/wheel/bell kinds, procedural rooms (hall, chapel, tavern, open, cave), bus glue and limiting, per-track loudness normalisation (core/music_loudness.js), and context rotation in Audio.music. tools/music-check.mjs validates books; tools/music-render.mjs renders WAVs with loudness metrics.","followups":["Read docs/overhaul/audio.md (Using and extending).","After adding tracks run: node tools/music-render.mjs --loudness (rewrites src/core/music_loudness.js).","A new instrument is usually just an INSTRUMENTS entry with a kind (ks, voice, bowed, reed, brass, pipe, wheel, rbell).","Songbook hooks for the menus agent: Audio.contextTracks() / Audio.setSongbook()."],"changes":[],"verification":[],"problems":[]})
const sacredP = Promise.resolve({"role":"sacred","branch":"overhaul/sacred-r2","landed":true,"landSha":"main","summary":"core/music_sacred.js holds 14 sacred and courtly polyphonic pieces (Dies irae, Notre-Dame organum, motets, a Tyr conductus, an Alustriel ballade, Llibre Vermell songs, gymel, planctus, victory conductus, camp song) with contexts and weights, written with notation helpers line/modal/organal/faburden/underlay.","followups":["Read docs/overhaul/sacred.md for the notation helpers and tools/sacred/check.mjs + render.mjs."],"changes":[],"verification":[],"problems":[]})
// secular landed on 23 Sep.
const secularP = Promise.resolve({"role":"secular","branch":"overhaul/secular","landed":true,"landSha":"main","summary":"The secular book (src/core/music_secular.js) now has 19 tracks of medieval and early-Renaissance secular polyphony, and all of them are on main. The first attempt left 5 tracks, which I checked and kept. I wrote 14 more: a Phandalin market estampie; branles with handbells for Greengrass; a hunting caccia with horn calls for the Neverwinter Wood; three battle pieces (a triumphant Flaming Fist saltarello, a desperate Phrygian estampie over a line giving ground, and the drawn-steel one from r1); a slow Rage of Dragons processional in parallel-fifth organum with big drums and gong; a Neverwinter ballata with Landini cadences; a swaying Sea of Swords carole; a low dwarven basse danse for the mountains; a lament and its quick rotta for the marshes; divisions on the passamezzo antico for the High Road; a Triboar tavern estampie with a hocket section; a Waterdeep istampitta where the cornett imitates the shawm a fifth lower; and a sung Daggerford pastourelle. They sound like a real consort rather than beeps because every piece has three or four independent parts in a real period form, the chords are right on the strong beats (100% by the check tool), drones are used only as support, the tune is set to lead by measuring each part on its own, and each track sits in a room (tavern, open air or hall). Every track is tagged with the place it was written for and the broader context the game already asks for (town, inn, battle, field and so on), so the game's context rotation picks them up now. All 14 new pieces are original in period forms. I didn't label any as an arrangement of La Rotta, Kalenda Maya, the Arbeau branles and so on, because I couldn't check the notes against an edition from here. There are 19 WAVs to listen to in output/music/secular/.","followups":["The loudness reference is the median of all tracks, so any book that adds tracks moves every track's level. Run 'tools/music-render.mjs --loudness --reference -33.3' unless the audio owner deliberately wants to change the overall music level against the SFX.","The game still asks for 'wilds' for marsh, ruins and ash-waste biomes (trackForBiome). That is a track id, not a context, so mereLament (contexts marsh, tense) is only heard via 'tense' today. The score agent should map marsh biomes to the 'marsh' context.","No secular track answers 'shop'. The first score's 'shop' still does.","r1's arrangement headers (Sumer is icumen in, Attaingnant tourdion, Arbeau's Belle qui tiens ma vie, Susato's La Mourisque) say they were checked against named editions. r2 could not re-verify those checks from the sandbox.","Every secular track has a title, so a songbook UI (menus agent) can list them through Audio.contextTracks().","To add a track: write it in music_secular.js, add a BEAT entry in tools/secular/check.mjs if its beat is not a crotchet, run the check tool and balance.js, then the loudness table with --reference -33.3."],"changes":[],"verification":[],"problems":[]})
const scoreP = Promise.all([audioP, sacredP, secularP]).then(([a, s, t]) => run('score', 'Score', SCORE, [a, s, t]))

const roles = ['audio', 'sacred', 'secular', 'score']
const results = await Promise.all([audioP, sacredP, secularP, scoreP])
return results.map((r, i) => r || { role: roles[i], landed: false, summary: 'agent returned nothing', problems: ['null result'] })
