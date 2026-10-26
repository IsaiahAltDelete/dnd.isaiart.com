// A contact sheet using the real portrait and actor renderers, not mockups.
const A=await import('/src/render/actor.js');
const cv=document.createElement('canvas');cv.width=800;cv.height=480;
Object.assign(cv.style,{position:'fixed',inset:0,width:'100vw',height:'100vh',zIndex:99999,imageRendering:'pixelated'});document.body.append(cv);
const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
const hairs=['sidepart','undercut','locs','afro','lowbun','twinbraids'];
const outfits=['outfit-noble','outfit-jerkin','outfit-robe','outfit-coat','outfit-ranger','outfit-doublet'];
g.fillStyle='#20292e';g.fillRect(0,0,800,480);g.font='12px monospace';
for(let i=0;i<6;i++){
 const x=(i%3)*266,y=Math.floor(i/3)*225+22;
 const ch={name:'Sample '+i,speciesId:i===3?'tiefling':'human',classes:[{id:i===3?'warlock':'bard'}],equipment:{},appearance:{hairStyle:hairs[i],wardrobe:outfits[i],classMarks:false,body:i%2?'f':'m',build:'normal',beard:'none',helmStyle:'helm-none',cloakStyle:'cloak-none',bootStyle:'boots-court',skin:['#e0a878','#c98d5e','#6b4227','#7a3a3a','#e8bd95','#8a5734'][i],hair:['#7a5a2a','#1c1410','#3a2416','#d8d8e0','#b04a2a','#c8a860'][i],outfit:'#2f6b6b',outfitAlt:'#7a3030',accent:'#e3b34a',horns:i===3?'curved':null,hornColor:'#8c8377'}};
 g.fillStyle='#334149';g.fillRect(x+5,y,256,212);g.fillStyle='#f1e4c6';g.fillText(hairs[i]+' / '+outfits[i].replace('outfit-',''),x+14,y+18);
 A.drawActorBust(g,ch,x+18,y+29,88);
 for(const [j,dir]of ['down','left','up','right'].entries()) A.drawActor(g,ch,x+132+(j%2)*72,y+88+Math.floor(j/2)*76,{dir,scale:2.5,shadow:false});
 g.fillStyle='#b5c4cc';g.fillText('World scale',x+14,y+158);
 A.drawActor(g,ch,x+36,y+210,{dir:'down',scale:2,shadow:false});
 A.drawActor(g,ch,x+82,y+210,{dir:'down',scale:2,shadow:false,pose:'attack',posePhase:0.5});
}
return {hairStyles:hairs,outfits};
