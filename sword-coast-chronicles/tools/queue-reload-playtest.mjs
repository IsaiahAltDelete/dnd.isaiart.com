import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/queue-all/reload',run=await privatePlaytest(out),{page,errors,shot}=run,checks=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify({name,ok:!!ok}));};
try{
 await page.evaluate(async()=>{
  const {Game,Party,createCharacter}=SC,{newGameState}=await import('/src/state.js'),{OverworldScene}=await import('/src/world/overworld.js');
  Game.state=newGameState('campaign-reload');Party.clear();Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'bard',backgroundId:'soldier'}));Game.replace(new OverworldScene());
 });
 const code=fs.readFileSync('tools/queue-campaign-check.js','utf8');
 const campaign=await page.evaluate(code=>new Function('return (async()=>{'+code+'})()')(),code);
 check('forty-day campaign probe passes',campaign.checks.every(c=>c.ok),campaign.checks.filter(c=>!c.ok));
 const before=await page.evaluate(()=>({gold:SC.Party.gold,items:SC.Party.inventory,state:SC.Save.read(1)}));
 await page.reload();await page.waitForFunction(()=>window.SC);
 await page.evaluate(async()=>{const {continueGame}=await import('/src/main.js');if(!continueGame(1))throw Error('Failed load');document.querySelector('#gate')?.classList.remove('show');});
 await page.waitForFunction(()=>SC.Game.top.map?.id==='elfsong-tavern');await page.waitForTimeout(500);
 const after=await page.evaluate(()=>({gold:SC.Party.gold,items:SC.Party.inventory,quests:SC.Game.state.quests,map:SC.Game.top.map.id}));
 check('full reload restores destination and purse',after.map===before.state.mapId&&before.gold===after.gold,{beforeGold:before.gold,afterGold:after.gold});
 check('full reload restores inventory',JSON.stringify(before.items)===JSON.stringify(after.items));
 check('full reload restores completed quest and reward state',JSON.stringify(before.state.quests)===JSON.stringify(after.quests));
 await shot('after-full-reload');
}catch(e){checks.push({name:'driver completed',ok:false,detail:String(e)});await shot('failure');console.error(e);}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));await run.close();if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
