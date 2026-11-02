// Normal-input animation evidence. The observer records live frames, never steps time.
import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/queue-all/combat-motion',run=await privatePlaytest(out),{page,errors}=run,checks=[],scenes=[];
async function key(k){await page.evaluate(k=>motion.events.push({kind:'key',key:k,time:performance.now()-motion.start}),k);await page.keyboard.press(k);await page.waitForTimeout(120);}
async function choose(id){
 for(let i=0;i<8;i++){
  const s=await page.evaluate(id=>{const b=SC.Game.top,rows=b._currentRows(),contains=r=>r.id===id||(r.sub||[]).some(contains);return{phase:b.phase,index:b.menuPath.length?b.subIndex:b.menuIndex,wanted:rows.findIndex(r=>r.enabled&&contains(r)),length:rows.length,hit:rows.find(r=>r.enabled&&contains(r))?.id};},id);
  if(s.phase!=='menu')return;
  if(s.wanted<0)throw Error('Missing action '+id);
  for(let n=0;n<(s.wanted-s.index+s.length)%s.length;n++)await key('ArrowRight');await key('KeyZ');if(s.hit===id)return;
 }
 throw Error('Action tree did not resolve '+id);
}
try{
 for(const mode of ['melee','spell']){
  const action=await page.evaluate(async mode=>{
   const {Game,Party,createCharacter,Stage}=SC,{newGameState}=await import('/src/state.js'),{Encounter}=await import('/src/rules/combat.js'),{BattleScene}=await import('/src/ui/combatui.js'),{VFX}=await import('/src/render/vfx.js');
   Game.state=newGameState('motion-'+mode);Party.clear();const ch=createCharacter({name:'Mara',speciesId:'human',classId:mode==='melee'?'fighter':'wizard',level:5,backgroundId:'soldier'});
   if(mode==='spell')ch.spells.cantrips=['fire-bolt'];Party.add(ch);const enc=new Encounter({party:Party.members.slice(),enemies:['ogre'],seed:'motion-'+mode});enc.start();
   const u=enc.units.find(u=>u.side==='party'),foe=enc.units.find(u=>u.side==='foe');u.pos={x:7,y:8};foe.pos={x:mode==='melee'?8:12,y:8};foe.hp=foe.maxHp=500;enc.turnIndex=enc.order.indexOf(u.uid);enc.beginTurn();Game.replace(new BattleScene(enc));
   const b=Game.top;b.beats=[];b.phase='menu';b.banner=null;b.autoEnd=false;b.menuDirty=true;b._recenter();b._recomputeReach(u);document.querySelector('#gate')?.classList.remove('show');
   window.motion={frames:[],events:[],start:performance.now()};
   // Observe legacy projectile arrival as well as the unit's impact reaction.
   if(!window.originalProjectile){window.originalProjectile=SC.FX.projectile;SC.FX.projectile=function(x,y,tx,ty,o){const hit=o?.onHit;return originalProjectile.call(this,x,y,tx,ty,{...o,onHit:(...args)=>{motion.events.push({kind:'projectile-arrival',time:performance.now()-motion.start});hit?.(...args);}});};}
   if(!window.originalClear){window.originalClear=SC.FX.clear;SC.FX.clear=function(...args){motion.events.push({kind:'clear',time:performance.now()-motion.start,stack:new Error().stack});return originalClear.apply(this,args);};}
   const cast=b._castFX;b._castFX=function(...args){motion.events.push({kind:'launch',time:performance.now()-motion.start,from:args[1],to:args[2],body:this._unitBounds(u)});return cast.apply(this,args);};
   const impact=b._impact;b._impact=function(...args){motion.events.push({kind:'impact',time:performance.now()-motion.start});return impact.apply(this,args);};
   window.motionTimer=setInterval(()=>{const s=b._uiOf(u),t=b._uiOf(foe);if(motion.frames.length<60&&(s?.swing||s?.cast||s?.lunge||t?.recoil||VFX.busy()||SC.FX.busy()))motion.frames.push({time:performance.now()-motion.start,pose:s?.cast?'cast':s?.swing?'attack':s?.lunge?'lunge':'impact',url:Stage.snapshot()});},50);
   const find=rows=>{for(const r of rows){if(r.enabled&&r.id?.startsWith('attack:'))return r.id;const found=r.sub&&find(r.sub);if(found)return found;}};
   return mode==='spell'?'spell:fire-bolt':find(b._currentRows());
  },mode);
  await page.waitForTimeout(800);await choose(action);
  if(await page.evaluate(()=>SC.Game.top.phase==='target'))await key('KeyZ');
  await page.waitForFunction(()=>{const b=SC.Game.top;return b.phase==='menu'&&!b.beats.length;},null,{timeout:45000});
  await page.waitForTimeout(1500);
  const result=await page.evaluate(()=>{clearInterval(motionTimer);return motion;});
  checks.push({name:mode+' has live animation frames',ok:result.frames.length>=3,count:result.frames.length});
  if(mode==='spell')checks.push({name:'spell projectile completes without skipping animation',ok:result.events.some(e=>e.kind==='projectile-arrival')&&!result.events.some(e=>e.kind==='clear'&&e.stack.includes('_skipBeat'))});
  for(const [i,f]of result.frames.entries()){f.image=mode+'-'+String(i).padStart(2,'0')+'.png';fs.writeFileSync(out+'/'+f.image,Buffer.from(f.url.split(',')[1],'base64'));delete f.url;}
  scenes.push({mode,...result});
 }
 fs.writeFileSync(out+'/index.html','<!doctype html><title>Live combat motion frames</title><style>body{background:#111;color:#eee;font:16px system-ui}section{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;image-rendering:pixelated}figure{margin:0}</style>'+scenes.map(s=>'<h1>'+s.mode+'</h1><section>'+s.frames.map(f=>'<figure><img src="'+f.image+'"><figcaption>'+f.pose+' '+Math.round(f.time)+'ms</figcaption></figure>').join('')+'</section>').join(''));
}catch(e){checks.push({name:'driver completed',ok:false,detail:String(e)});}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,scenes,errors},null,2));await run.close();if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
