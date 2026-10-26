// Disposable-origin fixtures only; never loaded by the player's game.
export async function stageArmoryShop(){
 const {Game,Party,createCharacter}=SC;
 Game.state=(await import('/src/state.js')).newGameState('armory');Party.clear();
 Party.add(createCharacter({name:'Mara',classId:'fighter',speciesId:'human',level:12,backgroundId:'soldier'}));
 Party.addGold(60000);
 Game.replace(new (await import('/src/ui/shop.js')).ShopScene('sorcerous-sundries'));
 document.querySelector('#gate')?.classList.remove('show');
 const s=Game.top;s._buildRows();s.index[0]=s.rows.findIndex(r=>r.id==='everburn-blade');
}
export async function armoryGallery(ids){
 const A=await import('/src/render/actor.js'),W=await import('/src/render/weapon-art.js');
 const {resolveItem}=await import('/src/data/items.js');
 const {addItem,equip}=await import('/src/rules/character.js');
 const c=document.createElement('canvas');c.width=800;c.height=Math.ceil(ids.length/4)*136;
 const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#232731';ctx.fillRect(0,0,c.width,c.height);
 const ch=SC.createCharacter({name:'Mara',classId:'fighter',speciesId:'human',level:12,backgroundId:'soldier'});
 Object.assign(ch.appearance,{wardrobe:'outfit-doublet',helmStyle:'helm-none',cloakStyle:'cloak-none',hairStyle:'sidepart'});
 ids.forEach((id,i)=>{const x=i%4*200,y=Math.floor(i/4)*136;
  equip(ch,addItem(ch,id),'mainHand');
  ctx.fillStyle='#e4d3ad';ctx.font='11px monospace';ctx.fillText(resolveItem(id).name.slice(0,27),x+6,y+15);
  W.drawWeaponIcon(ctx,id,x+8,y+34,34);
  ['down','left','right','up'].forEach((dir,j)=>A.drawActor(ctx,ch,x+63+j*36,y+85,{dir,scale:2,shadow:false}));
  ctx.fillStyle='#a8b3bf';ctx.font='10px monospace';ctx.fillText(W.weaponProfile(resolveItem(id)),x+8,y+108);
 });return c.toDataURL();
}
export async function stageArmoryBattle(id='everburn-blade'){
 await(await import('/tools/ground-design-fixture.js')).stageGroundBattle('dungeon','armory-battle');
 const {addItem,equip,recalc}=await import('/src/rules/character.js');const b=SC.Game.top;
 const h=b.enc.units.find(u=>u.name==='Daran'),foe=b.enc.units.find(u=>u.monsterId==='ogre');
 h.base.str=18;recalc(h);equip(h,addItem(h,id),'mainHand');h.pos={x:6,y:6};foe.pos={x:7,y:6};foe.hp=foe.maxHp=500;
 b.enc.turnIndex=b.enc.order.indexOf(h.uid);b.enc.beginTurn();b._recenter();b.menuDirty=true;
 return {hero:h.uid,foe:foe.uid};
}
export async function armoryPoses(){
 const {drawActor}=await import('/src/render/actor.js');const {addItem,equip}=await import('/src/rules/character.js');
 const c=document.createElement('canvas');c.width=800;c.height=660;const ctx=c.getContext('2d');
 ctx.fillStyle='#232731';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
 const ch=SC.Party.members[0];
 ['everburn-blade','harbor-hookglaive','moonreef-trident','stormglass-longbow','heavy-crossbow','gold-wyrmling-staff'].forEach((id,i)=>{
  equip(ch,addItem(ch,id),'mainHand');const y=i*110;ctx.fillStyle='#e4d3ad';ctx.font='11px monospace';ctx.fillText(id,8,y+14);
  ['down','right','up','left'].forEach((dir,j)=>[.2,.55,.85].forEach((poseT,k)=>drawActor(ctx,ch,28+j*195+k*56,y+90,{dir,scale:2,shadow:false,pose:i===3||i===4?'shoot':i===5?'cast':'attack',poseT})));
 });return c.toDataURL();
}
