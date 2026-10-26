import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/performance/journey-before';
const run=await privatePlaytest(out),{page}=run;
try {
 await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.draft.name='Timing';b._autoFillPicks();b.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const result=await page.evaluate(async()=>{
  const s=SC.Game.top,begin=performance.now();s._doWarp({map:'stonehill-inn'});const warpStartMs=performance.now()-begin;
  const tr=SC.Game._trans,fn=tr.fn,start=performance.now(),draws=[];
  tr.fn=()=>{const t=performance.now();fn();draws.push({travelMs:performance.now()-t});};
  const draw=SC.Game._draw;SC.Game._draw=function(){const t=performance.now();draw.call(this);draws.push({p:tr.t/tr.dur,at:t-start,ms:performance.now()-t});};
  await new Promise(resolve=>{const check=()=>SC.Game.transitioning?requestAnimationFrame(check):resolve();requestAnimationFrame(check);});
  SC.Game._draw=draw;return {warpStartMs,wallMs:performance.now()-start,draws};
 });
 const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(out+'/profile.json',JSON.stringify(profile));fs.writeFileSync(out+'/report.json',JSON.stringify(result,null,2));console.log(result);
}finally{await run.close();}
