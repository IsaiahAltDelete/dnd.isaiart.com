// Final visual fixtures after the full keyboard round-trip test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
for(const scale of [2,3]){
 const out=(process.argv[2]||'output/blackstaff/final')+'-'+scale,t=await privatePlaytest(out,scale),{page}=t;
 const tap=async()=>{await page.keyboard.down('KeyZ');await page.waitForTimeout(60);await page.keyboard.up('KeyZ');await page.waitForTimeout(140);};
 const travel=async(map,x,y,dir)=>{await page.evaluate(async p=>(await import('/src/world/overworld.js')).travelTo(...p),[map,x,y,dir]);await page.waitForTimeout(1700);};
 try{
  await page.evaluate(async()=>(await import('/tools/blackstaff-fixture.js')).stageBlackstaff());await page.waitForTimeout(1700);
  await travel('blackstaff-court',15,14,'up');await page.waitForTimeout(3000);await t.shot('tower-approach');
  await travel('blackstaff-court',10,9,'right');await page.waitForTimeout(3000);await t.shot('tower-exterior');
  await travel('waterdeep',3,8,'right');await tap();assert.equal(await page.evaluate(()=>SC.Game.top.id),'dialogue');await t.shot('street-notice');
  for(let i=0;i<20&&await page.evaluate(()=>SC.Game.top.id==='dialogue');i++)await tap();
  await travel('blackstaff-court',15,14,'left');await tap();assert.equal(await page.evaluate(()=>SC.Game.top.id),'dialogue');await t.shot('tower-notice');
  for(let i=0;i<20&&await page.evaluate(()=>SC.Game.top.id==='dialogue');i++)await tap();
  await travel('blackstaff-tower',13,10,'up');await page.waitForTimeout(3000);await t.shot('academy');
  for(const [x,y,name]of [[5,7,'reading-lectern'],[20,5,'practice-lectern']]){
   await travel('blackstaff-tower',x,y,'right');await tap();assert.equal(await page.evaluate(()=>SC.Game.top.id),'dialogue');await t.shot(name);
   for(let i=0;i<20&&await page.evaluate(()=>SC.Game.top.id==='dialogue');i++)await tap();assert.equal(await page.evaluate(()=>SC.Game.top.id),'overworld');
  }
  assert.deepEqual(t.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({scale,errors:t.errors,notesOpenedAndClosed:true},null,2));console.log('Final visual fixtures PASS '+scale+'x');
 }finally{await t.close();}
}
