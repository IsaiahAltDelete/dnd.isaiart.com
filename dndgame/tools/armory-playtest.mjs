import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/armory/primary',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run,checks=[];
const check=(name,pass)=>{checks.push({name,pass:!!pass});if(!pass)console.log('FAIL '+name);};
const key=async k=>{await page.keyboard.press(k);await page.waitForTimeout(180);};
async function choose(id){
 for(let depth=0;depth<8;depth++){
  const s=await page.evaluate(id=>{const b=SC.Game.top,rows=b._currentRows();const has=r=>r.id===id||(r.sub||[]).some(has);return {phase:b.phase,index:b.menuPath.length?b.subIndex:b.menuIndex,wanted:rows.findIndex(r=>r.enabled&&has(r)),count:rows.length,hit:rows.find(r=>r.enabled&&has(r))?.id};},id);
  if(s.phase!=='menu')return;
  assert(s.wanted>=0,'Missing menu action '+id);
  for(let n=0;n<(s.wanted-s.index+s.count)%s.count;n++)await key('ArrowRight');
  await key('KeyZ');if(s.hit===id)return;
 }throw Error('Menu depth '+id);
}
try{
 await page.evaluate(async()=>{await(await import('/tools/armory-fixture.js')).stageArmoryShop();});
 await page.waitForTimeout(350);await run.shot('01-shop');
 const before=await page.evaluate(()=>({gold:SC.Party.gold,price:SC.Game.top._row().price,id:SC.Game.top._row().id}));
 check('Shop selects Everburn Blade',before.id==='everburn-blade');
 await key('Enter');await run.shot('02-equip-prompt');
 check('Keyboard purchase offers immediate equipment',await page.evaluate(()=>SC.Game.top.prompt?.title==='Equip now?'));
 await key('Enter');
 check('Purchase spends displayed gold and equips selected weapon',await page.evaluate(b=>SC.Party.gold===b.gold-b.price&&SC.Party.members[0].equipment.mainHand?.id===b.id,before));
 for(const id of ['gold-wyrmling-staff','knife-undermountain-king']){
  await page.evaluate(id=>{const s=SC.Game.top;s._buildRows();s.index[0]=s.rows.findIndex(r=>r.id===id);},id);
  await page.waitForTimeout(180);await run.shot('shop-'+id);
 }
 const gallery=await page.evaluate(async()=>{
  const {ARMORY_ITEMS}=await import('/src/data/items_armory.js'),{ARMORY}=await import('/src/render/weapon-art.js');
  const f=await import('/tools/armory-fixture.js');
  const bases=Object.keys(ARMORY.frames).slice(0,38),special=Object.values(ARMORY_ITEMS).filter(i=>i.kind==='weapon').map(i=>i.id);
  return {bases:await f.armoryGallery(bases),special:await f.armoryGallery(special),poses:await f.armoryPoses()};
 });
 for(const [name,data]of Object.entries(gallery))fs.writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));
 await page.evaluate(async()=>{
  const {ARMORY_ITEMS}=await import('/src/data/items_armory.js');for(const id of Object.keys(ARMORY_ITEMS))SC.Party.addItem(id,1,{identified:true});
  SC.Game.replace(new (await import('/src/ui/menus.js')).InventoryScene());
 });await page.waitForTimeout(250);await run.shot('03-inventory');
 check('Inventory shows all new items',await page.evaluate(()=>SC.Game.top.rows.length>=28));
 const uses=await page.evaluate(async()=>{
  const {addCondition,hasCondition}=await import('/src/rules/conditions.js');
  const s=SC.Game.top,h=SC.Party.members[0];s._use(s.rows.find(r=>r.id==='second-wind-draught'),h);
  const temp=h.tempHp;addCondition(h,'poisoned');addCondition(h,'frightened');s._build();s._use(s.rows.find(r=>r.id==='clearhead-tonic'),h);
  return {temp,cured:!hasCondition(h,'poisoned')&&!hasCondition(h,'frightened'),consumed:!SC.Party.inventory.some(i=>['second-wind-draught','clearhead-tonic'].includes(i.id))};
 });check('Draught grants 5–10 temporary HP',uses.temp>=5&&uses.temp<=10);check('Tonic removes both conditions and potions consume',uses.cured&&uses.consumed);
 await page.evaluate(async()=>{await(await import('/tools/armory-fixture.js')).stageArmoryBattle();});
 await page.waitForTimeout(1100);await run.shot('04-battle');
 await key('Enter');await key('Enter');await run.shot('05-targeting');await key('Enter');await page.waitForTimeout(1400);await run.shot('06-attack');
 const combat=await page.evaluate(()=>({log:SC.Game.top.enc.log,foes:SC.Game.top.enc.units.filter(u=>u.side==='foe').map(u=>({hp:u.hp,max:u.maxHp})),phase:SC.Game.top.phase}));
 check('Real combat input resolves an attack',combat.log.some(l=>l.text.includes('with Everburn Blade:')));
 check('Everburn hit damages the ogre',combat.foes.some(u=>u.hp<u.max));
 fs.writeFileSync(out+'/combat.json',JSON.stringify(combat,null,2));
 await page.evaluate(async()=>{await(await import('/tools/armory-fixture.js')).stageArmoryBattle('gold-wyrmling-staff');});
 await page.waitForTimeout(300);
 const spell=await page.evaluate(async()=>{const b=SC.Game.top,h=b.enc.current;return {known:(await import('/src/rules/spellcasting.js')).knownSpells(h),menu:b._currentRows()};});
 check('Fighter gains staff cantrip during battle',spell.known.includes('fire-bolt'));fs.writeFileSync(out+'/staff-menu.json',JSON.stringify(spell,null,2));await run.shot('07-staff');
 const findSpell=rows=>{for(const r of rows){if(r.spellId==='fire-bolt'||r.id==='spell:fire-bolt')return r.id;const id=r.sub&&findSpell(r.sub);if(id)return id;}};
 await choose(findSpell(spell.menu));await run.shot('08-firebolt-target');await key('KeyZ');await page.waitForTimeout(1600);await run.shot('09-firebolt');
 check('Fighter casts equipped Fire Bolt through normal combat controls',await page.evaluate(()=>SC.Game.top.enc.log.some(l=>l.text.includes('Fire Bolt')&&l.kind!=='turn')));
 const drawErrors=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);
 check('No draw or browser errors',!drawErrors.length&&!errors.length);
 fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,drawErrors},null,2));
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 assert.equal(checks.filter(c=>!c.pass).length,0);console.log(checks.length+' browser checks passed');
}catch(e){await run.shot('failure');throw e;}finally{await run.close();}
