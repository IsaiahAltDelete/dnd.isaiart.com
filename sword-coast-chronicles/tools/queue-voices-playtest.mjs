import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/queue-all/voices',run=await privatePlaytest(out,Number(process.argv[3]||2));
const {page,errors,shot}=run,checks=[],samples=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify({name,ok:!!ok}));};
try{
 for(const [mapId,kind,member]of [['waterdeep','music',0],['waterdeep','repair',0],['bg-the-wide','food',0],['bg-citadel-streets','news',1],['bg-gray-harbour','fish',1],['bg-bloomridge','garden',1]]){
  const fixture=await page.evaluate(async({mapId,kind,member})=>{
   const {Game,Party,createCharacter}=SC,{newGameState}=await import('/src/state.js'),{OverworldScene}=await import('/src/world/overworld.js'),{loadMap}=await import('/src/world/maps.js');
   Game.state=newGameState('voice-review');Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;
   Party.clear();Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'bard',backgroundId:'soldier'}));Game.replace(new OverworldScene());
   const ow=Game.top,m=loadMap(mapId,{seed:'voice-review',force:true,cache:false}),g=m.streetScenes.find(g=>g.kind===kind),e=m.entities.find(e=>e.group===g&&e.member===member);
   const a=[[0,1,'up'],[1,0,'left'],[-1,0,'right'],[0,-1,'down']].find(([dx,dy])=>!m.solidAt(e.x+dx,e.y+dy)&&!m.entities.some(n=>n!==e&&n.x===e.x+dx&&n.y===e.y+dy));
   ow.bindMap(m,e.x+a[0],e.y+a[1],a[2]);ow.banner=null;ow.hud.toasts=[];
   // Freeze patrol only for the approach; dialogue exit must release its busy flag.
   e.pauseT=1;window.voiceFixture={e,g,ow};document.querySelector('#gate')?.classList.remove('show');
   return {name:e.name,lines:e.greeting,id:e.id};
  },{mapId,kind,member});
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>SC.Game.top.id==='dialogue');
  await page.keyboard.press('KeyZ');await page.waitForTimeout(200);await shot(mapId+'-'+kind);
  const dialogue=await page.evaluate(()=>{const d=SC.Game.top;return{name:d._speakerName(d.tree.nodes[d.nodeId]),text:d.tree.nodes[d.nodeId].text,lines:d.pages.map(p=>p.lines.length)};});
  check(mapId+' '+kind+' uses individual dialogue',fixture.lines.includes(dialogue.text),dialogue);
  check(mapId+' '+kind+' fits dialogue panel',dialogue.lines.every(n=>n<=5),dialogue.lines);
  for(let i=0;i<10&&await page.evaluate(()=>SC.Game.top.id==='dialogue');i++){await page.keyboard.press('KeyX');await page.waitForTimeout(120);}
  await page.waitForTimeout(3500);
  check(mapId+' '+kind+' releases resident after dialogue',await page.evaluate(()=>SC.Game.top.id==='overworld'&&!voiceFixture.e.busy&&voiceFixture.e.pauseT<=0));
  samples.push({mapId,kind,...fixture,dialogue});
 }
 const layout=await page.evaluate(async()=>{
  const {STREET_SCENES}=await import('/src/world/city-life.js'),{streetVoice}=await import('/src/data/street-voices.js'),{DialogueScene}=await import('/src/ui/dialogue.js');
  const seen=new Set(),rows=[];
  for(const [map,groups]of Object.entries(STREET_SCENES))for(const [,,kind]of groups)for(let member=0;member<4;member++){
   const voice=streetVoice(map,kind,member);
   for(const text of voice.lines||[]){if(seen.has(text))continue;seen.add(text);const d=new DialogueScene({start:'a',nodes:{a:{text}}});d._socialGreeted=true;d._buildPages({text});rows.push({text,lines:d.pages.map(p=>p.lines.length)});}
  }
  return rows;
 });
 check('all authored lines fit the five-line dialogue panel',layout.every(r=>r.lines.every(n=>n<=5)),layout.filter(r=>r.lines.some(n=>n>5)));
 samples.push({layoutCount:layout.length});
}catch(e){checks.push({name:'driver completed',ok:false,detail:String(e)});await shot('failure');console.error(e);}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,samples,errors},null,2));await run.close();if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
