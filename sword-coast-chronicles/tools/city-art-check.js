// Private-browser visual evidence; never touches the player's live campaign.
const {Game,Stage}=SC;
const {travelTo}=await import('/src/world/overworld.js');
const {loadMap}=await import('/src/world/maps.js');
const {drawActor,drawPortrait}=await import('/src/render/actor.js');
const {getSprite,spriteDef}=await import('/src/render/sprites.js');
const shots=[],checks=[];
const check=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
for(const seed of ['city-route-a','city-route-b']){
 const m=loadMap('waterdeep',{seed,force:true,cache:false});
 const q=[[m.spawn.x,m.spawn.y]],seen=new Set(q.map(p=>p.join(',')));
 for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const x=q[i][0]+dx,y=q[i][1]+dy,key=x+','+y;
  if(!m.inBounds(x,y)||m.solidAt(x,y)||seen.has(key))continue;
  seen.add(key);q.push([x,y]);
 }
 for(const [x,y]of [[21,19],[20,13],[30,32]])check(`${seed} route ${x},${y}`,seen.has(x+','+y));
 // The inn interaction is on a solid table: the player uses E beside it.
 check(seed+' inn service accessible beside table',[[16,18],[18,18],[17,17],[17,19]].some(p=>seen.has(p.join(','))));
}
const views=[['waterdeep',20,14],['elfsong-tavern',13,11],['sorcerous-sundries',11,13],['baldurs-mouth',10,9],['high-hall',15,12]];
for(const [id,x,y]of views){
 travelTo(id,x,y,'up');Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;
 SC.FX.weather('none',0);
 for(let f=0;f<180;f++)Game._update(1/60);
 const ow=Game.scenes.find(s=>s.id==='overworld');ow.banner=null;ow.hud.toasts=[];
 check(id+' has correct authored map',ow.map.id===id);
 check(id+' arrival is walkable',!ow.map.solidAt(x,y));
 Game._draw();shots.push({id,url:Stage.snapshot()});
 if(id==='elfsong-tavern'){
   Game.state.time=1320;for(let f=0;f<120;f++)Game._update(1/60);
   Game._draw();shots.push({id:'elfsong-night',url:Stage.snapshot()});
 }
}
const cv=document.createElement('canvas');cv.width=960;cv.height=640;
const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#292b34';c.fillRect(0,0,960,640);
const folk=['npc-merchant','npc-noble','npc-innkeeper','npc-scribe','npc-watch','npc-minstrel'];
for(const [i,sprite]of folk.entries()){
 const ch={id:sprite,name:sprite,sprite};const x=22+i*155;
 drawPortrait(c,ch,x+20,15,72);
 for(const [j,dir]of ['down','left','up'].entries())drawActor(c,ch,x+20+j*43,160,{dir,frame:dir+'-0',scale:2,shadow:false});
 c.fillStyle='#d6c5a3';c.font='13px monospace';c.fillText(sprite.replace('npc-',''),x+6,185);
}
const dress=['outfit-noble','outfit-doublet','outfit-coat','outfit-robe','outfit-plate','outfit-jerkin'];
for(const name of dress){
 const d=spriteDef(name);
 check(name+' has all sixteen movement frames',Object.keys(d.frames).length===16);
 check(name+' has an authored back and profile',JSON.stringify(d.frames['down-0'])!==JSON.stringify(d.frames['up-0'])&&JSON.stringify(d.frames['left-0'])!==JSON.stringify(d.frames['down-0']));
}
for(const [i,outfitStyle]of dress.entries()){
 const ch={name:outfitStyle,speciesId:'human',classes:[],equipment:{},appearance:{outfitStyle,skin:i%2?'#85573f':'#dba97f',hair:'#674936',hairStyle:i%2?'ponytail':'short',beard:'none',helmStyle:'helm-none',cloakStyle:'cloak-none',outfit:['#664276','#365d78','#48705c','#76513f','#75383d','#43485c'][i],outfitAlt:'#a88a56',accent:'#cbaa66'}};
 const x=22+i*155;drawPortrait(c,ch,x+20,220,72);
 for(const [j,dir]of ['down','left','up'].entries())drawActor(c,ch,x+20+j*43,375,{dir,frame:dir+'-0',scale:2,shadow:false});
 c.fillStyle='#d6c5a3';c.fillText(outfitStyle.slice(7),x+6,402);
 for(let f=0;f<4;f++)drawActor(c,ch,x+12+f*32,490,{dir:'down',frame:'down-'+f,scale:2,shadow:false});
 drawActor(c,ch,x+25,550,{dir:'down',scale:1,shadow:false});
}
c.fillStyle='#d6c5a3';c.fillText('CITY FOLK / TAILORED DRESS / WALK FRAMES / NATIVE 1x',22,610);
shots.push({id:'characters',url:cv.toDataURL()});
shots.push({id:'checks',checks});return shots;
