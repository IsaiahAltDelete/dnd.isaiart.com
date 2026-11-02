// Interactive playtest driver: normal clock/input, isolated campaign and origin.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import {loadChromium} from './pwlocate.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]||'output/broadsheet/play');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png'}[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await(await loadChromium()).launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:Number(process.argv[4]||800),height:Number(process.argv[4]||800)*.6}});
const page=await context.newPage(),errors=[],history=[];
const cdp=await context.newCDPSession(page);
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.SC);

// Actual keyboard dialogue and real-time exchange recovery; no manual time stepping.
try {
 const fixture=await page.evaluate(async mapId=>{
  const {Game,Party,createCharacter}=SC;
  const {newGameState}=await import('/src/state.js');
  const {OverworldScene}=await import('/src/world/overworld.js');
  const {loadMap}=await import('/src/world/maps.js');
  Game.state=newGameState('broadsheet-play');Game.state.time=720;Game.state.weather='clear';Game.state.weatherTimer=99999;
  Party.clear();Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'bard',backgroundId:'soldier'}));Game.replace(new OverworldScene());
  const ow=Game.top,m=loadMap(mapId,{seed:'social-a',force:true,cache:false});
  const g=m.streetScenes.find(g=>g.kind==='news'),host=m.entities.find(e=>e.group===g&&e.member===0);
  // Fixture only: start on a public approach. All subsequent actions use keys.
  const a=[[0,1,'up'],[1,0,'left'],[-1,0,'right'],[0,-1,'down']].find(([dx,dy])=>!m.solidAt(host.x+dx,host.y+dy)&&!(m.flagAt(host.x+dx,host.y+dy)&24));
  ow.bindMap(m,host.x+a[0],host.y+a[1],a[2]);
  window.__news={g,host,ow,trace:[],images:[],phases:new Set(),completed:false,last:null,observe:false};
  window.__newsSampler=setInterval(()=>{
   const n=__news,s=n.g.social,p=s?.phase||null;
   if(!n.observe)return;
   if(p!==n.last){
    n.trace.push({time:SC.Game.time,phase:p,pauseT:n.host.pauseT,fleeT:n.host.fleeT,busy:n.host.busy,player:{x:n.ow.player.x,y:n.ow.player.y}});
    if(n.last==='return'&&!p)n.completed=true;
    n.last=p;
   }
   if(p&&!n.phases.has(p)){
    n.phases.add(p);n.images.push({id:p,url:SC.Stage.snapshot()});
   }
  },50);
  document.querySelector('#audio-gate')?.remove();document.querySelector('#gate')?.classList.remove('show');
  return {mapId,host:{x:host.x,y:host.y},player:{x:ow.player.x,y:ow.player.y}};
 },process.argv[3]||'waterdeep');
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>SC.Game.top.id==='dialogue',{timeout:5000});
 await page.waitForTimeout(900);await page.screenshot({path:path.join(out,'dialogue.png')});
 const during=await page.evaluate(()=>({busy:__news.host.busy,pauseT:__news.host.pauseT}));
 for(let i=0;i<10;i++){
  if(await page.evaluate(()=>SC.Game.top.id!=='dialogue'))break;
  await page.keyboard.press('KeyX');await page.waitForTimeout(350);
 }
 if(await page.evaluate(()=>SC.Game.top.id!=='overworld'))throw Error('Dialogue failed to close');
 // Pick a short public route away from the approach, then follow it with held keys.
 const route=await page.evaluate(()=>{
  const {ow,host}=__news,m=ow.map,p=ow.player,opts=[];
  for(let y=host.y-5;y<=host.y+5;y++)for(let x=host.x-5;x<=host.x+5;x++){
   const d=Math.abs(x-host.x)+Math.abs(y-host.y);
   if(d<4||d>6||m.solidAt(x,y)||m.entities.some(e=>!e.hidden&&e.x===x&&e.y===y))continue;
   const path=m.findPath(p,{x,y},{maxNodes:1000,goalPassable:false,avoid:(x,y)=>!!(m.flagAt(x,y)&24)||m.entityBlocks(x,y,p)});
   if(path?.length)opts.push(path);
  }
  opts.sort((a,b)=>a.length-b.length);return opts[0];
 });
 if(!route)throw Error('No public route away');
 for(const next of route){
  const p=await page.evaluate(()=>({x:__news.ow.player.x,y:__news.ow.player.y}));
  const key=next.x>p.x?'ArrowRight':next.x<p.x?'ArrowLeft':next.y>p.y?'ArrowDown':'ArrowUp';
  await page.keyboard.down(key);
  try{await page.waitForFunction(t=>__news.ow.player.x===t.x&&__news.ow.player.y===t.y,next,{timeout:2000,polling:16});}finally{await page.keyboard.up(key);}
  await page.waitForFunction(()=>!__news.ow.player.moving,{timeout:2000});
 }
 await page.evaluate(()=>{__news.observe=true;});
 await page.waitForFunction(()=>__news.completed,null,{timeout:55000});
 const result=await page.evaluate(()=>({completed:__news.completed,phases:[...__news.phases],trace:__news.trace,images:__news.images,busy:__news.host.busy,pauseT:__news.host.pauseT,state:JSON.parse(render_game_to_text())}));
 for(const shot of result.images){fs.writeFileSync(path.join(out,shot.id+'.png'),Buffer.from(shot.url.split(',')[1],'base64'));delete shot.url;}
 await page.screenshot({path:path.join(out,'completed.png')});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({fixture,during,...result,errors},null,2));
 console.log(JSON.stringify({fixture,during,completed:result.completed,phases:result.phases,pauseT:result.pauseT,errors}));
 if(errors.length)process.exitCode=1;
} catch(e){
 const diagnostic=await page.evaluate(()=>window.__news?{busy:__news.host.busy,pauseT:__news.host.pauseT,fleeT:__news.host.fleeT,phase:__news.g.social?.phase,trace:__news.trace,state:JSON.parse(render_game_to_text())}:null).catch(()=>null);
 fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),diagnostic,errors},null,2));
 await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(e);process.exitCode=1;
} finally {await browser.close();server.close();}
