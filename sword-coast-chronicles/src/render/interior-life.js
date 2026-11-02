// Room-scale textiles and daylight sit below feet and furniture. No collision
// data is changed: an embroidered runner is still ordinary walkable floor.
import { tileKey } from './tiles.js';
import './art/counter-goods.js';
import { drawSprite } from './sprites.js';
import './art/city-meal.js';
import './art/city-arcana.js';
import './art/city-papers.js';
import './art/portal-shaft.js';
import './art/city-place.js';
import './art/city-document.js';
import './art/city-press.js';
import './art/city-orb-case.js';
import './art/city-potion-case.js';
import './art/city-civic-banner.js';

const RUGS = {
  'stonehill-inn': [[6,7,4,4,'red'],[13,10,4,4,'red']],
  'barthens-provisions': [[6,6,6,2,'ochre']],
  waterdeep: [[23,14,4,5,'sea'],[18,17,4,2,'sea']],
  'elfsong-tavern': [[5,7,5,5,'wine'],[16,7,5,5,'wine'],[7,13,5,5,'wine'],[15,14,5,4,'wine']],
  'sorcerous-sundries': [[9,3,4,8,'violet'],[9,12,4,4,'violet']],
  'baldurs-mouth': [[8,6,4,8,'ink']],
  'high-hall': [[13,6,4,16,'civic']],
};
const CITY_RUG={sea:['#304e55','#af9b67','#21363e'],wine:['#65333e','#b28b58','#3e2530'],violet:['#403851','#a09674','#29283e'],ink:['#384447','#988c6a','#252f34'],civic:['#65333e','#b28b58','#3e2530']};

function cityRug(ctx,x,y,w,h,hue){
 const [pile,thread,shade]=CITY_RUG[hue];
 ctx.fillStyle=shade;ctx.fillRect(x+2,y+2,w,h);
 ctx.fillStyle=pile;ctx.fillRect(x,y,w,h);
 // Quiet weave; a single central medallion gives the room a focal shape.
 ctx.fillStyle='rgba(223,195,149,.055)';
 for(let yy=2;yy<h-2;yy+=3)ctx.fillRect(x+2,y+yy,w-4,1);
 ctx.strokeStyle=thread;ctx.lineWidth=1;ctx.strokeRect(x+2.5,y+2.5,w-5,h-5);
 ctx.strokeStyle=shade;ctx.strokeRect(x+5.5,y+5.5,w-11,h-11);
 ctx.fillStyle=thread;
 for(let xx=5;xx<w-4;xx+=4){ctx.fillRect(x+xx,y-1,1,2);ctx.fillRect(x+xx,y+h-1,1,2);}
 for(let yy=9;yy<h-8;yy+=12){ctx.fillRect(x+3,y+yy,2,3);ctx.fillRect(x+w-5,y+yy,2,3);}
 const cx=Math.round(x+w/2),cy=Math.round(y+h/2),r=Math.min(15,Math.floor(w/3));
 ctx.fillStyle=shade;
 for(let k=-r;k<=r;k++)ctx.fillRect(cx-(r-Math.abs(k)),cy+k,2*(r-Math.abs(k))+1,1);
 ctx.fillStyle=thread;
 for(let k=-r;k<=r;k++){const dx=r-Math.abs(k);ctx.fillRect(cx-dx,cy+k,1,1);ctx.fillRect(cx+dx,cy+k,1,1);}
 if(hue==='sea'){
   // Waterdeep: a stitched compass, with a long north point.
   for(let k=-9;k<=6;k++)ctx.fillRect(cx-(Math.abs(k)<4?2:0),cy+k,Math.abs(k)<4?5:1,1);
   ctx.fillRect(cx-7,cy,15,1);
 }else if(hue==='violet'){
   for(let k=-7;k<=7;k++){ctx.fillRect(cx+k,cy+k,1,1);ctx.fillRect(cx-k,cy+k,1,1);}
   ctx.fillRect(cx-10,cy,21,1);ctx.fillRect(cx,cy-10,1,21);
   ctx.fillStyle=pile;ctx.fillRect(cx-2,cy-2,5,5);
 }else if(hue==='wine'){
   // Splayed horns and a rounded soundbox distinguish a lyre from a grille.
   ctx.fillRect(cx-7,cy-8,3,2);ctx.fillRect(cx+5,cy-8,3,2);
   ctx.fillRect(cx-6,cy-6,2,6);ctx.fillRect(cx+5,cy-6,2,6);
   ctx.fillRect(cx-5,cy-5,11,1);
   ctx.fillRect(cx-5,cy,2,5);ctx.fillRect(cx+4,cy,2,5);
   ctx.fillRect(cx-4,cy+4,9,2);ctx.fillRect(cx-2,cy+6,5,2);
   for(let xx=-2;xx<=2;xx+=2)ctx.fillRect(cx+xx,cy-4,1,9);
 }else if(hue==='civic'){
   // Balduran's ship on the Council's runner.
   ctx.fillRect(cx,cy-10,1,16);
   for(let k=0;k<10;k++)ctx.fillRect(cx+2,cy-8+k,Math.min(7,3+k),1);
   ctx.fillRect(cx-5,cy-7,4,9);
   ctx.fillRect(cx-9,cy+5,19,2);ctx.fillRect(cx-7,cy+7,15,2);ctx.fillRect(cx-4,cy+9,9,2);
 }else{ctx.fillRect(cx-6,cy-5,13,10);ctx.fillStyle=pile;ctx.fillRect(cx,cy-4,1,8);}
}
export function drawInteriorFloor(ctx, map, cam, time) {
  if ((!map.indoor && map.id!=='waterdeep') || !map.safe) return;
  for (const [tx,ty,tw,th,hue] of RUGS[map.id] || []) {
    const x=tx*16-cam.x+2,y=ty*16-cam.y+2,w=tw*16-4,h=th*16-4;
    if(CITY_RUG[hue]){cityRug(ctx,x,y,w,h,hue);continue;}
    ctx.fillStyle='#271f20';ctx.fillRect(x+2,y+2,w,h);
    ctx.fillStyle=hue==='red'?'#703c3c':'#6a5840';ctx.fillRect(x,y,w,h);
    // Alternating warp/weft, with occasional worn threads in the pile.
    for(let yy=1;yy<h-1;yy+=2)for(let xx=1;xx<w-1;xx+=2){
      ctx.fillStyle=(xx+yy)%4===0?'rgba(220,179,119,.13)':'rgba(31,24,25,.18)';
      ctx.fillRect(x+xx,y+yy,1,1);
    }
    ctx.strokeStyle='#b29565';ctx.lineWidth=1;ctx.strokeRect(x+3.5,y+3.5,w-7,h-7);
    ctx.strokeStyle='#382c2c';ctx.strokeRect(x+6.5,y+6.5,w-13,h-13);
    ctx.fillStyle='#b29565';
    for(let k=5;k<w-4;k+=4){ctx.fillRect(x+k,y-1,1,2);ctx.fillRect(x+k,y+h-1,1,2);}
    for(let yy=11;yy<h-8;yy+=10)for(let xx=11;xx<w-8;xx+=10){
      ctx.fillStyle='#a17c55';
      for(let k=-3;k<=3;k++){const dx=3-Math.abs(k);ctx.fillRect(x+xx-dx,y+yy+k,1,1);ctx.fillRect(x+xx+dx,y+yy+k,1,1);}
      ctx.fillStyle='#c3a16b';ctx.fillRect(x+xx,y+yy,1,1);
    }
  }
  if(!map.indoor)return;
  // Light only reaches walkable floor; clip each cell so a shaft cannot pass
  // through a partition or paint over a neighbouring room's wall.
  const daylight=Math.max(0,Math.sin(((time||0)-360)/720*Math.PI));
  if (!daylight) return;
  for(let ty=0;ty<map.h;ty++)for(let tx=0;tx<map.w;tx++){
    const key=tileKey(map.deco[ty*map.w+tx])||'';
    if (!key.includes('WINDOW')) continue;
    for(let dy=1;dy<=4;dy++) {
      const yy=ty+dy;if(yy>=map.h || map.solidAt(tx,yy))break;
      const x=tx*16-cam.x,y=yy*16-cam.y;
      ctx.fillStyle=`rgba(234,210,153,${daylight*(5-dy)*0.024})`;
      ctx.fillRect(x+3,y,11,16);
      ctx.fillStyle=`rgba(234,210,153,${daylight*(5-dy)*0.012})`;
      ctx.fillRect(x+1,y,2,16);ctx.fillRect(x+14,y,2,16);
    }
  }
}

export function drawInteriorGoods(ctx,map,cam) {
  // Existing counter tops support the goods; the walking aisle stays clear.
  const at=map.id==='barthens-provisions'?[[7,4],[10,4]]:map.id==='stonehill-inn'?[[8,5]]:[];
  for(const [x,y]of at)drawSprite(ctx,'counter-goods','idle',x*16-cam.x+8,y*16-cam.y+5,{shadow:false});
  const put=(id,x,y)=>drawSprite(ctx,id,'idle',Math.round(x*16-cam.x),Math.round(y*16-cam.y),{shadow:false});
  const placements={
    waterdeep:[['city-meal',17,16.6],['city-place',24.5,15.55],['city-papers',18.5,16.6],['portal-shaft',20.5,13],['city-papers',17,13.6],['city-meal',24,18.6]],
    'elfsong-tavern':[['city-meal',9,5.6],['city-place',15,5.55],['city-meal',7,9.6],['city-place',12.5,8.55],['city-papers',18,9.6],['city-meal',9,14.6],['city-place',17,16.55],['city-papers',23,8.6],['city-place',3.5,10.55],['city-papers',16.5,5.6]],
    'sorcerous-sundries':[['city-arcana',9,11.6],['city-arcana',12.5,11.6],['city-orb-case',6.5,8],['city-potion-case',15.5,8],['city-papers',5,13.6],['city-arcana',7,13.6],['city-arcana',15,14.6],['city-papers',17,14.6]],
    'baldurs-mouth':[['city-papers',7,4.6],['city-papers',12,4.6],['city-document',4.5,8.55],['city-document',15.5,8.55],['city-document',14.5,12.55],['city-press',10,4.9],['city-papers',4,6.6],['city-papers',6,6.6],['city-papers',14,6.6],['city-papers',16,6.6],['city-papers',4,13.6]],
    'high-hall':[['city-papers',14,4.6],['city-papers',16,4.6],['city-papers',3,3.6],['city-civic-banner',6.5,14.75],['city-civic-banner',23.5,14.75],['city-document',10.5,10.55],['city-document',19.5,12.55],...[[3,8],[26,8],[3,14],[26,14],[3,19],[26,19]].map(([x,y])=>['city-papers',x+0.5,y+0.6])],
  };
  for(const [id,x,y]of placements[map.id]||[])put(id,x,y);
}
