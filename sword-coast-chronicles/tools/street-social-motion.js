// Actual elapsed-time sequences at 6 fps, with both full screenshots and crops
// assembled off-line for review. No actor positions or phases are assigned.
const {Game,Stage}=SC;
const {loadMap}=await import('/src/world/maps.js');
const {updateStreetSocial}=await import('/src/world/city-life.js');
const ow=Game.scenes.find(s=>s.id==='overworld'),shots=[];
for(const [id,kind,night]of [['waterdeep','music',false],['bg-the-wide','market',false],['waterdeep','repair',false],['waterdeep','music',true],['bg-citadel-streets','news',false]]){
 Game.state.time=night?1260:720;Game.state.weather='clear';Game.state.weatherTimer=99999;
 const m=loadMap(id,{seed:'social-a',force:true,cache:false}),g=m.streetScenes.find(g=>g.kind===kind);
 ow.bindMap(m,g.people[0].x+3,g.people[0].y+(kind==='news'?-2:1),'left');SC.FX.clear(true);ow._applyWeather(true);ow.banner=null;ow.hud.toasts=[];
 g.socialCooldown=0;
 // Advance through the real overworld entity hook so integration is exercised.
 for(let i=0;i<600&&!g.social;i++)ow._updateEntities(1/60);
 for(let frame=0;frame<96;frame++){
  for(let j=0;j<10;j++){ow._updateEntities(1/60);Game.time+=1/60;}
  Game._draw();shots.push({id:`${kind}${night?'-night':''}-${String(frame).padStart(3,'0')}`,url:Stage.snapshot(),phase:g.social?.phase||'idle',crop:{x:Math.max(0,Math.round(g.people[0].x*32-ow.cam.x*2-150)),y:Math.max(0,Math.round(g.people[0].y*32-ow.cam.y*2-90)),w:300,h:220}});
 }
}
return shots;
