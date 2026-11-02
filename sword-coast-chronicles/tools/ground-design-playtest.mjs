import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/ground-design/primary',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page}=run,checks=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify({name,ok:!!ok}));};
try{
 for(const biome of ['dungeon','crypt','forest','road','cave']){
  const original=await page.evaluate(async biome=>(await import('/tools/ground-design-fixture.js')).stageGroundBattle(biome),biome);
  await page.waitForTimeout(700);await run.shot('battle-'+biome);
  check(biome+' keeps rule flags unchanged by drawing',await page.evaluate(original=>JSON.stringify(Array.from(SC.Game.top.enc.map.flags))===JSON.stringify(original),original));
  if(biome==='dungeon'||biome==='crypt'){
   await page.evaluate(()=>SC.Game.top._beginMove());await page.waitForTimeout(150);await run.shot(biome+'-movement');
   check('Movement remains available over designed floor',await page.evaluate(()=>SC.Game.top.reach.size>10));
   await page.keyboard.press('Escape');await page.waitForTimeout(150);
   check('Movement cancels back to menu',await page.evaluate(()=>SC.Game.top.phase==='menu'));
  }
  if(biome==='crypt'){
   await page.evaluate(()=>{const b=SC.Game.top;const find=rows=>{for(const r of rows){if(r.id==='spell:shatter')return r;const child=r.sub&&find(r.sub);if(child)return child;}};b._beginOption(find(b._rootMenu()));b.cursor={...b.enc.units.find(u=>u.side==='foe').pos};});
   await page.waitForTimeout(200);await run.shot('crypt-targeting');
   check('Crypt area targeting is available over the ground',await page.evaluate(()=>SC.Game.top.phase==='target'));
   await page.keyboard.press('Escape');await page.waitForTimeout(150);
   check('Crypt target cancel preserves the action',await page.evaluate(()=>SC.Game.top._budget().action===1));
  }
 }
 for(const id of ['redbrand-hideout-3','redbrand-hideout-5','old-owl-well-crypt']){
  await page.evaluate(async id=>(await import('/tools/ground-design-fixture.js')).stageGroundDungeon(id),id);
  await page.waitForTimeout(1200);await run.shot('world-'+id);
  check(id+' rendered without draw failures',await page.evaluate(()=>!SC.Game._drawFails?.size));
 }
 await page.evaluate(async()=>(await import('/tools/ground-design-fixture.js')).stageGroundBattle('dungeon','ground-b'));
 await page.waitForTimeout(400);await run.shot('battle-dungeon-second-seed');
 const perf=await page.evaluate(async()=>{
  const b=SC.Game.top,c=document.createElement('canvas');c.width=400;c.height=240;const g=c.getContext('2d'),times=[];
  for(let i=0;i<70;i++){const t=performance.now();b._drawTerrain(g,0,0,22,15);b._drawGroundAccents(g,0,0,22,15);times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);return {median:times[35],p95:times[66],...(await import('/src/render/ground-design.js')).floorDesignInfo()};
 });
 check('Warm terrain drawing stays below 8ms median',perf.median<8,perf);
 check('Ground cache remains bounded',perf.cachedTiles<=perf.limit,perf);
 check('No browser errors',run.errors.length===0,run.errors);
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>window.render_game_to_text?.()||'{}'));
}catch(e){check('Driver completes',false,String(e));await run.shot('failure');}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors:run.errors},null,2));await run.close();if(checks.some(c=>!c.ok))process.exitCode=1;}
