export async function stageSpellBattle(){
 const {Game,Party,createCharacter}=SC;
 Game.state=(await import('/src/state.js')).newGameState('spell-animation');Party.clear();
 const h=createCharacter({name:'Mara',classId:'wizard',speciesId:'human',level:5,backgroundId:'sage'});
 h.spells.cantrips=['thorn-whip','fire-bolt','acid-splash'];h.spells.known=['sleep','hold-person','dispel-magic','shatter','misty-step','burning-hands','lightning-bolt'];h.spells.prepared=[...h.spells.known];Party.add(h);
 const {Encounter}=await import('/src/rules/combat.js'),{BattleScene}=await import('/src/ui/combatui.js');
 const enc=new Encounter({party:Party.members,enemies:['ogre','goblin'],seed:'spell-animation'});enc.start();
 const hero=enc.units.find(u=>u.side==='party'),foes=enc.units.filter(u=>u.side==='foe');hero.pos={x:6,y:6};foes[0].pos={x:8,y:6};foes[1].pos={x:10,y:8};foes[0].hp=foes[0].maxHp=500;
 enc.turnIndex=enc.order.indexOf(hero.uid);enc.beginTurn();Game.replace(new BattleScene(enc));
 const b=Game.top;b.beats=[];b.beat=null;b.banner=null;b.phase='menu';b.menuDirty=true;b._recenter();
 document.querySelector('#gate')?.classList.remove('show');
}
