// Run the develop-web-game skill client with machine/browser discovery and
// an isolated fixture, then exercise the actual keyboard controls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {playwrightUrl} from './pwlocate.mjs';
const kind=process.argv[2]||'combatselection';
const fixtures={combatselection:['waterdeep',21,3,'up'],portal:['waterdeep',20,14,'up'],portalinn:['waterdeep',17,17,'down'],elfsong:['elfsong-tavern',12,7,'up'],sundries:['sorcerous-sundries',10,13,'up'],streetwaterdeep:['waterdeep',12,21,'up'],streetwide:['bg-the-wide',28,23,'up'],streetlistener:['waterdeep',12,21,'up'],walkwide:['bg-the-wide',28,23,'down']};
if(!fixtures[kind])throw Error('Unknown fixture');
const out=path.resolve(process.argv[3]||'output/city-art/controls-'+kind);fs.mkdirSync(out,{recursive:true});
let client=fs.readFileSync('C:/Users/Dizzy/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js','utf8');
client=client.replace('from "playwright"',`from ${JSON.stringify(playwrightUrl())}`);
client=client.replace('headless: args.headless,','headless: args.headless, channel: "msedge",');
client=client.replace('up: "ArrowUp",','up: "ArrowUp", e: "KeyE", escape: "Escape",');
const fixture=JSON.stringify(fixtures[kind]);
client=client.replace('let canvas = await getCanvasHandle(page);', `
await page.waitForFunction(()=>window.SC);
await page.evaluate(async()=>{
  const {Game,Party,createCharacter}=SC;
  const {newGameState}=await import('/src/state.js');
  const {Encounter}=await import('/src/rules/combat.js');
  const {BattleScene}=await import('/src/ui/combatui.js');
  Game.state=newGameState('selection-play');Party.clear();
  Party.add(createCharacter({name:'Mara',speciesId:'human',classId:'fighter',backgroundId:'soldier'}));
  const enc=new Encounter({party:Party.members.slice(),enemies:['goblin','goblin','wolf'],seed:'shot'});enc.start();
  enc.turnIndex=enc.order.indexOf(enc.units.find(u=>u.side==='party').uid);enc.beginTurn();
  Game.replace(new BattleScene(enc));const b=Game.top;b.beats=[];b.beat=null;b.phase='menu';b.banner=null;b.menuDirty=true;b._recenter();
  document.querySelector('#gate')?.classList.remove('show');
 });

await page.waitForTimeout(1200);
let canvas = await getCanvasHandle(page);`);
client=client.replace('for (let i = 0; i < args.iterations; i++) {', `const hit=await page.evaluate(()=>{const b=SC.Game.top,h=b._railHits.find(h=>h.u.side==='foe');return{x:(h.x+h.w/2)*2,y:h.h};});steps[0].mouse_x=hit.x;steps[0].mouse_y=hit.y;
for (let i = 0; i < args.iterations; i++) {`);
fs.writeFileSync(path.join(out,'client.mjs'),client);
const steps=[{buttons:['left_mouse_button'],frames:1},{buttons:[],frames:90}];
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
