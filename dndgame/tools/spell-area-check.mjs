import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/spell-animation/area',scale=Number(process.argv[3]||2),r=await privatePlaytest(out,scale),{page,errors}=r,checks=[];
const key=async k=>{await page.keyboard.press(k);await page.waitForTimeout(120);};
try{
 for(const id of ['burning-hands','lightning-bolt'])for(const zoom of [1,2])for(const [label,dx,dy]of [['horizontal',3,0],['diagonal',2,2]]){
  const name=`${id}-z${zoom}-${label}`;
  await page.evaluate(async zoom=>{await(await import('/tools/spell-animation-fixture.js')).stageSpellBattle();SC.Game.top.zoom=zoom;SC.Game.top._recenter();const {VFX}=await import('/src/render/vfx.js');window.actualCast=null;if(!window.originalCast){window.originalCast=VFX.cast;VFX.cast=function(sp,o){window.actualCast={sp,o};return originalCast.call(this,sp,o);};}},zoom);await page.waitForTimeout(450);
  for(let depth=0;depth<6;depth++){
   const s=await page.evaluate(id=>{const b=SC.Game.top,rows=b._currentRows(),has=r=>r.id==='spell:'+id||(r.sub||[]).some(has);return{i:b.menuPath.length?b.subIndex:b.menuIndex,j:rows.findIndex(has),n:rows.length,hit:rows.find(has)?.id};},id);
   assert(s.j>=0);for(let n=0;n<(s.j-s.i+s.n)%s.n;n++)await key('ArrowRight');await key('KeyZ');if(s.hit==='spell:'+id)break;
  }
  const aim=await page.evaluate(({dx,dy})=>{const b=SC.Game.top;return{start:{...b.cursor},to:{x:b.enc.current.pos.x+dx,y:b.enc.current.pos.y+dy}};},{dx,dy});
  for(let n=0;n<Math.abs(aim.to.x-aim.start.x);n++)await key(aim.to.x>aim.start.x?'ArrowRight':'ArrowLeft');
  for(let n=0;n<Math.abs(aim.to.y-aim.start.y);n++)await key(aim.to.y>aim.start.y?'ArrowDown':'ArrowUp');
  await r.shot(name+'-preview');await key('KeyZ');await page.waitForFunction(id=>actualCast?.sp.id===id,id,{timeout:20000});
  const evidence=await page.evaluate(async()=>{
   cancelAnimationFrame(SC.Game._raf);const {VFX}=await import('/src/render/vfx.js'),{FX}=await import('/src/render/fx.js');const {sp,o}=actualCast;
   // Reproduce the exact options captured from the real area beat at fixed ages.
   FX.clear();VFX.reseed('area-phase');originalCast.call(VFX,sp,{...o,onImpact:null});const images=[];let t=0;
   for(const age of [.12,.28,.42]){while(t<age){VFX.update(.01);t+=.01;}SC.Game._draw();images.push(SC.Stage.snapshot());}
   return{from:o.from,to:o.to,angle:Math.atan2(o.to.y-o.from.y,o.to.x-o.from.x)*180/Math.PI,images};
  });evidence.images.forEach((data,i)=>fs.writeFileSync(`${out}/${name}-${i}.png`,Buffer.from(data.split(',')[1],'base64')));delete evidence.images;
  checks.push({id,zoom,label,...evidence,directionMatches:Math.abs(evidence.angle-Math.atan2(dy,dx)*180/Math.PI)<.001});
  // Restart this private game's clock for the next independently staged cast.
  await page.evaluate(()=>{SC.Game._raf=requestAnimationFrame(t=>SC.Game._tick(t));});
 }
 fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
 if(process.argv.includes('--assert'))assert(checks.every(c=>c.directionMatches)&&!errors.length);
}catch(e){await r.shot('failure');fs.writeFileSync(out+'/failure.json',JSON.stringify({error:String(e),checks,errors,state:await page.evaluate(()=>render_game_to_text())},null,2));throw e;}finally{await r.close();}
