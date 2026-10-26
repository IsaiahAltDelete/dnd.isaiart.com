const {Encounter}=await import('/src/rules/combat.js');
const A=await import('/src/rules/actions.js');
const {startConcentration}=await import('/src/rules/spellcasting.js');
const {addCondition}=await import('/src/rules/conditions.js');
const checks=[],check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
const hero=()=>SC.createCharacter({name:'Probe',speciesId:'human',classId:'fighter',level:5,backgroundId:'soldier'});
const make=(seed='footprints',foes=['ogre','adult-green-dragon'])=>{const e=new Encounter({party:[hero()],enemies:foes,seed,onReaction:()=>true});e.start();return e;};
const e=make(),h=e.units.find(u=>u.side==='party'),ogre=e.units.find(u=>u.monsterId==='ogre'),dragon=e.units.find(u=>u.monsterId==='adult-green-dragon');
const taken=new Set();let overlaps=0,escaped=0;
for(const u of e.units)for(const p of A.footprintTiles(u)){const k=`${p.x},${p.y}`;if(taken.has(k))overlaps++;taken.add(k);if(!e._inBounds(p.x,p.y))escaped++;}
check('deployment reserves all footprint cells',!overlaps&&!escaped,{overlaps,escaped});
ogre.pos={x:6,y:5};dragon.pos={x:14,y:6};h.pos={x:8,y:5};
check('large creature occupies four squares',A.footprintTiles(ogre).length===4);
check('huge creature occupies nine squares',A.footprintTiles(dragon).length===9);
check('far edge of ogre is occupied',A.unitAt(e,7,6)===ogre);
check('edge-adjacent melee distance is five feet',A.distanceFt(h,ogre)===5);
check('overlapping footprints have zero distance',A.distanceFt({...h,pos:{x:7,y:6}},ogre)===0);
check('area touching far edge catches ogre',A.unitsInArea(e,h,{x:7,y:6},{kind:'point'}).includes(ogre));
check('area missing footprint excludes ogre',!A.unitsInArea(e,h,{x:8,y:6},{kind:'point'}).includes(ogre));
check('huge body cannot stop at arena edge',!e._squareFor(dragon,e.w-2,5).stop);
check('occupied footprint blocks other creature',!e._squareFor(h,7,6).stop);
const flags=new Map(),map={w:22,h:15,inBounds:(x,y)=>x>=0&&y>=0&&x<22&&y<15,flagAt:(x,y)=>flags.get(`${x},${y}`)||0};e.map=map;
flags.set('5,6',A.TILE_FLAGS.SOLID|A.TILE_FLAGS.OPAQUE);
check('wall under non-anchor footprint blocks movement',!e._squareFor(ogre,4,5).pass);
flags.clear();for(let y=0;y<15;y++){flags.set(`4,${y}`,A.TILE_FLAGS.SOLID|A.TILE_FLAGS.OPAQUE);flags.set(`6,${y}`,A.TILE_FLAGS.SOLID|A.TILE_FLAGS.OPAQUE);}
check('medium fits one-tile corridor',e._squareFor(h,5,10).pass);
check('ogre cannot squeeze into one-tile corridor',!e._squareFor(ogre,5,10).pass);
check('wall blocks sight',!A.lineOfSight(e,{x:3,y:10},{x:7,y:10}));
flags.clear();flags.set('4,4',A.TILE_FLAGS.SOLID|A.TILE_FLAGS.OPAQUE);
h.pos={x:3,y:4};ogre.pos={x:5,y:3};check('visible part of large target remains targetable',A.lineOfSight(e,h,ogre));
flags.clear();h.pos={x:1,y:1};ogre.pos={x:6,y:5};flags.set('8,6',A.TILE_FLAGS.SLOW);
e.turnIndex=e.order.indexOf(ogre.uid);e.beginTurn();
const node=e.reachableTiles(ogre).get('7,5');check('difficult terrain under any part costs double',node?.cost===10,node);
const move=e.moveUnit(ogre,[{x:7,y:5}]);check('committed movement matches preview cost',move.moved===10,move.moved);
check('teleport cannot overlap wall or leave arena',!e._teleport(ogre,{x:21,y:5},100).ok);
flags.clear();h.pos={x:5,y:5};ogre.pos={x:6,y:5};h.hp=500;e.turnIndex=e.order.indexOf(h.uid);e.beginTurn();ogre._reactionUsed=false;
const reach=A.reachFt(ogre);check('opportunity attack waits until full reach is left',A.opportunityCheck(e,h,{x:5,y:5},{x:4,y:5}).length===(reach>=10?0:1));
const reaction=e.moveUnit(h,[{x:4,y:5},{x:3,y:5},{x:2,y:5}]);check('leaving reach triggers only one reaction',reaction.provoked.length===1&&ogre._reactionUsed,reaction.provoked.length);
check('spent reaction cannot attack again',A.opportunityCheck(e,h,{x:5,y:5},{x:1,y:5}).length===0);
ogre._reactionUsed=false;addCondition(h,'disengaged');check('disengage suppresses opportunity attack',A.opportunityCheck(e,h,{x:5,y:5},{x:1,y:5}).length===0);
startConcentration(h,'bless',[h]);check('concentration starts',!!h.concentration);A.applyDamage(e,h,1000,'force',{source:ogre});check('incapacitation ends concentration',!h.concentration);e._checkEnd();check('all heroes down reaches defeat',e.state==='defeat',e.state);
let win=false,lose=false;
for(let i=0;i<20&&(!win||!lose);i++){const f=make('flee-'+i,['goblin']),p=f.units.find(u=>u.side==='party');f.turnIndex=f.order.indexOf(p.uid);f.beginTurn();const before=f.budget.action,r=f.fleeCheck(p);if(r.success){win=true;check('successful retreat ends encounter',f.state==='fled');}else{lose=true;check('failed retreat costs one action',f.budget.action===before-1);}}
check('both retreat outcomes exercised',win&&lose);
flags.clear();ogre.pos={x:6,y:5};ogre.hp=100;h.pos={x:5,y:5};h.hp=100;
check('push ignores own previous footprint',A.pushCreature(e,h,ogre,5)===5 && ogre.pos.x===7);
flags.set('9,6',A.TILE_FLAGS.SOLID);
check('push stops when far edge meets wall',A.pushCreature(e,h,ogre,5)===0 && ogre.pos.x===7);
flags.clear();ogre.pos={x:20,y:5};h.pos={x:19,y:5};
check('push cannot send footprint beyond arena',A.pushCreature(e,h,ogre,10)===0);
flags.clear();ogre.pos={x:5,y:5};h.pos={x:1,y:1};
check('large teleport uses the same edge range as preview',e._teleport(ogre,{x:12,y:5},30).ok&&ogre.pos.x===12);
const {takeTurn}=await import('/src/rules/ai.js');
const {makeMonster}=await import('/src/rules/scaling.js');
const venom=makeMonster('venomfang',{seed:'legendary-cost'});
check('two-point legendary cost survives stat block conversion',venom.legendary.actions.find(a=>a.id==='wing-attack').cost===2);
ogre.pos={x:6,y:6};
const threat=e.threatTiles(ogre),has=(x,y)=>threat.some(p=>p.x===x&&p.y===y);
check('large threat overlay covers every edge',has(5,6)&&has(8,6)&&has(6,5)&&has(6,8));
check('large threat overlay excludes its own footprint',A.footprintTiles(ogre).every(p=>!has(p.x,p.y)));
for(const pos of [{x:8,y:6},{x:6,y:8}]){
 ogre.pos={x:6,y:6};h.pos=pos;h.hp=100;ogre.hp=100;e.turnIndex=e.order.indexOf(ogre.uid);e.beginTurn();
 const plan=takeTurn(e,ogre);
 check('ogre attacks adjacent far edge '+pos.x+','+pos.y,plan.some(p=>p.kind==='action'&&p.optionId.startsWith('mact:')),plan);
}
const {TileMap}=await import('/src/world/tilemap.js');
const tiny=new TileMap({id:'tiny',w:1,h:1});
const blocked=new Encounter({party:[hero()],enemies:['ogre'],map:tiny});blocked.start();
check('impossible deployment is explicitly blocked',blocked.state==='blocked'&&!!blocked.setupError);
const {buildBattleMap}=await import('/src/world/battlemap.js');
const {loadMap}=await import('/src/world/maps.js');
for(const id of ['thundertree','cragmaw-hideout','waterdeep']){
 const source=loadMap(id,{state:SC.Game.state,seed:'terrain-check',cache:false});
 const arena=buildBattleMap({sourceMap:source,sourceX:source.spawn.x,sourceY:source.spawn.y,biome:source.biome,seed:'terrain-'+id,party:[hero()],foes:2});
 const battle=new Encounter({party:[hero()],enemies:['ogre','goblin'],map:arena,seed:'terrain-'+id});battle.start();
 check(id+': actual terrain deploys encounter',battle.state==='active',battle.state);
 const occupied=new Set();let valid=true;
 for(const u of battle.units)for(const p of A.footprintTiles(u)){const k=`${p.x},${p.y}`;if(occupied.has(k)||!battle._inBounds(p.x,p.y)||battle._isSolid(p.x,p.y))valid=false;occupied.add(k);}
 check(id+': footprint deployment clear of terrain and units',valid);
 for(const u of battle.units){battle.turnIndex=battle.order.indexOf(u.uid);battle.beginTurn();const reach=battle.reachableTiles(u);check(id+': '+u.name+' paths end on legal footprints',[...reach.values()].every(n=>battle._squareFor(u,n.x,n.y).stop));}
}
return{checks};

