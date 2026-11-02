import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const run=await privatePlaytest('output/ground-design/light',2);
try{
 for(const scale of [2,3]){
  await run.page.setViewportSize({width:400*scale,height:240*scale});
  for(const id of ['redbrand-hideout-3','redbrand-hideout-5']){
   await run.page.evaluate(async id=>{await(await import('/tools/ground-design-fixture.js')).stageGroundDungeon(id);SC.Game.top._spellLight(20,'light',60);},id);
   await run.page.waitForTimeout(3700);await run.shot(`${id}-light-${scale}`);
  }
 }
 fs.writeFileSync('output/ground-design/light/errors.json',JSON.stringify(run.errors));
 if(run.errors.length)throw Error(run.errors.join('\n'));
}finally{await run.close();}
