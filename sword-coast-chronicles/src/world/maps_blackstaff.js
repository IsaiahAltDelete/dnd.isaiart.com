// Original playable ground-floor interpretation; lore sources: docs/overhaul/blackstaff.md.
import {TileMap} from './tilemap.js';
import {tid} from './mapgen.js';
import {floor,floorRect,dset,prop,groundNoise,table,reservedFor,sweepStanding,sealBorder,openDoorway,addSign,interiorMap,room,finishInterior,building} from './mapkit.js';

function court(root){
 const map=new TileMap({id:'blackstaff-court',name:'Blackstaff Court',w:31,h:25,biome:'city',indoor:false,safe:true,encounterRate:0,region:'waterdeep',music:'city'}),res=reservedFor(map.id);
 groundNoise(map,root.fork('paving'),0,0,31,25,table([['COBBLE',6],['FLAGSTONE',3]]));
 // A dark, windowless mass above a small working courtyard, not another shopfront.
 floorRect(map,9,2,13,13,tid('FLAGSTONE'));
 // Raised coping and a roof receding northeast expose a real side plane.
 // The seamless face remains windowless, but reads as a tall stone volume.
 for(let y=5;y<=11;y++)dset(map,19,y,tid('BLACKSTAFF_SIDE'));
 for(let y=4;y<=10;y++)dset(map,20,y,tid('BLACKSTAFF_SIDE_EDGE'));
 for(let x=13;x<=20;x++)dset(map,x,3,tid('BLACKSTAFF_ROOF'));
 for(let x=12;x<=19;x++)dset(map,x,4,tid('BLACKSTAFF_ROOF'));
 for(let y=5;y<=12;y++)for(let x=11;x<=18;x++)dset(map,x,y,tid(y===5?'BLACKSTAFF_CORNICE':y===12?'BLACKSTAFF_PLINTH':x===11?'BLACKSTAFF_LEFT':x===12?'BLACKSTAFF_FACE_LIGHT':x===13?'BLACKSTAFF_FACE_MID':x===18?'BLACKSTAFF_RIGHT':'BLACKSTAFF_STONE'));
 dset(map,19,11,tid('BLACKSTAFF_PLINTH'));dset(map,20,10,tid('BLACKSTAFF_PLINTH'));
 dset(map,15,12,tid('BLACKSTAFF_THRESHOLD'));
 for(const [x,y,k]of [[10,14,'BRAZIER'],[20,14,'BRAZIER'],[10,17,'BENCH'],[20,17,'BENCH'],[7,17,'PLANTER'],[23,17,'PLANTER'],[6,21,'CART'],[8,21,'CRATE'],[8,20,'SACK'],[22,21,'LANTERN']])prop(map,x,y,tid(k),res);
 // Neighbours frame the approach; the routes to the tower and east street stay open.
 building(map,{x:2,y:4,w:6,h:7,wall:'PLASTER_WALL',roof:'slate',door:null,windows:[1,4]},res);
 building(map,{x:23,y:5,w:6,h:6,wall:'BRICK_WALL',roof:'tile',door:null,windows:[1,4]},res);
 floorRect(map,13,13,5,9,tid('FLAGSTONE'));floorRect(map,15,19,15,3,tid('FLAGSTONE'));
 map.recomputeFlags({keep:0});sealBorder(map,tid('STONE_WALL'));
 for(let x=28;x<=30;x++)for(let y=19;y<=21;y++)openDoorway(map,x,y);
 sweepStanding(map,map.id);map.spawn={x:28,y:20};map.entry={...map.spawn};
 for(const [x,y]of [[14,14],[27,18],[9,20]])map.stamp('deco',x,y,tid('SIGN'));
 addSign(map,14,14,'BLACKSTAFF TOWER — Castle Ward. Visitors may approach the silver ward-mark. The dark stone admits those entering the reception hall; private chambers remain warded.','Tower Notice');
 addSign(map,27,18,'EAST — Trades Ward and the Yawning Portal.','Street Sign');
 addSign(map,9,20,'DELIVERIES: components on the left, lunch on the right. The distinction is no longer optional.','Delivery Notice');
 for(const [x,y,id] of [[7,19,'academy-west-anchor'],[23,16,'academy-east-anchor']]){
  map.stamp('deco',x,y,tid('CRYSTAL'));
  map.addTrigger({id,kind:'quest',x,y,data:{dialogueId:id}});
 }
 return map;
}
function hall(){
 const map=interiorMap({id:'blackstaff-tower',name:'Blackstaff Tower',w:26,h:20,region:'waterdeep',music:'temple',ambient:{color:'#22233c',alpha:0.10}}),res=reservedFor(map.id);
 const rm=room(map,{w:26,h:20,floor:'STONE_FLOOR',wall:'STONE_WALL',exit:13,rooms:[
  {x:0,y:0,w:9,h:11,door:'e',floor:'WOOD_FLOOR',name:'Reading room'},
  {x:18,y:0,w:8,h:11,door:'w',floor:'STONE_FLOOR',name:'Practice room'},
 ]});
 floorRect(map,11,4,5,12,tid('CARPET_BLUE'));
 for(const x of [2,3,4,5,6])prop(map,x,1,tid('BOOKSHELF'),res);
 for(const [x,y,k]of [[2,5,'TABLE'],[3,5,'TABLE'],[2,6,'CHAIR'],[6,7,'LECTERN'],[2,8,'CANDLE'],[6,3,'BOOKSHELF'],[20,2,'SHELF_GOODS'],[23,2,'CRYSTAL'],[23,7,'BARREL'],[21,5,'LECTERN'],[20,8,'CANDLE'],[11,3,'TABLE'],[12,3,'TABLE'],[14,3,'TABLE'],[15,3,'CANDLE'],[10,12,'PILLAR'],[16,12,'PILLAR'],[3,14,'HEARTH'],[4,16,'TABLE'],[5,16,'CHAIR'],[7,16,'SHELF_GOODS'],[21,14,'TABLE'],[22,14,'TABLE'],[22,15,'CHAIR'],[23,17,'CRATE']])prop(map,x,y,tid(k),res);
 floor(map,13,9,tid('BLACKSTAFF_SEAL'));floor(map,21,7,tid('BLACKSTAFF_SEAL'));
 for(const [x,y,k]of [[7,12,'TABLE'],[6,12,'CHAIR'],[7,13,'CANDLE'],[18,13,'BENCH'],[18,16,'BOOKSHELF'],[4,15,'BENCH']])prop(map,x,y,tid(k),res);
 finishInterior(map,rm.exit,res,{seal:'STONE_WALL',threshold:true});
 addSign(map,6,7,'A margin in the primer reads: "A spell slot measures what you can spend. Preparation decides what is ready. Neither tells you what you ought to do." Beneath it, another hand has added: "Ask before borrowing my ink."','Reading Primer');
 addSign(map,21,5,'PRACTICE NOTES: choose a clear target; check the area beyond it. Concentration can be broken. Read each spell before committing. Someone has underlined "clear" three times.','Practice Notes');
 addSign(map,14,3,'A slate lists leaking wards, a missing library key and a complaint about a singing kettle. Waterdeep does not run out of magical business merely because there is no dragon overhead.','Work Slate');
 return map;
}
export const REGION_MAPS={
 'blackstaff-court':{name:'Blackstaff Court',kind:'city',biome:'city',w:31,h:25,safe:true,region:'waterdeep',music:'city',level:8,build:court,desc:'A dark tower rises beyond a busy delivery court in Waterdeep’s Castle Ward.'},
 'blackstaff-tower':{name:'Blackstaff Tower',kind:'interior',biome:'city',w:26,h:20,indoor:true,safe:true,region:'waterdeep',music:'temple',level:8,build:hall,desc:'Vajra Safahr receives visitors among the academy’s books, wards and interrupted lessons.'},
};
export const REGION_LINKS=[
 {a:'waterdeep',aWarp:[1,7],aLand:[3,7],b:'blackstaff-court',bWarp:[29,20],bLand:[27,20],toB:'left',toA:'right',kind:'road'},
 {a:'blackstaff-court',aWarp:[15,12],aLand:[15,14],b:'blackstaff-tower',bWarp:[13,19],bLand:[13,17],toB:'up',toA:'down',kind:'door'},
];
