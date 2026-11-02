// Shared, purely visual floor treatment. Never writes map layers or rule flags.
import { T, drawTile } from './tiles.js';
import { drawSprite } from './sprites.js';
import { paintBoneScatter } from './tiles_terrain.js';
import './art/floor-waystone.js';

const cache = new Map();
const LIMIT = 1536; // At most 1.5 MiB of 16x16 RGBA tiles, across all maps.
const plans = new WeakMap();
const hash = (x,y) => { let n=Math.imul(x+173,374761393)^Math.imul(y+91,668265263);n=Math.imul(n^(n>>>13),1274126177);return(n^(n>>>16))>>>0; };
const stone = id => id===T.DUNGEON_FLOOR||id===T.STONE_FLOOR||id===T.STONE_FLOOR_CRACKED;
const natural = id => [T.GRASS,T.GRASS_2,T.CLOVER,T.DIRT,T.DIRT_PATH].includes(id);
const clamp01 = n => Math.max(0,Math.min(1,n));

export function floorDesignInfo() { return { cachedTiles:cache.size, limit:LIMIT }; }

// A wide, staggered ashlar bond runs through tile boundaries. The same world
// coordinate always selects the same slab, so camera movement cannot shimmer.
function slabTile(x,y,crypt,cracked) {
  const c=document.createElement('canvas');c.width=c.height=16;
  const g=c.getContext('2d');
  const tones=crypt?['#666463','#6b6864','#625f60','#706d68']:['#5c6268','#60676b','#666b6d','#585f65'];
  for(let py=0;py<16;py++)for(let px=0;px<16;px++){
    const X=x*16+px,Y=y*16+py,row=Math.floor(Y/12),shift=(row&1)*12;
    const col=Math.floor((X+shift)/24),u=(X+shift)%24,v=Y%12,h=hash(col,row);
    let color=tones[h%tones.length];
    if(v===11||u===23) color=crypt?'#4e4c4e':'#454d55';
    else if((v===0&&u>1&&u<20)||(u===0&&v>1&&v<9))color=crypt?'#79766f':'#747b7b';
    else if(hash(X,Y)%61===0)color='#7b807c';
    else if(hash(X,Y)%47===0)color='#51595e';
    g.fillStyle=color;g.fillRect(px,py,1,1);
  }
  if(cracked&&hash(x,y)%3===0){
    g.fillStyle='#3f494f';let cx=3+hash(x,0)%7;
    for(let yy=2;yy<13;yy++){g.fillRect(cx,yy,1,1);if(yy%3===0)cx+=hash(x,yy)%2?1:-1;}
  }
  return c;
}

function earthTile(map,x,y){
  const c=document.createElement('canvas');c.width=c.height=16;
  const g=c.getContext('2d');drawTile(g,T.GRASS_2,0,0,x,y);
  const grass=g.getImageData(0,0,16,16);
  drawTile(g,T.DIRT_PATH,0,0,x,y);const earth=g.getImageData(0,0,16,16);
  for(let py=0;py<16;py++)for(let px=0;px<16;px++){
    const X=x*16+px,Y=y*16+py;
    const track=map.h*8+Math.sin(X*.026)*19+Math.sin(X*.009)*9;
    const width=map.biome==='road'?16:4;
    const trail=clamp01((width+5-Math.abs(Y-track))/9);
    const field=Math.sin(X*.023+Math.sin(Y*.035)*1.5)+Math.cos(Y*.039+X*.008)*.7;
    const patch=clamp01((field-1.1)*1.6);
    const coverage=clamp01(Math.max(trail,patch)+(hash(X,Y)%11-5)*.025);
    const i=(py*16+px)*4;
    for(let k=0;k<3;k++)grass.data[i+k]=Math.round(grass.data[i+k]*(1-coverage)+earth.data[i+k]*coverage);
  }
  g.putImageData(grass,0,0);return c;
}

/** Ordinary surfaces share a palette; bone litter stays visible. Other hazards retain their art. */
export function drawGroundSurface(ctx,map,id,px,py,x,y) {
  if(!map||typeof document==='undefined')return false;
  const underground=map.rooms||map.deploy;
  if(underground&&(stone(id)||id===T.BONE_FLOOR)) {
    const crypt=map.biome==='crypt'||map.theme==='crypt',cracked=id===T.STONE_FLOOR_CRACKED;
    const bones=id===T.BONE_FLOOR;
    const key=`${x},${y}:${crypt?1:0}:${cracked?1:0}:${bones?1:0}`;
    let tile=cache.get(key);
    if(!tile){
      tile=slabTile(x,y,crypt,cracked);
      if(bones){
        // Remains collect in quiet pockets rather than filling every rough tile.
        // Movement-cost hatching still marks every difficult square separately.
        const pocket=Math.sin(x*.53)+Math.cos(y*.61);
        const density=pocket>.85?.65:pocket>.45?.2:0;
        paintBoneScatter(tile.getContext('2d'),0,0,hash(x,y),density,.58);
      }
      if(cache.size>=LIMIT)cache.delete(cache.keys().next().value);cache.set(key,tile);
    }
    ctx.drawImage(tile,px,py);
    return true;
  }
  if(map.deploy&&natural(id)&&['plains','forest','road','hills','pine-forest'].includes(map.biome)){
    // World-pixel coverage gives patches rounded, feathered edges across tiles.
    const key=`earth:${map.biome}:${map.h}:${x},${y}`;
    let tile=cache.get(key);
    if(!tile){tile=earthTile(map,x,y);if(cache.size>=LIMIT)cache.delete(cache.keys().next().value);cache.set(key,tile);}
    ctx.drawImage(tile,px,py);
    return true;
  }
  return false;
}

function roomPlan(map){
  let plan=plans.get(map);if(plan)return plan;
  const rooms=map.rooms|| (map.deploy&&['dungeon','crypt','ruins','city'].includes(map.biome)?[{x:2,y:2,w:map.w-4,h:map.h-4,kind:'battle'}]:[]);
  plan=rooms.filter(r=>r.w>=5&&r.h>=5).map(r=>({...r,inlay:null}));
  for(const r of plan){
    // Do not decorate a chest, stair or special ground. Different rooms retain
    // empty central space; the motif is a landmark, not a repeated wallpaper.
    if(r.kind!=='entry'&&r.kind!=='boss'&&r.kind!=='battle'&&hash(r.x,r.y)%3!==0)continue;
    const cx=r.x+Math.floor(r.w/2)-1,cy=r.y+Math.floor(r.h/2)-1;
    for(const [x,y] of [[cx,cy],[r.x+1,r.y+1]]){
      let clear=true;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        if(!stone(map.at('ground',x+dx,y+dy))||map.at('deco',x+dx,y+dy)||map.triggerAt?.(x+dx,y+dy))clear=false;
      }
      if(clear){r.inlay={x:x*16,y:y*16};break;}
    }
  }
  plans.set(map,plan);return plan;
}

/** Painted before scenery and actors; visible-cell clipping prevents markings on walls. */
export function drawGroundDetails(ctx,map,cam={x:0,y:0},width=400,height=240){
  if(!map?.at)return;
  const plan=roomPlan(map);if(!plan.length)return;
  ctx.save();ctx.translate(-cam.x,-cam.y);
  for(const r of plan){
    if((r.x+r.w)*16<cam.x||r.x*16>cam.x+width||(r.y+r.h)*16<cam.y||r.y*16>cam.y+height)continue;
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){
      if(x!==r.x&&x!==r.x+r.w-1&&y!==r.y&&y!==r.y+r.h-1)continue;
      if(!stone(map.at('ground',x,y))||map.solidAt(x,y))continue;
      const px=x*16,py=y*16;
      ctx.fillStyle='#404b52';
      if(y===r.y)ctx.fillRect(px,py+5,16,3);
      if(y===r.y+r.h-1)ctx.fillRect(px,py+8,16,3);
      if(x===r.x)ctx.fillRect(px+5,py,3,16);
      if(x===r.x+r.w-1)ctx.fillRect(px+8,py,3,16);
      ctx.fillStyle='#838473';
      if(y===r.y)ctx.fillRect(px,py+5,13,1);
      if(y===r.y+r.h-1)ctx.fillRect(px+2,py+10,13,1);
      if(x===r.x)ctx.fillRect(px+5,py,1,13);
      if(x===r.x+r.w-1)ctx.fillRect(px+10,py+2,1,13);
    }
    if(r.inlay)drawSprite(ctx,'floor-waystone','idle',r.inlay.x,r.inlay.y,{scale:2,anchor:'topleft',shadow:false});
  }
  ctx.restore();
}
