import {UI} from './kit.js';
import {Input} from '../core/input.js';
import {Game} from '../engine.js';
import {ACADEMY_DRILLS,academyPreview,passAcademyDrill} from '../rules/academy.js';

// A borrowed-focus exercise, not a combat encounter: no character resources mutate.
export class AcademyTrainingScene {
 constructor(){this.id='academy-training';this.opaque=true;this.pausesBelow=true;this.uiLayer=true;this.reset(0);}
 reset(index){this.index=index;this.drill=ACADEMY_DRILLS[index];this.aim={...this.drill.start};this.passed=false;this.feedback='Move the gold sight. Preview before projecting.';this.pulse=0;}
 project(){
  if(this.passed){this.reset((this.index+1)%ACADEMY_DRILLS.length);return;}
  const r=passAcademyDrill(Game.state,this.drill,this.aim);this.passed=r.pass;this.pulse=0.5;
  this.feedback=r.unsafe?'Observer in the footprint. Reposition and try again.':r.pass?'Passed. '+(this.index===0?'Continue to the burst.':'Both drills done. Speak to Tessele about concentration.'):'Missed '+(this.index===0?'the dummy.':'one or both dummies.')+' Adjust your aim.';
 }
 update(dt){
  this.pulse=Math.max(0,this.pulse-dt);
  if(Input.consume('cancel')){Game.pop();return;}
  if(!this.passed)for(const [k,dx,dy]of [['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]])if(Input.repeatConsume(k)){this.aim.x=Math.max(0,Math.min(8,this.aim.x+dx));this.aim.y=Math.max(0,Math.min(5,this.aim.y+dy));}
  const m=Input.mouse;
  if(m.clicked){
   m.clicked=false;
   if(!this.passed&&m.x>=12&&m.x<192&&m.y>=64&&m.y<184)this.aim={x:Math.floor((m.x-12)/20),y:Math.floor((m.y-64)/20)};
   else if(m.x>=208&&m.x<=382&&m.y>=166&&m.y<=186)this.project();
  }
  if(Input.consume('confirm'))this.project();
 }
 snapshot(){return {drill:this.drill.id,aim:this.aim,preview:academyPreview(this.drill,this.aim),passed:this.passed,feedback:this.feedback,coordinates:'9 by 6 grid, origin top-left, x right, y down'};}
 draw(ctx){
  ctx.fillStyle='#141726';ctx.fillRect(0,0,400,240);UI.panel(ctx,4,4,392,232);
  const text=(x,y,s,color='#e4dcc5')=>UI.text(ctx,x,y,s,{size:'sm',color});
  const wrap=(x,y,s,w,color)=>{for(const [i,line]of UI.wrapLines(s,w,'sm').entries())text(x,y+i*10,line,color);};
  text(14,15,'BLACKSTAFF / SUPERVISED PRACTICUM','#d9b775');
  text(14,32,`${this.index+1}/2  ${this.drill.title}`);text(14,49,'BORROWED FOCUS - HARMLESS PROJECTIONS','#94b7cb');
  const preview=academyPreview(this.drill,this.aim);
  for(let y=0;y<6;y++)for(let x=0;x<9;x++){
   const on=preview.cells.some(p=>p.x===x&&p.y===y);
   ctx.fillStyle=on?(preview.unsafe?'#653b48':'#345953'):(x+y)%2?'#262938':'#222534';ctx.fillRect(12+x*20,64+y*20,19,19);
  }
  for(const p of this.drill.targets){const x=12+p.x*20,y=64+p.y*20;ctx.fillStyle='#a47b3a';ctx.fillRect(x+4,y+3,12,13);text(x+7,y+6,'D','#fff2bc');}
  const o=this.drill.observer,ox=12+o.x*20,oy=64+o.y*20;ctx.fillStyle='#669dca';ctx.beginPath();ctx.arc(ox+9,oy+9,8,0,Math.PI*2);ctx.fill();text(ox+7,oy+6,'O','#101827');
  text(33,150,'YOU','#c4b7ec');
  const ax=12+this.aim.x*20,ay=64+this.aim.y*20;ctx.strokeStyle=this.pulse?'#fff5cd':'#e6c780';ctx.lineWidth=1;ctx.strokeRect(ax+1.5,ay+1.5,16,16);
  wrap(208,65,this.drill.goal,174);
  text(208,106,'D = dummy   O = observer','#b9c5d5');
  text(208,120,`Dummies covered: ${preview.hit}/${this.index===0?1:2}`);
  text(208,133,preview.unsafe?'Observer: IN FOOTPRINT':'Observer: clear',preview.unsafe?'#f5a8a1':'#a5d5b2');
  text(208,148,'No slots or spells consumed.','#a8b6ca');
  UI.panel(ctx,206,163,180,24);text(215,171,this.passed?(this.index===0?'Z  Next exercise':'Z  Repeat exercises'):'Z  Project');
  wrap(14,196,this.feedback,370,this.passed?'#acd5af':'#e4dcc5');
  text(14,225,'Arrows / click: aim    Z: project / next    X: leave','#a8b6ca');
 }
}
