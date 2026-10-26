import assert from 'node:assert/strict';
import {registerTiles,T,TF,tileFlags} from '../src/render/tiles.js';
import {generateDungeon} from '../src/world/mapgen.js';
import {dungeonSceneryPlan} from '../src/render/dungeon-scenery.js';
registerTiles();
for(const key of ['PILLAR','BARREL','CRATE','BUSH'])assert.equal(tileFlags(T[key]),TF.SOLID,key);
assert.equal(tileFlags(T.RUBBLE),TF.SLOW);assert.equal(tileFlags(T.BERRY_BUSH),TF.SOLID|TF.TRIGGER);
let rooms=0,items=0;const roles=new Set();
for(const theme of ['dungeon','crypt'])for(let seed=0;seed<20;seed++){
 const map=generateDungeon({theme,seed:'scenery-coverage-'+seed,depth:3});
 const before=JSON.stringify([map.ground,map.deco,map.flags,map.triggers]);
 const plan=dungeonSceneryPlan(map);
 for(const room of plan){
  rooms++;roles.add(room.role);items+=room.items.length;
  assert(room.items.some(i=>i.frame===({bunkroom:'bedroll',stores:'ledger',watch:'rack',devotion:'relief'}[room.role])),'Role must retain its defining element');
  assert.equal(new Set(room.items.map(i=>i.x+','+i.y)).size,room.items.length,'No stacked decorations');
  for(const i of room.items){
   if(i.wall)assert.equal(map.at('deco',i.x,i.y),T.DUNGEON_WALL);
   else{assert(!map.solidAt(i.x,i.y));assert(!map.triggerAt(i.x,i.y));assert(!map.at('deco',i.x,i.y));}
  }
 }
 for(const r of map.rooms){
  if(r.w<5||r.h<5||['boss','entry','exit'].includes(r.kind))continue;
  // Even a completely furnished floor can carry a defining wall fitting.
  const hasWall=Array.from({length:r.w},(_,i)=>map.at('deco',r.x+i,r.y-1)).includes(T.DUNGEON_WALL);
  if(hasWall)assert(plan.some(p=>p.room===r.id),'A room with a usable wall must not silently lose all dressing');
 }
 assert.equal(JSON.stringify([map.ground,map.deco,map.flags,map.triggers]),before,'Plans never mutate the map');
}
assert.equal(roles.size,4);
console.log(JSON.stringify({passed:true,maps:40,rooms,items,roles:[...roles],propFlags:6}));
