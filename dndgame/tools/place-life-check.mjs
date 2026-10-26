import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../src/engine.js';
import {newGameState} from '../src/state.js';
import {loadMap,WORLD_NODES} from '../src/world/maps.js';
import {updateStreetSocial} from '../src/world/city-life.js';
import {BLACKSTAFF_CAST} from '../src/data/blackstaff.js';
const required={'blackstaff-tower':['arcane','study','kettle'],'blackstaff-court':['wards','cargo'],'bg-the-wide':['weigh','textiles','auction','market','news','music'],waterdeep:['music','news','repair'],'bg-citadel-streets':['news','watch']},reports=[];
for(const seed of ['life-one','life-two','life-three'])for(const [id,kinds]of Object.entries(required)){
 const st=Game.state=newGameState(seed);st.time=720;const m=loadMap(id,{state:st,seed,cache:false});
 for(const k of kinds)assert(m.streetScenes.some(g=>g.kind===k),`${seed} ${id} missing ${k}`);
 const q=[m.spawn],seen=new Set([m.spawn.x+','+m.spawn.y]);
 for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i].x+dx,y=q[i].y+dy,k=x+','+y;if(!m.inBounds(x,y)||m.solidAt(x,y)||seen.has(k))continue;seen.add(k);q.push({x,y});}
 for(const w of WORLD_NODES.filter(n=>n.from===id))assert(seen.has(w.fromXY.x+','+w.fromXY.y),'Warp blocked '+w.id);
 for(const n of BLACKSTAFF_CAST.filter(n=>n.map===id))assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((n.x+dx)+','+(n.y+dy))),'Quest NPC blocked');
 for(const t of m.triggers.filter(t=>t.id?.startsWith('academy-')))assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((t.x+dx)+','+(t.y+dy))),'Anchor blocked');
 const phases=new Map(m.streetScenes.map(g=>[g,new Set()])),completed=new Set(),last=new Map(),residents=m.entities.filter(e=>e.data?.streetLife),flags=JSON.stringify(st.flags);
 const tick=()=>{updateStreetSocial(m,.1);m.entityList.update(.1,{player:{x:m.spawn.x,y:m.spawn.y}});};
 for(let i=0;i<1400;i++){
  tick();const live=residents.filter(e=>!e.hidden&&!e.removed);
  assert.equal(new Set(live.map(e=>e.x+','+e.y)).size,live.length,`${id} residents stack`);
  for(const e of live)assert(!m.solidAt(e.x,e.y),`${id} ${e.name} in scenery`);
  for(const g of m.streetScenes){if(g.social){phases.get(g).add(g.social.phase);if(g.social.phase==='action'&&g.social.spec.item)assert.equal(g.social.host.distanceTo(g.social.partner.x,g.social.partner.y),1);}
   if(last.get(g)==='return'&&!g.social)completed.add(g.kind);last.set(g,g.social?.phase);
  }
 }
 for(const k of kinds)assert(completed.has(k),`${id} ${k} never completed`);
 for(const g of m.streetScenes.filter(g=>kinds.includes(g.kind))){
  for(let i=0;i<800&&!g.social;i++)tick();if(!g.social)console.log(m.entities.filter(e=>e.x>=33&&e.x<=38&&e.y>=18&&e.y<=23).map(e=>({name:e.name,x:e.x,y:e.y,hidden:e.hidden,removed:e.removed,kind:e.kind,group:e.group?.kind})));assert(g.social,id+' '+g.kind+' no scene to interrupt: '+JSON.stringify(m.entities.filter(e=>e.group===g).map(e=>({name:e.name,x:e.x,y:e.y,home:e.home,returning:e.returningHome,moving:e.moving,busy:e.busy,pause:e.pauseT}))));
  const actors=g.social.actors;actors[0].busy=true;tick();assert(!g.social&&actors.every(e=>!e.social));actors[0].busy=false;
  for(let i=0;i<900&&!g.social;i++)tick();if(!g.social)console.log(id,g.kind,m.entities.filter(e=>e.group===g).map(e=>({name:e.name,x:e.x,y:e.y,home:e.home,returning:e.returningHome,busy:e.busy,moving:e.moving,pause:e.pauseT,path:e.path})));assert(g.social,`${g.kind} did not resume after dialogue`);
 }
 st.time=180;tick();assert(m.streetScenes.every(g=>g.kind==='watch'||!g.social));assert.equal(JSON.stringify(st.flags),flags);
 reports.push({seed,id,residents:residents.length,completed:[...completed],phases:Object.fromEntries([...phases].map(([g,p])=>[g.kind,[...p]]))});
}
fs.mkdirSync('output/place-life',{recursive:true});fs.writeFileSync('output/place-life/rules.json',JSON.stringify(reports,null,2));console.log('PASS: 3 seeds x 5 maps, complete cycles, no stacking/scenery, reachable exits/quest NPCs/anchors, interruption/recovery, night close, unchanged flags');




