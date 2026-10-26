import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/performance/before',run=await privatePlaytest(out,2),{page,errors}=run;
const report={scenes:[],trips:[],errors};
try{
 await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.setSpecies('human');b.setClass('fighter');b.draft.name='Performance Tester';b._autoFillPicks();b.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld');
 await page.evaluate(()=>{
  window.perfSamples={draw:[],update:[],frame:[]};
  for(const [method,key]of [['_draw','draw'],['_update','update']]){const fn=SC.Game[method];SC.Game[method]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{perfSamples[key].push(performance.now()-t);}};}
  let last;const tick=t=>{if(last)perfSamples.frame.push(t-last);last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');
 const sample=async id=>{
  await page.waitForTimeout(600);await page.evaluate(()=>{for(const k in perfSamples)perfSamples[k]=[];});
  await cdp.send('Profiler.start');await page.keyboard.down('ArrowRight');await page.waitForTimeout(400);await page.keyboard.up('ArrowRight');await page.waitForTimeout(2600);
  const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(out+'/'+id+'.cpuprofile',JSON.stringify(profile));
  const counts=new Map();for(const n of profile.nodes){if(!n.hitCount)continue;const k=n.callFrame.functionName+' '+n.callFrame.url.replace(/^.*\/src\//,'src/')+':'+(n.callFrame.lineNumber+1);counts.set(k,(counts.get(k)||0)+n.hitCount);}
  const times=await page.evaluate(()=>{const result={};for(const [k,a]of Object.entries(perfSamples)){a.sort((a,b)=>a-b);result[k]={n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1),mean:a.reduce((s,n)=>s+n,0)/a.length};}return result;});
  report.scenes.push({id,times,hot:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,18)});await run.shot(id);
 };
 await sample('phandalin');
 for(const id of ['stonehill-inn','phandalin','waterdeep','bg-the-wide','bg-eastway','elfsong-tavern','waterdeep']){
  const trip=await page.evaluate(async id=>{
   const s=SC.Game.top,from=s.map.id,t=performance.now();let midpoint;
   const original=s.bindMap;s.bindMap=function(...args){const start=performance.now();const result=original.apply(this,args);midpoint={at:performance.now()-t,bindMs:performance.now()-start};return result;};
   s._doWarp({map:id});
   const tr=SC.Game._trans,fn=tr.fn;let travelMs;
   tr.fn=()=>{const start=performance.now();fn();travelMs=performance.now()-start;};
   await new Promise(resolve=>{const check=()=>SC.Game.transitioning?requestAnimationFrame(check):resolve();requestAnimationFrame(check);});
   s.bindMap=original;return {from,to:id,actual:s.map.id,wallMs:performance.now()-t,midpoint,travelMs};
  },id);report.trips.push(trip);
  if(!report.scenes.some(x=>x.id===id))await sample(id);
 }
 report.drawFailures=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await run.close();console.log(JSON.stringify(report));}
