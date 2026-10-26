import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/tree-soak/baseline';fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/trees-before.js',fs.readFileSync('src/render/trees.js','utf8').replace("'./tiles.js'","'/src/render/tiles.js'"));
const run=await privatePlaytest(out),{page,errors}=run;
try {
 await page.evaluate(()=>{SC.newGame();const c=SC.Game.top;c.randomiseAll();c.setSpecies('human');c.setClass('fighter');c._autoFillPicks();c.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);
 const report={visibility:await page.evaluate(async()=>(await import('/tools/tree-soak-probe.js')).visibilityProbe()),scenes:[],errors};
 for(const id of ['neverwinter-wood','phandalin']){
  await page.evaluate(async id=>{(await import('/src/world/overworld.js')).travelTo(id);const s=SC.Game.top;s._weatherNow=()=> 'clear';s._applyWeather(true);s.banner=null;},id);await page.waitForTimeout(500);
  report.scenes.push(await page.evaluate(async()=>(await import('/tools/tree-soak-probe.js')).benchmark()));await run.shot(id);
 }
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await run.close();}
