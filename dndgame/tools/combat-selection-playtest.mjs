// Interactive playtest driver: normal clock/input, isolated campaign and origin.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import {loadChromium} from './pwlocate.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]||'output/combat-selection/play');
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

const checks=[];
const check=(name,ok,detail)=>checks.push({name,ok,detail});
try {
 await page.evaluate(async()=>{
  const {Game,Party,createCharacter}=SC;
  const {newGameState}=await import('/src/state.js');
  const {Encounter}=await import('/src/rules/combat.js');
  const {BattleScene}=await import('/src/ui/combatui.js');
  Game.state=newGameState('selection-play');Party.clear();
  Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'fighter',backgroundId:'soldier'}));
  const enc=new Encounter({party:Party.members.slice(),enemies:['goblin','goblin','wolf'],seed:'shot'});enc.start();
  enc.turnIndex=enc.order.indexOf(enc.units.find(u=>u.side==='party').uid);enc.beginTurn();
  Game.replace(new BattleScene(enc));const b=Game.top;b.beats=[];b.beat=null;b.phase='menu';b.banner=null;b.menuDirty=true;b._recenter();
  document.querySelector('#gate')?.classList.remove('show');
 });
 await page.waitForTimeout(1200);
 const state=()=>page.evaluate(()=>{const b=SC.Game.top;return{origin:b._origin(),cam:{...b.cam},zoom:b.zoom,manual:b.camManual,inspect:b.inspect?.uid,scroll:[scrollX,scrollY]};});
 const delta=(a,b)=>Math.hypot(a.origin.x-b.origin.x,a.origin.y-b.origin.y);
 const hit=await page.evaluate(()=>{const b=SC.Game.top,h=b._railHits.find(h=>h.u.side==='foe');return{x:(h.x+h.w/2)*2,y:h.h,uid:h.u.uid};});
 const before=await state();await page.screenshot({path:path.join(out,'before-selection.png')});
 await page.mouse.click(hit.x,hit.y);await page.waitForTimeout(900);
 const after=await state();check('real portrait click preserves framing',delta(before,after)<=1,{before,after});
 check('real portrait click selects creature',after.inspect===hit.uid);
 await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.waitForTimeout(100);
 await page.mouse.move(hit.x+32,hit.y,{steps:8});await page.waitForTimeout(100);
 await page.mouse.move(400,180,{steps:8});await page.waitForTimeout(100);
 await page.mouse.move(450,180,{steps:8});await page.mouse.up();await page.waitForTimeout(400);
 const dragged=await state();check('portrait-to-field drag does not pan',delta(after,dragged)<=1,{after,dragged});
 check('browser document did not scroll',dragged.scroll.every(n=>n===0));
 await page.screenshot({path:path.join(out,'after-portrait-drag.png')});
 // A secondary-button-free ordinary field drag remains available.
 await page.mouse.move(400,180);await page.mouse.down();await page.waitForTimeout(100);
 await page.mouse.move(460,180,{steps:12});await page.waitForTimeout(100);await page.mouse.up();await page.waitForTimeout(400);
 const field=await state();check('real battlefield drag still moves camera',delta(dragged,field)>5,{dragged,field});
 // Stage a close view of the party, then click a distant creature's portrait.
 await page.evaluate(()=>{const b=SC.Game.top;b.inspect=null;b.inspectPinned=false;b.phase='menu';b.beats=[];b._setZoom(2);b._recenter();});
 await page.waitForTimeout(1200);
 const close=await state();await page.mouse.click(hit.x,hit.y);await page.waitForTimeout(1600);
 const reveal=await page.evaluate(uid=>{const b=SC.Game.top,u=b.enc.units.find(u=>u.uid===uid),s=b._uiOf(u,true);return{x:b._sx(s.x),y:b._sy(s.y-8),origin:b._origin(),zoom:b.zoom};},hit.uid);
 check('real close-zoom portrait brings target into view',reveal.x>=15&&reveal.x<=385&&reveal.y>=43&&reveal.y<=188,{close,reveal});
 await page.screenshot({path:path.join(out,'close-zoom-revealed.png')});
 await page.mouse.click(hit.x,hit.y);await page.waitForTimeout(700);
 check('repeat selection remains stable',delta({origin:reveal.origin},await state())<=1);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({checks,errors}));if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
} catch(e){console.error(e);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();server.close();}
