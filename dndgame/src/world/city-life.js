// Street scenes occupy reachable public paving, never the Portal's taproom,
// roofs, door approaches or authored NPC posts. Only the active map updates.
import { NPCEntity } from './entity.js';
import { TF } from './tilemap.js';
import { tileId, tileKey, tileFlags } from '../render/tiles.js';
import { drawSprite, getSprite, spriteDef } from '../render/sprites.js';
import { hashStr } from '../core/rng.js';
import { Game } from '../engine.js';
import { UI } from '../ui/kit.js';
import { npcsOnMap } from '../data/npcs.js';
import { DIR_VEC } from '../constants.js';
import { streetVoice } from '../data/street-voices.js';
import { PLACE_ACTIVITIES,PLACE_PARTICIPANTS,PLACE_EXCHANGES } from '../data/place-life.js';
import { drawPlaceWork,drawPlaceItem } from '../render/place-life.js';
import '../render/art/street-gesture.js';
import '../render/art/street-exchange.js';

// Each neighbourhood has its own work and social life. Anchors are street
// addresses; the fitter only nudges a group into nearby unobstructed paving.
export const STREET_SCENES = {
  waterdeep: [[9,21,'music'],[20,6,'news'],[27,25,'market'],[36,20,'repair'],[16,29,'cargo'],[4,16,'food']],
  'bg-the-wide': [[12,22,'news'],[24,28,'music'],[39,23,'weigh'],[14,29,'market'],[42,29,'food'],[28,34,'watch'],[12,15,'textiles'],[37,35,'auction']],
  'blackstaff-tower': [[21,12,'arcane'],[3,8,'study'],[8,17,'kettle']],
  'blackstaff-court': [[23,21,'wards'],[5,18,'cargo']],
  'bg-eastway': [[7,20,'food'],[22,21,'music'],[35,21,'news'],[44,20,'cargo'],[29,31,'market']],
  'bg-gray-harbour': [[10,22,'cargo'],[23,22,'fish'],[37,22,'cargo'],[47,24,'food'],[29,12,'repair']],
  'bg-heapside': [[12,22,'repair'],[24,23,'food'],[37,23,'market'],[22,12,'news'],[14,31,'cargo']],
  'bg-bloomridge': [[12,22,'garden'],[26,23,'music'],[39,23,'news'],[16,31,'food'],[27,9,'watch']],
  'bg-temples-district': [[13,22,'prayer'],[26,21,'news'],[38,22,'garden'],[25,32,'prayer'],[8,32,'watch']],
  'bg-citadel-streets': [[12,21,'watch'],[24,23,'news'],[36,23,'garden'],[23,32,'repair']],
  'bg-blackgate': [[13,22,'cargo'],[28,25,'food'],[43,22,'repair'],[28,35,'watch']],
  'bg-norchapel': [[12,20,'repair'],[24,22,'food'],[37,21,'garden']],
  'bg-little-calimshan': [[14,22,'market'],[24,18,'music'],[35,22,'food'],[24,32,'cargo']],
  'bg-tumbledown': [[20,24,'prayer'],[27,24,'garden']],
  'bg-sows-foot': [[12,21,'repair'],[26,23,'food'],[38,23,'cargo']],
  'bg-twin-songs': [[12,22,'prayer'],[26,22,'music'],[38,22,'food']],
  'bg-wyrms-crossing': [[30,6,'market'],[25,15,'cargo'],[38,15,'music']],
  'bg-rivington': [[12,22,'market'],[25,24,'repair'],[38,22,'food'],[25,34,'cargo']],
};
const ACTIVITIES = {
  ...PLACE_ACTIVITIES,
  errand: { title:'On an errand', props:[], sprites:['porter'], names:['City courier'], call:'Coming through!', line:'A parcel for the far end of the ward, then back for the next one. You learn every shortcut doing this work.', task:'carrying a parcel across the ward', from:300,to:1320 },
  market: { title:'Market bargaining', props:['MARKET_STALL','SACK'], sprites:['merchant','goodwife','porter','halfling'], names:['Produce seller','Careful shopper','Market porter','Fruit buyer'], call:'Two for a copper!', line:'The price is for the fruit, not the basket. Pick a ripe one; I will wrap it for your journey.', task:'weighing produce', from:360,to:1200 },
  food: { title:'Street supper', props:['TABLE','BARREL'], sprites:['goodwife','sailor','villager-f','halfling'], names:['Bread seller','Hungry sailor','Neighbour','Supper regular'], call:'Bread still warm!', line:'The next batch is cooling. Mind the hot tray, and leave a little room for the people carrying supper home.', task:'serving bread', from:360,to:1380 },
  music: { title:'Street performance', props:['BENCH','PLANTER'], sprites:['minstrel','villager-f','noble','halfling'], names:['Street musician','Listening local','Passing patron','Enthusiastic listener'], call:'One more verse!', line:'Stay for the chorus. The dockhands know the rude version; I play the one that keeps the Watch smiling.', task:'playing a tune', from:480,to:1380 },
  news: { title:'Broadsheet reading', props:['TABLE','SACK'], sprites:['scribe','villager-m','villager-f'], names:['Broadsheet caller','Letter carrier','Curious reader'], call:'Hear the latest!', line:'One sheet to read, one to pass along. The notices are on the board, and the arguments are free.', task:'reading the news', from:360,to:1200 },
  repair: { title:'Roadside repairs', props:['ANVIL','CRATE'], sprites:['smith','labourer','porter'], names:['Repairer','Workshop helper','Waiting courier'], call:'Hold it steady!', line:'A loose rivet becomes a broken wheel two streets later. Give me a moment to finish this fitting.', task:'hammering a fitting', from:360,to:1140 },
  cargo: { title:'Delivery round', props:['CART','SACK'], sprites:['porter','sailor','labourer'], names:['Cart loader','Delivery hand','Warehouse runner'], call:'Make way, please!', line:'Three loads before the next bell. We count every sack twice; the receiver counts them a third time.', task:'sorting a delivery', from:300,to:1320 },
  fish: { title:'Fish market', props:['TABLE','BARREL'], sprites:['fisher','sailor','goodwife'], names:['Fishmonger','Net mender','Fish buyer'], call:'Morning catch!', line:'These came off the river boats this morning. The gulls have already inspected them more closely than the harbour clerk.', task:'sorting the catch', from:300,to:1140 },
  garden: { title:'Neighbourhood gathering', props:['PLANTER','BENCH'], sprites:['goodwife','noble','villager-f'], names:['Flower tender','Strolling neighbour','Visiting neighbour'], call:'Lovely this year.', line:'A little water and a little company. Even a city needs somewhere to stop walking for a moment.', task:'tending flowers', from:360,to:1200 },
  prayer: { title:'Wayside charity', props:['BENCH','PLANTER'], sprites:['acolyte','beggar','villager-f'], names:['Temple attendant','Resting traveller','Offering bearer'], call:'A moment of peace.', line:'You may sit a while. There is water for travellers, and someone here will listen if the road has been hard.', task:'offering water', from:300,to:1320 },
  watch: { title:'Watch rounds', props:['BENCH','BRAZIER'], sprites:['watch','scribe','guard'], names:['Lamplighter','Duty clerk','Watch patrol'], call:'Keep the way clear.', line:'The lamps are tended and the doors are watched. Leave the crossroads clear for carts and anyone who needs help.', task:'checking the street', from:0,to:1440 },
};
const N4=[[1,0],[-1,0],[0,1],[0,-1]];
// Participants speak from their own side of the exchange, not as the worker.
const PARTICIPANTS={
  ...PLACE_PARTICIPANTS,
  market:[['choosing fruit','I am checking the fruit before I buy. The best bargains are the ones you can carry home without bruising.'],['collecting an order','The seller has my order ready. I will carry it to the next street once the customers have finished choosing.'],['comparing prices','I am comparing prices before I spend my last copper. Those apples do look good, though.']],
  food:[['waiting for supper','I have been on my feet since dawn. A warm loaf and somewhere to stand quietly will do me fine.'],['buying bread','I promised to bring supper home. If I linger much longer, my neighbours will eat it without me.'],['sharing street gossip','I come for the bread and stay for the conversation. You hear half the ward while a tray cools.']],
  music:[['listening to the tune','I stopped for one verse and stayed for three. Listen to the chorus; that is the part everyone here knows.'],['watching the performance','The musician has earned a coin. I am waiting until the song ends to leave it without interrupting.'],['keeping time','I know this tune! I am keeping time until the chorus comes round again.']],
  news:[['collecting a broadsheet','I have a letter to deliver, but I can spare a moment for the news. There is always something new on this corner.'],['reading the notices','I am reading the notices before I head home. Someone usually knows more than the printed sheet does.']],
  repair:[['steadying the work','I am holding this fitting steady while the repairer sets it. A hurried job only brings the cart back tomorrow.'],['waiting for a repair','My delivery can wait for a sound wheel. I would rather lose a few minutes here than lose the whole load.']],
  cargo:[['checking the tally','I check each sack against the tally before it leaves the cart. The river takes enough goods without our help.'],['carrying supplies','The next load is ready. I am carrying these supplies over while the loader checks the remainder.']],
  fish:[['mending a net','A torn mesh costs more fish than a late start. I am mending this section before the boat goes out again.'],['choosing the catch','I am looking for something fresh for supper. The fishmonger knows which boat brought each basket.']],
  garden:[['admiring the flowers','I take the longer walk for these flowers. The gardener always notices what is coming into bloom.'],['catching up with a neighbour','We were only going to exchange a greeting. That was a while ago; there is always another bit of news.']],
  prayer:[['resting beside the shrine','The attendant offered me water and a place to rest. It has been a long road, and I am grateful for both.'],['bringing an offering','I brought a small offering and some food to share. There is usually someone here who needs it.']],
  watch:[['checking the duty ledger','I am checking the duty ledger while the watch makes its round. Missing entries become long questions at the next bell.'],['walking the watch route','I am walking this part of the ward. Keep the crossings clear and call if anyone needs help.']],
};
const FORMATIONS={music:[[0,0],[-2,2],[2,2],[0,3]],news:[[0,0],[-2,1],[2,1]],repair:[[0,0],[-1,1],[2,1]],cargo:[[0,0],[2,0],[-2,2]],garden:[[0,0],[-2,1],[1,2]],prayer:[[0,0],[-2,1],[2,1]],watch:[[0,0],[-2,0],[2,2]]};
const key=(x,y)=>x+','+y;
function flood(map){
  const q=[[map.spawn.x,map.spawn.y]],seen=new Set(q.map(p=>key(...p)));
  for(let i=0;i<q.length;i++)for(const [dx,dy]of N4){
    const x=q[i][0]+dx,y=q[i][1]+dy,k=key(x,y);
    if(!map.inBounds(x,y)||map.solidAt(x,y)||seen.has(k))continue;
    seen.add(k);q.push([x,y]);
  }
  return seen;
}
function publicFloor(map,x,y){
  const i=y*map.w+x;
  if(x<2||y<2||x>=map.w-2||y>=map.h-2)return false;
  if(map.id==='waterdeep'&&x>=14&&x<=28&&y>=8&&y<=19)return false;
  if(map.flagAt(x,y)&(TF.SOLID|TF.WATER|TF.TRIGGER|TF.DOOR|TF.DAMAGE))return false;
  if(/ROOF|TREE|CANOPY/.test(tileKey(map.over[i])||''))return false;
  if(map.id==='blackstaff-tower')return /^(STONE_FLOOR|WOOD_FLOOR)/.test(tileKey(map.ground[i])||'');
  return !/WOOD|CARPET|FLOOR|WATER/.test(tileKey(map.ground[i])||'');
}

export function dressCityStreets(map){
  if((map.indoor&&map.id!=='blackstaff-tower')||!STREET_SCENES[map.id]||map.streetScenes)return;
  map.streetScenes=[];
  const protectedTiles=new Set(),occupied=new Set();
  const protect=(x,y,r=1)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)protectedTiles.add(key(x+dx,y+dy));};
  protect(map.spawn.x,map.spawn.y);
  for(const t of map.triggers)protect(t.x,t.y);
  for(const n of npcsOnMap(map.id)){
    protect(n.x,n.y);
    for(const s of Object.values(n.schedule||{}))if(s.x!=null&&s.y!=null)protect(s.x,s.y);
  }
  let reachable=flood(map);
  for(const [ax,ay,kind]of STREET_SCENES[map.id]){
    const candidates=[];
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
      const x=ax+dx,y=ay+dy,k=key(x,y);
      if(!reachable.has(k)||!publicFloor(map,x,y)||protectedTiles.has(k)||occupied.has(k))continue;
      const room=N4.filter(([ox,oy])=>publicFloor(map,x+ox,y+oy)).length;
      if(room<3)continue;
      candidates.push({x,y,score:Math.abs(dx)+Math.abs(dy)-room*.2});
    }
    candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    const center=candidates[0];if(!center)continue;
    const spec=ACTIVITIES[kind],group={...center,kind,props:[],people:[],index:map.streetScenes.length};
    // Compact work surfaces. Reject a piece if it severs ANY previously
    // reachable floor, rather than repairing streets by carving new doors.
    for(const [j,name]of spec.props.entries()){
      const choices=[[center.x+j,center.y-1],[center.x-1-j,center.y-1],[center.x+j,center.y+2]];
      for(const [x,y]of choices){
        const i=y*map.w+x,k=key(x,y),id=tileId(name);
        if(!id||!publicFloor(map,x,y)||map.deco[i]||protectedTiles.has(k)||occupied.has(k))continue;
        const old=map.flags[i];map.deco[i]=id;map.flags[i]|=tileFlags(id);
        const next=flood(map),removed=map.solidAt(x,y)?1:0;
        if(next.size<reachable.size-removed){map.deco[i]=0;map.flags[i]=old;continue;}
        reachable=next;group.props.push({x,y,name});occupied.add(k);break;
      }
    }
    const spots=[];
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const x=center.x+dx,y=center.y+dy,k=key(x,y);
      if(!publicFloor(map,x,y)||!reachable.has(k)||protectedTiles.has(k)||occupied.has(k))continue;
      spots.push({x,y,d:Math.abs(dx)+Math.abs(dy)});
    }
    const surface=group.props.find(p=>p.name===(kind==='watch'?'BRAZIER':spec.props[0]));
    const worksAtSurface=['market','food','fish','repair','cargo','garden','watch'].includes(kind);
    const formation=FORMATIONS[kind]||[[0,0],[-2,0],[2,1],[0,2]];
    for(let j=0;j<spec.sprites.length&&spots.length;j++){
      const origin=group.people[0]||center,[dx,dy]=formation[j];
      const score=p=>{
        let cost=(p.x-origin.x-dx)**2+(p.y-origin.y-dy)**2;
        if(j===0&&worksAtSurface&&surface&&Math.abs(p.x-surface.x)+Math.abs(p.y-surface.y)!==1)cost+=100;
        if(j>0)for(const other of group.people)if(Math.abs(p.x-other.x)+Math.abs(p.y-other.y)<2)cost+=5;
        return cost;
      };
      spots.sort((a,b)=>score(a)-score(b)||a.y-b.y||a.x-b.x);
      const p=spots.shift();
      group.people.push(p);occupied.add(key(p.x,p.y));
    }
    const host=group.people[0];
    if(worksAtSurface&&surface&&host&&Math.abs(host.x-surface.x)+Math.abs(host.y-surface.y)===1)group.workTarget=surface;
    if(group.people.length)map.streetScenes.push(group);
    for(const p of group.people)protect(p.x,p.y,0);
  }
  // Cross-street traffic ties the gathering spots together. These residents
  // travel across the gaps instead of everyone circling the same little stall.
  const gatherings=[...map.streetScenes];
  if(map.id!=='bg-tumbledown'&&!map.id.startsWith('blackstaff-'))for(let i=0;i<Math.min(4,gatherings.length);i++){
    const a=gatherings[i],b=gatherings[(i+2)%gatherings.length];
    const p=a.people.at(-1),arrivals=[];
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const x=b.x+dx,y=b.y+dy,k=key(x,y);
      if(publicFloor(map,x,y)&&reachable.has(k)&&!occupied.has(k)&&!protectedTiles.has(k))arrivals.push({x,y,d:Math.abs(dx)+Math.abs(dy)});
    }
    arrivals.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
    const q=arrivals[0];
    if(!p||!q)continue;
    const path=map.findPath(p,q,{maxNodes:1800,avoid:(x,y)=>!publicFloor(map,x,y)});
    if(!path?.length)continue;
    // Start at an unoccupied step of the route, not on the local audience.
    const start=path.slice(Math.floor(path.length*.35)).find(s=>key(s.x,s.y)!==key(q.x,q.y)&&!occupied.has(key(s.x,s.y))&&!protectedTiles.has(key(s.x,s.y)));
    if(!start)continue;
    occupied.add(key(start.x,start.y));
    occupied.add(key(q.x,q.y));
    map.streetScenes.push({x:start.x,y:start.y,kind:'errand',props:[],people:[start],destination:q,index:map.streetScenes.length});
  }
  map.streetStops=new Set(map.streetScenes.flatMap(g=>[...g.people,...(g.destination?[g.destination]:[])].map(p=>key(p.x,p.y))));
}

class StreetResident extends NPCEntity {
  constructor(map,group,j){
    const spec=ACTIVITIES[group.kind],p=group.people[j];
    const id=`street-${map.id}-${group.index}-${j}`;
    const [activity,fallback]=j>0?PARTICIPANTS[group.kind][j-1]:[spec.task,spec.line];
    const voice=spec.voices?{lines:spec.voices[j]}:streetVoice(map.id,group.kind,j),greeting=voice.lines||fallback,name=voice.name||spec.names[j];
    super({id,npcId:id,name,title:spec.title,sprite:'npc-'+spec.sprites[j],
      x:p.x,y:p.y,dir:j===0?'down':'up',solid:false,noCombat:true,wander:0,
      role:group.kind==='watch'?'guard':'flavor',greeting,
      npc:{id,name,noCombat:true,greeting,role:'flavor'},
      data:{streetLife:true,activity}});
    this.group=group;this.member=j;this.workClock=(hashStr(id)%90)/10;
    this.activity=activity;this.workBeat=0;
    this.route=[];
    if(group.destination){
      this.route=[{x:p.x,y:p.y,wait:2},{...group.destination,wait:4}];
      this.patrol=this.route;
      this.moveTime*=.82;
    }
    if(j>=2){
      const target=group.people[0];
      for(const [dx,dy]of [[3,0],[-3,0],[0,3],[0,-3]]){
        const x=p.x+dx,y=p.y+dy;
        if(!publicFloor(map,x,y)||map.streetStops.has(key(x,y))||Math.abs(x-target.x)+Math.abs(y-target.y)>8)continue;
        const path=map.findPath(p,{x,y},{maxNodes:250,avoid:(tx,ty)=>!publicFloor(map,tx,ty)});
        if(path?.length&&path.length<=8){this.route=[{x:p.x,y:p.y,wait:6+j},{x,y,wait:3}];map.streetStops.add(key(x,y));break;}
      }
      this.patrol=this.route.length?this.route:null;
    }
  }
  think(dt,map,ctx){
    const spec=ACTIVITIES[this.group.kind],minute=((Game.state?.time||0)%1440+1440)%1440;
    this.hidden=minute<spec.from||minute>=spec.to;
    if(this.hidden)return;
    this.frameOverride=null;
    // A shared encounter owns facing and gestures; dialogue and danger still
    // take precedence. Movement itself uses the normal grid/tween machinery.
    if(this.social&&!this.busy&&this.pauseT<=0&&this.fleeT<=0){
      this.workClock+=dt;this.workBeat=Math.floor(this.workClock*2)%4;
      if(!this.moving){
        const s=this.social,other=this===s.host?s.partner:s.host;
        const working=s.phase==='action'&&s.kind==='repair';
        const target=working?this.group.workTarget:other;
        if(target)this.faceToward(target.x,target.y);
        this.frameOverride=`${this.dir}-${working&&this.workBeat===1?3:0}`;
      }
      return;
    }
    // Interrupted partners still avoid the non-solid crowd on their way home.
    // Generic NPC paths see those neighbours as passable; our step() does not.
    if(this.returningHome&&!this.busy&&this.pauseT<=0&&this.fleeT<=0){
      if(walkSocial(map,this,this.home)){this.returningHome=false;this.path=null;}
      return;
    }
    super.think(dt,map,ctx);
    if(this.busy||this.pauseT>0||this.fleeT>0||this.moving)return;
    this.workClock+=dt;this.workBeat=Math.floor(this.workClock*2)%4;
    if(this.member===0&&!this.group.destination){
      const target=this.group.workTarget;
      if(target)this.faceToward(target.x,target.y);
      else if(this.group.people.length>1){
        const audience=this.group.people.slice(1);
        this.faceToward(audience.reduce((s,p)=>s+p.x,0)/audience.length,audience.reduce((s,p)=>s+p.y,0)/audience.length);
      }
      this.frameOverride=`${this.dir}-${this.workBeat===1?3:0}`;
    }else{
      this.frameOverride=null;
      if(!this.patrol)this.faceToward(this.group.people[0].x,this.group.people[0].y);
    }
  }
  step(dir,map,opts={}){
    const v=DIR_VEC[dir];
    if(v&&map.entities.some(e=>e!==this&&e.data?.streetLife&&!e.hidden&&!e.removed&&((e.x===this.x+v.x&&e.y===this.y+v.y)||(e.moving&&e.fromX===this.x+v.x&&e.fromY===this.y+v.y))))return false;
    return super.step(dir,map,opts);
  }
  doPatrol(dt,map){
    if(this.patrolWait>0){this.patrolWait-=dt;return;}
    const target=this.patrol[this.patrolIndex%this.patrol.length];
    if(this.x===target.x&&this.y===target.y){
      this.patrolWait=target.wait;this.patrolIndex++;return;
    }
    const occupied=new Set(map.entities.filter(e=>e!==this&&e.data?.streetLife&&!e.hidden&&!e.removed).map(e=>key(e.x,e.y)));
    this.path=map.findPath(this,target,{maxNodes:1800,goalPassable:false,avoid:(x,y)=>!publicFloor(map,x,y)||occupied.has(key(x,y))||map.entityBlocks(x,y,this)});
    if(!this.path?.length){
      // A courier can meet a returning partner in a one-tile lane. Yield one
      // real step into an unreserved space so neither waits forever for the other.
      const blocked=map.entities.some(e=>e!==this&&e.data?.streetLife&&!e.hidden&&!e.removed&&this.distanceTo(e.x,e.y)===1);
      if(blocked)for(const [dir,v]of Object.entries(DIR_VEC)){
        const x=this.x+v.x,y=this.y+v.y;
        if(!map.streetStops.has(key(x,y))&&freeFor(map,this,x,y)&&this.step(dir,map,{avoidTriggers:true}))break;
      }
      this.patrolWait=1.5;
    }
  }
  draw(ctx,cam,opts){
    const s=this.social,active=s&&!this.busy&&this.pauseT<=0&&this.fleeT<=0&&!this.moving;
    const bow=active&&s.kind==='music'&&this===s.host&&s.phase==='thanks';
    const nod=active&&s.phase==='reply'&&Math.sin(s.t*5)>0.6;
    // Articulated acknowledgement: boots stay planted, torso folds and the head
    // lowers separately. Use the actor's own baked clothes/face and palette.
    const bend=bow?Math.min(1,s.t/.45,(2.4-s.t)/.55):nod?.25:0;
    const drawn=bend>0?drawStreetBend(ctx,this,cam,bend):super.draw(ctx,cam,opts);
    if(!drawn||this.hidden||this.busy||this.fleeT>0)return drawn;
    const x=Math.round(this.px-cam.x),y=Math.round(this.py-cam.y);
    const gestureColors=this.colorway||spriteDef(this.sprite)?.defaultColorway;
    if(active){
      const clap=s.kind==='music'&&s.phase==='action'&&this!==s.host;
      const speak=(s.phase==='request'&&this===s.partner)||(s.phase==='reply'&&this===s.host);
      const reach=s.phase==='action'&&(s.spec.item||['arcane','wards','kettle','auction'].includes(s.kind))&&[s.host,s.partner].includes(this);
      const brace=s.kind==='repair'&&s.phase==='action'&&this===s.partner;
      if(clap||speak||reach||brace){
        if(clap)drawSprite(ctx,'street-gesture',Math.floor(s.t*5+this.member*.3)%2?'clap-closed':'clap-open',x,y-11,{shadow:false,colorway:gestureColors});
        else{
          const hand=streetHand(this),lift=speak&&Math.floor(s.t*2)%2?1:0;
          drawSprite(ctx,'street-gesture','offer-'+this.dir,Math.round(hand.x-cam.x),Math.round(hand.y-cam.y+3-lift),{shadow:false,colorway:gestureColors});
        }
      }
      if(this===s.host&&s.kind==='music'&&s.phase==='action'){
        drawSprite(ctx,'street-gesture',Math.floor(s.t*6)%2?'strum-high':'strum-low',x+(this.dir==='left'?-2:2),y-9,{shadow:false,flip:this.dir==='left',colorway:gestureColors});
      }
      if(brace&&this.group.workTarget){
        // A long fitting runs from the helper's grip to the struck anvil face.
        const hand=streetHand(this),p=this.group.workTarget,tx=p.x*16+8-cam.x,ty=p.y*16+5-cam.y;
        const hx=hand.x-cam.x,hy=hand.y-cam.y,steps=Math.max(Math.abs(tx-hx),Math.abs(ty-hy),1);
        for(let i=0;i<=steps;i++){
          const px=Math.round(hx+(tx-hx)*i/steps),py=Math.round(hy+(ty-hy)*i/steps);
          ctx.fillStyle='#4a535c';ctx.fillRect(px,py,1,2);ctx.fillStyle='#a6afb4';ctx.fillRect(px,py-1,1,1);
        }
      }
    }
    // One physical item travels between adjacent hands, then stays with its
    // receiver as they leave. The receiver draws it so it sorts with them.
    if(s&&this.pauseT<=0){
      if(this===s.partner&&s.spec.item&&['action','thanks','return'].includes(s.phase)){
        const q=s.phase==='action'?Math.min(1,Math.max(0,(s.t-.7)/.8)):1;
        const from=streetHand(s.host),to=streetHand(this);
        const ix=from.x+(to.x-from.x)*q-cam.x,iy=from.y+(to.y-from.y)*q-cam.y;
        if(!drawPlaceItem(ctx,s.spec.item,Math.round(ix),Math.round(iy+4)))drawSprite(ctx,'street-exchange',s.spec.item,Math.round(ix),Math.round(iy+4),{shadow:false});
      }
    }
    // Parcel, folded broadsheet, notes and hammer sparks make the work legible
    // without replacing the existing character silhouettes or equipment art.
    if((this.group.kind==='cargo'&&this.member!==1)||this.group.kind==='errand'){
      ctx.fillStyle='#4a3225';ctx.fillRect(x+1,y-12,7,6);
      ctx.fillStyle='#ba9260';ctx.fillRect(x+2,y-11,5,4);
      ctx.fillStyle='#e2c58a';ctx.fillRect(x+4,y-11,1,4);
    }
    if(this.member===0&&!this.moving){
      if(this.group.kind==='news'){
        ctx.fillStyle='#dbc99c';ctx.fillRect(x+2,y-13,6,7);
        ctx.fillStyle='#75624a';ctx.fillRect(x+3,y-11,4,1);ctx.fillRect(x+3,y-9,3,1);
      }
      if(this.group.kind==='music'&&this.workClock%4<2.5){
        const ny=y-25-Math.floor((this.workClock%4)*3);
        ctx.fillStyle='#d9bc70';ctx.fillRect(x+8,ny,1,5);ctx.fillRect(x+6,ny+4,3,2);ctx.fillRect(x+9,ny,3,1);
      }
      if(this.group.kind==='repair'&&this.group.workTarget&&(!s||s.phase==='action')){
        const p=this.group.workTarget,tx=p.x*16+8-cam.x,ty=p.y*16+5-cam.y;
        const lift=this.workBeat===1?0:4;
        ctx.fillStyle='#513926';ctx.fillRect(tx+1,ty-5-lift,1,6);
        ctx.fillStyle='#a6afb4';ctx.fillRect(tx-2,ty-6-lift,6,2);
        if(this.workBeat===1){ctx.fillStyle='#eac675';ctx.fillRect(tx-4,ty-3,1,1);ctx.fillRect(tx+5,ty-4,1,2);}
      }
    }
    if(this.member===0&&!this.hidden)drawPlaceWork(ctx,this,cam);
    return drawn;
  }
}

export function populateCityStreets(map){
  for(const group of map.streetScenes||[])for(let j=0;j<group.people.length;j++){
    if(map.entities.some(n=>n.id===`street-${map.id}-${group.index}-${j}`))continue;
    const e=new StreetResident(map,group,j);
    e.think(0,map,{});map.addEntity(e);
  }
}

export function drawStreetGoods(ctx,map,cam){
  for(const g of map.streetScenes||[])for(const p of g.props){
    if(p.name!=='TABLE')continue;
    const id=g.kind==='news'?'city-document':'city-place';
    drawSprite(ctx,id,'idle',p.x*16+8-cam.x,p.y*16+9-cam.y,{shadow:false});
  }
  // Tabletop work belongs behind the people standing in front of the counter.
  for(const e of map.entities)if(e.data?.streetLife&&e.member===0&&!e.hidden&&!e.removed)drawPlaceWork(ctx,e,cam,false);
}

export function drawStreetSpeech(ctx,map,cam,player){
  if(!player)return;
  // One nearby speaker at a time; no screen-wide chorus or repeated toasts.
  const near=map.entities.filter(e=>e.data?.streetLife&&!e.hidden&&!e.busy&&e.pauseT<=0&&e.fleeT<=0&&e.distanceTo(player.x,player.y)<7&&
    (streetSight(map,e,player)||e.social?.actors.some(a=>a.distanceTo(player.x,player.y)<7&&streetSight(map,a,player)))&&
    (streetLine(e)||(e.member===0&&!e.social&&(Game.time%17)<2)));
  // Prefer a paired exchange to a passing courier's unrelated callout.
  near.sort((a,b)=>Number(!!streetLine(b))-Number(!!streetLine(a))||a.distanceTo(player.x,player.y)-b.distanceTo(player.x,player.y));
  const e=near[0];if(!e)return;
  const line=streetLine(e)||ACTIVITIES[e.group.kind].call,w=line.length*6+8;
  const x=Math.max(4,Math.min(396-w,Math.round(e.px-cam.x-w/2))),y=Math.round(e.py-cam.y)-39;
  if(y<27||y>194)return;
  ctx.fillStyle='#201e20';ctx.fillRect(x,y,w,13);
  ctx.strokeStyle='#a58b5c';ctx.strokeRect(x+.5,y+.5,w-1,12);
  const tip=Math.max(x+3,Math.min(x+w-4,Math.round(e.px-cam.x)));
  ctx.fillStyle='#a58b5c';ctx.fillRect(tip,y+13,3,1);ctx.fillRect(tip+1,y+14,1,1);
  UI.text(ctx,x+4,y+3,line,{size:'sm',color:'#e8d7af',shadow:false});
}

// Small shared scenes, driven by elapsed simulation time rather than independent
// NPC timers. No money/items/quest flags are changed by these ambient exchanges.
export function streetHand(e){
  const offsets={left:[-7,-12],right:[7,-12],up:[0,-19],down:[0,-7]};
  const [x,y]=offsets[e.dir]||offsets.down;return {x:e.px+x,y:e.py+y};
}
function drawStreetBend(ctx,e,cam,amount){
  if(e.hidden||e.removed)return false;
  const img=getSprite(e.sprite,`${e.dir}-0`,e.colorway);if(!img)return false;
  const x=Math.round(e.px-cam.x)-8,y=Math.round(e.py-cam.y)-24;
  const side=e.dir==='left'?-1:e.dir==='right'?1:0;
  const drop=Math.round(4*amount),lean=Math.round(2*amount)*side;
  ctx.save();
  // Boots and lower hem retain their exact source pixels and screen position.
  ctx.drawImage(img,0,18,16,6,x,y+18,16,6);
  ctx.drawImage(img,0,9,16,9,x+Math.round(lean/2),y+9+Math.round(amount),16,9);
  ctx.drawImage(img,0,0,16,9,x+lean,y+drop,16,9);
  ctx.restore();return true;
}
const EXCHANGES={
  ...PLACE_EXCHANGES,
  market:{item:'fruit',lines:[['Are these ripe?','Picked this morning.','I will take two.'],['A copper for these?','For you, two apples.','That is fair.']]},
  food:{item:'bread',lines:[['Same as yesterday, love?','Saved you the crust.','Aye. Best part.'],['One for the road?','The crust is the best bit.','I will save you a seat.']]},
  music:{lines:[['The chorus once more?','Sing it with me!','A fine audience!'],['Know the sailor song?','Only the polite verses.','You know it well!']]},
  news:{item:'paper',lines:[['What says the broadsheet?','Another council argument.','Some things never change.'],['Any news from the docks?','A ship came in at dawn.','My brother may be aboard.']]},
  repair:{lines:[['Your stew will be cold.','Aye. Hold that end.','Steady as ever.'],['Still a little loose.','One more rivet, then.','Much better.']]},
  cargo:{item:'parcel',lines:[['Next parcel for me?','Mind the twine.','I have it.'],['Is this the last load?','One more after this.','Then supper!']]},
  fish:{item:'fish',lines:[['That gull again, eh?','He knows my hours.','Better than I do.'],['A small one, please.','This one will do nicely.','Supper is settled.']]},
  garden:{item:'flower',lines:[['The flowers look well.','Take one for your window.','It will brighten the room.'],['How do you keep them?','Water, shade, patience.','I shall try again.']]},
  prayer:{item:'cup',lines:[['May I rest here?','Water first. Sit a while.','You are kind.'],['The road was long.','You are welcome here.','A blessing on this place.']]},
  watch:{item:'paper',lines:[['Anything on your round?','All quiet by the gate.','I will note it down.'],['The lamps are ready?','Every wick is trimmed.','Good. Take your break.']]},
};
// Local conversation alternates with the activity's everyday exchanges. Keep
// these incidental: street chatter must not promise a quest or alter its facts.
const CITY_CHAT={
 waterdeep:{
  news:[['Anything from the harbour?','The tide delayed the ferries.','I will take the long road.'],['What is on that notice?','A lantern maker wants help.','My niece knows the trade.']],
  music:[['Her verse again, Nessa?','Watch the shutters.','There! Right on time.'],['Something for the rain?','A march will warm your feet.','That is better!']],
  market:[['Will this keep until dusk?','Wrap it out of the rain.','I have a dry pocket.'],['Busy at the harbour?','Three carts before breakfast.','Save something for us!']],
  watch:[['Any trouble by the docks?','Only a cart with a bad wheel.','Send them to the smith.'],['You left your tea again.','Is it still warm?','Depends how hopeful you are.']],
  repair:[['A wheel from the docks?','Salt has eaten the pin.','I will fetch a fresh one.']],
 },
 baldursgate:{
  news:[['Another edition already?','The Mouth never sleeps.','Nor does my neighbour.'],['Anything from the harbour?','A barge needs unloading.','My cousin needs the work.']],
  music:[['The Elfsong refrain?','Softly, then. Listen close.','That one stays with you.'],['A dancing tune this time?','Mind the cobbles!','My feet know the way.']],
  market:[['A long day at the Wide?','Longer when it rains.','Here, take the dry side.'],['Any change for this?','Let me count it twice.','No hurry; I can wait.']],
  watch:[['How was the gate today?','More carts than people.','Keep the crossing clear.'],['Another harbour round?','After the lamps are lit.','I will walk with you.']],
  cargo:[['Bound for the upper city?','Only as far as the gate.','Let the next crew carry it.']],
 }
};
function exchangeLines(map,g,spec,cycle){
 if(map.id==='bg-citadel-streets'&&g.kind==='news'&&cycle%3===0)
  return ['M-mind that wet corner.','Your aunt writing again?','Cake recipe. Same one.'];
 const city=map.id==='waterdeep'||map.id.startsWith('wd-')?'waterdeep':'baldursgate';
 const local=CITY_CHAT[city]?.[g.kind]||[];
 const pool=[...spec.lines,...local];
 return pool[(cycle+hashStr(map.id+g.index)%pool.length)%pool.length];
}
function streetLine(e){
  const s=e.social;if(!s||s.phase==='approach'||s.phase==='return'||s.phase==='action')return null;
  const speaker=s.phase==='request'?s.partner:s.phase==='reply'?s.host:s.kind==='music'?s.host:s.partner;
  return e===speaker?s.lines[s.phase==='request'?0:s.phase==='reply'?1:2]:null;
}
function streetSight(map,a,b){
  // Low street furniture blocks feet, not conversation. Walls, trees, statues
  // and roofs still occlude it; never hear a conversation through a building.
  return map.ray(a.x,a.y,b.x,b.y).slice(1,-1).every(p=>{
    if(!map.opaque(p.x,p.y))return true;
    const i=p.y*map.w+p.x;
    return !(tileFlags(map.ground[i])&TF.SOLID)&&!/ROOF|TREE|CANOPY/.test(tileKey(map.over[i])||'')&&/^(BENCH|TABLE|PLANTER|SACK|CRATE|BARREL|ANVIL|BRAZIER|CART|MARKET_STALL|HAY)$/.test(tileKey(map.deco[i])||'');
  });
}
function freeFor(map,e,x,y){
  return publicFloor(map,x,y)&&!map.entities.some(n=>n!==e&&!n.hidden&&!n.removed&&
    ((n.x===x&&n.y===y)||(n.moving&&n.fromX===x&&n.fromY===y)));
}
function walkSocial(map,e,target){
  if(e.moving)return false;
  if(e.x===target.x&&e.y===target.y)return true;
  const path=map.findPath(e,target,{maxNodes:700,goalPassable:false,avoid:(x,y)=>!freeFor(map,e,x,y)});
  if(path?.length)e.stepAlong(path,map,{avoidTriggers:true});
  return false;
}
function endSocial(g,cancel=false){
  const s=g.social;if(!s)return;
  for(const e of s.actors){
    e.social=null;e.frameOverride=null;e.path=null;e.activity=e.data.activity;
  }
  // An interrupted shopper walks back normally after dialogue/panic ends.
  if(cancel&&(s.partner.x!==s.home.x||s.partner.y!==s.home.y))s.partner.returningHome=true;
  g.social=null;g.socialCooldown=12+(g.index*7%11);
}
export function updateStreetSocial(map,dt){
  if(!map?.streetScenes)return;
  const minute=((Game.state?.time||0)%1440+1440)%1440;
  for(const g of map.streetScenes){
    const spec=EXCHANGES[g.kind];if(!spec)continue;
    const hours=ACTIVITIES[g.kind],open=minute>=hours.from&&minute<hours.to;
    let s=g.social;
    if(s){
      if(!open||s.actors.some(e=>e.hidden||e.removed||e.busy||e.pauseT>0||e.fleeT>0||e.returningHome)){endSocial(g,true);continue;}
      s.t+=dt;
      if(s.phase==='approach'){
        if(walkSocial(map,s.partner,s.target)){s.phase='request';s.t=0;}
        else if(s.t>8)endSocial(g,true);
      }else if(s.phase==='return'){
        if(walkSocial(map,s.partner,s.home))endSocial(g);
        else if(s.t>8)endSocial(g,true);
      }else{
        const duration=s.phase==='action'?(spec.duration||(g.kind==='music'?4:3)):2.4;
        if(s.t>=duration){
          s.phase={request:'reply',reply:'action',action:'thanks',thanks:'return'}[s.phase];s.t=0;
        }
      }
      if(g.social)for(const e of s.actors)e.activity=`${s.phase==='approach'?'approaching':s.phase==='return'?'returning after':s.phase==='action'?g.kind==='music'?(e===s.host?'playing for':'applauding'):e===s.host?'helping':'receiving help from':'talking with'} ${e===s.host?s.partner.name:s.host.name}`;
      continue;
    }
    if(!open)continue;
    g.socialCooldown=(g.socialCooldown??(2+hashStr(map.id+g.index)%70/10))-dt;
    if(g.socialCooldown>0)continue;
    g.socialCooldown=3;
    // NPC timers may overshoot zero when a frame expires them. Match think()'s
    // positive-only blocking rule, or one conversation/panic excludes them forever.
    const members=map.entities.filter(e=>e.group===g&&!e.hidden&&!e.removed&&!e.busy&&e.pauseT<=0&&e.fleeT<=0&&!e.moving&&!e.returningHome&&!e.social);
    const host=members.find(e=>e.member===0);
    const partner=host&&members.find(e=>(g.kind==='music'?e.member>0:e.member===1)&&host.distanceTo(e.x,e.y)<=6&&streetSight(map,host,e));
    if(!host||!partner)continue;
    let target={x:partner.x,y:partner.y};
    if(g.kind!=='music'){
      const around=g.kind==='repair'?g.workTarget:host;
      if(!around)continue;
      const offsets=g.kind==='repair'?[...N4,[-1,-1],[1,-1],[-1,1],[1,1]]:N4;
      const choices=offsets.map(([dx,dy])=>({x:around.x+dx,y:around.y+dy})).filter(p=>freeFor(map,partner,p.x,p.y)&&(!map.streetStops.has(key(p.x,p.y))||(p.x===partner.home.x&&p.y===partner.home.y)));
      choices.sort((a,b)=>(g.kind==='repair'?(Math.abs(a.x-around.x)+Math.abs(a.y-around.y)-Math.abs(b.x-around.x)-Math.abs(b.y-around.y))*10:0)+partner.distanceTo(a.x,a.y)-partner.distanceTo(b.x,b.y));
      target=choices.find(p=>map.findPath(partner,p,{maxNodes:700,goalPassable:false,avoid:(x,y)=>!freeFor(map,partner,x,y)})?.length||partner.x===p.x&&partner.y===p.y);
      if(!target)continue;
    }
    const actors=g.kind==='music'?members.filter(e=>host.distanceTo(e.x,e.y)<=6&&streetSight(map,host,e)):[host,partner];
    const cycle=g.socialCycle||0;g.socialCycle=cycle+1;
    s=g.social={kind:g.kind,spec,cycle,lines:exchangeLines(map,g,spec,cycle),host,partner,actors,target,home:{x:partner.home.x,y:partner.home.y},phase:'approach',t:0};
    for(const e of actors){e.social=s;e.path=null;e.frameOverride=null;}
  }
}
