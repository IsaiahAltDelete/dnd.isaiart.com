import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/academy/primary',scale=Number(process.argv[3]||2),t=await privatePlaytest(out,scale),{page}=t,checks=[];
const resources=()=>page.evaluate(()=>({gold:SC.Party.gold,inventory:SC.Party.inventory.map(e=>({id:e.id,qty:e.qty})),members:SC.Party.members.map(m=>({hp:m.hp,slots:m.spellSlots,xp:m.xp,spells:m.spells}))}));
const status=()=>page.evaluate(()=>({flags:SC.Game.state.flags,quests:SC.Game.state.quests}));
const practice=()=>page.evaluate(()=>SC.Game.top.snapshot());
const qty=(r,id)=>r.inventory.filter(e=>e.id===id).reduce((n,e)=>n+e.qty,0);
async function talk(x,y,dir='ArrowUp'){await walk(x,y);await key(dir);await key();await choice();}
async function aim(x,y){for(let i=0;i<25;i++){const a=(await practice()).aim;if(a.x===x&&a.y===y)return;await key(a.x<x?'ArrowRight':a.x>x?'ArrowLeft':a.y<y?'ArrowDown':'ArrowUp');}throw Error('Aim did not move');}
async function finishDrills(){
 await key();assert.equal((await practice()).passed,false);await t.shot('unsafe-projection');
 await aim(5,1);await key();assert.equal((await practice()).passed,true);await t.shot('precision-pass');
 await key();assert.equal((await practice()).drill,'area');await key();assert.equal((await practice()).passed,false);await t.shot('unsafe-area');
 await aim(6,2);await key();assert.equal((await practice()).passed,true);await t.shot('area-pass');await key('KeyX');await ready();
}

const key=async(k='KeyZ')=>{await page.keyboard.down(k);await page.waitForTimeout(60);await page.keyboard.up(k);await page.waitForTimeout(100);};
const state=()=>page.evaluate(()=>{const b=SC.Game.top;return {id:b.id,map:b.map?.id,x:b.player?.x,y:b.player?.y,node:b.nodeId,mode:b.mode,index:b.index,choices:b.choices?.map(c=>({goto:c.raw.goto,cancel:c.raw.cancel,do:c.raw.do,text:c.raw.text}))};});
async function ready(){await page.waitForFunction(()=>SC.Game.top.id==='overworld'&&!SC.Game.transitioning&&!SC.Game.top.player.moving,{},{timeout:10000});assert.equal(await page.evaluate(()=>SC.Game.top.entities.list.filter(e=>e.kind==='party').length),await page.evaluate(()=>SC.Party.members.length),'No stale party sprites after reload or return');}
async function walk(x,y){
 for(let attempt=0;attempt<160;attempt++){
 const here=await state();if(here.x===x&&here.y===y)return;
 const path=await page.evaluate(({x,y})=>{const b=SC.Game.top,m=b.map,s=b.player,q=[[s.x,s.y,[]]],seen=new Set([s.x+','+s.y]);
  for(let i=0;i<q.length;i++){const [cx,cy,p]=q[i];if(cx===x&&cy===y)return p;for(const [dx,dy,k]of [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']]){const nx=cx+dx,ny=cy+dy,id=nx+','+ny;if(!m.inBounds(nx,ny)||m.solidAt(nx,ny)||seen.has(id)||m.entities.some(e=>e!==s&&e.solid&&e.x===nx&&e.y===ny))continue;if(m.triggerAt(nx,ny)?.kind==='warp'&&(nx!==x||ny!==y))continue;seen.add(id);q.push([nx,ny,[...p,k]]);}}throw Error('No route to '+x+','+y);
 },{x,y});
 const k=path[0],s=await state();await page.keyboard.down(k);try{await page.waitForFunction(s=>SC.Game.top.map?.id!==s.map||SC.Game.top.player.x!==s.x||SC.Game.top.player.y!==s.y,s,{timeout:8000});}finally{await page.keyboard.up(k);}await ready();if((await state()).map!==s.map)return;
 }
 throw Error('Walking exceeded step budget');
}
async function choice(){for(let i=0;i<30;i++){const s=await state();assert.equal(s.id,'dialogue');if(s.mode==='choose')return s;await key();}throw Error('Stuck dialogue');}
async function pick(dest){let s=await choice(),ix=s.choices.findIndex(c=>dest==='bye'?c.cancel:dest==='enroll'?c.do?.quest==='academy-practicum':dest==='train'?c.do?.academy==='practice':c.goto===dest);assert(ix>=0,dest);for(let i=0;i<15&&s.index!==ix;i++){await key('ArrowDown');s=await state();}assert.equal(s.index,ix);await key();}
async function readNote(name){await key();assert.equal((await state()).id,'dialogue');await t.shot(name);for(let i=0;i<20&&(await state()).id==='dialogue';i++)await key();await ready();checks.push(name+' readable and closes');}

try{
 await page.evaluate(async()=>(await import('/tools/academy-fixture.js')).stageAcademy());await ready();
 const before=await resources();await key();await choice();await pick('lessonOffer');await choice();await t.shot('enroll');await pick('enroll');
 assert.equal((await state()).id,'academy-training');await t.shot('practice-start');await key('KeyX');await ready();
 await key();await choice();await pick('train');await finishDrills();assert.deepEqual(await resources(),before);checks.push('Enroll, cancel, reopen, unsafe/safe single and area; resources unchanged');
 await key();await choice();await pick('lessonStatus');let s=await choice();assert(!s.choices.some(c=>c.goto==='lessonPaid'));await pick('bye');await ready();
 await talk(5,7);await pick('focus');await choice();await pick('focusRetry');await choice();assert(!(await status()).flags['academy:focus']);await t.shot('concentration-retry');await pick('focusPassed');await choice();assert((await status()).flags['academy:focus']);await pick('bye');await ready();
 await page.evaluate(async()=>{const m=await import('/src/main.js');if(!m.writeSave(1))throw Error('Save failed');if(!m.continueGame(1))throw Error('Reload failed');});await ready();assert((await status()).flags['academy:area']);assert((await status()).quests.active.find(q=>q.id==='academy-practicum').steps.every(s=>s.done));checks.push('Concentration retry/right answer; partial quest save/reload retains all three steps');
 await talk(20,8);await pick('lessonStatus');await choice();await pick('lessonPaid');await t.shot('practicum-paid');await choice();await pick('bye');await ready();
 assert.equal((await resources()).gold,before.gold+25);assert((await status()).quests.done.includes('academy-practicum'));const paid=await resources();assert.equal(paid.members[0].xp,before.members[0].xp+120);assert.equal(qty(paid,'scroll-magic-missile'),qty(before,'scroll-magic-missile')+1);
 await key();await choice();await pick('train');await finishDrills();assert.deepEqual(await resources(),paid);checks.push('Practicum pays once; replay changes no resources');
 await talk(13,6);await pick('wardOffer');await choice();await t.shot('ward-offer');await pick('wardStatus');s=await choice();assert(!s.choices.some(c=>c.goto==='wardPaid'));await pick('bye');await ready();
 await walk(13,19);await ready();assert.equal((await state()).map,'blackstaff-court');
 await talk(7,20);await t.shot('west-anchor');await pick('inspect');await choice();await pick('wrong');await choice();assert(!(await status()).flags['academy:west']);await pick('fixed');await choice();await pick('bye');await ready();
 await talk(23,15,'ArrowDown');await t.shot('east-anchor');await pick('inspect');await choice();await pick('wrong');await choice();assert(!(await status()).flags['academy:east']);await pick('fixed');await choice();await pick('bye');await ready();
 await walk(15,12);await ready();await talk(13,6);await pick('wardStatus');s=await choice();assert(!s.choices.some(c=>c.goto==='wardPaid'));await pick('bye');await ready();
 await talk(5,7);await pick('readings');await t.shot('readings');await choice();await pick('bye');await ready();
 await talk(13,6);await pick('wardStatus');await choice();await pick('wardPaid');await t.shot('wards-paid');await choice();await pick('bye');await ready();assert.equal((await resources()).gold,before.gold+65);assert((await status()).quests.done.includes('academy-wards'));checks.push('Walked both courtyard repairs, wrong attempts safe, turn-in blocked until Tessele, ward reward');
 const allPaid=await resources();assert.equal(allPaid.members[0].xp,before.members[0].xp+270);assert.equal(qty(allPaid,'potion-healing'),qty(before,'potion-healing')+1);await key();await choice();s=await state();assert(!s.choices.some(c=>c.goto==='wardOffer'||c.goto==='wardStatus'));await pick('wardAfter');await choice();await pick('bye');await ready();assert.deepEqual(await resources(),allPaid);
 await page.evaluate(async()=>{const m=await import('/src/main.js');m.writeSave(1);m.continueGame(1);});await ready();assert((await status()).quests.done.includes('academy-wards'));assert.equal((await resources()).gold,before.gold+65);checks.push('Completed quests persist; paid work no longer offered');
 // Fresh non-caster fixture exercises the same free lesson, not the live campaign.
 await page.evaluate(async()=>{await(await import('/tools/academy-fixture.js')).stageAcademy();SC.Party.clear();SC.Party.add(SC.createCharacter({name:'Fighter Student',classId:'fighter',speciesId:'human',level:3}));});await ready();const fighter=await resources();await key();await choice();await pick('lessonOffer');await choice();await pick('enroll');await finishDrills();assert.deepEqual(await resources(),fighter);checks.push('Fighter can enroll and pass both drills without learning/spending magic');
 assert.deepEqual(t.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors:t.errors,completedResources:allPaid,final:await state()},null,2));console.log('PASS: '+checks.join('; '));
}catch(e){await t.shot('failure');console.log(await state());throw e;}finally{await t.close();}

