import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/scenery/review1',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page}=run,checks=[],samples=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(JSON.stringify(checks.at(-1)));};
try{
 for(const id of ['redbrand-hideout-3','redbrand-hideout-5','old-owl-well-crypt']){
  const plans=await page.evaluate(async id=>{
   await(await import('/tools/ground-design-fixture.js')).stageGroundDungeon(id);
   const b=SC.Game.top,m=b.map;window.sceneryBefore=JSON.stringify([Array.from(m.flags),Array.from(m.deco),Array.from(m.ground),m.triggers]);
   const p=(await import('/src/render/dungeon-scenery.js')).dungeonSceneryPlan(m);
   return {id,theme:m.theme,biome:m.biome,rooms:p};
  },id);samples.push(plans);
  check(id+' has room-specific dressing',plans.rooms.some(r=>r.items.length));
  check(id+' every dressed room retains its defining element',plans.rooms.length>0&&plans.rooms.every(r=>r.items.some(i=>i.frame===({bunkroom:'bedroll',stores:'ledger',watch:'rack',devotion:'relief'}[r.role]))));
  const roles=new Set();
  for(const room of plans.rooms){
   if(roles.has(room.role)||!room.items.length)continue;roles.add(room.role);
   await page.evaluate(async({id,room})=>{
    const b=SC.Game.top,r=b.map.rooms.find(r=>r.id===room.room),p=b.map.nearestWalkable(r.x+Math.floor(r.w/2),r.y+2,3);
    const {travelTo}=await import('/src/world/overworld.js');travelTo(id,p.x,p.y,'up');SC.Game.top._spellLight(20,'light',60);
   },{id,room});
   await page.waitForTimeout(3500);await run.shot(id+'-'+room.role);
  }
  const safe=await page.evaluate(async()=>{
   const m=SC.Game.top.map,{dungeonSceneryPlan}=await import('/src/render/dungeon-scenery.js');
   const entries=dungeonSceneryPlan(m).flatMap(p=>p.items);
   return {unchanged:window.sceneryBefore===JSON.stringify([Array.from(m.flags),Array.from(m.deco),Array.from(m.ground),m.triggers]),
    clear:entries.filter(i=>!i.wall).every(i=>!m.solidAt(i.x,i.y)&&!m.triggerAt(i.x,i.y)&&!m.at('deco',i.x,i.y)),count:entries.length};
  });check(id+' drawing preserves terrain, collision and triggers',safe.unchanged);check(id+' dressing clears interactables',safe.clear,safe.count);
 }
 for(const biome of ['dungeon','crypt','forest']){
  const flags=await page.evaluate(async biome=>(await import('/tools/ground-design-fixture.js')).stageGroundBattle(biome),biome);
  await page.waitForTimeout(700);await run.shot('battle-'+biome);
  check(biome+' preserves battle flags',await page.evaluate(flags=>JSON.stringify(Array.from(SC.Game.top.enc.map.flags))===JSON.stringify(flags),flags));
  await page.evaluate(()=>SC.Game.top._beginMove());await page.waitForTimeout(100);await run.shot(biome+'-movement');
  check(biome+' movement preview remains available',await page.evaluate(()=>SC.Game.top.reach.size>10));
  await page.keyboard.press('Escape');await page.waitForTimeout(100);
  check(biome+' movement cancellation returns to menu',await page.evaluate(()=>SC.Game.top.phase==='menu'));
 }
 await page.evaluate(async()=>{
  const {drawTile,T}=await import('/src/render/tiles.js'),{drawSprite}=await import('/src/render/sprites.js');
  const c=document.createElement('canvas');c.id='prop-review';c.width=400;c.height=240;c.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;image-rendering:pixelated';document.body.append(c);
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#202630';g.fillRect(0,0,400,240);g.font='10px monospace';g.fillStyle='#e0d8bf';g.fillText('SCENERY / actual tile artwork',16,20);
  for(const [i,key]of ['PILLAR','BARREL','CRATE','RUBBLE','BUSH','BERRY_BUSH'].entries()){
   const x=15+i*64;g.fillStyle='#c2c8c4';g.font='8px monospace';g.fillText(key.replace('BERRY_BUSH','BERRY'),x,40);
   g.save();g.translate(x,48);g.scale(3,3);drawTile(g,T.DUNGEON_FLOOR,0,0,4,4);drawTile(g,T[key],0,0,4,4);g.restore();
   drawTile(g,T.GRASS_2,x+16,105,4,4);drawTile(g,T[key],x+16,105,4,4);
  }
  for(const [i,frame]of ['bedroll','meal','rack','banner','ledger','relief'].entries()){
   const x=15+i*64;g.fillStyle='#c2c8c4';g.fillText(frame,x,150);drawSprite(g,'dungeon-life',frame,x,158,{scale:3,anchor:'topleft',shadow:false});
  }
 });await run.shot('prop-gallery');await page.evaluate(()=>document.querySelector('#prop-review').remove());
 await page.evaluate(async()=>(await import('/tools/ground-design-fixture.js')).stageGroundBattle('dungeon','scenery-second'));
 await page.waitForTimeout(400);await run.shot('battle-second-seed');
 const stats=await page.evaluate(async()=>{
  const b=SC.Game.top,c=document.createElement('canvas');c.width=400;c.height=240;const g=c.getContext('2d'),times=[];
  for(let i=0;i<70;i++){const t=performance.now();b._drawTerrain(g,0,0,22,15);b._drawGroundAccents(g,0,0,22,15);times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);return {median:times[35],p95:times[66],...(await import('/src/render/dungeon-scenery.js')).sceneryCacheInfo()};
 });check('Warm terrain and scenery median below 8ms',stats.median<8,stats);check('Wall cache bounded',stats.wallTiles<=stats.wallLimit,stats);
 check('No browser errors',run.errors.length===0,run.errors);
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>window.render_game_to_text?.()||'{}'));
}catch(e){check('Driver completes',false,String(e));await run.shot('failure');}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,samples,errors:run.errors},null,2));await run.close();if(checks.some(c=>!c.ok))process.exitCode=1;}
