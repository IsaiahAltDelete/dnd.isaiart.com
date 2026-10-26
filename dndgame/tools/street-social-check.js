const {Game,Stage,Party}=SC;
const {loadMap}=await import('/src/world/maps.js');
const {STREET_SCENES,updateStreetSocial}=await import('/src/world/city-life.js');
const checks=[],shots=[],stats=[];
const check=(name,ok)=>checks.push({name,ok:!!ok});
const tick=(m,dt=.1)=>{updateStreetSocial(m,dt);m.entityList.update(dt,{player:{x:m.spawn.x,y:m.spawn.y}});};
for(const seed of ['social-a','social-b'])for(const id of Object.keys(STREET_SCENES)){
 Game.state.time=720;const m=loadMap(id,{seed,force:true,cache:false});
 const es=m.entities.filter(e=>e.data.streetLife),phases=new Set(),kinds=new Set(),completed=new Set();
 let legal=true,separated=true,adjacent=true,linked=true;const before=Party.gold;
 const last=new Map();
 for(let i=0;i<700;i++){
  tick(m);
  separated&&=new Set(es.filter(e=>!e.hidden).map(e=>e.x+','+e.y)).size===es.filter(e=>!e.hidden).length;
  legal&&=es.every(e=>!m.solidAt(e.x,e.y)&&!(m.flagAt(e.x,e.y)&24));
  for(const g of m.streetScenes){
   const s=g.social;
   if(s){
    phases.add(s.phase);kinds.add(g.kind);
    if(s.phase==='action'&&s.spec.item)adjacent&&=s.host.distanceTo(s.partner.x,s.partner.y)===1;
    if(s.phase==='action'&&g.kind==='repair')adjacent&&=s.partner.distanceTo(g.workTarget.x,g.workTarget.y)<=2&&s.host.distanceTo(g.workTarget.x,g.workTarget.y)===1;
    linked&&=s.actors.every(e=>e.social===s&&!e.solid&&e.noCombat);
   }
   if(last.get(g)==='return'&&!s)completed.add(g.kind);
   last.set(g,s?.phase);
  }
 }
 check(`${seed} ${id} social scenes start`,kinds.size>=1);
 check(`${seed} ${id} full request reply action thanks return sequence`,['request','reply','action','thanks','return'].every(p=>phases.has(p)));
 check(`${seed} ${id} completed scenes release residents`,completed.size>=1);
 check(`${seed} ${id} handoffs are adjacent`,adjacent);
 check(`${seed} ${id} linked participants yield to player`,linked);
 check(`${seed} ${id} no stacking during 70 seconds`,separated);
 check(`${seed} ${id} no walking through scenery or doors`,legal);
 check(`${seed} ${id} ambient exchanges do not spend player money`,Number.isFinite(before)&&Party.gold===before);
 const obtain=()=>{for(let i=0;i<400;i++){tick(m);const g=m.streetScenes.find(g=>g.social?.phase==='action');if(g)return g;}return null;};
 let g=obtain(),s=g?.social;
 if(s){s.partner.busy=true;tick(m);check(`${seed} ${id} player dialogue releases whole group`,!g.social&&s.actors.every(e=>!e.social));s.partner.busy=false;}
 else check(`${seed} ${id} player dialogue releases whole group`,false);
 g=obtain();s=g?.social;
 if(s){s.partner.flee(s.host.x,s.host.y,1);tick(m);check(`${seed} ${id} danger cancels interaction`,!g.social&&s.actors.every(e=>!e.social));}
 else check(`${seed} ${id} danger cancels interaction`,false);
 Game.state.time=180;tick(m);
 check(`${seed} ${id} closed groups release social ownership`,m.streetScenes.filter(g=>g.kind!=='watch').every(g=>!g.social));
 stats.push({seed,id,kinds:[...kinds],completed:[...completed]});
}
const ow=Game.scenes.find(s=>s.id==='overworld');
for(const [id,kind,seed]of [['waterdeep','music','social-a'],['bg-the-wide','market','social-a'],['waterdeep','repair','social-a'],['bg-citadel-streets','news','social-a'],['waterdeep','music','social-b'],['bg-the-wide','market','social-b']]){
 const m=loadMap(id,{seed,force:true,cache:false});const g=m.streetScenes.find(g=>g.kind===kind);
 if(!g)throw Error('Missing scene '+id+kind);
 ow.bindMap(m,g.people[0].x+3,g.people[0].y+(kind==='news'?-2:1),'left');
 Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;SC.FX.clear(true);SC.FX.weather('none',0);
 ow.banner=null;ow.hud.toasts=[];g.socialCooldown=0;
 const seen=new Set();
 for(let i=0;i<600;i++){
  tick(m,1/30);Game.time+=1/30;
  const s=g.social;if(!s)continue;
  const phase=s.phase==='action'&&s.t>1.7?'received':s.phase;
  if(['request','reply','action','received','thanks'].includes(phase)&&s.t>.3&&!seen.has(phase)){
   Game._draw();
   shots.push({id:`${id}-${kind}-${seed}-${phase}`,url:Stage.snapshot(),phase:s.phase,participants:s.actors.map(e=>({name:e.name,x:e.x,y:e.y,dir:e.dir,activity:e.activity}))});seen.add(phase);
  }
  if(seen.size===5)break;
 }
 check(`${id} ${kind} ${seed} all visual phases captured`,seen.size===5);
}
shots.push({id:'checks',checks,stats});
// Return failures as evidence as well as failing the harness through console.
if(checks.some(c=>!c.ok))console.error('Street social checks failed: '+checks.filter(c=>!c.ok).map(c=>c.name).join('; '));
return shots;

