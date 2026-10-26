const {Game,Stage}=SC,b=Game.top,u=b.enc.units.find(u=>u.side==='party'),foe=b.enc.units.find(u=>u.side==='foe'),shots=[];
b.beats=[];b.beat=null;b.banner=null;b.phase='menu';b.enc.turnIndex=b.enc.order.indexOf(u.uid);b.enc.beginTurn();
u.pos={x:7,y:8};foe.pos={x:10,y:8};b.ui.clear();b._uiOf(u,true);b._uiOf(foe,true);b._recenter();b._uiOf(u).dir='right';b._uiOf(foe).dir='left';
const capture=id=>{Game._draw();shots.push({id,url:Stage.snapshot()});};
b.enc.map=null;b.cam={x:176,y:120};b.camTo={x:176,y:120};
for(const biome of ['city','ruins','cave','coast','forest']){b.enc.biome=biome;capture('fallback-'+biome);}
for(const pose of ['attack','cast','hurt']){
 const s=b._uiOf(u);s.cast=null;s.swing=null;s.recoil=null;s.lunge=null;
 if(pose==='attack')b._animSwing(u,1);
 if(pose==='cast')b._animCast(u,'#8cb8ff',1);
 if(pose==='hurt')b._animRecoil(u,foe,4,1);
 for(const t of [.2,.5,.8]){for(const k of ['cast','swing','recoil'])if(s[k])s[k].t=t;capture(`${pose}-${t}`);}
}
b._uiOf(u).recoil=null;
for(const dir of ['down','left','up','right']){b._uiOf(foe).dir=dir;capture('ogre-'+dir);}
return shots;
