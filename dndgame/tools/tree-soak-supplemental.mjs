import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/tree-soak/supplemental',run=await privatePlaytest(out),{page,errors}=run;
const report={checks:[],cases:[],errors},check=(name,pass)=>report.checks.push({name,pass:!!pass});
try {
 for(const id of ['dire-wolf','half-ogre','downed-hero'])for(const zoom of [1,2]){
  const info=await page.evaluate(async({id,zoom})=>{
   await(await import('/tools/tree-soak-fixture.js')).stageTreeBattle(zoom);const map=SC.Game.top.enc.map;
   if(id==='half-ogre'){await(await import('/tools/monster-upgrade-fixture.js')).stageMonsterFixture(id,zoom);SC.Game.top.enc.map=map;}
   const b=SC.Game.top,{T}=await import('/src/render/tiles.js');
   for(const [x,y]of [[7,9],[8,9],[7,10],[8,10]])map.set('deco',x,y,T.TREE_WILLOW);map.recomputeFlags();
   if(id==='downed-hero'){const p=b.enc.units.find(u=>u.side==='party');p.hp=0;b._uiOf(p,true).topple=1;}
   // Keep a still, truthful posed capture; the running combat soak covers animation.
   SC.Game._update=()=>{};
   const target=b.enc.units.find(u=>u.side===(id==='downed-hero'?'party':'foe')),bounds=b._unitBounds(target);
   const saved=b.enc.units.filter(u=>u!==target).map(u=>[b._uiOf(u,true),b._uiOf(u,true).alpha]);for(const [st]of saved)st.alpha=0;
   // Preserve the trees BEHIND the target in every render: otherwise antialiased
   // sprite edges are compared against different backgrounds, not just occlusion.
   const render=(omitActors,omitTrees)=>{
    const c=document.createElement('canvas');c.width=400;c.height=240;const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#000';g.fillRect(0,0,400,240);
    const original=g.drawImage.bind(g);let actors=0,trees=0,seenActor=false;
    g.drawImage=(img,...args)=>{const tree=img.width===16&&img.height===16;if(tree)trees++;else {actors++;seenActor=true;}if(tree?(omitTrees&&seenActor):omitActors)return;original(img,...args);};
    const tag=b._drawUnitTag;b._drawUnitTag=()=>{};try{b._drawUnits(g);}finally{b._drawUnitTag=tag;}
    return {pixels:g.getImageData(0,0,400,240).data,actors,trees};
   };
   const full=render(false,false),empty=render(true,false),bare=render(false,true),base=render(true,true),ratios=[];
   for(let i=0;i<full.pixels.length;i+=4){const x=(i/4)%400,y=Math.floor(i/4/400);if(x<bounds.x||x>=bounds.x+bounds.w||y<bounds.y||y>=bounds.y+bounds.h)continue;let before=0,after=0;for(let k=0;k<3;k++){before+=Math.abs(bare.pixels[i+k]-base.pixels[i+k]);after+=Math.abs(full.pixels[i+k]-empty.pixels[i+k]);}if(before>80)ratios.push(after/before);}
   for(const [st,alpha]of saved)st.alpha=alpha;
   return {id,zoom,occludedPixels:ratios.filter(r=>r<.95).length,min:Math.min(...ratios),pixels:ratios.length,actorDraws:full.actors,treeDraws:full.trees,bounds:b.enc.units.map(u=>({name:u.name,hp:u.hp,rect:b._unitBounds(u)}))};
  },{id,zoom});
  report.cases.push(info);check(id+' zoom'+zoom+' actual actors retain contrast through crowns',info.min>=.58&&info.pixels>50&&info.occludedPixels>10&&info.treeDraws>0&&info.actorDraws>0);await run.shot(id+'-zoom'+zoom);
 }
 // Reload restores the real update loop for event-confirmed input.
 await page.reload();await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');
 for(const zoom of [1,2]){
  await page.evaluate(async z=>(await import('/tools/tree-soak-fixture.js')).stageTreeBattle(z),zoom);await page.waitForTimeout(350);
  for(let n=0;n<3&&await page.evaluate(()=>SC.Game.top.phase==='menu');n++){await page.keyboard.press('KeyZ',{delay:70});await page.waitForTimeout(150);}
  const point=await page.evaluate(async()=>{const S=await import('/src/render/sprites.js'),b=SC.Game.top,u=b.enc.units.find(u=>u.side==='foe'),r=b._unitBounds(u),st=b._uiOf(u,true),img=S.getSprite(r.art.sprite,st.dir+'-0'),p=img.getContext('2d').getImageData(0,0,img.width,img.height).data;for(let y=4;y<img.height;y++)for(let x=4;x<img.width;x++){if(!p[(y*img.width+x)*4+3])continue;const px=r.x+(x+.5)*r.scale,py=r.y+(y+.5)*r.scale;if(b._unitAtPoint(px,py)?.uid===u.uid)return{x:px*2,y:py*2};}throw Error('No visible body point');});
  check('zoom'+zoom+' melee targeting opens',await page.evaluate(()=>SC.Game.top.phase==='target'));
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(100);check('zoom'+zoom+' press does not commit attack',await page.evaluate(()=>SC.Game.top.phase==='target'&&SC.Game.top._budget().attacksMade===0));
  await page.mouse.up();await page.waitForFunction(()=>SC.Game.top._budget().attacksMade===1||!!SC.Game.top.results);await page.waitForTimeout(400);
  check('zoom'+zoom+' release confirms one attack',await page.evaluate(()=>SC.Game.top._budget().attacksMade===1||SC.Game.top.results?.kind==='victory'));
  await run.shot('confirmed-attack-zoom'+zoom);
 }
 report.drawErrors=await page.evaluate(()=>[...(SC.Game._drawFails||[])]);check('No browser or draw errors',!errors.length&&!report.drawErrors.length);
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));assert.equal(report.checks.filter(c=>!c.pass).length,0);console.log('SUPPLEMENTAL PASS '+report.checks.length);
} catch(e){report.failure=String(e);fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await run.shot('failure');throw e;}finally{await run.close();}
