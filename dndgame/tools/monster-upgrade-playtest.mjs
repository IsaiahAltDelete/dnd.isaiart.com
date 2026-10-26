import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/monster-upgrade/before',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run;
const pairs=[...fs.readFileSync('src/render/spritedata_monsters.js','utf8').matchAll(/variant\('([^']+)', '([^']+)'/g)].map(m=>[m[1],m[2]]).filter(([,base])=>['wolf','goblin','orc','ogre','skeleton','dragon-young','dragon-adult'].includes(base));
try {
 await page.evaluate(async()=>{const {stageMonsterFixture}=await import('/tools/monster-upgrade-fixture.js');await stageMonsterFixture();});
 await page.waitForTimeout(300);await run.shot('combat-dire-wolf');
 const audit=await page.evaluate(async pairs=>{
  const S=await import('/src/render/sprites.js'),M=await import('/src/render/spritedata_monsters.js');
  const {MONSTERS}=await import('/src/data/monsters.js');
  const rows=pairs.map(([id,base])=>{const d=S.spriteDef(id),b=S.spriteDef(base);return {id,base,w:d.w,h:d.h,baseW:b.w,baseH:b.h,sharedFrames:JSON.stringify(d.frames)===JSON.stringify(b.frames),missing:[...new Set(Object.values(d.frames).flat().join(''))].filter(k=>k!=='.'&&k!==' '&&!d.palette[k]),frames:Object.keys(d.frames)};});
  const checks=[];const check=(name,pass)=>checks.push({name,pass:!!pass});
  for(const r of rows){check(r.id+' inherits final frames/dimensions',r.sharedFrames&&r.w===r.baseW&&r.h===r.baseH);check(r.id+' all palette keys resolve',r.missing.length===0);check(r.id+' uses baked palette',M.monsterArtFor(r.id,MONSTERS[r.id]?.sprite).bakedPalette);}
  const catalogue=Object.entries(MONSTERS).map(([id,m])=>{const art=M.monsterArtFor(id,m.sprite),def=S.spriteDef(art.sprite);return {id,sprite:art.sprite,valid:!!def&&def.w>0&&def.h>0,upgradedVariant:pairs.some(([name])=>name===art.sprite)};});
  check('Entire bestiary resolves to registered art',catalogue.every(m=>m.valid));
  const {drawActor}=await import('/src/render/actor.js');
  const foe=SC.Game.top.enc.units.find(u=>u.side==='foe');
  const portrait=(ch,opts={})=>{const c=document.createElement('canvas');c.width=160;c.height=120;drawActor(c.getContext('2d'),ch,80,110,{dir:'left',scale:3,shadow:false,...opts});return c.toDataURL();};
  check('Legacy instance tint cannot flatten baked wolf palette',portrait(foe)===portrait({...foe,tint:null}));
  check('Combat hit-flash tint still works',portrait(foe)!==portrait(foe,{tint:'#ff0000',tintAmt:.8}));
  for(const id of ['wolf','dire-wolf','worg','winter-wolf','hell-hound']){const d=S.spriteDef(id);check(id+' rear differs from front',JSON.stringify(d.frames['up-0'])!==JSON.stringify(d.frames['down-0']));check(id+' walking feet animate',JSON.stringify(d.frames['left-0'])!==JSON.stringify(d.frames['left-1']));}
  const c=document.createElement('canvas');c.width=960;c.height=rows.length*150+35;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#20252c';g.fillRect(0,0,c.width,c.height);g.font='16px sans-serif';g.fillStyle='#efe6d2';g.fillText('MONSTER FAMILY AUDIT — front / side / rear / attack / hurt',16,24);
  rows.forEach((r,i)=>{const y=35+i*150;g.fillStyle=i%2?'#293039':'#232a32';g.fillRect(0,y,960,150);g.fillStyle='#efe6d2';g.fillText(r.id,16,y+22);['down-0','left-0','up-0','attack','hurt'].forEach((f,j)=>{const img=S.getSprite(r.id,f);g.drawImage(img,190+j*150,y+30,img.width*3,img.height*3);});});
  return {rows,checks,catalogue,gallery:c.toDataURL(),errors:[...(SC.Game._drawFails||[])]};
 },pairs);
 fs.writeFileSync(out+'/gallery.png',Buffer.from(audit.gallery.split(',')[1],'base64'));delete audit.gallery;
 // Exercise the larger silhouettes through real portrait clicks and body input.
 for(const id of ['dire-wolf','orog','half-ogre'])for(const zoom of [1,2]){
  await page.evaluate(async({id,zoom})=>(await import('/tools/monster-upgrade-fixture.js')).stageMonsterFixture(id,zoom),{id,zoom});
  await page.waitForTimeout(300);
  const rail=await page.evaluate(scale=>{const b=SC.Game.top,h=b._railHits.find(h=>h.u.side==='foe');return{x:(h.x+h.w/2)*scale,y:(h.y+h.h/2)*scale};},scale);
  await page.mouse.click(rail.x,rail.y);await page.waitForTimeout(650);
  const framing=await page.evaluate(()=>{const b=SC.Game.top,u=b.enc.units.find(u=>u.side==='foe');return{r:b._unitBounds(u),origin:b._origin()};});
  const r=framing.r;audit.checks.push({name:`${id} zoom${zoom} body fits battlefield`,pass:r.x>=0&&r.y>=20&&r.x+r.w<=400&&r.y+r.h<=210});
  await page.mouse.click(rail.x,rail.y);await page.waitForTimeout(200);
  audit.checks.push({name:`${id} zoom${zoom} repeated selection keeps camera still`,pass:await page.evaluate(old=>JSON.stringify(SC.Game.top._origin())===JSON.stringify(old),framing.origin)});
  await run.shot(`${id}-zoom${zoom}`);
  if(id==='dire-wolf'&&zoom===1)for(const dir of ['down','up']){
   await page.evaluate(dir=>{const b=SC.Game.top;b._uiOf(b.enc.units.find(u=>u.side==='foe'),true).dir=dir;},dir);
   await run.shot('dire-wolf-'+dir);
  }
 }
 await page.evaluate(async()=>{await(await import('/tools/monster-upgrade-fixture.js')).stageMonsterFixture();});await page.waitForTimeout(350);
 for(let n=0;n<3&&await page.evaluate(()=>SC.Game.top.phase==='menu');n++){await page.keyboard.press('KeyZ',{delay:70});await page.waitForTimeout(250);}
 const point=await page.evaluate(async scale=>{
  const S=await import('/src/render/sprites.js'),b=SC.Game.top,u=b.enc.units.find(u=>u.side==='foe'),r=b._unitBounds(u),s=b._uiOf(u,true),img=S.getSprite(r.art.sprite,s.dir+'-0'),pixels=img.getContext('2d').getImageData(0,0,img.width,img.height).data;
  for(let y=Math.floor(img.height*.4);y<img.height*.75;y++)for(let x=Math.floor(img.width*.6);x<img.width;x++)if(pixels[(y*img.width+x)*4+3]){const px=r.x+(x+.5)*r.scale,py=r.y+(y+.5)*r.scale;if(b._unitAtPoint(px,py)?.uid===u.uid)return{x:px*scale,y:py*scale,phase:b.phase};}
  throw Error('No visible selectable wolf torso');
 },scale);
 audit.checks.push({name:'Melee targeting opens for the upgraded wolf',pass:point.phase==='target'});
 await page.mouse.move(point.x,point.y);await run.shot('wolf-targeting');await page.mouse.down();await page.waitForTimeout(100);
 audit.checks.push({name:'Body press waits for release',pass:await page.evaluate(()=>SC.Game.top.phase==='target')});
 await page.mouse.up();await page.waitForFunction(()=>SC.Game.top._budget().attacksMade===1,null,{timeout:10000});await page.waitForTimeout(600);
 audit.checks.push({name:'Visible wolf body click commits exactly one melee attack',pass:await page.evaluate(()=>SC.Game.top._budget().attacksMade===1&&SC.Game.top.phase!=='target')});
 await run.shot('wolf-melee-result');
 fs.writeFileSync(out+'/report.json',JSON.stringify({...audit,consoleErrors:errors},null,2));fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 assert.equal(audit.checks.filter(c=>!c.pass).length,0);assert.equal(errors.length,0);assert.equal(audit.errors.length,0);
 console.log(JSON.stringify(audit.rows.map(({id,w,h,sharedFrames})=>({id,w,h,sharedFrames}))));
}catch(e){fs.writeFileSync(out+'/failure.json',JSON.stringify({error:String(e),errors},null,2));await run.shot('failure');throw e;}finally{await run.close();}
