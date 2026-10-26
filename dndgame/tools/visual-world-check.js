const {Game, Party, Stage, createCharacter}=SC;
const {travelTo}=await import('/src/world/overworld.js');
const {drawActor,drawPortrait}=await import('/src/render/actor.js');
const {MONSTERS}=await import('/src/data/monsters.js');
const shots=[];
const take=id=>{Game._draw();shots.push({id,x:0,y:0,url:Stage.snapshot()});};
for(const id of ['stonehill-inn','barthens-provisions','shrine-of-luck']){
 travelTo(id); const ow=Game.scenes.find(s=>s.id==='overworld'); ow.banner=null; ow.hud.toasts=[]; take(id);
}
travelTo('waterdeep',20,17,'up');{const scene=Game.scenes.find(s=>s.id==='overworld');scene.banner=null;scene.hud.toasts=[];take('yawning-portal-in-waterdeep');}
const canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;
const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#201e27';ctx.fillRect(0,0,960,640);
const heroes=[];
for(const [i,id] of ['fighter','wizard','rogue','paladin','druid','bard'].entries()){
 const ch=createCharacter({name:id,speciesId:['human','elf','tiefling','dwarf','elf','halfling'][i],classId:id,backgroundId:'soldier'});
 heroes.push(ch); const x=20+i*155;
 drawPortrait(ctx,ch,x,12,64);
 for(const [j,dir] of ['down','left','up'].entries())drawActor(ctx,ch,x+22+j*44,170,{dir,scale:2,shadow:false});
 ctx.fillStyle='#ddcaa2';ctx.font='14px monospace';ctx.fillText(id,x,193);
}
for(const [i,id] of ['goblin','orc','skeleton','wolf','owlbear','venomfang','adult-red-dragon','beholder'].entries()){
 const x=60+(i%4)*235,y=390+Math.floor(i/4)*210;
 const m={...MONSTERS[id],monsterId:id};drawActor(ctx,m,x,y,{dir:'left',scale:2,shadow:false});
 ctx.fillStyle='#ddcaa2';ctx.font='14px monospace';ctx.fillText(id,x-40,y+20);
}
shots.push({id:'cast',x:0,y:0,url:canvas.toDataURL()});
travelTo('thundertree',16,14,'up');
const ow=Game.scenes.find(s=>s.id==='overworld');ow.banner=null;ow.hud.toasts=[];
take('venomfang-tower');
const dragon=ow.map.entities.find(e=>e.monsterId==='venomfang');
const {loadMap,WORLD_NODES}=await import('/src/world/maps.js');
const checks=[];
const check=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
check('One visible stationary dragon',dragon&&!dragon.hidden&&!dragon.aggro&&dragon.wanderRadius===0);
check('Wood has a two-way route to Thundertree',WORLD_NODES.some(e=>e.from==='neverwinter-wood'&&e.to==='thundertree')&&WORLD_NODES.some(e=>e.from==='thundertree'&&e.to==='neverwinter-wood'));
const {journeyInfo}=await import('/src/render/journey.js');
for(const [id,meta]of [['inn',{id:'stonehill-inn',name:'The Stonehill Inn',indoor:true}],['town',{id:'waterdeep',name:'Waterdeep',kind:'town'}],['cave',{id:'wave-echo-cave',name:'Wave Echo Cave',kind:'cave',indoor:true}],['wild-night',{id:'neverwinter-wood',name:'Neverwinter Wood',kind:'wild'}]]){
 Game.transition('journey',null,{dur:1.35,journey:journeyInfo(ow.map,meta,id==='wild-night'?{...Game.state,time:60}:Game.state)});Game._trans.t=0.45;take('journey-'+id);Game._trans=null;
}
ow._doWarp({map:'stonehill-inn'});
check('Door travel selects illustrated screen',Game._trans?.kind==='journey');
for(let i=0;i<90;i++)Game._update(1/60);
check('Travel completes at destination',Game.state.mapId==='stonehill-inn'&&!Game.transitioning);
travelTo('thundertree',16,11,'up');
const battle=dragon.interact();check('Dragon offers named battle',battle.data.monsterId==='venomfang'&&battle.data.monsters.length===1);
ow._doTriggerBattle(battle.data);
for(let i=0;i<80;i++)Game._update(1/60);
take('venomfang-standoff');
check('Dragon encounter opens',/battle|standoff/.test(Game.top.id)||/BattleScene|StandoffScene/.test(Game.top.constructor.name));
if(Game.top.id==='standoff')Game.top._finish({kind:'fight'});
await new Promise(r=>setTimeout(r,650));
for(let i=0;i<80;i++)Game._update(1/60);
take('venomfang-battle');
check('Named dragon reaches combat',Game.top.enc?.enemies?.some(e=>e.monsterId==='venomfang'||e.name==='Venomfang') || Game.top.enc?.combatants?.some(e=>e.name==='Venomfang'));
for(let i=0;i<180;i++)Game._update(1/60);
take('venomfang-battle-settled');
// Controlled battle fixture: resolve zero surviving foes through the real
// victory/results/onEnd flow, rather than calling the world entity's defeat.
const battleScene=Game.top;
for(const foe of battleScene.enc.enemies)foe.hp=0;
battleScene.enc._checkEnd();battleScene._checkOver();
check('Victory results open',battleScene.results?.kind==='victory');
battleScene._leaveVictory();await new Promise(r=>setTimeout(r,350));
check('Victory callback persists unique defeat',Game.state.defeated?.['thundertree:venomfang']===true);
const reload=loadMap('thundertree',{state:Game.state,force:true});
check('Defeated dragon stays gone after reload',!reload.entities.some(e=>e.monsterId==='venomfang'&&!e.hidden));
shots.push({id:'checks',checks});
return shots;
