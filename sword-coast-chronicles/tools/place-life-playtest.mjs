import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const scale=Number(process.argv[2]||2),out=`output/place-life/size-${scale}`,t=await privatePlaytest(out,scale),{page}=t,checks=[];
const key=async(k='KeyZ')=>{await page.keyboard.down(k);await page.waitForTimeout(70);await page.keyboard.up(k);await page.waitForTimeout(140);};
const snapshots=[];
try{
 for(const [id,kind]of [['blackstaff-tower','arcane'],['blackstaff-tower','study'],['blackstaff-tower','kettle'],['blackstaff-court','wards'],['bg-the-wide','weigh'],['bg-the-wide','textiles'],['bg-the-wide','auction']].filter(([,kind])=>!process.argv[3]||kind===process.argv[3])){
  await page.evaluate(async({id,kind})=>(await import('/tools/place-life-fixture.js')).stagePlaceLife(id,kind),{id,kind});await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(async()=>{const {hasSprite}=await import('/src/render/sprites.js');return SC.Game.top.map.entities.filter(e=>e.data?.streetLife&&!hasSprite(e.sprite)).map(e=>e.sprite);}),[],'Every ambient character has real sprite art');
  await t.shot(kind+'-place');
  for(const [phase,min]of [['request',.5],['reply',.5],['action',.5],['action',2.5],['thanks',.5]]){
   const snap=await page.evaluate(({kind,phase,min})=>{const ow=SC.Game.top,g=ow.map.streetScenes.find(g=>g.kind===kind);for(let i=0;i<6000;i++){ow._updateEntities(1/30);SC.Game.time+=1/30;if(g.social?.phase===phase&&g.social.t>=min){SC.Game._draw();return {kind,phase,time:g.social.t,lines:g.social.lines,actors:g.social.actors.map(e=>({name:e.name,x:e.x,y:e.y,activity:e.activity})),state:JSON.parse(window.render_game_to_text())};}}throw Error('Never reached '+kind+' '+phase);},{kind,phase,min});
   snapshots.push(snap);await t.shot(`${kind}-${phase}-${min}`);
  }
  // Actual dialogue interrupts an active scene; it must release and restart.
  const before=await page.evaluate(({kind})=>{const ow=SC.Game.top,g=ow.map.streetScenes.find(g=>g.kind===kind);for(let i=0;i<6000;i++){ow._updateEntities(1/30);if(g.social?.phase==='action')break;}const e=g.social?.host;if(!e)throw Error('No action');const spots=[[0,1,'up'],[-1,0,'right'],[1,0,'left'],[0,-1,'down']],p=spots.find(([dx,dy])=>!ow.map.solidAt(e.x+dx,e.y+dy)&&!ow.map.triggerAt(e.x+dx,e.y+dy)&&!ow.map.entities.some(n=>n!==ow.player&&n.x===e.x+dx&&n.y===e.y+dy));if(!p)throw Error('No approach');ow.player.setTile(e.x+p[0],e.y+p[1],p[2]);ow._snapCamera();return {gold:SC.Party.gold,hp:SC.Party.members[0].hp,cycle:g.socialCycle};},{kind});
  await key();assert.equal(await page.evaluate(()=>SC.Game.top.id),'dialogue');await t.shot(kind+'-conversation');await key('KeyX');
  // Some dialogue pages consume cancel as close; never choose a state-changing option.
  for(let i=0;i<4&&await page.evaluate(()=>SC.Game.top.id!=='overworld');i++)await key('KeyX');
  assert.equal(await page.evaluate(()=>SC.Game.top.id),'overworld');
  const after=await page.evaluate(({kind,cycle})=>{const ow=SC.Game.top,g=ow.map.streetScenes.find(g=>g.kind===kind);for(let i=0;i<6000;i++){ow._updateEntities(1/30);if(g.socialCycle>cycle&&g.social?.phase==='action')return {gold:SC.Party.gold,hp:SC.Party.members[0].hp,resumed:true};}return {resumed:false};},{kind,cycle:before.cycle});
  assert(after.resumed,kind+' did not resume');assert.equal(after.gold,before.gold);assert.equal(after.hp,before.hp);checks.push(kind+': five real phases, dialogue interrupt and resumed action, no resource effect');
 }
 assert.deepEqual(t.errors,[]);fs.writeFileSync(out+(process.argv[3]?'/report-'+process.argv[3]+'.json':'/report.json'),JSON.stringify({checks,errors:t.errors,snapshots},null,2));console.log('PASS: '+checks.join('; '));
}catch(e){await t.shot('failure');throw e;}finally{await t.close();}

