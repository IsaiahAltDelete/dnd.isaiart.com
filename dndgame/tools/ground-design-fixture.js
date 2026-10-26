export async function stageGroundBattle(biome='dungeon',seed='ground-a'){
  const {Game,Party,createCharacter}=window.SC;
  const {newGameState}=await import('/src/state.js');
  const {buildBattleMap}=await import('/src/world/battlemap.js');
  const {Encounter}=await import('/src/rules/combat.js');
  const {BattleScene}=await import('/src/ui/combatui.js');
  Game.state=newGameState(seed);Party.clear();
  for(const [name,classId]of [['Mara','wizard'],['Daran','fighter']]){
    const ch=createCharacter({name,classId,speciesId:'human',level:5,backgroundId:'sage'});
    if(classId==='wizard'){ch.spells.known=['shatter'];ch.spells.prepared=['shatter'];}
    Party.add(ch);
  }
  const map=buildBattleMap({biome,seed,party:Party.members,foes:2});
  const enc=new Encounter({party:Party.members,enemies:['ogre','goblin'],map,biome,seed});enc.start();
  enc.turnIndex=enc.order.indexOf(enc.units.find(u=>u.side==='party').uid);enc.beginTurn();
  Game.replace(new BattleScene(enc));const b=Game.top;b.beats=[];b.beat=null;b.banner=null;b.phase='menu';b.menuDirty=true;b.zoom=1;b._recenter();
  document.querySelector('#gate')?.classList.remove('show');
  return Array.from(map.flags);
}

export async function stageGroundDungeon(id='redbrand-hideout-3'){
  const {Game,Party,createCharacter}=window.SC;
  const {newGameState}=await import('/src/state.js');
  const {OverworldScene,travelTo}=await import('/src/world/overworld.js');
  Game.state=newGameState('floor-design');Party.clear();
  Party.add(createCharacter({name:'Mara',classId:'wizard',speciesId:'human',level:5,backgroundId:'sage'}));
  Game.replace(new OverworldScene(id));
  const b=Game.top,r=b.map.rooms?.filter(r=>r.w>=5&&r.h>=5&&r.kind!=='boss').sort((a,b)=>b.w*b.h-a.w*a.h)[0];
  if(r){const p=b.map.nearestWalkable(r.x+Math.floor(r.w/2),r.y+Math.floor(r.h/2),4);if(p)travelTo(id,p.x,p.y,'down');}
  document.querySelector('#gate')?.classList.remove('show');
}
