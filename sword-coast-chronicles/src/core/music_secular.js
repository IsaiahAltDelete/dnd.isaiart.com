// core/music_secular.js — secular dance and song polyphony (estampie, saltarello, caccia, rota, ductia, carole) for the score.
//
// Plain data: build(h) receives the helpers from music.js (so there is no import
// cycle) and returns { tracks, groups }. music.js merges the tracks into TRACKS
// and the groups into TRACK_GROUPS at load. Each track may carry
//   contexts: ['town', 'inn', ...]  — places/moods it may play in (see docs/OVERHAUL.md §Music)
//   weight:   number                — relative chance within a context rotation
// and uses the same layer format as every track in music.js. `title` is the
// piece's in-world name, for anything that lists the score (a songbook).
//
// This is the music of the street, the tavern and the field rather than the
// chapel: dances in puncta with open and closed endings, rounds and hunting
// canons, a Renaissance consort for the great houses. Where a real period piece
// is arranged (all of them written before 1600, so public domain), the header
// names it and the edition its notes were checked against; the rest are
// originals written in the forms and modes of their century. Every track also
// names the broad context the game asks for today (town, inn, field, battle...)
// beside the finer one it was written for (tavern, market, coast...), so it is
// heard before any map asks for the finer one.

export function build(h) {
  const { SPB } = h;

  // ── notation ──────────────────────────────────────────────────────────────
  //
  // Lines are written in ABC, the notation folk and early-music players already
  // trade tunes in, so an arranged tune can be checked against its edition by
  // eye and an original reads like a part book. abc() understands what these
  // pieces need: notes A-G a-g with , and ' octaves, ^ _ = accidentals that hold
  // to the bar line, lengths (2, 3/2, /, /2), rests z, ties -, broken rhythm
  // > <, chords [CEG], and dynamics !p! !mf! !f!. Key signatures come from the
  // key and mode ('F', 'Gdor', 'Emix', 'Am'); `unit` is how many 16th-note steps
  // the tune's L: length is (L:1/8 at 2 steps is the usual). Everything returns
  // [step, midi, dur, vol] with a `.len` in steps, so lines chain with seq().

  const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARPS_OF = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4 };
  const MODE_OFFSET = { '': 0, maj: 0, ion: 0, m: -3, min: -3, aeo: -3, dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5 };
  const DYN = { pp: 0.45, p: 0.6, mp: 0.75, mf: 0.88, f: 1, ff: 1.12 };

  function keySig(key) {
    const m = /^([A-G][#b]?)(.*)$/.exec(key);
    const n = m ? (SHARPS_OF[m[1]] ?? NaN) + (MODE_OFFSET[m[2].toLowerCase().slice(0, 3)] ?? NaN) : NaN;
    if (!Number.isFinite(n)) throw new Error(`music_secular: unknown key "${key}"`);
    const acc = {};
    for (const L of n > 0 ? 'FCGDAEB'.slice(0, n) : 'BEADGCF'.slice(0, -n)) acc[L] = n > 0 ? 1 : -1;
    return acc;
  }

  const withLen = (evs, len) => Object.assign(evs, { len });

  /**
   * One ABC line -> events. `beat` (steps) gives notes that fall on it full
   * volume and the rest `weak`, which is all the metrical accent a dance needs;
   * `shift` transposes by semitones after the key is applied.
   */
  function abc(src, { key = 'C', unit = 2, vol = 0.85, weak = 0.82, beat = 0, shift = 0 } = {}) {
    const ks = keySig(key);
    const out = [];
    let i = 0, t = 0, bar = {}, dyn = 1, tie = false, next = 1;
    const s = src;
    const num = () => {
      let j = i;
      while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
      const v = j > i ? Number(s.slice(i, j)) : null;
      i = j;
      return v;
    };
    const length = () => {
      const n = num() ?? 1;
      let d = 1;
      while (s[i] === '/') { i++; d *= num() ?? 2; }
      return unit * n / d;
    };
    const pitch = () => {
      let a = null;
      while (s[i] === '^' || s[i] === '_' || s[i] === '=') {
        a = s[i] === '=' ? 0 : (a ?? 0) + (s[i] === '^' ? 1 : -1);
        i++;
      }
      const c = s[i++], L = c.toUpperCase();
      let oct = c === L ? 4 : 5;
      while (s[i] === "'" || s[i] === ',') { oct += s[i] === "'" ? 1 : -1; i++; }
      const k = L + oct;
      if (a != null) bar[k] = a;
      return (oct + 1) * 12 + LETTER[L] + (bar[k] ?? ks[L] ?? 0) + shift;
    };
    const place = (notes, d) => {
      const v = vol * dyn * (beat && t % beat ? weak : 1);
      const last = out[out.length - 1];
      if (tie && notes.length === 1 && last && last[1] === notes[0] && last[0] + last[2] === t) last[2] += d;
      else for (const m of notes) out.push([t, m, d, v]);
      tie = false;
      t += d;
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '|') { bar = {}; i++; }
      else if (c === '!') { const j = s.indexOf('!', i + 1); dyn = DYN[s.slice(i + 1, j)] ?? dyn; i = j + 1; }
      else if (c === '-') { tie = true; i++; }
      else if (c === '>' || c === '<') {
        // Broken rhythm: the note before is dotted (>) or clipped (<), the next pays for it.
        const f = c === '>' ? 0.5 : -0.5, last = out[out.length - 1];
        if (last) { const d = last[2] * f; for (const e of out) if (e[0] === last[0]) e[2] += d; t += d; next = 1 - f; }
        i++;
      } else if (c === 'z' || c === 'x') { i++; t += length() * next; next = 1; tie = false; }
      else if (c === '[') {
        i++;
        const notes = [];
        let d = null;
        while (i < s.length && s[i] !== ']') {
          if (/[A-Ga-g^_=]/.test(s[i])) { notes.push(pitch()); const l = length(); d ??= l; } else i++;
        }
        i++;
        const mult = length() / unit;
        place(notes, (d ?? unit) * mult * next); next = 1;
      } else if (/[A-Ga-g^_=]/.test(c)) { const m = pitch(); place([m], length() * next); next = 1; }
      else i++;   // spaces, repeat colons, slurs: layout only
    }
    return withLen(out, t);
  }

  /** Copy events with a change: dt steps later, k semitones up, volume scaled. */
  const move = (evs, dt) => withLen(evs.map((e) => { const c = e.slice(); c[0] += dt; return c; }), evs.len);
  const up = (evs, k) => withLen(evs.map((e) => { const c = e.slice(); c[1] += k; return c; }), evs.len);
  const loud = (evs, f) => withLen(evs.map((e) => { const c = e.slice(); c[3] *= f; return c; }), evs.len);

  /** Lines one after another. A number is a rest of that many steps. */
  function seq(...parts) {
    const out = [];
    let t = 0;
    for (const p of parts) {
      if (typeof p === 'number') { t += p; continue; }
      for (const e of p) { const c = e.slice(); c[0] += t; out.push(c); }
      t += p.len;
    }
    return withLen(out, t);
  }

  /** Several lines sounding at once (one layer playing chords, or a doubled part). */
  const stack = (...parts) => withLen(parts.flat(), Math.max(...parts.map((p) => p.len)));

  /** A line repeated n times. */
  const times = (evs, n) => seq(...Array.from({ length: n }, () => evs));

  /**
   * Fold a line onto a loop of `total` steps. A round entered at a delay is the
   * same melody rotated, so wrapping it keeps every voice going for ever with no
   * seam: the note that starts before the loop's end rings into the next pass.
   */
  const wrap = (evs, total) => withLen(evs.map((e) => { const c = e.slice(); c[0] = ((c[0] % total) + total) % total; return c; })
    .sort((a, b) => a[0] - b[0]), total);

  /** Sung vowels from the words, one per note ('u e i i u ...'), so a voice line says its text. */
  function sing(evs, vowels) {
    const vs = vowels.trim().split(/\s+/);
    return withLen(evs.map((e, i) => { const c = e.slice(0, 4); c[4] = vs[i % vs.length]; return c; }), evs.len);
  }

  /**
   * Percussion from a drum grid: one character per 16th step, '.' a rest, and
   * each other character looked up in `kit` as [drumId, vol]. Bars are strings
   * (spaces and '|' are ignored), so a rhythm reads as it sounds.
   */
  function drums(kit, ...bars) {
    const out = [];
    let t = 0;
    for (const bar of bars) for (const ch of bar) {
      if (ch === ' ' || ch === '|') continue;
      const k = kit[ch];
      if (k) out.push([t, k[0], 1, k[1]]);
      t++;
    }
    return withLen(out, t);
  }

  /** A held note (a drone under a moving texture, or a pedal). */
  const hold = (midi, len, vol = 0.7) => withLen([[0, midi, len, vol]], len);

  /** Copy a track's room onto its layers, as the sacred book does, so either level may read it. */
  function track(def) {
    if (def.room) for (const L of def.layers) L.room ??= def.room;
    return def;
  }

  /**
   * An estampie's puncta for one voice. Each body is played twice, first with
   * the open ending (ouvert), then with the closed one (clos). `ouvert` and
   * `clos` are one string shared by every punctum, as in the estampie royale,
   * or an array with one per punctum.
   */
  function puncta(bodies, ouvert, clos, o) {
    const pick = (x, i) => (Array.isArray(x) ? x[i] : x);
    return seq(...bodies.flatMap((b, i) => [abc(b, o), abc(pick(ouvert, i), o), abc(b, o), abc(pick(clos, i), o)]));
  }

  /**
   * A plucked accompaniment from a bass line of chord roots: on every beat the
   * root an octave up, then its fifth, then its octave, the way a gittern
   * player fills out a round. Root, fifth and octave sit under any tune whose
   * strong beats are chord tones, so it can never clash with the singers.
   */
  function rolls(bass, beat, lift = 12, q = Math.max(1, Math.round(beat / 3))) {
    const out = [], ring = [[0, 0.9], [7, 0.7], [12, 0.75]];
    for (const [s, m, d, v] of bass) {
      for (let t = s; t < s + d; t += beat) {
        ring.forEach(([iv, f], k) => { const u = t + k * q; if (u < s + d) out.push([u, m + lift + iv, Math.min(q, s + d - u), v * f]); });
      }
    }
    return withLen(out, bass.len);
  }

  /**
   * Transpose by `n` steps of the key's scale rather than by semitones: the
   * way a sequence or an imitation at the fifth moves, keeping to the mode.
   */
  function dia(evs, n, key) {
    const ks = keySig(key);
    const pcs = 'CDEFGAB'.split('').map((L) => (LETTER[L] + (ks[L] ?? 0) + 12) % 12);
    return withLen(evs.map((e) => {
      const c = e.slice(), i = pcs.indexOf(((c[1] % 12) + 12) % 12);
      if (i < 0) return c;                                            // a note outside the mode keeps its place
      const j = i + n, oct = Math.floor(c[1] / 12) + Math.floor(j / 7);
      c[1] = oct * 12 + pcs[((j % 7) + 7) % 7];
      return c;
    }), evs.len);
  }

  /** Split a line between two players note by note: the hocket, the "hiccup" of the thirteenth century. */
  const hocket = (evs) => [0, 1].map((r) => withLen(evs.filter((_, i) => i % 2 === r), evs.len));

  /**
   * Re-time a slow duple line as its quick triple afterdance, the way La Rotta
   * follows the Lamento di Tristano in BL Add. 29987: every pair of beats
   * (`beat` steps each) becomes a long-short pair of `4:2` sixteenths, so a
   * bar of four beats becomes a bar of 6/8. Onsets must fall on half-beats.
   */
  function rotta(evs, beat) {
    const f = (t) => { const p = Math.floor(t / (2 * beat)), r = t - p * 2 * beat;
      return p * 6 + (r < beat ? (4 * r) / beat : 4 + (2 * (r - beat)) / beat); };
    return withLen(evs.map((e) => { const c = e.slice(); c[0] = f(e[0]); c[2] = f(e[0] + e[2]) - c[0]; return c; }), f(evs.len));
  }

  const tracks = {};

  // ── THE YAWNING PORTAL ROTA ─────────────────────────────────────────────────
  // Form:   rota (a round for four) over a two-voice pes — the oldest six-part
  //         polyphony there is. Arranged: "Sumer is icumen in", Reading Abbey,
  //         c.1250 (BL Harley 978, f.11v). Melody and pes checked against the
  //         Nordberg (musicaviva) and Hardy transcriptions, which agree note for
  //         note; the pes is the two-bar ground as those editions give it.
  // Mode:   F (Lydian with the B-flat, i.e. our major), 6/8.
  // Voices: rota I tenor (singing the Middle English vowels, an octave down),
  //         rota II recorder, rota III alto (sung), rota IV vielle, entries two
  //         bars apart; pes I bass voice ("sing cuccu nu"), pes II viol with the
  //         lute marking the ground, a frame drum on the dotted quarters.
  // Plays:  taverns and inns — Durnan's cellar in Waterdeep, a common room
  //         anywhere on the Coast when the tankards come round.
  {
    const E8 = 2, BAR = 12;                  // an eighth is two steps; a 6/8 bar is twelve
    const rota = abc(
      'f2 e d2 e|f2 f edc|A2 A B2 G|A3 z3|F2 A G2 B|A2 A G2 F|A2 c d2 d|c3 z3|' +
      'f3 d3|f3 z3|c2 A B2 G|A2 c B2 A|F2 A G2 E|F3 z3|A2 A G2 B|c2 c d2 e|' +
      'f2 e d2 e|f3 z3|c3 d3|c3 B2 A|F2 A B2 G|A3 B2 c|A2 c G2 E|F3 z3|',
      { key: 'F', unit: E8, beat: 6, vol: 0.85, weak: 0.78 });
    // "Sumer is icumen in, lhude sing cuccu! Groweth sed and bloweth med..."
    const words = 'u e i i  u e i i i  u e i u  u  o e e a  o e e a  i e u e  u  i u  u  a e e e  a e o u  ' +
      'a e a e  u  u u e e  u e e e  u i i u  u  u u  u u e  i e u u  u u e  i u a e  u';
    const LOOP = rota.len;                   // 24 bars = 288 steps
    const entry = (k, semis = 0) => wrap(move(up(rota, semis), 2 * BAR * k), LOOP);
    const pesI = times(abc('F,3 G,3|F,3 G,2 A,|', { key: 'F', unit: E8, vol: 0.8 }), LOOP / (2 * BAR));
    const pesII = times(abc('C3 B,3|C3 z3|', { key: 'F', unit: E8, vol: 0.78 }), LOOP / (2 * BAR));
    const lute = times(abc('[F,C]3 [G,B,]3|[F,C]3 G,2 A,|', { key: 'F', unit: E8, vol: 0.62 }), LOOP / (2 * BAR));
    const drum = times(drums({ F: ['frame', 0.55], f: ['frame', 0.28], t: ['tabor', 0.22] },
      'F.....f.....', 'F.....f...t.'), LOOP / (2 * BAR));

    tracks.yawningPortalRota = track({
      title: 'The Yawning Portal Rota (Sumer is icumen in)',
      contexts: ['tavern', 'inn', 'festival'], weight: 1.4, room: 'tavern',
      bpm: 114, loopBars: LOOP / SPB, gain: 1,
      layers: [
        { name: 'rota1', inst: 'voiceTenor', gain: 0.37, pan: -0.15, humanize: 14, pattern: sing(entry(0, -12), words) },
        { name: 'rota2', inst: 'recorder', gain: 0.38, pan: 0.35, humanize: 10, ornament: 'grace', pattern: entry(1) },
        { name: 'rota3', inst: 'voiceAlto', gain: 0.22, pan: 0.15, humanize: 14, pattern: sing(entry(2), words) },
        { name: 'rota4', inst: 'vielle', gain: 0.9, pan: -0.4, humanize: 10, pattern: entry(3) },
        { name: 'pes1', inst: 'voiceBass', vowel: 'u', gain: 0.26, pan: 0.05, humanize: 12,
          pattern: sing(pesI, 'i u u u i') },
        { name: 'pes2', inst: 'viol', gain: 0.55, pan: -0.05, humanize: 8, pattern: pesII },
        { name: 'lute', inst: 'lutePlucked', gain: 0.31, pan: 0.25, humanize: 6, pattern: lute },
        { name: 'drum', wave: 'noise', gain: 0.4, pan: 0, pattern: drum },
      ],
    });
  }

  // ── THE ELFSONG TOURDION ───────────────────────────────────────────────────
  // Form:   tourdion — the quick triple-time afterdance to a basse danse,
  //         AABB, sung everywhere as a drinking song ("Quand je bois du vin
  //         clairet, ami tout tourne..."). Arranged: Pierre Attaingnant, Paris,
  //         1530; four voices checked against G. Gonzato's edition (abcplus),
  //         whose chords sound clean on every strong beat. Transposed down a tone.
  // Mode:   D Dorian (B-natural in the tune, B-flat on the second strain's
  //         climb), 3/2.
  // Voices: superius recorder (the repeat taken by the cornett with divisions),
  //         altus vielle, tenor gittern, bassus dulcian; tabor and tambourine
  //         in the galliard's five-step rhythm.
  // Plays:  taverns and inns — the Elfsong in Baldur's Gate, where the ghost
  //         sings over it on a good night; festivals.
  {
    const Q = 2;                                            // a quarter is two steps; a 3/2 bar is twelve
    const o = { key: 'Bm', unit: Q, shift: -2, beat: 4, weak: 0.8 };
    const S = {
      A: abc('EFGAGF|E3FGA|BAGGAF|G2FED2|EFGAGF|E2G2F2|E4D2|E6|', o),
      B: abc('B3AB=c|B4B2|d=cBAGF|G3FE2|B3AB=c|B2AGF2|E4D2|E6|', o),
      // The repeat in quavers, the way a cornettist decorates a tune he knows.
      A2: abc('E/F/G/A/ GAGF|E2 G/F/E/F/ G A/B/|B/=c/B/A/ GG/A/ A/B/A/F/|G2FED2|' +
        'E/F/G/A/ B/A/G/F/ G/A/G/F/|E2G2 A/G/F/E/|E4D2|E6|', o),
      B2: abc('B3AB=c|d/=c/B/A/ B2 B/=c/d/B/|d=cBAGF|G/A/G/F/ E2 E2|' +
        'B/=c/B/A/ B=c d2|B2 A/B/A/G/ F2|E/F/G/F/ E2D2|E6|', o),
    };
    const A = {
      A: abc('B,4B,2|E4E2|D4E2|E2A4|G4E2|B,A,B,CD2|B,2B,4|B,6|', o),
      B: abc('G4G2|G4G2|F4F2|E4E2|D4D2|D4D2|B,2B,4|B,6|', o),
    };
    const T = {   // written for a tenor that sounds an octave under the treble clef
      A: abc('G4E2|B4B2|B2B2=c2|B4A2|B4B2|G4A2|G2FEF2|E6|', { ...o, shift: -14 }),
      B: abc('e4e2|d4d2|d4d2|B4B2|B4B2|B4A2|G2F4|E6|', { ...o, shift: -14 }),
    };
    const B = {   // and a bassus written two octaves up
      A: abc('e4e2|e4e2|g2b2a2|e2f4|e4e2|e4d2|e2B4|e6|', { ...o, shift: -26 }),
      B: abc('e4e2|g4g2|d4d2|e4e2|g4g2|g4d2|e2B4|e6|', { ...o, shift: -26 }),
    };
    const LEN = 4 * S.A.len;                                // AABB, 32 bars
    const tabor = drums({ T: ['tabor', 0.6], t: ['tabor', 0.3], j: ['tambourine', 0.3], J: ['tambourine', 0.5] },
      'T...t.t.T...', 'T...t.t.T.j.', 'T...t.t.T...', 'T.j.t.t.J...');
    const tabor2 = drums({ T: ['tabor', 0.65], t: ['tabor', 0.32], j: ['tambourine', 0.34], J: ['tambourine', 0.55] },
      'T.j.t.t.T.j.', 'T.j.t.t.J.j.', 'T.j.t.t.T.j.', 'T.j.tjt.J...');

    tracks.elfsongTourdion = track({
      title: 'The Elfsong Tourdion (Quand je bois du vin clairet)',
      contexts: ['tavern', 'festival'], weight: 1.4, room: 'tavern',
      bpm: 150, loopBars: LEN / SPB, gain: 1,
      layers: [
        { name: 'superius', inst: 'recorder', gain: 0.42, pan: 0.3, humanize: 8, ornament: 'grace',
          pattern: seq(S.A, S.A.len, S.B, S.B.len) },
        { name: 'divisions', inst: 'cornett', gain: 0.32, pan: 0.3, humanize: 8,
          pattern: seq(S.A.len, S.A2, S.B.len, S.B2) },
        { name: 'altus', inst: 'vielle', gain: 0.5, pan: -0.3, humanize: 10, pattern: seq(A.A, A.A, A.B, A.B) },
        { name: 'tenor', inst: 'gittern', gain: 0.66, pan: -0.1, humanize: 6, pattern: seq(T.A, T.A, T.B, T.B) },
        { name: 'bassus', inst: 'dulcian', gain: 0.25, pan: 0.1, humanize: 6, pattern: seq(B.A, B.A, B.B, B.B) },
        { name: 'drum', wave: 'noise', gain: 1, pan: 0, pattern: seq(times(tabor, 2), times(tabor2, 2), times(tabor, 2), times(tabor2, 2)) },
      ],
    });
  }

  // ── THE PAVANE OF THE JEWEL OF THE NORTH ───────────────────────────────────
  // Form:   pavane, AABB, the stately processional of the great houses, each
  //         strain repeated with the cornett's divisions (improvised diminution,
  //         written out). Arranged: "Belle qui tiens ma vie", Thoinot Arbeau,
  //         Orchesographie (Langres, 1589), four voices. Checked against
  //         N. Graner's edition of the print (superius, contratenor, tenor,
  //         bassus as named there) and Nordberg's (musicaviva): the two agree
  //         except the tenor's bars 6-7, where Graner's reading is kept. The
  //         tabor plays Arbeau's pavane beat, long-short-short.
  // Mode:   G Dorian, G minor to the ear, the last chord of the first B strain
  //         with Arbeau's raised third.
  // Voices: cornett (superius), vielle (contratenor), sackbut (tenor), dulcian
  //         (bassus), the lute doubling tenor and bass, tabor.
  // Plays:  cities and castles — the Hall of Justice and the Palace of the Lord
  //         Protector in Neverwinter; any great house of the Coast.
  {
    const o = { key: 'Gdor', unit: 8, beat: 16, weak: 0.9 };          // a minim is eight steps, a bar sixteen
    const d = { key: 'Gdor', unit: 2, beat: 8, weak: 0.84 };          // divisions in quavers
    const S = {
      A: abc('G2|G^F|GA|B2|Bd|cB|BA|B2|', o),
      B: abc('B2|AA|GG|^F2|D2|E/F/G|G^F|G2|', o),
      A2: abc('G4 B2A^F|G2AG ^F2GA|G2BA A2cB|B2AG Bcd B|B2AB d2cd|c2BA B2cd|B2AG A2GA|B8|', d),
      B2: abc('B2cd d2BA|A2BA A2GF|G2AB G2AG|^F2GA ^F2ED|D2FD F2GA|EFGF G2AB|G2AG ^F2E^F|G8|', d),
    };
    const alto = seq(abc('D2|DD|DF|F2|FF|EF|GF|F2|', o), abc('D2|DD|DF|F2|FF|EF|GF|F2|', o),
      abc('F2|FF|D_E|D2|F2|CD|DD|=B,2|', o), abc('B,2|FF|D_E|D2|F2|ED|DD|D2|', o));
    const tenA = abc('B,2|B,A,|B,C|D2|DB,|G,D|CC|D2|', o), tenB = abc('D2|CD|B,C|A,2|B,2|G,B,|A,A,|G,2|', o);
    const basA = abc('G,2|G,D,|G,F,|B,,2|B,,B,,|C,D,|_E,F,|B,,2|', o);
    const tenor = seq(tenA, tenA, tenB, tenB);
    const bass = seq(basA, basA, abc('B,,2|F,D,|G,C,|D,2|B,,2|C,G,,|D,D,|G,,2|', o), abc('G,2|F,D,|G,C,|D,2|B,,2|C,G,,|D,D,|G,,2|', o));
    const LEN = tenor.len;
    const beatPav = drums({ T: ['tabor', 0.6], t: ['tabor', 0.34] }, 'T.......t...t...');

    tracks.jewelPavane = track({
      title: 'Pavane of the Jewel of the North (Belle qui tiens ma vie)',
      contexts: ['city', 'castle'], weight: 1.3, room: 'hall',
      bpm: 128, loopBars: LEN / SPB, gain: 1,
      layers: [
        { name: 'superius', inst: 'cornett', gain: 0.3, pan: 0.25, humanize: 10, ornament: 'mordent', ornamentMin: 8,
          pattern: seq(S.A, S.A2, S.B, S.B2) },
        { name: 'contratenor', inst: 'vielle', gain: 0.64, pan: -0.3, humanize: 10, pattern: alto },
        { name: 'tenor', inst: 'sackbut', gain: 0.24, pan: 0.05, humanize: 8, pattern: tenor },
        { name: 'bassus', inst: 'dulcian', gain: 0.26, pan: -0.1, humanize: 8, pattern: bass },
        { name: 'lute', inst: 'lutePlucked', gain: 0.36, pan: 0.35, humanize: 6, pattern: loud(stack(tenor, up(bass, 12)), 0.7) },
        { name: 'tabor', wave: 'noise', gain: 1.4, pan: 0, pattern: times(beatPav, LEN / beatPav.len) },
      ],
    });
  }

  // ── THE CALISHITE MOURISQUE ────────────────────────────────────────────────
  // Form:   mourisque (basse danse), AABB, the "Moorish" dance of the loud
  //         band. Arranged: Tielman Susato, Danserye (Antwerp, 1551) no. 5,
  //         four voices, checked against Nordberg's edition (musicaviva). The
  //         second B-strain bar's contratenor E is read as D, as it is in the
  //         strain's repeat (the E sounds a ninth against the bass there).
  //         Superius and contratenor sound an octave above that edition.
  // Mode:   C (Ionian — the dance tunes had it long before the theorists did).
  // Voices: alto shawm, cornett, sackbut, dulcian; frame drum, nakers and
  //         tambourine in a southern dum-tek rhythm, busier each strain.
  // Plays:  Baldur's Gate by the Gray Harbor, where the Calishite traders tie
  //         up; markets and harbour towns.
  {
    const o = { key: 'C', unit: 4, beat: 8, weak: 0.86 };             // a minim is four steps; 4/2 is sixteen
    const hi = { ...o, shift: 12 };
    const V1 = seq(...[1, 2].map(() => abc('E/F/GGG|G3F|ECCD|B,2G,2|E/F/GGG|G3F|ECCD|G,2G,2|', hi)),
      ...[1, 2].map(() => abc('zEEC|CDEC|FDEC|CDB,2|G,EEC|CDEC|FDEC|CDG,2|', hi)));
    const V2 = seq(...[1, 2].map(() => abc('C/A,/CCC|C3A,|CA,A,A,|G,2B,2|C/A,/CCC|C3A,|CA,A,B,|C2C2|', hi)),
      ...[1, 2].map(() => abc('zE,G,A,|A,D,G,C,|A,B,CC,|E,D,D,2|D,E,E,A,|A,D,G,C,|A,B,CG,|A,G,E,2|', hi)));
    const V3 = seq(...[1, 2].map(() => abc('G,/F,/E,E,E,|E,3F,|C,E,E,F,|D,2D,G,|G,/F,/E,E,E,|E,3F,|C,>D,E,/C,/G,|E,2E,2|', o)),
      ...[1, 2].map(() => abc('zG,E,E,|F,F,E,A,|F,G,E,E,|A,F,G,2|G,G,E,E,|F,F,E,A,|F,G,E,E,|E,D,C,2|', o)));
    const V4 = seq(...[1, 2].map(() => abc('C,/D,/C,C,C,|C,3D,|A,,A,,A,,D,|G,,2G,,2|C,/D,/C,C,C,|C,3D,|A,,A,,A,,G,,|C,2C,2|', o)),
      ...[1, 2].map(() => abc('zC,C,A,,|A,,B,,C,A,,|D,G,,C,C,|A,,D,G,,2|G,,C,C,A,,|A,,B,,C,A,,|D,G,,C,C,|A,,B,,C,2|', o)));
    const kit = { D: ['frame', 0.62], d: ['frame', 0.34], N: ['nakers', 0.5], n: ['nakersHi', 0.34],
      J: ['tambourine', 0.5], j: ['tambourine', 0.26] };
    const strain = (...bars) => times(drums(kit, ...bars), 8 / bars.length);
    const perc = seq(
      strain('D.d...d.D...d...'),
      strain('D.n...n.D.n.n...', 'D.n...n.D.n.nnNn'),
      strain('D.n.j.n.D.j.n.j.', 'D.n.j.n.D.j.n.jJ'),
      strain('D.nJj.nJD.jJn.jJ', 'D.nJj.nJD.nnNnJJ'));

    tracks.calishiteMourisque = track({
      title: 'The Calishite Mourisque (Susato, La Mourisque)',
      contexts: ['market', 'coast', 'city'], weight: 1.2, room: 'open',
      bpm: 116, loopBars: V1.len / SPB, gain: 1,
      layers: [
        { name: 'superius', inst: 'shawmAlto', gain: 0.43, pan: 0.2, humanize: 8, ornament: 'grace', pattern: V1 },
        { name: 'contratenor', inst: 'cornett', gain: 0.2, pan: -0.25, humanize: 8, pattern: V2 },
        { name: 'tenor', inst: 'sackbut', gain: 0.22, pan: 0.3, humanize: 8, pattern: V3 },
        { name: 'bassus', inst: 'dulcian', gain: 0.25, pan: -0.1, humanize: 6, pattern: V4 },
        { name: 'drums', wave: 'noise', gain: 0.5, pan: 0.05, pattern: perc },
      ],
    });
  }

  // ── THE ESTAMPIE OF DRAWN STEEL ────────────────────────────────────────────
  // Form:   estampie in three puncta, each played twice, first with the open
  //         ending (ouvert, on the fifth) and then the closed one (clos, home on
  //         D) that every punctum shares — the shape of the Robertsbridge and
  //         Chansonnier du Roi estampies. The third punctum runs in quavers and
  //         the tenor shawm takes it up in imitation a bar behind, at the octave.
  //         Original.
  // Mode:   D Dorian, 6/8, first rhythmic mode (long-short) in the first two puncta.
  // Voices: alto shawm (cantus), tenor shawm (counter-line in thirds and sixths,
  //         then canon), sackbut (the ground, on the dotted beats); nakers,
  //         tabor and a war drum on each punctum's first bar.
  // Plays:  battle.
  {
    const o = { key: 'Ddor', unit: 2, beat: 6, weak: 0.8 };
    const P = [
      { c: 'd2 d c2 d|e2 f e2 d|c2 A B2 c|d3 A3|', t: 'F2 G A2 G|G2 A c2 B|A2 E G2 A|A3 F3|', b: 'D,3 A,,3|C,3 A,,3|A,,3 G,,3|D,3 F,3|' },
      { c: "a2 g f2 e|f2 g a2 f|g2 f e2 d|e3 c3|", t: 'c2 B A2 G|c3 F3|E2 G c2 B|A2 G A3|', b: 'F,3 D,3|A,,3 D,3|C,3 A,,3|A,,3 F,,3|' },
      { c: 'dcd ede|fef gfe|dcB cBA|d3 A3|', t: 'A,3 G,3|DCD EDE|FEF GFE|DCB, CB,A,|', b: 'D,3 C,3|D,3 E,3|D,3 C,3|D,3 A,,3|' },
    ];
    const OUV = { c: 'f2 e d2 c|e3 z3|', t: 'A2 G B2 A|A3 z3|', b: 'D,3 G,,3|A,,3 z3|' };
    const CLO = { c: 'e2 d c2 A|d3 z3|', t: 'G2 F E2 G|A3 z3|', b: 'C,3 A,,3|D,3 z3|' };
    const part = (v) => seq(...P.flatMap((p) => [abc(p[v], o), abc(OUV[v], o), abc(p[v], o), abc(CLO[v], o)]));
    const kit = { W: ['wardrum', 0.8], N: ['nakers', 0.55], n: ['nakersHi', 0.38], T: ['tabor', 0.5], t: ['tabor', 0.26] };
    const groove = 'N.n.n.N.n.nn', fill = 'NnNnNnN.nnNN';
    const naker = seq(...P.flatMap(() => [0, 1].flatMap(() => [drums(kit, groove, groove, groove, groove, groove, fill)])));
    const tabor = seq(...P.flatMap(() => [0, 1].map(() => drums(kit, 'W.....T.....', 'T.....T...t.', 'T.....T.....', 'T.....T...t.', 'T.....T.....', 'T..T..T.....'))));

    tracks.drawnSteelEstampie = track({
      title: 'The Estampie of Drawn Steel',
      contexts: ['battle'], intensity: 2, weight: 1.3, room: 'open',
      bpm: 168, loopBars: naker.len / SPB, gain: 1,
      layers: [
        { name: 'cantus', inst: 'shawmAlto', gain: 0.45, pan: 0.2, humanize: 6, pattern: part('c') },
        { name: 'tenor', inst: 'shawmTenor', gain: 0.34, pan: -0.25, humanize: 6, pattern: part('t') },
        { name: 'ground', inst: 'sackbut', gain: 0.17, pan: 0, humanize: 5, pattern: part('b') },
        { name: 'nakers', wave: 'noise', gain: 0.6, pan: 0.15, pattern: naker },
        { name: 'tabor', wave: 'noise', gain: 0.75, pan: -0.1, pattern: tabor },
      ],
    });
  }

  // ── THE PHANDALIN MARKET ESTAMPIE ──────────────────────────────────────────
  // Form:   estampie royale: three puncta, each played twice, first with the
  //         open ending (ouvert, a half close on D), then the closed one (clos,
  //         a double-leading-tone cadence home to G). Both endings are shared by
  //         every punctum, as in the Chansonnier du Roi estampies, so the ear
  //         learns them and the dancers know where they are. The third punctum
  //         breaks into running quavers over the same frame. Original.
  // Mode:   G Mixolydian (F natural; F sharp and C sharp only as ficta at the
  //         clos), 3/4.
  // Voices: recorder (cantus), vielle (contratenor, crossing above and below
  //         the cantus as a fourteenth-century contratenor does), citole
  //         (tenor); tabor throughout, the tambourine joining for punctum III.
  // Plays:  Phandalin's market square by Barthen's Provisions, and any small
  //         town or village of the Sword Coast by day.
  {
    const o = { key: 'Gmix', unit: 4, beat: 12, weak: 0.84 };        // a crotchet is four steps, a 3/4 bar twelve
    const cantus = puncta(['d2 e/d/|cBA|B/c/ dB|A3|', 'g2 f/e/|def|e/d/ cd|c3|',
      'd/e/d/c/B/c/|e/f/g/f/e/d/|c/d/e/c/d/B/|c/B/A/B/c|'], 'BAG|A3|', 'AG^F|G3|', o);
    const contra = puncta(['B2c|CDA,|DGd|c3|', 'B2A|G2F|G2B|e3|', 'B,2D|G3|E2B,|A3|'], 'dcB|d3|', 'cB^c|d3|', o);
    const tenor = puncta(['G,2C|A,G,F,|G,B,D|C3|', 'G,2D|B,CD|CEG,|A,3|', 'G,3|CEC|A,CG,|F,3|'],
      'G,A,B,|D3|', 'F,G,A,|G,3|', o);
    const kit = { T: ['tabor', 0.6], t: ['tabor', 0.3], J: ['tambourine', 0.48], j: ['tambourine', 0.26] };
    const pass = (g, f) => drums(kit, g, g, g, g, g, f);          // a body and its ending
    const perc = seq(times(pass('T...t...t...', 'T...t.t.T...'), 2), times(pass('T...t.t.t...', 'T.t.t.t.T...'), 2),
      times(pass('T.j.t.j.t.jJ', 'T.jJt.jJT...'), 2));

    tracks.phandalinEstampie = track({
      title: 'The Phandalin Market Estampie',
      contexts: ['town', 'market', 'village'], weight: 1.3, room: 'open',
      bpm: 144, loopBars: cantus.len / SPB, gain: 1,
      layers: [
        { name: 'cantus', inst: 'recorder', gain: 0.48, pan: 0.25, humanize: 8, ornament: 'grace', pattern: cantus },
        { name: 'contratenor', inst: 'vielle', gain: 0.55, pan: -0.3, humanize: 10, pattern: contra },
        { name: 'tenor', inst: 'citole', gain: 0.5, pan: 0, humanize: 6, pattern: tenor },
        { name: 'drum', wave: 'noise', gain: 1.2, pan: 0.1, pattern: perc },
      ],
    });
  }

  // ── THE BRANLES OF GREENGRASS ──────────────────────────────────────────────
  // Form:   a suite of branles, danced in a ring as Arbeau's Orchesographie
  //         (1589) describes them: a branle double in duple time (two steps to
  //         the left, two to the right), then a branle gay in quick triple time,
  //         each AABB. Four-part homophony with passing motion in the inner
  //         voices, the way Attaingnant's and Susato's prints set a dance tune.
  //         Original.
  // Mode:   G (Ionian), 4/4 then 6/8.
  // Voices: alto shawm (superius), crumhorn (altus), sackbut (tenor), dulcian
  //         (bassus): the loud band for the green. Tabor and tambourine, and
  //         handbells rung on the last chord of each B strain.
  // Plays:  festivals (Greengrass, Midsummer, Highharvestide), market squares
  //         and village greens.
  {
    const d = { key: 'G', unit: 4, beat: 8, weak: 0.86 };             // branle double: a crotchet is four steps
    const g = { key: 'G', unit: 2, beat: 6, weak: 0.8 };              // branle gay: a quaver is two
    const suite = (dA, dB, gA, gB) => seq(abc(dA, d), abc(dA, d), abc(dB, d), abc(dB, d),
      abc(gA, g), abc(gA, g), abc(gB, g), abc(gB, g));
    const S = suite('G2AB|cBA2|BdcB|A4|', 'd2dc|Bcd2|edcB|A2G2|',
      'd2B c2A|B2G A3|d2B c2A|A2F G3|', 'e2d c2B|c2A B3|e2d c2B|A2F G3|');
    const A = suite('D4|EDF2|D2ED|F4|', 'B2GG|GEFG|GGED|F2D2|',
      'G3 E3|D3 F3|G3 E3|D3 D3|', 'G3 G3|E3 D3|G3 E3|D3 D3|');
    const T = suite('B,2F,G,|G,G,A,2|G,2A,B,|D4|', 'D2DE|DCB,B,|CDA,B,|A,2B,2|',
      'B,3 C3|G,3 A,3|D3 C3|A,3 B,3|', 'E3 C3|C3 B,3|E3 C3|F,3 G,3|');
    const B = suite('G,,2D,G,,|C,G,,D,2|G,,B,,A,,G,,|D,4|', 'G,,2B,,C,|G,,A,,B,,G,,|C,B,,A,,G,,|D,2G,,2|',
      'G,,3 A,,3|G,,3 D,3|B,,3 A,,3|D,3 G,,3|', 'C,3 E,3|A,,3 G,,3|C,3 A,,3|D,3 G,,3|');
    const DBL = 16 * SPB;                                           // the branle double's sixteen bars
    const ring = (t) => { const d = Math.min(10, S.len - t - 1); return [[t, 79, d, 0.55], [t, 86, d, 0.4], [t + 1, 83, d - 1, 0.3]]; };
    const bells = withLen([184, 248, DBL + 11 * 12 + 6, DBL + 15 * 12 + 6].flatMap(ring), S.len);
    const kit = { T: ['tabor', 0.6], t: ['tabor', 0.32], J: ['tambourine', 0.5], j: ['tambourine', 0.25] };
    const perc = seq(times(drums(kit, 'T...j...t...j...'), 7), drums(kit, 'T...j...T.t.T...'),
      times(drums(kit, 'T.j.J.j.t.j.J.j.'), 7), drums(kit, 'T.j.J.j.T.T.T...'),
      times(drums(kit, 'T.....t..j..'), 7), drums(kit, 'T..j..T..jJ.'),
      times(drums(kit, 'T..j.jt..jJ.'), 7), drums(kit, 'T.jJ.jT.....'));

    tracks.greengrassBranles = track({
      title: 'The Branles of Greengrass',
      contexts: ['festival', 'market', 'village', 'town'], weight: 1.3, room: 'open',
      bpm: 120, loopBars: S.len / SPB, gain: 1,
      layers: [
        { name: 'superius', inst: 'shawmAlto', gain: 0.46, pan: 0.2, humanize: 8, ornament: 'grace', pattern: S },
        { name: 'altus', inst: 'crumhorn', gain: 1.1, pan: -0.3, humanize: 8, pattern: A },
        { name: 'tenor', inst: 'sackbut', gain: 0.24, pan: 0.3, humanize: 8, pattern: T },
        { name: 'bassus', inst: 'dulcian', gain: 0.26, pan: -0.1, humanize: 6, pattern: B },
        { name: 'bells', inst: 'handbells', gain: 0.3, pan: 0.4, pattern: bells },
        { name: 'drum', wave: 'noise', gain: 1.1, pan: 0.05, pattern: perc },
      ],
    });
  }

  // ── CACCIA OF THE NEVERWINTER WOOD ─────────────────────────────────────────
  // Form:   caccia, the Italian trecento hunting song: two upper voices in
  //         strict canon at the unison, the second a whole phrase behind the
  //         first, over a free tenor. Here the tenor repeats a four-bar ground
  //         so the chase can go round for ever: every four-bar leg of the canon
  //         is written to sound against the ground and against the legs before
  //         and after it, the way a rota is written over its pes. Horn calls
  //         break in as the hunt passes. Original, in the manner of Jacopo da
  //         Bologna's and Piero's cacce.
  // Mode:   F (Ionian with the B flat), 6/8.
  // Voices: recorder (the leader), rebec (the follower, four bars behind),
  //         viol (the tenor's ground), hunting horn; a frame drum like
  //         hoofbeats once the whole field is running.
  // Plays:  forests: the Neverwinter Wood, the eaves of the High Forest, Ardeep.
  {
    const o = { key: 'F', unit: 2, beat: 6, weak: 0.8 };
    const legs = ['c2c c2c|d2d d3|e2e e2f|c3 z3|', 'f2e f2a|g2f d2B|c2d e2g|f3 c3|',
      "agf ac'a|bag fdB|gfe cde|fga f3|", "c'3 a3|d'3 b3|c'2b g2e|a3 z3|",
      "c'2a f2a|d'2b f2d|e2g c'2g|a2g f3|", 'a2g f2e|d2f b2a|g2f e2d|c3 z3|'].map((s) => abc(s, o));
    const lead = seq(...legs);
    const LOOP = lead.len;                                          // six legs, 24 bars
    const follow = wrap(move(lead, legs[0].len), LOOP);
    const ground = times(abc('F,3A,3|B,,3D,3|C,3E,3|F,6|', o), legs.length);
    const call = abc('c2A F2A|B2d F2B|c2G E2G|F3 z3|', o);
    const horn = seq(call, 3 * call.len, call, call.len);
    const hooves = seq(2 * legs[0].len, times(drums({ F: ['frame', 0.5], f: ['frame', 0.26] }, 'F..f..F..f..'), 16));

    tracks.neverwinterWoodCaccia = track({
      title: 'Caccia of the Neverwinter Wood',
      contexts: ['forest'], weight: 1.3, room: 'open',
      bpm: 132, loopBars: LOOP / SPB, gain: 1,
      layers: [
        { name: 'leader', inst: 'recorder', gain: 0.4, pan: -0.3, humanize: 8, ornament: 'grace', pattern: lead },
        { name: 'follower', inst: 'rebec', gain: 0.75, pan: 0.35, humanize: 10, pattern: follow },
        { name: 'tenor', inst: 'viol', gain: 0.32, pan: 0, humanize: 8, pattern: ground },
        { name: 'horn', inst: 'horn', gain: 0.3, pan: 0.15, humanize: 12, pattern: horn },
        { name: 'drum', wave: 'noise', gain: 0.7, pan: -0.1, pattern: hooves },
      ],
    });
  }

  // ── THE FLAMING FIST SALTARELLO ────────────────────────────────────────────
  // Form:   saltarello, the leaping Italian afterdance, in the shape of the
  //         saltarelli of BL Add. 29987: puncta each played twice, first with an
  //         open ending (aperto, on A), then a closed one (chiuso, home on D).
  //         Punctum II swings to the flat seventh (C natural), as the loud
  //         band's tunes do. Original.
  // Mode:   D (Ionian, C natural in punctum II), 6/8.
  // Voices: cornett (cantus), tenor shawm (counter), sackbut (bass), the alto
  //         shawm doubling the cantus on each repeat; nakers, tabor, and a war
  //         drum on each punctum's first bar.
  // Plays:  battle when the fight is going your way, and the victory after.
  {
    const o = { key: 'D', unit: 2, beat: 6, weak: 0.82 };
    const C = ['d2f a2f|g2b a2f|e2c e2a|f2d f2a|', 'a2f d2f|=c2e g2e|b2a g2b|a2g f2e|'];
    const OUV = 'g2f e2d|e6|', CLO = 'g2f e2c|d6|';
    const cantus = puncta(C, OUV, CLO, o);
    const tenor = puncta(['F3 C3|B,3 D3|C3 E3|D3 A,3|', 'F3 A,3|E3 G3|G3 D3|C3 C3|'], 'B,3 C3|C6|', 'B,3 E3|F6|', o);
    const bass = puncta(['D,3 A,,3|G,,3 D,3|A,,6|D,3 F,3|', 'D,3 F,3|=C,6|G,,3 B,,3|A,,6|'],
      'G,,3 A,,3|A,,6|', 'G,,3 A,,3|D,6|', o);
    const repeats = seq(...C.map((b) => { const body = abc(b, o); return seq(body.len + abc(OUV, o).len, body, abc(CLO, o)); }));
    const kit = { W: ['wardrum', 0.8], N: ['nakers', 0.55], n: ['nakersHi', 0.36], T: ['tabor', 0.5], t: ['tabor', 0.26] };
    const g = 'N.nn.nN.nn.n';
    const naker = times(drums(kit, g, g, g, g, g, 'NnNnNnN.....'), 4);
    const tabor = times(drums(kit, 'W.....T.....', 'T.....T..t..', 'T.....T.....', 'T..t..T..t..', 'T.....T.....', 'T.T.T.W.....'), 4);

    tracks.flamingFistSaltarello = track({
      title: 'The Flaming Fist Saltarello',
      contexts: ['battle'], intensity: 1, weight: 1.3, room: 'open',
      bpm: 176, loopBars: cantus.len / SPB, gain: 1,
      layers: [
        { name: 'cantus', inst: 'cornett', gain: 0.32, pan: 0.2, humanize: 6, pattern: cantus },
        { name: 'double', inst: 'shawmAlto', gain: 0.26, pan: 0.35, humanize: 8, pattern: repeats },
        { name: 'tenor', inst: 'shawmTenor', gain: 0.32, pan: -0.25, humanize: 6, pattern: tenor },
        { name: 'bass', inst: 'sackbut', gain: 0.16, pan: 0, humanize: 5, pattern: bass },
        { name: 'nakers', wave: 'noise', gain: 0.6, pan: 0.15, pattern: naker },
        { name: 'tabor', wave: 'noise', gain: 0.75, pan: -0.1, pattern: tabor },
      ],
    });
  }

  // ── BALLATA OF THE DOLPHIN BRIDGE ──────────────────────────────────────────
  // Form:   ballata in Landini's three-voice manner: the ripresa (A), two piedi
  //         on new music (b, first with an open ending on A, then closed on D),
  //         the volta sung to the ripresa's music. Every close on D is a Landini
  //         cadence: the cantus falls from the leading note to the sixth before
  //         rising to the octave (C sharp, B, D) over the tenor's E-D and the
  //         contratenor's G sharp-A, the double leading-note sound of the
  //         Italian trecento. Original.
  // Mode:   D Dorian, 3/4.
  // Voices: countertenor (cantus, sung), vielle (contratenor), viol (tenor),
  //         gothic harp doubling the tenor an octave up.
  // Plays:  Neverwinter: the Dolphin Bridge over the warm river, the Protector's
  //         Enclave, the halls of Castle Never; any great city at its ease.
  {
    const o = { key: 'Ddor', unit: 4, beat: 12, weak: 0.86 };
    const form = (A, b, ouv, clo) => seq(abc(A, o), abc(b, o), abc(ouv, o), abc(b, o), abc(clo, o), abc(A, o));
    const cantus = form('A2F/G/|A2G|A/c/de|f2e/d/|c/d/cB|e2d|d^cB|d3|', 'c2A|B/c/dc|A2G|A/B/cB|', 'cB^G|A3|', 'd^cB|d3|');
    const contra = form('F2A,|C3|F2G|A2G|A2D|C2B,|A^G2|A3|', 'F3|G2E|F2E|A2G|', 'ED^D|E3|', 'A^G2|A3|');
    const tenor = form('D,3|F,2E,|D,2C,|D,2E,|F,2G,|A,2G,|F,E,2|D,3|', 'F,3|G,2A,|D,2E,|F,2G,|', 'A,B,2|A,3|', 'F,E,2|D,3|');

    tracks.dolphinBridgeBallata = track({
      title: 'Ballata of the Dolphin Bridge',
      contexts: ['city', 'castle'], weight: 1.2, room: 'hall',
      bpm: 96, loopBars: cantus.len / SPB, gain: 1,
      layers: [
        { name: 'cantus', inst: 'voiceAlto', gain: 0.3, pan: 0.1, humanize: 14, ornament: 'mordent', ornamentMin: 8,
          pattern: sing(cantus, 'a e o e a i o e a e i o a e o a a e i o e a o e') },
        { name: 'contratenor', inst: 'vielle', gain: 0.65, pan: -0.35, humanize: 10, pattern: contra },
        { name: 'tenor', inst: 'viol', gain: 0.55, pan: 0.3, humanize: 8, pattern: tenor },
        { name: 'harp', inst: 'harpGothic', gain: 0.45, pan: 0.45, humanize: 6, pattern: loud(up(tenor, 12), 0.75) },
      ],
    });
  }

  // ── THE SEA OF SWORDS CAROLE ───────────────────────────────────────────────
  // Form:   carole, the ring-dance song: a burden everyone sings, a verse for
  //         one voice, the burden again, as the English carols of the Trinity
  //         Roll are laid out. 6/8 in a slow sway, a deck's roll rather than a
  //         dancer's step. The burden is in three parts (the tune, a tenor under
  //         it, the bass); in the verse the soloist is answered by a rebec
  //         above him. At the second burden a recorder doubles the tune an octave
  //         up. Original.
  // Mode:   G Dorian (B flat, E natural), with the F sharp of the final cadence.
  // Voices: mixed choir (the tune), tenor (the burden's middle part, then the
  //         verse), rebec, recorder, viol (bass), gittern rolling root, fifth
  //         and octave; a frame drum on the sway.
  // Plays:  the coast: Luskan's wharves, the Mistshore, the fishing villages
  //         from Port Llast down to the shingle under Candlekeep.
  {
    const o = { key: 'Gdor', unit: 2, beat: 6, weak: 0.82 };
    const tune = abc('D2G G2A|B3 A3|G2A B2c|d3 D3|c2B A2G|F2G A3|B2A A2^F|G6|', o);
    const under = abc('B,3 D3|D3 F3|E3 D3|A,6|A,3 F,3|D3 F3|D6|D6|', o);
    const verse = abc('G,2A, B,2C|D3 D3|E2D C2B,|A,3 A,3|B,2C D2E|F2E D2C|B,2A, A,2^F,|G,6|', o);
    const answer = abc('d6|f3 d3|g3 e3|f3 c3|d3 B3|A3 d3|G3 ^F3|G6|', o);
    const bass = seq(...[1, 2].flatMap(() => [abc('G,,6|G,,3 D,3|C,3 G,,3|D,6|F,3 D,3|B,,3 D,3|G,,3 D,3|G,,6|', o),
      abc('G,,6|B,,3 G,,3|C,3 A,,3|D,3 F,3|G,,3 B,,3|D,3 B,,3|G,,3 D,3|G,,6|', o)]));
    const N = tune.len;                                               // eight bars: the burden and the verse alike
    const sea = 'o a e o a e o a e a o e a e o a e o';

    tracks.seaOfSwordsCarole = track({
      title: 'The Sea of Swords Carole',
      contexts: ['coast'], weight: 1.3, room: 'open',
      bpm: 99, loopBars: bass.len / SPB, gain: 1,
      layers: [
        { name: 'burden', inst: 'choirFull', gain: 0.3, pan: 0, humanize: 16, pattern: seq(sing(tune, sea), N, sing(tune, sea), N) },
        { name: 'tenor', inst: 'voiceTenor', gain: 0.32, pan: -0.15, humanize: 14,
          pattern: seq(sing(under, 'a o a e o a e a'), sing(verse, 'e a o e a i o a e o a e'),
            sing(under, 'a o a e o a e a'), sing(verse, 'i a e o a e o a e o a o')) },
        { name: 'rebec', inst: 'rebec', gain: 0.55, pan: 0.35, humanize: 10, pattern: seq(N, answer, N, answer) },
        { name: 'descant', inst: 'recorder', gain: 0.26, pan: 0.3, humanize: 8, ornament: 'grace', pattern: seq(2 * N, up(tune, 12), N) },
        { name: 'bass', inst: 'viol', gain: 0.4, pan: -0.05, humanize: 8, pattern: bass },
        { name: 'gittern', inst: 'gittern', gain: 0.6, pan: -0.35, humanize: 8, pattern: loud(rolls(bass, 6), 0.8) },
        { name: 'drum', wave: 'noise', gain: 0.8, pan: 0.1,
          pattern: times(drums({ F: ['frame', 0.5], f: ['frame', 0.24] }, 'F.....f.....'), bass.len / 12) },
      ],
    });
  }

  // ── THE DELZOUN BASSE DANSE ────────────────────────────────────────────────
  // Form:   basse danse: a tenor in equal long notes, one to the bar, with a
  //         discant above it and a leaping contratenor bassus below, the three
  //         parts a fifteenth-century band would improvise on the tenors of the
  //         Brussels basse danse manuscript. The tenor here is original. Men's
  //         voices take the tenor up for the second half, and the bagpipe's
  //         drone sounds only under the bars that rest on D.
  // Mode:   D Dorian, 3/2 (tempus perfectum), stately and low.
  // Voices: sackbut (tenor), tenor shawm (discant), dulcian (contratenor
  //         bassus), men's choir on 'o' doubling the tenor in bars 9-16, bagpipe
  //         drone; a war drum and a naker bright as a hammer on an anvil.
  // Plays:  hills and mountains: the Sword Mountains, the Spine of the World,
  //         the roads to Mithral Hall and Gauntlgrym, where the old dwarf-realm
  //         of Delzoun lay.
  {
    const o = { key: 'Ddor', unit: 4, beat: 8, weak: 0.88 };
    const tenor = abc('D,6|F,6|G,6|A,6|C6|A,6|G,6|F,6|E,6|D,6|F,6|E,6|D,6|C,6|E,6|D,6|', o);
    const discant = abc('A,2D2F2|A,2C2D2|E2D2C2|C2F2E2|E2A2G2|F4E2|E4D2|A,2C4|' +
      'G,2C2B,2|A,2F2D2|C2A,2C2|E2C2G,2|A,2F,2A,2|A,4G,2|G,2^C4|D6|', o);
    const bassus = abc('D,,4F,,2|F,,2A,,2D,2|E,,2G,,2C,2|F,,2D,,2A,,2|A,,2F,,2C,2|F,,2D,2C,2|E,,2C,2G,,2|D,,2A,,2F,,2|' +
      'C,,2A,,2E,,2|D,,4F,,2|A,,2D,2F,,2|A,,4C,2|F,,4D,,2|A,,2F,,2C,,2|C,2A,,4|D,,6|', o);
    const BAR = 24;
    const drone = (m, v) => withLen([[0, 2], [9, 1], [12, 1], [15, 1]].map(([b, n]) => [b * BAR, m, n * BAR, v]), tenor.len);
    const choir = seq(8 * BAR, abc('E,6|D,6|F,6|E,6|D,6|C,6|E,6|D,6|', o));
    const kit = { W: ['wardrum', 0.6], n: ['nakers', 0.34], a: ['nakersHi', 0.3] };
    const perc = seq(times(drums(kit, 'W.......n.......a.......'), 15), drums(kit, 'W.......n...n...W.......'));

    tracks.delzounBasseDanse = track({
      title: 'The Delzoun Basse Danse',
      contexts: ['hills', 'mountain'], weight: 1.3, room: 'hall',
      bpm: 112, loopBars: tenor.len / SPB, gain: 1,
      layers: [
        { name: 'tenor', inst: 'sackbut', gain: 0.2, pan: 0, humanize: 8, pattern: tenor },
        { name: 'discant', inst: 'shawmTenor', gain: 0.42, pan: 0.3, humanize: 8, ornament: 'mordent', ornamentMin: 8, pattern: discant },
        { name: 'bassus', inst: 'dulcian', gain: 0.3, pan: -0.3, humanize: 8, pattern: bassus },
        { name: 'choir', inst: 'choirMen', vowel: 'o', gain: 0.3, pan: 0.1, humanize: 16, pattern: choir },
        { name: 'drone', inst: 'bagpipe', gain: 1, pan: -0.1, pattern: drone(38, 0.62) },
        { name: 'droneFifth', inst: 'bagpipe', gain: 0.8, pan: 0.1, pattern: drone(45, 0.5) },
        { name: 'drum', wave: 'noise', gain: 0.8, pan: 0.05, pattern: perc },
      ],
    });
  }

  // ── THE ESTAMPIE OF THE BROKEN SHIELD-WALL ────────────────────────────────
  // Form:   estampie in two puncta, the ouvert on D and the clos by the
  //         Phrygian cadence (the bass falling F to E under the cantus rising D
  //         to E), over an ostinato that steps down a tone each bar, E, D, C,
  //         the way a line gives ground. Punctum II starts a fifth higher and
  //         gives ground again. Original.
  // Mode:   E Phrygian (the F a semitone above the final is the dread in it),
  //         4/4, fast; the clos lands on E with the raised third.
  // Voices: shawm (cantus), alto shawm (long notes against it), sackbut
  //         (arpeggiated counter), dulcian (ostinato); nakers in running
  //         semiquavers, war drum and tabor.
  // Plays:  battle when it is going badly; bosses.
  {
    const o = { key: 'Ephr', unit: 2, beat: 8, weak: 0.84 };
    const cantus = puncta(['B2e2 gfeB|A2d2 fedA|G2c2 edcG|', "e2a2 c'2ae|d2g2 b2gd|c2f2 a2fc|"], 'f2a2 d4|', 'c2d2 e4|', o);
    const alto = puncta(['G4 B4|F4 A4|E4 G4|', 'c4 e4|B4 d4|A4 c4|'], 'F4 A4|', 'A4 ^G4|', o);
    const tenor = puncta(['E,2G,2 B,2G,2|D,2F,2 A,2F,2|C,2E,2 G,2E,2|', 'A,,2C,2 E,2C,2|G,,2B,,2 D,2B,,2|F,,2A,,2 C,2A,,2|'],
      'D,2F,2 A,4|', 'A,2A,2 B,4|', o);
    const ost = (n) => `${n}2${n}${n} ${n}2${n}${n}|`;
    const bass = puncta([ost('E,,') + ost('D,,') + ost('C,,'), ost('A,,') + ost('G,,') + ost('F,,')],
      'D,,2D,,D,, D,,4|', 'F,,2F,,F,, E,,4|', o);
    const kit = { N: ['nakers', 0.55], n: ['nakersHi', 0.34], W: ['wardrum', 0.85], T: ['tabor', 0.45], t: ['tabor', 0.25] };
    const eight = (g, e) => drums(kit, g, g, g, e, g, g, g, e);      // one punctum: body, ending, body, ending
    const nakers = times(eight('N.nnN.nnN.nnNnNn', 'NnNnNnNnN.n.N...'), 2);
    const drum = times(eight('W...T...W...T.tT', 'W.T.W.T.W.......'), 2);

    tracks.brokenShieldEstampie = track({
      title: 'The Estampie of the Broken Shield-Wall',
      contexts: ['battle', 'boss'], intensity: 3, weight: 1, room: 'open',
      bpm: 160, loopBars: cantus.len / SPB, gain: 1,
      layers: [
        { name: 'cantus', inst: 'shawmAlto', gain: 0.42, pan: 0.2, humanize: 5, pattern: cantus },
        { name: 'alto', inst: 'shawmAlto', gain: 0.24, pan: -0.3, humanize: 6, pattern: alto },
        { name: 'tenor', inst: 'sackbut', gain: 0.2, pan: 0.3, humanize: 5, pattern: tenor },
        { name: 'bass', inst: 'dulcian', gain: 0.26, pan: -0.05, humanize: 4, pattern: bass },
        { name: 'nakers', wave: 'noise', gain: 0.6, pan: 0.15, pattern: nakers },
        { name: 'drum', wave: 'noise', gain: 0.6, pan: -0.1, pattern: drum },
      ],
    });
  }

  // ── THE RAGE OF DRAGONS ────────────────────────────────────────────────────
  // Form:   a processional in the oldest way of making two voices one: a tenor
  //         in long notes with a second sackbut in parallel fifths above it
  //         (organum, as the Musica enchiriadis teaches it), a tenor shawm
  //         hammering a dotted figure between them, and the second time round
  //         the shawm's cantus screaming over the top. The tenor closes by the
  //         Phrygian semitone, E flat to D. Original.
  // Mode:   D Phrygian (B flat, E flat), 3/2, slow and heavy.
  // Voices: sackbut (tenor), sackbut (organal voice), tenor shawm, shawm
  //         (cantus, second pass), dulcian drone on D under the bars on D; war
  //         drum, timpani, and a gong at the head of each pass.
  // Plays:  when a dragon is fought, and in the lairs of the greatest bosses.
  {
    const o = { key: 'Dphr', unit: 4, beat: 24, weak: 0.9 };
    const cf = abc('D,6|E,6|D,4C,2|D,6|F,4E,2|D,4C,2|E,6|D,6|', o);
    const PASS = cf.len, BAR = 24;                                   // eight bars of 3/2
    const tenor = times(cf, 2), organal = up(tenor, 7);
    const hammer = times(abc('F3DF2|G3EG2|F3DE2|A3FD2|A3FG2|F3DE2|G3EG2|A6|', o), 2);
    const cantus = seq(PASS, abc('d4f2|e4g2|f2d2e2|f4a2|a4g2|f4e2|g2e2g2|d6|', o));
    const drone = withLen([0, 3, 7, 8, 11, 15].map((b) => [b * BAR, 38, BAR, 0.6]), 2 * PASS);
    const kit = { W: ['wardrum', 0.9], w: ['wardrum', 0.5], K: ['timp', 0.7], k: ['timphi', 0.45] };
    const pass = seq(times(drums(kit, 'W.......K.......W...k.k.'), 7), drums(kit, 'W...K...W...K...KkKkKkKk'));
    const gong = withLen([[0, 'gong', 1, 0.7], [PASS, 'gong', 1, 0.85]], 2 * PASS);

    tracks.rageOfDragons = track({
      title: 'The Rage of Dragons',
      contexts: ['dragon', 'boss'], intensity: 3, weight: 1.2, room: 'open',
      bpm: 100, loopBars: 2 * PASS / SPB, gain: 1,
      layers: [
        { name: 'tenor', inst: 'sackbut', gain: 0.26, pan: -0.1, humanize: 6, pattern: tenor },
        { name: 'organal', inst: 'sackbut', gain: 0.2, pan: 0.2, humanize: 8, pattern: organal },
        { name: 'hammer', inst: 'shawmTenor', gain: 0.3, pan: -0.3, humanize: 6, pattern: hammer },
        { name: 'cantus', inst: 'shawmAlto', gain: 0.4, pan: 0.3, humanize: 6, ornament: 'trill', ornamentMin: 16, pattern: cantus },
        { name: 'drone', inst: 'dulcian', gain: 0.18, pan: 0, pattern: drone },
        { name: 'drums', wave: 'noise', gain: 0.6, pan: 0, pattern: times(pass, 2) },
        { name: 'gong', wave: 'noise', gain: 1.5, pan: 0.1, pattern: gong },
      ],
    });
  }

  // ── LAMENT OF THE MERE OF DEAD MEN, WITH ITS ROTTA ─────────────────────────
  // Form:   a lamento and its rotta, the pair the Tuscan dance book BL Add.
  //         29987 is famous for (the Lamento di Tristano and La Rotta): a slow
  //         duple punctum with open and closed endings, then the same music
  //         re-timed as a quick triple afterdance, every pair of beats turned
  //         long-short (see rotta()), played twice with a recorder an octave up.
  //         Set in three parts over a hurdy-gurdy's drone. Original.
  // Mode:   D Aeolian (B flat), 4/4 then 6/8, the clos with a C sharp.
  // Voices: rebec (tune), viol (tenor), vielle (low contratenor), symphonia
  //         drone on D; recorder and frame drum in the rotta.
  // Plays:  marshes and fens (the Mere of Dead Men, the Lizard Marsh), and
  //         tense places where the air is wrong.
  {
    const o = { key: 'Dm', unit: 4, beat: 16, weak: 0.86 };           // a crotchet is eight steps here
    const lament = (body, ouv, clo) => seq(abc(body, o), abc(ouv, o), abc(body, o), abc(clo, o));
    const tune = lament('d2d2c2d2|e2f2e2d2|c2A2B2c2|d4A4|', 'c2B2A2G2|A8|', 'c2B2A2^c2|d8|');
    const tenor = lament('F2D2E2F2|C2D2A,2B,2|A,2C2B,2A,2|F,4D4|', 'E2D2C2B,2|^C8|', 'E2D2C2E2|D8|');
    const contra = lament('D,2B,,2A,,2D,2|A,,2D,2C,2G,,2|F,2F,2G,2F,2|D,8|', 'A,,2B,,2F,2G,2|A,,8|', 'A,,2B,,2F,2A,,2|D,8|');
    const R = (x) => times(rotta(x, 8), 2);
    const L = tune.len, RL = R(tune).len;
    const drone = seq(times(hold(50, 32, 0.6), L / 32), times(hold(50, 12, 0.6), RL / 12));
    const frame = seq(L, times(drums({ F: ['frame', 0.5], f: ['frame', 0.24] }, 'F...f.F...f.'), RL / 12));

    tracks.mereLament = track({
      title: 'Lament of the Mere of Dead Men, with its Rotta',
      contexts: ['marsh', 'tense'], weight: 1.2, room: 'open',
      bpm: 144, loopBars: (L + RL) / SPB, gain: 1,
      layers: [
        { name: 'tune', inst: 'rebec', gain: 0.6, pan: 0.2, humanize: 12, ornament: 'mordent', ornamentMin: 12, pattern: seq(tune, R(tune)) },
        { name: 'tenor', inst: 'viol', gain: 0.45, pan: -0.25, humanize: 10, pattern: seq(tenor, R(tenor)) },
        { name: 'contratenor', inst: 'vielle', gain: 0.45, pan: 0.35, humanize: 10, pattern: seq(contra, R(contra)) },
        { name: 'descant', inst: 'recorder', gain: 0.24, pan: -0.35, humanize: 8, pattern: seq(L, up(R(tune), 12)) },
        { name: 'drone', inst: 'symphonia', gain: 0.14, pan: 0, pattern: drone },
        { name: 'drum', wave: 'noise', gain: 0.7, pan: 0.05, pattern: frame },
      ],
    });
  }

  // ── THE HIGH ROAD PASSAMEZZO ───────────────────────────────────────────────
  // Form:   divisions on a ground, the walking music of the sixteenth century:
  //         the passamezzo antico (i - VII - i - V - III - VII - i V - i, the
  //         ground under a hundred Italian and English sets) with an original
  //         tune over it, played plain, then in quaver divisions against the
  //         plain tune, then with the divisions an octave up, then two players
  //         dividing at once. Every strong beat is a chord tone, so any division
  //         sits with any other.
  // Mode:   G minor (Dorian with the B flat and E flat of the ground), 4/4.
  // Voices: recorder, vielle, rebec (the tune and its divisions in turn), viol
  //         (the ground, in first inversion where a root would sit a fourth
  //         under the tune), lute rolling root, fifth and octave; a walking tabor.
  // Plays:  roads and travel: the High Road between Waterdeep and Neverwinter,
  //         the Trade Way, the long field-miles of the Sword Coast.
  {
    const o = { key: 'Gm', unit: 2, beat: 8, weak: 0.85 };
    const plain = abc('d4B2G2|c4A2F2|B4d2B2|A4^F2A2|B4d2f2|c4A2c2|B2G2A2^F2|G8|', o);
    const div = abc('dcBc dBGB|cBAG FGAc|BAGA Bcdc|AGA^F D=E^FA|Bcdc Bdfd|cdcB AFAc|BAGB A^FD^F|G2D2G4|', o);
    const ground = abc('G,,4G,4|F,,4F,4|G,,4B,,4|D,4^F,,4|B,,4D,4|F,,4A,,4|G,,4D,4|G,,8|', o);
    const roots = abc('G,,4G,,4|F,,4F,,4|G,,4G,,4|D,4D,4|B,,4B,,4|F,,4F,,4|G,,4D,4|G,,8|', o);
    const N = plain.len;
    const kit = { T: ['tabor', 0.55], t: ['tabor', 0.28] };

    tracks.highRoadPassamezzo = track({
      title: 'The High Road Passamezzo',
      contexts: ['road', 'travel', 'field'], weight: 1.3, room: 'open',
      bpm: 104, loopBars: 4 * N / SPB, gain: 1,
      layers: [
        { name: 'recorder', inst: 'recorder', gain: 0.4, pan: 0.25, humanize: 8, ornament: 'grace',
          pattern: seq(plain, plain, up(div, 12), up(plain, 12)) },
        { name: 'vielle', inst: 'vielle', gain: 0.5, pan: -0.3, humanize: 10, pattern: seq(N, div, plain, N) },
        { name: 'rebec', inst: 'rebec', gain: 0.45, pan: -0.15, humanize: 10, pattern: seq(3 * N, div) },
        { name: 'ground', inst: 'viol', gain: 0.26, pan: 0, humanize: 8, pattern: times(ground, 4) },
        { name: 'lute', inst: 'lutePlucked', gain: 0.55, pan: 0.4, humanize: 6, pattern: loud(times(rolls(roots, 8), 4), 0.8) },
        { name: 'tabor', wave: 'noise', gain: 1.5, pan: 0.1,
          pattern: seq(times(drums(kit, 'T...t...T...t...'), 31), drums(kit, 'T.t.T.t.T.......')) },
      ],
    });
  }

  // ── THE TRIBOAR ESTAMPIE ───────────────────────────────────────────────────
  // Form:   estampie in three puncta with shared open and closed endings, the
  //         tavern kind: quick, loud and square. In punctum III the tune is cut
  //         into a hocket, recorder and rebec taking alternate notes, which is
  //         how a thirteenth-century band showed off. Original.
  // Mode:   D Mixolydian (C natural: the flat seventh and its C-major chord
  //         are the whole sound of it), 4/4.
  // Voices: recorder (tune), rebec (counter in minims, then the hocket's other
  //         half), viol (roots), gittern rolling the chords; frame drum and
  //         tambourine.
  // Plays:  taverns and inns: the Lionshield Coster's yard at Triboar, the
  //         common rooms of every crossroads town from Red Larch to Longsaddle.
  {
    const o = { key: 'Dmix', unit: 2, beat: 8, weak: 0.82 };
    const OUV = { c: 'dBGB d2g2|a2e2 c4|', k: 'B4 G4|A8|', t: 'G,,8|A,,8|' };
    const CLO = { c: 'egce g2e2|f2a2 d4|', k: 'G4 c4|F8|', t: 'C,8|D,8|' };
    const tune12 = puncta(['dfaf d2A2|eged c2G2|fedc d2A2|e2c2 A2e2|', "g2b2 d'2b2|a2f2 d2f2|g2e2 c2e2|a4 e2c2|"], OUV.c, CLO.c, o);
    const [hi, lo] = hocket(puncta(['dfad afdA|egce gecG|fadf adAF|ecAc eace|'], OUV.c, CLO.c, o));
    const counter = puncta(['A4 F4|G4 E4|F4 A4|A4 c4|', 'd4 B4|d4 A4|c4 G4|c4 A4|'], OUV.k, CLO.k, o);
    const roots = puncta(['D,8|C,8|D,8|A,,8|', 'G,,8|D,8|C,8|A,,8|', 'D,8|C,8|D,8|A,,8|'], OUV.t, CLO.t, o);
    const kit = { F: ['frame', 0.5], f: ['frame', 0.25], J: ['tambourine', 0.45], j: ['tambourine', 0.22] };
    const g = 'F...j.J.F.j.J.j.', e = 'F.j.F.j.F...J...';
    const perc = times(drums(kit, g, g, g, g, g, e, g, g, g, g, g, e), 3);

    tracks.triboarEstampie = track({
      title: 'The Triboar Estampie',
      contexts: ['tavern', 'village'], weight: 1.2, room: 'tavern',
      bpm: 128, loopBars: roots.len / SPB, gain: 1,
      layers: [
        { name: 'tune', inst: 'recorder', gain: 0.42, pan: 0.25, humanize: 8, ornament: 'grace', pattern: seq(tune12, hi) },
        { name: 'rebec', inst: 'rebec', gain: 0.5, pan: -0.3, humanize: 8, pattern: seq(counter, lo) },
        { name: 'roots', inst: 'viol', gain: 0.26, pan: 0, humanize: 8, pattern: roots },
        { name: 'gittern', inst: 'gittern', gain: 0.8, pan: 0.4, humanize: 6, pattern: loud(rolls(roots, 8), 0.8) },
        { name: 'drum', wave: 'noise', gain: 0.9, pan: -0.1, pattern: perc },
      ],
    });
  }

  // ── THE DOCK WARD ISTAMPITTA ───────────────────────────────────────────────
  // Form:   istampitta, the long Italian estampie of the loud band, two puncta
  //         with aperto and chiuso endings. Each punctum runs down the circle
  //         of fifths (A-D-G-C-F, then E-A-D-G-C) and the cornett imitates the
  //         shawm a bar behind and a fifth lower, so every imitation lands on
  //         its own chord: the answer is computed by dia() from the lead.
  //         Original.
  // Mode:   C (Ionian, beginning on its A-minor chord), 4/4, quick.
  // Voices: alto shawm (lead), cornett (the imitation), sackbut (tenor,
  //         thirds and fifths), dulcian (galloping roots); nakers and
  //         tambourine.
  // Plays:  Waterdeep: the Dock Ward and the Trades Ward at full cry, and any
  //         great city's market.
  {
    const o = { key: 'C', unit: 2, beat: 8, weak: 0.84 };
    const leads = [['A2EA c2AE|fdAd fafd|g2dB d2g2|ecGc egec|', 'f2cA c2f2|'],
      ['e2Be g2eB|cAEA cecA|d2af d2A2|BdgdBGBd|', 'c2eg e2c2|']];
    const OUV = { c: 'd2BG B2d2|g8|', k: 'D2G2B2G2|D8|', t: 'D,2B,,2D,2G,2|D,4B,,4|', b: 'G,,2G,,G,, G,,2G,,G,,|G,,8|' };
    const CLO = { c: 'd2BG B2d2|c8|', k: 'D2G2B2G2|G8|', t: 'D,2B,,2D,2G,2|E,4C,4|', b: 'G,,2G,,G,, G,,2G,,G,,|C,8|' };
    const part = (bodies, ouv, clo) => seq(...bodies.flatMap((b) => [b, ouv, b, clo]));
    const lead = part(leads.map(([a, b]) => seq(abc(a, o), abc(b, o))), abc(OUV.c, o), abc(CLO.c, o));
    const answer = part(leads.map(([a]) => seq(SPB, dia(abc(a, o), -4, 'C'))), abc(OUV.k, o), abc(CLO.k, o));
    const T = ['E,2A,2E,2A,2|F,2A,2F,2A,2|D,2B,,2D,2B,,2|E,2G,2E,2G,2|F,2A,2F,2A,2|',
      'G,2B,2G,2B,2|E,2A,2E,2A,2|F,2A,2F,2A,2|D,2B,,2D,2B,,2|E,2G,2E,2G,2|'];
    const gallop = (...ns) => ns.map((n) => `${n}2${n}${n} ${n}2${n}${n}|`).join('');
    const B = [gallop('A,,', 'D,', 'G,,', 'C,', 'F,,'), gallop('E,,', 'A,,', 'D,', 'G,,', 'C,')];
    const tenor = puncta(T, OUV.t, CLO.t, o), bass = puncta(B, OUV.b, CLO.b, o);
    const kit = { N: ['nakers', 0.5], n: ['nakersHi', 0.32], J: ['tambourine', 0.45], j: ['tambourine', 0.22] };
    const g = 'N.nJN.nnN.nJNnJn', e1 = 'N.nJN.nJNnNnN.J.', e2 = 'N.n.N.n.NnNnN...';
    const perc = times(drums(kit, g, g, g, g, g, e1, e2), 4);

    tracks.dockWardIstampitta = track({
      title: 'The Dock Ward Istampitta',
      contexts: ['city', 'market'], weight: 1.2, room: 'open',
      bpm: 144, loopBars: lead.len / SPB, gain: 1,
      layers: [
        { name: 'lead', inst: 'shawmAlto', gain: 0.48, pan: 0.25, humanize: 6, ornament: 'grace', pattern: lead },
        { name: 'answer', inst: 'cornett', gain: 0.22, pan: -0.3, humanize: 6, pattern: answer },
        { name: 'tenor', inst: 'sackbut', gain: 0.18, pan: 0.35, humanize: 6, pattern: tenor },
        { name: 'bass', inst: 'dulcian', gain: 0.26, pan: -0.1, humanize: 5, pattern: bass },
        { name: 'drum', wave: 'noise', gain: 0.75, pan: 0.05, pattern: perc },
      ],
    });
  }

  // ── THE DAGGERFORD PASTOURELLE ─────────────────────────────────────────────
  // Form:   pastourelle, the trouvère's song of a knight on the road and a
  //         shepherdess who is cleverer than he is: verse A A' B and a refrain,
  //         for one singer with a vielle answering above him and a harp. The
  //         second time the recorder plays the verse and the singer comes back
  //         for the refrain, as a minstrel does when the room is loud. Original.
  // Mode:   A Aeolian with the G sharp of the refrain's cadence, 3/4.
  // Voices: tenor (sung), vielle (counter above), viol (bass), gothic harp
  //         arpeggiating each bass note, recorder.
  // Plays:  inns and taverns, and the night: the River Shining's inn at
  //         Daggerford, the hearth of any common room after dark.
  {
    const o = { key: 'Am', unit: 4, beat: 12, weak: 0.86 };
    const A1 = 'A,2C|D2E|CB,A,|B,3|', A2 = 'A,2C|D2E|DCB,|A,3|', Bv = 'E2G|A2G|EDC|D3|', R = 'C2E|D2C|B,A,^G,|A,3|';
    const verse = abc(A1 + A2 + Bv, o), refrain = abc(R, o);
    const counter = abc('e3|f2g|eBc|e3|e3|f2g|ae^g|a3|c2e|c2B|cde|B3|e2c|d2f|ecB|A3|', o);
    const bass = abc('A,,3|D,2C,|A,,G,,F,,|E,,3|A,,3|D,2C,|F,,A,,E,,|A,,3|C,3|F,,2E,,|A,,B,,C,|G,,3|A,,3|D,2A,,|E,,F,,E,,|A,,3|', o);
    const N = verse.len + refrain.len;
    const words = 'a e i o e a o a e i a o e a o e a i e o a e o a e i o a e a';

    tracks.daggerfordPastourelle = track({
      title: 'The Daggerford Pastourelle',
      contexts: ['inn', 'tavern', 'night'], weight: 1.2, room: 'tavern',
      bpm: 88, loopBars: 2 * N / SPB, gain: 1,
      layers: [
        { name: 'singer', inst: 'voiceTenor', gain: 0.36, pan: 0, humanize: 16,
          pattern: sing(seq(verse, refrain, verse.len, refrain), words) },
        { name: 'counter', inst: 'vielle', gain: 0.6, pan: -0.35, humanize: 10, ornament: 'mordent', ornamentMin: 8, pattern: times(counter, 2) },
        { name: 'bass', inst: 'viol', gain: 0.3, pan: 0.1, humanize: 8, pattern: times(bass, 2) },
        { name: 'harp', inst: 'harpGothic', gain: 0.55, pan: 0.4, humanize: 6, pattern: loud(times(rolls(bass, 12, 12, 4), 2), 0.8) },
        { name: 'recorder', inst: 'recorder', gain: 0.3, pan: 0.3, humanize: 8, ornament: 'grace',
          pattern: seq(N, up(verse, 12), refrain.len) },
      ],
    });
  }

  return { tracks, groups: { secular: Object.keys(tracks) } };
}
