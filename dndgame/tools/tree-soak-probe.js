import {visibleTrees,drawTree,treeAlpha} from '/src/render/trees.js';
import {T} from '/src/render/tiles.js';
import {TileMap} from '/src/world/tilemap.js';
export function stats(a){const s=a.slice().sort((a,b)=>a-b);return {n:s.length,p50:s[Math.floor(s.length*.5)]||0,p95:s[Math.floor(s.length*.95)]||0,max:s.at(-1)||0};}
export function visibilityProbe(api={visibleTrees,drawTree,treeAlpha}) {
 const cases=[];
 for(const count of [1,2,4,6]) {
  const map=new TileMap({w:16,h:16});
  const coords=[[7,8],[8,8],[7,9],[8,9],[7,10],[8,10]];
  coords.slice(0,count).forEach(([x,y])=>map.set('deco',x,y,T.TREE_WILLOW));
  const actor={x:128,y:132,w:12,h:24};
  const trees=api.visibleTrees(map,{x:0,y:0,w:256,h:256},[actor]);
  const paint=body=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#000';g.fillRect(0,0,256,256);if(body){g.fillStyle='#fff';g.fillRect(122,108,12,24);}for(const t of trees)api.drawTree(g,t,{x:0,y:0},1,[actor]);return g.getImageData(122,108,12,24).data;};
  const on=paint(true),off=paint(false),retention=[];
  for(let i=0;i<on.length;i+=4)retention.push(Math.abs(on[i]-off[i])/255);
  cases.push({count,min:Math.min(...retention),...stats(retention)});
 }
 // A tall sprite whose feet are beyond the old point-only fade test.
 const t={id:T.TREE_OAK,px:128,py:160,w:36,h:48};
 const tall={x:154,y:155,w:48,h:64};
 return {cases,wideBodyAlpha:api.treeAlpha(t,[tall])};
}
export async function benchmark() {
 const G=SC.Game,s=G.top,map=s.map||s.enc.map,world=s.id==='overworld';
 const view=world?{x:s.camDraw.x,y:s.camDraw.y,w:400,h:240}:(()=>{const o=s._origin();return{x:-o.x/s.zoom,y:(20-o.y)/s.zoom,w:400/s.zoom,h:190/s.zoom};})();
 const actors=world?s.entities.list.filter(e=>!e.hidden&&!e.removed).map(e=>({x:e.px,y:e.py})):s.enc.units.map(u=>{const p=s._uiOf(u,true);return{x:p.x,y:p.y};});
 const canvas=document.createElement('canvas');canvas.width=400;canvas.height=240;const ctx=canvas.getContext('2d');
 const full=[],noCrowns=[],treePass=[];const at=map.at;
 const {isTreeTile}=await import('/src/render/trees.js');
 const suppressed=function(layer,x,y){const id=at.call(this,layer,x,y);return layer!=='ground'&&isTreeTile(id)?0:id;};
 for(let i=0;i<24;i++) {
  const measure=omit=>{map.at=omit?suppressed:at;const t=performance.now();try{G._draw();return performance.now()-t;}finally{map.at=at;}};
  if(i%2){noCrowns.push(measure(true));full.push(measure(false));}else{full.push(measure(false));noCrowns.push(measure(true));}
  const t=performance.now(),trees=visibleTrees(map,view,actors);for(const tree of trees)drawTree(ctx,tree,{x:view.x,y:view.y},1,actors);treePass.push(performance.now()-t);
 }
 G._draw();return {map:map.id,trees:visibleTrees(map,view,actors).length,full:stats(full.slice(4)),noCrowns:stats(noCrowns.slice(4)),treePass:stats(treePass.slice(4))};
}
export function startMetrics(){
 if(!window.treeMetrics){const G=SC.Game;window.treeMetrics={draw:[],update:[],frame:[],active:false,last:0};for(const [method,key]of [['_draw','draw'],['_update','update']]){const original=G[method];G[method]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{if(treeMetrics.active)treeMetrics[key].push(performance.now()-t);}};}const tick=t=>{const m=treeMetrics;if(m.active&&m.last)m.frame.push(t-m.last);m.last=m.active?t:0;requestAnimationFrame(tick);};requestAnimationFrame(tick);}
 for(const k of ['draw','update','frame'])treeMetrics[k]=[];
 treeMetrics.active=true;treeMetrics.last=0;
 return {at:performance.now(),heap:performance.memory?.usedJSHeapSize||null};
}
export function endMetrics(start){treeMetrics.active=false;return {elapsedMs:performance.now()-start.at,heap:performance.memory?.usedJSHeapSize||null,...Object.fromEntries(['draw','update','frame'].map(k=>[k,stats(treeMetrics[k])]))};}
