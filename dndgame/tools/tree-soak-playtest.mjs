import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const quick=process.argv.includes('--quick'),factor=quick?.03:1;
const out=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'output/tree-soak/final';
const run=await privatePlaytest(out),{page,errors}=run,cdp=await page.context().newCDPSession(page);
const report={method:'Controlled environment soak: step events and unsolicited standoffs suppressed; NPC updates and natural combat AI active. Capture/benchmark/GC pauses excluded from steady timing distributions.',quick,segments:[],checks:[],errors,started:new Date().toISOString()};
const check=(name,pass)=>report.checks.push({name,pass:!!pass});
const save=()=>fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
const segments=[['forest',90,'neverwinter-wood'],['town',60,'phandalin'],['ruins',60,'thundertree'],['overlap-grove',120,'grove'],['forest-return',60,'neverwinter-wood'],['combat-zoom1',90,1],['combat-zoom2',90,2],['secondary-grove',30,'grove']];
try {
 await page.evaluate(()=>{SC.newGame();const c=SC.Game.top;c.randomiseAll();c.setSpecies('human');c.setClass('fighter');c._autoFillPicks();c.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);
 report.visibility=await page.evaluate(async()=>(await import('/tools/tree-soak-probe.js')).visibilityProbe());
 for(const c of report.visibility.cases)check(c.count+' overlapping crowns preserve body contrast',c.min>=.60);
 check('Wide body overlap fades crown',report.visibility.wideBodyAlpha<.5);
 for(const [label,seconds,scene]of segments){
  if(label==='secondary-grove')await page.setViewportSize({width:1200,height:720});
  const display=label==='secondary-grove'?3:2,battle=typeof scene==='number';
  if(battle)await page.evaluate(async zoom=>(await import('/tools/tree-soak-fixture.js')).stageTreeBattle(zoom),scene);
  else {
   if(await page.evaluate(()=>SC.Game.top.id!=='overworld')){
    await page.evaluate(()=>{SC.newGame();const c=SC.Game.top;c.randomiseAll();c.setSpecies('human');c.setClass('fighter');c._autoFillPicks();c.finish();});
    await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);
   }
   await page.evaluate(async id=>{
    if(id==='grove')await(await import('/tools/tree-soak-fixture.js')).stageGrove();
    else (await import('/src/world/overworld.js')).travelTo(id);
    const s=SC.Game.top;s.encounterGrace=10000;s._runStepTriggers=()=>false;s._directorStep=()=>false;s._openStandoff=()=>false;s._weatherNow=()=> 'clear';s._applyWeather(true);s.banner=null;s.hud.toasts=[];
    for(const e of s.entities.list)if(e.kind==='monster')e.aggro=false;
    SC.Game.state.time=720;window.soakVisits={};
   },scene);
  }
  await page.waitForTimeout(300);
  if(!battle)assert.equal(await page.evaluate(()=>SC.Game.top.map.id),scene==='grove'?'tree-visibility-grove':scene);
  const start=await page.evaluate(async()=>(await import('/tools/tree-soak-probe.js')).startMetrics());
  const segment={label,seconds:seconds*factor,actions:0,positions:[],moves:0,bodyClickAttempts:0,railClicks:0,resolvedEncounters:0,aiActiveObservations:0,rounds:1};report.segments.push(segment);
  const until=Date.now()+seconds*factor*1000;let nextShot=0,iteration=0;
  while(Date.now()<until){
   if(battle){
    const state=await page.evaluate(()=>{const b=SC.Game.top;return {phase:b.phase,over:!!b.results,round:b.enc.round,side:b.enc.current?.side,budget:b._budget()};});
    segment.rounds=Math.max(segment.rounds,state.round||1);
    if(state.over){segment.resolvedEncounters++;await page.evaluate(async z=>(await import('/tools/tree-soak-fixture.js')).stageTreeBattle(z),scene);}
    else if(state.side!=='party'){segment.aiActiveObservations++;await page.waitForTimeout(650);}
    else if(state.phase==='menu') {
     if(iteration%4===0){
      const rail=await page.evaluate(scale=>{const b=SC.Game.top,h=b._railHits?.find(h=>h.u.side==='foe');return h?{x:(h.x+h.w/2)*scale,y:(h.y+h.h/2)*scale}:null;},display);
      if(rail){await page.mouse.click(rail.x,rail.y);await page.waitForTimeout(750);const origin=await page.evaluate(()=>SC.Game.top._origin());await page.mouse.click(rail.x,rail.y);await page.waitForTimeout(200);check(label+' repeated selection '+iteration,await page.evaluate(o=>JSON.stringify(o)===JSON.stringify(SC.Game.top._origin()),origin));segment.railClicks+=2;}
     }
     const point=await page.evaluate(async({scale,move})=>{
      const b=SC.Game.top,current=b.enc.current;if(move&&b._budget().movement>=5){for(const [key,node]of b.reach){if(node.cost!==5)continue;const [x,y]=key.split(',').map(Number),px=b._sx((x+.5)*16),py=b._sy((y+.7)*16);if(px>12&&px<388&&py>35&&py<195&&!b._unitAtPoint(px,py))return {x:px*scale,y:py*scale,kind:'move',from:{...current.pos}};}}
      const S=await import('/src/render/sprites.js');for(const u of b.enc.units.filter(u=>u.side==='foe'&&u.hp>0)){
       if(!b._quickAttackFor(current,u))continue;const r=b._unitBounds(u),st=b._uiOf(u,true),img=S.getSprite(r.art.sprite,st.dir+'-0'),data=img.getContext('2d').getImageData(0,0,img.width,img.height).data;
       for(let y=8;y<img.height-3;y++)for(let x=8;x<img.width-3;x++){if(!data[(y*img.width+x)*4+3])continue;const px=r.x+(x+.5)*r.scale,py=r.y+(y+.5)*r.scale;if(px>5&&px<395&&py>30&&py<200&&b._unitAtPoint(px,py)?.uid===u.uid)return {x:px*scale,y:py*scale,kind:'attack'};}
      }return null;
     },{scale:display,move:iteration%5===2});
     if(point){await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();await page.waitForTimeout(700);if(point.kind==='move')segment.moves+=await page.evaluate(p=>{const u=SC.Game.top.enc.current;return u?.pos&&(u.pos.x!==p.x||u.pos.y!==p.y)?1:0;},point.from);else segment.bodyClickAttempts++;}
     else {await page.keyboard.press('Digit5');await page.waitForTimeout(120);await page.keyboard.press('Digit5');await page.waitForTimeout(700);}
    }else {await page.keyboard.press('Escape');await page.waitForTimeout(300);}
   } else {
    const move=await page.evaluate(grove=>{
     const s=SC.Game.top,p=s.player;if(s.id!=='overworld')throw Error('Unexpected scene during world soak');
     const pos={x:p.x,y:p.y};let options=[];
     for(const [key,dx,dy]of [['ArrowRight',1,0],['ArrowLeft',-1,0],['ArrowDown',0,1],['ArrowUp',0,-1]]){
      const x=p.x+dx,y=p.y+dy;if(grove&&(y!==9||x<6||x>13))continue;
      if(!s.map.inBounds(x,y)||(s.map.flagAt(x,y)&3)||s.map.triggersAt?.(x,y)?.some(t=>['warp','battle','script','ledge'].includes(t.kind)))continue;
      options.push({key,score:soakVisits[x+','+y]||0});
     }
     soakVisits[p.x+','+p.y]=(soakVisits[p.x+','+p.y]||0)+1;options.sort((a,b)=>a.score-b.score);return {key:options[0]?.key,pos};
    },scene==='grove');
    segment.positions.push(move.pos);
    if(move.key){await page.keyboard.down(move.key);await page.waitForTimeout(180);await page.keyboard.up(move.key);await page.waitForTimeout(220);}
   }
   segment.actions++;iteration++;await page.waitForTimeout(350);
   if(Date.now()>nextShot){await page.evaluate(()=>{treeMetrics.active=false;treeMetrics.last=0;});await run.shot(label+'-'+String(Math.floor(iteration/10)).padStart(2,'0'));await page.evaluate(()=>{treeMetrics.active=true;treeMetrics.last=0;});nextShot=Date.now()+15000;save();console.log(label+': '+Math.max(0,Math.round((until-Date.now())/1000))+'s left');}
  }
  segment.metrics=await page.evaluate(async start=>(await import('/tools/tree-soak-probe.js')).endMetrics(start),start);
  segment.benchmark=await page.evaluate(async()=>(await import('/tools/tree-soak-probe.js')).benchmark());
  await cdp.send('HeapProfiler.collectGarbage');segment.retainedHeap=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  if(!battle){segment.uniquePositions=new Set(segment.positions.map(p=>p.x+','+p.y)).size;check(label+' traverses multiple positions',segment.uniquePositions>=(quick?1:4));}
  else if(!quick){check(label+' body click attempts',segment.bodyClickAttempts>0);check(label+' real movement',segment.moves>0);check(label+' AI activity or resolved encounter',segment.aiActiveObservations>0||segment.resolvedEncounters>0);}
  check(label+' active rendering continued',segment.metrics.draw.n>=(quick?5:100));
  await run.shot(label+'-end');save();console.log(label+' done '+JSON.stringify(segment.metrics));
 }
 report.drawErrors=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);check('No draw errors',report.drawErrors.length===0);check('No browser errors',errors.length===0);
 report.durationMs=report.segments.reduce((n,s)=>n+s.metrics.elapsedMs,0);if(!quick)check('At least ten minutes of normal-clock gameplay',report.durationMs>=600000);
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));save();assert.equal(report.checks.filter(c=>!c.pass).length,0);console.log('SOAK PASS '+report.checks.length+' checks');
}catch(e){report.failure=String(e);save();await run.shot('failure');throw e;}finally{await run.close();}
