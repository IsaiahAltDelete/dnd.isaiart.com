// Run the develop-web-game skill client with machine/browser discovery and
// an isolated fixture, then exercise the actual keyboard controls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {playwrightUrl} from './pwlocate.mjs';
const kind=process.argv[2]||'portal';
const fixtures={portal:['waterdeep',20,14,'up'],portalinn:['waterdeep',17,17,'down'],elfsong:['elfsong-tavern',12,7,'up'],sundries:['sorcerous-sundries',10,13,'up'],streetwaterdeep:['waterdeep',12,21,'up'],streetwide:['bg-the-wide',28,23,'up'],streetlistener:['waterdeep',12,21,'up'],walkwide:['bg-the-wide',28,23,'down']};
if(!fixtures[kind])throw Error('Unknown fixture');
const out=path.resolve(process.argv[3]||'output/city-art/controls-'+kind);fs.mkdirSync(out,{recursive:true});
let client=fs.readFileSync('C:/Users/Dizzy/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js','utf8');
client=client.replace('from "playwright"',`from ${JSON.stringify(playwrightUrl())}`);
client=client.replace('headless: args.headless,','headless: args.headless, channel: "msedge",');
client=client.replace('up: "ArrowUp",','up: "ArrowUp", e: "KeyE", escape: "Escape",');
const fixture=JSON.stringify(fixtures[kind]);
client=client.replace('let canvas = await getCanvasHandle(page);',`
await page.waitForFunction(()=>window.SC);
await page.evaluate(async()=>{
 const {Game,Party,createCharacter}=SC;
 const {newGameState}=await import('/src/state.js');
 const {OverworldScene,travelTo}=await import('/src/world/overworld.js');
 Game.state=newGameState('city-art-controls');Game.state.time=720;Game.state.weatherTimer=99999;Party.clear();
 Party.add(createCharacter({name:'Arden',speciesId:'human',classId:'bard',backgroundId:'soldier'}));
 Game.replace(new OverworldScene());travelTo(...${fixture});
 if(${JSON.stringify(kind.startsWith('street'))}){
   const ow=Game.scenes.find(s=>s.id==='overworld');
   const host=ow.map.entities.find(e=>e.data?.streetLife&&e.member===${kind==='streetlistener'?1:0}&&e.group.kind==='music');
   if(!host)throw Error('No street performer');
   const approach=[[0,1,'up'],[0,-1,'down'],[-1,0,'right'],[1,0,'left']].find(([dx,dy])=>!ow.map.solidAt(host.x+dx,host.y+dy)&&!ow.map.entitiesAt(host.x+dx,host.y+dy).length);
   if(!approach)throw Error('No approach to performer');
   travelTo(ow.map.id,host.x+approach[0],host.y+approach[1],approach[2]);
 }
 document.querySelector('#audio-gate')?.remove();document.querySelectorAll('.gate').forEach(e=>e.remove());
});
await page.waitForTimeout(1200);
let canvas = await getCanvasHandle(page);`);
fs.writeFileSync(path.join(out,'client.mjs'),client);
const steps=kind==='portal'?[{buttons:['up'],frames:8},{buttons:[],frames:12},{buttons:['space'],frames:1},{buttons:[],frames:120}]:kind==='walkwide'?[{buttons:['right'],frames:12},{buttons:['down'],frames:24},{buttons:[],frames:12}]:[{buttons:['e'],frames:1},{buttons:[],frames:50}];
fs.writeFileSync(path.join(out,'actions.json'),JSON.stringify({steps}));
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname);
 const file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.html':'text/html','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const child=spawn(process.execPath,[path.join(out,'client.mjs'),'--url',`http://127.0.0.1:${server.address().port}/`,'--actions-file',path.join(out,'actions.json'),'--iterations',kind==='walkwide'?'2':'1','--screenshot-dir',out],{stdio:'inherit'});
child.on('exit',code=>{server.close();process.exitCode=code||0;});
