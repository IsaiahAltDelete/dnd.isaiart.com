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
async function stage(mode){
 await page.evaluate(async mode=>{
  const {Game,Party,createCharacter}=SC;
  const {newGameState}=await import('/src/state.js');const {Encounter}=await import('/src/rules/combat.js');const {BattleScene}=await import('/src/ui/combatui.js');
  const {monsterArtFor}=await import('/src/render/spritedata_monsters.js');const {spriteSize}=await import('/src/render/sprites.js');const {SIZES}=await import('/src/constants.js');
  Game.state=newGameState('large-combat');Party.clear();
  for(const [name,classId] of [['Rowan',mode==='melee'?'fighter':'wizard'],['Ally','fighter']]){
   const c=createCharacter({name,speciesId:'human',classId,level:5,backgroundId:'soldier'});
   if(classId==='wizard'){c.spells.known=['burning-hands','shatter','lightning-bolt'];c.spells.prepared=[...c.spells.known];}Party.add(c);
  }
  const enc=new Encounter({party:Party.members.slice(),enemies:['ogre',mode==='adult'?'adult-green-dragon':'young-green-dragon'],seed:'large-combat'});enc.start();
  const party=enc.units.filter(u=>u.side==='party'),foes=enc.units.filter(u=>u.side==='foe');
  party[0].pos={x:7,y:8};party[1].pos={x:4,y:11};foes[0].pos={x:8,y:8};foes[1].pos={x:10,y:8};
  enc.turnIndex=enc.order.indexOf(party[0].uid);enc.beginTurn();Game.replace(new BattleScene(enc));
  const b=Game.top;b.beats=[];b.beat=null;b.phase='menu';b.banner=null;b.menuDirty=true;b._recenter();b._recomputeReach(enc.current);
  document.querySelector('#gate')?.classList.remove('show');
  // Independent bounds calculation follows drawActor/drawSprite's public art metadata.
  window.testBounds=u=>{const s=b._uiOf(u,true),a=monsterArtFor(u.monsterId,u.sprite),d=spriteSize(a.sprite),k=Math.max(1,Math.round(b.zoom*(d.h>=40?1:Math.min(2.2,SIZES[u.size]?.scale||1))))*(a.scale||1),x=b._sx(s.x),y=b._sy(s.y);return{x:x-d.w*k/2,y:y-d.h*k,w:d.w*k,h:d.h*k};};
 },mode);
 await page.waitForTimeout(900);
}
async function bodyPoint(id){return page.evaluate(async({id,scale})=>{
 const {monsterArtFor}=await import('/src/render/spritedata_monsters.js');const {getSprite}=await import('/src/render/sprites.js');
 const b=SC.Game.top,u=b.enc.units.find(u=>u.monsterId===id),r=testBounds(u),s=b._uiOf(u,true),a=monsterArtFor(id,u.sprite),img=getSprite(a.sprite,`${s.dir}-0`),d=img.getContext('2d').getImageData(0,0,img.width,img.height).data;
 let best=null;for(let y=1;y<img.height*.75;y++)for(let x=1;x<img.width-1;x++){if(!d[(y*img.width+x)*4+3])continue;const score=(x-img.width*.5)**2+(y-img.height*.5)**2;if(!best||score<best.score)best={x,y,score};}
 return{x:(r.x+(best.x+.5)*r.w/img.width)*scale,y:(r.y+(best.y+.5)*r.h/img.height)*scale,uid:u.uid};
},{id,scale});}
async function rail(id){const h=await page.evaluate(({id,scale})=>{const b=SC.Game.top,h=b._railHits.find(h=>h.u.monsterId===id);return{x:(h.x+h.w/2)*scale,y:(h.y+h.h/2)*scale};},{id,scale});await page.mouse.click(h.x,h.y);await page.waitForTimeout(800);}
async function enemyHandoff(label){
 const start=await page.evaluate(()=>SC.Game.top.enc.log.length);
 let sawEnemy=false;
 for(let i=0;i<6;i++){
  const s=await read();if(s.results)break;
  if(s.prompt)await key('KeyX');else {await menuRoot();await key('Digit5');}
  if((await read()).side==='foe')await snap(label+'-enemy-turn');
  await settle();
  sawEnemy=await page.evaluate(start=>{const b=SC.Game.top;return b.enc.log.slice(start).some(l=>l.kind==='turn'&&b.enc.byUid(l.unit)?.side==='foe');},start);
  const next=await read();if(sawEnemy&&!next.prompt)break;
 }
 const next=await read();events.push({handoff:label,sawEnemy,after:next});
 check(label+': enemy AI turn resolves before next party control',sawEnemy&&(next.results||next.phase==='menu'&&next.side==='party'),next);
 await snap(label+'-handoff');
}
try{
 await stage('melee');await snap('melee-start');
 const attack=await page.evaluate(()=>{const b=SC.Game.top;const find=rows=>{for(const r of rows){if(r.id?.startsWith('attack:')&&r.enabled)return r.id;const id=r.sub&&find(r.sub);if(id)return id;}};return find(b._currentRows());});
 await choose(attack);check('melee target excludes distant dragon',(await read()).targets.length===1);
 const selected=(await read()).target;await rail('young-green-dragon');check('out-of-reach portrait cannot become melee target',(await read()).target===selected&&(await read()).budget.attacksMade===0);
 await key('KeyX');check('melee cancel retains action',(await read()).budget.action===1);await choose(attack);
 const ogre=await bodyPoint('ogre');await page.mouse.move(ogre.x,ogre.y);
 const hit=await page.evaluate(()=>{const b=SC.Game.top,m=SC.Input.mouse,u=b.enc.units.find(u=>u.monsterId==='ogre'),t=b._screenToTile(m.x,m.y);return{mouse:{...m},field:b._mouseOnField(),hit:b._unitAtPoint?.(m.x,m.y)?.name,oldTileHit:b.enc.units.find(v=>v.pos.x===t.x&&v.pos.y===t.y)?.name||null,bounds:b._unitBounds?.(u),test:testBounds(u)};});events.push({pointer:ogre,hit});
 check('visible torso lies outside old ground-tile hitbox',hit.oldTileHit===null&&hit.hit==='Ogre');
 await page.mouse.down();await page.waitForTimeout(140);check('melee body press waits for release',(await read()).phase==='target');await page.mouse.up();await page.waitForTimeout(1800);
 let s=await read();check('clicking ogre torso commits melee attack',s.phase!=='target'&&s.budget.attacksMade===1,s);await snap('melee-body-click');
 if(process.argv.includes('--melee-only')){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,events,errors},null,2));if(checks.some(c=>!c.ok))process.exitCode=1;}
 else {
 if(s.phase==='target')await key('KeyX');
 else {
  await settle();await choose(attack);await key('KeyZ');await settle();s=await read();
  check('Extra Attack resolves as exactly second attack',s.budget.attacksMade===2&&s.budget.attacksLeft===0,s.budget);await snap('extra-attack');
  await enemyHandoff('melee');
 }
 // Separate visual-selection probe: two zooms, far edge, large sprite fully revealed.
 for(const monster of ['young-green-dragon','adult-green-dragon'])for(const zoom of [1,2]){
  await stage(monster.startsWith('adult')?'adult':'melee');if(zoom===2)await key('KeyM');
  await page.evaluate(()=>{const b=SC.Game.top;b.camManual=true;b.cam.x=b.camTo.x=80;b.cam.y=b.camTo.y=60;});
  await rail(monster);
  const r=await page.evaluate(id=>testBounds(SC.Game.top.enc.units.find(u=>u.monsterId===id)),monster);
  check(`${monster} zoom${zoom}: entire body revealed inside field`,r.x>=2&&r.x+r.w<=398&&r.y>=20&&r.y+r.h<=210,r);
  const before=(await read()).origin;await rail(monster);check(`${monster} zoom${zoom}: repeated selection keeps framing`,JSON.stringify(before)===JSON.stringify((await read()).origin));await snap(monster+'-zoom'+zoom);
 }
 for(const spell of ['burning-hands','shatter','lightning-bolt']){
  await stage('area');await choose('spell:'+spell);check(spell+': opens area preview',(await read()).phase==='target');
  const p=await page.evaluate(scale=>{const b=SC.Game.top;return{x:b._sx(10*16+8)*scale,y:b._sy(8*16+8)*scale};},scale);
  await page.mouse.move(p.x,p.y);await page.waitForTimeout(300);
  const preview=await page.evaluate(()=>{const b=SC.Game.top;return{victims:b.areaVictims.map(u=>u.uid),hp:Object.fromEntries(b.enc.units.map(u=>[u.uid,u.hp])),origin:b._origin(),budget:{...b._budget()}};});
  check(spell+': preview includes large monsters',preview.victims.length>=2,preview.victims);await snap(spell+'-preview');
  await page.mouse.move(p.x+1,p.y);await page.waitForTimeout(250);check(spell+': pointer aim keeps camera still',JSON.stringify(preview.origin)===JSON.stringify((await read()).origin));
  await page.mouse.down();await page.waitForTimeout(140);check(spell+': held press does not cast',(await read()).phase==='target');await page.mouse.up();
  await settle();s=await read();events.push({spell,preview,after:s});
  check(spell+': commits exactly once',s.phase==='menu'&&s.budget.spellsCast.length===1&&s.budget.spellsCast[0].id===spell,s.budget);
  const damaged=s.units.filter(u=>u.hp<preview.hp[u.uid]).map(u=>u.uid);
  check(spell+': damaged units match preview',damaged.length>0&&damaged.every(id=>preview.victims.includes(id))&&preview.victims.every(id=>damaged.includes(id)),{preview:preview.victims,damaged});
  await snap(spell+'-resolved');
  await enemyHandoff(spell);
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,events,errors},null,2));console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,total:checks.length,errors}));if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
 }
}catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,events,state:await read().catch(()=>null),errors},null,2));await snap('failure').catch(()=>{});console.error(e);process.exitCode=1;}
finally{await browser.close();server.close();}
