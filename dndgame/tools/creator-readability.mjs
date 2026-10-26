import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/creator/readability',scale=Number(process.argv[3]||2),run=await privatePlaytest(out,scale),{page}=run,checks=[];
try{
 await page.evaluate(async()=>{
  const {CharCreateScene}=await import('/src/ui/charcreate.js'),{UI}=await import('/src/ui/kit.js');
  SC.Game.replace(new CharCreateScene(()=>{},{preset:{speciesId:'aasimar',classId:'wizard'}}));document.querySelector('#gate')?.classList.remove('show');
  window.docInk=[];const original=UI.text;UI.text=function(ctx,x,y,text,opts){if(x>=145&&x<277&&y>=40&&y<=206)docInk.push({text:String(text),size:opts?.size});return original.apply(this,arguments);};
 });await page.waitForTimeout(200);await run.shot('origins-top');
 // Wheel the real detail pane until the complete resistance row is on screen.
 await page.mouse.move(210*scale,150*scale);
 for(let i=0;i<7;i++){await page.mouse.wheel(0,100);await page.waitForTimeout(60);}
 await run.shot('origins-resists');
 let ink=await page.evaluate(()=>docInk);
 checks.push({name:'Both full resistance names are drawn',ok:ink.some(x=>x.text.includes('Necrotic'))&&ink.some(x=>x.text.includes('Radiant')),ink:[...new Set(ink.map(x=>x.text))]});
 checks.push({name:'Species body copy uses full body size',ok:ink.some(x=>x.text.includes('An aasimar')&&x.size==='sm')});
 await page.evaluate(()=>{SC.Game.top.gotoStep(6);docInk=[];});await page.waitForTimeout(160);await run.shot('acid-top');
 for(let i=0;i<7;i++){await page.mouse.wheel(0,100);await page.waitForTimeout(60);}
 await run.shot('acid-effect');ink=await page.evaluate(()=>docInk);
 checks.push({name:'Full Acid Splash save and damage drawn',ok:ink.some(x=>x.text.includes('DEX save'))&&ink.some(x=>x.text.includes('1d6 acid')),ink:[...new Set(ink.map(x=>x.text))]});
 await page.evaluate(()=>{SC.Game.top.gotoStep(11);docInk=[];});await page.waitForTimeout(160);await run.shot('review-top');
 for(let i=0;i<12;i++){await page.mouse.wheel(0,100);await page.waitForTimeout(60);}
 await run.shot('review-reasons');ink=await page.evaluate(()=>docInk);
 checks.push({name:'Missing choice reasons use full body text',ok:ink.some(x=>x.text.includes('choose')&&x.size==='sm')});
 checks.push({name:'Real mouse wheel moves document',ok:await page.evaluate(()=>SC.Game.top.docScroll[SC.Game.top.rowKey()]>0)});
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors:run.errors},null,2));await run.close();console.log(JSON.stringify(checks.map(({ink,...x})=>x)));if(checks.some(c=>!c.ok)||run.errors.length)process.exitCode=1;}
