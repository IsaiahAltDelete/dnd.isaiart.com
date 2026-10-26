// Visual dressing only. Generation, save data, collision and cover stay in mapkit.
import { T } from './tiles.js';
import { drawSprite } from './sprites.js';
import './art/dungeon-life.js';

const plans=new WeakMap(), walls=new Map(), WALL_LIMIT=768;
const hash=(x,y)=>{let n=Math.imul(x+317,374761393)^Math.imul(y+73,668265263);n=Math.imul(n^(n>>>13),1274126177);return(n^(n>>>16))>>>0;};
const seedOf=map=>{let n=0;for(const c of String(map.seed||map.id||'dungeon'))n=(Math.imul(n,31)+c.charCodeAt(0))|0;return n;};
const floor=id=>[T.DUNGEON_FLOOR,T.STONE_FLOOR,T.STONE_FLOOR_CRACKED].includes(id);
const active=map=>map?.at&&(map.rooms||map.deploy)&&['dungeon','crypt','underdark'].includes(map.theme||map.biome);
// Low, traversable objects only; no fake solid furniture on a walkable square.
const clear=(map,x,y)=>floor(map.at('ground',x,y))&&!map.at('deco',x,y)&&!map.solidAt(x,y)&&!map.triggerAt?.(x,y);

export function dungeonSceneryPlan(map){
  if(!active(map))return [];
  if(plans.has(map))return plans.get(map);
  const result=[],seed=seedOf(map);
  for(const r of map.rooms||[]){
    if(r.w<5||r.h<5||['boss','entry','exit'].includes(r.kind))continue;
    const roles=['bunkroom','stores','watch','devotion'],preferred=hash(r.x+seed,r.y)%4;
    const items=[],floorSpots=[],wallSpots=[];
    for(let x=r.x;x<r.x+r.w;x++){
      if(map.at('deco',x,r.y-1)===T.DUNGEON_WALL)wallSpots.push({x,y:r.y-1});
    }
    for(let y=r.y+1;y<r.y+r.h-1;y++)for(let x=r.x+1;x<r.x+r.w-1;x++){
      if(x!==r.x+1&&x!==r.x+r.w-2&&y!==r.y+1&&y!==r.y+r.h-2)continue;
      if(!clear(map,x,y)||[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>map.triggerAt?.(a,b)))continue;
      floorSpots.push({x,y});
    }
    const add=(frame,x,y,wall=false)=>{
      const candidates=(wall?wallSpots:floorSpots).filter(p=>!items.some(i=>i.x===p.x&&i.y===p.y));
      candidates.sort((a,b)=>(Math.abs(a.x-x)+Math.abs(a.y-y))-(Math.abs(b.x-x)+Math.abs(b.y-y))||a.y-b.y||a.x-b.x);
      if(!candidates.length)return false;
      items.push({frame,...candidates[0],wall});return true;
    };
    // Keep door approaches and the central aisle bare. Plans do not consume RNG.
    const north=r.y,west=r.x+1,east=r.x+r.w-2;
    // Reserve the defining element first. Fully occupied rooms can still be
    // watch posts or shrines, using a free wall rather than fake solid furniture.
    let role=null;
    for(let offset=0;offset<roles.length;offset++){
      const candidate=roles[(preferred+offset)%roles.length];
      const frame={bunkroom:'bedroll',stores:'ledger',watch:'rack',devotion:'relief'}[candidate];
      const wall=candidate==='watch'||candidate==='devotion';
      if(add(frame,candidate==='devotion'?Math.floor(r.x+r.w/2):candidate==='stores'?east:west,wall?north-1:north+1,wall)){role=candidate;break;}
    }
    if(!role)continue; // No safe surface: leave this genuinely occupied room alone.
    if(role==='bunkroom'){
      add('bedroll',west,north+3);add('meal',west+1,north+2);
      add('banner',west,north-1,true);
    }else if(role==='stores'){
      add('meal',east-1,north+1);add('rack',east,north-1,true);
    }else if(role==='watch'){
      add('banner',east,north-1,true);add('meal',west,north+1);
    }else{
      add('banner',west,north-1,true);add('ledger',west,north+1);
    }
    result.push({room:r.id,role,items});
  }
  plans.set(map,result);return result;
}

function wallTile(x,y,edge,crypt){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
  const g=canvas.getContext('2d'),tones=crypt?['#41424a','#45464c','#49484e']:['#414954','#454d57','#49515b'];
  // Wide blocks run continuously across tile boundaries, with an eight-pixel bond.
  for(let py=0;py<16;py++)for(let px=0;px<16;px++){
    const X=x*16+px,Y=y*16+py,row=Math.floor(Y/8),u=(X+(row&1)*12)%24,v=Y%8,h=hash(Math.floor((X+(row&1)*12)/24),row);
    let color=tones[h%3];
    if(u===23||v===7)color='#2d343e';
    else if(v===0&&u<22)color='#60656a';
    else if(u===0&&v<6)color='#535c64';
    if((h%9===0)&&(v>3&&u>15))color='#3c4949';
    g.fillStyle=color;g.fillRect(px,py,1,1);
  }
  if(edge&1){g.fillStyle='#777971';g.fillRect(0,0,16,1);g.fillStyle='#555c60';g.fillRect(0,1,16,2);}
  if(edge&2){g.fillStyle='#777971';g.fillRect(0,0,1,16);}
  if(edge&4){g.fillStyle='#272d36';g.fillRect(14,0,2,16);}
  if(edge&8){g.fillStyle='#292e38';g.fillRect(0,13,16,3);g.fillStyle='#64696b';g.fillRect(0,3,16,1);}
  // Chipped faces are sparse; regular stonework remains the dominant shape.
  if(hash(x,y)%7===0){g.fillStyle='#2d343e';g.fillRect(9,5,1,3);g.fillRect(10,8,2,1);}
  return canvas;
}

export function drawDungeonScenery(ctx,map,cam,width,height){
  if(!active(map))return;
  const left=Math.max(0,Math.floor(cam.x/16)),top=Math.max(0,Math.floor(cam.y/16));
  const right=Math.min(map.w,Math.ceil((cam.x+width)/16)),bottom=Math.min(map.h,Math.ceil((cam.y+height)/16));
  const crypt=(map.theme||map.biome)==='crypt';
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    if(map.at('deco',x,y)!==T.DUNGEON_WALL)continue;
    const open=(a,b)=>a>=0&&b>=0&&a<map.w&&b<map.h&&floor(map.at('ground',a,b))&&map.at('deco',a,b)!==T.DUNGEON_WALL;
    const edge=(open(x,y-1)?1:0)|(open(x-1,y)?2:0)|(open(x+1,y)?4:0)|(open(x,y+1)?8:0);
    const key=`${x},${y}:${edge}:${+crypt}`;
    let tile=walls.get(key);if(!tile){tile=wallTile(x,y,edge,crypt);if(walls.size>=WALL_LIMIT)walls.delete(walls.keys().next().value);walls.set(key,tile);}
    ctx.drawImage(tile,Math.round(x*16-cam.x),Math.round(y*16-cam.y));
  }
  for(const room of dungeonSceneryPlan(map))for(const item of room.items){
    const {x,y,frame,wall}=item;
    if(x<left||y<top||x>=right||y>=bottom)continue;
    // A later quest/spawn may replace a planned tile. Never cover its new contents.
    if(wall?map.at('deco',x,y)!==T.DUNGEON_WALL:!clear(map,x,y))continue;
    drawSprite(ctx,'dungeon-life',frame,Math.round(x*16-cam.x),Math.round(y*16-cam.y),{anchor:'topleft',shadow:false});
  }
}

export function sceneryCacheInfo(){return {wallTiles:walls.size,wallLimit:WALL_LIMIT};}
