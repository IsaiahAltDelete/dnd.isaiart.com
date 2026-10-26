import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/academy/secondary',t=await privatePlaytest(out,3),{page}=t;
const key=async(k='KeyZ')=>{await page.keyboard.down(k);await page.waitForTimeout(70);await page.keyboard.up(k);await page.waitForTimeout(160);};
try{
 await page.evaluate(async()=>(await import('/tools/academy-fixture.js')).stageAcademy(true));await page.waitForTimeout(600);await t.shot('practice-start');
 await key();await t.shot('unsafe-projection');
 // Pointer chooses a cell; the projection still needs deliberate confirmation.
 await page.mouse.click((12+5*20+10)*3,(64+1*20+10)*3);await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>SC.Game.top.aim),{x:5,y:1});
 await key();assert(await page.evaluate(()=>SC.Game.top.passed));await t.shot('precision-pass');await key();await key();await t.shot('unsafe-area');
 await page.mouse.click((12+6*20+10)*3,(64+2*20+10)*3);await page.waitForTimeout(100);await key();assert(await page.evaluate(()=>SC.Game.top.passed));await t.shot('area-pass');
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>window.render_game_to_text()));await key('Escape');assert.equal(await page.evaluate(()=>SC.Game.top.id),'overworld');
 await page.evaluate(async()=>{await(await import('/src/world/overworld.js')).travelTo('blackstaff-court',8,19,'left');});await page.waitForTimeout(2000);await t.shot('west-anchor-world');await key();await page.waitForTimeout(300);await t.shot('west-anchor-note');
 assert.deepEqual(t.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks:['1200x720 readable lesson states','click targeting','keyboard project and advance','Escape returns to academy','visible west anchor and interaction'],errors:t.errors},null,2));console.log('PASS: secondary visual and pointer/control capture');
}finally{await t.close();}
