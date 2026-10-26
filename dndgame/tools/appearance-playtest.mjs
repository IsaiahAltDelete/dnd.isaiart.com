// Appearance tests run on an ephemeral origin; no live campaign storage is used.
import fs from 'node:fs';
import {privatePlaytest} from './private-playtest.mjs';
const out=process.argv[2]||'output/appearance/play', scale=Number(process.argv[3]||2);
const run=await privatePlaytest(out,scale),{page,errors}=run,checks=[];
const check=(name,ok,detail)=>checks.push({name,ok,detail});
const key=async k=>{await page.keyboard.press(k,{delay:130});await page.waitForTimeout(180);};
const adjust=async field=>{
 const before=await page.evaluate(field=>SC.Game.top.draft.appearance[field],field);
 await page.keyboard.down('ArrowRight');
 try{await page.waitForFunction(({field,before})=>SC.Game.top.draft.appearance[field]!==before,{field,before},{timeout:5000});}
 finally{await page.keyboard.up('ArrowRight');}await page.waitForTimeout(180);
};
try{
 await page.evaluate(async()=>{
  const {CharCreateScene}=await import('/src/ui/charcreate.js');
  window.created=null;
  SC.Game.replace(new CharCreateScene(ch=>window.created=ch,{preset:{speciesId:'human',classId:'bard',name:'Mara Thistle'}}));
  const b=SC.Game.top;b.randomiseAll();b.setSpecies('human');b.setClass('bard');b.draft.name='Mara Thistle';
  Object.assign(b.draft.appearance,{hairStyle:'twinbraids',beard:'none',hair:'#b04a2a',helmStyle:'helm-none',cloakStyle:'cloak-none',wardrobe:'outfit-doublet',classMarks:false,outfit:'#2f6b6b',outfitAlt:'#7a3030'});b._touch();b.gotoStep(9);
  document.querySelector('#gate')?.classList.remove('show');
 });
 await page.waitForTimeout(300);await run.shot('01-body');
 await key('Tab');check('Tab reaches Hair',await page.evaluate(()=>SC.Game.top.bucket===1));
 await run.shot('02-hair');
 const before=await page.evaluate(()=>SC.Game.top.draft.appearance.hairStyle);await key('ArrowRight');
 check('Keyboard changes hairstyle',await page.evaluate(v=>SC.Game.top.draft.appearance.hairStyle!==v,before));
 await key('ArrowLeft');await key('KeyK');await run.shot('03-side');await key('KeyK');await run.shot('04-back');
 await key('KeyK');await key('KeyK');await key('Tab');
 check('Tab reaches Dress',await page.evaluate(()=>SC.Game.top.bucket===2));
 const ac=await page.evaluate(()=>SC.Game.top.preview.ac);await key('ArrowRight');
 check('Outfit cut updates both renderers, with unchanged AC',await page.evaluate(async ac=>{
  const b=SC.Game.top,A=await import('/src/render/actor.js');
  return b.draft.appearance.wardrobe==='outfit-noble'&&A.portraitLook(b.preview).outfit==='outfit-noble'&&A.actorLayers(b.preview,'down-0').some(x=>x.name==='outfit-noble')&&b.preview.ac===ac;
 },ac));
 await run.shot('05-dress');await key('KeyM');await page.waitForTimeout(240);await run.shot('06-walk');await key('KeyM');
 await page.evaluate(()=>{const b=SC.Game.top;b.draft.appearance.classMarks=true;b._touch();b.previewDir=2;});await page.waitForTimeout(120);
 const marked=await page.evaluate(async()=>{const A=await import('/src/render/actor.js');return A.actorCanvas(SC.Game.top.preview,'up-0').toDataURL();});
 for(let i=0;i<16;i++){if(await page.evaluate(()=>SC.Game.top.currentRow()?.label==='Emblem'))break;await key('ArrowDown');}
 await run.shot('emblem-on');await adjust('classMarks');
 check('Emblem keyboard toggle refreshes cached sprite immediately',await page.evaluate(async before=>{const A=await import('/src/render/actor.js'),b=SC.Game.top;return b.draft.appearance.classMarks===false&&A.actorCanvas(b.preview,'up-0').toDataURL()!==before&&A.portraitLook(b.preview).marks.length===0;},marked));
 await run.shot('emblem-off');
 // Colour controls must recolour both views of material-based outfits.
 for(const [cut,field,label]of [['outfit-jerkin','leather','Leather'],['outfit-ranger','cloth','Linen']]){
  // Stage the selected material row; the colour change itself uses real input.
  await page.evaluate(({cut,label})=>{const b=SC.Game.top;b.draft.appearance.wardrobe=cut;b._touch();b.setBucket(2);b._ensure();b.cursor=b.rows.findIndex(r=>r.label===label);b.previewDir=0;},{cut,label});await page.waitForTimeout(180);
  const materialBefore=await page.evaluate(async()=>{const A=await import('/src/render/actor.js'),ch=SC.Game.top.preview,c=document.createElement('canvas');c.width=c.height=80;A.drawActorBust(c.getContext('2d'),ch,0,0,80);return {sprite:A.actorCanvas(ch,'down-0').toDataURL(),portrait:c.toDataURL()};});
  await adjust(field);
  check(cut+' material colour changes sprite and portrait',await page.evaluate(async before=>{const A=await import('/src/render/actor.js'),ch=SC.Game.top.preview,c=document.createElement('canvas');c.width=c.height=80;A.drawActorBust(c.getContext('2d'),ch,0,0,80);return A.actorCanvas(ch,'down-0').toDataURL()!==before.sprite&&c.toDataURL()!==before.portrait;},materialBefore));
  await run.shot('material-'+field);
 }
 await page.mouse.click(70*scale,54*scale);await page.waitForTimeout(120);
 check('Mouse subtab opens Hair',await page.evaluate(()=>SC.Game.top.bucket===1));
 const coverage=await page.evaluate(async()=>{
  const A=await import('/src/render/actor.js'),S=await import('/src/render/sprites.js');
  const {serializeChar,deserializeChar,recalc}=await import('/src/rules/character.js');
  const ch=SC.Game.top.preview,a=ch.appearance,results=[];
  const add=(name,ok)=>results.push({name,ok});
  const cv=document.createElement('canvas');cv.width=80;cv.height=80;const g=cv.getContext('2d');
  for(const [cls,dir]of [['bard','up'],['cleric','down']]){
   const probe=deserializeChar(JSON.parse(JSON.stringify(serializeChar(ch))));probe.classes[0].id=cls;probe.appearance.wardrobe='outfit-tunic';probe.appearance.classMarks=true;
   const on=A.actorCanvas(probe,dir+'-0').toDataURL();probe.appearance.classMarks=false;const off=A.actorCanvas(probe,dir+'-0').toDataURL();probe.appearance.classMarks=true;
   add(cls+' warmed cache on/off/on restores exact pixels',on!==off&&A.actorCanvas(probe,dir+'-0').toDataURL()===on);
  }
  const cuts=['sidepart','undercut','locs','afro','lowbun','twinbraids'];
  for(const cut of cuts){
   a.hairStyle=cut;const images=new Set();
   for(const dir of ['down','left','right','up'])for(let frame=0;frame<4;frame++){
    const def=S.spriteDef('hair-'+cut);add(cut+' '+dir+'-'+frame+' grid',!!def?.frames?.[dir+'-'+frame]);
    g.clearRect(0,0,80,80);A.drawActor(g,ch,40,64,{dir,phase:frame,moving:true,shadow:false,scale:2});images.add(cv.toDataURL());
   }
   add(cut+' directional silhouettes',images.size>=3);
  }
  ch.equipment.armor='chain-mail';delete a.wardrobe;a.outfitStyle='outfit-tunic';
  add('Legacy appearance still follows worn armour',A.portraitLook(ch).outfit==='outfit-chain');
  a.wardrobe='not-a-garment';add('Unknown wardrobe safely follows armour',A.portraitLook(ch).outfit==='outfit-chain');
  recalc(ch);const armourAC=ch.ac,drawings=new Set();
  for(const cut of A.APPEARANCE_OPTIONS.wardrobe.filter(x=>x!=='auto')){
   a.wardrobe=cut;recalc(ch);add(cut+' portrait, sprite and stats',A.portraitLook(ch).outfit===cut&&A.actorLayers(ch,'down-0').some(x=>x.name===cut)&&ch.ac===armourAC);
   g.clearRect(0,0,80,80);A.drawActor(g,ch,40,64,{dir:'down',scale:2,shadow:false});drawings.add(cv.toDataURL());
  }
  add('Changing outfit invalidates composed sprite cache',drawings.size===16);
  a.wardrobe='outfit-doublet';a.hairStyle='twinbraids';a.classMarks=false;
  const saved=deserializeChar(JSON.parse(JSON.stringify(serializeChar(ch))));
  add('Save round-trip retains cosmetic choices and AC',JSON.stringify(saved.appearance)===JSON.stringify(a)&&saved.ac===armourAC&&A.portraitLook(saved).outfit==='outfit-doublet');
  for(const helm of ['helm-hood','helm-great']){a.helmStyle=helm;add(helm+' still hides hair',!A.actorLayers(ch,'down-0').some(x=>x.name.startsWith('hair-')));}
  a.helmStyle='helm-none';a.hairStyle='long';const layers=A.actorLayers(ch,'down-0').map(x=>x.name);
  add('Long front hair overlays the collar',layers.indexOf('hair-long')>layers.indexOf(a.wardrobe));
  return results;
 });checks.push(...coverage);
 // Second creator identity, with horns and a very different skin/hair palette.
 await page.evaluate(()=>{const b=SC.Game.top;b.setSpecies('tiefling');b.setLineage('infernal');b.setClass('warlock');b.draft.name='Neris Vale';Object.assign(b.draft.appearance,{hairStyle:'afro',hair:'#d8d8e0',skin:'#7a3a3a',helmStyle:'helm-none',cloakStyle:'cloak-none',wardrobe:'outfit-coat',beard:'none',horns:'curved',classMarks:false});b._touch();b.gotoStep(9);b.setBucket(1);});
 await page.waitForTimeout(250);await run.shot('07-tiefling-hair');await key('Tab');await run.shot('08-tiefling-dress');
 await page.evaluate(()=>{const b=SC.Game.top;b.setClass('bard');b.setClass('warlock');});await page.waitForTimeout(200);
 check('Class revisit retains explicit outfit and hair',await page.evaluate(()=>SC.Game.top.draft.appearance.wardrobe==='outfit-coat'&&SC.Game.top.draft.appearance.hairStyle==='afro'));
 // Real campaign creation callback, then actual overworld movement inputs.
 await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.setSpecies('human');b.setClass('bard');b.draft.name='Mara Thistle';Object.assign(b.draft.appearance,{hairStyle:'twinbraids',beard:'none',hair:'#b04a2a',helmStyle:'helm-none',cloakStyle:'cloak-none',wardrobe:'outfit-doublet',classMarks:false,outfit:'#2f6b6b',outfitAlt:'#7a3030'});b._autoFillPicks();b.finish();});
 await page.waitForFunction(()=>SC.Game.top.id==='overworld');await page.waitForTimeout(700);
 check('Creator sends chosen appearance into the actual party',await page.evaluate(()=>SC.Party.members[0].appearance.wardrobe==='outfit-doublet'&&SC.Party.members[0].appearance.hairStyle==='twinbraids'));
 await run.shot('09-world-idle');
 const pos=await page.evaluate(()=>({x:SC.Game.top.player.x,y:SC.Game.top.player.y}));
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await run.shot('10-world-walk');await page.keyboard.up('ArrowRight');await page.waitForTimeout(200);
 check('Custom sprite walks through the world',await page.evaluate(p=>SC.Game.top.player.x!==p.x||SC.Game.top.player.y!==p.y,pos));
 await page.evaluate(()=>SC.cheat.fight('goblin',1));await page.waitForFunction(()=>SC.Game.top.id==='battle');await page.waitForTimeout(500);await run.shot('11-battle');
 check('No draw failures',await page.evaluate(()=>!(SC.Game._drawFails?.size)));
 fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
}catch(e){check('Playtest completed',false,String(e));}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));await run.close();console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok),errors}));if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;}
