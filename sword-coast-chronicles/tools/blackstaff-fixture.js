export async function stageBlackstaff(){
 const {Game,Party,createCharacter}=SC;Game.state=(await import('/src/state.js')).newGameState('blackstaff-one');Game.state.time=720;
 Party.clear();Party.add(createCharacter({name:'Mara',classId:'wizard',speciesId:'human',backgroundId:'sage',level:3}));
 const {OverworldScene,travelTo,clearMapCache}=await import('/src/world/overworld.js');clearMapCache();(await import('/src/world/maps.js')).clearMapCache();
 Game.replace(new OverworldScene('waterdeep'));travelTo('waterdeep',3,7,'left');document.querySelector('#gate')?.classList.remove('show');
 (await import('/src/core/save.js')).Save.settings.textSpeed='instant';
}
