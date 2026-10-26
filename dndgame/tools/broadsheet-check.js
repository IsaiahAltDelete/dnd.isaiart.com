// Run through tools/shot.mjs. Exercise dialogue cleanup and later shared work,
// not merely flipping the busy flag (which misses pauseAndFace's timer).
const {Game,Stage}=SC;
const {loadMap}=await import('/src/world/maps.js');
const {updateStreetSocial}=await import('/src/world/city-life.js');
const ow=Game.scenes.find(s=>s.id==='overworld'),checks=[],cases=[],shots=[];
const check=(name,ok)=>checks.push({name,ok:!!ok});
for(const seed of ['social-a','social-b'])for(const id of ['waterdeep','bg-citadel-streets'])for(const member of [0,1]){
 const m=loadMap(id,{seed,force:true,cache:false});
 const g=m.streetScenes.find(g=>g.kind==='news');
 ow.bindMap(m,m.spawn.x,m.spawn.y,'down');Game.state.time=720;
 const actors=m.entities.filter(e=>e.group===g),npc=actors.find(e=>e.member===member);
 const step=()=>{updateStreetSocial(m,.1);m.entityList.update(.1,{player:ow.player});};
 const observe=()=>{const phases=new Set();let complete=false,last=null;
  for(let i=0;i<1000;i++){step();const p=g.social?.phase;if(p)phases.add(p);if(last==='return'&&!p)complete=true;last=p;}
  return {phases:[...phases],complete};};
 const before=observe();
 check(`${seed}/${id}/${member} baseline completes`,before.complete);
 // Use NPC interaction and the actual overworld/dialogue close callback.
 const payload=npc.interact({player:ow.player});ow._openDialogue(payload.data);
 check(`${seed}/${id}/${member} dialogue owns NPC`,Game.top.id==='dialogue'&&npc.busy&&npc.pauseT===3);
 Game.top._close();
 check(`${seed}/${id}/${member} close releases busy flag`,!npc.busy&&Game.top===ow);
 const after=observe();
 check(`${seed}/${id}/${member} exchange completes after dialogue`,after.complete);
 cases.push({seed,id,member,before,after,pauseT:npc.pauseT,fleeT:npc.fleeT,busy:npc.busy,returningHome:npc.returningHome});
}
// Explicit expired-negative timers cover existing resident instances as well
// as floating-point overshoot, for both dialogue and danger.
for(const timer of ['pauseT','fleeT']){
 const m=loadMap('waterdeep',{seed:'social-a',force:true,cache:false});
 ow.bindMap(m,m.spawn.x,m.spawn.y,'down');Game.state.time=720;
 const g=m.streetScenes.find(g=>g.kind==='news'),host=m.entities.find(e=>e.group===g&&e.member===0);
 host[timer]=-.001;let completed=false,last=null;
 for(let i=0;i<1000;i++){
  updateStreetSocial(m,.1);m.entityList.update(.1,{player:ow.player});
  const p=g.social?.phase;if(last==='return'&&!p)completed=true;last=p;
 }
 check(`expired negative ${timer} does not prevent exchanges`,completed);
}
return [{id:'checks',checks,cases}];
