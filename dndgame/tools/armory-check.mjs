import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ITEMS,resolveItem,SHOP_TABLES,LOOT_TABLES} from '../src/data/items.js';
import {ARMORY_ITEMS} from '../src/data/items_armory.js';
import {createCharacter,addItem,equip,unequip,damageFor,acOf,mechOf} from '../src/rules/character.js';
import {knownSpells,spellAtk} from '../src/rules/spellcasting.js';
import {Encounter} from '../src/rules/combat.js';
import {resolveAttack} from '../src/rules/actions.js';
import {weaponProfile,weaponSprite,weaponAnimationKind,ARMORY} from '../src/render/weapon-art.js';
import {spriteDef} from '../src/render/sprites.js';
import {drawActor,actorPoseFrames,APPEARANCE_OPTIONS} from '../src/render/actor.js';
const checks=[],check=(name,fn)=>{fn();checks.push(name);console.log('PASS '+name);};
const hero=()=>createCharacter({name:'Armorer',speciesId:'human',classId:'fighter',level:10,backgroundId:'soldier'});
check('Character renderer retains its public drawing and appearance interfaces',()=>{
 assert.equal(typeof drawActor,'function');assert.equal(typeof actorPoseFrames,'function');assert(APPEARANCE_OPTIONS.wardrobe.includes('outfit-doublet'));
});
check('Every existing and new weapon has authored held art and all sixteen directional frames',()=>{
 for(const item of Object.values(ITEMS).filter(i=>i.kind==='weapon')){
  assert(ARMORY.frames[weaponProfile(item)],item.id);
  const def=spriteDef(weaponSprite(item));assert(def,item.id);
  for(const dir of ['down','left','right','up'])for(let f=0;f<4;f++)assert.equal(def.frames[`${dir}-${f}`].length,24,item.id);
 }
 for(const id of ['trident-plus3','whip-plus2','heavy-crossbow-plus1','sling-plus1'])assert.equal(weaponProfile(resolveItem(id)),id.replace(/-plus\d$/,''));
 assert.equal(weaponProfile(resolveItem('trident-of-fish-command')),'trident');
 assert.equal(weaponProfile(resolveItem('staff-of-healing')),'quarterstaff');
 assert.equal(weaponAnimationKind(weaponSprite(resolveItem('sorrow'))),'pole');
 assert.equal(weaponAnimationKind(weaponSprite(resolveItem('pistol'))),'bow');
});
check('All twenty-eight additions have reachable shop stock and valid data',()=>{
 assert.equal(Object.keys(ARMORY_ITEMS).length,28);
 const stock=Object.values(SHOP_TABLES).flatMap(s=>s.stock||[]).map(s=>typeof s==='string'?s:Array.isArray(s)?s[0]:s.id);
 for(const item of Object.values(ARMORY_ITEMS)){
  assert(stock.includes(item.id),'Missing shop: '+item.id);assert(item.desc&&item.cost>0);assert(Object.isFrozen(item));
  if(item.kind==='weapon')assert(resolveItem(item.baseItem));
 }
 for(const table of Object.values(LOOT_TABLES))for(const row of table.items||[])if(ARMORY_ITEMS[row[0]])assert(resolveItem(row[0]));
});
check('Equipment cantrips come and go without changing the permanent spellbook',()=>{
 const h=hero(),before=JSON.stringify(h.spells.known);
 assert(!knownSpells(h).includes('fire-bolt'));
 assert(equip(h,addItem(h,'gold-wyrmling-staff'),'mainHand'));
 assert(knownSpells(h).includes('fire-bolt'));
 assert(damageFor(h,'gold-wyrmling-staff').bonusDice.some(b=>b.type==='fire'&&b.dice==='1d4'));
 unequip(h,'mainHand');assert(!knownSpells(h).includes('fire-bolt'));assert.equal(JSON.stringify(h.spells.known),before);
 equip(h,addItem(h,'sorrow'),'mainHand');assert(knownSpells(h).includes('thorn-whip'));
 const restored=JSON.parse(JSON.stringify(h));assert(knownSpells(restored).includes('thorn-whip'));
});
check('Defender AC and Undermountain critical range are equipped-only',()=>{
 const h=hero();unequip(h,'mainHand');const ac=acOf(h);
 equip(h,addItem(h,'defender-flail'),'mainHand');assert.equal(acOf(h),ac+1);
 unequip(h,'mainHand');assert.equal(acOf(h),ac);
 equip(h,addItem(h,'knife-undermountain-king'),'mainHand');assert.equal(mechOf(h).critRange,19);
 unequip(h,'mainHand');assert.equal(mechOf(h).critRange,20);
});
check('Equipped cantrips supplement prepared magic without preparing other spells',()=>{
 const ch=createCharacter({name:'Mage',speciesId:'human',classId:'wizard',level:5,backgroundId:'sage'});
 ch.spells.cantrips=['ray-of-frost'];ch.spells.prepared=['shield'];ch.spells.known=['shield','fireball'];
 equip(ch,addItem(ch,'sorrow'),'mainHand');
 const e=new Encounter({party:[ch],enemies:['ogre'],seed:'spell-grant'});e.start();const h=e.units.find(u=>u.side==='party');
 const ids=e.availableActions(h).map(a=>a.spellId);
 assert(ids.includes('thorn-whip'));assert(ids.includes('shield'));assert(!ids.includes('fireball'));
 assert.equal(spellAtk(h,'thorn-whip'),h.prof+Math.floor((h._scores.wis-10)/2));
 unequip(h,'mainHand');assert(!e.availableActions(h).some(a=>a.spellId==='thorn-whip'));
});
check('Vicious critical adds exactly seven once and never on an ordinary hit',()=>{
 const enc=new Encounter({party:[hero()],enemies:['ogre'],seed:'vicious-check'});enc.start();
 const h=enc.units.find(u=>u.side==='party'),foe=enc.units.find(u=>u.side==='foe');
 h.pos={x:5,y:5};foe.pos={x:6,y:5};foe.hp=foe.maxHp=10000;
 equip(h,addItem(h,'vicious-longsword'),'mainHand');
 const hit=resolveAttack(enc,h,foe,{weapon:'vicious-longsword',fixedRoll:15,ignoreCover:true});
 assert(hit.hit);assert(!hit.breakdown.some(b=>b.label==='Vicious critical'));
 const crit=resolveAttack(enc,h,foe,{weapon:'vicious-longsword',fixedRoll:20,ignoreCover:true});
 assert(crit.crit);const bonus=crit.breakdown.filter(b=>b.label==='Vicious critical');assert.equal(bonus.length,1);assert.equal(bonus[0].total,7);
});
check('New equipment effects survive JSON restoration',()=>{
 const h=hero();equip(h,addItem(h,'streetrunner-boots'),'boots');equip(h,addItem(h,'cinderward-ring'),'ring1');
 const restored=JSON.parse(JSON.stringify(h));assert.equal(mechOf(restored,true).speedBonus,5);assert(mechOf(restored).resist.includes('fire'));
});
check('Warning bow prevents actual ambush disadvantage while equipped',()=>{
 const a=hero(),b=hero();equip(a,addItem(a,'longbow-of-warning'),'mainHand');
 const e=new Encounter({party:[a,b],enemies:['ogre'],ambush:'foe',seed:'warning'});e.start();
 assert.equal(e.initiative[a.uid].dis,false);assert.equal(e.initiative[b.uid].dis,true);
 unequip(a,'mainHand');const next=new Encounter({party:[a],enemies:['ogre'],ambush:'foe',seed:'warning-off'});next.start();assert.equal(next.initiative[a.uid].dis,true);
});
check('New draught resolves through combat action economy and is consumed',()=>{
 const h=hero();addItem(h,'second-wind-draught');const e=new Encounter({party:[h],enemies:['ogre'],seed:'draught'});e.start();
 const u=e.units.find(u=>u.side==='party');e.turnIndex=e.order.indexOf(u.uid);e.beginTurn();
 const action=e.availableActions(u).find(a=>a.itemId==='second-wind-draught');assert(action);
 const result=e.perform(u,action.id,{unit:u});assert(result.ok);assert(u.tempHp>=5&&u.tempHp<=10);
 assert(!e.availableActions(u).some(a=>a.itemId==='second-wind-draught'));assert.equal(e._budgetFor(u).action,0);
});
fs.mkdirSync('output/armory',{recursive:true});fs.writeFileSync('output/armory/rules-report.json',JSON.stringify({passed:checks.length,checks,weaponCount:Object.values(ITEMS).filter(i=>i.kind==='weapon').length,additions:Object.keys(ARMORY_ITEMS).length},null,2));
