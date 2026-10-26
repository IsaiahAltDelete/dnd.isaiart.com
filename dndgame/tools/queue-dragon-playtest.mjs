import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/queue-all/dragon',run=await privatePlaytest(out),{page,errors,shot}=run,checks=[],runs=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify({name,ok:!!ok}));};
try{
 for(const level of (process.argv[3]||'5,8').split(',').map(Number)){
  await page.evaluate(async level=>{
   const {Game,Party,createCharacter}=SC,{newGameState}=await import('/src/state.js'),{OverworldScene,travelTo,clearMapCache}=await import('/src/world/overworld.js');
   Game.state=newGameState('dragon-natural-'+level);Game.state.time=720;Party.clear();clearMapCache();Party.autoBattle={};
   const {QUESTS}=await import('/src/data/quests.js'),{startQuest}=await import('/src/state.js');
   const dragonQuest=Object.values(QUESTS).find(q=>q.steps?.some(s=>s.target==='venomfang'));if(dragonQuest)startQuest(Game.state,dragonQuest);
   for(const cls of ['fighter','cleric','wizard','rogue']){
    const scores={fighter:{str:16,dex:12,con:14,int:10,wis:13,cha:8},rogue:{str:10,dex:16,con:14,int:12,wis:13,cha:8},wizard:{str:8,dex:14,con:13,int:16,wis:12,cha:10},cleric:{str:13,dex:10,con:14,int:8,wis:16,cha:12}};
    const ch=createCharacter({name:cls,speciesId:'human',classId:cls,backgroundId:'soldier',level,abilities:scores[cls]});
    if(cls==='wizard'){ch.spells.known=['magic-missile','scorching-ray','fireball','shield'];ch.spells.prepared=[...ch.spells.known];ch.spells.cantrips=['fire-bolt'];}
    if(cls==='cleric'){ch.spells.known=['healing-word','cure-wounds','bless','spiritual-weapon'];ch.spells.prepared=[...ch.spells.known];ch.spells.cantrips=['sacred-flame'];}
    Party.add(ch);Party.autoBattle[ch.uid]=true;
   }
   Game.replace(new OverworldScene());travelTo('thundertree',16,12,'up');
  },level);
  await page.waitForFunction(()=>SC.Game.top.id==='overworld'&&SC.Game.top.map?.id==='thundertree'&&!SC.Game.transitioning);await page.waitForTimeout(1000);await shot(`level${level}-approach`);
  const source=await page.evaluate(()=>{const ow=SC.Game.top,m=ow.map.entities.find(e=>e.monsterId==='venomfang');return m&&{x:m.x,y:m.y,state:m.state};});check('level'+level+': natural dragon present',!!source,source);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>SC.Game.top.player?.y===11,null,{timeout:4000,polling:16});
  await page.keyboard.up('ArrowUp');await page.waitForTimeout(600);await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>['battle','standoff'].includes(SC.Game.top.id),null,{timeout:15000});
  if(await page.evaluate(()=>SC.Game.top.id==='standoff')){
   await shot(`level${level}-standoff`);
   for(let i=0;i<4;i++){await page.keyboard.press('ArrowDown');await page.waitForTimeout(120);}
   await page.keyboard.press('KeyZ');await page.waitForTimeout(800);await page.keyboard.press('KeyZ');
  }
  await page.waitForFunction(()=>SC.Game.top.id==='battle',null,{timeout:15000});
  await shot(`level${level}-battle-start`);
  await page.keyboard.down('ShiftLeft');
  let lastRound=0,steps=0;
  while(steps++<360){
   const s=await page.evaluate(()=>{const b=SC.Game.top;return{scene:b.id,result:b.results?.kind,round:b.enc?.round,phase:b.phase,prompt:!!b.prompt,log:b.enc?.log.slice(-4),units:b.enc?.units.map(u=>({name:u.name,hp:u.hp,maxHp:u.maxHp,pos:u.pos}))};});
   if(s.result){runs.push({level,...s});break;}
   if(s.scene!=='battle')throw Error('Unexpected scene '+s.scene);
   if(s.prompt)await page.keyboard.press('KeyZ');
   if(s.round!==lastRound){lastRound=s.round;console.log('Level '+level+' round '+lastRound);await shot(`level${level}-round${lastRound}`);}
   await page.waitForTimeout(500);
  }
  await page.keyboard.up('ShiftLeft');
  const result=await page.evaluate(()=>{const b=SC.Game.top;return{kind:b.results?.kind,round:b.enc.round,log:b.enc.log,units:b.enc.units.map(u=>({name:u.name,hp:u.hp,fled:u._fled}))};});
  check('level'+level+': encounter reaches an outcome',!!result.kind,result.kind);runs.push({level,result});await shot(`level${level}-result`);
  if(!result.kind)throw Error('Dragon encounter did not finish');
  await page.waitForTimeout(900);await page.keyboard.press('KeyZ');await page.waitForTimeout(1200);await shot(`level${level}-aftermath`);
  check('level'+level+': results leave battle',await page.evaluate(()=>SC.Game.top.id!=='battle'));
  if(result.kind==='victory'){
   const persistence=await page.evaluate(async()=>{const {writeSave}=await import('/src/main.js');const result=writeSave(4);return{result,data:SC.Save.read(4)};});
   check('dragon victory records permanent defeat',!!persistence.data.defeated?.['thundertree:venomfang'],persistence.data.defeated);
   check('driving off dragon records completed tower objective',!!persistence.data.flags?.['venomfang-driven']);
   const before=await page.evaluate(()=>({gold:SC.Party.gold,xp:SC.Party.members.map(c=>c.xp),quests:SC.Game.state.quests}));
   await page.reload();await page.waitForFunction(()=>window.SC);
   await page.evaluate(async()=>{const {continueGame}=await import('/src/main.js');if(!continueGame(4))throw Error('Save failed to load');document.querySelector('#gate')?.classList.remove('show');});
   await page.waitForFunction(()=>SC.Game.top.map?.id==='thundertree'&&!SC.Game.transitioning);await page.waitForTimeout(800);
   const after=await page.evaluate(()=>({gold:SC.Party.gold,xp:SC.Party.members.map(c=>c.xp),quests:SC.Game.state.quests,dragon:SC.Game.top.map.entities.some(e=>e.monsterId==='venomfang'&&!e.removed)}));
   check('full reload preserves rewards and quest progress',before.gold===after.gold&&JSON.stringify(before.xp)===JSON.stringify(after.xp)&&JSON.stringify(before.quests)===JSON.stringify(after.quests),{before,after});
   check('dragon remains absent after full reload',!after.dragon);await shot(`level${level}-reloaded`);
  }
 }
}catch(e){checks.push({name:'driver completed',ok:false,detail:String(e)});await shot('failure');console.error(e);}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,runs,errors},null,2));await run.close();if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
