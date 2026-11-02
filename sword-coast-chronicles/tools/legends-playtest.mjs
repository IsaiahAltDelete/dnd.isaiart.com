import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/legends/primary',scale=Number(process.argv[3]||2);
const t=await privatePlaytest(out,scale),{page}=t,report=[];
const key=async(k='KeyZ')=>{await page.keyboard.down(k);await page.waitForTimeout(65);await page.keyboard.up(k);await page.waitForTimeout(100);};
const state=()=>page.evaluate(()=>{const b=SC.Game.top;return {id:b.id,node:b.nodeId,mode:b.mode,index:b.index,page:b.page,choices:b.choices?.map(c=>({goto:c.raw.goto,cancel:c.raw.cancel,label:c.label}))};});
async function hub(){for(let i=0;i<30;i++){const s=await state();if(s.id!=='dialogue')throw Error('Dialogue unexpectedly closed');if(s.mode==='choose')return s;await key();}throw Error('Stuck text');}
async function pick(dest){let s=await hub(),ix=s.choices.findIndex(c=>dest==='bye'?c.cancel:c.goto===dest);assert(ix>=0,'Missing choice '+dest);for(let i=0;i<25&&s.index!==ix;i++){await key('ArrowDown');s=await state();}assert.equal(s.index,ix);await key();}
try{
 await page.evaluate(async()=>{(await import('/src/core/save.js')).Save.settings.textSpeed='instant';});
 for(const [id,topics]of (process.argv.includes('--leads-only')?[]:[['drizzt-dourden',['stories','road','companions','advice']],['elminster',['name','library','magic','troubles']],['alustriel-silverhand',['visit','city','letters','help']]])){
  const placement=await page.evaluate(async id=>(await import('/tools/legends-fixture.js')).stageLegend(id),id);
  await page.waitForTimeout(1600);assert.deepEqual(placement.actual,placement.authored);assert.equal(placement.solid,false);await t.shot(id+'-world');await key();await page.waitForTimeout(300);assert.equal((await state()).id,'dialogue');await t.shot(id+'-opening');
  await hub();await t.shot(id+'-hub');
  for(const topic of topics){await pick(topic);assert.equal((await state()).node,topic);await t.shot(id+'-'+topic);await hub();}
  await pick('bye');assert.equal((await state()).id,'overworld');
  const after=await page.evaluate(id=>{const b=SC.Game.top,e=b.map.entities.find(e=>e.npcId===id);return {busy:!!e.busy,player:{x:b.player.x,y:b.player.y}};},id);assert.equal(after.busy,false);
  await key();await hub();await pick('bye');assert.equal((await state()).id,'overworld');
  report.push({id,placement,topics,closedAndReopened:true,busyReleased:!after.busy});
 }
 for(const [id,topic]of [['toblen-stonehill','northernTraveler'],['durnan','silverVisitor'],['volothamp-geddarm','legends'],['jaheira','oldFriends']]){
  await page.evaluate(async id=>(await import('/tools/legends-fixture.js')).stageLegend(id),id);await page.waitForTimeout(1600);await key();await hub();await pick(topic);assert.equal((await state()).node,topic);await t.shot(id+'-'+topic);
  if(id==='volothamp-geddarm'){for(const branch of ['hall','oldMage','silverhands']){await pick(branch);assert.equal((await state()).node,branch);await t.shot('volo-'+branch);await hub();}}
  report.push({id,topic,reachable:true});
 }
 assert.deepEqual(t.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({viewport:[400*scale,240*scale],report,errors:t.errors},null,2));console.log('PASS: '+report.length+' conversation routes; no console errors');
}finally{await t.close();}
