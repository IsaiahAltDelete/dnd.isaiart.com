// core/music_sacred.js — sacred and courtly polyphony (organum, motet, conductus, Ars Nova chanson) for the score.
//
// Plain data: build(h) receives the helpers from music.js (so there is no import
// cycle) and returns { tracks, groups }. music.js merges the tracks into TRACKS
// and the groups into TRACK_GROUPS at load. Each track may carry
//   contexts: ['town', 'inn', ...]  — places/moods it may play in (see docs/OVERHAUL.md §Music)
//   weight:   number                — relative chance within a context rotation
// and uses the same layer format as every track in music.js. `title` is the
// piece's in-world name, for anything that lists the score (a songbook).
//
// This book is written the way the music was: counterpoint first. Every piece
// names its form, mode and voices, and the notes obey the rules of its century —
// perfect consonances on the strong beats of organum (parallel fifths are right
// there), thirds and sixths in the English pieces, double-leading-tone cadences
// in the Ars Nova ones. Where a real chant or song is arranged, the header says
// which edition the melody was checked against; everything else is original.

export function build(h) {
  const { noteToMidi } = h;

  // ── notation ──────────────────────────────────────────────────────────────
  //
  // Counterpoint is easiest to read, check and correct in note names, so the
  // lines below are written as text and turned into [step, midi, dur, vol].

  const pitch = (name) => {
    const m = noteToMidi(name);
    if (!Number.isFinite(m)) throw new Error(`music_sacred: bad note "${name}"`);
    return m;
  };

  /**
   * A line written out: 'F4:4 G4:2 A4:6 r:6 -:6'. Each token is a note name with
   * an optional length in 16ths (carried forward when omitted) and an optional
   * '@vol'; 'r' rests and '-' ties onto the note before. Notes that start on a
   * multiple of `beat` get full volume and the rest sit at `weak`, which is all
   * the metrical accent a sung line needs.
   */
  function line(src, { at = 0, vol = 0.9, weak = 0.8, beat = 0, shift = 0 } = {}) {
    const out = [];
    let t = at, dur = 4;
    for (const tok of src.split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [body, v] = tok.split('@');
      const [p, d] = body.split(':');
      if (d) dur = Number(d);
      if (p === '-') { if (out.length) out[out.length - 1][2] += dur; }
      else if (p !== 'r') out.push([t, pitch(p) + shift, dur, v ? Number(v) : vol * (!beat || t % beat === 0 ? 1 : weak)]);
      t += dur;
    }
    out.end = t;
    return out;
  }

  /** The vowel of each syllable of a Latin text: 'Di-es i-rae' -> i e i e. */
  const vowelsOf = (text) => text.toLowerCase().replace(/qu/g, 'k').split(/[\s-]+/).filter(Boolean).map((syl) => {
    const m = /ae|oe|[aeiouy]/.exec(syl);
    return !m ? 'a' : m[0] === 'ae' || m[0] === 'oe' ? 'e' : m[0] === 'y' ? 'i' : m[0];
  });

  /**
   * Put words under a line: each syllable's vowel on its notes (the pattern's
   * fifth field). A note starting on the `beat` grid begins the next syllable
   * (0: every note does); the notes between are its melisma. The singer model
   * hears a change of vowel as a new syllable and re-articulates, and glides
   * through a melisma on one breath — so without words, repeated notes in a
   * sung line would melt into one long note. A text shorter than the line
   * starts again.
   */
  function words(evs, text, beat = 0) {
    const vs = vowelsOf(text);
    let k = -1;
    return evs.map(([s, n, d, v], i) => {
      if (i === 0 || !beat || s % beat === 0) k++;
      return [s, n, d, v, vs[k % vs.length]];
    });
  }

  /** The same words in another voice: each note takes the syllable `ref` is on when it starts. */
  const underlay = (ref, evs) => evs.map(([s, n, d, v]) => {
    let w = ref[0][4];
    for (const r of ref) { if (r[0] > s) break; w = r[4]; }
    return [s, n, d, v, w];
  });

  /** Every MIDI note of a scale given as pitch names, e.g. 'F G A Bb C D E'. */
  function ladder(scale) {
    const pcs = new Set(scale.split(/\s+/).map((n) => ((pitch(n + '4') % 12) + 12) % 12));
    const out = [];
    for (let m = 21; m <= 108; m++) if (pcs.has(m % 12)) out.push(m);
    return out;
  }

  /**
   * A line in the first rhythmic mode — long, breve; long, breve — which is the
   * lilt of Notre-Dame organum. One token per perfection:
   *   'C5/D5'  long C5 then breve D5       'C5'    long C5, breve chosen to lead on
   *   'C5.'    a whole perfection held      'C5*3'  held three perfections
   *   'r'      a perfection's rest          '{E5:1,D5:1,C5:2,B4:2}'  written out
   * The chosen breve is what a singer would do: a passing note across a third,
   * a neighbour on a repeat, a leap part-way and a step into a wide interval.
   */
  function modal(src, { at = 0, scale = 'C D E F G A B', vol = 0.9, weak = 0.78, perf = 6, long = 4 } = {}) {
    const lad = ladder(scale);
    const idx = (m) => degreeOf(lad, m);
    const step = (m, k) => lad[idx(m) + k];
    const toks = src.split(/\s+/).filter((x) => x && x !== '|');
    const head = (tok) => {
      if (!tok || /^r/.test(tok)) return null;
      return pitch(tok.replace(/^\{/, '').split(/[/*.:,]/)[0]);
    };
    const out = [];
    let t = at;
    toks.forEach((tok, i) => {
      let m;
      if ((m = /^r(?:\*(\d+))?$/.exec(tok))) { t += perf * (m[1] ? Number(m[1]) : 1); return; }
      if (tok[0] === '{') {
        tok.slice(1, -1).split(',').forEach((part, j) => {
          const [p, d] = part.split(':');
          if (p !== 'r') out.push([t, pitch(p), Number(d), j ? vol * weak : vol]);
          t += Number(d);
        });
        return;
      }
      if ((m = /^(.+)\*(\d+)$/.exec(tok))) { out.push([t, pitch(m[1]), perf * Number(m[2]), vol]); t += perf * Number(m[2]); return; }
      if (tok.endsWith('.')) { out.push([t, pitch(tok.slice(0, -1)), perf, vol]); t += perf; return; }
      const [a, b] = tok.split('/');
      const L = pitch(a);
      let B = b ? pitch(b) : null;
      if (!b) {
        const n = head(toks[i + 1]);
        if (n != null) {
          const d = idx(n) - idx(L), s = Math.sign(d), ad = Math.abs(d);
          B = ad === 0 ? step(L, i % 2 ? -1 : 1)
            : ad === 1 ? (i % 2 ? step(n, s) : step(L, -s))
            : ad === 2 ? step(L, s)
            : ad <= 4 ? step(L, 2 * s)
            : step(n, -s);
        }
      }
      if (B == null) { out.push([t, L, perf, vol]); t += perf; return; }
      out.push([t, L, long, vol], [t + long, B, perf - long, vol * weak]);
      t += perf;
    });
    out.end = t;
    return out;
  }

  /** Index of a note on a scale ladder (the next one up if it is chromatic to it). */
  const degreeOf = (lad, m) => { const i = lad.indexOf(m); return i >= 0 ? i : lad.findIndex((x) => x > m); };

  /** True where a note begins or ends a phrase — a rest (or nothing) on that side. */
  const edge = (evs, i) => {
    const [s, , d] = evs[i], prev = evs[i - 1], next = evs[i + 1];
    return !prev || prev[0] + prev[2] < s || !next || next[0] > s + d;
  };

  /**
   * Parallel organum under a chant line. The organal voice keeps `below`
   * semitones under the principal but will not sink past `floor`; there it
   * holds, and the chant comes back to meet it — and every line closes in
   * unison (the occursus), which is what makes this sound ancient.
   */
  const organal = (chant, below, floor = 0) => chant.map((ev, i) => {
    const [s, n, d, v] = ev;
    const next = chant[i + 1];
    const o = !next || next[0] > s + d ? n : (n - below >= floor ? n - below : Math.min(n, floor));
    return [s, o, d, v * 0.85];
  });

  /**
   * English faburden round a tune: the treble a perfect fourth above it, the
   * low voice a third below except where a phrase opens or closes, where it
   * takes the fifth — so every phrase starts and ends on an open sonority and
   * moves in chains of sixth-three chords between. The tune should end on the
   * fifth of the final, as the chants it grew from do.
   */
  function faburden(mean, scale) {
    const lad = ladder(scale);
    return {
      // Every voice sings the chant's syllable, so its vowel comes along.
      treble: mean.map(([s, n, d, v, ...x]) => [s, n + 5, d, v * 0.9, ...x]),
      bass: mean.map(([s, n, d, v, ...x], i) => [s, lad[degreeOf(lad, n) - (edge(mean, i) ? 4 : 2)], d, v * 0.9, ...x]),
    };
  }

  /** Pluck whatever `evs` is sounding on every `every` steps, `shift`ed — a harp or lute doubling the low part. */
  function beats(evs, every, shift, vol = 0.7) {
    const out = [];
    for (const [s, n, d] of evs) {
      for (let t = Math.ceil(s / every) * every; t < s + d; t += every) out.push([t, n + shift, every, t === s ? vol : vol * 0.8]);
    }
    return out;
  }

  /**
   * A singer carries a line that never overlaps itself on one breath, and only
   * a new vowel re-articulates; a repeated pitch on the same vowel would be
   * slurred into one long note. Singers re-strike it (the repercussion of
   * chant), so it gets a breath's gap first.
   */
  function repercuss(L) {
    if (!/^(voice|choir)/.test(L.inst || '')) return;
    const evs = [...L.pattern].sort((a, b) => a[0] - b[0]);
    if (evs.some((e, i) => i && e[0] < evs[i - 1][0] + evs[i - 1][2] - 0.01)) return;
    const cyc = [...String(L.vowel || 'a')].filter((c) => 'aeiou'.includes(c));
    let vi = 0;
    const vow = evs.map((e) => (typeof e[4] === 'string' ? e[4] : cyc[vi++ % (cyc.length || 1)]));
    const cut = new Set();
    for (let i = 1; i < evs.length; i++) {
      const a = evs[i - 1], b = evs[i];
      if (Math.abs(a[0] + a[2] - b[0]) < 0.01 && a[1] === b[1] && vow[i] === vow[i - 1]) cut.add(a);
    }
    if (cut.size) L.pattern = L.pattern.map((e) => (cut.has(e) ? [e[0], e[1], e[2] - Math.min(0.5, e[2] / 4), ...e.slice(3)] : e));
  }

  /** Give every layer of a track the track's room, so each voice sits in the same space. */
  function track(def) {
    for (const L of def.layers) {
      if (def.room) L.room ??= def.room;
      repercuss(L);
    }
    return def;
  }

  const tracks = {};

  // ── LATHANDER'S DAWN ORGANUM ─────────────────────────────────────────────
  // Form:   organum triplum in the Notre-Dame manner (after Perotin): organum
  //         purum over held tenor notes, a discant clausula where the chant
  //         moves, organum again, and a closing copula onto the final.
  // Mode:   5 (F). B-flat while the tenor holds F, B-natural over A and C,
  //         which is the Lydian brightness the Morninglord's house wants.
  // Voices: tenor (chant), duplum, triplum; positive organ under the held
  //         tenor notes; handbells at daybreak.
  // Source: tenor = the gradual Viderunt omnes (Graduale Romanum 1908, via
  //         GregoBase #1745), "Vi-de-runt o-mnes": F F A-C, then the melisma
  //         C D C A C C C E D C on "o-", then C. The upper voices and the
  //         closing copula (tenor A G F) are original.
  // Plays:  temples of Lathander, and any temple at dawn.
  //
  // Every strong beat (the first note of each perfection) is a unison, fifth,
  // octave, fourth or third against the tenor; the breves between are the
  // passing notes. Perfection = 6 sixteenths: long 4, breve 2.
  {
    const P = 6;
    const FLAT = 'F G A Bb C D E', SHARP = 'F G A B C D E';
    const at = (p) => p * P;

    const triplum = [
      // I. "Vi-" — tenor F. The opening sonority is held, then the lines bloom.
      ...modal('C5*3 C5/D5 C5/A4 C5/D5 F5/E5 F5/D5 C5/Bb4 A4/G4 F4. r ' +
        'C5/D5 F5/G5 A5/G5 F5/E5 F5/D5 C5/D5 F5/G5 A5/G5 F5/E5 F5/D5 C5/Bb4 C5.', { at: at(0), scale: FLAT }),
      // II. "-de-" — the duplum's opening line, sung here at pitch: voice exchange.
      ...modal('F4/G4 A4/G4 F4/E4 F4/G4 C5/Bb4 A4/G4 F4/E4 C4/D4 ' +
        'F4/G4 A4/Bb4 C5/D5 C5/A4 C5/D5 F5/E5 C5*2', { at: at(24), scale: FLAT }),
      // III. "-runt" — tenor A, then C.
      ...modal('E5/D5 C5/D5 E5/F5 E5/D5 C5/B4 A4/B4 C5/D5 E5. ' +
        'G5/F5 E5/D5 E5/F5 G5/A5 G5/F5 E5/D5 C5/D5 C5.', { at: at(40), scale: SHARP }),
      // IV. Clausula on the "o-" melisma, twice through; the second cursus climbs.
      ...modal('C5/D5 E5/D5 D5/C5 A4/B4 C5/D5 E5/F5 E5/D5 C5/D5 G5/F5 E5/D5 ' +
        'C5/D5 E5/F5 G5/A5 G5/F5 E5/D5 B4/C5 A4/B4 D5/E5 E5/D5 C5.', { at: at(56), scale: SHARP }),
      ...modal('G5/A5 G5/F5 F5/E5 D5/E5 E5/F5 G5/F5 E5/D5 C5/D5 E5/F5 G5/A5 ' +
        'G5/F5 E5/F5 G5/A5 G5/F5 E5/F5 G5/F5 A5/G5 F5/E5 E5/D5 C5.', { at: at(76), scale: SHARP }),
      // V. "-mnes" — tenor C held; a run of currentes pours down the scale.
      ...modal('G5*2 G5/A5 G5/F5 E5/D5 C5/D5 E5/F5 G5/F5 E5/D5 {E5:1,D5:1,C5:1,B4:1,A4:1,G4:1} ' +
        'G4/A4 C5/D5 E5/F5 G5/F5 E5/D5 C5.', { at: at(96), scale: SHARP }),
      // VI. Copula: the tenor walks A, G, F and the upper voices close in.
      ...modal('C5/D5 E5/D5 C5/B4 A4/B4 D5/C5 B4/A4 G4/A4 B4. ' +
        'C5*3 C5/D5 F5/E5 F5/D5 C5/Bb4 C5.', { at: at(112), scale: SHARP }),
    ];
    const duplum = [
      ...modal('F4*3 F4/G4 A4/G4 F4/E4 F4/G4 C5/Bb4 A4/G4 F4/E4 C4/D4 F4/G4 ' +
        'F4/G4 C5/Bb4 A4/Bb4 C5/D5 C5/Bb4 A4/G4 F4/G4 A4/Bb4 C5/Bb4 C5/D5 A4/G4 F4.', { at: at(0), scale: FLAT }),
      ...modal('C5/D5 C5/A4 C5/D5 F5/E5 F5/D5 C5/Bb4 A4/G4 F4. ' +
        'C5/Bb4 A4/G4 F4/G4 A4/G4 F4/E4 F4/G4 F4*2', { at: at(24), scale: FLAT }),
      ...modal('A4/B4 A4/G4 A4/B4 C5/B4 A4/G4 E4/F4 A4/G4 A4. ' +
        'C5/D5 C5/B4 C5/D5 E5/D5 C5/D5 C5/B4 G4/A4 G4.', { at: at(40), scale: SHARP }),
      ...modal('G4/A4 C5/B4 A4/G4 F4/E4 G4/A4 C5/B4 A4/B4 A4/G4 C5/D5 C5/B4 ' +
        'G4/A4 C5/D5 E5/D5 C5/B4 B4/A4 G4/A4 F4/E4 A4/B4 C5/B4 G4.', { at: at(56), scale: SHARP }),
      ...modal('C5/D5 E5/D5 D5/C5 A4/B4 C5/B4 G4/A4 A4/B4 A4/G4 C5/D5 E5/D5 ' +
        'C5/B4 C5/D5 E5/D5 C5/D5 B4/A4 G4/A4 A4/B4 D5/C5 C5/B4 G4.', { at: at(76), scale: SHARP }),
      ...modal('C5*2 E5/D5 C5/B4 C5/D5 G4/A4 C5/B4 E5/D5 C5/B4 C5. ' +
        'E4/F4 G4/A4 C5/B4 C5/D5 C5/B4 G4.', { at: at(96), scale: SHARP }),
      ...modal('A4/G4 A4/B4 A4/G4 E4/F4 G4/A4 G4/F4 D4/E4 E4. ' +
        'F4*3 F4/G4 C5/Bb4 C5/Bb4 A4/G4 F4.', { at: at(112), scale: SHARP }),
    ];
    // The chant, each note held while the upper voices sing over it; in the
    // clausula it moves in steady duplex longs so the discant has a floor,
    // each long struck anew (a breath before the next) rather than slurred —
    // the repeated Cs would otherwise melt into one. Its syllables are the
    // gradual's: "Vi-" (held and retaken), "-de-", "-runt", "o-" (the
    // melisma), "-mnes"; every voice sings the tenor's vowel of the moment.
    const clausula = 'C4 D4 C4 A3 C4 C4 C4 E4 D4 C4'.split(' ').map((n) => n + ':11 r:1').join(' ');
    const tenor = line(
      `F3:71 r:1 F3:72 | F3:96 | A3:48 C4:48 | ${clausula} | ${clausula} | C4:96 | A3:24 G3:24 F3:48`, { vol: 0.85 })
      .map(([s, n, d, v], i) => [s, n, d, v, 'iieuu'[i] || (i < 25 ? 'o' : 'e')]);
    const sung = (evs) => underlay(tenor, evs);
    // The organ doubles the held notes an octave down and leaves the clausula
    // to the singers, so the texture opens when the chant starts to move.
    const organ = line(
      'F2:144 | F2:96 | A2:48 C3:48 | r:240 | C3:96 | A2:24 G2:24 F2:48', { vol: 0.7 })
      .concat(line('C3:144 | C3:96 | E3:48 G3:48 | r:240 | G3:96 | E3:24 D3:24 C3:48', { vol: 0.45 }));
    const peal = (p) => line('F5:2 E5 D5 C5 Bb4 A4 G4 F4:4', { at: at(p), vol: 0.6 });

    tracks.dawnOrganum = track({
      title: "Lathander's Dawn Organum",
      contexts: ['temple'], weight: 2, room: 'chapel',
      bpm: 100, loopBars: 48, gain: 0.9,
      layers: [
        { name: 'tenor', inst: 'voiceTenor', vowel: 'o', gain: 0.32, pan: 0, humanize: 8, pattern: tenor },
        { name: 'duplum', inst: 'voiceAlto', vowel: 'a', gain: 0.3, pan: -0.32, humanize: 10, pattern: sung(duplum) },
        { name: 'triplum', inst: 'voiceTreble', vowel: 'e', gain: 0.28, pan: 0.32, humanize: 10, pattern: sung(triplum) },
        { name: 'organ', inst: 'positive', gain: 0.2, pan: 0, pattern: organ },
        { name: 'bells', inst: 'handbells', gain: 0.16, pan: 0.2, pattern: [...peal(0), ...peal(120)] },
      ],
    });
  }

  // ── THE DOOMGUIDES' DIES IRAE ────────────────────────────────────────────
  // Form:   plainchant sequence with two older kinds of polyphony worked in —
  //         parallel organum at the fourth below with the organal voice held at
  //         its floor (Musica enchiriadis, 9th c.) and strict organum at the
  //         fifth — over a hummed drone, with a bell tolling the lines.
  // Mode:   1 (D).
  // Voices: bass cantor (chant), men's choir (organal voice, drone), sackbut on
  //         "Tuba mirum", a tolling bell.
  // Source: Dies irae, sequence of the Mass for the Dead, stanzas 1-4 (melody A
  //         twice, melody B twice), checked against GregoBase #1198. The
  //         rhythm is the editor's: a syllable per crotchet, neumes split.
  // Plays:  crypts and tombs — Kelemvor's Doomguides sing it for the dead who
  //         will not stay down — and deep dungeons now and then.
  {
    const A = [
      'F3:4 E3 F3 D3 E3 C3 D3 D3:8 r:4',
      'F3:4 F3:2 G3 F3 E3 D3 C3 E3:4 F3 E3 D3:8 r:4',
      'A2:4 C3:2 D3 D3:4 D3:2 C3 E3:4 F3 E3 D3:8 r:4',
    ].join(' ');
    const B = [
      'A3:4 C4 C4 B3:2 G3:1 A3 A3:2 G3:1 F3 G3:4 A3 A3:2 D3:6 r:4',
      'F3:4 E3 F3 D3 E3 C3 D3 D3:8 r:4',
      'F3:4 G3:2 A3 A3:2 G3:1 F3 E3:2 D3:1 C3 E3:4 F3 E3 D3:8 r:4',
    ].join(' ');
    const S = [64, 184, 304, 424];             // stanza starts; each is three 40-step lines
    const sing = (src, at, vol = 0.9) => line(src, { at, vol, weak: 0.78, beat: 4 });

    // The text, a syllable on each crotchet (the notes between are its neume).
    const T = [
      'Di-es i-rae di-es il-la sol-vet sae-clum in fa-vil-la tes-te Da-vid cum Si-byl-la',
      'Quan-tus tre-mor est fu-tu-rus quan-do ju-dex est ven-tu-rus cunc-ta stric-te dis-cus-su-rus',
      'Tu-ba mi-rum spar-gens so-num per se-pul-chra re-gi-o-num co-get om-nes an-te thro-num',
      'Mors stu-pe-bit et na-tu-ra cum re-sur-get cre-a-tu-ra ju-di-can-ti re-spon-su-ra',
    ];
    const chant = [...words(sing(A, S[0]), T[0], 4), ...words(sing(A, S[1]), T[1], 4),
      ...words(sing(B, S[2], 1), T[2], 4), ...words(sing(B, S[3]), T[3], 4)];
    const organ4 = words(organal(sing(A, S[1]), 5, pitch('C3')), T[1], 4);
    const organ5 = words(organal(sing(B, S[3]), 7), T[3], 4);
    const tuba = [...sing(B, S[2], 0.8), ...sing(B, S[3], 0.7)];
    // The drone breathes with the stanzas rather than droning through them.
    const hum = [0, ...S, 544].flatMap((s, i, a) => {
      const len = (a[i + 1] ?? 576) - s;
      return [[s, pitch('D2'), len, 0.8], [s, pitch('A2'), len, 0.6]];
    });
    const toll = [0, 16, 32, 48, 304, 344, 384, 424, 544, 560].map((s, i) =>
      [s, pitch(i % 4 === 3 ? 'A2' : 'D3'), 12, i < 4 || i > 7 ? 0.8 : 0.6]);

    tracks.doomguideDies = track({
      title: "The Doomguides' Dies Irae",
      contexts: ['crypt', 'dungeon'], weight: 2, room: 'chapel',
      bpm: 72, loopBars: 36, gain: 0.92,
      layers: [
        { name: 'chant', inst: 'voiceBass', vowel: 'e', gain: 0.36, pan: 0, humanize: 10, pattern: chant },
        { name: 'organal', inst: 'choirMen', vowel: 'e', gain: 0.26, pan: -0.25, humanize: 14, pattern: [...organ4, ...organ5] },
        { name: 'low', inst: 'choirMen', vowel: 'u', gain: 0.2, pan: 0.15, pattern: hum },
        { name: 'tuba', inst: 'sackbut', gain: 0.2, pan: 0.3, humanize: 8, pattern: tuba },
        { name: 'toll', inst: 'bells', gain: 0.26, pan: 0.1, pattern: toll },
      ],
    });
  }

  // ── THE BINDER'S MOTET ───────────────────────────────────────────────────
  // Form:   Ars Antiqua motet (Franconian, later 13th c.): the chant laid out
  //         in the tenor in a fixed rhythm (three dotted longs and a rest, the
  //         fifth mode in ordines), a motetus in the first mode above it and a
  //         busier triplum on top. Two cursus of the tenor: the second with the
  //         triplum broken into semibreves, the organ and a vielle doubling.
  //         The chant is sung alone first, as the choir would intone it.
  // Mode:   1 (D), with the chant's B-flat.
  // Voices: men's choir (intonation), bass (tenor), tenor (motetus), alto
  //         (triplum); positive organ, vielle, bells.
  // Source: tenor = the hymn Ave maris stella (Antiphonale Monasticum 1934,
  //         GregoBase #9733), all four lines: D A-Bb A G A G | G A G F G A |
  //         F E F G-F E D | E F D C-D D D. Motetus and triplum are original.
  // Plays:  the title — the Binder, Oghma, keeps every chronicle, this one too.
  {
    const P = 6;
    const S = 'D E F G A Bb C';
    const C1 = 16, C2 = 52, END = 88;           // perfections: intonation, cursus 1, cursus 2, close
    const TEN = [['D3', 'A3', 'Bb3'], ['A3', 'G3', 'A3'], ['G3', 'G3', 'A3'], ['G3', 'F3', 'G3'], ['A3', 'F3', 'E3'],
      ['F3', 'G3', 'F3'], ['E3', 'D3', 'E3'], ['F3', 'D3', 'C3'], ['D3', 'D3', 'D3']];
    const cursus = (p, vol) => line(TEN.map((g) => g.map((n) => n + ':6').join(' ') + ' r:6').join(' '), { at: p * P, vol });

    // The hymn's words, one entry per tenor note: a syllable sung to two notes
    // ("ve", "per", "li") is written twice and glides between them.
    const HYMN = 'A ve ve ma ris stel la De i ma ter al ma at que sem per per vir go fe lix cae li li por ta';
    const intonation = words(line('D3:6 A3:3 Bb3 A3:6 G3 A3 G3:12 r:6 G3:6 A3 G3 F3 G3 A3:12 r:6', { vol: 0.85 }),
      'A-ve ma-ris stel-la De-i ma-ter al-ma', 6);
    const tenor = [...words(cursus(C1, 0.85), HYMN), ...words(cursus(C2, 0.9), HYMN), ...line('D3:48', { at: END * P, vol: 0.9 })];

    const motetus1 = 'D4/E4 E4/D4 D4/C4 F4. | E4/D4 D4/C4 C4/D4 E4. | D4/E4 G4/F4 E4/D4 C4. | ' +
      'D4/C4 C4/D4 Bb3/C4 D4. | E4/D4 C4/D4 E4/D4 D4/E4 | F4/E4 D4/C4 C4/D4 F4. | ' +
      'E4/D4 D4/E4 G4/F4 E4. | F4/G4 A4/G4 G4/F4 E4. | D4/E4 F4/E4 A3*2';
    const motetus2 = 'D4/C4 E4/F4 D4/E4 F4/E4 | E4/F4 D4/E4 C4/D4 E4/F4 | D4/C4 G4/A4 E4/F4 C4/D4 | ' +
      'D4/E4 C4/Bb3 Bb3/C4 D4/E4 | E4/F4 C4/Bb3 E4/F4 D4/E4 | F4/G4 D4/E4 C4/E4 F4/E4 | ' +
      'E4/F4 D4/E4 G4/A4 E4/F4 | F4/E4 A4/G4 G4/A4 E4/D4 | D4/E4 F4/E4 A3*2';
    const triplum1 = 'A4/G4 A4/Bb4 {D5:2,C5:2,Bb4:2} A4/G4 | A4/G4 G4/A4 {E4:2,F4:2,G4:2} A4/Bb4 | ' +
      '{D5:2,C5:2,Bb4:2} Bb4/A4 A4/G4 F4/G4 | G4/A4 C5/D5 D5/C5 A4/G4 | A4/Bb4 C5/A4 G4/A4 A4/G4 | ' +
      'A4/Bb4 D5/C5 C5/Bb4 A4/G4 | B4/C5 A4/G4 B4/C5 A4/G4 | A4/Bb4 D5/C5 C5/Bb4 A4/Bb4 | ' +
      'A4/G4 {A4:2,Bb4:2,C5:2} D5*2';
    // The same strong-beat skeleton as the first cursus, broken into semibreves.
    const triplum2 = '{A4:2,G4:1,F4:1,G4:2} {A4:2,Bb4:1,C5:1,Bb4:2} {D5:2,C5:1,Bb4:1,C5:2} {A4:3,G4:1,F4:2} | ' +
      '{A4:2,Bb4:2,A4:2} {G4:2,A4:1,G4:1,F4:2} {E4:2,F4:1,G4:1,A4:2} {A4:2,G4:1,A4:1,Bb4:2} | ' +
      '{D5:3,C5:1,Bb4:2} {Bb4:2,C5:1,Bb4:1,A4:2} {A4:2,G4:2,A4:2} {F4:2,G4:1,A4:1,G4:2} | ' +
      '{G4:2,A4:1,Bb4:1,A4:2} {C5:2,D5:1,C5:1,Bb4:2} {D5:2,E5:1,D5:1,C5:2} {A4:4,G4:2} | ' +
      '{A4:2,Bb4:1,A4:1,G4:2} {C5:2,Bb4:1,A4:1,Bb4:2} {G4:2,F4:1,G4:1,A4:2} {A4:2,Bb4:1,A4:1,G4:2} | ' +
      '{A4:2,C5:1,Bb4:1,C5:2} {D5:2,E5:1,D5:1,C5:2} {C5:2,Bb4:1,A4:1,Bb4:2} {A4:3,Bb4:1,G4:2} | ' +
      '{B4:2,C5:2,D5:2} {A4:2,G4:1,F4:1,G4:2} {B4:2,C5:1,B4:1,A4:2} {A4:2,G4:2,A4:2} | ' +
      '{A4:2,Bb4:1,C5:1,Bb4:2} {D5:2,C5:1,D5:1,E5:2} {C5:2,Bb4:1,A4:1,Bb4:2} {A4:2,Bb4:2,G4:2} | ' +
      '{A4:2,C5:1,Bb4:1,A4:2} {A4:2,Bb4:1,C5:1,C#5:2} D5*2';
    const motetus = [
      ...modal(motetus1, { at: C1 * P, scale: S }), ...modal(motetus2, { at: C2 * P, scale: S }),
      ...modal('D4/E4 F4/E4 D4/C#4 D4. A3*4', { at: END * P, scale: S }),
    ];
    const triplum = [
      ...modal(triplum1, { at: C1 * P, scale: S }), ...modal(triplum2, { at: C2 * P, scale: S, weak: 0.72 }),
      ...modal('{A4:2,Bb4:1,C5:1,D5:2} {A4:2,G4:1,F4:1,G4:2} {A4:2,Bb4:1,A4:1,G4:2} F4/E4 D4*4', { at: END * P, scale: S }),
    ];
    // Second cursus: the organ takes the tenor an octave down with its fifth,
    // the vielle doubles the triplum — the same music, a larger room of it.
    const organ = [...cursus(C2, 0.7), ...line('D3:48', { at: END * P, vol: 0.75 })]
      .flatMap(([s, n, d, v]) => [[s, n - 12, d, v], [s, n - 5, d, v * 0.6]]);
    const vielle = modal(triplum2, { at: C2 * P, scale: S, vol: 0.8, weak: 0.7 });
    const bells = [[0, 'D4'], [48, 'A3'], [C1 * P, 'D4'], [C2 * P, 'D4'], [C2 * P + 8, 'A4'], [END * P, 'D4'], [END * P + 6, 'A4'], [END * P + 12, 'D5']]
      .map(([s, n]) => [s, pitch(n), 12, 0.7]);

    tracks.bindersMotet = track({
      title: "The Binder's Motet",
      contexts: ['title'], weight: 1.5, room: 'chapel',
      bpm: 90, loopBars: 36, gain: 0.94,
      layers: [
        { name: 'intonation', inst: 'choirMen', vowel: 'a', gain: 0.32, pan: 0, humanize: 12, pattern: intonation },
        { name: 'tenor', inst: 'voiceBass', vowel: 'o', gain: 0.3, pan: 0, humanize: 8, pattern: tenor },
        // Motetus and triplum each had a poem of their own, sung a syllable a
        // note; a stream of vowels stands for them.
        { name: 'motetus', inst: 'voiceTenor', vowel: 'aeoiu', gain: 0.28, pan: -0.3, humanize: 10, pattern: motetus },
        { name: 'triplum', inst: 'voiceAlto', vowel: 'eaiuo', gain: 0.27, pan: 0.3, humanize: 10, pattern: triplum },
        { name: 'organ', inst: 'positive', gain: 0.18, pan: 0, pattern: organ },
        { name: 'vielle', inst: 'vielle', gain: 0.12, pan: 0.45, humanize: 12, pattern: vielle },
        { name: 'bells', inst: 'bells', gain: 0.18, pan: -0.15, pattern: bells },
      ],
    });
  }

  // ── CONDUCTUS OF THE EVEN-HANDED ─────────────────────────────────────────
  // Form:   three-voice conductus (Notre-Dame, early 13th c.): a newly made
  //         tenor, not a chant; the stanzas note against note, every voice on
  //         the same syllable, with a melismatic cauda after each. Parallel
  //         fifths and octaves between the stanza voices are the style, and
  //         the cadences rise by a whole step onto an open sonority.
  // Mode:   A (the first mode transposed, no leading note).
  // Voices: bass (tenor), tenor (duplum), alto (triplum); sackbut doubling
  //         the tenor the second time; a processional frame drum.
  // Source: original.
  // Plays:  the temples of Tyr, Torm and Helm, and halls where justice is kept.
  {
    const P = 6;
    const S = 'A B C D E F G';
    const stanza = {
      tenor: 'A2:6 G2 F2 E2:4 r:2 A2:6 F2 G2 A2:4 r:2 C3:6 D3 F3 E3:4 r:2 A2:6 E2 G2 A2:4 r:2',
      duplum: 'E3:6 G3 A3 G3:4 r:2 E3:6 F3 G3 A3:4 r:2 C4:6 A3 A3 G3:4 r:2 A3:6 E3 D3 E3:4 r:2',
      triplum: 'A3:6 B3 C4 B3:4 r:2 A3:6 C4 D4 E4:4 r:2 E4:6 D4 C4 B3:4 r:2 C4:6 B3 G3 A3:4 r:2',
    };
    // The second stanza keeps the strong beats and lets the top voice lean on
    // passing notes, as a singer does once the words are known.
    const triplum2 = 'A3:4 G3:2 B3:4 A3:2 C4:4 D4:2 B3:4 r:2 A3:4 B3:2 C4:4 B3:2 D4:4 C4:2 E4:4 r:2 ' +
      'E4:4 F4:2 D4:4 E4:2 C4:4 D4:2 B3:4 r:2 C4:4 D4:2 B3:4 A3:2 G3:6 A3:4 r:2';
    const cauda1 = {
      tenor: 'A2:12 C3 D3 E3 F3 E3 D3 E3',
      duplum: 'E3/F3 A3/G3 G3/A3 C4/B3 A3/B3 D4/C4 B3/C4 E4/D4 C4/D4 F4/E4 E4/D4 B3/C4 A3/B3 D4/C4 B3/C4 B3.',
      triplum: 'E4/D4 C4/D4 G4/F4 E4/F4 A4/G4 F4/G4 B4/A4 G4/A4 C5/Bb4 A4/G4 B4/A4 E4/F4 D4/E4 F4/E4 E4/D4 E4.',
    };
    const cauda2 = {
      tenor: 'F3:12 E3 D3 C3 D3 E3 G2 A2',
      duplum: 'C4/D4 F4/E4 E4/D4 B3/C4 A3/B3 D4/C4 C4/B3 G3/A3 A3/B3 D4/E4 E4/D4 B3/A3 G3/A3 D3/E3 E3*2',
      triplum: 'r A4/G4 G4/A4 B4/C5 A4/G4 F4/G4 E4/F4 G4/F4 D4/E4 F4/E4 G4/A4 B4/A4 G4/A4 G4. A4*2',
    };
    const at = (p) => p * P;
    const v = { vol: 0.9, weak: 0.8, beat: P };
    // Every voice sings the same syllable on each perfection of a stanza —
    // the vowels of Psalm 84:11 (Vulgate), justice and peace — and the
    // caudae are melismas on the last one.
    const W1 = 'Mi-se-ri-cor-di-a et ve-ri-tas ob-vi-a-ve-runt si-bi';
    const W2 = 'Ju-sti-ti-a et pax os-cu-la-tae sunt ve-ri-tas de ter-ra';
    const st = (src, w, o) => words(line(src, o), w, P);
    const tenor = [...st(stanza.tenor, W1, v), ...line(cauda1.tenor, { ...v, at: at(16) }),
      ...st(stanza.tenor, W2, { ...v, at: at(32) }), ...line(cauda2.tenor, { ...v, at: at(48) })];
    const duplum = [...st(stanza.duplum, W1, v), ...modal(cauda1.duplum, { at: at(16), scale: S }),
      ...st(stanza.duplum, W2, { ...v, at: at(32) }), ...modal(cauda2.duplum, { at: at(48), scale: S })];
    const triplum = [...st(stanza.triplum, W1, v), ...modal(cauda1.triplum, { at: at(16), scale: S }),
      ...st(triplum2, W2, { ...v, at: at(32) }), ...modal(cauda2.triplum, { at: at(48), scale: S })];
    const sackbut = [...line(stanza.tenor, { ...v, at: at(32), vol: 0.75 }), ...line(cauda2.tenor, { ...v, at: at(48), vol: 0.7 })]
      .map(([s, n, d, vv]) => [s, n + 12, d, vv]);
    // A slow procession: a step on every syllable, the heavy drum on each line.
    const steps = (from) => Array.from({ length: 16 }, (_, i) => [at(from + i), i % 4 ? 'frame' : 'wardrum', 1, i % 4 ? 0.28 : 0.42]);

    tracks.tyrConductus = track({
      title: 'Conductus of the Even-Handed',
      contexts: ['temple', 'castle'], weight: 1.4, room: 'chapel',
      bpm: 84, loopBars: 24, gain: 0.92,
      layers: [
        { name: 'tenor', inst: 'voiceBass', vowel: 'o', gain: 0.3, pan: 0, humanize: 10, pattern: tenor },
        { name: 'duplum', inst: 'voiceTenor', vowel: 'a', gain: 0.29, pan: -0.3, humanize: 10, pattern: duplum },
        { name: 'triplum', inst: 'voiceAlto', vowel: 'a', gain: 0.27, pan: 0.3, humanize: 10, pattern: triplum },
        { name: 'sackbut', inst: 'sackbut', gain: 0.14, pan: 0.15, humanize: 6, pattern: sackbut },
        { name: 'drum', wave: 'noise', gain: 0.2, pattern: [...steps(0), ...steps(32)] },
      ],
    });
  }

  // ── BALLADE FOR LADY ALUSTRIEL ───────────────────────────────────────────
  // Form:   Ars Nova ballade in the manner of Machaut: AAB with the refrain
  //         rhyming the end of A, a cantus over a tenor that makes good
  //         two-part counterpoint on its own, and a contratenor filling in
  //         the third. Ouvert and clos endings, and the double-leading-tone
  //         cadence of the century (tenor falls a step while the other two
  //         rise by semitones: A C# F# to G D G). Played twice: recorder,
  //         vielle and harp; then the vielle takes the tune with diminutions
  //         over a bowed viol.
  // Mode:   G with B-flat (transposed first mode), F# and C# at cadences.
  // Voices: cantus, tenor, contratenor. 3/4, a measure = 12 sixteenths.
  // Source: original.
  // Plays:  castle halls and courts — Silverymoon's above all.
  {
    const M = 12;
    const cantus = {
      a: 'G4:4 A4:2 Bb4:2 C5:4 | D5:6 C5:2 Bb4:2 A4:2 | Bb4:4 G4:4 A4:2 Bb4:2 | C5:2 Bb4:2 A4:4 G4:4',
      ouvert: 'Bb4:2 C5:2 D5:4 C#5:4 | D5:8 r:4',
      clos: 'C5:2 Bb4:2 A4:4 F#4:4 | G4:8 r:4',
      b: 'D5:4 F5:4 E5:2 D5:2 | C5:2 D5:2 Bb4:4 C5:4 | D5:6 E5:2 F5:2 D5:2 | E5:4 D5:2 C5:2 D5:4 | ' +
        'D5:2 C5:2 D5:4 E5:4 | F5:8 r:4 | r:2 C5:2 D5:2 C5:2 Bb4:2 A4:2 | G4:4 A4:2 Bb4:2 C5:4',
      refrain: 'D5:6 C5:2 Bb4:2 A4:2 | Bb4:4 G4:4 A4:2 Bb4:2',
      // Diminutions for the second time through: new notes only between the beats.
      a2: 'G4:2 F4:1 G4:1 A4:2 Bb4:2 C5:2 D5:1 C5:1 | D5:5 E5:1 C5:2 Bb4:2 A4:2 | ' +
        'Bb4:2 A4:2 G4:2 F4:1 G4:1 A4:2 Bb4:2 | C5:2 Bb4:2 A4:2 Bb4:1 A4:1 G4:4',
    };
    const tenorL = {
      a: 'G3:4 F3 E3 | D3 F3 G3 | G3 E3 F3 | F3 D3 G3',
      ouvert: 'G3:4 F3 E3 | D3:8 r:4',
      clos: 'F3:4 D3 A3 | G3:8 r:4',
      b: 'Bb3:4 A3 G3 | F3 G3 A3 | Bb3 G3 D3 | A3 Bb3:8 | Bb3:4 F3 G3 | F3:8 r:4 | r:4 F3 G3 | G3 F3 E3',
      refrain: 'D3:4 F3 G3 | G3 E3 F3',
    };
    const contraL = {
      a: 'D4:4 C4 G3 | A3:8 D4:4 | D4:4 C4:8 | A3:4 F3 D4',
      ouvert: 'D4:4 A3 G#3 | A3:8 r:4',
      clos: 'A3:4 F3 C#4 | D4:8 r:4',
      b: 'D4:4 C4 E4 | A3 D4 E4 | F4 D4 A3 | C4 F4 D4 | F4:8 B3:4 | C4:8 r:4 | r:4 A3 D4 | D4 C4 G3',
      refrain: 'A3:8 D4:4 | D4:4 C4:8',
    };
    const form = (p, a = p.a) => [a, p.ouvert, p.a, p.clos, p.b, p.refrain, p.clos].join(' | ');
    const S2 = 24 * M;
    const o = { weak: 0.82, beat: 4 };
    tracks.alustrielBallade = track({
      title: 'Ballade for Lady Alustriel',
      contexts: ['castle', 'city'], weight: 1.6, room: 'hall',
      bpm: 76, loopBars: 36, gain: 0.9,
      layers: [
        { name: 'cantus', inst: 'recorder', gain: 0.26, pan: 0.2, humanize: 12, ornament: 'mordent', pattern: line(form(cantus), { ...o, vol: 0.85 }) },
        { name: 'tenor', inst: 'vielle', gain: 0.24, pan: -0.25, humanize: 12, pattern: line(form(tenorL), { ...o, vol: 0.8 }) },
        { name: 'contra', inst: 'harp', gain: 0.24, pan: 0.05, humanize: 10, pattern: [...line(form(contraL), { ...o, vol: 0.75 }), ...line(form(contraL), { ...o, at: S2, vol: 0.7 })] },
        { name: 'cantus2', inst: 'vielle', gain: 0.26, pan: 0.25, humanize: 12, ornament: 'trill', pattern: line(form(cantus, cantus.a2), { ...o, at: S2, vol: 0.85 }) },
        { name: 'tenor2', inst: 'viol', gain: 0.24, pan: -0.25, humanize: 12, pattern: line(form(tenorL), { ...o, at: S2, vol: 0.8 }) },
      ],
    });
  }

  // ── SELÛNE'S GYMEL ───────────────────────────────────────────────────────
  // Form:   an English gymel ("twin song", 13th-15th c.): two equal voices
  //         moving in parallel thirds, closing each phrase by contrary motion
  //         onto a unison. Sung twice, the second time with a third voice
  //         under it in the English discant manner (thirds, sixths, tenths,
  //         the open fifth only where a phrase begins or ends), then played
  //         on recorder and harp as the fire goes out.
  // Mode:   C (the fifth mode with B-natural, the English "merry" key);
  //         3/4, a measure = 12 sixteenths.
  // Voices: treble and alto (the gymel), tenor (the third voice); harp,
  //         recorder, handbells for the moon.
  // Source: original.
  // Plays:  at night, anywhere under Selûne's light.
  {
    const M = 12;
    const high = [
      'E5:8 D5:4 | C5:8 D5:4 | E5:4 F5:4 E5:4 | D5:12 | E5:8 D5:4 | C5:4 D5:4 E5:4 | D5:4 E5:4 D5:4 | C5:12',
      'G5:8 F5:4 | E5:8 D5:4 | E5:4 F5:4 G5:4 | A5:12 | G5:8 E5:4 | F5:4 E5:4 C5:4 | D5:4 E5:4 D5:4 | C5:12',
    ].join(' | ');
    const low = [
      'C5:8 B4:4 | A4:8 B4:4 | C5:4 D5:4 C5:4 | B4:12 | C5:8 B4:4 | A4:4 B4:4 C5:4 | B4:4 C5:4 B4:4 | C5:12',
      'E5:8 D5:4 | C5:8 B4:4 | C5:4 D5:4 E5:4 | F5:12 | E5:8 C5:4 | D5:4 C5:4 A4:4 | B4:4 C5:4 B4:4 | C5:12',
    ].join(' | ');
    // The third voice: contrary to the pair wherever they move in step, so
    // the three never slide into parallel fifths or octaves.
    const tenorL = [
      'C4:8 G3:4 | A3:8 G3:4 | C4:4 F3:4 C4:4 | G3:12 | C4:8 G3:4 | A3:4 G3:4 C4:4 | G3:4 C4:4 G3:4 | C4:12',
      'C4:8 D4:4 | A3:8 G3:4 | C4:4 F3:4 C4:4 | F3:12 | C4:8 A3:4 | D4:4 A3:8 | G3:4 C4:4 G3:4 | C4:12',
    ].join(' | ');
    const B = 16 * M, C = 32 * M;             // second verse, the instrumental close
    const o = { weak: 0.84, beat: M };
    const P1 = (src) => src.split(' | ').slice(0, 8).join(' | ');
    const peal = (at) => line('G5:4 E5:4 C5:8', { at, vol: 0.55 });
    // Sung to the syllables of a 14th-century English lullaby (a syllable a
    // note of the tune); the other voices take whatever syllable it is on.
    const LULLAY = 'Lul-lay lul-lay li-tel child why we-pes-tou so sore';
    const tune = [...words(line(high, { ...o, vol: 0.8 }), LULLAY), ...words(line(high, { ...o, at: B, vol: 0.8 }), LULLAY)];

    tracks.seluneGymel = track({
      title: "Selûne's Gymel",
      contexts: ['night'], weight: 1.6, room: 'chapel',
      bpm: 63, loopBars: 30, gain: 0.85,
      layers: [
        { name: 'high', inst: 'voiceTreble', vowel: 'o', gain: 0.3, pan: 0.25, humanize: 12, pattern: tune },
        { name: 'low', inst: 'voiceAlto', vowel: 'o', gain: 0.3, pan: -0.2, humanize: 12,
          pattern: underlay(tune, [...line(low, { ...o, vol: 0.78 }), ...line(low, { ...o, at: B, vol: 0.78 })]) },
        { name: 'tenor', inst: 'voiceTenor', vowel: 'u', gain: 0.27, pan: 0, humanize: 12, pattern: underlay(tune, line(tenorL, { ...o, at: B, vol: 0.75 })) },
        // The harp sounds each note of the third voice in verse two, then
        // takes both lower parts alone under the recorder.
        { name: 'harp', inst: 'harpGothic', gain: 0.22, pan: -0.3, humanize: 8,
          pattern: [...line(tenorL, { at: B, vol: 0.55 }), ...line(P1(low), { at: C, vol: 0.6 }), ...line(P1(tenorL), { at: C, vol: 0.6 })] },
        { name: 'recorder', inst: 'recorder', gain: 0.22, pan: 0.3, humanize: 10, ornament: 'grace', pattern: line(P1(high), { ...o, at: C, vol: 0.75 }) },
        { name: 'bells', inst: 'handbells', gain: 0.12, pan: 0.4, pattern: [...peal(0), ...peal(B), ...peal(C)] },
      ],
    });
  }

  // ── PLANCTUS FOR THE FALLEN OF DRAGONSPEAR ───────────────────────────────
  // Form:   a planctus, the sung lament of the 9th-13th centuries (the
  //         Planctus Karoli, Abelard's planctus): a solo voice over a drone,
  //         stanza by stanza. The second stanza a vielle joins in
  //         heterophony, the melody an octave down with its own small
  //         turns; the third climbs, and a second singer takes the
  //         organal voice a fifth below it; the fourth returns with the harp.
  // Mode:   E (third mode, Phrygian). Every phrase falls onto the final
  //         through the half step F-E, which is the sound of grief here.
  // Voices: alto (the lament), tenor (organal voice), men's choir humming the
  //         drone; vielle, viol, harp; a single bell at each stanza.
  // Source: original.
  // Plays:  laments, defeats and graves — Dragonspear Castle's dead above all.
  {
    const ST = 128;                             // one stanza: eight 4/4 bars
    const low = ['E4:4 G4:4 A4:8 B4:4 A4:2 G4:2 A4:6 r:2', 'C5:6 B4:2 A4:4 G4:4 F4:8 E4:6 r:2',
      'G4:4 A4:4 B4:4 C5:4 D5:8 C5:4 B4:4', 'A4:4 G4:4 F4:4 G4:4 F4:8 E4:6 r:2'].join(' ');
    const high = ['B4:4 C5:4 D5:8 E5:6 D5:2 C5:6 r:2', 'D5:4 C5:4 B4:4 A4:4 B4:8 r:8',
      'E5:8 D5:4 C5:4 B4:4 A4:4 G4:6 r:2', 'A4:4 G4:4 F4:8 E4:12 r:4'].join(' ');
    // Organum at the fifth below — except under F, whose fifth would be
    // B-flat against the E drone; the organal voice takes the sixth, A.
    const organal = ['E4:4 F4:4 G4:8 A4:6 G4:2 F4:6 r:2', 'G4:4 F4:4 E4:4 D4:4 E4:8 r:8',
      'A4:8 G4:4 F4:4 E4:4 D4:4 C4:6 r:2', 'D4:4 C4:4 A3:8 B3:12 r:4'].join(' ');
    const hetero = ['E3:4 G3:2 F3:2 A3:6 G3:2 B3:4 A3:2 G3:2 A3:6 r:2', 'C4:6 B3:2 A3:4 G3:4 F3:4 G3:2 F3:2 E3:6 r:2',
      'G3:4 A3:4 B3:2 A3:2 C4:4 D4:8 C4:4 B3:4', 'A3:4 G3:4 F3:4 G3:4 F3:6 G3:1 F3:1 E3:6 r:2'].join(' ');
    // The last stanza lingers on its final.
    const close = low.replace(/E4:6 r:2$/, 'E4:8');
    const o = { weak: 0.82, beat: 8 };
    const hum = [0, 1, 2].flatMap((k) => [[k * ST, pitch('E2'), 60, 0.8], [k * ST, pitch('B2'), 60, 0.6],
      [k * ST + 64, pitch('E2'), 60, 0.75], [k * ST + 64, pitch('B2'), 60, 0.55]]);
    const harp = [];
    for (let b = 0; b < 8; b++) {
      const s = 3 * ST + b * 16;
      harp.push([s, pitch('E3'), 8, 0.6], [s + 4, pitch('B3'), 8, 0.45], [s + 8, pitch('E4'), 8, 0.4], [s + 12, pitch('B3'), 4, 0.35]);
    }

    // A syllable on each crotchet, to the vowels of the first stanza of the
    // Planctus Karoli (c. 814), the lament for Charlemagne; the notes between
    // are its neumes. The organal voice sings the same syllables.
    const KAROLI = 'A so-lis or-tu us-que ad oc-ci-du-a lit-to-ra ma-ris planc-tus pul-sat pec-to-ra';
    const stanza = (src, at, vol) => words(line(src, { ...o, at, vol }), KAROLI, 4);
    const voice = [...stanza(low, 0, 0.85), ...stanza(low, ST, 0.85), ...stanza(high, 2 * ST, 0.9), ...stanza(close, 3 * ST, 0.8)];

    tracks.dragonspearPlanctus = track({
      title: 'Planctus for the Fallen of Dragonspear',
      contexts: ['lament', 'defeat'], weight: 1.5, room: 'chapel',
      bpm: 56, loopBars: 32, gain: 0.9,
      layers: [
        { name: 'voice', inst: 'voiceAlto', vowel: 'a', gain: 0.34, pan: 0, humanize: 14, ornament: 'mordent', pattern: voice },
        { name: 'answer', inst: 'voiceTenor', vowel: 'a', gain: 0.26, pan: -0.25, humanize: 14,
          pattern: underlay(voice, line(organal, { ...o, at: 2 * ST, vol: 0.8 })) },
        { name: 'drone', inst: 'choirMen', vowel: 'u', gain: 0.2, pan: 0.1, pattern: hum },
        { name: 'vielle', inst: 'vielle', gain: 0.2, pan: 0.3, humanize: 16, pattern: line(hetero, { ...o, at: ST, vol: 0.75 }) },
        { name: 'viol', inst: 'viol', gain: 0.2, pan: -0.1,
          pattern: [ST, 2 * ST, 3 * ST].flatMap((s) => [[s, pitch('E2'), 64, 0.7], [s + 64, pitch('E2'), 64, 0.65]]) },
        { name: 'harp', inst: 'harpGothic', gain: 0.18, pan: -0.3, humanize: 10, pattern: harp },
        { name: 'bell', inst: 'bells', gain: 0.18, pan: 0.2, pattern: [0, ST, 2 * ST, 3 * ST].map((s) => [s, pitch('E3'), 16, 0.6]) },
      ],
    });
  }

  // ── HOCKET OF THE BLACK HAND ─────────────────────────────────────────────
  // Form:   isorhythmic motet (Ars Nova, early 14th c.) on a chant tenor:
  //         the tenor's pitches (the color) are poured into a fixed rhythm
  //         (the talea) — here four notes to a talea, two taleae to a color —
  //         stated four times, then four times in diminution at double speed,
  //         then twice more at the first speed. Over it a motetus and a
  //         triplum, and in the middle of the piece the two upper parts break
  //         into hocket: one sounds while the other rests, note by note, the
  //         "hiccup" the Church banned in 1324. Played by the alta capella,
  //         the loud band: shawms, cornett, sackbut and nakers.
  // Mode:   D (first mode), B-flat in the upper voices, C-sharp at the close.
  // Voices: bass and sackbut (tenor), tenor shawm and men's choir (motetus),
  //         cornett (triplum); nakers, war drum, a tolling bell.
  // Source: tenor = Dies irae, first line ("Dies irae, dies illa": F E F D
  //         E C D D, GregoBase #1198), at the chant's own pitch, final D.
  //         Motetus, triplum and hocket are original.
  // Plays:  boss fights — the Black Hand of Bane, and anything as merciless.
  {
    const COLOR = ['F3', 'E3', 'F3', 'D3', 'E3', 'C3', 'D3', 'D3'].map(pitch);
    const TALEA = [[0, 8], [8, 6], [16, 4], [20, 8]];        // [offset, length] in a 32-step talea
    // One statement of the color from `at`; `k` = 1 normal, 0.5 in diminution.
    const color = (at, k, vol = 0.9) => COLOR.map((n, i) => {
      const [off, len] = TALEA[i % 4];
      return [at + (Math.floor(i / 4) * 32 + off) * k, n, len * k, i % 4 ? vol * 0.85 : vol];
    });
    const S = 'D E F G A Bb C';
    const starts = [0, 64, 128, 192, 256, 288, 320, 352, 384, 448];
    // The bass sings the chant's own words, a syllable a note.
    const tenor = starts.flatMap((s, i) => words(color(s, i >= 4 && i < 8 ? 0.5 : 1), 'Di-es i-rae di-es il-la'));

    // Written upper parts over one color: first mode, a perfection of 8.
    const mot1 = 'C4/Bb3 G3/A3 A3/Bb3 A3/G3 G3/A3 G3/F3 F3/G3 A3.';
    const mot2 = 'A3/Bb3 G3/A3 D4/C4 D4/C4 B3/C4 C4/D4 D4/E4 D4.';
    const tri1 = '{C5:2,D5:1,C5:1,A4:2,Bb4:1,A4:1} {B4:3,A4:1,G4:2,A4:2} {A4:4,G4:2,F4:2} {A4:2,Bb4:2,A4:2,G4:2} ' +
      '{G4:2,A4:1,G4:1,E4:2,F4:1,E4:1} {G4:3,F4:1,E4:2,G4:2} {A4:2,Bb4:1,A4:1,G4:2,F4:2} {A4:6,r:2}';
    const tri2 = '{F5:2,E5:1,D5:1,C5:2,D5:2} {E5:3,D5:1,C5:2,B4:2} {D5:2,C5:2,D5:2,E5:2} {F5:2,E5:1,D5:1,C#5:2,D5:2} ' +
      '{E5:2,D5:1,C5:1,B4:2,C5:2} {C5:2,D5:2,E5:2,C5:2} {D5:2,C5:1,Bb4:1,A4:2,Bb4:2} {A4:6,r:2}';
    const w = (src, at, vol = 0.9) => modal(src, { at, scale: S, perf: 8, long: 6, vol });

    // Hocket: every 2 steps the sound passes between the parts, each note
    // clipped short so the other's answer lands in a real gap. Triplum on the
    // beats, motetus between, both on tones of the tenor's sonority.
    const PLAN = {
      A: { F3: [['C5', 'A4'], ['A3', 'F3']], E3: [['B4', 'G4'], ['E4', 'B3']], D3: [['A4', 'D5'], ['D4', 'A3']], C3: [['G4', 'E4'], ['C4', 'G3']] },
      B: { F3: [['F5', 'C5'], ['A3', 'C4']], E3: [['E5', 'B4'], ['G3', 'B3']], D3: [['D5', 'A4'], ['A3', 'D4']], C3: [['E5', 'C5'], ['G3', 'C4']] },
    };
    const NAMES = { [pitch('F3')]: 'F3', [pitch('E3')]: 'E3', [pitch('D3')]: 'D3', [pitch('C3')]: 'C3' };
    function hocket(ten, from, to, plan) {
      const t = [], m = [];
      for (let s = from; s < to; s += 2) {
        const cur = ten.filter((e) => e[0] <= s).pop();
        const [tt, mm] = PLAN[plan][NAMES[cur[1]]];
        const k = (s - from) / 2;
        if (k % 2 === 0) t.push([s, pitch(tt[(k / 2) % 2]), 1.4, s % 8 ? 0.8 : 0.95]);
        else m.push([s, pitch(mm[((k - 1) / 2) % 2]), 1.4, 0.8]);
      }
      return { t, m };
    }
    const hk = [hocket(tenor, 192, 256, 'A'), hocket(tenor, 256, 288, 'B'), hocket(tenor, 288, 320, 'A'),
      hocket(tenor, 320, 352, 'B'), hocket(tenor, 352, 384, 'A'), hocket(tenor, 448, 496, 'B')];
    const motetus = [...w(mot1, 64), ...w(mot2, 128), ...w(mot1, 384), ...line('A3:16', { at: 496, vol: 0.9 }), ...hk.flatMap((x) => x.m)];
    const triplum = [...w(tri1, 128), ...w(tri2, 384), ...line('D5:12 r:4', { at: 496, vol: 0.95 }), ...hk.flatMap((x) => x.t)];

    // The nakers gallop; the war drum marks each talea; in the diminution
    // the tabor fills every sixteenth.
    const drums = [];
    for (let b = 0; b < 32; b++) {
      const s = b * 16;
      drums.push([s, 'nakers', 1, 0.7], [s + 6, 'nakersHi', 1, 0.5], [s + 10, 'nakers', 1, 0.55], [s + 12, 'nakersHi', 1, 0.45]);
      if (b % 2 === 0) drums.push([s, 'wardrum', 1, 0.8]);
      if (b >= 16 && b < 24) for (let i = 1; i < 16; i += 2) drums.push([s + i, 'tabor', 1, 0.25 + (i % 4 === 3 ? 0.1 : 0)]);
    }

    tracks.blackHandHocket = track({
      title: 'Hocket of the Black Hand',
      contexts: ['boss', 'battle'], intensity: 3, weight: 1.4, room: 'hall',
      bpm: 132, loopBars: 32, gain: 1,
      layers: [
        { name: 'tenor', inst: 'voiceBass', vowel: 'o', gain: 0.26, pan: 0, humanize: 6, pattern: tenor },
        { name: 'sackbut', inst: 'sackbut', gain: 0.22, pan: -0.1, humanize: 4, pattern: tenor },
        { name: 'motetus', inst: 'shawmTenor', gain: 0.2, pan: -0.35, humanize: 5, pattern: motetus },
        { name: 'choir', inst: 'choirMen', vowel: 'a', gain: 0.16, pan: -0.2, humanize: 10, pattern: [...w(mot1, 64, 0.8), ...w(mot2, 128, 0.8), ...w(mot1, 384, 0.8)] },
        { name: 'triplum', inst: 'cornett', gain: 0.19, pan: 0.35, humanize: 5, pattern: triplum },
        { name: 'drums', wave: 'noise', gain: 0.24, pattern: drums },
        { name: 'bell', inst: 'bells', gain: 0.16, pan: 0.15, pattern: [[0, pitch('D3'), 16, 0.7], [384, pitch('D3'), 16, 0.7]] },
      ],
    });
  }

  // ── CHANT FOR THE LADY OF MYSTERIES ──────────────────────────────────────
  // Form:   chant heard in fragments, as if through a wall: a phrase, then
  //         silence the psaltery fills with stacked fifths, then another
  //         phrase that stops on a note that is not the final. From the
  //         second verse a second singer holds strict organum at the fifth
  //         below (Musica enchiriadis) and closes onto the unison. Midway
  //         the organ's drone slips down a tone and comes back.
  // Mode:   D (first mode, B natural); phrases hang on G and A.
  // Voices: alto (chant), tenor (organal voice); struck psaltery, positive
  //         organ drone, handbells.
  // Source: original.
  // Plays:  mysteries: Mystra's shrines, ruins with magic still in them.
  {
    const f1 = 'A4:4 C5:4 B4:4 A4:12 r:8', s1 = 'D4:4 F4:4 E4:4 D4:12 r:8';
    const f2 = 'D5:6 C5:2 A4:4 B4:4 G4:8 r:8';
    const f2b = 'E5:6 D5:2 C5:4 B4:4 A4:8 r:8', s2b = 'A4:6 G4:2 F4:4 E4:4 D4:8 r:8';
    const f3 = 'F4:4 G4:4 A4:4 C5:4 B4:6 A4:2 G4:8', s3 = 'D4:4 D4:4 D4:4 F4:4 E4:6 D4:2 C4:8';
    const f4 = 'A4:4 G4:4 F4:4 E4:4 D4:12 r:4', s4 = 'D4:4 C4:4 D4:4 A3:4 D4:12 r:4';
    const sing = (src, at) => line(src, { at, vol: 0.85, weak: 0.8, beat: 8 });
    const chant = [...sing(f1, 0), ...sing(f2, 64), ...sing(f3, 128), ...sing(f4, 192),
      ...sing(f2b, 256), ...sing(f1, 320), ...sing(f3, 384), ...sing(f4, 416)];
    // A syllable a note, to the vowels of the hymn Veni Creator Spiritus running on
    // from fragment to fragment; the organal voice sings the chant's syllable.
    const VENI = 'Ve-ni Cre-a-tor Spi-ri-tus men-tes tu-o-rum vi-si-ta im-ple su-per-na gra-ti-a quae tu cre-a-sti pec-to-ra';
    const chantW = words(chant, VENI);
    const second = underlay(chantW, [...sing(s3, 128), ...sing(s2b, 256), ...sing(s1, 320), ...sing(s3, 384), ...sing(s4, 416)]);
    // Psaltery: eighth notes round a stack of fifths, swelling and dying.
    const shimmer = (at, names, len = 32) => {
      const ns = names.split(' ').map(pitch);
      return Array.from({ length: len / 2 }, (_, i) => [at + i * 2, ns[i % ns.length], 3, 0.35 + 0.4 * Math.sin(Math.PI * (i + 0.5) / (len / 2))]);
    };
    const psaltery = [...shimmer(32, 'D5 A5 E6 A5'), ...shimmer(96, 'C5 G5 D6 G5'), ...shimmer(160, 'F5 C6 G5 C6'),
      ...shimmer(288, 'E5 A5 D6 A5'), ...shimmer(352, 'D5 A5 E6 A5'), ...shimmer(448, 'D5 A5 E6 A5', 48)];
    const pedal = (at, len, a, b) => [[at, pitch(a), len, 0.7], [at, pitch(b), len, 0.5]];
    const organ = [...pedal(0, 128, 'D2', 'A2'), ...pedal(128, 128, 'D2', 'A2'), ...pedal(256, 64, 'C2', 'G2'),
      ...pedal(320, 64, 'D2', 'A2'), ...pedal(384, 128, 'D2', 'A2')];
    const bells = [...line('A5:4 E5:12', { at: 112, vol: 0.5 }), ...line('D6:4 A5:4 E5:8', { at: 496, vol: 0.5 })];

    tracks.mysteriesChant = track({
      title: 'Chant for the Lady of Mysteries',
      contexts: ['mystery'], weight: 1.5, room: 'chapel',
      bpm: 66, loopBars: 32, gain: 0.85,
      layers: [
        { name: 'chant', inst: 'voiceAlto', vowel: 'i', gain: 0.32, pan: 0.1, humanize: 14, pattern: chantW },
        { name: 'second', inst: 'voiceTenor', vowel: 'u', gain: 0.26, pan: -0.2, humanize: 14, pattern: second },
        { name: 'psaltery', inst: 'psalteryStruck', gain: 0.2, pan: 0.35, humanize: 6, pattern: psaltery },
        { name: 'organ', inst: 'positive', gain: 0.14, pan: 0, pattern: organ },
        { name: 'bells', inst: 'handbells', gain: 0.12, pan: -0.35, pattern: bells },
      ],
    });
  }

  // ── CONDUCTUS FOR THE FOEHAMMER ──────────────────────────────────────────
  // Form:   a short three-voice conductus: one stanza note against note, the
  //         outer voices in contrary motion and the old Notre-Dame cadence
  //         (the tenor rising F to G under parallel fifths), then a cauda in
  //         parallel tenths over the held final, closing the same way.
  //         A fanfare: it plays once.
  // Mode:   G (seventh mode, F natural).
  // Voices: bass + sackbut (tenor), tenor + tenor shawm (duplum), alto +
  //         shawm (triplum); nakers, tabor roll, handbells.
  // Source: original.
  // Plays:  victory — Tempus, Lord of Battles, takes his due.
  {
    const T = 'G3:4 B3:4 C4:4 A3:4 | B3:4 G3:4 F3:4 G3:4 | G3:24 F3:4 G3:20';
    const D = 'D4:4 D4:4 E4:4 E4:4 | D4:4 D4:4 C4:4 D4:4 | B3:2 C4:2 B3:2 A3:2 G3:2 A3:2 B3:4 | C4:2 D4:2 E4:2 D4:2 C4:4 D4:20';
    const Tr = 'D5:4 B4:4 G4:4 C5:4 | D5:4 B4:4 A4:4 G4:4 | D5:2 E5:2 D5:2 C5:2 B4:2 C5:2 D5:4 | E5:2 D5:2 C5:2 B4:2 A4:4 G4:20';
    const o = { vol: 0.9, weak: 0.82, beat: 4 };
    // The stanza sung to the opening of the Easter sequence Victimae paschali
    // laudes, whose second stanza is death and life locked in a duel; the
    // cauda is a melisma on its last syllable.
    const vt = (src) => {
      const l = line(src, o);
      return [...words(l.filter((e) => e[0] < 32), 'Vic-ti-mae pas-cha-li lau-des', 4),
        ...l.filter((e) => e[0] >= 32).map(([s, n, d, v]) => [s, n, d, v, 'e'])];
    };
    const drums = [...[0, 4, 8, 12, 16, 20, 24, 28].map((s) => [s, s % 16 ? 'nakers' : 'wardrum', 1, s % 16 ? 0.55 : 0.8]),
      ...Array.from({ length: 12 }, (_, i) => [48 + i, 'tabor', 1, 0.2 + i * 0.03]), [60, 'wardrum', 1, 0.9]];
    tracks.tempusConductus = track({
      title: 'Conductus for the Foehammer',
      contexts: ['victory'], weight: 1.2, room: 'hall',
      bpm: 116, loopBars: 5, gain: 1,
      layers: [
        { name: 'tenor', inst: 'voiceBass', vowel: 'a', gain: 0.26, pan: 0, humanize: 5, pattern: vt(T) },
        { name: 'sackbut', inst: 'sackbut', gain: 0.2, pan: -0.15, pattern: line(T, o) },
        { name: 'duplum', inst: 'voiceTenor', vowel: 'a', gain: 0.24, pan: -0.3, humanize: 5, pattern: vt(D) },
        { name: 'shawmT', inst: 'shawmTenor', gain: 0.16, pan: -0.4, pattern: line(D, o) },
        { name: 'triplum', inst: 'voiceAlto', vowel: 'a', gain: 0.24, pan: 0.3, humanize: 5, pattern: vt(Tr) },
        { name: 'shawm', inst: 'shawm', gain: 0.2, pan: 0.4, pattern: line(Tr, o) },
        { name: 'drums', wave: 'noise', gain: 0.24, pattern: drums },
        { name: 'bells', inst: 'handbells', gain: 0.16, pan: 0.2, pattern: line('G5:3 D5:3 B4:3 G4:11', { at: 60, vol: 0.6 }) },
      ],
    });
  }

  // ── SONG AT THE WAYFIRE ──────────────────────────────────────────────────
  // Form:   a strophic three-voice song in English discant (early 15th c.):
  //         the tune in the middle voice, a bass under it and an alto over
  //         it in thirds, sixths and tenths, open fifths and octaves only at
  //         the ends of phrases, and the double-leading-tone close. Four
  //         strophes: the tune alone over a lute; three voices; three voices
  //         with a recorder descant and a frame drum; the lute alone.
  // Mode:   D (first mode), C-sharp at the final cadence; 6/8, a measure =
  //         12 sixteenths.
  // Voices: tenor (tune), bass, alto; lute, recorder, frame drum.
  // Source: original.
  // Plays:  at camp, round the fire.
  {
    const tune = 'A3:4 G3:2 F3:4 G3:2 | A3:6 D3:6 | F3:4 G3:2 A3:4 G3:2 | A3:12 | D4:4 C4:2 A3:4 G3:2 | F3:4 G3:2 A3:6 | G3:4 F3:2 E3:6 | D3:12';
    const alto = 'F4:6 D4:6 | C4:6 B3:6 | A3:6 D4:6 | E4:12 | F4:12 | D4:6 C4:6 | C4:6 C#4:6 | D4:12';
    const bass = 'D3:12 | F3:6 G2:6 | D3:6 F3:6 | A2:12 | F3:6 D3:6 | D3:6 F3:6 | E3:6 A2:6 | D2:12';
    const desc = 'A4:4 G4:2 F4:6 | A4:6 G4:6 | F4:6 A4:6 | A4:12 | A4:4 Bb4:2 A4:6 | A4:6 F4:6 | G4:6 A4:6 | A4:12';
    const ST = 96;
    // The singers' low D is below the lute's lowest course: it takes the octave.
    const lift = (evs) => evs.map(([s, n, d, v]) => [s, n < pitch('E2') ? n + 12 : n, d, v]);
    const o = { vol: 0.85, weak: 0.8, beat: 6 };
    const at = (k, extra = {}) => ({ ...o, at: k * ST, ...extra });
    // A syllable on each beat, to the vowels of the 13th-century rota Sumer is
    // icumen in; the lower voices sing the tune's syllable.
    const SUMER = 'Su-mer is i-cu-men in lhu-de sing cuc-cu grow-eth sed and blow-eth med';
    const sungTune = [0, 1, 2].flatMap((k) => words(line(tune, at(k)), SUMER, 6));
    const drum = [];
    for (let b = 16; b < 32; b++) drum.push([b * 12, 'frame', 1, b < 24 ? 0.5 : 0.35], [b * 12 + 6, 'frame', 1, b < 24 ? 0.3 : 0.2], [b * 12 + 9, 'tabor', 1, 0.18]);

    tracks.wayfireSong = track({
      title: 'Song at the Wayfire',
      contexts: ['camp'], weight: 1.5, room: 'open',
      bpm: 88, loopBars: 24, gain: 1,
      layers: [
        { name: 'tenor', inst: 'voiceTenor', vowel: 'a', gain: 0.3, pan: 0, humanize: 14,
          pattern: sungTune },
        { name: 'alto', inst: 'voiceAlto', vowel: 'a', gain: 0.25, pan: 0.3, humanize: 14, pattern: underlay(sungTune, [...line(alto, at(1)), ...line(alto, at(2))]) },
        { name: 'bass', inst: 'voiceBass', vowel: 'o', gain: 0.27, pan: -0.3, humanize: 14, pattern: underlay(sungTune, [...line(bass, at(1)), ...line(bass, at(2))]) },
        { name: 'descant', inst: 'recorder', gain: 0.2, pan: 0.4, humanize: 10, ornament: 'grace', pattern: line(desc, at(2, { vol: 0.75, shift: 12 })) },
        // The lute strums the other two parts under the lone tune, and at the
        // end plays the tune itself over its own bass.
        { name: 'lute', inst: 'lutePlucked', gain: 0.24, pan: -0.15, humanize: 8,
          pattern: [...lift(beats(line(bass), 6, 0, 0.7)), ...beats(line(alto), 6, 0, 0.55), ...line(tune, at(3, { vol: 0.8 }))] },
        { name: 'luteBass', inst: 'lutePlucked', gain: 0.2, pan: 0.15, humanize: 8, pattern: lift(beats(line(bass, { at: 3 * ST }), 6, 0, 0.6)) },
        { name: 'drum', wave: 'noise', gain: 0.18, pattern: drum },
      ],
    });
  }

  // ── FABURDEN FOR THE VIGILANT ONE ────────────────────────────────────────
  // Form:   a psalm sung alternatim, as an English choir of the 15th century
  //         would: the odd verses in plainchant, the even verses in faburden
  //         — the chant in the middle voice, a treble a perfect fourth above
  //         it, and the faburden a third below except where a half-verse
  //         begins or ends, where it takes the fifth. So every half-verse
  //         opens and closes on an open fifth and octave and moves between in
  //         chains of sixth-three chords, the sound of English polyphony. The
  //         last verse ("Sicut erat") adds organ and sackbut.
  // Mode:   the psalm tone is on D (first mode, reciting on A); the
  //         faburden puts G under its final, so the polyphony closes on G.
  //         The treble's fourth above F is B-flat, against the chant's B.
  // Voices: tenor cantor and men's choir (chant), bass (faburden), alto
  //         (treble); positive organ, sackbut, a low bell for the watch.
  // Source: original psalm tone; faburden by the 15th-century rule; the
  //         singers' syllables are Psalm 120 (Vulgate) and the Gloria Patri.
  // Plays:  temples of Helm and Torm, and castle chapels.
  {
    // The text decides the length of each recitation, as it does in any
    // psalmody: a syllable a crotchet on the reciting note, the tone's fixed
    // formulas on the first three syllables (intonation), the last four of
    // the first half (mediant) and the last five of the second (termination).
    // Psalm 120 (Vulgate), "Levavi oculos" — he that keepeth thee will not
    // slumber — and the doxology.
    const PSALM = [
      ['Le-va-vi o-cu-los me-os in mon-tes', 'un-de ve-ni-et au-xi-li-um mi-hi'],
      ['Au-xi-li-um me-um a Do-mi-no', 'qui fe-cit cae-lum et ter-ram'],
      ['Non det in com-mo-ti-o-nem pe-dem tu-um', 'ne-que dor-mi-tet qui cus-to-dit te'],
      ['Ec-ce non dor-mi-ta-bit ne-que dor-mi-et', 'qui cus-to-dit Is-ra-el'],
      ['Glo-ri-a Pa-tri et Fi-li-o', 'et Spi-ri-tu-i Sanc-to'],
      ['Si-cut e-rat in prin-ci-pi-o et nunc et sem-per', 'et in sae-cu-la sae-cu-lo-rum A-men'],
    ];
    const half = (notes, text, at, close, rest) => {
      const l = line(notes.map((n, i) => `${n}:${i === notes.length - 1 ? close : 4}`).join(' ') + ` r:${rest}`,
        { at, vol: 0.88, weak: 0.82, beat: 8 });
      return { evs: words(l, text), end: l.end };
    };
    const verses = [];
    let t = 0;
    PSALM.forEach(([a, b], k) => {
      const n1 = vowelsOf(a).length, n2 = vowelsOf(b).length;
      const h1 = half(['D3', 'F3', 'G3', ...Array(n1 - 7).fill('A3'), 'B3', 'A3', 'G3', 'A3'], a, t, 8, 4);
      const h2 = half([...Array(n2 - 5).fill('A3'), 'G3', 'F3', 'G3', 'E3', 'D3'], b, h1.end, k === PSALM.length - 1 ? 16 : 8, 8);
      verses.push([...h1.evs, ...h2.evs]);
      t = h2.end;
    });
    const chantV = verses.filter((_, i) => i % 2 === 0).flat();
    const fabV = verses.filter((_, i) => i % 2 === 1);
    const parts = fabV.map((mean) => faburden(mean, 'G A B C D E F'));
    const bassus = parts.flatMap((p) => p.bass), treble = parts.flatMap((p) => p.treble);
    const last = parts[2];
    const verseAt = verses.map((v) => v[0][0]);

    tracks.helmFaburden = track({
      title: 'Faburden for the Vigilant One',
      contexts: ['temple', 'castle'], weight: 1.2, room: 'chapel',
      bpm: 76, loopBars: Math.ceil(t / 16), gain: 1,
      layers: [
        { name: 'chant', inst: 'voiceTenor', vowel: 'a', gain: 0.3, pan: 0, humanize: 10, pattern: verses.flat() },
        { name: 'schola', inst: 'choirMen', vowel: 'a', gain: 0.24, pan: -0.15, humanize: 16, pattern: chantV },
        { name: 'bassus', inst: 'voiceBass', vowel: 'o', gain: 0.3, pan: -0.3, humanize: 10, pattern: bassus },
        { name: 'treble', inst: 'voiceAlto', vowel: 'a', gain: 0.27, pan: 0.3, humanize: 10, pattern: treble },
        { name: 'sackbut', inst: 'sackbut', gain: 0.15, pan: -0.4, humanize: 6, pattern: last.bass.map(([s, n, d, v]) => [s, n, d, v * 0.8]) },
        { name: 'organ', inst: 'positive', gain: 0.14, pan: 0, pattern: [...last.bass, ...last.treble].map(([s, n, d, v]) => [s, n, d, v * 0.7]) },
        { name: 'bell', inst: 'bells', gain: 0.18, pan: 0.2, pattern: [verseAt[1], verseAt[3], verseAt[5]].map((s) => [s, pitch('G2'), 16, 0.7]) },
      ],
    });
  }

  // ── RONDEAU OF THE MOONBRIDGE ────────────────────────────────────────────
  // Form:   Ars Nova rondeau in the manner of Machaut (mid 14th c.): two
  //         musical sections, A and B, laid out as the poem's rhyme scheme
  //         asks — A B a A a b A B — the capitals the refrain, the small
  //         letters new verses to the same music. A cantus over a tenor that
  //         is good two-part counterpoint alone, a contratenor crossing the
  //         tenor to fill the sonority, and the double-leading-tone cadence
  //         at both section ends (A-C#-F# to G-D-G; G-B-E to F-C-F).
  //         Refrains on recorder, verses sung; the repeated refrains in
  //         diminution, and the last B broken into hocket between recorder
  //         and gittern.
  // Mode:   F with B-flat; 6/8 (tempus imperfectum, prolatio maior), a
  //         measure = 12 sixteenths.
  // Voices: cantus (recorder / treble voice), tenor (vielle), contratenor
  //         (harp); gittern, tabor.
  // Source: original.
  // Plays:  castle courts, festivals and cities — Silverymoon's above all.
  {
    const M = 12, SEC = 6 * M;
    const A = {
      tenor: 'F3:12 | E3:6 D3:6 | F3:6 G3:6 | A3:6 Bb3:6 | G3:6 A3:6 | G3:10 r:2',
      contra: 'C4:6 F4:6 | C4:6 A3:6 | A3:6 Bb3:6 | C4:6 D4:6 | D4:6 C#4:6 | D4:10 r:2',
      cantus: 'F4:4 G4:2 A4:4 G4:1 A4:1 | G4:4 Bb4:2 A4:4 F4:2 | A4:4 C5:2 D5:4 C5:2 | C5:4 A4:2 Bb4:4 F4:2 | Bb4:4 A4:2 F#4:6 | G4:10 r:2',
      // Diminution: the same notes on every beat, the spaces between filled.
      dim: 'F4:2 E4:1 F4:1 G4:2 A4:2 Bb4:1 A4:1 G4:1 A4:1 | G4:2 A4:1 Bb4:1 C5:2 A4:2 G4:1 A4:1 F4:2 | ' +
        'A4:2 Bb4:1 C5:1 D5:2 D5:1 E5:1 D5:2 C5:2 | C5:2 Bb4:1 A4:1 G4:2 Bb4:2 A4:1 G4:1 F4:2 | Bb4:2 C5:1 Bb4:1 A4:2 F#4:4 E4:1 F#4:1 | G4:10 r:2',
    };
    const B = {
      tenor: 'A3:12 | Bb3:6 A3:6 | G3:6 F3:6 | D3:6 E3:6 | F3:6 G3:6 | F3:10 r:2',
      contra: 'E4:6 C4:6 | F4:12 | D4:6 A3:6 | A3:6 G3:6 | A3:6 B3:6 | C4:10 r:2',
      cantus: 'C5:4 D5:2 E5:4 C5:2 | D5:4 E5:2 C5:4 D5:2 | Bb4:4 C5:2 A4:4 C5:2 | F5:4 E5:2 C5:4 Bb4:2 | A4:4 C5:2 E5:6 | F5:10 r:2',
    };
    const ORDER = 'ABAAABAB';
    const o = (k, vol = 0.85) => ({ at: k * SEC, vol, weak: 0.82, beat: 6 });
    const sec = (part, k, vol) => line((ORDER[k] === 'A' ? A : B)[part], o(k, vol));
    const all = (part, vol) => [...ORDER].flatMap((_, k) => sec(part, k, vol));
    // Hocket: the tune cut into 2-step pieces passed back and forth; the
    // held final is left whole to the recorder.
    const split = (evs) => {
      const a = [], b = [];
      for (const [s, n, d, v] of evs) {
        if (d >= 8) { a.push([s, n, d, v]); continue; }
        for (let q = s; q < s + d; q += 2) ((q / 2) % 2 ? b : a).push([q, n, Math.min(1.5, s + d - q), v]);
      }
      return [a, b];
    };
    const [hockA, hockB] = split(sec('cantus', 7, 0.9));
    const tabor = [];
    for (const k of [3, 6, 7]) for (let b = 0; b < 6; b++) {
      const s = k * SEC + b * M;
      tabor.push([s, 'tabor', 1, 0.45], [s + 6, 'tabor', 1, 0.32], [s + 9, 'tabor', 1, 0.22]);
      if (k === 7) tabor.push([s, 'frame', 1, 0.4]);
    }

    tracks.moonbridgeRondeau = track({
      title: 'Rondeau of the Moonbridge',
      contexts: ['castle', 'festival', 'city'], weight: 1.2, room: 'hall',
      bpm: 84, loopBars: 8 * SEC / 16, gain: 0.95,
      layers: [
        { name: 'cantus', inst: 'recorder', gain: 0.26, pan: 0.2, humanize: 10, ornament: 'mordent',
          pattern: [...sec('cantus', 0), ...sec('cantus', 1), ...line(A.dim, o(3)), ...line(A.dim, o(6))] },
        { name: 'voice', inst: 'voiceTreble', vowel: 'a', gain: 0.3, pan: 0.15, humanize: 12,
          // A syllable on each beat, to the vowels of Machaut's rondeau Rose, liz.
          pattern: [2, 4, 5].flatMap((k) => words(sec('cantus', k), 'Ro-se liz prin-temps ver-du-re fleurs bau-me et tres dou-ce o-dour', 6)) },
        { name: 'hockA', inst: 'recorder', gain: 0.26, pan: 0.35, pattern: hockA },
        { name: 'hockB', inst: 'gittern', gain: 0.24, pan: -0.35, pattern: hockB },
        { name: 'tenor', inst: 'vielle', gain: 0.24, pan: -0.25, humanize: 12, pattern: all('tenor', 0.8) },
        { name: 'contra', inst: 'harpGothic', gain: 0.24, pan: 0.05, humanize: 10, pattern: all('contra', 0.75) },
        { name: 'tabor', wave: 'noise', gain: 0.2, pattern: tabor },
      ],
    });
  }

  // ── THE PILGRIMS' STAR (STELLA SPLENDENS) ────────────────────────────────
  // Form:   a virelai from the Llibre Vermell de Montserrat (1399), the song
  //         pilgrims danced in a ring at the shrine: refrain (A), two
  //         stanza lines on new music (b b), the refrain's music again (a),
  //         and the refrain — for two voices, the lower crossing the upper as
  //         Iberian two-part writing does. Sung first; then the refrain on
  //         recorder and vielle over a hurdy-gurdy drone, the stanza sung
  //         over the drone, and the last "a" by everyone, the men doubling
  //         the lower voice an octave down.
  // Mode:   D (first mode), B-flat and B-natural as the source has them;
  //         2/4, a measure = 8 sixteenths.
  // Voices: treble (upper voice), alto (lower voice), tenors (octave
  //         doubling); recorder, vielle, hurdy-gurdy, frame drum and tabor.
  // Source: Stella splendens in monte, Llibre Vermell de Montserrat, both
  //         voices, from Ali Corbin's abc transcription of the manuscript
  //         (abcnotation.com, alijc LlibreVermell 0004). Public domain.
  // Plays:  roads and pilgrimages (the open field), village festivals.
  {
    const refrainHead = 'A4:4 A4:2 G4:2 | A4:4 F4:4 | D4:4 F4:4 | G4:8 | Bb4:2 A4:2 F4:2 G4:2 | E4:4 D4:4 | F4:4 G4:4';
    const V1 = {
      A: `${refrainHead} | G4:2 F4:2 D4:4 | C4:8 | ${refrainHead} | G4:2 F4:2 D4:2 E4:1 C4:1 | D4:8`,
      b: 'D4:4 D4:4 | A4:4 B4:4 | D5:4 B4:4 | C5:2 A4:2 G4:4 | B4:4 C5:4 | A4:4 G4:2 F4:2 | F4:2 E4:2 D4:4',
    };
    const lowHead = 'D4:8 | D4:4 F4:4 | A4:4 D4:4 | C4:8 | F4:8 | G4:4 A4:4 | D4:4 C4:4';
    const V2 = {
      A: `${lowHead} | G4:4 A4:4 | C5:8 | ${lowHead} | F4:4 G4:4 | A4:8`,
      b: 'A4:8 | D4:8 | D4:4 G4:4 | F4:4 E4:4 | -:4 C4:4 | D4:4 F4:4 | G4:4 A4:4',
    };
    const RA = 144, RB = 56, STROPHE = 2 * RA + 2 * RB;
    const REFRAIN = 'Stel-la splen-dens in mon-te ut so-lis ra-di-um mi-ra-cu-lis ser-ra-to ex-au-di po-pu-lum';
    const STANZA = 'Con-cur-runt u-ni-ver-si gau-den-tes po-pu-li di-vi-tes et pau-pe-res gran-des et par-vu-li';
    // One strophe's section starts: A, b, b, a.
    const at = (k) => [0, RA, RA + RB, RA + 2 * RB].map((s) => s + k * STROPHE);
    const o = (s, vol = 0.85) => ({ at: s, vol, weak: 0.82, beat: 8 });
    const strophe = (V, k, secs, vol) => {
      const [a0, b1, b2, a3] = at(k);
      const src = { 0: [V.A, a0], 1: [V.b, b1], 2: [V.b, b2], 3: [V.A, a3] };
      // A syllable a crotchet: the refrain's own words, the stanza's for b.
      return secs.flatMap((i) => words(line(src[i][0], o(src[i][1], vol)), i === 1 || i === 2 ? STANZA : REFRAIN, 4));
    };
    const drone = [];
    for (let s = STROPHE; s < 2 * STROPHE; s += 64) {
      const len = Math.min(64, 2 * STROPHE - s);
      drone.push([s, pitch('D3'), len, 0.7], [s, pitch('A3'), len, 0.55]);
    }
    const drum = [];
    for (let s = 0; s < 2 * STROPHE; s += 8) {
      const inB = (s % STROPHE) >= RA && (s % STROPHE) < RA + 2 * RB;
      drum.push([s, 'frame', 1, inB ? 0.35 : 0.5]);
      if (!inB) drum.push([s + 4, 'tabor', 1, 0.3], [s + 6, 'tabor', 1, 0.2]);
    }

    const sungV1 = [...strophe(V1, 0, [0, 1, 2, 3]), ...strophe(V1, 1, [1, 2, 3])];

    tracks.pilgrimStella = track({
      title: "The Pilgrims' Star (Stella splendens)",
      contexts: ['road', 'travel', 'field', 'festival', 'village'], weight: 1.2, room: 'open',
      bpm: 104, loopBars: 2 * STROPHE / 16, gain: 1,
      layers: [
        { name: 'cantus', inst: 'voiceTreble', vowel: 'a', gain: 0.3, pan: 0.25, humanize: 12,
          pattern: sungV1 },
        { name: 'secunda', inst: 'voiceAlto', vowel: 'a', gain: 0.28, pan: -0.25, humanize: 12,
          pattern: underlay(sungV1, [...strophe(V2, 0, [0, 1, 2, 3]), ...strophe(V2, 1, [1, 2, 3])]) },
        { name: 'men', inst: 'voiceTenor', vowel: 'a', gain: 0.22, pan: -0.1, humanize: 14,
          pattern: underlay(sungV1, strophe(V2, 1, [3], 0.8).map(([s, n, d, v]) => [s, n - 12, d, v])) },
        { name: 'recorder', inst: 'recorder', gain: 0.62, pan: 0.4, humanize: 8, ornament: 'grace',
          pattern: [...strophe(V1, 0, [3], 0.75), ...strophe(V1, 1, [0, 3], 0.8)] },
        { name: 'vielle', inst: 'vielle', gain: 0.66, pan: -0.4, humanize: 10, pattern: strophe(V2, 1, [0, 3], 0.8) },
        { name: 'drone', inst: 'hurdygurdy', gain: 0.15, pan: 0, pattern: drone },
        { name: 'drum', wave: 'noise', gain: 0.2, pattern: drum },
      ],
    });
  }

  // The book as a whole, and each piece filed where music.js's groups already
  // sort the score, so a songbook can list them beside the older tracks.
  const groups = {
    sacred: Object.keys(tracks),
    menu: ['bindersMotet'],
    settlement: ['dawnOrganum', 'tyrConductus', 'helmFaburden', 'alustrielBallade', 'moonbridgeRondeau'],
    overworld: ['seluneGymel', 'pilgrimStella'],
    underground: ['doomguideDies'],
    combat: ['blackHandHocket'],
    sting: ['tempusConductus', 'dragonspearPlanctus'],
    mood: ['mysteriesChant', 'wayfireSong'],
  };
  return { tracks, groups };
}
