// Interactive playtest driver: normal clock/input, isolated campaign and origin.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import {loadChromium} from './pwlocate.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]||'output/combat-full/play');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png'}[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await(await loadChromium()).launch({headless:true,channel:'msedge'});
const scale=Number(process.argv[3]||2);
const context=await browser.newContext({viewport:{width:400*scale,height:240*scale}});
const page=await context.newPage(),errors=[],history=[];
const cdp=await context.newCDPSession(page);
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.SC);


const checks=[],events=[];let shots=0;
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(JSON.stringify({name,ok}));};
const snap=async name=>{await page.screenshot({path:path.join(out,String(++shots).padStart(2,'0')+'-'+name+'.png')});};
const read=()=>page.evaluate(()=>{const b=SC.Game.top;return{phase:b.phase,current:b.enc?.current?.name,uid:b.enc?.currentUid,side:b.enc?.current?.side,origin:b._origin?.(),cam:{...b.cam},to:{...b.camTo},manual:b.camManual,zoom:b.zoom,round:b.enc?.round,result:b.enc?.state,results:!!b.results,prompt:!!b.prompt,budget:b._budget?.(),path:b.menuPath,targets:b.targets?.units?.map(u=>u.uid),target:b.targets?.units?.[b.targetIndex]?.uid,cursor:b.cursor,units:b.enc?.units.map(u=>({name:u.name,uid:u.uid,side:u.side,hp:u.hp,pos:u.pos})),log:b.enc?.log?.slice(-4)};});
const key=async k=>{await page.keyboard.press(k);await page.waitForTimeout(180);};
const settle=async()=>{await page.waitForFunction(()=>{const b=SC.Game.top;return b.results||b.prompt||(b.phase==='menu'&&!b.beats.length&&b.enc.current.side==='party');},null,{timeout:60000});};
async function choose(id){
 for(let depth=0;depth<8;depth++){
  const selection=await page.evaluate(id=>{const b=SC.Game.top,rows=b._currentRows();const matches=r=>r.id===id||(id==='MOVE'&&r.move);const contains=r=>matches(r)||(r.sub||[]).some(contains);return{phase:b.phase,index:b.menuPath.length?b.subIndex:b.menuIndex,wanted:rows.findIndex(r=>r.enabled&&contains(r)),rows:rows.map(r=>({id:r.id,enabled:r.enabled})),hit:rows.find(r=>r.enabled&&contains(r))?.id};},id);
  if(selection.phase!=='menu')return;
  if(selection.wanted<0)throw Error('No action '+id+': '+JSON.stringify(selection));
  for(let n=0;n<(selection.wanted-selection.index+selection.rows.length)%selection.rows.length;n++)await key('ArrowRight');
  await key('KeyZ');
  if(selection.hit===id||id==='MOVE'&&selection.hit==='move')return;
 }
 throw Error('Action tree did not resolve '+id);
}
async function menuRoot(){for(let i=0;i<8;i++){const s=await read();if(s.phase==='menu'&&!s.path.length)return;await key('KeyX');}}
try{
 await page.evaluate(async()=>{
  const {Game,Party,createCharacter}=SC;const {newGameState}=await import('/src/state.js');const {Encounter}=await import('/src/rules/combat.js');const {BattleScene}=await import('/src/ui/combatui.js');
  Game.state=newGameState('recovery');Party.clear();
  const healer=createCharacter({name:'Mercy',speciesId:'human',classId:'cleric',level:5,backgroundId:'acolyte'});
  healer.spells.known=['healing-word','cure-wounds','bless'];healer.spells.prepared=[...healer.spells.known];Party.add(healer);
  Party.add(createCharacter({name:'Fallen',speciesId:'human',classId:'fighter',level:5,backgroundId:'soldier'}));
  const enc=new Encounter({party:Party.members.slice(),enemies:['ogre'],seed:'recovery'});enc.start();
  const heroes=enc.units.filter(u=>u.side==='party');heroes[0].pos={x:6,y:8};heroes[1].pos={x:9,y:8};heroes[1].hp=0;
  enc.units.find(u=>u.side==='foe').pos={x:15,y:8};enc.turnIndex=enc.order.indexOf(heroes[0].uid);enc.beginTurn();
  Game.replace(new BattleScene(enc));const b=Game.top;b.beats=[];b.beat=null;b.phase='menu';b.banner=null;b._recomputeReach(enc.current);b._recenter();document.querySelector('#gate')?.classList.remove('show');
 });
 await page.waitForTimeout(1200);await snap('downed-start');
 const probes=await page.evaluate(()=>{
  const b=SC.Game.top,u=b.enc.units.find(u=>u.name==='Fallen'),s=b._uiOf(u,true),out=[];
  for(const z of [1,2])for(const t of [.4,.8,1]){
   b.zoom=z;s.topple=t;const x=b._sx(s.x),y=b._sy(s.y),a=-(t<.8?(1-(1-t/.8)**3)*1.08:1.08-.08*((t-.8)/.2))*Math.PI/2;
   // Probe an interior body point with independently calculated feet-pivot transform.
   const dx=0,dy=-18*z,px=x+dx*Math.cos(a)-dy*Math.sin(a),py=y+dx*Math.sin(a)+dy*Math.cos(a);
   out.push({name:`zoom${z} topple${t}: horizontal body selectable`,ok:b._unitAtPoint(px,py)?.uid===u.uid});
   if(t===1)out.push({name:`zoom${z}: former upright head does not intercept`,ok:b._unitAtPoint(x,y-20*z)?.uid!==u.uid});
  }
  b.zoom=1;s.topple=1;return out;
 });probes.forEach(p=>check(p.name,p.ok));
 await choose('spell:healing-word');check('healing spell offers downed ally',(await read()).targets.includes((await read()).units.find(u=>u.name==='Fallen').uid));
 const hit=await page.evaluate(scale=>{const b=SC.Game.top,u=b.enc.units.find(u=>u.name==='Fallen'),s=b._uiOf(u,true);return{x:(b._sx(s.x)-18)*scale,y:b._sy(s.y)*scale};},scale);
 await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.waitForTimeout(150);check('healing waits for mouse release',(await read()).phase==='target');await page.mouse.up();await settle();await page.waitForTimeout(700);
 const healed=await read();check('body click revives ally',healed.units.find(u=>u.name==='Fallen').hp>0,healed);
 check('healing spends one bonus action and one cast',healed.budget.bonus===0&&healed.budget.action===1&&healed.budget.spellsCast.length===1,healed.budget);
 check('revived body returns upright',await page.evaluate(()=>SC.Game.top._uiOf(SC.Game.top.enc.units.find(u=>u.name==='Fallen')).topple===0));await snap('revived');
 const stable=(await read()).origin;await page.waitForTimeout(600);check('camera settles after revival',JSON.stringify(stable)===JSON.stringify((await read()).origin));
 await page.evaluate(()=>{
  const b=SC.Game.top,u=b.enc.units.find(u=>u.name==='Mercy'),foe=b.enc.units.find(u=>u.side==='foe');
  b.enc.turnIndex=b.enc.order.indexOf(u.uid);b.enc.beginTurn();u.pos={x:7,y:8};foe.pos={x:8,y:8};
  u.hp=100;u.maxHp=100;foe.actions.find(a=>a.id==='greatclub').atkBonus=30;b.ui.clear();b._uiOf(u,true);b._uiOf(foe,true);b.beats=[];b.beat=null;b.phase='menu';b.menuPath=[];b.menuIndex=0;b.menuDirty=true;b._recomputeReach(u);b._recenter();b.autoEnd=false;
 });await page.waitForTimeout(500);
 await menuRoot();await choose('spell:bless');await key('KeyZ');await settle();
 check('Bless starts concentration through normal targeting',await page.evaluate(()=>!!SC.Game.top.enc.units.find(u=>u.name==='Mercy').concentration));
 await page.evaluate(()=>{const b=SC.Game.top,original=b._pushConcentrationBeats;b.testConcentration=[];b._pushConcentrationBeats=function(c){this.testConcentration.push(c);return original.call(this,c);};});
 await menuRoot();await choose('MOVE');
 const destination=await page.evaluate(scale=>{const b=SC.Game.top,p=b._tileScreen(4,8);return{x:(p.x+8)*scale,y:(p.y+8)*scale};},scale);
 await page.mouse.click(destination.x,destination.y);await settle();await snap('opportunity-resolved');
 const interruption=await read();
 const interruptionLog=await page.evaluate(()=>SC.Game.top.enc.log);
 fs.writeFileSync(path.join(out,'interruption.json'),JSON.stringify({interruption,interruptionLog},null,2));
 check('walking out of reach resolves enemy opportunity attack',await page.evaluate(()=>SC.Game.top.enc.units.find(u=>u.side==='foe')._reactionUsed));
 check('movement and concentration interruption preserve spent action',interruption.budget.action===0&&interruption.budget.movement<interruption.budget.moveMax,interruption.budget);
 const concentration=await page.evaluate(()=>SC.Game.top.testConcentration);
 check('damage prompts a concentration save in the replay',concentration.some(c=>c.spellId==='bless'&&c.roll&&c.dc>=10),concentration);
 const still=(await read()).origin;await page.waitForTimeout(700);check('camera settles after opportunity replay',JSON.stringify(still)===JSON.stringify((await read()).origin));
 await page.keyboard.down('ShiftLeft');
 // A new fixture gives the UI a real retreat contest without risking a campaign.
 await page.evaluate(()=>{const b=SC.Game.top,u=b.enc.units.find(u=>u.name==='Mercy');b.enc.round++;b.enc.turnIndex=b.enc.order.indexOf(u.uid);b.enc.beginTurn();b.phase='menu';b.menuPath=[];b.menuIndex=0;b.menuDirty=true;b.beats=[];b.beat=null;});
 let escaped=false;
 for(let attempt=0;attempt<8;attempt++){
  await menuRoot();await choose('@flee');await settle();const s=await read();
  if(s.results){escaped=s.result==='fled';break;}
  check('failed retreat spends action '+attempt,s.budget.action===0);
  await key('Digit5');await key('Digit5');await settle();
 }
 await page.keyboard.up('ShiftLeft');check('normal flee menu reaches escape result',escaped);await snap('retreat-result');
 await page.waitForTimeout(900);await key('KeyZ');check('escape returns out of battle',await page.evaluate(()=>SC.Game.top?.id!=='battle'));
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,healed,errors},null,2));if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
}catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,state:await read().catch(()=>null),errors},null,2));await snap('failure').catch(()=>{});console.error(e);process.exitCode=1;}
finally{await browser.close();server.close();}
