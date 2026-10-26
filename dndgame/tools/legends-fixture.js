// Private browser test only; never imported by the shipped game.
export async function stageLegend(id='drizzt-dourden'){
 const {Game,Party,createCharacter}=SC,{NPCS}=await import('/src/data/npcs.js'),n=NPCS[id];
 Game.state=(await import('/src/state.js')).newGameState('legend-visitors');Party.clear();Party.add(createCharacter({name:'Mara',classId:'wizard',speciesId:'human',backgroundId:'sage',level:3}));
 Game.state.time=720;
 const {OverworldScene,travelTo,clearMapCache}=await import('/src/world/overworld.js');
 clearMapCache();(await import('/src/world/maps.js')).clearMapCache();Game.replace(new OverworldScene(n.map));
 const b=Game.top,m=b.map,e=m.entities.find(e=>e.npcId===id);if(!e)throw Error('Missing '+id);
 const spots=[[0,1,'up'],[-1,0,'right'],[1,0,'left'],[0,-1,'down']];
 const next=spots.find(([dx,dy])=>!m.solidAt(e.x+dx,e.y+dy)&&!['warp','exit','door'].includes(m.triggerAt(e.x+dx,e.y+dy)?.kind)&&!m.entities.some(q=>q!==e&&q.solid&&q.x===e.x+dx&&q.y===e.y+dy));
 if(!next)throw Error('No adjacent square for '+id);
 travelTo(n.map,e.x+next[0],e.y+next[1],next[2]);document.querySelector('#gate')?.classList.remove('show');
 return {id,map:n.map,authored:{x:n.x,y:n.y},actual:{x:e.x,y:e.y},sprite:e.sprite,solid:m.solidAt(e.x,e.y)};
}
