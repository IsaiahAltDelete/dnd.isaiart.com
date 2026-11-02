// Two seeds, all16 outdoor maps, real NPC updates, day/night and game renders.
const {Game,Stage}=SC;
const {loadMap}=await import('/src/world/maps.js');
const {travelTo}=await import('/src/world/overworld.js');
const {STREET_SCENES,populateCityStreets}=await import('/src/world/city-life.js');
const {canAttack}=await import('/src/rules/crime.js');
const {hasSprite}=await import('/src/render/sprites.js');
const {tileKey}=await import('/src/render/tiles.js');
const shots=[],checks=[],stats=[];
const check=(name,ok)=>checks.push({name,ok:!!ok});
function flood(m){
 const q=[[m.spawn.x,m.spawn.y]],s=new Set(q.map(p=>p.join(',')));
 for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const x=q[i][0]+dx,y=q[i][1]+dy,k=x+','+y;
  if(!m.inBounds(x,y)||m.solidAt(x,y)||s.has(k))continue;s.add(k);q.push([x,y]);
 }return s;
}
for(const seed of ['street-a','street-b'])for(const id of Object.keys(STREET_SCENES)){
 Game.state.time=720;
 const m=loadMap(id,{seed,cache:false,force:true});
 const es=m.entities.filter(e=>e.data?.streetLife),s=flood(m);
 check(`${seed} ${id} populated`,es.length>=6);
 check(`${seed} ${id} resident sprites and authored speech`,es.every(e=>hasSprite(e.sprite)&&e.greeting?.length>30));
 check(`${seed} ${id} residents reachable and off doorways`,es.every(e=>s.has(e.x+','+e.y)&&!(m.flagAt(e.x,e.y)&24)));
 check(`${seed} ${id} crowd cannot block party or be farmed for combat`,es.every(e=>!e.solid&&!canAttack(e.npc,e).ok));
 check(`${seed} ${id} participants have their own dialogue and activity`,es.filter(e=>e.member>0).every(e=>{const host=es.find(h=>h.group===e.group&&h.member===0);return e.greeting!==host.greeting&&e.activity!==host.activity;}));
 const stops=es.flatMap(e=>(e.patrol||[{x:e.x,y:e.y}]).map(p=>p.x+','+p.y));
 check(`${seed} ${id} distinct reserved stopping places`,new Set(stops).size===stops.length);
 const originalFlags=m.flags.slice(),originalDeco=m.deco.slice();
 const props=m.streetScenes.flatMap(g=>g.props);
 for(const p of props){m.flags[p.y*m.w+p.x]&=~1;m.deco[p.y*m.w+p.x]=0;}
 const before=flood(m),solidProps=props.filter(p=>originalFlags[p.y*m.w+p.x]&1);
 check(`${seed} ${id} all previously reachable floor retained`,before.size===s.size+solidProps.length);
 m.flags.set(originalFlags);m.deco.set(originalDeco);
 const old=es.length;populateCityStreets(m);
 check(`${seed} ${id} population idempotent`,m.entities.filter(e=>e.data?.streetLife).length===old);
 const positions=new Map(es.map(e=>[e.id,e.x+','+e.y])),moved=new Set();let legal=true,workChanged=false,separated=true,facing=true;
 const beat=es[0]?.workBeat;
 for(let f=0;f<120;f++){
  m.entityList.update(.2,{player:{x:m.spawn.x,y:m.spawn.y}});
  workChanged ||= es[0]?.workBeat!==beat;
  separated&&=new Set(es.filter(e=>!e.hidden).map(e=>e.x+','+e.y)).size===es.filter(e=>!e.hidden).length;
  for(const e of es){
   legal&&=!m.solidAt(e.x,e.y)&&!(m.flagAt(e.x,e.y)&24);
   if(positions.get(e.id)!==e.x+','+e.y)moved.add(e.id);
   if(e.member===0&&e.group.workTarget&&!e.moving&&!e.busy){
    const p=e.group.workTarget,dx=p.x-e.x,dy=p.y-e.y;
    const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    facing&&=Math.abs(dx)+Math.abs(dy)===1&&e.dir===dir;
   }
  }
 }
 check(`${seed} ${id} 24-second crowd motion stays on legal floor`,legal);
 check(`${seed} ${id} errands visibly move`,moved.size>=2);
 check(`${seed} ${id} workers animate`,workChanged);
 check(`${seed} ${id} residents do not stack during movement`,separated);
 check(`${seed} ${id} workers face adjacent work surfaces`,facing);
 Game.state.time=1260;m.entityList.update(.01,{});
 const night=es.filter(e=>!e.hidden).length;
 check(`${seed} ${id} night closes daytime trades`,es.filter(e=>['market','news','repair','garden','fish'].includes(e.group.kind)).every(e=>e.hidden));
 Game.state.time=720;m.entityList.update(.01,{});
 check(`${seed} ${id} morning reopens full crowd`,es.every(e=>!e.hidden));
 stats.push({seed,id,people:es.length,props:props.length,movers:moved.size,night,groups:m.streetScenes.map(g=>({kind:g.kind,x:g.x,y:g.y}))});
}
const views=[['waterdeep',12,21],['waterdeep',27,25],['bg-the-wide',28,23],['bg-eastway',29,20],['bg-gray-harbour',28,22],['bg-heapside',25,24],['bg-bloomridge',26,23],['bg-temples-district',24,22],['bg-citadel-streets',25,24],['bg-wyrms-crossing',32,15],['bg-little-calimshan',24,22],['bg-rivington',25,24]];
for(const [id,x,y]of views){
 travelTo(id,x,y,'down');Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;SC.FX.weather('none',0);
 for(let f=0;f<120;f++)Game._update(1/60);
 const ow=Game.scenes.find(s=>s.id==='overworld');ow.banner=null;ow.hud.toasts=[];
 Game.time=20;Game._draw();shots.push({id:id+'-'+x,url:Stage.snapshot()});
 if(id==='waterdeep'&&x===12||id==='bg-the-wide'){
  for(let f=0;f<600;f++)Game._update(1/60);
  Game.time=26;Game._draw();shots.push({id:id+'-later',url:Stage.snapshot()});
  Game.state.time=1260;for(let f=0;f<120;f++)Game._update(1/60);
  Game.time=30;Game._draw();shots.push({id:id+'-night',url:Stage.snapshot()});
 }
}
shots.push({id:'checks',checks,stats});
const failures=checks.filter(c=>!c.ok);
if(failures.length)throw Error(failures.map(c=>c.name).join('; '));
return shots;
