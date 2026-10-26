import fs from 'node:fs';
import assert from 'node:assert/strict';
import {privatePlaytest} from './private-playtest.mjs';
const out='output/scale/city',run=await privatePlaytest(out),{page,errors}=run;
try {
 await page.evaluate(()=>{SC.newGame();const b=SC.Game.top;b.randomiseAll();b.draft.name='City Tester';b._autoFillPicks();b.finish();});
 await page.waitForFunction(()=>SC.Game.top?.id==='overworld'&&!SC.Game.transitioning);
 const info=await page.evaluate(async()=>{
  const {travelTo}=await import('/src/world/overworld.js'),{visibleTrees}=await import('/src/render/trees.js');
  const T=await import('/src/render/tiles.js');travelTo('waterdeep');const s=SC.Game.top,m=s.map;
  const trees=visibleTrees(m,{x:0,y:0,w:m.w*16,h:m.h*16});
  const candidates=trees.filter(t=>t.x>5&&t.x<m.w-6&&t.y>5&&t.y<m.h-6).map(t=>{
   let walls=0;for(let y=t.y-5;y<t.y+5;y++)for(let x=t.x-5;x<t.x+5;x++)if(['wall','roof'].includes(T.tileGroup(m.at('deco',x,y)))||T.tileGroup(m.at('over',x,y))==='roof')walls++;
   return {...t,walls};
  }).sort((a,b)=>b.walls-a.walls);
  const tree=candidates[0]||trees[0];travelTo('waterdeep',tree?tree.x+2:20,tree?tree.y+2:17,'up');
  SC.Game.state.time=720;s._weatherNow=()=> 'clear';s._applyWeather(true);s.hud.toasts=[];s._snapCamera();
  return {map:m.id,name:m.name,treeCount:trees.length,tree:tree?{x:tree.x,y:tree.y,nearbyWallTiles:tree.walls}:null};
 });
 await page.waitForTimeout(600);
 await page.evaluate(async()=>{const {FX}=await import('/src/render/fx.js');FX.clear(true);FX.weather('none',0);SC.Game.top.banner={text:SC.Game.top.map.name,sub:'City tree scale',t:1};SC.Game._draw();});
 await run.shot('waterdeep-clear');fs.writeFileSync(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 fs.writeFileSync(out+'/report.json',JSON.stringify({info,errors},null,2));assert.equal(errors.length,0);
 console.log('Clear Waterdeep city-tree capture saved',info);
} finally {await run.close();}
