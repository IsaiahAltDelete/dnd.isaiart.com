import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/queue-all/songbook',run=await privatePlaytest(out,3),{page,errors,shot}=run,checks=[];
const check=(name,ok)=>checks.push({name,ok:!!ok});
try{
 const base=new URL(page.url()).origin;
 await page.goto(base+'/output/queue-all/music/index.html');
 check('57 tracks have local playable files',await page.locator('audio').count()===57);
 await shot('catalogue');await page.locator('#find').fill('dragon');
 check('search filters to dragon music',await page.locator('article:visible').count()===3);
 await shot('dragon-search');
 const playback=await page.evaluate(async()=>{
  const audios=[...document.querySelectorAll('article:not([hidden]) audio')];
  await audios[0].play();await new Promise(r=>setTimeout(r,250));
  const started=audios[0].currentTime>0;await audios[1].play();await new Promise(r=>setTimeout(r,250));
  return {started,previousPaused:audios[0].paused,secondPlaying:!audios[1].paused,duration:audios[1].duration};
 });check('WAV playback starts',playback.started&&playback.duration>0);check('new playback pauses previous track',playback.previousPaused&&playback.secondPlaying);
 await page.locator('#find').fill('lute');
 check('lute search includes the town lute part',await page.locator('article[data-id="town"]').isVisible());
 check('filtering out active track pauses playback',await page.evaluate(()=>[...document.querySelectorAll('article[hidden] audio')].every(a=>a.paused)));
 await shot('lute-search');await page.locator('#find').fill('cornett');
 check('cornett search includes city and dragon parts',await page.locator('article[data-id="city"]').isVisible()&&await page.locator('article[data-id="dragon"]').isVisible());await shot('cornett-search');
}catch(e){checks.push({name:'driver completed',ok:false,detail:String(e)});await shot('failure');}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));await run.close();if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
