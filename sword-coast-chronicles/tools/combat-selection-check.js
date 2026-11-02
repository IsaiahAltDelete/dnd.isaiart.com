const {Game,Input}=SC,b=Game.top,checks=[];
const check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
b.beats=[];b.beat=null;b.phase='menu';b.prompt=null;b.showLog=false;b.results=null;
b.enc.turnIndex=b.enc.order.indexOf(b.enc.units.find(u=>u.side==='party').uid);b.menuDirty=true;
const reset=()=>{Input.flush();b.drag={on:false,moved:0,x:0,y:0};b.camManual=false;b.zoom=1;b._recenter();b._updateCam(1);Game._draw();};
reset();
const origin=()=>b._origin(),distance=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y);
const h=b._railHits.find(h=>h.u.side==='foe'),m=Input.mouse;
const before=origin();
Object.assign(m,{over:true,x:h.x+h.w/2,y:h.y+h.h/2,down:true});b._updateDrag();
m.x+=12;b._updateDrag();m.down=false;b._updateDrag();
check('drag across character portraits does not pan',distance(before,origin())<.01,{before,after:origin()});
reset();
const start=origin(),visible=b._railHits.find(h=>h.u.side==='foe'&&b._sx(b._uiOf(h.u,true).x)>16&&b._sx(b._uiOf(h.u,true).x)<384&&b._sy(b._uiOf(h.u,true).y)>55&&b._sy(b._uiOf(h.u,true).y)<185);
if(visible){Object.assign(m,{over:true,x:visible.x+visible.w/2,y:visible.h/2,clicked:true});b._updateMenu(.016);m.clicked=false;b._updateCam(1);}
check('selecting an already visible portrait keeps framing',!!visible&&distance(start,origin())<.01,{start,after:origin()});
reset();Object.assign(m,{over:true,x:200,y:90,down:true});b._updateDrag();const field=origin();m.x+=20;b._updateDrag();m.down=false;b._updateDrag();
check('intentional battlefield drag still pans',distance(field,origin())>5);
reset();const cross=origin();Object.assign(m,{over:true,x:h.x+2,y:8,down:true});b._updateDrag();
Object.assign(m,{x:200,y:90});b._updateDrag();m.x+=30;b._updateDrag();m.down=false;b._updateDrag();
check('press beginning on portrait stays owned by UI across field',distance(cross,origin())<.01);
for(const zoom of [1,2]){
 reset();b.zoom=zoom;b.camManual=true;b.cam.x=b.camTo.x=80;b.cam.y=b.camTo.y=100;b._clampCam();
 const foe=b.enc.units.find(u=>u.side==='foe'),s=b._uiOf(foe,true),beforeCam={...b.cam};
 b._revealUnit(foe);
 check(`zoom${zoom}: reveal does not snap camera`,distance(beforeCam,b.cam)<.01);
 for(let i=0;i<120;i++)b._updateCam(1/60);
 const x=b._sx(s.x),y=b._sy(s.y-8);
 check(`zoom${zoom}: off-screen selection becomes visible`,x>=15&&x<=385&&y>=43&&y<=188,{x,y});
 const stable=origin();b._revealUnit(foe);b._updateCam(1);
 check(`zoom${zoom}: repeated selection does not recenter`,distance(stable,origin())<=1);
}
return {checks};
