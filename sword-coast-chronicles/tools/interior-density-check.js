// Isolated campaign: routes, room use, and actual game renders in two seeds.
const {Game,Stage}=SC;
const {travelTo}=await import('/src/world/overworld.js');
const {loadMap}=await import('/src/world/maps.js');
const {npcsOnMap}=await import('/src/data/npcs.js');
const shots=[],checks=[];
const check=(name,ok)=>checks.push({name,ok:!!ok});
const views=[['waterdeep',20,14],['elfsong-tavern',13,11],['sorcerous-sundries',11,13],['baldurs-mouth',10,9],['high-hall',15,12]];
const cardinal=[[1,0],[-1,0],[0,1],[0,-1]];
for(const seed of ['density-a','density-b'])for(const [id,x,y]of views){
 const m=loadMap(id,{seed,force:true,cache:false});
 const q=[[m.spawn.x,m.spawn.y]],seen=new Set(q.map(p=>p.join(',')));
 for(let i=0;i<q.length;i++)for(const [dx,dy]of cardinal){
  const nx=q[i][0]+dx,ny=q[i][1]+dy,k=nx+','+ny;
  if(!m.inBounds(nx,ny)||m.solidAt(nx,ny)||seen.has(k))continue;
  seen.add(k);q.push([nx,ny]);
 }
 const reachable=(x,y)=>seen.has(x+','+y);
 const adjacent=(x,y)=>cardinal.some(([dx,dy])=>reachable(x+dx,y+dy));
 check(`${seed} ${id} camera arrival reachable`,reachable(x,y));
 for(const t of m.triggers){
  check(`${seed} ${id} ${t.id} accessible`,t.kind==='warp'?reachable(t.x,t.y):adjacent(t.x,t.y));
 }
 for(const n of npcsOnMap(id)){
  check(`${seed} ${id} ${n.id} stands on reachable floor`,reachable(n.x,n.y));
  check(`${seed} ${id} ${n.id} can be approached`,adjacent(n.x,n.y));
 }
 if(id==='waterdeep')check(`${seed} Portal inn keyboard approach`,reachable(17,17));
 // Use the same generated map for render evidence, without changing live saves.
 travelTo(id,x,y,'up');
 const ow=Game.scenes.find(s=>s.id==='overworld');
 ow.map=m;
 Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;SC.FX.weather('none',0);
 for(let f=0;f<180;f++)Game._update(1/60);
 ow.banner=null;ow.hud.toasts=[];
 Game._draw();shots.push({id:`${id}-${seed}`,url:Stage.snapshot()});
 if(seed==='density-a'&&id==='elfsong-tavern'){
  Game.state.time=1320;for(let f=0;f<120;f++)Game._update(1/60);
  Game._draw();shots.push({id:'elfsong-night',url:Stage.snapshot()});
 }
}
shots.push({id:'checks',checks});
const failures=checks.filter(c=>!c.ok);
if(failures.length)throw Error(failures.map(c=>c.name).join('; '));
return shots;
