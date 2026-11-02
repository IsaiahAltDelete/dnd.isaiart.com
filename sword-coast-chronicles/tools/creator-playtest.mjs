// Private browser, normal mouse/keyboard. Direct staging is labelled in the report.
import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/creator/play',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run,checks=[];
const check=(name,ok,detail)=>checks.push({name,ok,detail});
const read=()=>page.evaluate(()=>JSON.parse(render_game_to_text()).creator);
const click=async(x,y)=>{await page.mouse.click(x*scale,y*scale);await page.waitForTimeout(160);};
const key=async k=>{await page.keyboard.press(k,{delay:45});await page.waitForTimeout(160);};
async function stage(preset={},opts={}){
 await page.evaluate(async({preset,opts})=>{
  const {CharCreateScene}=await import('/src/ui/charcreate.js');
  window.created=null;SC.Game.replace(new CharCreateScene(ch=>{window.created=ch;},{preset,...opts}));
  document.querySelector('#gate')?.classList.remove('show');
 },{preset,opts});await page.waitForTimeout(200);
}
try{
 await stage();await run.shot('01-origins');
 await click(245,17);check('Personal chapter opens despite unfinished lineage',(await read()).page==='equipment:0:0');
 await click(200,28);check('Appearance is freely reachable',(await read()).page==='appearance:0:0');
 await run.shot('02-appearance');
 const initial=await read();await key('KeyK');check('Keyboard rotates sprite',(await read()).facing!==initial.facing);
 await key('KeyM');check('Keyboard starts walk preview',(await read()).walking);
 await key('KeyM');await click(292,148);check('Mouse rotates sprite',(await read()).facing===initial.facing);
 const oldLook=await page.evaluate(()=>JSON.stringify(SC.Game.top.draft.appearance));await key('ArrowRight');
 check('Appearance row changes draft',await page.evaluate(old=>JSON.stringify(SC.Game.top.draft.appearance)!==old,oldLook));
 await key('KeyI');check('Sheet keyboard toggle',(await read()).preview==='sheet');await run.shot('03-sheet');await key('KeyI');
 await click(371,195);check('Identity shortcut opens page',(await read()).page==='identity:0:0');
 await key('KeyZ');await page.keyboard.type('Mara Thistle');await key('Enter');
 check('Typed name is kept',(await read()).name==='Mara Thistle');await run.shot('04-identity');
 await click(350,17);await run.shot('05-incomplete-review');
 await click(365,228);check('Create refuses incomplete draft',await page.evaluate(()=>created===null&&SC.Game.top.id==='charcreate'&&SC.Game.top.messageBad));
 check('Validation takes player to missing lineage',(await read()).page==='species:1:0');
 await key('KeyZ');check('Lineage selection advances to class',(await read()).page==='class:0:0');
 await page.keyboard.down('Shift');await key('KeyR');await page.keyboard.up('Shift');
 check('Keyboard chapter shortcut reaches Training',(await read()).page==='abilities:0:0');
 await stage({speciesId:'human',classId:'fighter'});
 // Surprise me, reached through real keyboard cursor movement.
 const cursorTrace=[];
 for(let n=0;n<20;n++){
  const label=await page.evaluate(()=>SC.Game.top.currentRow()?.label);cursorTrace.push(label);
  if(label==='Surprise me')break;await key('ArrowUp');
 }
 check('Keyboard reaches Surprise me',await page.evaluate(()=>SC.Game.top.currentRow()?.label==='Surprise me'),cursorTrace);
 await key('KeyZ');
 check('Surprise me stops at Review',(await read()).page==='summary:0:0'&&await page.evaluate(()=>created===null));
 await run.shot('06-ready-review');
 const preview=await page.evaluate(()=>{const b=SC.Game.top;return{name:b.draft.name,hp:b.preview.maxHp,ac:b.preview.ac,appearance:JSON.stringify(b.preview.appearance)};});
 await click(365,228);
 check('Explicit Create completes the character',await page.evaluate(p=>created&&created.name===p.name&&created.maxHp===p.hp&&created.ac===p.ac&&JSON.stringify(created.appearance)===p.appearance,preview));
 // Catalogue coverage: stage existing valid presets, inspect all twelve pages.
 for(const [speciesId,classId,level]of [['tiefling','wizard',1],['dragonborn','paladin',3],['elf','warlock',10]]){
  await stage({speciesId,classId,level,name:'Westra Windriver'});
  await page.evaluate(()=>{const b=SC.Game.top;b.setLineage((b.draft.speciesId==='tiefling'?'infernal':b.draft.speciesId==='elf'?'high-elf':'red'));});
  for(let step=0;step<12;step++){
   const enabled=await page.evaluate(step=>{const b=SC.Game.top;if(!b.stepEnabled(step))return false;b.gotoStep(step);b._ensure();return true;},step);
   if(!enabled)continue;
   await page.waitForTimeout(60);
   check(classId+' page '+step+' renders',await page.evaluate(()=>!(SC.Game._drawFails?.size)&&SC.Game.top.preview?.maxHp>0));
   if([1,6,7,9,11].includes(step))await run.shot(classId+'-'+step);
  }
  await key('KeyI');await run.shot(classId+'-sheet');
 }
 // Revisiting choices must preserve the existing stash mechanism.
 await stage({speciesId:'human',classId:'fighter',name:'Mara'});
 check('Class browsing restores parked picks',await page.evaluate(()=>{const b=SC.Game.top;b.draft.skills=['athletics','perception'];b.setClass('wizard');b.setClass('fighter');return b.draft.skills.includes('athletics')&&b.draft.skills.includes('perception');}));
 await stage({speciesId:'human',classId:'fighter',name:'Mara'},{mode:'level-up-companion',level:3});
 check('Companion species and class remain locked',await page.evaluate(()=>SC.Game.top.lockSpecies&&SC.Game.top.lockClass));
 await stage({speciesId:'human',classId:'fighter'},{mode:'recruit'});await click(25,228);
 check('Recruit cancel returns null',await page.evaluate(()=>created===null&&SC.Game.top?.id!=='charcreate'));
 const fails=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);check('No draw failures',fails.length===0,fails);
}catch(e){check('Playtest completed',false,String(e));}
finally{
 fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));await run.close();
 console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok),errors}));
 if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
}
