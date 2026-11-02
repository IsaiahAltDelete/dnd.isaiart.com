import assert from 'node:assert/strict';
import fs from 'node:fs';
import { grantXp, pendingLevelsFor, pendingChoicesFor } from '../src/rules/progression.js';
import { SPELLS } from '../src/data/spells.js';
import { createCharacter, serializeChar, deserializeChar } from '../src/rules/character.js';
import { resumePendingAdvancement, awardPartyXp } from '../src/main.js';
import { LevelUpScene } from '../src/ui/levelup.js';
import { Game } from '../src/engine.js';
import { Party } from '../src/world/party.js';
import { SpellbookScene, PartyScene } from '../src/ui/menus.js';
import { canPrepare } from '../src/rules/spellcasting.js';
import { rememberedMapOptions, OverworldScene } from '../src/world/overworld.js';
import { loadMap } from '../src/world/maps.js';
import { generateDungeon } from '../src/world/mapgen.js';
import { TF } from '../src/world/tilemap.js';

const checks = [];
function check(name, run) { run(); checks.push(name); }
check('Generated dungeon danger patches can encounter enemies, with safe tiles and opt-out preserved', () => {
  for (const theme of ['dungeon', 'crypt', 'mine']) {
    const map = generateDungeon({ seed: 'encounter-playtest', theme, depth: 3 });
    let active = 0, quiet = 0;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (map.solidAt(x, y)) continue;
      const info = map.encounterAt(x, y);
      if (map.flagAt(x, y) & TF.ENCOUNTER) { assert.ok(info?.rate > 0); active++; }
      else { assert.equal(info, null); quiet++; }
    }
    assert.ok(active > 0, `${theme} has danger patches`);
    assert.ok(quiet > 0, `${theme} has quiet floor`);
  }
  const disabled = generateDungeon({ seed: 'encounter-playtest', encounterRate: 0 });
  assert.equal(disabled.encounterRate, 0);
  const custom = generateDungeon({ seed: 'encounter-playtest', encounterRate: 0.04, encounterTable: 'redbrand-patrol' });
  assert.equal(custom.encounterRate, 0.04);
  assert.equal(custom.encounterTable, 'redbrand-patrol');
});
check('Dungeon encounter steps start a battle only on active danger patches', () => {
  const map = generateDungeon({ seed: 'encounter-step', theme: 'dungeon' });
  let danger, quiet;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.solidAt(x, y)) continue;
    if (map.flagAt(x, y) & TF.ENCOUNTER) danger = { x, y };
    else quiet = { x, y };
  }
  assert.ok(danger && quiet);
  let started = 0;
  const scene = Object.create(OverworldScene.prototype);
  Object.assign(scene, { map, encounterGrace: 0, stepsToEncounter: 1,
    _encounterScale: () => 0.5,
    _resetEncounterCounter() { this.stepsToEncounter = 30; },
    _startWildEncounter(info, x, y) {
      assert.ok(info.rate > 0); assert.deepEqual({ x, y }, danger); started++; return true;
    },
  });
  assert.equal(scene._tickEncounter(quiet.x, quiet.y), false);
  assert.equal(scene.stepsToEncounter, 1);
  assert.equal(scene._tickEncounter(danger.x, danger.y), true);
  assert.equal(started, 1);
  map.encounterRate = 0; scene.stepsToEncounter = 1;
  assert.equal(scene._tickEncounter(danger.x, danger.y), false);
  assert.equal(started, 1);
});
check('Ordinary procedural passage doors are traversable; locked vaults remain locked', () => {
  let doors = 0, locks = 0;
  for (const theme of ['dungeon', 'crypt', 'mine']) for (let seed = 0; seed < 5; seed++) {
    const map = generateDungeon({ seed: `door-playtest-${seed}`, theme, depth: 1, size: 'medium' });
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!(map.flagAt(x, y) & TF.DOOR)) continue;
      const lock = map.triggers.find(t => t.x === x && t.y === y && t.data?.kind === 'locked-door');
      if (lock) { locks++; assert.ok(map.solidAt(x, y)); }
      else { doors++; assert.equal(map.solidAt(x, y), false, `${theme} ${seed}: ${x},${y}`); }
    }
  }
  assert.ok(doors > 0); assert.ok(locks > 0);
});
check('Dungeon entry options survive saving and reproduce the same map', () => {
  const state = { seed: 'live-save-regression' };
  const id = 'redbrand-hideout';
  const before = rememberedMapOptions(state, id, { depth: 1, theme: 'dungeon', fresh: true });
  const restored = JSON.parse(JSON.stringify(state));
  const after = rememberedMapOptions(restored, id);
  assert.deepEqual(after, { depth: 1, theme: 'dungeon' });
  const build = opts => loadMap(id, { ...opts, seed: `${state.seed}:${id}:${opts.depth || 0}`, cache: false, entities: false, state: {} }).serialize();
  const first = build(before), second = build(after);
  for (const key of ['ground', 'deco', 'over', 'flags', 'spawn', 'exits', 'triggers']) assert.deepEqual(second[key], first[key], key);
  assert.notDeepEqual(build({}).ground, first.ground, 'Original missing-depth path changed the layout');
  assert.deepEqual(rememberedMapOptions(restored, 'phandalin'), {});
  assert.equal(rememberedMapOptions(restored, id, { depth: 2 }).depth, 2);
  assert.equal(rememberedMapOptions(restored, id).depth, 2);
});
check('Starting wizard spells remain preparable after learning new book spells', () => {
  const wizard = createCharacter({ classId: 'wizard', speciesId: 'human', level: 3 });
  wizard.spells.known = ['mage-armor']; wizard.spells.book = ['shatter']; wizard.spells.prepared = [];
  const restored = deserializeChar(serializeChar(wizard));
  assert.equal(canPrepare(restored, 'mage-armor'), true);
  assert.equal(canPrepare(restored, 'shatter'), true);
  assert.equal(canPrepare(restored, 'invisibility'), false);
  restored.spells.book = [];
  assert.equal(canPrepare(restored, 'mage-armor'), true);
  assert.equal(canPrepare(restored, 'invisibility'), false);
});
check('Scribed unprepared spells remain available in the spellbook menu', () => {
  const wizard = createCharacter({ classId: 'wizard', speciesId: 'human', level: 3 });
  wizard.spells.book = ['misty-step', 'shatter'];
  wizard.spells.prepared = ['misty-step'];
  const restored = deserializeChar(serializeChar(wizard));
  const menu = new SpellbookScene();
  menu.casters = [restored]; menu.caster = 0;
  const rows = menu._build();
  assert.ok(rows.some(r => r.id === 'shatter' && !r.prepared));
  assert.ok(!new PartyScene()._attackList(restored).some(r => r.name === 'Shatter'));
  restored.spells.prepared = [];
  assert.ok(menu._build().some(r => r.id === 'misty-step' && !r.prepared));
});
for (const [before, gained, spell] of [[2, 3, 'misty-step'], [4, 5, 'fireball']]) {
  check(`Wizard ${gained} can learn newly unlocked spells`, () => {
    const wizard = createCharacter({ classId: 'wizard', speciesId: 'human', level: before });
    const choices = pendingChoicesFor(wizard, gained);
    const book = choices.find((c) => c.id === 'spellbook');
    assert.ok(book.options.some((o) => o.id === spell && !o.disabled));
    assert.ok(book.options.every((o) => SPELLS[o.id].level <= Math.ceil(gained / 2)));
  });
}
check('Multiclass shared slots do not unlock higher wizard spells', () => {
  const wizard = createCharacter({ classId: 'wizard', speciesId: 'human', level: 1 });
  wizard.classes.push({ id: 'cleric', level: 8 }); wizard.level = 9;
  const book = pendingChoicesFor(wizard, 10, { classId: 'wizard' }).find((c) => c.id === 'spellbook');
  assert.ok(book.options.every((o) => SPELLS[o.id].level === 1));
});
const hero = createCharacter({ name: 'Advancement regression', classId: 'wizard', speciesId: 'human', level: 1 });
hero.xp = 0;
check('Dialogue XP crosses level two without applying choices', () => {
  grantXp(hero, 400);
  assert.equal(hero.level, 1);
  assert.equal(hero.flags.pendingLevels, 1);
});
check('Quest reward counts each earned level once', () => {
  grantXp(hero, 840);
  assert.equal(hero.xp, 1240);
  assert.equal(hero.flags.pendingLevels, 2);
  grantXp(hero, 1);
  assert.equal(hero.flags.pendingLevels, 2);
});
check('Old inflated pending flag cannot grant extra levels', () => {
  hero.flags.pendingLevels = 9;
  assert.equal(new LevelUpScene([hero])._unitsLeft(hero), 2);
});
check('Saved XP recovers missing pending flag', () => {
  delete hero.flags.pendingLevels;
  const restored = deserializeChar(serializeChar(hero));
  assert.equal(pendingLevelsFor(restored), 2);
});
Party.clear(); Party.add(hero);
Game.state = {};
const originalPush = Game.push;
Game.push = function(scene) { this.scenes.push(scene); return scene; };
try {
  for (const id of ['dialogue', 'combat', 'menu', 'save', 'levelup', 'title']) {
    check(`Advancement does not interrupt ${id}`, () => {
      Game.scenes = [{ id }];
      assert.equal(resumePendingAdvancement(), false);
      assert.equal(Game.scenes.length, 1);
    });
  }
  check('Journey transition finishes before advancement', () => {
    Game.scenes = [{ id: 'overworld' }]; Game._trans = {};
    assert.equal(resumePendingAdvancement(), false); Game._trans = null;
  });
  check('Returning to the world opens one advancement flow', () => {
    assert.equal(resumePendingAdvancement(), true);
    assert.equal(Game.top.id, 'levelup');
    assert.equal(resumePendingAdvancement(), false);
    assert.equal(Game.scenes.length, 2);
  });
  check('Party XP during dialogue leaves the dialogue on top', () => {
    Game.scenes = [{ id: 'dialogue' }];
    awardPartyXp(20);
    assert.equal(Game.top.id, 'dialogue');
  });
  check('Applied levels exhaust the earned choices', () => {
    hero.level = 2; assert.equal(pendingLevelsFor(hero), 1);
    hero.level = 3; assert.equal(pendingLevelsFor(hero), 0);
    Game.scenes = [{ id: 'overworld' }];
    assert.equal(resumePendingAdvancement(), false);
  });
} finally { Game.push = originalPush; Party.clear(); Game.scenes = []; Game.state = null; }
fs.mkdirSync('output/live-wizard', { recursive: true });
fs.writeFileSync('output/live-wizard/advancement-checks.json', JSON.stringify({ passed: checks.length, checks }, null, 2));
console.log(`${checks.length} advancement checks passed`);
