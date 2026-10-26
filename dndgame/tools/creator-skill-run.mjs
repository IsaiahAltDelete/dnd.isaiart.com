import fs from 'node:fs';
import {spawn} from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
// This runner only needs an HTTP origin. Do not keep a second idle game/browser
// alive while the skill client runs its own game animation loop.
const world=process.argv.includes('--world');
const wizard=process.argv.includes('--wizard');
const ground=process.argv.includes('--ground');
const scenery=process.argv.includes('--scenery');
const armory=process.argv.includes('--armory');
const spellAnimation=process.argv.includes('--spell-animation');
const legends=process.argv.includes('--legends');
const blackstaff=process.argv.includes('--blackstaff');
const academy=process.argv.includes('--academy');
const placeLife=process.argv.includes('--place-life');
const groundBiome=process.argv.includes('--crypt')?'crypt':'dungeon';
const trees=process.argv.includes('--trees');
const monster=process.argv.includes('--monster');
const monsterIndex=process.argv.indexOf('--monster-id'),monsterId=monsterIndex>=0?process.argv[monsterIndex+1]:'dire-wolf';
const outputIndex=process.argv.indexOf('--out');
const out=outputIndex>=0?process.argv[outputIndex+1]:monster?'output/monster-upgrade/skill':world?'output/performance/skill':'output/creator/skill',root=process.cwd();fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.wav':'audio/wav','.css':'text/css'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 let source=fs.readFileSync('C:/Users/Dizzy/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js','utf8');
 source=source.replace('from "playwright"','from "file:///C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"');
 source=source.replace('headless: args.headless,','headless: args.headless, channel:"msedge",');
 source=source.replace('const page = await browser.newPage();','const page = await browser.newPage({viewport:{width:800,height:480}});');
 if(placeLife){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/place-life-fixture.js')).stagePlaceLife();});await page.waitForTimeout(300);`);
 }else if(academy){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/academy-fixture.js')).stageAcademy(true);});await page.waitForTimeout(1600);`);
 }else if(blackstaff){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/blackstaff-fixture.js')).stageBlackstaff();});await page.waitForTimeout(1600);`);
 }else if(legends){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/legends-fixture.js')).stageLegend();});await page.waitForTimeout(1600);`);
 }else if(spellAnimation){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/spell-animation-fixture.js')).stageSpellBattle();});await page.waitForTimeout(600);`);
 }else if(armory){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/armory-fixture.js')).stageArmoryBattle();});await page.waitForTimeout(1400);`);
 }else if(scenery){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/scenery-fixture.js')).stageSceneryWalk();});await page.waitForTimeout(3500);`);
 }else if(ground){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/ground-design-fixture.js')).stageGroundBattle(${JSON.stringify(groundBiome)});SC.Game.top._beginMove();});await page.waitForTimeout(500);`);
 }else if(wizard){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{const {CharCreateScene}=await import('/src/ui/charcreate.js');SC.Game.replace(new CharCreateScene(()=>{},{preset:{speciesId:'human',classId:'wizard',name:'Optional Magic'}}));const b=SC.Game.top;b.draft.picks.spellbook=['mage-armor','shield','magic-missile','sleep','detect-magic','charm-person'];b._touch();b.gotoStep(6);b.setBucket(2);b._ensure();document.querySelector('#gate')?.classList.remove('show');});await page.waitForTimeout(500);`);
 }else if(trees){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/tree-soak-fixture.js')).stageTreeBattle(1);});await page.waitForTimeout(500);`);
 }else if(monster){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(async()=>{await(await import('/tools/monster-upgrade-fixture.js')).stageMonsterFixture(${JSON.stringify(monsterId)});});await page.waitForTimeout(500);`);
 }else if(world){
  source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.draft.name='Road Tester';b._autoFillPicks();b.finish();});await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);await page.evaluate(async()=>{const {travelTo}=await import('/src/world/overworld.js');travelTo('bg-eastway',22,19,'up');});await page.waitForTimeout(500);`);
 }else{
 source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>window.SC);await page.evaluate(async()=>{const {CharCreateScene}=await import('/src/ui/charcreate.js');SC.Game.replace(new CharCreateScene(()=>{},{preset:{speciesId:'human',classId:'bard',name:'Mara'}}));const b=SC.Game.top;Object.assign(b.draft.appearance,{hairStyle:'twinbraids',helmStyle:'helm-none',wardrobe:'outfit-doublet'});b._touch();b.gotoStep(9);b.setBucket(1);document.querySelector('#gate')?.classList.remove('show');});await page.waitForTimeout(500);`);
 }
 fs.writeFileSync(out+'/client.mjs',source);
 fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:(monster||trees)?[{buttons:['enter'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:60}]:world?[{buttons:['up'],frames:14},{buttons:[],frames:100},{buttons:['left'],frames:6},{buttons:[],frames:12}]:[{buttons:['right'],frames:2},{buttons:[],frames:12},{buttons:['down'],frames:2},{buttons:[],frames:12}]}));
 if(wizard)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['down'],frames:1},{buttons:[],frames:10},{buttons:['enter'],frames:1},{buttons:[],frames:15}]}));
 if(legends)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['enter'],frames:1},{buttons:[],frames:120}]}));
 if(blackstaff)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['left'],frames:28},{buttons:[],frames:180}]}));
 if(academy)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['enter'],frames:1},{buttons:[],frames:15},{buttons:['right'],frames:1},{buttons:[],frames:15},{buttons:['right'],frames:1},{buttons:[],frames:15},{buttons:['up'],frames:1},{buttons:[],frames:15},{buttons:['enter'],frames:1},{buttons:[],frames:30}]}));
 if(placeLife)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:[],frames:180},{buttons:[],frames:180},{buttons:[],frames:180}]}));
 if(ground)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:8},{buttons:['down'],frames:1},{buttons:[],frames:8}]}));
 if(scenery)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['right'],frames:8},{buttons:[],frames:16}]}));
 if(armory)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['enter'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:90}]}));
 if(spellAnimation)fs.writeFileSync(out+'/actions.json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:12},{buttons:['enter'],frames:1},{buttons:[],frames:120}]}));
 const child=spawn(process.execPath,[out+'/client.mjs','--url',`http://127.0.0.1:${server.address().port}/`,'--actions-file',out+'/actions.json','--iterations','1','--screenshot-dir',out],{stdio:'inherit'});
 process.exitCode=await new Promise(resolve=>child.on('exit',resolve));
}finally{server.close();}
