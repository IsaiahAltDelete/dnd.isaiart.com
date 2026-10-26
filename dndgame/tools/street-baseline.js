const {Game,Stage}=SC;
const {travelTo}=await import('/src/world/overworld.js');
const shots=[];
for(const [id,x,y]of [['waterdeep',12,21],['waterdeep',27,25],['bg-the-wide',28,23],['bg-eastway',29,20],['bg-gray-harbour',28,22],['bg-heapside',25,24],['bg-bloomridge',26,23],['bg-temples-district',24,22],['bg-citadel-streets',25,24]]){
 travelTo(id,x,y,'down');Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;SC.FX.weather('none',0);
 for(let f=0;f<90;f++)Game._update(1/60);
 const ow=Game.scenes.find(s=>s.id==='overworld');ow.banner=null;ow.hud.toasts=[];
 Game._draw();shots.push({id:id+'-'+x,url:Stage.snapshot()});
}
return shots;
