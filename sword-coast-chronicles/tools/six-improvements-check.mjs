import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Encounter } from '../src/rules/combat.js';
import { createCharacter } from '../src/rules/character.js';
import { takeTurn } from '../src/rules/ai.js';
import { TILE_FLAGS, distanceFt } from '../src/rules/actions.js';
import { generateDungeon } from '../src/world/mapgen.js';
import { resolveSpawn, OverworldScene } from '../src/world/overworld.js';
import { companionMoment } from '../src/data/companion-moments.js';
import { CharCreateScene } from '../src/ui/charcreate.js';
import { BattleScene } from '../src/ui/combatui.js';
import { Game } from '../src/engine.js';
import { newGameState } from '../src/state.js';
import { loadMap } from '../src/world/maps.js';
const checks=[]; const check=(name,fn)=>{fn();checks.push(name);console.log('PASS '+name);};
check('Large melee creature follows a detour and attacks instead of stalling at a wall',()=>{
 const hero=createCharacter({name:'Target',speciesId:'human',classId:'fighter',level:10,backgroundId:'soldier'});
 const enc=new Encounter({party:[hero],enemies:['dire-wolf'],seed:'detour'});enc.start();
 const wolf=enc.units.find(u=>u.side==='foe'),h=enc.units.find(u=>u.side==='party');h.pos={x:8,y:2};h.hp=h.maxHp=1000;wolf.pos={x:3,y:2};
 const map={w:22,h:15,inBounds:(x,y)=>x>=0&&y>=0&&x<22&&y<15,flagAt:(x,y)=>x===6&&y<10?TILE_FLAGS.SOLID|TILE_FLAGS.OPAQUE:0};enc.map=map;
 let attacked=false,detoured=false;
 for(let round=0;round<7&&!attacked;round++){
  enc.round++;enc.turnIndex=enc.order.indexOf(wolf.uid);enc.beginTurn();
  const plans=takeTurn(enc,wolf);
  for(const p of plans){
   if(p.kind==='move'){const r=enc.moveUnit(wolf,p.path);assert.ok(r.steps.length);if(wolf.pos.y>=9)detoured=true;}
   if(p.kind==='action'){const r=enc.perform(wolf,p.optionId,p.target);if(p.optionId.startsWith('mact:')&&r.ok!==false)attacked=true;}
  }
 }
 assert.ok(detoured,'route went around wall');assert.ok(attacked,'legal bite within seven turns');assert.ok(distanceFt(wolf,h)<=5);
});
check('Dungeon patrols, discoveries, guarded exits and stair landings across seeds/themes',()=>{
 for(const theme of ['dungeon','crypt','mine'])for(let seed=0;seed<5;seed++){
  const map=generateDungeon({seed:'six-'+seed,theme,depth:5});
  const patrols=new Set(map.triggers.filter(t=>t.data?.encounterKey?.startsWith('patrol')).map(t=>t.data.encounterKey));
  assert.equal(patrols.size,2,theme+seed);assert.ok(map.triggers.some(t=>t.kind==='sign'));
  assert.ok(map.triggers.some(t=>t.kind==='warp'&&t.data.guarded?.encounterKey==='guardian'));
  assert.deepEqual(resolveSpawn(map,null,null,'exit'),map.exit);
  assert.deepEqual(resolveSpawn(map,null,null,'entry'),map.entry);
  assert.ok(!map.solidAt(map.entry.x,map.entry.y)&&!map.solidAt(map.exit.x,map.exit.y));
 }
});
check('Linked real site stairs retain direction and arrival geometry',()=>{
 const st=newGameState('stairs-six');const lower=loadMap('redbrand-hideout-4',{state:st,cache:false});
 const up=lower.triggers.find(t=>t.kind==='warp'&&t.data.stair==='up');
 const upper=loadMap(up.data.map,{state:st,cache:false});
 assert.equal(up.data.dir,'up');assert.deepEqual(resolveSpawn(upper,undefined,undefined,'exit'),upper.exit);
});
check('First-floor stair returns preserve terrain and encounter identity',()=>{
 const st=newGameState('roundtrip-six');
 const first=loadMap('redbrand-hideout',{state:st,cache:false});
 const down=first.triggers.find(t=>t.kind==='warp'&&t.data.stair==='down');
 st.flags[`encounter:${first.id}:patrol-0`]=true;
 const restored=JSON.parse(JSON.stringify(st));
 const second=loadMap(down.data.map,{state:restored,cache:false});
 const up=second.triggers.find(t=>t.kind==='warp'&&t.data.stair==='up');
 const again=loadMap(up.data.map,{state:restored,cache:false});
 assert.equal(again.id,first.id);assert.deepEqual(again.ground,first.ground);assert.deepEqual(again.exit,first.exit);
 Game.state=restored;const scene=Object.create(OverworldScene.prototype);scene.map=again;
 assert.equal(scene._doTriggerBattle({encounterKey:'patrol-0'}),false);
});
check('Fled enemies stop threatening movement while remaining enemies still warn',()=>{
 const hero=createCharacter({name:'Runner',speciesId:'human',classId:'fighter',level:3,backgroundId:'soldier'});
 const enc=new Encounter({party:[hero],enemies:['goblin','goblin'],seed:'threat-six'});enc.start();
 enc.map={w:20,h:15,inBounds:(x,y)=>x>=0&&y>=0&&x<20&&y<15,flagAt:()=>0};
 const h=enc.units.find(u=>u.side==='party'),foes=enc.units.filter(u=>u.side==='foe');
 h.pos={x:5,y:5};foes[0].pos={x:6,y:5};foes[1].pos={x:4,y:5};
 enc.turnIndex=enc.order.indexOf(h.uid);enc.beginTurn();
 const scene=Object.create(BattleScene.prototype);scene.enc=enc;
 scene._recomputeReach(h);assert.ok(scene.provoke.size);assert.ok(enc.threatTiles(foes[0]).length);
 enc._routUnit(foes[0]);scene._recomputeReach(h);
 assert.equal(enc.threatTiles(foes[0]).length,0);assert.ok(scene.provoke.size,'remaining foe still provokes');
 enc._routUnit(foes[1]);scene._recomputeReach(h);
 assert.equal(scene.threat.size,0);assert.equal(scene.provoke.size,0);
});
check('Cleared patrol survives state round-trip and does not start another battle',()=>{
 Game.state=newGameState('clear-six');Game.state.flags['encounter:test-floor:patrol-0']=true;
 Game.state=JSON.parse(JSON.stringify(Game.state));
 const scene=Object.create(OverworldScene.prototype);scene.map={id:'test-floor'};
 assert.equal(scene._doTriggerBattle({encounterKey:'patrol-0'}),false);
});
check('Wizard can prepare custom book spells, deselect all, and never learns stale preparation',()=>{
 const scene=new CharCreateScene(()=>{},{preset:{speciesId:'human',classId:'wizard',backgroundId:'sage',name:'Freedom'}});
 scene.draft.picks.spellbook=['mage-armor','shield','magic-missile','sleep','detect-magic','charm-person'];scene._touch();
 const b=scene.spellBuckets().find(b=>b.key==='wizardPrepared');assert.ok(b.optional);
 scene.toggleBucketPick(b,'charm-person');assert.ok(scene.draft.picks.wizardPrepared.includes('charm-person'));
 assert.ok(scene.buildFinal().spells.prepared.includes('charm-person'));
 scene.toggleBucketPick(b,'charm-person');assert.equal(scene.buildFinal().spells.prepared.length,0);
 scene.draft.picks.wizardPrepared=['fireball'];scene._touch();const ch=scene.buildFinal();
 assert.equal(ch.spells.prepared.length,0);assert.ok(!ch.spells.known.includes('fireball'));
 assert.equal(scene.grantedSpells('spellbook')['charm-person'],undefined);
 scene.draft.picks.wizardPrepared=['mage-armor','shield','magic-missile','sleep'];scene._touch();
 scene.toggleBucketPick(scene.spellBuckets().find(b=>b.key==='spellbook'),'mage-armor');
 assert.equal(scene.draft.picks.wizardPrepared.length,3);
 scene.toggleBucketPick(scene.spellBuckets().find(b=>b.key==='wizardPrepared'),'charm-person');
 assert.equal(scene.draft.picks.wizardPrepared.length,4);
 assert.deepEqual(scene.buildFinal().spells.prepared,scene.draft.picks.wizardPrepared);
});
check('Companion exchanges respect party membership, cooldown and persisted variety',()=>{
 const st={stats:{steps:180}},party=[{name:'Hero',hp:10},{name:'Garaele',hp:10},{name:'Daran',hp:10}];
 const a=companionMoment(st,party,'road');assert.ok(a.some(x=>x.startsWith('Garaele:')));assert.ok(a.some(x=>x.startsWith('Daran:')));
 assert.equal(companionMoment(st,party,'road'),null);st.stats.steps+=180;
 const copy=JSON.parse(JSON.stringify(st));assert.notDeepEqual(companionMoment(copy,party,'road'),a);
 copy.stats.steps+=180;party[2].hp=0;assert.equal(companionMoment(copy,party,'victory').length,1);
 assert.equal(companionMoment(copy,[party[0]],'road'),null);
});
fs.mkdirSync('output/six-improvements',{recursive:true});fs.writeFileSync('output/six-improvements/rules.json',JSON.stringify({checks},null,2));
