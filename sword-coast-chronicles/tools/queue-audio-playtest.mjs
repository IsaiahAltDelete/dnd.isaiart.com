// Live routing/output check; measurements cannot judge timbre or listening comfort.
import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/queue-all/audio-live',run=await privatePlaytest(out),{page,errors,shot}=run,checks=[],samples=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify({name,ok:!!ok}));};
try{
 await page.addInitScript(()=>{
  const original=AudioNode.prototype.connect;window.audioTaps=[];
  AudioNode.prototype.connect=function(target,...args){
   if(target===this.context.destination){const tap=this.context.createAnalyser();tap.fftSize=2048;window.audioTaps.push(tap);original.call(this,tap,...args);return original.call(tap,target);}
   return original.call(this,target,...args);
  };
 });
 await page.reload();await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');
 await page.evaluate(async()=>{
  const {Game,Party,createCharacter}=SC,{Audio}=await import('/src/core/audio.js'),{newGameState}=await import('/src/state.js'),{OverworldScene,travelTo}=await import('/src/world/overworld.js');
  window.audioAPI=Audio;window.audioCalls=[];
  for(const name of ['music','ambience']){const original=Audio[name];Audio[name]=function(...args){audioCalls.push({name,args,time:performance.now()});return original.apply(this,args);};}
  Audio.init();Game.state=newGameState('audio-play');Game.state.time=720;Party.clear();Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'fighter',level:8,backgroundId:'soldier'}));Game.replace(new OverworldScene());travelTo('waterdeep',9,22);
 });
 await page.waitForFunction(()=>SC.Game.top.map?.id==='waterdeep'&&!SC.Game.transitioning);
 const sample=async label=>{
  await page.waitForTimeout(2200);
  const data=await page.evaluate(async()=>{
   let peak=0,energy=0,n=0,bad=0;
   for(let i=0;i<10;i++){for(const tap of audioTaps){const a=new Float32Array(tap.fftSize);tap.getFloatTimeDomainData(a);for(const x of a){if(!Number.isFinite(x))bad++;else{peak=Math.max(peak,Math.abs(x));energy+=x*x;n++;}}}await new Promise(r=>setTimeout(r,100));}
   return{playing:audioAPI.nowPlaying,ready:audioAPI.ready,peak,rms:Math.sqrt(energy/Math.max(n,1)),bad,taps:audioTaps.length};
  });samples.push({label,...data});check(label+' produces finite live audio',data.ready&&data.peak>0&&data.peak<1&&data.bad===0,data);await shot(label);return data;
 };
 const city=await sample('city');check('city scene requests city context',city.playing.context==='city');
 await page.evaluate(()=>{SC.Game.state.weather='rain';SC.Game.state.weatherTimer=9999;});
 await sample('rain');check('outdoor rain reaches ambience engine',await page.evaluate(()=>audioCalls.some(c=>c.name==='ambience'&&c.args[0]==='rain')));
 for(const [foe,expected]of [['goblin','battle'],['venomfang','dragon']]){
  await page.evaluate(foe=>SC.Game.top._pushBattle([foe],{seed:'audio-'+foe}),foe);
  await page.waitForFunction(()=>SC.Game.top.id==='battle');const battle=await sample(expected);
  check(expected+' keeps intended combat context',battle.playing.context===expected,battle.playing);
  // Fixture outcome: use the normal result callback and keyboard dismissal.
  await page.evaluate(()=>{const b=SC.Game.top;b.enc.forceEnd('fled');});
  await page.waitForFunction(()=>!!SC.Game.top.results);await page.waitForTimeout(1000);await page.keyboard.press('KeyZ');await page.waitForFunction(()=>SC.Game.top.id==='overworld');
  const back=await sample(expected+'-return');check(expected+' restores city music',back.playing.context===city.playing.context,back.playing);
 }
 const calls=await page.evaluate(()=>audioCalls);fs.writeFileSync(out+'/calls.json',JSON.stringify(calls,null,2));
}catch(e){checks.push({name:'driver completed',ok:false,detail:String(e)});await shot('failure');console.error(e);}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,samples,errors,notAssessed:'Human listening quality and ambience balance'},null,2));await run.close();if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
