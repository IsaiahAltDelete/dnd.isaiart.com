const {Game,Party,Save}=SC;
const {ShopScene}=await import('/src/ui/shop.js');
const {noteDeed}=await import('/src/rules/deeds.js');
const {localStanding,rememberNPC,npcDisposition}=await import('/src/rules/reputation.js');
const {newGameState,addReputation,startQuest,progressQuests,completeQuest}=await import('/src/state.js');
const {writeSave,continueGame}=await import('/src/main.js');
const {travelTo}=await import('/src/world/overworld.js');
const checks=[],series=[],check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
Party.addGold(10000);
const st=Game.state,initial=Party.gold,firstDay=st.day;let arbitrage=false;
for(let day=1;day<=40;day++){
 st.day=firstDay+day;st.mapId='barthens-provisions';
 noteDeed(st,{kind:day<=20?'quest':'crime',questId:'endurance-'+day,mapId:st.mapId,weight:2});
 const before=Party.gold,rep=localStanding(st,st.mapId).value,shop=new ShopScene('barthens-provisions');
 Game.push(shop);
 const row=shop._buyRows().find(r=>r.id==='explorers-pack'&&!r.disabled);
 if(row){const qty=Party.countItem(row.id);shop.qty=1;shop._buy(row);check('day'+day+' purchase quantity',Party.countItem(row.id)===qty+1);const sell=shop._sellRows().find(r=>r.id===row.id);shop._sell(sell);if(shop.prompt)shop._answer(0);arbitrage||=Party.gold>before;}
 check('day'+day+' commerce does not change standing',localStanding(st,st.mapId).value===rep);
 series.push({day,rep,price:row?.price,gold:Party.gold,restock:shop._daysToRestock()});Game.pop();
}
check('forty-day trade has no profitable loop',!arbitrage&&Party.gold<=initial);
check('standing is bounded at both extremes',Math.max(...series.map(s=>s.rep))===50&&Math.min(...series.map(s=>s.rep))===-50,series);
check('trade terms rise after witnessed crime',series.at(-1).price>series[19].price);
check('local reputation does not spread to Waterdeep',localStanding(st,'waterdeep').value===0);
rememberNPC(st,'campaign-witness','witnessed');addReputation(st,'harpers',25);
const shelf=new ShopScene('barthens-provisions');Game.push(shelf);const r=shelf._buyRows().find(r=>r.id==='explorers-pack');shelf.qty=1;shelf._buy(r);const remaining=shelf._buyRows().find(row=>row.id===r.id)?.remaining;Game.pop();
writeSave(4);const snapshot=Save.read(4);check('save preserves shop stock and memory',!!snapshot.shops.stock&&snapshot.social.people['campaign-witness'].witnessed);
const exported=Save.exportSlot(4);check('copied export imports into separate slot',Save.importSlot(3,exported));
check('copied save loads through campaign loader',continueGame(3));
check('faction reputation survives load',Game.state.reputation?.harpers===25,Game.state.reputation);
check('personal memory survives load',npcDisposition(Game.state,{id:'campaign-witness'},'waterdeep')==='wary');
const reloaded=new ShopScene('barthens-provisions');Game.push(reloaded);check('shop depletion survives load',reloaded._buyRows().find(r=>r.id==='explorers-pack').remaining===remaining);Game.pop();
Game.state.day+=10;const restocked=new ShopScene('barthens-provisions');Game.push(restocked);const replenished=restocked._buyRows().find(r=>r.id==='explorers-pack').remaining;check('tenday restock replenishes supply',replenished>remaining,{remaining,replenished,shops:Game.state.shops,day:Game.state.day});Game.pop();
// A copied version-one fixture without optional later ledgers exercises the
// compatibility path. This is not a claim to possess a historical user save.
const legacy=Save.read(4);for(const k of ['social','shops','crime','deeds'])delete legacy[k];
Save.write(2,legacy);check('legacy-shaped copied campaign loads',continueGame(2));
check('legacy-shaped campaign starts with neutral local standing',localStanding(Game.state,'waterdeep').value===0);
const normal=Game.state;
const quest={id:'queue-test-reward',title:'Test reward',steps:[{kind:'kill',target:'goblin',count:1}],reward:{gold:15,xp:10}};
check('quest starts once',startQuest(normal,quest)&&!startQuest(normal,quest));progressQuests(normal,'kill','goblin');
const completed=completeQuest(normal,quest.id);check('quest completion cannot be repeated',!!completed&&!completeQuest(normal,quest.id));writeSave(1);
check('completed quest survives save',Save.read(1).quests.done.includes(quest.id));
const {QUESTS}=await import('/src/data/quests.js'),{DialogueScene}=await import('/src/ui/dialogue.js');
const rewarded=Object.values(QUESTS).find(q=>q.rewards?.gold>0),dlg=new DialogueScene({start:'start',nodes:{start:{text:'Test turn-in.'}}});
startQuest(Game.state,rewarded);const goldBefore=Party.gold;
dlg._runDo({complete:rewarded.id});const goldAfter=Party.gold;dlg._runDo({complete:rewarded.id});
check('real quest turn-in pays gold only once',goldAfter-goldBefore===rewarded.rewards.gold&&Party.gold===goldAfter);
writeSave(1);check('quest reward purse survives save',Save.read(1).party.gold===goldAfter);
for(const id of ['waterdeep','bg-the-wide','elfsong-tavern']){
 travelTo(id);for(let i=0;i<80&&Game.top.map?.id!==id;i++)await new Promise(r=>setTimeout(r,100));
 check(id+' travel completes',Game.top.map?.id===id);
 writeSave(1);check(id+' saves destination',Save.read(1).mapId===id);
}
if(checks.some(c=>!c.ok))console.error('Campaign checks failed: '+checks.filter(c=>!c.ok).map(c=>c.name).join('; '));
return {checks,series};
