// Interactive playtest driver: normal clock/input, isolated campaign and origin.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import {loadChromium} from './pwlocate.mjs';
const root=process.cwd(),out=path.resolve('output/playwright/city-playtest-routes');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png'}[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await(await loadChromium()).launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:800,height:480}});
const page=await context.newPage(),errors=[],history=[];
const cdp=await context.newCDPSession(page);
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.SC);
let count=0;
async function capture(label){
 const state=await page.evaluate(()=>JSON.parse(render_game_to_text()));
 const name=String(++count).padStart(2,'0')+'-'+label;
 await page.screenshot({path:path.join(out,name+'.png')});
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(state,null,2));
 const compact={name,mode:state.mode,map:state.map,player:state.player,trade:state.trade,standing:state.standing,npcs:state.npcs?.filter(e=>Math.abs(e.x-state.player.x)+Math.abs(e.y-state.player.y)<8),errors};
 history.push({time:new Date().toISOString(),...compact});fs.writeFileSync(path.join(out,'session.json'),JSON.stringify(history,null,2));
 console.log(JSON.stringify(compact));
}
async function run(c){
 await cdp.send('Page.setWebLifecycleState',{state:'active'});
 if(c.stage){
  await page.evaluate(async map=>{
   const {Game,Party,createCharacter}=SC;
   const {newGameState}=await import('/src/state.js');const {OverworldScene,travelTo}=await import('/src/world/overworld.js');
   Game.state=newGameState('city-playtest-oct21-'+Date.now());Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;
   Party.clear();Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'bard',backgroundId:'soldier'}));
   Party.addGold(50);
   Game.replace(new OverworldScene());travelTo(map);
  },c.stage);
  await page.keyboard.press('Space');
 }
 if(c.walk){
  const route=await page.evaluate(target=>{
   const ow=SC.Game.scenes.find(s=>s.id==='overworld'),m=ow.map,p=ow.player;
   const npc=typeof target==='string'?m.entities.find(e=>e.npcId===target):null;
   if(typeof target==='string'&&!npc)throw Error('NPC not on map');
   const candidates=npc?[[0,1],[1,0],[-1,0],[0,-1]].map(([dx,dy])=>({x:npc.x+dx,y:npc.y+dy})):[target];
   const paths=candidates.filter(t=>!m.solidAt(t.x,t.y)).map(t=>({target:t,path:m.findPath(p,t,{maxNodes:6000,goalPassable:false,avoid:(x,y)=>m.entityBlocks(x,y,p)||!!(m.flagAt(x,y)&24)})})).filter(r=>r.path?.length);
   paths.sort((a,b)=>a.path.length-b.path.length);if(!paths.length)throw Error('No clear approach');
   return {map:m.id,steps:paths[0].path,npc:npc?{x:npc.x,y:npc.y}:null};
  },c.walk);
  let steps=0;
  for(const next of route.steps){
   const p=await page.evaluate(()=>JSON.parse(render_game_to_text()).player);
   const key=next.x>p.x?'ArrowRight':next.x<p.x?'ArrowLeft':next.y>p.y?'ArrowDown':'ArrowUp';
   await page.keyboard.down(key);
   try{await page.waitForFunction(t=>{const s=JSON.parse(render_game_to_text());return s.player.x===t.x&&s.player.y===t.y;},next,{timeout:1400,polling:16});}
   finally{await page.keyboard.up(key);}
   await page.waitForFunction(()=>!JSON.parse(render_game_to_text()).player.moving,{timeout:1000});steps++;
  }
  console.log('Walked '+steps+' tiles with keyboard input.');
  if(c.talk&&route.npc){
   const p=await page.evaluate(()=>JSON.parse(render_game_to_text()).player),n=route.npc;
   const key=n.x>p.x?'ArrowRight':n.x<p.x?'ArrowLeft':n.y>p.y?'ArrowDown':'ArrowUp';
   await page.keyboard.press(key);await page.waitForTimeout(250);await page.keyboard.press('KeyE');
  }
 }
 if(c.keys)for(const [key,ms=0]of c.keys){if(ms){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}else await page.keyboard.press(key);await page.waitForTimeout(150);}
 if(c.click)await page.mouse.click(...c.click);
 if(c.wait)await page.waitForTimeout(c.wait);
 if(c.reload){await page.reload();await page.waitForFunction(()=>window.SC);await page.keyboard.press('Space');}
 if(c.end){await context.close();await browser.close();server.close();console.log('PLAYTEST CLOSED');return false;}
 await capture(c.label||'play');
 // Pause browser execution between observations, as a human would pause while
 // taking notes. During every input/observation burst the normal game clock runs.
 await cdp.send('Page.setWebLifecycleState',{state:'frozen'});return true;
}
await run({stage:'waterdeep',wait:1200,label:'waterdeep-start'});
console.log('READY: JSON commands {keys:[[key,heldMs]],wait,click:[x,y],label,stage,reload,end}');
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{if(!await run(JSON.parse(line)))break;}catch(e){console.log('COMMAND ERROR '+e.stack);}
}
