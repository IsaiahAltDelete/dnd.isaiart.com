import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/scale/primary',scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run;
const checks=[];const check=(name,pass)=>checks.push({name,pass:!!pass});
try {
 await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.draft.name='Scale Tester';b._autoFillPicks();b.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);
 for(const id of ['phandalin','neverwinter-wood','thundertree','waterdeep']) {
  const info=await page.evaluate(async id=>{
   const {travelTo}=await import('/src/world/overworld.js');travelTo(id);
   const s=SC.Game.top;s.banner=null;s.hud.toasts=[];SC.Game.state.time=720;
   const {visibleTrees}=await import('/src/render/trees.js');
   const trees=visibleTrees(s.map,{x:s.camDraw.x,y:s.camDraw.y,w:400,h:240});
   return {id:s.map.id,trees:trees.length};
  },id);
  await page.waitForTimeout(500);await run.shot(id);
  check(id+' real map loaded',info.id===id);
 }
 const audit=await page.evaluate(async()=>{
  const {TileMap}=await import('/src/world/tilemap.js'),T=await import('/src/render/tiles.js');
  const {bigOak,bigPine}=await import('/src/world/mapkit.js');
  const {visibleTrees,treeAlpha,drawTree,isTreeTile}=await import('/src/render/trees.js');
  const {drawActor}=await import('/src/render/actor.js');
  const m=new TileMap({w:28,h:20});
  ['TREE_OAK','TREE_PINE','TREE_BIRCH','TREE_WILLOW','DEAD_TREE'].forEach((name,i)=>m.set('deco',2+i*4,8,T.T[name],true));
  bigOak(m,2,14);bigPine(m,8,14);
  const before=Array.from(m.flags),trees=visibleTrees(m,{x:0,y:0,w:448,h:320});
  const checks=[];const check=(name,pass)=>checks.push({name,pass:!!pass});
  check('Five single species and two assembled trees',trees.length===7);
  check('Trees stand at least 44px above their roots',trees.every(t=>t.h>=44));
  check('Collection leaves collision flags unchanged',JSON.stringify(before)===JSON.stringify(Array.from(m.flags)));
  check('Big tree has one drawable, not four enlarged fragments',trees.filter(t=>t.big).length===2);
  const oak=trees[0];check('Crown fades over a body behind it',treeAlpha(oak,[{x:oak.px,y:oak.py-16}])<.5);
  check('Tree stays opaque with a person in front',treeAlpha(oak,[{x:oak.px,y:oak.py+1}])===1);
  const {EntityList}=await import('/src/world/entity.js');const order=[],list=new EntityList(m);
  list.list.push({px:oak.px+16,py:oak.py,draw:()=>order.push('person')});
  list.draw(document.createElement('canvas').getContext('2d'),{x:0,y:0},{extra:[{...oak,draw:()=>order.push('tree')}]});
  check('Person beside a trunk draws in front at equal feet depth',order.join(',')==='tree,person');
  check('Roots below viewport still draw visible crowns',visibleTrees(m,{x:0,y:70,w:448,h:40}).length===5);
  check('Shrubs and boulders keep their original scale',!isTreeTile(T.T.BUSH)&&!isTreeTile(T.T.BOULDER));
  const cropped=new TileMap({w:8,h:8});cropped.set('deco',0,0,T.T.OAK_BR,true);
  check('Cropped tree root remains visible',visibleTrees(cropped,{x:0,y:0,w:128,h:128}).length===1);
  const c=document.createElement('canvas');c.width=1040;c.height=430;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#263329';g.fillRect(0,0,c.width,c.height);g.scale(2,2);
  const hero=SC.createCharacter({name:'Human',speciesId:'human',classId:'fighter',backgroundId:'soldier'});
  trees.forEach((t,i)=>{const px=32+i*62;const copy={...t,px,py:95};drawTree(g,copy);drawActor(g,hero,px+20,95,{shadow:false});g.fillStyle='#e7dab3';g.font='7px monospace';g.fillText(T.tileKey(t.id),px-20,108);});
  const {MONSTERS}=await import('/src/data/monsters.js');const {monsterArtFor}=await import('/src/render/spritedata_monsters.js');
  const ids=['jackal','mastiff','wolf','dire-wolf','worg','winter-wolf','hell-hound','blink-dog'];
  ids.forEach((id,i)=>{const px=32+i*62;drawActor(g,{...MONSTERS[id],monsterId:id},px,180,{dir:'left',shadow:false});drawActor(g,hero,px+22,180,{shadow:false});g.fillStyle='#e7dab3';g.fillText(id,px-20,194);});
  const canineSprites=new Set(['wolf','dire-wolf','worg','winter-wolf','hell-hound']);
  const canineCatalogue=Object.entries(MONSTERS).map(([id,m])=>({id,art:monsterArtFor(id,m.sprite)})).filter(r=>canineSprites.has(r.art.sprite));
  for(const r of canineCatalogue)check(r.id+' catalogue canine uses shared restrained scale',r.art.worldScale&&r.art.scale>0&&r.art.scale<=0.95);
  check('Mastiff smaller than dire wolf',monsterArtFor('mastiff').scale<monsterArtFor('dire-wolf').scale);
  return {checks,gallery:c.toDataURL(),canineCatalogue,scales:ids.map(id=>({id,scale:monsterArtFor(id).scale}))};
 });
 checks.push(...audit.checks);fs.writeFileSync(out+'/scale-lineup.png',Buffer.from(audit.gallery.split(',')[1],'base64'));
 // Real movement on a clear route beneath the taller trees.
 await page.evaluate(async()=>{(await import('/src/world/overworld.js')).travelTo('phandalin',15,14,'right');});
 await page.waitForTimeout(250);const pos=await page.evaluate(()=>({x:SC.Game.top.player.x,y:SC.Game.top.player.y}));
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(180);await page.keyboard.up('ArrowRight');await page.waitForTimeout(250);
 check('Overworld movement still advances',await page.evaluate(p=>SC.Game.top.player.x!==p.x||SC.Game.top.player.y!==p.y,pos));await run.shot('world-move');
 await page.evaluate(async()=>{
  const s=SC.Game.top,{T}=await import('/src/render/tiles.js'),{MonsterEntity}=await import('/src/world/entity.js');
  for(let y=8;y<20;y++)for(let x=10;x<24;x++){s.map.set('ground',x,y,T.GRASS);s.map.set('deco',x,y,0);s.map.set('over',x,y,0);}
  s.map.set('deco',15,14,T.TREE_OAK);s.map.set('deco',20,12,T.TREE_PINE);s.map.recomputeFlags();
  for(const k of ['_edgeMask','_overMask','_tallMask','_fringeMask','_synTiles'])s.map[k]=null;s.banner=null;s.hud.toasts=[];
  s.entities.clear();s.entities.add(s.player);s.player.char=SC.createCharacter({name:'Rowan',speciesId:'human',classId:'fighter',backgroundId:'soldier'});SC.Party.members[0]=s.player.char;
  s.player.setTile(15,13,'down');s.entities.add(new MonsterEntity({id:'scale-wolf',monsterId:'dire-wolf',x:18,y:14,aggro:false,wander:0,dir:'left'}));s._snapCamera();
 });
 await page.waitForTimeout(300);await run.shot('world-behind-tree');
 await page.keyboard.down('ArrowDown');await page.waitForTimeout(180);await page.keyboard.up('ArrowDown');await page.waitForTimeout(100);
 check('Larger crown retains original blocking root',await page.evaluate(()=>SC.Game.top.player.x===15&&SC.Game.top.player.y===13));
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(180);await page.keyboard.up('ArrowLeft');await page.waitForTimeout(200);
 check('Can walk beside expanded canopy',await page.evaluate(()=>SC.Game.top.player.x===14));
 await page.evaluate(()=>{const s=SC.Game.top;s.player.setTile(15,15,'up');});await page.waitForTimeout(200);await run.shot('world-front-tree');
 for(const id of ['dire-wolf','mastiff'])for(const zoom of [1,2]) {
  const result=await page.evaluate(async({id,zoom})=>{
   await(await import('/tools/monster-upgrade-fixture.js')).stageMonsterFixture(id,zoom);
   const b=SC.Game.top;const {TileMap}=await import('/src/world/tilemap.js'),{T}=await import('/src/render/tiles.js');
   const {bigOak}=await import('/src/world/mapkit.js');
   const m=new TileMap({w:b.enc.w,h:b.enc.h});m.ground.fill(T.GRASS);
   m.set('deco',4,7,T.TREE_OAK,true);m.set('deco',12,8,T.TREE_PINE,true);m.set('deco',10,12,T.TREE_BIRCH,true);bigOak(m,13,11);m.recomputeFlags();b.enc.map=m;b._recomputeReach(b.enc.current);
   const foe=b.enc.units.find(u=>u.side==='foe');const r=b._unitBounds(foe);const {monsterArtFor}=await import('/src/render/spritedata_monsters.js');
   return {scale:r.scale,expected:zoom*monsterArtFor(id).scale,w:r.w/zoom,h:r.h/zoom};
  },{id,zoom});
  check(id+' Zoom'+zoom+' uses world creature scale',Math.abs(result.scale-result.expected)<.001);
  check(id+' Zoom'+zoom+' lower than human height',result.h<=24&&result.w<32);
  await page.waitForTimeout(400);await run.shot((id==='mastiff'?'mastiff-':'')+'combat-trees-zoom'+zoom);
  await page.evaluate(()=>{const b=SC.Game.top;const u=b.enc.units.find(u=>u.side==='party');const st=b._uiOf(u,true);st.x=4.5*16;st.y=7*16;});
  await run.shot((id==='mastiff'?'mastiff-':'')+'combat-behind-tree-zoom'+zoom);
  if(id==='mastiff') {
   await page.evaluate(()=>{const b=SC.Game.top,u=b.enc.units.find(u=>u.side==='party'),st=b._uiOf(u,true);st.x=(u.pos.x+.5)*16;st.y=(u.pos.y+1)*16;});
   for(let n=0;n<3&&await page.evaluate(()=>SC.Game.top.phase==='menu');n++){await page.keyboard.press('KeyZ',{delay:70});await page.waitForTimeout(150);}
   const point=await page.evaluate(async scale=>{
    const S=await import('/src/render/sprites.js'),b=SC.Game.top,u=b.enc.units.find(u=>u.side==='foe'),r=b._unitBounds(u),st=b._uiOf(u,true),img=S.getSprite(r.art.sprite,st.dir+'-0'),data=img.getContext('2d').getImageData(0,0,img.width,img.height).data;
    for(let y=Math.floor(img.height*.4);y<img.height*.8;y++)for(let x=Math.floor(img.width*.5);x<img.width;x++)if(data[(y*img.width+x)*4+3]){const px=r.x+(x+.5)*r.scale,py=r.y+(y+.5)*r.scale;if(b._unitAtPoint(px,py)?.uid===u.uid)return{x:px*scale,y:py*scale,phase:b.phase};}
    throw Error('No selectable mastiff body pixel');
   },scale);
   check('Mastiff zoom'+zoom+' opens melee targeting',point.phase==='target');
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(100);
   check('Mastiff zoom'+zoom+' press waits for release',await page.evaluate(()=>SC.Game.top.phase==='target'));
   await page.mouse.up();await page.waitForFunction(()=>SC.Game.top.results?.kind==='victory'||SC.Game.top._budget().attacksMade===1);await page.waitForTimeout(300);
   check('Mastiff zoom'+zoom+' release resolves attack',await page.evaluate(()=>SC.Game.top.results?.kind==='victory'||SC.Game.top._budget().attacksMade===1));
   await run.shot('mastiff-attack-zoom'+zoom);
  }
 }
 fs.writeFileSync(out+'/report.json',JSON.stringify({checks,scales:audit.scales,canineCatalogue:audit.canineCatalogue,errors,drawErrors:await page.evaluate(()=>[...(SC.Game._drawFails||[])])},null,2));
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 assert.equal(checks.filter(c=>!c.pass).length,0);assert.equal(errors.length,0);
 console.log(checks.length+' scale checks passed');
} catch(e){await run.shot('failure');throw e;} finally {await run.close();}
