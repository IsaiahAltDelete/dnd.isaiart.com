const {Game,Stage}=SC;
const {loadMap}=await import('/src/world/maps.js');
const shots=[];
const ow=Game.scenes.find(s=>s.id==='overworld');
for(const id of ['waterdeep','bg-the-wide']){
 Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;SC.FX.weather('none',0);
 const m=loadMap(id,{seed:'street-b',cache:false,force:true});
 ow.bindMap(m,id==='waterdeep'?12:28,id==='waterdeep'?21:23,'down');
 for(let f=0;f<120;f++)Game._update(1/60);
 ow.banner=null;ow.hud.toasts=[];Game.time=20;Game._draw();
 shots.push({id:id+'-seed-b',url:Stage.snapshot()});
}
return shots;
