import {TileMap} from '/src/world/tilemap.js';
import {T} from '/src/render/tiles.js';
import {Entity} from '/src/world/entity.js';
export async function stageGrove(){
 const s=SC.Game.top,map=new TileMap({id:'tree-visibility-grove',name:'Canopy Test Grove',w:32,h:24,ground:T.GRASS});map.safe=true;
 for(const [x,y]of [[9,10],[10,10],[9,11],[10,11],[9,12],[10,12]])map.set('deco',x,y,T.TREE_WILLOW);
 for(let x=3;x<28;x+=3)map.set('deco',x,5,x%2?T.TREE_PINE:T.TREE_OAK);
 map.recomputeFlags();s.bindMap(map,8,9,'right');s.encounterGrace=10000;s.banner=null;s.hud.toasts=[];
 s.entities.add(new Entity({kind:'npc',id:'grove-guide',name:'Guide',x:10,y:9,solid:false,char:SC.createCharacter({name:'Guide',speciesId:'halfling',classId:'cleric',backgroundId:'acolyte'})}));
 s._weatherNow=()=> 'clear';s._applyWeather(true);s._snapCamera();
}
export async function stageTreeBattle(zoom=1){
 await(await import('/tools/monster-upgrade-fixture.js')).stageMonsterFixture('dire-wolf',zoom);
 const b=SC.Game.top,m=new TileMap({id:'tree-combat-grove',w:b.enc.w,h:b.enc.h,ground:T.GRASS});
 for(const [x,y]of [[7,10],[8,10],[7,11],[8,11],[7,12],[8,12]])m.set('deco',x,y,T.TREE_WILLOW);
 for(const [x,y]of [[3,7],[12,7],[4,12],[13,12]])m.set('deco',x,y,T.TREE_PINE);
 m.recomputeFlags();b.enc.map=m;b._recomputeReach(b.enc.current);
 return {zoom};
}
