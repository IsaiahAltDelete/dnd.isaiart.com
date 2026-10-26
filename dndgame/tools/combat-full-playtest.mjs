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
const context=await browser.newContext({viewport:{width:800,height:480}});
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
  const {Game,Party,createCharacter}=SC;
  const {newGameState}=await import('/src/state.js');const {Encounter}=await import('/src/rules/combat.js');const {BattleScene}=await import('/src/ui/combatui.js');
  Game.state=newGameState('combat-full');Party.clear();
  for(const name of ['Mara','Iris','Oren']){const c=createCharacter({name,speciesId:'human',classId:'wizard',level:5,backgroundId:'soldier'});c.spells.known=['magic-missile','burning-hands'];c.spells.prepared=['magic-missile','burning-hands'];c.spells.cantrips=['fire-bolt'];Party.add(c);}
  const enc=new Encounter({party:Party.members.slice(),enemies:['orc','orc','orc'],seed:'combat-full'});enc.start();
  enc.units.filter(u=>u.side==='party').forEach((u,i)=>u.pos={x:4,y:5+i*2});enc.units.filter(u=>u.side==='foe').forEach((u,i)=>u.pos={x:9,y:5+i*2});
  enc.turnIndex=enc.order.indexOf(enc.units.find(u=>u.side==='party').uid);enc.beginTurn();Game.replace(new BattleScene(enc));
  const b=Game.top;b.beats=[];b.beat=null;b.phase='menu';b.banner=null;b.menuDirty=true;b._recenter();b._recomputeReach(enc.current);Game.state.time=720;
  document.querySelector('#gate')?.classList.remove('show');
 });
 await page.waitForTimeout(1200);await snap('party-start');
 // Inspect a different party portrait without switching the actual turn.
 const first=await read();const ally=await page.evaluate(()=>{const b=SC.Game.top,h=b._railHits.find(h=>h.u.side==='party'&&h.u.uid!==b.enc.currentUid);return{x:(h.x+h.w/2)*2,y:h.h};});
 await page.mouse.click(ally.x,ally.y);await page.waitForTimeout(600);const inspected=await read();check('ally portrait inspection preserves acting character',first.uid===inspected.uid);check('ally portrait inspection keeps overview stable',JSON.stringify(first.origin)===JSON.stringify(inspected.origin));
 // Normal movement selection, keyboard destination, confirm and cancel another preview.
 await choose('MOVE');await key('ArrowRight');await key('KeyZ');await settle();const moved=await read();check('movement commits and returns to menu',moved.units.find(u=>u.uid===first.uid).pos.x===5);await snap('movement-complete');await menuRoot();
 await choose('spell:magic-missile');let target=await read();check('spell opens creature targeting',target.phase==='target'&&target.targets.length===3);await snap('creature-target');
 await key('ArrowRight');let cycled=await read();check('keyboard cycles legal targets',cycled.target!==target.target);await page.waitForTimeout(700);
 // Zoom via normal M key; then use wheel to pan about the pointer while aiming.
 await key('KeyM');await page.mouse.move(440,250);await page.mouse.wheel(0,120);await page.waitForTimeout(700);const manual=await read();await page.waitForTimeout(500);const idle=await read();check('target idle preserves chosen camera',Math.hypot(manual.origin.x-idle.origin.x,manual.origin.y-idle.origin.y)<=1,{manual:manual.origin,idle:idle.origin});
 const rail=await page.evaluate(()=>{const b=SC.Game.top,u=b.targets.units.find(u=>u.uid!==b.targets.units[b.targetIndex].uid),h=b._railHits.find(h=>h.u.uid===u.uid);return{x:(h.x+h.w/2)*2,y:h.h,uid:u.uid};});await page.mouse.click(rail.x,rail.y);await page.waitForTimeout(400);check('portrait changes spell target without casting',(await read()).target===rail.uid&&(await read()).phase==='target');
 await key('KeyX');await menuRoot();check('cancel targeting retains action',(await read()).budget.action>0);
 await choose('spell:burning-hands');check('area targeting opens',(await read()).phase==='target');
 await page.mouse.move(500,260);await page.waitForTimeout(700);const area=await read();for(let i=0;i<6;i++){await page.mouse.move(500+i%2,260);await page.waitForTimeout(80);}const jitter=await read();check('area pointer jitter does not move battlefield',Math.hypot(area.origin.x-jitter.origin.x,area.origin.y-jitter.origin.y)<=1,{area:area.origin,jitter:jitter.origin});await snap('area-preview');
 const preDrag=await read();await page.mouse.move(440,240);await page.mouse.down();await page.waitForTimeout(150);
 check('aim press does not prematurely cast',(await read()).phase==='target');
 await page.mouse.move(500,240,{steps:12});await page.waitForTimeout(100);await page.mouse.up();await page.waitForTimeout(500);
 const postDrag=await read();check('aim drag pans without casting',postDrag.phase==='target'&&postDrag.budget.action===preDrag.budget.action&&Math.hypot(preDrag.origin.x-postDrag.origin.x,preDrag.origin.y-postDrag.origin.y)>5,{preDrag:preDrag.origin,postDrag:postDrag.origin});
 await snap('target-drag');await key('KeyX');await menuRoot();
 // Finish the encounter through the action menu, target confirm and End Turn.
 const turns=new Set();let attempts=0;
 while(attempts++<45){
  await settle();let s=await read();events.push(s);
  if(s.results)break;
  if(s.prompt){await key('KeyX');continue;}
  turns.add(s.current);await menuRoot();
  if(s.budget.action>0){
   await choose('spell:magic-missile');const aiming=await read();if(aiming.phase!=='target')throw Error('Expected target phase');
   if(attempts===1){
    const hit=await page.evaluate(()=>{const b=SC.Game.top,u=b.targets.units[b.targetIndex],s=b._uiOf(u,true);return{x:b._sx(s.x)*2,y:b._sy(s.y-8)*2};});
    await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.waitForTimeout(150);
    check('ordinary target press waits for release',(await read()).phase==='target');
    await page.mouse.up();
   }else await key('KeyZ');
   await settle();await snap('resolved-'+attempts);
   const resolved=await read();check('cast '+attempts+' resolves without stuck targeting',resolved.results||resolved.phase==='menu');if(resolved.results)break;
  }
  await menuRoot();await key('Digit5');
 }
 const final=await read();check('all three characters received playable turns',turns.size===3,[...turns]);check('encounter reached victory results',final.results&&final.result==='victory',final);await snap('results');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,events,final,errors},null,2));console.log(JSON.stringify({checks:checks.map(c=>({name:c.name,ok:c.ok})),turns:[...turns],result:final.result,errors}));
 if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
}catch(e){const state=await read().catch(()=>null);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,events,state,errors},null,2));await snap('failure').catch(()=>{});console.error(e);process.exitCode=1;}
finally{await browser.close();server.close();}
