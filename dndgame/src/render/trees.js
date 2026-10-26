// Trees have tile-sized collision roots, but crowns live above the ground plane.
// Both world and battle use these same dimensions and feet-sorted drawings.
import { T, drawTile, tileHash } from './tiles.js';

const SINGLE = new Map([
  [T.TREE_OAK, [36, 48]], [T.TREE_PINE, [28, 56]],
  [T.TREE_BIRCH, [28, 48]], [T.TREE_WILLOW, [42, 48]],
  [T.DEAD_TREE, [32, 48]],
]);
const PARTS = new Map();
for (const family of ['OAK','PINE']) ['TL','TR','BL','BR'].forEach((part,i)=>PARTS.set(T[family+'_'+part],{id:T[family+'_TL'],dx:i%2,dy:Math.floor(i/2)}));
export function isTreeTile(id) { return SINGLE.has(id) || PARTS.has(id); }

function obscures(tree, a) {
  // Use the rendered body, not just its feet: wide creatures, shorter people,
  // and toppled combatants can overlap a crown while their feet lie outside it.
  const left=a.left??a.x-(a.w??16)/2, right=a.right??a.x+(a.w??16)/2;
  const top=a.top??a.y-(a.h??24), bottom=a.bottom??a.y;
  return a.y<tree.py && right>tree.px-tree.w/2 && left<tree.px+tree.w/2 &&
    bottom>tree.py-tree.h && top<tree.py;
}
export function treeAlpha(tree, actors = []) {
  return actors.some(a=>obscures(tree,a)) ? 0.35 : 1;
}
function prepareVisibility(trees,actors) {
  for(const tree of trees)tree.alpha=1;
  for(const actor of actors) {
    const overlap=trees.filter(tree=>obscures(tree,actor));
    // Source-over transmission multiplies. Share the opacity allowance among
    // all overlapping crowns so the body retains >=65% contrast even in a grove.
    const alpha=1-Math.pow(0.65,1/Math.max(1,overlap.length));
    for(const tree of overlap)tree.alpha=Math.min(tree.alpha,alpha);
  }
}

export function drawTree(ctx, tree, cam = {x:0,y:0}, zoom = 1, actors = []) {
  const {id,x,y,w,h,px,py,big} = tree;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha *= tree.alpha ?? treeAlpha(tree, actors);
  ctx.translate(Math.round((px-w/2-cam.x)*zoom), Math.round((py-h-cam.y)*zoom));
  ctx.scale(w/(big?32:16)*zoom, h/(big?32:16)*zoom);
  if (big) {
    const names = id===T.OAK_TL ? ['OAK_TL','OAK_TR','OAK_BL','OAK_BR'] : ['PINE_TL','PINE_TR','PINE_BL','PINE_BR'];
    for(let i=0;i<4;i++) drawTile(ctx,T[names[i]],(i%2)*16,Math.floor(i/2)*16,x+i%2,y+Math.floor(i/2));
  } else drawTile(ctx,id,0,0,x,y);
  ctx.restore();
}

// Bound collection to a viewport plus the tallest crown; roots below the
// viewport still contribute their visible tops. No whole-map per-frame scan.
export function visibleTrees(map, view, actors = []) {
  if (!map?.at) return [];
  const out=[],seen=new Set();
  const x0=Math.max(0,Math.floor(view.x/16)-3), x1=Math.min(map.w-1,Math.ceil((view.x+view.w)/16)+3);
  const y0=Math.max(0,Math.floor(view.y/16)-2), y1=Math.min(map.h-1,Math.ceil((view.y+view.h)/16)+5);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const layer of ['deco','over']) {
    const source=map.at(layer,x,y), part=PARTS.get(source);
    const id=part?.id||source, dim=SINGLE.get(id), big=!!part;
    if(!dim&&!big)continue;
    // Reconstruct a tree from any surviving quadrant, including a tree cut
    // by an arena edge. Never leave an invisible solid root at a cropped edge.
    const tx=x-(part?.dx||0),ty=y-(part?.dy||0),key=`${id}:${tx}:${ty}`;
    if(seen.has(key))continue;
    seen.add(key);
    const [w,h]=big?(id===T.OAK_TL?[52,64]:[40,72]):dim;
    // A little height variation, anchored at the same collision root.
    const height=h-(tileHash(tx,ty,id)%3)*2;
    const tree={id,x:tx,y:ty,w,h:height,big,px:(tx+(big?1:.5))*16,py:(ty+(big?2:1))*16};
    // At equal feet depth, a person beside the trunk belongs in front.
    tree.z=tree.py-0.01;
    if(tree.px+w/2<view.x||tree.px-w/2>view.x+view.w||tree.py<view.y||tree.py-height>view.y+view.h)continue;
    tree.draw=(ctx,cam)=>drawTree(ctx,tree,cam,1,actors);
    out.push(tree);
  }
  prepareVisibility(out,actors);
  return out.sort((a,b)=>a.py-b.py);
}
