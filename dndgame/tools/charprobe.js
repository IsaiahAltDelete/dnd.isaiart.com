// tools/charprobe.js — a tools/shot.mjs --script probe that paints character-art galleries over the running game.
//
//   $NODE tools/shot.mjs --scenario none --scale 4 --script tools/charprobe.js --out output/characters/sheet.png
//   $NODE tools/shot.mjs --scenario none --scale 4 --eval "window.CHARPROBE={page:'poses'}" --script tools/charprobe.js --out p.png
//
// Pages: sheet (classes, species, armed), folk (NPC families), poses (pose strips),
// portraits (dialogue busts). It draws with whatever the tree exports, so the
// same probe photographs an older checkout for a before/after pair: pages that
// need an API the tree lacks say so instead of throwing.

const V = Math.random();
const A = await import('/src/render/actor.js');
const S = await import('/src/render/sprites.js');
const { SPECIES } = await import('/src/data/species.js');
const cfg = window.CHARPROBE || {};
// `pages` cycles one page per `every` ms, so --frames N --every M photographs
// N pages in one browser run (the machine rations browsers).
const PAGES = cfg.pages || [cfg.page || 'sheet'];
const EVERY = cfg.every || 1200;
const Z = cfg.zoom || 3;

const cv = document.createElement('canvas');
cv.width = innerWidth; cv.height = innerHeight;
Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, imageRendering: 'pixelated' });
document.body.appendChild(cv);
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

const label = (s, x, y, col = '#f0e8c8') => { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); g.fillStyle = col; g.fillText(s, x, y); };

const BASE = {
  skin: '#e0a878', hair: '#4a3018', eye: '#37527a', hairStyle: 'short', beard: 'none',
  cloakStyle: 'auto', helmStyle: 'auto', bootStyle: 'auto', build: 'normal',
};
const CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
const HAIRS = ['wild', 'long', 'short', 'braid', 'short', 'shaved', 'short', 'ponytail', 'bob', 'curly', 'long', 'long'];
const BEARDS = ['full', 'none', 'none', 'full', 'stubble', 'none', 'none', 'none', 'none', 'none', 'goatee', 'full'];
const KIT = {
  barbarian: { mainHand: 'greataxe' }, bard: { mainHand: 'rapier' }, cleric: { mainHand: 'mace', offHand: 'shield' },
  druid: { mainHand: 'quarterstaff' }, fighter: { mainHand: 'longsword', offHand: 'shield', armor: 'chain-mail' },
  monk: {}, paladin: { mainHand: 'longsword', offHand: 'shield', armor: 'plate-armor' }, ranger: { mainHand: 'longbow' },
  rogue: { mainHand: 'dagger' }, sorcerer: {}, warlock: {}, wizard: { mainHand: 'quarterstaff' },
};

function classChar(id, i, armed = false, extra = {}) {
  const p = (A.CLASS_PALETTE && A.CLASS_PALETTE[id] && A.CLASS_PALETTE[id][0]) || {};
  return {
    name: id, speciesId: 'human', classes: [{ id }], size: 'medium',
    equipment: armed ? { ...KIT[id] } : {},
    appearance: {
      ...BASE, hairStyle: HAIRS[i % HAIRS.length], beard: BEARDS[i % BEARDS.length],
      skin: ['#f5d6b8', '#e8c19a', '#c08a5e', '#a06b45', '#7d4f33', '#d9a878'][i % 6],
      hair: ['#2e2119', '#8a5a2b', '#1b1410', '#b23a2a', '#d9a441', '#4a3222'][i % 6],
      outfit: p.main, outfitAlt: p.alt, accent: p.accent, metal: p.metal, leather: p.leather, cloth: p.cloth,
      ...extra,
    },
  };
}

const SPEC = ['human', 'elf', 'dwarf', 'halfling', 'dragonborn', 'gnome', 'orc', 'tiefling', 'aasimar', 'goliath', 'half-elf', 'half-orc', 'tabaxi'];
const SPEC_CLASS = ['fighter', 'wizard', 'cleric', 'rogue', 'paladin', 'bard', 'barbarian', 'warlock', 'sorcerer', 'fighter', 'ranger', 'barbarian', 'monk'];
function speciesChar(id, i) {
  const sp = SPECIES[id] || {};
  const cw = sp.colorways || {};
  const lin = (sp.lineages || [])[0];
  const lcw = (lin && lin.colorways) || {};
  const pick = (arr, k) => (arr && arr.length ? arr[k % arr.length] : undefined);
  const mods = { ...(sp.spriteMods || {}), ...((lin && lin.spriteMods) || {}) };
  const ch = classChar(SPEC_CLASS[i], i, false, {
    skin: pick(cw.skin || lcw.skin, 2) || '#e0a878', hair: pick(cw.hair || lcw.hair, 3) || '#3a2416',
    eye: pick(cw.eye || lcw.eye, 1) || '#37527a',
    beard: mods.beard === 'common' ? 'full' : 'none',
    horns: mods.horns ? ['curved', 'ram', 'straight'][i % 3] : null,
    tail: mods.tail ? (id === 'dragonborn' ? 'scaled' : id === 'tabaxi' ? 'cat' : 'thin') : null,
    ears: mods.ears && mods.ears !== 'round' ? mods.ears : null,
    hornColor: id === 'dragonborn' ? '#d8cdb4' : '#5a4a44',
  });
  ch.speciesId = id; ch.lineageId = lin ? lin.id : undefined;
  ch.size = (id === 'halfling' || id === 'gnome') ? 'small' : 'medium';
  ch.name = id;
  return ch;
}

function actor(ch, x, y, opts = {}) {
  g.save(); g.translate(x, y); g.scale(opts.z || Z, opts.z || Z);
  try { A.drawActor(g, ch, 8, 24, { shadow: false, ...opts }); } catch (e) { label('ERR', 0, 10, '#f44'); }
  g.restore();
}

const out = { pages: PAGES };
function paint(page) {
g.setTransform(1, 0, 0, 1, 0, 0);
g.fillStyle = cfg.bg || '#4a5a4a'; g.fillRect(0, 0, cv.width, cv.height);
g.font = '12px monospace';
if (page === 'sheet') {
  const cw = 16 * Z * 2 + 10;
  let y = 8;
  label('UNARMED (class dress)  front / side', 8, y + 10); y += 16;
  CLASSES.forEach((id, i) => {
    const x = 8 + i * cw, ch = classChar(id, i);
    label(id, x, y + 10, '#bfe0ff');
    actor(ch, x, y + 14, { dir: 'down', frame: 'down-0' });
    actor(ch, x + 16 * Z, y + 14, { dir: 'left', frame: 'left-0' });
  });
  y += 24 * Z + 26;
  label('ARMED  front / side', 8, y + 10); y += 16;
  CLASSES.forEach((id, i) => {
    const x = 8 + i * cw, ch = classChar(id, i, true);
    actor(ch, x, y + 4, { dir: 'down', frame: 'down-0' });
    actor(ch, x + 16 * Z, y + 4, { dir: 'right', frame: 'right-0' });
  });
  y += 24 * Z + 16;
  label('SPECIES', 8, y + 10); y += 16;
  SPEC.forEach((id, i) => {
    const x = 8 + i * (16 * Z * 2 + 2) * 0.92, ch = speciesChar(id, i);
    label(id.slice(0, 9), x, y + 10, '#bfe0ff');
    actor(ch, x, y + 14, { dir: 'down', frame: 'down-0' });
    actor(ch, x + 16 * Z, y + 14, { dir: 'left', frame: 'left-0' });
  });
  y += 24 * Z + 26;
  label('BACKS + at 1x / 2x (true size)', 8, y + 10); y += 16;
  CLASSES.forEach((id, i) => actor(classChar(id, i, true), 8 + i * 40, y, { dir: 'up', frame: 'up-0', z: 2 }));
  CLASSES.forEach((id, i) => actor(classChar(id, i, true), 8 + 12 * 40 + 16 + i * 20, y + 20, { dir: 'down', frame: 'down-0', z: 1 }));
  SPEC.forEach((id, i) => actor(speciesChar(id, i), 8 + 12 * 40 + 16 + i * 20, y + 48, { dir: 'down', frame: 'down-0', z: 1 }));
} else if (page === 'zoom') {
  // Big enough to judge single pixels: front, side, back of a cross-section.
  const ZZ = cfg.zz || 6;
  const list = [classChar('fighter', 4, true), classChar('wizard', 11, true), classChar('cleric', 2, true),
    classChar('rogue', 8, true), classChar('barbarian', 0, true), classChar('ranger', 7, true),
    classChar('paladin', 6, true), classChar('bard', 1, true), classChar('monk', 5), classChar('druid', 3, true),
    speciesChar('dwarf', 2), speciesChar('elf', 1), speciesChar('tiefling', 7), speciesChar('dragonborn', 4), speciesChar('half-orc', 11)];
  const cw = 16 * ZZ * 3 + 14, cols = Math.floor((cv.width - 8) / cw);
  list.forEach((ch, i) => {
    const x = 8 + (i % cols) * cw, y = 6 + Math.floor(i / cols) * (24 * ZZ + 18);
    label(`${ch.speciesId} ${ch.classes[0].id}`, x, y + 10, '#bfe0ff');
    ['down', 'left', 'up'].forEach((d, k) => actor(ch, x + k * 16 * ZZ, y + 14, { dir: d, frame: `${d}-0`, z: ZZ }));
  });
} else if (page === 'folk') {
  const FOLK = S.allSpriteNames().filter((n) => n.startsWith('npc-'));
  const cw = 16 * Z * 2 + 8, cols = Math.floor((cv.width - 16) / cw);
  FOLK.forEach((n, i) => {
    const x = 8 + (i % cols) * cw, y = 8 + Math.floor(i / cols) * (24 * Z + 20);
    label(n.replace('npc-', '').slice(0, 12), x, y + 10, '#bfe0ff');
    ['down', 'left'].forEach((d, k) => {
      g.save(); g.translate(x + k * 16 * Z, y + 14); g.scale(Z, Z);
      S.drawSpriteAt(g, n, `${d}-0`, 0, 0, {}); g.restore();
    });
  });
  out.folk = FOLK.length;
} else if (page === 'poses') {
  if (!A.actorPoseFrames) { label('this tree has no actorPoseFrames', 20, 40, '#f88'); out.missing = true; }
  else {
    const POSES = cfg.poses || ['idle', 'attack', 'cast', 'shoot', 'hurt', 'ko'];
    const who = cfg.who || [['fighter', true], ['wizard', true], ['ranger', true], ['cleric', true], ['monk', false], ['barbarian', true]];
    let y = 8;
    for (const [cls, armed] of who) {
      const i = CLASSES.indexOf(cls), ch = classChar(cls, i, armed);
      let x = 8;
      label(cls, x, y + 10, '#bfe0ff');
      for (const dir of (cfg.dirs || ['down', 'right'])) {
        for (const pose of POSES) {
          const fr = A.actorPoseFrames(ch, pose, dir);
          fr.forEach((f, k) => {
            if (k === 0 && y === 8) label(pose, x, y + 22 * 1 - 10, '#e0d090');
            actor(ch, x, y + 12, { dir, pose, poseFrame: k });
            x += 16 * Z + (k === fr.length - 1 ? 8 : 0);
          });
        }
        x += 12;
      }
      y += 24 * Z + 14;
    }
  }
} else if (page === 'portraits') {
  if (!A.drawPortrait) { label('this tree has no drawPortrait (old bust shown)', 20, 20, '#f88'); out.missing = true; }
  const list = [];
  CLASSES.forEach((id, i) => list.push(classChar(id, i, true)));
  SPEC.forEach((id, i) => list.push(speciesChar(id, i)));
  for (const n of ['npc-guard', 'npc-smith', 'npc-priest', 'npc-merchant', 'npc-noble', 'npc-watch', 'npc-dwarf', 'npc-elf', 'npc-hooded', 'npc-farmer', 'npc-scholar', 'npc-villager-f', 'npc-sellsword', 'npc-beggar']) {
    if (S.hasSprite(n)) list.push({ sprite: n, name: n, colorway: S.spriteDef(n).defaultColorway, speciesId: 'human', classes: [{ id: n.slice(4) }] });
  }
  const sz = cfg.size || 40, sc = cfg.scale || 3, cols = Math.floor((cv.width - 16) / (sz * sc + 10));
  list.forEach((ch, i) => {
    const x = 8 + (i % cols) * (sz * sc + 10), y = 30 + Math.floor(i / cols) * (sz * sc + 24);
    label(`${ch.speciesId === 'human' ? '' : ch.speciesId + ' '}${ch.classes[0].id}`, x, y - 4, '#bfe0ff');
    g.fillStyle = '#15121a'; g.fillRect(x, y, sz * sc, sz * sc);
    g.save(); g.scale(sc, sc);
    try {
      if (A.drawPortrait) A.drawPortrait(g, ch, x / sc, y / sc, sz, {});
      else A.drawActorBust(g, ch, x / sc, y / sc, sz);
    } catch (e) { label('ERR ' + e.message, x / sc, y / sc + 10, '#f44'); }
    g.restore();
  });
}
}
PAGES.forEach((p, i) => setTimeout(() => { try { paint(p); } catch (e) { label('probe error: ' + e.message, 20, 20, '#f44'); } }, i * EVERY));
return out;
