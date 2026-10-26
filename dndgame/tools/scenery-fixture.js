// Disposable browser fixture only. Never imported by the shipped game.
export async function stageSceneryWalk(){
  await(await import('./ground-design-fixture.js')).stageGroundDungeon('redbrand-hideout-3');
  const {travelTo}=await import('../src/world/overworld.js');
  const {dungeonSceneryPlan}=await import('../src/render/dungeon-scenery.js');
  const m=SC.Game.top.map,plans=dungeonSceneryPlan(m),plan=plans.find(p=>p.role==='bunkroom')||plans[0];
  const r=m.rooms.find(r=>r.id===plan.room),safe=(x,y)=>!m.solidAt(x,y)&&!m.triggerAt(x,y)&&!m.at('deco',x,y);
  for(let y=r.y+1;y<r.y+r.h-1;y++)for(let x=r.x+1;x<r.x+r.w-2;x++){
    if(![0,1,2].every(dx=>safe(x+dx,y)))continue;
    travelTo('redbrand-hideout-3',x,y,'right');SC.Game.top._spellLight(20,'light',60);return {x,y};
  }
  throw Error('No safe scenery walking route in fixture');
}
