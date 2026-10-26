// Small bounded canvas accents: no particles, global timers or gameplay effects.
export function drawPlaceItem(ctx,item,x,y){
 if(item!=='cloth')return false;
 ctx.fillStyle='#344963';ctx.fillRect(x-4,y-3,9,6);ctx.fillStyle='#81a5bd';ctx.fillRect(x-3,y-2,7,4);ctx.fillStyle='#d9c794';ctx.fillRect(x-2,y-2,1,4);return true;
}
export function drawPlaceWork(ctx,e,cam,foreground=true){
 const g=e.group,k=g.kind,s=e.social;
 if(!['arcane','wards','kettle','study','weigh','textiles','auction'].includes(k))return;
 if(foreground&&!['arcane','wards','auction'].includes(k))return;
 if(!foreground&&['arcane','wards'].includes(k))return;
 const action=s?.phase==='action',t=action?s.t:0,clock=e.workClock;
 const p=g.props.find(p=>p.name==='TABLE'),x=Math.round((p?p.x*16+8:e.px)-cam.x),y=Math.round((p?p.y*16+7:e.py-11)-cam.y);
 if(x<-70||y<-70||x>470||y>310)return;
 ctx.save();ctx.lineWidth=1;
 if(k==='arcane'||k==='wards'){
  const partner=s?.partner,px=partner?partner.px-cam.x:x+20,py=partner?partner.py-cam.y-13:y;
  const q=action?Math.min(1,t/1.5):0,ox=Math.round(x+(px-x)*q*.55),oy=Math.round(y+(py-y)*q*.55-6-Math.sin(t*2)*3);
  ctx.strokeStyle='#729eb1';ctx.beginPath();ctx.ellipse(x,e.py-cam.y-1,9,3,0,0,Math.PI*2);ctx.stroke();
  if(action){
   ctx.fillStyle='#477b99';ctx.fillRect(ox-5,oy-4,10,9);ctx.fillStyle='#a4dfdf';ctx.fillRect(ox-3,oy-3,6,7);ctx.fillStyle='#e4fff0';ctx.fillRect(ox-1,oy-2,2,3);
   if(k==='arcane'&&s.lines[2].includes('ears')&&t>1.6){ctx.fillStyle='#aedcdd';ctx.fillRect(ox-4,oy-12,3,9);ctx.fillRect(ox+2,oy-10,3,7);}
   if(k==='wards'){ctx.strokeStyle=t>2?'#d6b1ea':'#98d6e6';ctx.beginPath();ctx.arc(ox,oy,7+Math.sin(t*4)*2,0,Math.PI*2);ctx.stroke();}
   for(let i=0;i<5;i++){const a=t*2+i*Math.PI*2/5;ctx.fillStyle=i%2?'#d8c2ed':'#98dce5';ctx.fillRect(Math.round(ox+Math.cos(a)*13),Math.round(oy+Math.sin(a)*8),2,2);}
  }
 }else if(k==='kettle'){
  ctx.strokeStyle='#b6c2b4';ctx.strokeRect(x-6,y-7,5,6);ctx.fillStyle='#719b91';ctx.fillRect(x-4,y-7,9,7);ctx.fillRect(x+4,y-8,4,3);ctx.fillStyle='#c6d5bd';ctx.fillRect(x-3,y-7,6,2);
  const lift=action?Math.round(4+Math.abs(Math.sin(t*4))*7):0;ctx.fillStyle='#d6be7f';ctx.fillRect(x-5,y-9-lift,10,2);ctx.fillRect(x-1,y-11-lift,2,2);
  if(action)for(let i=0;i<3;i++){const nx=x+9+i*6,ny=y-13-i*3-Math.floor(t*3)%6;ctx.fillStyle=['#a5d2d0','#e4c67d','#cbb7dd'][i];ctx.fillRect(nx,ny,1,6);ctx.fillRect(nx-2,ny+5,3,2);ctx.fillRect(nx,ny,3,1);}
 }else if(k==='weigh'){
  const tilt=action?Math.round(Math.sin(t*6)*Math.max(0,3-t)):2;
  ctx.fillStyle='#c7a66a';ctx.fillRect(x,y-15,2,15);ctx.fillRect(x-6,y-1,14,2);
  ctx.strokeStyle='#dfc68c';ctx.beginPath();ctx.moveTo(x-9,y-11-tilt);ctx.lineTo(x+10,y-11+tilt);ctx.stroke();
  for(const [dx,dy]of [[-8,-tilt],[8,tilt]]){ctx.fillStyle='#9c885d';ctx.fillRect(x+dx,y-10+dy,1,5);ctx.fillRect(x+dx-3,y-5+dy,7,2);ctx.fillStyle=dx<0?'#b6a077':'#e6cb78';ctx.fillRect(x+dx-2,y-8+dy,5,3);}
 }else if(k==='textiles'){
  const width=action?8+Math.round(Math.min(1,t/2)*9):12;
  ctx.fillStyle='#456b8e';ctx.fillRect(x-6,y-7,width,9);ctx.fillStyle='#a4c7d2';ctx.fillRect(x-5,y-6,width-2,2);ctx.fillStyle='#dbc69a';ctx.fillRect(x-4,y-7,2,9);ctx.fillStyle='#92735d';ctx.fillRect(x+width-8,y-8,3,11);
 }else if(k==='study'){
  ctx.fillStyle='#776251';ctx.fillRect(x-6,y-8,14,9);ctx.fillStyle='#ded0aa';ctx.fillRect(x-5,y-7,6,7);ctx.fillRect(x+2,y-7,5,7);ctx.fillStyle='#9d8867';ctx.fillRect(x-4,y-5,4,1);ctx.fillRect(x+3,y-3,3,1);
 }else if(k==='auction'){
  if(!foreground)for(let i=0;i<3;i++){ctx.fillStyle='#d3c8af';ctx.fillRect(x-7+i*6,y-6,4,5);ctx.fillStyle='#89765a';ctx.fillRect(x-6+i*6,y-6,2,1);}
  if(foreground&&action){const hx=Math.round(e.px-cam.x+7),hy=Math.round(e.py-cam.y-15-Math.sin(t*9)*2);ctx.fillStyle='#d9b861';ctx.fillRect(hx,hy,2,3);ctx.fillRect(hx-2,hy+3,6,4);ctx.fillRect(hx-3,hy+7,8,1);}
 }
 ctx.restore();
}
