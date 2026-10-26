import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
// Compare with the pre-optimization renderer, not a second copy of the cache.
const old=execFileSync('git',['show','HEAD:src/world/overworld.js'],{encoding:'utf8'});
const start=old.indexOf('  _drawLayer(ctx, layer, cam) {'),end=old.indexOf('\n  /**',start);
const source='function '+old.slice(start,end).trim().replace(/,$/,'');
const out='output/performance/tiles',run=await privatePlaytest(out),{page,errors}=run;
try {
 await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.draft.name='Cache Tester';b._autoFillPicks();b.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);
 const result=await page.evaluate(async source=>{
  const G=SC.Game,s=G.top,T=await import('/src/render/tiles.js'),{travelTo}=await import('/src/world/overworld.js');
  cancelAnimationFrame(G._raf);const reference=new Function('drawTile','VIEW_W','VIEW_H','TILE','return '+source)(T.drawTile,400,240,16);
  const canvas=()=>{const c=document.createElement('canvas');c.width=400;c.height=240;return c.getContext('2d',{willReadFrequently:true});};
  const a=canvas(),b=canvas(),checks=[],bench=[];
  const compare=(name,layer,cam)=>{
   a.clearRect(0,0,400,240);b.clearRect(0,0,400,240);reference.call(s,a,layer,cam);s._drawLayer(b,layer,cam);
   const x=a.getImageData(0,0,400,240).data,y=b.getImageData(0,0,400,240).data;let differences=0;
   for(let i=0;i<x.length;i++)if(x[i]!==y[i])differences++;
   checks.push({name,differences});
  };
  for(const id of ['phandalin','stonehill-inn','waterdeep','bg-the-wide','bg-eastway','elfsong-tavern']){
   travelTo(id);const m=s.map;
   for(const layer of ['ground','deco'])for(const cam of [{x:0,y:0},{x:17,y:33},{x:-8,y:-8},{x:m.w*16-390,y:m.h*16-230}]){
    compare(id+' '+layer+' '+JSON.stringify(cam),layer,cam);compare(id+' warm '+layer+' '+JSON.stringify(cam),layer,cam);
   }
   const cam={x:0,y:0},index=3*m.w+3,prev=m.deco[index];
   m.deco[index]=T.T.TORCH||T.T.GRASS;compare(id+' changed tile','deco',cam);
   m.deco[index]=0;compare(id+' removed tile','deco',cam);m.deco[index]=prev;
   s.t+=.3;compare(id+' animation','ground',cam);
   T.clearTileCache();compare(id+' palette invalidation','ground',cam);
   const measure=fn=>{const times=[];for(let i=0;i<15;i++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return times[7];};
   bench.push({id,legacyMs:measure(()=>reference.call(s,a,'ground',cam)),cachedMs:measure(()=>s._drawLayer(b,'ground',cam))});
  }
  G._draw();return {checks,bench,drawFailures:[...(G._drawFails||[])]};
 },source);
 await run.shot('elfsong');fs.writeFileSync(out+'/report.json',JSON.stringify({...result,errors},null,2));
 assert.equal(errors.length,0);assert.equal(result.drawFailures.length,0);assert.equal(result.checks.filter(c=>c.differences).length,0);
 console.log(`${result.checks.length} pixel comparisons passed`,result.bench);
}finally{await run.close();}
