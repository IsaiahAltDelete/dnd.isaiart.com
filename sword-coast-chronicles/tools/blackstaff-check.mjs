import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadMap,WORLD_NODES} from '../src/world/maps.js';
import {BLACKSTAFF_CAST,BLACKSTAFF_DIALOGUE} from '../src/data/blackstaff.js';
import {newGameState} from '../src/state.js';
const results=[];
for(const seed of ['blackstaff-one','blackstaff-two','blackstaff-three'])for(const id of ['waterdeep','blackstaff-court','blackstaff-tower']){
 const m=loadMap(id,{state:newGameState(seed),seed,cache:false}),start=m.spawn,q=[start],seen=new Set([start.x+','+start.y]);
 for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i].x+dx,y=q[i].y+dy,k=x+','+y;if(!m.inBounds(x,y)||m.solidAt(x,y)||seen.has(k))continue;seen.add(k);q.push({x,y});}
 for(const w of WORLD_NODES.filter(n=>n.from===id))assert(seen.has(w.fromXY.x+','+w.fromXY.y),seed+' inaccessible warp '+w.id);
 for(const n of BLACKSTAFF_CAST.filter(n=>n.map===id)){assert(!m.solidAt(n.x,n.y));assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((n.x+dx)+','+(n.y+dy))));}
 for(const [x,y]of (id==='waterdeep'?[[4,8]]:id==='blackstaff-court'?[[14,14],[27,18],[9,20]]:[])){
  assert(m.decoAt(x,y)>0&&m.solidAt(x,y),'Visible physical sign');assert(m.triggersAt(x,y).some(t=>t.kind==='sign'));
  assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((x+dx)+','+(y+dy))),'Sign approachable');
 }
 results.push({seed,id,reachableTiles:seen.size,warps:WORLD_NODES.filter(n=>n.from===id).map(w=>w.id)});
}
for(const tree of Object.values(BLACKSTAFF_DIALOGUE))for(const n of Object.values(tree.nodes))for(const dest of [n.goto,...(n.choices||[]).map(c=>c.goto)].filter(Boolean))assert(tree.nodes[dest],dest);
fs.mkdirSync('output/blackstaff',{recursive:true});fs.writeFileSync('output/blackstaff/rules.json',JSON.stringify(results,null,2));console.log('PASS: 3 seeds × 3 maps, every warp reachable, NPC approaches and dialogue links');
