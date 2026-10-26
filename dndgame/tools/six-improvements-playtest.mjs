import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const scale=Number(process.argv[3]||2),out=process.argv[2]||'output/six-improvements/primary';
const run=await privatePlaytest(out,scale),{page,errors}=run,checks=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify({name,ok:!!ok}));};
try {
 await page.evaluate(async()=>{
  const {CharCreateScene}=await import('/src/ui/charcreate.js');
  SC.Game.replace(new CharCreateScene(()=>{},{preset:{speciesId:'human',classId:'wizard',backgroundId:'sage',name:'Spell Tester'}}));
  const b=SC.Game.top;b.draft.picks.spellbook=['mage-armor','shield','magic-missile','sleep','detect-magic','charm-person'];b._touch();b.gotoStep(6);b.setBucket(2);b._ensure();
  document.querySelector('#gate')?.classList.remove('show');
 });
 await page.waitForTimeout(300);await run.shot('wizard-ready');
 check('Wizard Ready contains unlocked selected book spells',await page.evaluate(()=>{const b=SC.Game.top;return b._rows.filter(r=>r.option).length===6&&b._rows.filter(r=>r.option).every(r=>r.checked!=='lock');}));
 // Use the rendered row hit region, then ordinary pointer events.
 await page.mouse.click(70*scale,87*scale);await page.waitForTimeout(200);
 check('Real mouse applies editable starting suggestion',await page.evaluate(()=>SC.Game.top.draft.picks.wizardPrepared?.length>0));
 const prepBefore=await page.evaluate(()=>SC.Game.top.draft.picks.wizardPrepared.length);
 await page.mouse.click(65*scale,132*scale);await page.waitForTimeout(200);await run.shot('wizard-custom-ready');
 check('Suggested preparation remains editable',await page.evaluate(n=>{const b=SC.Game.top;return b.preview.spells.prepared.length===b.draft.picks.wizardPrepared.length&&b.draft.picks.wizardPrepared.length!==n;},prepBefore));
 await page.evaluate(()=>{const b=SC.Game.top;b.draft.picks.wizardPrepared=['mage-armor','shield','magic-missile','sleep'];b._touch();b.setBucket(1);b._ensure();});
 // Exercise the book's selection handler, then refill Ready through the pointer.
 await page.evaluate(()=>{const b=SC.Game.top;b.toggleBucketPick(b.spellBuckets()[1],'mage-armor');b.setBucket(2);b._ensure();});
 check('Removing a book spell frees its Ready slot immediately',await page.evaluate(()=>SC.Game.top.draft.picks.wizardPrepared.length===3));
 await page.mouse.click(65*scale,110*scale);await page.waitForTimeout(250);
 check('Freed Ready slot accepts Charm Person by mouse',await page.evaluate(()=>SC.Game.top.draft.picks.wizardPrepared.includes('charm-person')&&SC.Game.top.preview.spells.prepared.length===4));
 await run.shot('wizard-reconciled-ready');
 await page.evaluate(async()=>{
  const {Encounter}=await import('/src/rules/combat.js'),{BattleScene}=await import('/src/ui/combatui.js'),{newGameState}=await import('/src/state.js');
  SC.Game.state=newGameState('six-battle');SC.Party.clear();
  for(const [name,classId]of [['Mara','wizard'],['Garaele','cleric'],['Daran','paladin']])SC.Party.add(SC.createCharacter({name,classId,speciesId:'human',level:3,backgroundId:'sage'}));
  const e=new Encounter({party:SC.Party.members,enemies:['goblin','ogre'],seed:'six-battle',boss:true});e.start();
  const allies=e.units.filter(u=>u.side==='party');allies.forEach((u,i)=>{u.pos={x:2+i,y:1};});
  e.turnIndex=e.order.indexOf(allies[0].uid);e.beginTurn();SC.Game.replace(new BattleScene(e));
  const b=SC.Game.top;b.beats=[];b.beat=null;b.banner=null;b.phase='menu';b.menuDirty=true;b._revealUnit(e.current);
 });
 await page.waitForTimeout(1300);await run.shot('edge-actor-visible');
 const edge=await page.evaluate(()=>{const b=SC.Game.top;return {r:b._unitBounds(b.enc.current),cam:b.cam,to:b.camTo,manual:b.camManual,boss:!!b.boss};});
 check('Top-edge actor body clears boss HUD',edge.r.y>=48&&edge.r.y+edge.r.h<=209,edge);
 const origin=await page.evaluate(()=>SC.Game.top._origin());
 const beforeActor=await page.evaluate(()=>SC.Game.top.enc.current.uid);
 await page.mouse.click(380*scale,225*scale);await page.waitForTimeout(200);
 if(await page.evaluate(uid=>SC.Game.top.enc.current.uid===uid,beforeActor))await page.mouse.click(380*scale,225*scale);
 await page.waitForTimeout(1800);
 check('Real End Turn switches active character',await page.evaluate(uid=>SC.Game.top.enc.current.uid!==uid,beforeActor));
 check('Turn handoff does not jump when next actor already fits',await page.evaluate(o=>{const b=SC.Game.top;return Math.hypot(b._origin().x-o.x,b._origin().y-o.y)<4;},origin));
 await run.shot('turn-handoff');
 const fled=await page.evaluate(()=>{const b=SC.Game.top,u=b.boss;b.enc._routUnit(u);b.inspect=u;b.inspectPinned=true;return u.uid;});
 await page.waitForTimeout(250);await run.shot('fled-boss-removed');
 check('Routed boss removed from portraits, inspection and picking',await page.evaluate(uid=>{const b=SC.Game.top,u=b.enc.byUid(uid),r=b._unitBounds(u);return !b._railHits.some(h=>h.u.uid===uid)&&b.inspect?.uid!==uid&&b._unitAtPoint(r.x+r.w/2,r.y+r.h/2)?.uid!==uid;},fled));
 await page.evaluate(async()=>{
  const {OverworldScene}=await import('/src/world/overworld.js');
  SC.Game.replace(new OverworldScene('redbrand-hideout-5'));
 });
 await page.waitForFunction(()=>SC.Game.top.map?.id==='redbrand-hideout-5');await page.waitForTimeout(500);
 check('Dungeon loads patrols and discoveries through real map loader',await page.evaluate(()=>{const m=SC.Game.top.map;return m.triggers.some(t=>t.data?.encounterKey==='patrol-0')&&m.triggers.some(t=>t.kind==='sign');}));
 await run.shot('dungeon-entrance');
 // Fixture positions the party at a discovery; interaction uses E.
 await page.evaluate(async()=>{const b=SC.Game.top,t=b.map.triggers.find(t=>t.kind==='sign');const {travelTo}=await import('/src/world/overworld.js');travelTo(b.map.id,t.x,t.y+1,'up');});
 await page.keyboard.press('KeyE');await page.waitForTimeout(500);await page.keyboard.press('KeyE');await page.waitForTimeout(300);await run.shot('discovery-dialogue');
 check('Discovery opens a readable dialogue',await page.evaluate(()=>SC.Game.top.id!=='overworld'));
 for(let i=0;i<6&&await page.evaluate(()=>SC.Game.top.id!=='overworld');i++){
  await page.keyboard.press('KeyE',{delay:50});await page.waitForTimeout(180);
 }
 await page.evaluate(async()=>{const {travelTo}=await import('/src/world/overworld.js');travelTo('redbrand-hideout-5');const b=SC.Game.scenes.find(s=>s.id==='overworld');SC.Game.state.stats.steps=200;b._companionPending='victory';});
 const direction=await page.evaluate(()=>{const b=SC.Game.top,p=b.player;return [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']].find(([dx,dy])=>!b.map.solidAt(p.x+dx,p.y+dy)&&!b.map.triggerAt(p.x+dx,p.y+dy))?.[2];});
 if(!direction)throw Error('No quiet adjacent tile in companion fixture');
 await page.keyboard.down(direction);await page.waitForTimeout(350);await page.keyboard.up(direction);await page.waitForTimeout(700);await run.shot('companion-exchange');
 check('Companion exchange appears after normal movement',await page.evaluate(()=>SC.Game.top.popup?.title==='Among companions'));
 await page.evaluate(async()=>{const {travelTo}=await import('/src/world/overworld.js');travelTo('redbrand-hideout-4');const b=SC.Game.top;const up=b.map.triggers.find(t=>t.kind==='warp'&&t.data.stair==='up');b.popup=null;b._doWarp(up.data);});
 await page.waitForFunction(()=>SC.Game.top.map?.id==='redbrand-hideout-3'&&!SC.Game.transitioning);
 check('Actual upward transition lands on matching down stair',await page.evaluate(()=>{const b=SC.Game.top;return b.player.x===b.map.exit.x&&b.player.y===b.map.exit.y;}));
 await run.shot('return-stair');
 for(const firstId of ['redbrand-hideout','redbrand-hideout-1']){
  const original=await page.evaluate(async id=>{const {travelTo}=await import('/src/world/overworld.js');travelTo(id);const b=SC.Game.top;SC.Game.state.flags[`encounter:${id}:patrol-0`]=true;const original={ground:Array.from(b.map.ground),exit:b.map.exit};b._doWarp(b.map.triggers.find(t=>t.data?.stair==='down').data);return original;},firstId);
  await page.waitForFunction(()=>SC.Game.top.map?.id==='redbrand-hideout-2'&&!SC.Game.transitioning);
  await page.evaluate(async()=>{SC.Game.state=JSON.parse(JSON.stringify(SC.Game.state));const {clearMapCache}=await import('/src/world/overworld.js');clearMapCache();const maps=await import('/src/world/maps.js');maps.clearMapCache();const b=SC.Game.top;b._doWarp(b.map.triggers.find(t=>t.data?.stair==='up').data);});
  await page.waitForFunction(id=>SC.Game.top.map?.id===id&&!SC.Game.transitioning,firstId);
  check(`Actual stair round trip preserves ${firstId} layout and cleared encounter`,await page.evaluate(({original,id})=>{const b=SC.Game.top;return JSON.stringify(Array.from(b.map.ground))===JSON.stringify(original.ground)&&b.player.x===original.exit.x&&b.player.y===original.exit.y&&b._doTriggerBattle({encounterKey:'patrol-0'})===false;},{original,id:firstId}));
 }
 await page.evaluate(async()=>{const {travelTo}=await import('/src/world/overworld.js');travelTo('redbrand-hideout-5');const b=SC.Game.top,t=b.map.triggers.find(t=>t.kind==='warp'&&t.data.guarded);b._doWarp(t.data);});
 await page.waitForTimeout(500);await run.shot('guardian-standoff');
 check('Guarded stair opens an encounter before travel',await page.evaluate(()=>SC.Game.top.id==='standoff'));
 check('No draw failures',await page.evaluate(()=>!SC.Game._drawFails?.size));
} catch(e){check('Driver completes',false,String(e));await run.shot('failure');}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));await run.close();if(errors.length||checks.some(c=>!c.ok))process.exitCode=1;}
