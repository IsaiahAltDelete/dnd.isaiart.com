// tools/score/check.mjs — headless check of the whole score: tags, liner notes, routing, and counterpoint.
//
//   NODE=node   # any Node 18+
//   $NODE tools/score/check.mjs                 # every track's tags, every context's pool, every map's route
//   $NODE tools/score/check.mjs town inn --dis  # ... plus a counterpoint report on those tracks
//
// Errors exit 1: a track without a title, contexts, weight or liner notes; an
// unknown context or mood; an intensity outside 1..3; a map, procedural site,
// biome or literal Audio.music('...') call in src/ that reaches no track at
// all; bad note data (step outside the loop, NaN, zero length, out of
// compass) in a track named on the command line. The counterpoint report is
// the secular book's measure (tools/secular/check.mjs): on every beat, each
// sounding pitch of the non-drone voices against the lowest and each other.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../src/core/music.js';
import { CATALOGUE, MOODS } from '../../src/core/music_catalogue.js';
import { knownMaps } from '../../src/world/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { TRACKS, INSTRUMENTS, SPB } = M;
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const showDis = args.includes('--dis');

const CONTEXTS = ('title town city village inn tavern shop market temple crypt castle field road forest hills ' +
  'mountain coast marsh night dungeon cave underdark battle boss dragon victory defeat lament camp festival mystery tense travel').split(' ');
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const MONO_KINDS = new Set(['voice', 'reed', 'brass', 'wind', 'bowed']);

let errors = 0, warns = 0;
const err = (w, m) => { errors++; console.log(`  ERROR ${w}: ${m}`); };
const warn = (w, m) => { warns++; console.log(`  warn  ${w}: ${m}`); };

// ── tags and liner notes ────────────────────────────────────────────────────
console.log('tracks');
for (const [id, t] of Object.entries(TRACKS)) {
  if (!t.title) err(id, 'no title');
  if (!Array.isArray(t.contexts) || !t.contexts.length) err(id, 'no contexts');
  for (const c of t.contexts || []) if (!CONTEXTS.includes(c)) err(id, `unknown context '${c}'`);
  if (!Number.isFinite(t.weight) || t.weight < 0) err(id, `weight ${t.weight}`);
  if (t.intensity != null && ![1, 2, 3].includes(t.intensity)) err(id, `intensity ${t.intensity}`);
  const n = CATALOGUE[id];
  if (!n) err(id, 'no liner notes in core/music_catalogue.js');
  else {
    if (!n.form) err(id, 'no form');
    if (!MOODS.includes(n.mood)) err(id, `mood '${n.mood}'`);
  }
}
for (const id of Object.keys(CATALOGUE)) if (!TRACKS[id]) err(id, 'liner notes for a track that does not exist');

// ── context pools, exactly as audio.js builds them ─────────────────────────
const pool = (c) => Object.keys(TRACKS).filter((id) => id === c || (TRACKS[id].contexts || []).includes(c));
const reaches = (x) => pool(x).length > 0;
console.log('\ncontexts (pool size, total weight)');
const rows = [];
for (const c of CONTEXTS) {
  const p = pool(c);
  const w = p.reduce((s, id) => s + (TRACKS[id].weight ?? 1), 0);
  rows.push(`${c.padEnd(10)} ${String(p.length).padStart(2)}  ${w.toFixed(1).padStart(4)}  ${p.join(' ')}`);
  if (!p.length) warn(c, 'no track answers this context');
}
console.log(rows.map((r) => '  ' + r).join('\n'));

// ── routing: maps, sites, biomes and call sites ────────────────────────────
console.log('\nrouting');
const used = new Map();
for (const d of knownMaps()) {
  for (const night of [false, true]) {
    const want = M.musicForMap({ music: d.music, biome: d.biome, indoor: d.indoor }, { night });
    if (!reaches(want)) err(`map ${d.id}`, `music '${want}' reaches no track`);
    used.set(want, (used.get(want) || 0) + (night ? 0 : 1));
  }
}
for (const b of ['city', 'plains', 'road', 'forest', 'pine-forest', 'hills', 'mountain', 'tundra', 'coast', 'marsh',
  'ruins', 'ash-waste', 'cave', 'mine', 'dungeon', 'crypt', 'underdark', 'nowhere']) {
  for (const o of [{}, { night: true }, { indoor: true }]) {
    const want = M.trackForBiome(b, o);
    if (!reaches(want)) err(`biome ${b}`, `${JSON.stringify(o)} -> '${want}' reaches no track`);
  }
}
const calls = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/Audio\.(?:music|fanfare)\(([^)]*)\)/g)) for (const q of m[1].matchAll(/'([\w-]+)'/g)) calls.push([path.relative(ROOT, p), q[1]]);
      // `music:` fields are the world's (maps, sites, monsters, events); elsewhere the word means other things.
      if (!/[\\/](world|data)[\\/]/.test(p)) continue;
      for (const m of src.matchAll(/\bmusic: *(?:o\.music \|\| |spec\.music \|\| )?'([\w-]+)'/g)) calls.push([path.relative(ROOT, p), m[1]]);
    }
  }
})(path.join(ROOT, 'src'));
for (const [file, id] of calls) if (!reaches(id)) err(file, `asks for '${id}', which reaches no track`);
console.log(`  ${knownMaps().length} maps x day/night, 18 biomes, ${calls.length} literal requests in src/ checked`);
console.log('  maps per context by day: ' + [...used].sort((a, b) => b[1] - a[1]).filter(([, n]) => n).map(([c, n]) => `${c} ${n}`).join(', '));

// ── note data and counterpoint for the tracks named ────────────────────────
// A track's `pulse` (steps) is the beat its counterpoint is judged on; a crotchet unless it says.
for (const id of only) {
  const tr = TRACKS[id];
  console.log(`\n${id} — ${tr ? tr.title : '?'}`);
  if (!tr) { err(id, 'no such track'); continue; }
  const total = Math.round((tr.loopBars || 4) * SPB);
  const lines = [];
  for (const L of tr.layers) {
    const W = `${id}.${L.name}`;
    const drums = L.wave === 'noise';
    const inst = drums ? null : INSTRUMENTS[L.inst];
    if (!drums && !inst) { err(W, `unknown instrument '${L.inst}'`); continue; }
    const [lo, hi] = (inst && inst.range) || [0, 127];
    const ev = [];
    for (const [s, n, d, v] of L.pattern || []) {
      if (!Number.isInteger(s) || s < 0 || s >= total) err(W, `step ${s} outside 0..${total - 1}`);
      if (!(d > 0) || !Number.isFinite(d)) err(W, `duration ${d} at ${s}`);
      if (!(v > 0 && v <= 1.5)) err(W, `volume ${v} at ${s}`);
      if (drums) continue;
      if (!Number.isFinite(n)) { err(W, `note ${n} at ${s}`); continue; }
      if (n < lo || n > hi) err(W, `${nm(n)} at step ${s} outside ${L.inst} ${nm(lo)}..${nm(hi)}`);
      ev.push([s, n, d]);
    }
    if (inst && MONO_KINDS.has(inst.kind)) {
      const so = ev.slice().sort((a, b) => a[0] - b[0]);
      let over = 0;
      for (let i = 1; i < so.length; i++) if (so[i][0] < so[i - 1][0] + so[i - 1][2]) over++;
      if (over) warn(W, `${over} overlapping notes in a one-note-at-a-time line`);
    }
    if (!drums && !/^drone|^bells?$|^pad$/.test(L.name)) lines.push({ name: L.name, ev });
  }
  const beat = tr.pulse || 4;
  let beats = 0, bad = 0;
  const listed = [];
  for (let t = 0; t < total; t += beat) {
    const sound = [];
    for (const ln of lines) for (const [s, n, d] of ln.ev) {
      if ((t >= s && t < s + d) || (s + d > total && t < s + d - total)) sound.push({ n, v: ln.name });
    }
    if (sound.length < 2) continue;
    beats++;
    const bass = Math.min(...sound.map((x) => x.n));
    const why = [];
    for (const x of sound) if ([1, 2, 5, 6, 10, 11].includes((x.n - bass) % 12)) why.push(`${x.v} ${nm(x.n)} over ${nm(bass)}`);
    for (let i = 0; i < sound.length; i++) for (let j = i + 1; j < sound.length; j++) {
      const a = sound[i], b = sound[j];
      if (a.n === bass || b.n === bass) continue;
      if ([1, 2, 6, 10, 11].includes(Math.abs(a.n - b.n) % 12)) why.push(`${a.v} ${nm(a.n)} ~ ${b.v} ${nm(b.n)}`);
    }
    if (why.length) { bad++; if (showDis || listed.length < 6) listed.push(`    step ${t} (bar ${Math.floor(t / SPB) + 1}): ${why.join('; ')}`); }
  }
  console.log(`  ${tr.layers.length} layers, loop ${(total * 15 / tr.bpm).toFixed(1)} s; contexts ${tr.contexts.join(',')}; ` +
    `counterpoint ${beats - bad}/${beats} beats consonant (${beats ? Math.round(100 * (beats - bad) / beats) : 100}%)`);
  for (const l of listed) console.log(l);
  if (!showDis && bad > listed.length) console.log(`    ... ${bad - listed.length} more (--dis lists them)`);

  // Consecutive fifths and octaves: two single-note lines a perfect fifth or
  // octave apart on one beat and the same interval on the next, both having
  // moved the same way. A unison doubling (a shawm on the rebec's tune) is a
  // colour, not a voice, and is not counted.
  const at = (ln, t) => {
    const on = ln.ev.filter(([s, , d]) => (t >= s && t < s + d) || (s + d > total && t < s + d - total));
    return on.length === 1 ? on[0][1] : null;
  };
  const par = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    for (let t = 0; t < total; t += beat) {
      const u = (t + beat) % total;
      const a0 = at(lines[i], t), b0 = at(lines[j], t), a1 = at(lines[i], u), b1 = at(lines[j], u);
      if ([a0, b0, a1, b1].some((x) => x == null) || a0 === a1 || b0 === b1) continue;
      const i0 = Math.abs(a0 - b0), i1 = Math.abs(a1 - b1);
      if (!i0 || !i1 || Math.sign(a1 - a0) !== Math.sign(b1 - b0)) continue;
      const k0 = i0 % 12, k1 = i1 % 12;
      if ((k0 === 7 && k1 === 7) || (k0 === 0 && k1 === 0)) {
        par.push(`    step ${t} (bar ${Math.floor(t / SPB) + 1}): ${lines[i].name} ${nm(a0)}-${nm(a1)} / ${lines[j].name} ${nm(b0)}-${nm(b1)} (${k0 ? 'fifths' : 'octaves'})`);
      }
    }
  }
  console.log(`  parallels: ${par.length}`);
  for (const l of (showDis ? par : par.slice(0, 6))) console.log(l);
}

// Runtime creatures use creatureType; raw stat blocks still use type.
for (const [name, foe, expected] of [
  ['runtime Venomfang', {creatureType:'dragon',cr:8,legendary:{}}, 'dragon'],
  ['raw dragon', {type:'dragon',cr:8}, 'dragon'],
  ['small wyrmling', {creatureType:'dragon',cr:2}, 'battle'],
  ['legendary humanoid', {creatureType:'humanoid',cr:7,legendary:{}}, 'boss'],
]) {
  const cue=M.battleCue({units:[{side:'party',level:8},{side:'foe',...foe}]});
  if(cue.context!==expected)err(name,`expected ${expected}, got ${cue.context}`);
}
console.log(`\n${Object.keys(TRACKS).length} tracks, ${errors} errors, ${warns} warnings`);
process.exit(errors ? 1 : 0);
