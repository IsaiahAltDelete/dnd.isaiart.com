import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/creator/controls',run=await privatePlaytest(out),{page}=run,checks=[];
const key=async k=>{await page.keyboard.press(k,{delay:55});await page.waitForTimeout(120);};
const check=(name,ok,detail)=>checks.push({name,ok,detail});
try{
 await page.evaluate(async()=>{const {CharCreateScene}=await import('/src/ui/charcreate.js');SC.Game.replace(new CharCreateScene(()=>{},{preset:{speciesId:'human',classId:'wizard',name:'Mara'}}));SC.Game.top.gotoStep(9);document.querySelector('#gate')?.classList.remove('show');});
 await page.waitForTimeout(160);
 const facings=[];
 for(let i=0;i<4;i++){facings.push(await page.evaluate(()=>SC.Game.top.previewDir));await run.shot('facing-'+i);await key('KeyK');}
 check('All four facings accessible and wrap',new Set(facings).size===4&&await page.evaluate(()=>SC.Game.top.previewDir===0));
 for(let i=0;i<28;i++)await key('ArrowDown');
 check('Appearance list scrolls to final controls',await page.evaluate(()=>SC.Game.top.currentRow()?.label==='Randomise everything'));
 await run.shot('appearance-bottom');
 await page.evaluate(()=>SC.Game.top.gotoStep(6));await page.waitForTimeout(100);
 const count=()=>page.evaluate(()=>{const b=SC.Game.top;return b.picksOf(b.spellBuckets()[b.bucket].key).length;});
 const before=await count();await key('KeyZ');check('Cantrip can be selected with keyboard',await count()===before+1);
 await key('KeyZ');check('Cantrip can be deselected',await count()===before);
 await key('Tab');check('Tab opens spellbook bucket',await page.evaluate(()=>SC.Game.top.bucket===1));await run.shot('spellbook');
 await page.evaluate(()=>{const b=SC.Game.top;b.setClass('warlock');b.draft.level=10;b._touch();b.gotoStep(7);});await page.waitForTimeout(160);
 const total=await page.evaluate(()=>SC.Game.top.bucketCount()),seen=[];
 for(let i=0;i<total;i++){seen.push(await page.evaluate(()=>SC.Game.top.bucket));await key('Tab');}
 check('All advanced feature sections reachable',new Set(seen).size===total,{total,seen});
 await key('Tab');await run.shot('advanced-features');
 await page.evaluate(()=>SC.Game.top.gotoStep(4));await page.waitForTimeout(100);await key('Digit2');
 const points=await page.evaluate(()=>SC.Game.top.pointsLeft());await key('ArrowRight');
 check('Point buy control updates remaining budget',await page.evaluate(p=>SC.Game.top.pointsLeft()<p,points));await run.shot('point-buy');
 check('No draw failures',await page.evaluate(()=>!(SC.Game._drawFails?.size)));
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors:run.errors},null,2));await run.close();console.log(JSON.stringify(checks));if(checks.some(c=>!c.ok)||run.errors.length)process.exitCode=1;}
