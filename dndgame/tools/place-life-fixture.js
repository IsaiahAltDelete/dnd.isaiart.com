export async function stagePlaceLife(id='blackstaff-tower',kind='arcane'){
 await(await import('./academy-fixture.js')).stageAcademy();
 SC.Game.state.time=720;SC.Game.state.weather='clear';SC.Game.state.weatherTimer=99999;
 const {travelTo}=await import('/src/world/overworld.js');travelTo(id);
 const ow=SC.Game.top,g=ow.map.streetScenes.find(g=>g.kind===kind);if(!g)throw Error('Missing '+kind);
 const host=ow.map.entities.find(e=>e.group===g&&e.member===0),p=[];
 for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const x=host.x+dx,y=host.y+dy;if(!ow.map.solidAt(x,y)&&!ow.map.triggerAt(x,y)&&!ow.map.entities.some(e=>e.x===x&&e.y===y))p.push({x,y,d:Math.abs(dx)+Math.abs(dy-2)});}
 p.sort((a,b)=>a.d-b.d);travelTo(id,p[0].x,p[0].y,'up');ow.banner=null;ow.hud.toasts=[];SC.FX.clear(true);ow._applyWeather(true);
 return {id,kind,people:g.people};
}
