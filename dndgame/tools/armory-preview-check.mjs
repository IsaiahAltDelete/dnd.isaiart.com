import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/armory/preview-primary',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run;let report;
try{
 report=await page.evaluate(async()=>{
  const {Game,Party,createCharacter}=SC,{equip,addItem,recalc}=await import('/src/rules/character.js');
  const {PartyScene,SpellbookScene}=await import('/src/ui/menus.js'),{spellAtk}=await import('/src/rules/spellcasting.js');
  Game.state=(await import('/src/state.js')).newGameState('armory-preview');Party.clear();
  const ch=createCharacter({name:'Selene',speciesId:'human',classId:'wizard',level:3,backgroundId:'soldier'});
  ch.base.int=20;ch.base.wis=10;recalc(ch);ch.spells.cantrips=['fire-bolt'];ch.spells.known=['shield'];ch.spells.prepared=['shield'];
  equip(ch,addItem(ch,'sorrow'),'mainHand');Party.add(ch);window.armoryMage=ch;
  Game.replace(new PartyScene({section:'attacks'}));const s=Game.top,list=s._attackList(ch);
  const row=list.find(r=>r.spell?.id==='thorn-whip');s.cursor[s.section]=list.indexOf(row);
  document.querySelector('#gate')?.classList.remove('show');
  return {sheet:row.hit,actual:spellAtk(ch,'thorn-whip'),base:spellAtk(ch),learnedSheet:list.find(r=>r.spell?.id==='fire-bolt').hit,learnedActual:spellAtk(ch,'fire-bolt')};
 });
 await page.waitForTimeout(220);await run.shot('sheet-sorrow');
 await page.evaluate(async()=>{SC.Game.replace(new(await import('/src/ui/menus.js')).SpellbookScene());const s=SC.Game.top;s._build();s.index=s.rows.findIndex(r=>r.id==='thorn-whip');});
 await page.waitForTimeout(220);await run.shot('spellbook-sorrow');
 await page.evaluate(()=>{const s=SC.Game.top;s.index=s.rows.findIndex(r=>r.id==='fire-bolt');});await page.waitForTimeout(220);await run.shot('spellbook-learned-firebolt');
 report.unequipRemoves=await page.evaluate(async()=>{(await import('/src/rules/character.js')).unequip(window.armoryMage,'mainHand');return !SC.Game.top._build().some(r=>r.id==='thorn-whip');});
 report.fighterBook=await page.evaluate(async()=>{
  const {equip,addItem,recalc}=await import('/src/rules/character.js');SC.Party.clear();const h=SC.createCharacter({name:'Daran',speciesId:'human',classId:'fighter',level:5,backgroundId:'soldier'});
  h.base.int=16;recalc(h);equip(h,addItem(h,'gold-wyrmling-staff'),'mainHand');SC.Party.add(h);
  SC.Game.replace(new(await import('/src/ui/menus.js')).SpellbookScene());const s=SC.Game.top;s._build();s.index=s.rows.findIndex(r=>r.id==='fire-bolt');return s.ch===h&&s.index>=0;
 });await page.waitForTimeout(220);await run.shot('fighter-staff-book');
 report.errors=errors;report.drawErrors=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
 assert.equal(report.sheet,'+'+report.actual);assert.notEqual(report.actual,report.base);assert.equal(report.learnedSheet,'+'+report.learnedActual);assert.equal(report.learnedActual,report.base);assert(report.unequipRemoves&&report.fighterBook);assert.equal(errors.length+report.drawErrors.length,0);
 console.log('Per-spell sheet/book previews passed');
}finally{await run.close();}
