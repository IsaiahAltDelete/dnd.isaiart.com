import {areaTiles} from './actions.js';
import {setFlag,progressQuests} from '../state.js';
export const ACADEMY_DRILLS=Object.freeze([
 {id:'precision',title:'Single-target projection',goal:'Hit one amber dummy. Keep the blue observer clear.',shape:{kind:'point'},targets:[{x:5,y:1},{x:6,y:3}],observer:{x:3,y:2},start:{x:3,y:2}},
 {id:'area',title:'Ten-foot burst',goal:'Cover BOTH amber dummies. Keep the blue observer clear.',shape:{kind:'sphere',radius:10},targets:[{x:5,y:1},{x:6,y:3}],observer:{x:3,y:2},start:{x:4,y:2}},
]);
export function academyPreview(drill,aim){
 const cells=areaTiles({x:1,y:4},aim,drill.shape).filter(p=>p.x>=0&&p.x<9&&p.y>=0&&p.y<6),has=p=>cells.some(c=>c.x===p.x&&c.y===p.y);
 const hit=drill.targets.filter(has).length,unsafe=has(drill.observer);
 return {cells,hit,unsafe,pass:!unsafe&&hit>=(drill.id==='area'?2:1)};
}
export function syncAcademy(st){
 for(const f of ['precision','area','focus','west','east','readings'])if(st?.flags?.['academy:'+f])progressQuests(st,'flag','academy:'+f,1);
}
export function passAcademyDrill(st,drill,aim){
 const result=academyPreview(drill,aim);
 if(result.pass&&st){setFlag(st,'academy:'+drill.id,true);syncAcademy(st);}
 return result;
}
