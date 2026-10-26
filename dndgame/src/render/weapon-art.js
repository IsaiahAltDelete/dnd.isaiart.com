// One authored profile drives held equipment and its inventory miniature.
import ARMORY from './art/armory.js';
import {defineSprite,getSprite,hasSprite} from './sprites.js';
import {resolveItem} from '../data/items.js';

export const LEGACY_WEAPON_ART={
 'wep-sword':'longsword','wep-greatsword':'greatsword','wep-axe':'battleaxe',
 'wep-greataxe':'greataxe','wep-mace':'mace','wep-hammer':'warhammer',
 'wep-dagger':'dagger','wep-spear':'spear','wep-staff':'quarterstaff',
 'wep-halberd':'halberd','wep-bow':'longbow','wep-crossbow':'light-crossbow',
 'wep-scimitar':'scimitar','wep-rapier':'rapier','wep-flail':'flail',
};
const SPECIAL={
 'flame-tongue':'flameblade','sun-blade':'moonblade','frost-brand':'moonblade',
 'staff-of-fire':'dragonstaff','staff-of-the-magi':'dragonstaff',
 'ahghairons-dragonstaff':'dragonstaff','staff-of-power':'dragonstaff',
 'oathbow':'stormbow','holy-avenger':'moonblade','lightbringer':'lanternmace',
 'vorpal-sword':'hookblade',
};
const ELEMENT={fire:'#f3a35b',cold:'#a6dbed',lightning:'#c2c8ff',thunder:'#b5b7ef',
 radiant:'#f4df93',necrotic:'#a7bf89',poison:'#9ac777',psychic:'#d4a7da',force:'#d5c2f2'};
const artCache=new Map();

export function weaponProfile(it){
 if(!it||it.kind!=='weapon')return null;
 const base=it.baseItem||String(it.id).replace(/-plus\d$/,'');
 return it.artProfile||SPECIAL[it.id]||(ARMORY.frames[base]?base:
   it.props?.includes('ammunition')?'shortbow':it.dtype==='bludgeoning'?'mace':'longsword');
}
export function weaponAnimationKind(name){
 const id=String(name||'').replace(/^wep-armory-/,''),it=resolveItem(id),base=it?.baseItem||id;
 if(it?.props?.includes('ranged')||it?.props?.includes('ammunition'))return 'bow';
 if(['spear','pike','javelin','trident','glaive','halberd','lance','quarterstaff'].includes(base))return 'pole';
 return 'blade';
}
function artOf(it){
 if(!it||it.kind!=='weapon')return null;
 if(artCache.has(it.id))return artCache.get(it.id);
 const profile=weaponProfile(it),palette={...ARMORY.palette};
 let rows=ARMORY.frames[profile];if(!rows)return null;
 const magic=it.magical||it.magic||it.rarity&&it.rarity!=='common';
 if(magic){
  const color=it.artAccent||ELEMENT[it.magic?.bonusType]||it.tint||'#a9d3dc';
  palette.x=color;palette.t=color;
  // Enchanted steel retains its edge highlight and darker bevel.
  if(it.magic?.bonusType)palette.m=color;
  rows=rows.map((row,y)=>y===14?row.replace(/t/g,'x'):row);
 }
 let l=16,t=24,r=0,b=0;
 for(let y=0;y<24;y++)for(let x=0;x<16;x++)if(rows[y][x]!=='.'){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}
 const art={profile,palette,rows,bounds:{l,t,w:r-l,h:b-t}};
 artCache.set(it.id,art);return art;
}
export function weaponSprite(it){
 const art=artOf(it);if(!art)return 'wep-none';
 const name='wep-armory-'+it.id;
 if(!hasSprite(name)){
  const frames={};
  for(const dir of ['down','left','right','up'])for(let f=0;f<4;f++){
   const bob=f===1||f===3?1:f===2?-1:0;
   frames[`${dir}-${f}`]=Array.from({length:24},(_,y)=>{
    const row=art.rows[y-bob]||'.'.repeat(16);
    return dir==='left'||dir==='up'?[...row].reverse().join(''):row;
   });
  }
  defineSprite(name,{w:16,h:24,palette:art.palette,frames});
 }
 return name;
}
export function drawWeaponIcon(ctx,id,x,y,size){
 const it=resolveItem(id),art=artOf(it);if(!art)return false;
 const image=getSprite(weaponSprite(it),'down-0');if(!image)return false;
 const {l,t,w,h}=art.bounds,scale=Math.min(size/w,size/h),dw=Math.max(1,Math.round(w*scale)),dh=Math.max(1,Math.round(h*scale));
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(image,l,t,w,h,Math.round(x+(size-dw)/2),Math.round(y+(size-dh)/2),dw,dh);ctx.restore();return true;
}
export {ARMORY};
