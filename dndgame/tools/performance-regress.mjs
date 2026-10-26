import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/performance/checks',run=await privatePlaytest(out),{page,errors}=run;
try {
 const checks=await page.evaluate(async()=>{
  const G=SC.Game,stack=G.scenes,results=[];
  cancelAnimationFrame(G._raf);
  G._trans=null;
  const check=(name,ok)=>{results.push({name,pass:!!ok});};
  let paints=0,arrivals=0,simulationDt;
  G.scenes=[{id:'timing-fixture',draw(c){paints++;c.fillStyle=arrivals?'#356e51':'#593b67';c.fillRect(0,0,400,240);},update(dt){simulationDt=dt;}}];
  const info={from:'Phandalin',to:'Stonehill Inn',type:'interior',timber:true,line:'Firelight, pipe smoke, and news from the Triboar Trail.',day:1,time:720};
  G.transition('journey',()=>arrivals++,{dur:1.35,journey:info});
  G._update(.05,2);
  check('A stalled first frame waits for cover before changing maps',arrivals===0&&G._trans.t===.675);
  G._draw();
  check('Opaque card skips invisible old-world rendering',paints===0&&G._trans.coverPainted);
  G._update(.05,2);G._draw();
  check('Arrival callback fires once, with the destination rendered under cover',arrivals===1&&paints===1&&G._trans.destinationPainted);
  G._update(.05,.1);G._draw();
  check('Opaque hold reuses card and skips warmed destination',paints===1);
  G._update(.05,2);G._draw();
  check('Loading screen finishes by elapsed time after a stall',!G.transitioning&&arrivals===1&&paints===2);
  check('Scene movement receives the safe simulation delta',simulationDt===.05);
  G.transition('journey',()=>arrivals++,{dur:1.35,journey:{...info,to:'Waterdeep',type:'town'}});
  let frames=0;while(G.transitioning&&frames++<100){G._update(1/60,1/60);G._draw();}
  check('Normal 60Hz transition ends in its intended duration',frames>=80&&frames<=83&&arrivals===2);
  G.transition('fade',()=>arrivals++);
  G._update(.05,10);check('Other transition types retain their existing timing',G.transitioning&&arrivals===2);
  while(G.transitioning){G._update(.05);G._draw();}
  check('Legacy fade callback still fires once',arrivals===3);
  // Sprite finishing should use already-built pixels, without GPU readback.
  const S=await import('/src/render/sprites.js');
  S.defineSprite('perf-finish-probe',{w:3,h:3,palette:{K:'#120c0a',s:'#e0a878'},finish:'K',frames:{idle:['KKK','KsK','KKK']}});
  const original=CanvasRenderingContext2D.prototype.getImageData;let reads=0;
  CanvasRenderingContext2D.prototype.getImageData=function(...a){reads++;return original.apply(this,a);};
  let sprite;
  try{sprite=S.getSprite('perf-finish-probe','idle');}finally{CanvasRenderingContext2D.prototype.getImageData=original;}
  check('New finished sprite performs zero canvas readbacks',reads===0);
  check('Sprite working surface uses CPU pixel storage',sprite.getContext('2d').getContextAttributes().willReadFrequently);
  const expected=document.createElement('canvas');expected.width=expected.height=3;
  const c=expected.getContext('2d',{willReadFrequently:true});c.fillStyle='#120c0a';c.fillRect(0,0,3,3);c.fillStyle='#e0a878';c.fillRect(1,1,1,1);S.finishSprite(expected,'#120c0a');
  check('Direct pixel finishing exactly matches the former readback result',String(c.getImageData(0,0,3,3).data)===String(sprite.getContext('2d').getImageData(0,0,3,3).data));
  check('Sprite cache returns the same completed frame',S.getSprite('perf-finish-probe','idle')===sprite);
  // Leave an actual journey card on screen for visual inspection.
  G.transition('journey',()=>{}, {journey:info});G._trans.t=G._trans.dur*.5;G._draw();
  window.performanceTestRestore=()=>{G._trans=null;G.scenes=stack;G._last=performance.now();G._raf=requestAnimationFrame(t=>G._tick(t));};
  return results;
 });
 await run.shot('journey-card');
 const failures=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);
 const report={checks,errors,drawFailures:failures};fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
 assert.equal(errors.length,0);assert.equal(failures.length,0);assert.equal(checks.filter(c=>!c.pass).length,0);console.log(`${checks.length} performance regressions passed`);
} finally {await run.close();}
