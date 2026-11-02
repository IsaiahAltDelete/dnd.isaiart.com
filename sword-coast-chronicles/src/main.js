// main.js — bootstrap. Loads every subsystem in dependency order, wires the
// cross-module glue that would otherwise cause circular imports, and hands
// control to the title screen.

import { Game } from './engine.js';
import { localStanding, npcDisposition } from './rules/reputation.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Save } from './core/save.js';
import { bus, EV } from './core/events.js';
import { FX } from './render/fx.js';
import { Stage } from './render/stage.js';
import { Layout } from './ui/layout.js';
import { Party } from './world/party.js';
import { newGameState, loadState, saveState, stateSummary, recordKill, progressQuests, advanceTime } from './state.js';
import { VERSION } from './constants.js';
import { cheat, Cheats, installCheatKeys } from './core/cheats.js';

// Registries that must run before anything draws.
import { registerCharacterSprites } from './render/spritedata_chars.js';
import { registerMonsterSprites } from './render/spritedata_monsters.js';
import { registerTiles } from './render/tiles.js';

// Rules glue.
import { restShort, restLong, serializeChar, deserializeChar, createCharacter, recalc } from './rules/character.js';
import { grantXp, pendingLevelsFor } from './rules/progression.js';
import { installDirector } from './rules/worlddirector.js';
import { installWorldTalk } from './ui/worldtalk.js';
import { installSites } from './world/sites.js';
import { installNoticeBoard } from './ui/noticeboard.js';

// Scenes.
import { TitleScene } from './ui/title.js';
import { CharCreateScene } from './ui/charcreate.js';
import { OverworldScene, travelTo } from './world/overworld.js';
import { LevelUpScene } from './ui/levelup.js';

const STEPS = [
  ['waking the sprites', () => { registerCharacterSprites(); }],
  ['rousing the bestiary', () => { registerMonsterSprites(); }],
  ['laying the flagstones', () => { registerTiles(); }],
  ['consulting the Player\'s Handbook', async () => {
    // Touch the big catalogues so any authoring error surfaces during the boot
    // bar rather than mid-battle.
    const [{ SPELLS }, { ITEMS }, { MONSTERS }] = await Promise.all([
      import('./data/spells.js'), import('./data/items.js'), import('./data/monsters.js'),
    ]);
    console.info(`[Sword Coast] ${Object.keys(SPELLS).length} spells, ${Object.keys(ITEMS).length} items, ${Object.keys(MONSTERS).length} creatures.`);
  }],
  ['tuning the lute', () => { /* Audio initialises on the first gesture. */ }],
];

/** Wire the bits that would otherwise be circular imports. */
function wireGlue() {
  Party._rest.short = restShort;
  Party._rest.long = restLong;

  // Settings -> subsystems.
  const s = Save.settings;
  Audio.setVolume(s.volMaster, s.volMusic, s.volSfx);
  Audio.muted = !!s.muted;
  FX.reducedMotion = !!s.reducedMotion;
  FX.enabled = true;
  if (s.bindings) Object.assign(Input.bindings, s.bindings);

  bus.on('settings:changed', () => {
    const t = Save.settings;
    Audio.setVolume(t.volMaster, t.volMusic, t.volSfx);
    Audio.muted = !!t.muted;
    FX.reducedMotion = !!t.reducedMotion;
    Save.saveSettings();
  });

  // Combat outcomes feed the campaign state.
  // Every emitter of EV.DEATH names the creature `ch` (combat.js, actions.js,
  // character.js, conditions.js). Destructuring `unit` here returned on the
  // first guard for every kill ever made, so the bestiary stayed empty, kills
  // never counted, and no `kill` quest objective could complete. `unit` is
  // still accepted so a future emitter using the combat word also lands.
  const recordedDeaths = new WeakSet();
  bus.on(EV.DEATH, ({ ch, unit }) => {
    const who = ch || unit;
    if (!Game.state || !who || who.side === 'party') return;
    // Damage resolution and the encounter death sweep both announce a death.
    // Count the creature once, including for kill quests and the bestiary.
    if (who.monsterId && !recordedDeaths.has(who)) {
      recordedDeaths.add(who);
      recordKill(Game.state, who.monsterId);
    }
  });
  bus.on(EV.CRIT, () => { if (Game.state) Game.state.stats.crits++; });
  bus.on(EV.SPELL_CAST, () => { if (Game.state) Game.state.stats.spellsCast++; });

  // The run tally counted only some of the things that move it: "Battles fought"
  // was incremented in world/overworld.js alone, so fights started from a
  // dialogue script, the rest screen or the cheat menu never registered, and
  // "Gold earned" ignored every coin taken off a corpse. Count them where the
  // events already fire, so every route into a fight is covered once.
  bus.on(EV.COMBAT_START, () => { if (Game.state) Game.state.stats.battles = (Game.state.stats.battles || 0) + 1; });
  bus.on(EV.COMBAT_END, ({ rewards }) => {
    const st = Game.state;
    const gold = Math.max(0, Number(rewards && rewards.gold) || 0);
    if (st && gold) st.stats.goldEarned = (st.stats.goldEarned || 0) + gold;
  });
  bus.on(EV.DAMAGE, ({ ch, amount }) => {
    const st = Game.state;
    const n = Math.max(0, Number(amount) || 0);
    if (!st || !ch || !n) return;
    // `side` is only set on units inside an encounter; out in the world, ask the
    // roster instead, so a trap or a fall still lands in the right column.
    const mine = ch.side === 'party' || Party.members.indexOf(ch) >= 0;
    if (mine) st.stats.damageTaken += n; else st.stats.damageDealt += n;
  });
  bus.on(EV.HEAL, ({ amount }) => {
    const st = Game.state;
    const n = Math.max(0, Number(amount) || 0);
    if (st && n) st.stats.healed = (st.stats.healed || 0) + n;
  });
  bus.on(EV.ITEM_GAIN, ({ id }) => { if (Game.state) progressQuests(Game.state, 'collect', id, 1); });
  bus.on(EV.MAP_ENTER, ({ mapId }) => { if (Game.state) progressQuests(Game.state, 'reach', mapId, 1); });

  // The world director: the calendar, its troubles, the endless work, and the
  // hands it has in conversation (topics), on the map (sites) and on the board.
  installDirector(() => Game.state, { grantXp: awardPartyXp });
  installWorldTalk();
  installSites();
  installNoticeBoard();
}

/** Award XP now; show earned choices once the current interaction has closed. */
export function awardPartyXp(amount) {
  const levelled = [];
  for (const m of Party.members) {
    const res = grantXp(m, amount);
    if (res && res.leveled) levelled.push(m);
  }
  return levelled;
}

/** Dialogue, combat and loading may all leave earned advancement pending. */
export function resumePendingAdvancement() {
  if (!Game.state || Game.transitioning || Game.top?.id !== 'overworld') return false;
  const levelled = Party.members.filter((m) => pendingLevelsFor(m) > 0);
  if (!levelled.length) return false;
  Game.push(new LevelUpScene(levelled));
  return true;
}

/** Start a fresh campaign: character creation, then Phandalin. */
export function newGame() {
  Party.clear();
  Game.state = newGameState(`sc-${Date.now()}`);
  Game.push(new CharCreateScene((hero) => {
    if (!hero) { Game.pop(); return; }
    Party.add(hero);
    Party.absorbKit(hero);                   // class kit + background gold -> the shared pack
    Party.addGold(15);                       // and a modest purse on top
    Game.replace(new OverworldScene());
    travelTo(Game.state.mapId, Game.state.x, Game.state.y, Game.state.dir);
    bus.emit(EV.TOAST, { text: 'Phandalin. The Triboar Trail runs east.' });
    autosave();
  }));
}

export function continueGame(slot) {
  const target = slot != null ? slot : Save.newest();
  if (target < 0) return false;
  const data = Save.read(target);
  if (!data) return false;
  Game.state = loadState(data, deserializeChar);
  for (const m of Party.all()) recalc(m);
  Game.replace(new OverworldScene());
  travelTo(Game.state.mapId, Game.state.x, Game.state.y, Game.state.dir);
  return true;
}

export function writeSave(slot) {
  if (!Game.state) return false;
  const payload = saveState(Game.state, serializeChar);
  payload.meta = stateSummary(Game.state);
  const res = Save.write(slot, payload);
  if (res !== false) bus.emit(EV.TOAST, { text: 'Journal updated.' });
  return res;
}

export function autosave() { return writeSave(0); }

// Playtime and the world clock tick with the game loop.
let clockAcc = 0;
bus.on('tick', (dt) => {
  if (!Game.state) return;
  resumePendingAdvancement();
  Game.state.playtime += dt;
  clockAcc += dt;
  if (clockAcc >= 1) { advanceTime(Game.state, 4 * clockAcc); clockAcc = 0; }
});

/**
 * Boot the game. Called by index.html.
 * hooks: { progress(pct, message), done(), gate: HTMLElement }
 */
export async function boot(hooks = {}) {
  const progress = hooks.progress || (() => {});

  for (let i = 0; i < STEPS.length; i++) {
    const [msg, fn] = STEPS[i];
    progress(i / STEPS.length, msg);
    await fn();
    // Yield so the boot bar actually paints between steps.
    await new Promise((r) => setTimeout(r, 16));
  }

  wireGlue();
  progress(1, 'the road awaits');

  const canvas = document.getElementById('game');
  Game.start(new TitleScene(), canvas);

  // Feed dt to the bus so state can tick without importing the engine.
  const origTick = Game._update.bind(Game);
  Game._update = (dt, elapsed = dt) => { origTick(dt, elapsed); bus.emit('tick', dt); };

  if (hooks.done) hooks.done();

  // Which tune a place opens with is seeded by the map and the day (core/audio.js, context rotation).
  Audio.setPlaceSource(() => ({ map: Game.state && Game.state.mapId, day: Game.state && Game.state.day }));

  // Browsers require a user gesture before audio may start.
  const gate = hooks.gate;
  if (gate) {
    gate.classList.add('show');
    const open = () => {
      gate.classList.remove('show');
      window.removeEventListener('keydown', open);
      gate.removeEventListener('pointerdown', open);
      try { Audio.init(); Audio.music('title'); } catch (e) { console.warn('audio unavailable', e); }
    };
    window.addEventListener('keydown', open, { once: false });
    gate.addEventListener('pointerdown', open);
  }

  // Handy console access while developing.
  installCheatKeys();
  window.SC = { Game, Party, Save, Audio, Input, FX, Stage, Layout, bus, EV, newGame, continueGame, writeSave,
                awardPartyXp, createCharacter, VERSION, cheat, Cheats };
  window.render_game_to_text = () => {
    const scene = Game.scenes.find(s => s.id === 'overworld');
    const active = Game.scenes.at(-1);
    return JSON.stringify({
      coordinates: 'tile origin top-left; x right, y down',
      mode: active?.id, map: scene?.map?.id,
      academy: active?.id === 'academy-training' ? active.snapshot() : null,
      creator: active?.id === 'charcreate' ? { page: active.rowKey(), name: active.draft.name, species: active.draft.speciesId, class: active.draft.classId, preview: active.previewMode, facing: active.previewDir, walking: active.previewWalk, options: active.rows.map(r => ({label:r.label, selected:r.selected, checked:r.checked, value:r.value, disabled:r.disabled})), issue:active.issue(active.step), firstIncomplete:active.firstIncomplete() } : null,
      journey: Game._trans?.journey || null,
      monsters: (scene?.entities?.list || []).filter(e=>e.kind==='monster'&&!e.hidden).map(e=>({id:e.monsterId,name:e.name,x:e.x,y:e.y,boss:e.boss})),
      standing: scene?.map ? localStanding(Game.state, scene.map) : null,
      trade: active?.id === 'shop' ? { terms: active.terms, refused: active.refused, tab: active.tab, rows: active.rows.map(r => ({ id: r.id, price: r.price, disabled: r.disabled })) } : null,
      combat: active?.enc ? { phase: active.phase, round: active.enc.round, current: active.enc.current?.name, budget: active._budget(), actions: active._currentRows().map(r => ({ id: r.id, name: r.name, enabled: r.enabled })) } : null,
      player: scene?.player ? { x: scene.player.x, y: scene.player.y, dir: scene.player.dir, moving: scene.player.moving, heldLight: scene.player.heldLightNow() } : null,
      npcs: (scene?.entities?.list || []).filter(e => e.kind === 'npc' && !e.hidden && !e.removed).map(e => ({ id: e.npcId, x: e.x, y: e.y, sprite: e.sprite, heldLight: e.heldLightNow(), disposition: e.tag === 'animal' ? 'neutral' : npcDisposition(Game.state, e, scene.map), fleeing: e.fleeT > 0, returningHome: !!e.returningHome, activity: e.data?.streetLife ? e.activity : null, interaction: e.social ? { phase:e.social.phase, partner:(e===e.social.host?e.social.partner:e.social.host).npcId } : null })),
    });
  };
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      const dt = ms / steps / 1000;
      Game.time += dt; Game._update(dt); Input.update(dt);
    }
    Game._draw();
  };
  window.cheat = cheat;   // short alias; `cheat.help()` lists everything
  console.info(`Sword Coast Chronicles v${VERSION}`);
  console.info('%cTesting: type  cheat.help()  — or type "xyzzy" in the game window for explore mode.',
    'color:#e3b34a');
}
