// Eight minutes of normal game clock in two isolated city districts.
const {Game,Stage,Party}=SC;
const {loadMap}=await import('/src/world/maps.js');
const ow=Game.scenes.find(s=>s.id==='overworld'),out=[],checks=[];
for(const [id,kind]of [['waterdeep','music'],['bg-citadel-streets','news']]){
 const m=loadMap(id,{seed:'endurance-'+id,force:true,cache:false}),g=m.streetScenes.find(g=>g.kind===kind);
 Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;
 ow.bindMap(m,g.people[0].x+3,g.people[0].y+1,'left');ow.banner=null;ow.hud.toasts=[];
 const lines=new Set(),cycles=new Set();let stacked=0,blocked=0,lastCycle=-1;
 const before=Party.gold,start=performance.now();
 for(let sample=0;sample<480;sample++){
  await new Promise(r=>setTimeout(r,500));
  const es=m.entities.filter(e=>e.data.streetLife&&!e.hidden&&!e.removed);
  if(new Set(es.map(e=>`${e.x},${e.y}`)).size!==es.length)stacked++;
  if(es.some(e=>m.solidAt(e.x,e.y)))blocked++;
  if(g.social){lines.add(g.social.lines.join('|'));cycles.add(g.socialCycle);}
  if(g.social?.phase==='thanks'&&g.socialCycle!==lastCycle){lastCycle=g.socialCycle;Game._draw();out.push({id:`${id}-cycle-${lastCycle}`,url:Stage.snapshot()});}
 }
 checks.push({name:id+' normal-clock duration',ok:performance.now()-start>=239000});
 checks.push({name:id+' repeated full cycles',ok:cycles.size>=3,cycles:cycles.size});
 checks.push({name:id+' varied local exchanges',ok:lines.size>=3,lines:[...lines]});
 checks.push({name:id+' no persistent crowd stacking',ok:stacked===0,stacked});
 checks.push({name:id+' stays on walkable ground',ok:blocked===0,blocked});
 checks.push({name:id+' ambient trade preserves party gold',ok:Number.isFinite(before)&&before===Party.gold,before,after:Party.gold});
}
out.push({id:'checks',checks});if(checks.some(c=>!c.ok))console.error('City endurance failed');return out;
