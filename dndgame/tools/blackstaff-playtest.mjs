import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/blackstaff/primary',scale=Number(process.argv[3]||2),t=await privatePlaytest(out,scale),{page}=t,checks=[];
const key=async(k='KeyZ')=>{await page.keyboard.down(k);await page.waitForTimeout(60);await page.keyboard.up(k);await page.waitForTimeout(100);};
const state=()=>page.evaluate(()=>{const b=SC.Game.top;return {id:b.id,map:b.map?.id,x:b.player?.x,y:b.player?.y,node:b.nodeId,mode:b.mode,index:b.index,choices:b.choices?.map(c=>({goto:c.raw.goto,cancel:c.raw.cancel}))};});
async function ready(){await page.waitForFunction(()=>SC.Game.top.id==='overworld'&&!SC.Game.transitioning&&!SC.Game.top.player.moving,{},{timeout:10000});}
async function walk(x,y){
 const path=await page.evaluate(({x,y})=>{const b=SC.Game.top,m=b.map,s=b.player,q=[[s.x,s.y,[]]],seen=new Set([s.x+','+s.y]);
  for(let i=0;i<q.length;i++){const [cx,cy,p]=q[i];if(cx===x&&cy===y)return p;for(const [dx,dy,k]of [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']]){const nx=cx+dx,ny=cy+dy,id=nx+','+ny;if(!m.inBounds(nx,ny)||m.solidAt(nx,ny)||seen.has(id)||m.entities.some(e=>e!==s&&e.solid&&e.x===nx&&e.y===ny))continue;if(m.triggerAt(nx,ny)?.kind==='warp'&&(nx!==x||ny!==y))continue;seen.add(id);q.push([nx,ny,[...p,k]]);}}throw Error('No route to '+x+','+y);
 },{x,y});
 for(const k of path){const s=await state();await page.keyboard.down(k);try{await page.waitForFunction(s=>SC.Game.top.map?.id!==s.map||SC.Game.top.player.x!==s.x||SC.Game.top.player.y!==s.y,s,{timeout:8000});}finally{await page.keyboard.up(k);}await ready();}
 await page.waitForTimeout(250);
}
async function choice(){for(let i=0;i<30;i++){const s=await state();assert.equal(s.id,'dialogue');if(s.mode==='choose')return s;await key();}throw Error('Stuck dialogue');}
async function pick(dest){let s=await choice(),ix=s.choices.findIndex(c=>dest==='bye'?c.cancel:c.goto===dest);assert(ix>=0,dest);for(let i=0;i<15&&s.index!==ix;i++){await key('ArrowDown');s=await state();}assert.equal(s.index,ix);await key();}
async function readNote(name){await key();assert.equal((await state()).id,'dialogue');await t.shot(name);for(let i=0;i<20&&(await state()).id==='dialogue';i++)await key();await ready();checks.push(name+' readable and closes');}
try{
 await page.evaluate(async()=>(await import('/tools/blackstaff-fixture.js')).stageBlackstaff());await ready();await page.waitForTimeout(1500);await t.shot('waterdeep-route');
 await walk(1,7);await ready();assert.equal((await state()).map,'blackstaff-court');checks.push('Waterdeep street to Castle Ward');
 await walk(15,14);await page.waitForTimeout(3500);await t.shot('tower-exterior');
 await walk(15,12);await ready();assert.equal((await state()).map,'blackstaff-tower');checks.push('Silver ward-mark enters tower');await t.shot('hall-arrival');
 await walk(13,6);await key('ArrowUp');await key();await choice();await t.shot('vajra-hub');
 for(const topic of ['tower','work','study','below']){await pick(topic);assert.equal((await state()).node,topic);await t.shot('vajra-'+topic);await choice();}
 await pick('bye');await ready();checks.push('Vajra four topics and exit');
 await walk(5,7);await key('ArrowUp');await key();await choice();await t.shot('reader');await pick('study');await choice();await pick('bye');await ready();checks.push('Reading room apprentice');
 await key('ArrowRight');await readNote('reading-lectern');
 await walk(20,8);await key('ArrowUp');await key();await choice();await t.shot('practice');await pick('practice');await choice();await pick('bye');await ready();checks.push('Practice room apprentice');
 await walk(20,5);await key('ArrowRight');await readNote('practice-lectern');
 await walk(13,17);await t.shot('hall-return');await walk(13,19);await ready();assert.equal((await state()).map,'blackstaff-court');
 await walk(29,20);await ready();assert.equal((await state()).map,'waterdeep');checks.push('Round trip returns to Waterdeep');await t.shot('returned-waterdeep');
 assert.deepEqual(t.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors:t.errors,final:await state()},null,2));console.log('PASS: '+checks.join('; '));
}catch(e){await t.shot('failure');console.log(await page.evaluate(()=>({text:window.render_game_to_text(),popup:SC.Game.top.popup,player:SC.Game.top.player&&{x:SC.Game.top.player.x,y:SC.Game.top.player.y,moving:SC.Game.top.player.moving},top:SC.Game.top.id})));throw e;}finally{await t.close();}
