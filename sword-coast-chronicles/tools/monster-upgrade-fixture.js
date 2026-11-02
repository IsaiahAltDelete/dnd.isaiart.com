export async function stageMonsterFixture(id='dire-wolf', zoom=1) {
 const {Game,Party,createCharacter}=window.SC;
 const {newGameState}=await import('/src/state.js');
 const {Encounter}=await import('/src/rules/combat.js');
 const {BattleScene}=await import('/src/ui/combatui.js');
 Game._trans=null;Game.state=newGameState('monster-upgrade');Party.clear();
 Party.add(createCharacter({name:'Rowan',speciesId:'human',classId:'fighter',level:5,backgroundId:'soldier'}));
 const enc=new Encounter({party:Party.members.slice(),enemies:[id],seed:'monster-upgrade'});enc.start();
 const p=enc.units.find(u=>u.side==='party'),foe=enc.units.find(u=>u.side==='foe');
 p.pos={x:7,y:8};foe.pos={x:8,y:8};
 enc.turnIndex=enc.order.indexOf(p.uid);enc.beginTurn();Game.replace(new BattleScene(enc));
 const b=Game.top;b.beats=[];b.beat=null;b.phase='menu';b.banner=null;b.menuDirty=true;b.zoom=zoom;b._recenter();b._recomputeReach(enc.current);
 document.querySelector('#gate')?.classList.remove('show');
 return {id,uid:foe.uid};
}
