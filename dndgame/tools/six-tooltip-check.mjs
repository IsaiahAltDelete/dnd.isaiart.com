import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const run=await privatePlaytest('output/six-improvements/punctuation',2);
try {
  await run.page.evaluate(async()=>{
    const {Encounter}=await import('/src/rules/combat.js');
    const {BattleScene}=await import('/src/ui/combatui.js');
    const hero=SC.createCharacter({name:'Tester',classId:'wizard',speciesId:'human',level:3});
    const enc=new Encounter({party:[hero],enemies:['goblin'],seed:'tooltip'});enc.start();
    enc.turnIndex=enc.order.indexOf(enc.units.find(u=>u.side==='party').uid);enc.beginTurn();
    SC.Game.replace(new BattleScene(enc));
    const b=SC.Game.top;b.beats=[];b.beat=null;b.banner=null;b.phase='menu';b.menuDirty=true;
    document.querySelector('#gate')?.classList.remove('show');
  });
  await run.page.waitForTimeout(400);await run.page.mouse.move(760,450);await run.page.waitForTimeout(300);
  assert.equal(await run.page.evaluate(()=>SC.Game.top.hint),"End this creature's turn");
  await run.shot('end-turn-tooltip');assert.deepEqual(run.errors,[]);
  console.log('PASS clean End Turn tooltip; no browser errors');
} finally {await run.close();}
