import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {loadChromium} from './pwlocate.mjs';
export async function privatePlaytest(out,scale=2){
 fs.mkdirSync(out,{recursive:true});const root=process.cwd();
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.wav':'audio/wav','.css':'text/css'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(await loadChromium()).launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:400*scale,height:240*scale}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.SC);
 await page.keyboard.press('Space');
 return {page,errors,shot:name=>page.screenshot({path:path.join(out,name+'.png')}),close:async()=>{await browser.close();server.close();}};
}
