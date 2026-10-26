import assert from 'node:assert/strict';
import {ACADEMY_DRILLS,academyPreview,passAcademyDrill,syncAcademy} from '../src/rules/academy.js';
import {newGameState,startQuest} from '../src/state.js';
import {QUESTS} from '../src/data/quests.js';
import {resolveItem} from '../src/data/items.js';
import {loadMap} from '../src/world/maps.js';
import {isStepTrigger} from '../src/world/tilemap.js';
const st=newGameState('academy');
for(const d of ACADEMY_DRILLS){assert.equal(academyPreview(d,d.start).unsafe,true);assert.equal(passAcademyDrill(st,d,d.start).pass,false);assert(!st.flags['academy:'+d.id]);}
assert(passAcademyDrill(st,ACADEMY_DRILLS[0],{x:5,y:1}).pass);
assert(passAcademyDrill(st,ACADEMY_DRILLS[1],{x:6,y:2}).pass);
startQuest(st,QUESTS['academy-practicum']);syncAcademy(st);syncAcademy(st);
assert.deepEqual(st.quests.active[0].steps.map(s=>s.progress),[1,1,0]);
for(const id of ['academy-practicum','academy-wards'])for(const item of QUESTS[id].rewards.items)assert(resolveItem(item.id));
for(const seed of ['one','two','three']){
 const m=loadMap('blackstaff-court',{state:newGameState(seed),seed,cache:false}),q=[m.spawn],seen=new Set([m.spawn.x+','+m.spawn.y]);
 for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i].x+dx,y=q[i].y+dy,k=x+','+y;if(!m.inBounds(x,y)||m.solidAt(x,y)||seen.has(k))continue;seen.add(k);q.push({x,y});}
 for(const [x,y]of [[7,19],[23,16]]){assert(m.decoAt(x,y)>0);assert(m.triggersAt(x,y).some(t=>t.kind==='quest'&&!isStepTrigger(t.kind)));assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((x+dx)+','+(y+dy))));}
}
console.log('PASS: unsafe/safe casts, pre-enrollment progress sync, idempotent flags, reward items, 3-seed anchor accessibility');
