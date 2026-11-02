import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/spell-animation/primary',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run,checks=[];
const check=(name,pass)=>{checks.push({name,pass:!!pass});};
const key=async k=>{await page.keyboard.press(k);await page.waitForTimeout(160);};
async function choose(id){
 for(let depth=0;depth<6;depth++){
  const s=await page.evaluate(id=>{const b=SC.Game.top,rows=b._currentRows();const has=r=>r.id===id||(r.sub||[]).some(has);return{index:b.menuPath.length?b.subIndex:b.menuIndex,target:rows.findIndex(has),n:rows.length,hit:rows.find(has)?.id};},id);
  assert(s.target>=0,id+' available');for(let n=0;n<(s.target-s.index+s.n)%s.n;n++)await key('ArrowRight');await key('KeyZ');if(s.hit===id)return;
 }
}
try{
 await page.evaluate(async()=>{await(await import('/tools/spell-animation-fixture.js')).stageSpellBattle();
  const {VFX}=await import('/src/render/vfx.js');window.castSeen=[];const cast=VFX.cast;VFX.cast=function(sp,o){castSeen.push(sp.id);return cast.call(this,sp,o);};
 });await page.waitForTimeout(650);
 // Choose Thorn Whip through the actual action menu and target controls.
 await choose('spell:thorn-whip');
 await run.shot('targeting');const aimCam=await page.evaluate(()=>({...SC.Game.top.camTo}));
 await key('KeyZ');
 await page.waitForFunction(()=>window.castSeen.includes('thorn-whip'),null,{timeout:20000});await run.shot('live-thorn-whip');
 await page.waitForFunction(()=>SC.Game.top.phase==='menu'&&!SC.Game.top.beats.length,null,{timeout:20000});
 check('Real melee spell reaches named VFX and returns control',await page.evaluate(()=>castSeen.includes('thorn-whip')&&SC.Game.top.enc.log.some(l=>l.text.includes('Thorn Whip'))));
 check('Targeting camera remains finite',Number.isFinite(aimCam.x)&&Number.isFinite(aimCam.y));
 // A bonus-action teleport follows the real melee spell, using normal input.
 while(await page.evaluate(()=>SC.Game.top.menuPath.length>0))await key('Escape');
 const before=await page.evaluate(()=>({...SC.Game.top.enc.current.pos}));
 await choose('spell:misty-step');
 const aim=await page.evaluate(()=>{const b=SC.Game.top,p=b.enc.current.pos;return{start:{...b.cursor},to:b.targets.tiles.find(t=>Math.abs(t.x-p.x)+Math.abs(t.y-p.y)===2)};});assert(aim.to,'Legal teleport destination');
 for(let n=0;n<Math.abs(aim.to.x-aim.start.x);n++)await key(aim.to.x>aim.start.x?'ArrowRight':'ArrowLeft');
 for(let n=0;n<Math.abs(aim.to.y-aim.start.y);n++)await key(aim.to.y>aim.start.y?'ArrowDown':'ArrowUp');await key('KeyZ');
 await page.waitForFunction(()=>castSeen.includes('misty-step')&&SC.Game.top.phase==='menu'&&!SC.Game.top.beats.length,null,{timeout:20000});
 check('Actual Misty Step moves the actor and returns control',await page.evaluate(before=>{const b=SC.Game.top,u=b.enc.current,s=b._uiOf(u);return(u.pos.x!==before.x||u.pos.y!==before.y)&&Math.abs(s.x-(u.pos.x*16+8))<1;},before));await run.shot('teleport-arrived');
 // Freeze only this disposable game for reproducible animation frames.
 await page.evaluate(()=>cancelAnimationFrame(SC.Game._raf));
 const ids=['sleep','hold-person','thorn-whip','acid-splash','dispel-magic','fireball','ray-of-frost','lightning-bolt','cure-wounds','mage-armor','misty-step'];
 for(const biome of ['grass','dungeon']){
 if(biome==='dungeon')await page.evaluate(async()=>{
  await(await import('/tools/ground-design-fixture.js')).stageGroundBattle('dungeon','spell-contrast');
  const b=SC.Game.top,h=b.enc.units.find(u=>u.side==='party'),foe=b.enc.units.find(u=>u.side==='foe');
  // Compact visual fixture so the impact remains in frame at both game zooms.
  outer:for(let dx=3;dx<=5;dx++)for(let dy=-1;dy<=1;dy++)if(b.enc._squareFor(foe,h.pos.x+dx,h.pos.y+dy).stop){foe.pos={x:h.pos.x+dx,y:h.pos.y+dy};break outer;}
  b.ui.delete(foe.uid);b._uiOf(foe,true);
 });
 for(const zoom of [1,2])for(const id of biome==='grass'?ids:['sleep','hold-person','acid-splash','fireball']){
  const frames=await page.evaluate(async({id,zoom})=>{
   const {VFX}=await import('/src/render/vfx.js'),{FX}=await import('/src/render/fx.js'),{SPELLS}=await import('/src/data/spells.js');
   const b=SC.Game.top;b.zoom=zoom;b.phase='anim';
   const h=b.enc.units.find(u=>u.side==='party'),foe=b.enc.units.find(u=>u.side==='foe'),from=b._spellAt(h),to=b._spellAt(foe);
   b._focusOn((from.x+to.x)/(2*zoom)+32/zoom,(from.y+to.y)/(2*zoom)-20/zoom,true);b.camDraw={...b.camTo};
   FX.clear();VFX.reseed('spell-art-'+id);let hits=0;
   const handle=b._castFX(SPELLS[id].vfx?.style,from,to,SPELLS[id].vfx?.color,{spell:SPELLS[id],radius:22*zoom,blocking:true,onHit:()=>hits++});
   const result=[];let now=0;
   for(const age of [.12,.3,.55,.85]){while(now<age){VFX.update(.01);now+=.01;}SC.Game._draw();result.push(SC.Stage.snapshot());}
   for(let n=0;n<200;n++)VFX.update(.05);
   return {images:result,complete:!handle.playing&&!VFX.busy()&&VFX.counts().vfxParticles===0,hits};
  },{id,zoom});
  check(biome+' '+id+' zoom'+zoom+' settles once and cleans up',frames.complete&&frames.hits===1);
  frames.images.forEach((data,i)=>fs.writeFileSync(`${out}/${biome}-${id}-z${zoom}-${i}.png`,Buffer.from(data.split(',')[1],'base64')));
 }
 }
 const extra=await page.evaluate(async()=>{
  const {VFX}=await import('/src/render/vfx.js'),{FX}=await import('/src/render/fx.js'),{SPELLS}=await import('/src/data/spells.js');
  FX.clear();FX.reducedMotion=true;
  const h=VFX.cast(SPELLS.sleep,{from:{x:80,y:100},to:{x:160,y:100},blocking:true});for(let n=0;n<160;n++){VFX.update(.02);if(n===20)SC.Game._draw();}const reduced=!h.playing&&!VFX.busy();FX.reducedMotion=false;
  const c=VFX.cast(SPELLS['hold-person'],{to:{x:160,y:100},blocking:true});FX.clear();return {reduced,skip:!c.playing&&!VFX.busy(),drawErrors:[...(SC.Game._drawFails||[])]};
 });check('Reduced motion completes',extra.reduced);check('Skip clears blocking',extra.skip);check('No browser or draw errors',!errors.length&&!extra.drawErrors.length);
 fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,...extra},null,2));fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 assert.equal(checks.filter(c=>!c.pass).length,0);console.log(checks.length+' animation checks passed');
}catch(e){await run.shot('failure');throw e;}finally{await run.close();}
