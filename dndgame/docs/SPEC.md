# SWORD COAST CHRONICLES — Engineering Spec

A top-down, sprite-based, tile-walking D&D 5.5e (2024 rules) RPG set in the
**Forgotten Realms**, on the Sword Coast. Zero dependencies, zero build step.
Vanilla ES modules + Canvas2D. Served from the project root by
`python -m http.server 8765`.

Feel: classic GBA-era top-down JRPG overworld (walk the world with a party trailing
behind you, talk to NPCs, enter buildings, get ambushed in the wilds) fused with a
full tactical D&D 5.5e combat engine on a 5-ft grid.

---

## 0. HARD RULES FOR ALL CONTRIBUTORS

**SETTING RULE (non-negotiable):** This is the published Forgotten Realms. Every
place, deity, faction, organisation, monster and NPC name must come from D&D canon
(Phandalin, Neverwinter, Waterdeep, Triboar Trail, Neverwinter Wood, Cragmaw Castle,
Wave Echo Cave, Undermountain, Tymora, Lathander, Tempus, the Harpers, the
Zhentarim, the Lords' Alliance…). **Never invent generic portmanteau fantasy
names** ("Aetherfall", "Manacolony", "Kaelan" — the user explicitly rejects these).
When a minor NPC or shop needs a new name, build it from the real naming
conventions of the setting's cultures — Chondathan/Illuskan/Tethyrian human names,
canonical Dwarvish/Elvish/Halfling patterns — and keep it plain and period-correct
(e.g. "Elmar Barthen", "Toblen Stonehill", "Halia Thornton").

1. **ES modules only.** `import { x } from '../core/rng.js'` — always include the
   `.js` extension, always relative paths. No bundler, no npm, no CDN.
2. **No external assets.** Every sprite/tile/sound is generated procedurally in code.
   No image files, no audio files, no web fonts.
3. **Never mutate an imported data table.** Data modules export frozen catalogues;
   instances are created by cloning.
4. **Pure data modules must not import anything except other data modules and
   `core/` helpers.** No circular imports between `data/` and `rules/`.
5. **Every exported symbol listed in this spec must exist with the exact name and
   signature given.** Extra internal helpers are fine; missing/renamed exports break
   the build.
6. **Every file starts with a one-line comment naming the module and its role.**
7. Target: readable, dense, commented where the D&D rule being implemented is
   non-obvious. Prefer plain functions and plain objects over classes except where
   the spec says `class`.
8. Use `Object.freeze`/`deepFreeze` on exported catalogues.
9. All randomness goes through `core/rng.js` — never call `Math.random()` directly.
10. Coordinates: `x` grows right, `y` grows down. Tile coords are integers; pixel
    coords are floats. `TILE = 16`.

---

## 1. RUNTIME CONSTANTS (`src/constants.js` — already written, import from here)

```js
export const TILE = 16;          // px per tile / 5 ft
export const VIEW_W = 400;       // logical canvas width  (25 tiles)
export const VIEW_H = 240;       // logical canvas height (15 tiles)
export const SPRITE_W = 16;      // humanoid sprite width
export const SPRITE_H = 24;      // humanoid sprite height (feet anchored at tile bottom)
export const DIRS = ['down','left','right','up'];
```

---

## 2. CORE (already written — read before using)

### `src/core/rng.js`
```js
makeRNG(seed:number|string) -> RNG
// RNG: { next():float[0,1), int(a,b):inclusive, float(a,b), pick(arr), pickWeighted(arr, wfn),
//        shuffle(arr):newArr, chance(p):bool, sign(), gauss(mean,sd), fork(salt):RNG, seed }
export const rng           // global RNG, reseeded on new game
export function reseed(seed)
export function hashStr(s):uint32
```

### `src/core/dice.js`
```js
roll(n, sides, r=rng) -> { total, rolls:number[] }
rollExpr(expr, r=rng) -> { total, rolls, mod, expr }   // "2d6+3", "1d8", "4d6kh3", "2d10-1"
d20(mod=0, opts={adv,dis,critRange=20,bonusDice}) -> { total, natural, rolls, mod, crit, fumble, adv, dis }
avgExpr(expr) -> number
maxExpr(expr) -> number
parseDice(expr) -> { n, sides, mod, keep }
```

### `src/core/events.js`  `bus.on/off/once/emit`
### `src/core/input.js`
```js
Input.update()                       // call once per frame AFTER scene update
Input.down(action):bool              // held
Input.pressed(action):bool           // pressed this frame
Input.consume(action):bool           // pressed + swallow
Input.dir() -> {x,y}                 // -1..1 from dpad
Input.anyPressed():bool
Input.bindings                       // { up:[...codes], ... }
Input.mouse -> {x,y,down,clicked}    // in LOGICAL canvas coords
Input.setMouseTransform(scale, ox, oy)
// actions: up down left right confirm cancel menu run interact map journal party
//          next prev tab1..tab5 debug
```

### `src/core/audio.js`
```js
Audio.init()                  // must be called from a user gesture
Audio.sfx(name, opts={})      // procedural WebAudio blips
Audio.music(trackId)          // procedural looping chiptune; null to stop
Audio.setVolume(master, music, sfx)
Audio.muted
// sfx: cursor select back error open close step door hit hitcrit miss slash arrow
//      spell heal fire ice thunder buff debuff levelup coin item quest death
//      encounter victory defeat dice
// tracks: title town field battle boss dungeon victory inn shop tense
```

### `src/core/save.js`
```js
Save.write(slot:int, data:object)
Save.read(slot:int) -> object|null
Save.list() -> [{slot, name, level, playtime, savedAt, biome}|null] x 4
Save.erase(slot)
Save.exportSlot(slot) -> string   // base64 json
Save.importSlot(slot, str) -> bool
Save.settings  // persisted settings object {volMaster, volMusic, volSfx, speed, ...}
Save.saveSettings()
```

### `src/engine.js` — game loop + scene stack
```js
export const Game = {
  canvas, ctx, scale,
  scenes: [],                      // stack; top is active
  push(scene), pop(), replace(scene), get top(),
  start(rootScene),
  time,                            // seconds since start
  dt,                              // last frame delta (clamped 0..0.05)
  flags: {},                       // global gameplay flags
  state: null,                     // the GameState (see §7)
  transition(kind, fn)             // 'fade'|'wipe'|'battle' ; fn runs at midpoint
}
```
**Scene interface** (plain object or class instance):
```js
{
  enter?(prev),        // called when pushed / revealed
  exit?(next),         // called when popped / covered
  update?(dt),         // logic
  draw?(ctx),          // render at logical resolution
  drawOver?(ctx),      // drawn even when this scene is NOT top (for stacked scenes)
  opaque?: bool,       // if false, the scene below is drawn first (default true)
  pausesBelow?: bool,  // default true
}
```

### `src/render/sprites.js` — procedural pixel sprite engine
```js
// Sprites are authored as arrays of equal-length strings; each char is a palette key.
// '.' / ' ' = transparent.
defineSprite(name, {
  w, h,
  frames: { idle:[...rows], walk0:[...], ... },   // frame name -> rows
  palette: { K:'#000', s:'SKIN', h:'HAIR', a:'MAIN', b:'ALT', m:'METAL', ... }
})
// Palette values that are UPPERCASE TOKENS are resolved per-instance from a
// "colorway" object, letting one sprite be recolored per character.
// Tokens: SKIN SKIN_D SKIN_L HAIR HAIR_D EYE MAIN MAIN_D ALT ALT_D METAL METAL_D
//         TRIM LEATHER LEATHER_D CLOTH CLOTH_D ACCENT
getSprite(name, frame, colorway=null) -> HTMLCanvasElement   // memoised
drawSprite(ctx, name, frame, x, y, opts={ flip, scale=1, alpha=1, tint, tintAmt, shadow })
hasSprite(name):bool
spriteFrames(name):string[]
makeColorway(seedObj) -> {SKIN:'#..', ...}     // fills defaults + derives _D/_L shades
shadeHex(hex, amt) -> hex
```

### `src/render/fx.js`
```js
FX.update(dt); FX.draw(ctx, camX, camY)
FX.floater(x,y,text,color,opts)   FX.burst(x,y,color,count,opts)
FX.shake(amount, dur)   FX.flash(color, dur)   FX.beam(x1,y1,x2,y2,color,dur)
FX.projectile(x1,y1,x2,y2,{color,shape,speed,onHit})
FX.ring(x,y,radius,color,dur)  FX.slash(x,y,dir,color)
FX.shakeOffset() -> {x,y}
FX.clear()
```

---

## 3. DATA MODULES (`src/data/`)

All catalogues are objects keyed by lowercase-kebab id. Every entry has `id`, `name`,
and `desc` (short flavour/rules text, 1–3 sentences).

### `species.js` — 2024 PHB species + extras
```js
export const SPECIES = { 'human': {...}, ... }
// Entry: {
//   id, name, desc,
//   size:'medium'|'small', speed:30, darkvision:0|60|120,
//   traits:[{id,name,desc,level:1,mech:{...}}],       // mech is read by rules/character.js
//   lineages:[{id,name,desc,traits:[...]}] | null,    // e.g. dragonborn ancestries, elf lineages
//   resist:[], immune:[],
//   skillGrants:[], toolGrants:[], languageCount:2,
//   colorways: { skin:['#..'], hair:['#..'], eye:['#..'] },  // customization palettes
//   spriteMods: { ears:'pointed'|'none', horns:bool, tail:bool, beard:bool, height:0.9..1.1, build:'slim'|'broad' }
// }
```
Required species (13): human, elf, dwarf, halfling, dragonborn, gnome, orc, tiefling,
aasimar, goliath, half-elf, half-orc, tabaxi. Elf lineages: high/wood/drow. Gnome:
forest/rock. Tiefling: abyssal/chthonic/infernal. Dragonborn: 10 ancestries.
Aasimar, goliath (giant ancestries) per 2024 PHB.

**`mech` vocabulary** (the ONLY keys `rules/character.js` understands — use these):
```js
{ asi:{str:1,...}, speedBonus:+n, darkvision:n, resist:['fire'], immune:[], vuln:[],
  condImmune:['charmed'], advSaveVs:['poison'], advVs:['charmed'],
  skillProf:['perception'], skillExpertise:[], toolProf:[], weaponProf:[], armorProf:[],
  saveProf:['dex'], hpPerLevel:+1, maxHpBonus:+n, acFormula:{base:13,addDex:true,cap:null},
  unarmedDie:'1d6', naturalWeapon:{name,die,type},
  cantrip:{spellId|choose:'wizard', ability:'cha'},
  spellPerRest:[{spellId, level:3, ability:'cha', uses:1, recharge:'long'}],
  extraAttack:n, critRange:19, initiativeBonus:n, profToInitiative:bool,
  carryMult:2, jumpMult:2, breathWeapon:{die:'1d10',type:'fire',shape:'line'|'cone',save:'dex'},
  resource:{id,name,max:'prof'|n,recharge:'short'|'long'},
  grantFeat:'lucky', passive:'...'  // freeform tag consumed by combat hooks
}
```

### `classes.js` — all 12 classes
```js
export const CLASSES = { fighter:{...}, ... }
// Entry: {
//  id, name, desc, hitDie:10, primary:['str','dex'], saves:['str','con'],
//  armorProf:['light','medium','heavy','shields'], weaponProf:['simple','martial'],
//  toolProf:[], skillChoices:{count:2, from:[...]},
//  startingGold:'5d4*10',
//  startingKits:[{id,name,items:[[itemId,qty],...], gold:n}],
//  spellcasting: null | { ability:'int', type:'prepared'|'known'|'pact',
//      cantripsKnown:[..21 entries by level..], prepFormula:'level+int'|'half+int'|table,
//      spellsKnownTable:[...]|null, list:'wizard', ritual:bool, focus:'arcane'|'holy'|'druidic',
//      slotTable:'full'|'half'|'third'|'pact' },
//  features: { 1:[featureObj], 2:[...], ..., 20:[...] },
//  subclassLevel:3, subclasses:['champion','battle-master',...],
//  weaponMasteryCount:[0,3,3,3,4,...]  // per level, null if class has none
// }
// featureObj: { id, name, desc, mech:{...}(same vocabulary + class extras), uses?:{max,recharge},
//               choice?:{ type:'fightingStyle'|'maneuver'|'metamagic'|'invocation'|'expertise'|
//                          'spell'|'cantrip'|'feat'|'asi'|'skill'|'mastery'|'subclassOption',
//                         count:n, from:[ids]|'auto' } }
```
Classes: barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue,
sorcerer, warlock, wizard. **Levels 1–20 must all be populated.**

### `subclasses.js`
```js
export const SUBCLASSES = { champion:{ id, name, classId:'fighter', desc, features:{3:[..],7:[..],10:[..],15:[..],18:[..]}, spells:{3:['bless']} }, ... }
```
Minimum **4 subclasses per class** (48 total), using the 2024 PHB set where possible.

### `spells.js`
```js
export const SPELLS = { 'fire-bolt': {...}, ... }
// Entry: {
//  id, name, level:0..9, school:'evocation', desc,
//  castTime:'action'|'bonus'|'reaction'|'1 minute'|'ritual', reactionTrigger?:'',
//  range:'self'|'touch'|number(feet)|'sight', ritual:bool, concentration:bool,
//  components:{v,s,m:''|string, consumed:bool},
//  duration:'instant'|'1 round'|'1 minute'|'10 minutes'|'1 hour'|'8 hours'|'24 hours'|'until dispelled',
//  target:{ kind:'creature'|'point'|'self'|'area'|'line'|'cone'|'sphere'|'cube'|'wall'|'multi',
//           count:1, radius:20, length:30, width:5, maxTargets:n, allowAllies:bool },
//  attack:null|'ranged'|'melee',
//  save:null|{ ability:'dex', onSuccess:'half'|'none'|'negate', repeatEachTurn:bool },
//  damage:null|{ dice:'1d10', type:'fire', scale:{ perSlot:'1d10', cantripLevels:[5,11,17] } },
//  heal:null|{ dice:'1d8', mod:'spell', scale:{perSlot:'1d8'} },
//  effects:[ {kind:'condition', id:'prone', duration:'1 minute'}, {kind:'buff', ...},
//            {kind:'summon', monsterId, count}, {kind:'teleport', distance},
//            {kind:'temphp', dice}, {kind:'shield', ac:5}, {kind:'utility', tag:'light'} ],
//  lists:['wizard','sorcerer'],
//  tags:['damage','control','buff','heal','utility','movement','summon'],
//  ai:{ role:'nuke'|'aoe'|'heal'|'buff'|'debuff'|'control'|'utility', weight:1.0 },
//  vfx:{ style:'bolt'|'beam'|'burst'|'nova'|'rain'|'aura'|'slash'|'chain'|'wave', color:'#ff6a2a' }
// }
```
Minimum **190 spells**: complete cantrip lists for every casting class, and a strong
spread from level 1 through 9 (all the iconic ones: magic missile, shield, healing
word, fireball, counterspell, polymorph, wall of force, meteor swarm, wish, etc.).

### `items.js`
```js
export const ITEMS = { 'longsword': {...}, ... }
// Entry base: { id, name, kind:'weapon'|'armor'|'shield'|'potion'|'scroll'|'wand'|'ring'|
//               'amulet'|'cloak'|'boots'|'gloves'|'helm'|'ammo'|'tool'|'food'|'gem'|'quest'|'material',
//               desc, cost:number(gp), weight, rarity:'common'|'uncommon'|'rare'|'very-rare'|'legendary'|'artifact',
//               icon:'sword', tint:'#..', stack:bool, sellable:bool }
// weapon adds: { die:'1d8', dtype:'slashing', props:['versatile','finesse','heavy','light',
//                 'reach','thrown','two-handed','loading','ammunition','ranged'],
//                versatileDie:'1d10', range:[20,60], category:'simple'|'martial',
//                mastery:'sap'|'vex'|'topple'|'cleave'|'graze'|'nick'|'push'|'slow',
//                magic:{ atk:+1, dmg:+1, bonusDice:'1d6', bonusType:'fire', onHit:{...} } }
// armor adds:  { ac:14, addDex:true, dexCap:2, category:'light'|'medium'|'heavy',
//                strReq:13, stealthDis:true }
// consumable adds: { use:{ kind:'heal', dice:'2d4+2' } | { kind:'cure', conditions:[] } |
//                    { kind:'buff', ... } | { kind:'spell', spellId, level } , charges? }
// wearable adds: { slot:'ring'|'amulet'|..., mech:{...} }
export const WEAPON_MASTERY = { cleave:{name,desc}, ... }   // all 8, 2024 rules
export const AMMO_TYPES, TOOL_KITS, SHOP_TABLES
export function itemsByKind(kind)
export function randomLoot(cr, r) -> itemId[]
export function magicVariant(baseId, tier) -> item   // generates "+1 Longsword" etc.
```
Minimum: **all 2024 PHB simple + martial weapons** (~37), all armors (~13), 60+
consumables/utility, and **80+ magic items** across rarities.

### `monsters.js`
```js
export const MONSTERS = { 'goblin': {...}, ... }
// Entry: {
//  id, name, cr:0.25, type:'humanoid'|'beast'|'undead'|'fiend'|'dragon'|'aberration'|
//        'construct'|'elemental'|'fey'|'giant'|'monstrosity'|'ooze'|'plant'|'celestial',
//  size:'tiny'|'small'|'medium'|'large'|'huge'|'gargantuan',
//  ac:15, hpDice:'2d6', speed:30, fly:0, swim:0, burrow:0, climb:0,
//  abilities:{str:8,dex:14,con:10,int:10,wis:8,cha:8},
//  saveProf:[], skills:{stealth:6}, senses:{darkvision:60}, passivePerception:9,
//  resist:[], immune:[], vuln:[], condImmune:[],
//  traits:[{name,desc,mech:{}}],
//  actions:[{ id,name, kind:'attack'|'save'|'heal'|'summon'|'utility'|'multiattack',
//             reach:5|range:[20,60], atkBonus:4, dice:'1d6+2', dtype:'slashing',
//             save:{ability:'dex',dc:12,onSuccess:'half'}, target:{kind,radius},
//             effects:[], uses:{max,recharge:'5-6'|'short'|'long'}, ai:{role,weight} }],
//  bonusActions:[], reactions:[], legendary:{count:3, actions:[]}|null, lair:null|{...},
//  ai:{ archetype:'brute'|'skirmisher'|'archer'|'caster'|'support'|'ambusher'|'swarm'|'tank'|'boss',
//       aggression:0..1, selfPreserve:0..1, preferredRange:5 },
//  xp:50, loot:{ gold:'2d6', table:[[itemId,chance],...] },
//  sprite:'goblin', tint:null, biomes:['forest','cave'], groupSize:[2,5],
//  faction:'goblinoid', boss:false, elite:false
// }
export const MONSTER_GROUPS = { 'goblin-raid': { name, biomes:[], cr, members:[[id,min,max]] } }
export function monstersByBiome(biome, crRange)
export function monstersByCR(min, max)
export const CR_XP = { '0':10, '1/8':25, ... }
```
Minimum **120 monsters**, CR 0 through 24, spread across every biome, plus 15+
named/unique bosses with legendary actions.

### `backgrounds.js`
```js
export const BACKGROUNDS = { acolyte:{ id,name,desc, asi:['int','wis','cha'], originFeat:'magic-initiate-cleric',
   skills:['insight','religion'], tools:['calligraphers-supplies'], equipment:[[id,qty]], gold:8 } }
export const FEATS = { 'alert':{ id,name,category:'origin'|'general'|'fighting-style'|'epic-boon',
   desc, prereq:{level:4,ability:{str:13}}|null, asi:['str','dex']|null, repeatable:bool, mech:{...} } }
export const FIGHTING_STYLES = { archery:{...} }
export const LANGUAGES = [...]
```
Minimum: 16 backgrounds, all 2024 origin feats (~16), 30+ general feats, all
fighting styles, 10 epic boons.

### `npcs.js`, `quests.js`, `dialogue.js`, `lore.js`
```js
// npcs.js  — canonical Phandalin cast: Toblen Stonehill (Stonehill Inn), Elmar Barthen
// (Barthen's Provisions), Linene Graywind (Lionshield Coster), Sister Garaele (Shrine of
// Luck / Harper), Halia Thornton (Miner's Exchange / Zhentarim), Harbin Wester (townmaster),
// Daran Edermath (orchard / Order of the Gauntlet), Qelline Alderleaf, Sildar Hallwinter
// (Lords' Alliance), Gundren Rockseeker, Carp Alderleaf, Pip & Nars Dendrar, Narth, Trilena.
export const NPCS = { 'toblen-stonehill': { id, name, role:'shopkeeper'|'questgiver'|'trainer'|'innkeep'|
   'recruit'|'flavor'|'guard'|'priest', sprite, colorway, map:'phandalin', x, y, dir,
   wander:0|1|2, shop:'provisions'|null, dialogue:'toblen', quests:[], faction:'harpers'|null, schedule:null } }
export const RECRUITS = [ { id, name, speciesId, lineageId, classId, subclassId, background,
   level:1, abilities:{...}, personality, cost:gp, bio, colorway, appearance, joinDialogue } ]  // 16+
// quests.js
export const QUESTS = { 'lost-mine-cragmaw': { id, title, giver, type:'kill'|'fetch'|'escort'|'clear'|'boss'|'deliver',
   minLevel, desc, steps:[{kind,target,count,map?}], rewards:{xp,gold,items:[]}, next:null, repeatable:bool } }
export function generateQuest(partyLevel, rngi) -> quest   // endless procedural quests
// dialogue.js
export const DIALOGUE = { toblen: { start:'n1', nodes:{ n1:{ text:'...', speaker:'Toblen Stonehill',
   choices:[{ text:'...', goto:'n2', if:{flag,quest,gold,level}, do:{ shop, quest, flag, give, take, recruit, heal, close } }] } } } }
```

### `tables.js`
```js
// Names must follow the Forgotten Realms ethnic naming conventions from the PHB /
// Sword Coast Adventurer's Guide: Chondathan, Illuskan, Tethyrian, Damaran, Turami,
// Rashemi, Calishite for humans; canonical Dwarvish clan names (Rockseeker, Battlehammer,
// Stoneshield), Elvish (Tel'Quessir) names, halfling family names, etc. No coined slop.
export const NAME_TABLES = { human:{ chondathan:{male:[],female:[],surname:[]}, illuskan:{...},
   tethyrian:{...}, damaran:{...}, calishite:{...}, turami:{...}, rashemi:{...} }, elf:{...}, ... }
export const TITLES, TAVERN_LINES, FLAVOR_LINES, RUMORS, BOOK_TEXTS
export const DEITIES     // Faerûnian pantheon: Tymora, Lathander, Tempus, Mystra, Kelemvor,
                         // Selûne, Shar, Talos, Chauntea, Oghma, Moradin, Corellon, Gond,
                         // Ilmater, Torm, Helm, Bane, Bhaal, Myrkul, Lolth, Umberlee, Silvanus…
export const FACTIONS    // Harpers, Order of the Gauntlet, Emerald Enclave, Lords' Alliance, Zhentarim
export function generateName(speciesId, r, opts) -> string
```

---

## 4. RULES MODULES (`src/rules/`)

### `abilities.js`
```js
export const ABILITIES = ['str','dex','con','int','wis','cha']
export const ABILITY_NAMES = { str:'Strength', ... }
export const SKILLS = { athletics:{name:'Athletics', ability:'str'}, ... }  // all 18
export function mod(score) -> Math.floor((score-10)/2)
export const STANDARD_ARRAY = [15,14,13,12,10,8]
export const POINT_BUY_COST = {8:0,9:1,...,15:9}
```

### `character.js`
```js
export function createCharacter(opts) -> Character
// opts: { name, speciesId, lineageId, backgroundId, classId, subclassId, level=1,
//         abilities:{...}(base, pre-racial), skills:[], appearance:{}, kind:'pc',
//         equipment:{}, inventory:[], choices:{} }
export function recalc(ch)          // MUST be called after any change; derives everything
export function abilityScore(ch, ab)    // base + asi + item + effects
export function abilityMod(ch, ab)
export function profBonus(ch)
export function skillMod(ch, skill) -> {mod, prof:'none'|'prof'|'expert', passive}
export function saveMod(ch, ab)
export function acOf(ch)
export function maxHpOf(ch)
export function speedOf(ch)
export function initiativeMod(ch)
export function hasProf(ch, kind, id)
export function allFeatures(ch) -> featureObj[]      // species + class + subclass + feats, level-filtered
export function mechOf(ch) -> mergedMech             // all `mech` blocks merged
export function equip(ch, itemInstance, slot) -> bool
export function unequip(ch, slot)
export function addItem(ch, itemId, qty=1)
export function removeItem(ch, itemId, qty=1)
export function hasItem(ch, itemId, qty=1)
export function weaponsOf(ch) -> [{item, slot, attackBonus, damage, props, mastery, range}]
export function attackBonusFor(ch, weapon) -> number
export function damageFor(ch, weapon, {twoHanded}) -> {dice, mod, type, bonusDice}
export function restShort(ch, hitDiceSpent) -> log[]
export function restLong(ch) -> log[]
export function heal(ch, amount) -> actual
export function damage(ch, amount, type, opts) -> {dealt, resisted, dead, downed}
export function isDown(ch), isDead(ch), isAlive(ch)
export function cloneChar(ch)
export function serializeChar(ch), deserializeChar(obj)
export function makeItemInstance(itemId, opts) -> {uid, id, ...overrides}
```
`Character` shape (canonical — every module reads these fields):
```js
{
  uid, kind:'pc'|'npc'|'monster', name, title,
  speciesId, lineageId, backgroundId,
  classes:[{ id, level, subclassId }], level, xp,
  base:{str..cha}, asi:{str..cha}, // asi accumulates ALL permanent bonuses
  hp, maxHp, tempHp, hitDice:{ d10:{max,used} }, deathSaves:{success,fail,stable},
  ac, speed, size, prof, initiative,
  skills:{ athletics:'prof'|'expert' }, saveProfs:['str'],
  profs:{ armor:[], weapon:[], tool:[], language:[] },
  resist:[], immune:[], vuln:[], condImmune:[], senses:{darkvision},
  conditions:[{ id, dur, source, save:{ab,dc,end:'turn-end'} }],
  effects:[{ id, name, dur, mech:{}, source, concentration }],
  concentration: null | { spellId, targets:[uid], dur },
  equipment:{ mainHand, offHand, armor, shield, helm, cloak, boots, gloves, amulet, ring1, ring2, ammo },
  inventory:[{ uid, id, qty }],
  gold,
  spells:{ known:[], prepared:[], cantrips:[], slots:{1:{max,used},...}, pact:{level,max,used}, ability, dc, atk },
  resources:{ rage:{max,used,recharge}, ki:{...}, channelDivinity:{...}, superiority:{...}, sorceryPoints:{...} },
  featIds:[], choices:{ fightingStyle:[], maneuvers:[], invocations:[], metamagic:[], masteries:[], expertise:[] },
  appearance:{ body:'m'|'f'|'n', skin, hair, hairStyle, eye, outfit, outfitAlt, accent, height, build,
               beard, ears, horns, tail, marking },
  colorway:{...},                 // derived from appearance, for sprites.js
  sprite:'hero',                  // sprite family name
  ai:null|{...},                  // monsters only
  monsterId:null, cr:null, xpValue:0, loot:null,
  flags:{}, notes:''
}
```

### `progression.js`
```js
export const XP_TABLE          // [0,300,900,2700,...] index = level-1, through 20
export function xpForLevel(l), levelForXp(xp), profForLevel(l)
export function xpToNext(ch)
export function grantXp(ch, amount) -> {leveled:bool, newLevel}
export function pendingChoicesFor(ch, level) -> Choice[]
// Choice: { id, type, title, desc, count, options:[{id,name,desc,disabled,reason}], auto:bool }
export function applyLevel(ch, level, picks) -> log[]
export function canMulticlass(ch, classId) -> bool
export const MYTHIC_TIERS      // post-20 endless progression
export function mythicLevel(ch) -> n
export function applyMythic(ch, boonId)
export const HIT_DIE_AVG
```

### `spellcasting.js`
```js
export const FULL_SLOTS, HALF_SLOTS, THIRD_SLOTS, PACT_SLOTS   // tables[level] -> {1:n,...}
export function casterLevel(ch) -> number
export function recomputeSpells(ch)     // slots, dc, atk, prepared cap, cantrips
export function spellDC(ch), spellAtk(ch)
export function preparedMax(ch)
export function spellList(classId, maxLevel) -> spellId[]
export function knownSpells(ch) -> spellId[]
export function canPrepare(ch, spellId) -> bool
export function availableSlots(ch, minLevel) -> number[]
export function spendSlot(ch, level) -> bool
export function restoreSlots(ch, kind:'short'|'long')
export function isConcentrating(ch), breakConcentration(ch, why)
export function concentrationDC(damage) -> Math.max(10, floor(damage/2))
```

### `conditions.js`
```js
export const CONDITIONS = { blinded:{ id,name,desc, icon, color,
   mech:{ attackDis:true, attackedAdv:true, autoFailSaves:[], speed:0, noActions:bool,
          incomingCrit:bool, dmgTakenMult:1, preventReactions:bool, ... } } }
// All 15 2024 conditions + exhaustion(1-6) + game-specific (burning, frozen, marked, blessed...)
export function addCondition(ch, id, opts), removeCondition(ch, id), hasCondition(ch, id)
export function tickConditions(ch, when:'turn-start'|'turn-end') -> log[]
export function conditionMech(ch) -> merged
export function exhaustionLevel(ch)
```

### `actions.js` — resolution primitives
```js
export function resolveAttack(ctx, attacker, target, opts) -> AttackResult
// opts: { weapon, spell, atkBonus, damage:{dice,mod,type,bonusDice:[{dice,type}]},
//         adv, dis, ranged, crit, mastery, onHit:[], ammoUse }
// AttackResult: { hit, crit, miss, fumble, roll:d20Result, ac, damage, breakdown:[],
//                 applied:{dealt,resisted}, effects:[], log:[] }
export function resolveSave(ctx, source, target, {ability, dc, onSuccess, damage, effects, magic}) -> SaveResult
export function abilityCheck(ctx, ch, ability, {skill, dc, adv, dis}) -> {roll, total, success}
export function contestedCheck(ctx, a, b, skillA, skillB) -> bool
export function computeAdvantage(ctx, attacker, target, opts) -> {adv, dis, reasons:[]}
export function applyDamage(ctx, target, amount, type, opts) -> {dealt, resisted, ...}
export function healTarget(ctx, target, amount)
export function distanceFt(a, b)          // 5-ft grid, diagonal = 5 ft (PHB variant off)
export function inRange(a, b, range)
export function hasCover(ctx, a, b) -> 0|2|5   // AC bonus
export function lineOfSight(ctx, a, b) -> bool
export function areaTiles(origin, target, shape) -> [{x,y}]
export function opportunityCheck(ctx, mover, from, to) -> reactors[]
```

### `combat.js` — the encounter engine (headless; UI drives it)
```js
export class Encounter {
  constructor({ party, enemies, map, seed, biome, ambush, boss, onLog })
  units          // Character[] (party + enemies), with .pos {x,y}, .side:'party'|'foe'
  order          // initiative order (unit uids)
  round; turnIndex; get current(); state:'setup'|'active'|'victory'|'defeat'|'fled'
  start()
  beginTurn(); endTurn()
  availableActions(unit) -> ActionOption[]
  // ActionOption: { id, kind:'attack'|'spell'|'item'|'move'|'dash'|'dodge'|'disengage'|'hide'|
  //                 'help'|'shove'|'grapple'|'ready'|'special'|'end', name, cost:'action'|'bonus'|'free',
  //                 icon, desc, targeting:{kind,range,shape,radius,allowAllies,needsLoS}, enabled, reason }
  perform(unit, optionId, target) -> {ok, results:[], log:[]}   // target: {unit}|{x,y}|{path}
  moveUnit(unit, path) -> {ok, provoked:[]}
  reachableTiles(unit) -> Map<'x,y', {cost, path}>
  targetsFor(unit, option) -> {units:[], tiles:[]}
  isOver(); result()
  awardXp() -> {xp, gold, loot}
  log            // [{text, kind, unit}]
}
export function buildEncounter(opts) -> Encounter
```

### `ai.js`
```js
export function takeTurn(enc, unit) -> Plan[]
// Plan: { kind:'move', path } | { kind:'action', optionId, target } | { kind:'end' }
export function scoreTarget(enc, unit, target) -> number
```

### `scaling.js`
```js
export const TIERS
export function partyLevel(party) -> number       // average, rounded
export function encounterBudget(level, size, difficulty) -> xp
export function rollEncounter({ biome, level, size, difficulty, seed, depth }) -> {monsters:[{id,count}], boss}
export function scaleMonster(monsterId, targetLevel, {elite, boss, depth}) -> monsterChar
export function makeMonster(monsterId, opts) -> Character     // full Character from MONSTERS entry
export function lootFor(enc) -> {gold, items:[]}
export function difficultyFor(depth) -> 'easy'|'medium'|'hard'|'deadly'
```

---

## 5. WORLD MODULES (`src/world/`)

### `tilemap.js`
```js
export class TileMap {
  constructor({ w, h, name, biome, indoor, music })
  ground:Uint16Array; deco:Uint16Array; over:Uint16Array; flags:Uint8Array
  at(layer,x,y); set(layer,x,y,v)
  solid(x,y) -> bool
  flagAt(x,y) -> bits            // SOLID=1 WATER=2 ENCOUNTER=4 DOOR=8 TRIGGER=16 LEDGE=32 SLOW=64 DAMAGE=128
  triggers:[{x,y,w,h,kind:'warp'|'script'|'battle'|'sign'|'chest'|'shop'|'inn'|'rest'|'quest', data}]
  entities:[]
  spawn:{x,y}
  inBounds(x,y)
}
export const TF = { SOLID:1, WATER:2, ENCOUNTER:4, DOOR:8, TRIGGER:16, LEDGE:32, SLOW:64, DAMAGE:128 }
```

### `tiles.js` (in `src/render/`)
```js
export const TILES = { 0:{id:0,name:'void',...}, 1:{name:'grass', draw(ctx,x,y,seedInt)}, ... }
export function drawTile(ctx, id, px, py, wx, wy)
export function tileFlags(id) -> bits
export const T = { VOID:0, GRASS:1, GRASS_TALL:2, DIRT:3, ROAD:4, ... }   // named ids
```
Tiles must cover: grass, tall grass, flowers, dirt, road, cobble, sand, water(anim),
deep water, shore, stone floor, cave floor, wood floor, carpet, snow, ice, swamp,
mud, lava, ash, tree, pine, dead tree, bush, rock, boulder, cliff faces, mountain,
wall (stone/wood/brick/cave), roof pieces, door, window, fence, sign, chest, stairs,
pillar, torch, table, chair, bed, counter, barrel, crate, bookshelf, altar, statue,
fountain, gravestone, bridge, crops, well, bones, mushroom, crystal, portal. ~90 tiles.

### `mapgen.js`
```js
export function generateWorld(seed) -> { regions:[], map:TileMap }   // big overworld
export function generateDungeon({ seed, depth, biome, theme, size }) -> TileMap
export function generateCave({...}), generateForest({...}), generateRuins({...})
export function placeEncounterZones(map, r)
export function decorate(map, biome, r)
```

### `maps.js`
```js
export const MAP_DEFS = { phandalin:{ kind:'town', build(r) -> TileMap }, ... }
export function loadMap(id, opts) -> TileMap
export const WORLD_NODES   // graph of overworld->interior warps
```
Hand-authored, all canonical Sword Coast locations:
`phandalin` (hub town), `stonehill-inn`, `barthens-provisions`, `lionshield-coster`,
`shrine-of-luck`, `miners-exchange`, `townmasters-hall`, `alderleaf-farm`,
`sleeping-giant` (taproom), `phandalin-manor` (Tresendar Manor / Redbrand hideout entry),
`triboar-trail` (overworld region walking east–west), `neverwinter-wood`,
`cragmaw-hideout`, `wave-echo-cave-entrance`, `conyberry-ruins`. Others procedural.

### `entity.js`
```js
export class Entity { constructor({x,y,sprite,colorway,dir,solid,kind,data}) ; update(dt, world) ; draw(ctx,cam) }
export class NPCEntity extends Entity   // wander, face player, dialogue trigger
export class MonsterEntity extends Entity  // roams, chases player in LoS, starts battle on touch
export class ChestEntity, WarpEntity, SignEntity, PropEntity
```

### `party.js`
```js
export const Party = {
  members:[],           // Character[] max 4
  reserve:[],           // benched recruits
  gold, inventory,      // shared bag: [{uid,id,qty}]
  trail:[],             // position history for follower movement
  add(ch), remove(uid), swap(a,b), leader,
  levelAvg(), aliveCount(), healAll(), longRest(), shortRest(hitDice),
  addGold(n), spendGold(n), addItem(id,qty), removeItem(id,qty), countItem(id)
}
```

### `overworld.js` — the main gameplay Scene
```js
export class OverworldScene {
  constructor(mapId, spawn)
  // grid-locked movement w/ smooth tween between tiles, run toggle,
  // 4-member snake-follow party trail, camera lerp + clamp,
  // NPC interaction with `interact`, warps, chests, signs,
  // random encounters on ENCOUNTER tiles via step counter + biome table,
  // roaming visible monsters, day/night tint cycle, weather particles.
  enter(); update(dt); draw(ctx);
}
export function travelTo(mapId, x, y, dir)
```

---

## 6. UI MODULES (`src/ui/`)

Shared UI kit first — **everything else must use it** so the game looks consistent.

### `kit.js`
```js
export const UI = {
  panel(ctx, x,y,w,h, opts={ style:'window'|'dark'|'gold'|'plain', alpha }),
  text(ctx, x,y, str, opts={ color, size:'sm'|'md'|'lg', align, shadow, maxWidth, wrap }),
  textWrapped(ctx, x,y,w, str, opts) -> linesDrawn,
  measure(str, size) -> width,
  bar(ctx, x,y,w,h, pct, opts={ color, bg, border, segments }),
  cursor(ctx, x, y, t),
  icon(ctx, name, x, y, size, color),
  button(ctx, x,y,w,h, label, {selected, disabled}),
  list(ctx, x,y,w, items, index, opts),
  tooltip(ctx, x,y,text),
  portrait(ctx, ch, x, y, size),
  diceRoll(ctx, x,y, result, t),      // animated d20 display
  COLORS: { ink, dim, gold, red, green, blue, purple, bg, panel, border, hp, mp, xp }
}
export const FONT   // 5x7 procedural bitmap font, drawn via canvas paths — no web fonts
export function drawGlyphs(ctx, str, x, y, scale, color)
```
The font MUST be a hand-built bitmap font (glyph map of 5x7 binary rows) so text is
crisp at the pixel scale. Provide A–Z a–z 0–9 and `.,:;!?'"-+/()[]%&*#<>=@$—…°×✦♦♥★`.

### `menus.js` — `PartyScene`, `InventoryScene`, `SpellbookScene`, `JournalScene`, `MapScene`, `OptionsScene`, `PauseMenuScene`
### `dialogue.js` — `DialogueScene(dialogueId, npc)`; typewriter text, portraits, choices
### `charcreate.js` — `CharCreateScene(onDone)`; multi-step wizard:
  species → lineage → class → background → abilities (roll/array/point-buy) → skills →
  spells/cantrips → fighting style/etc → equipment kit → appearance (live sprite preview,
  every colour + feature cyclable) → name → summary. Full back/forward navigation.
### `levelup.js` — `LevelUpScene(chars)`; walks pendingChoicesFor
### `shop.js` — `ShopScene(shopId)`; buy/sell with item comparison vs equipped
### `combatui.js` — `BattleScene(encounter)`; the tactical battle interface
### `hud.js` — overworld HUD: party HP pips, gold, time, quest tracker, minimap
### `title.js` — `TitleScene`; animated title, new/continue/settings

---

## 7. GAME STATE (`src/state.js`)

```js
export function newGameState(seed) -> GameState
export const GameState = {
  seed, version, playtime, createdAt,
  party: Party-snapshot, flags:{}, quests:{ active:[], done:[], failed:[] },
  worldSeed, mapId, x, y, dir, day, time(0..1440), weather,
  discovered:{ mapId:[...] }, chests:{ 'map:x,y':true }, defeated:{},
  depth:{ 'undermountain': 3 },
  stats:{ kills, steps, battles, crits, gold, deaths },
  shops:{ restockDay },
}
export function saveState() -> plain object
export function loadState(obj)
```

---

## 8. NEVER-ENDING DESIGN

- **Undermountain**: the canonical endless dungeon beneath Waterdeep, opened via the
  Yawning Portal once the party reaches it. Infinitely deep procedural levels; floor N
  scales monster level to `partyLevel + floor(N/3)`, adds elite/boss modifiers and
  better loot tiers. Halaster Blackcloak taunts the party at milestone depths.
- **Faction contract boards**: `generateQuest(partyLevel)` produces unlimited scaled
  contracts from the Harpers, Zhentarim, Lords' Alliance, Order of the Gauntlet and
  Emerald Enclave, each with its own flavour and reward table.
- **Epic Boons past level 20**: characters keep advancing with 2024-style Epic Boons,
  +1 to an ability (max 30) and extra HP — forever.
- **Regional tiers**: Sword Coast encounter tables re-roll by party level; roaming
  world-bosses (an adult white dragon out of Icespire, a beholder from Undermountain,
  a drow raiding party from the Underdark) spawn at tier thresholds.

---

## 9. VISUAL TARGET

- Warm, readable GBA palette. Dark UI windows with gold trim, drop-shadowed text.
- 16px tiles, autotiled edges (water/cliff/road), animated water & torches.
- Characters: 16x24, 4 directions × 4 walk frames, layered (body → hair → outfit →
  gear), fully recolored per character from `colorway`.
- Day/night colour grading over the overworld; rain/snow particles by biome.
- Battle: same tiles at 2× zoom, grid overlay, movement range highlight, threat
  ranges, arcing projectiles, floating damage numbers, big d20 roll popups on
  attacks, screen shake on crits.
