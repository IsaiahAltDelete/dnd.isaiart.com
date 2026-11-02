import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VFX} from '../src/render/vfx.js';
import {FX} from '../src/render/fx.js';
import {SPELLS} from '../src/data/spells.js';
import {rng,reseed} from '../src/core/rng.js';
import {BattleScene} from '../src/ui/combatui.js';
VFX.headless=true;
const effectErrors=[];const originalError=console.error;console.error=(...args)=>{effectErrors.push(args.map(String).join(' '));originalError(...args);};
const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
check('Every catalog spell settles its impact once and cleans up',()=>{
 for(const spell of Object.values(SPELLS)){
  FX.clear();let impacts=0;const h=VFX.cast(spell,{from:{x:50,y:90},to:{x:130,y:90},radius:24,blocking:true,onImpact:()=>impacts++});
  for(let n=0;n<300;n++)VFX.update(.05);
  assert.equal(impacts,1,spell.id);assert(!h.playing&&!VFX.busy(),spell.id);assert.equal(VFX.counts().vfxParticles,0,spell.id);
 }
});
check('New named motifs are reachable by actual catalog spells',()=>{
 for(const [id,style]of Object.entries({'sleep':'dream-motes','hold-person':'binding-seal','hold-monster':'binding-seal','thorn-whip':'thorn-whip','dispel-magic':'dissolve-runes','counterspell':'dissolve-runes','acid-splash':'acid-lob'})){
  assert(SPELLS[id]);assert.equal(VFX.baseOf(VFX.styleFor(SPELLS[id])),style);
 }
});
check('Cancellation releases blocking without showing an impact',()=>{
 for(const id of ['sleep','thorn-whip','acid-splash','hold-person','dispel-magic']){
  let hits=0;const h=VFX.cast(SPELLS[id],{blocking:true,onImpact:()=>hits++});h.cancel();VFX.update(.05);assert.equal(hits,0);assert(!VFX.busy());FX.clear();
 }
});
check('Visuals never advance the gameplay random stream',()=>{
 reseed('spell-animation-rules');const a=rng.next();reseed('spell-animation-rules');VFX.cast(SPELLS.sleep,{to:{x:50,y:50}});VFX.update(.4);assert.equal(rng.next(),a);FX.clear();
});
check('Disabled effects still deliver one impact without blocking',()=>{
 FX.enabled=false;let hits=0;const h=VFX.cast(SPELLS['thorn-whip'],{blocking:true,onImpact:()=>hits++});FX.enabled=true;
 assert.equal(hits,1);assert(!h.playing&&!VFX.busy());
});
check('Directional area beats preserve rules heading at both zooms and caster heights',()=>{
 for(const id of ['burning-hands','lightning-bolt'])for(const zoom of [1,2])for(const height of [10,32])for(const [dx,dy]of [[3,0],[0,3],[2,2],[-3,0],[0,-3],[-2,-2]]){
  let captured;const actor={pos:{x:6,y:6}},b={zoom,beats:[],_spellAt:()=>({x:110*zoom,y:(112-height)*zoom,ground:height*zoom}),_fxTile:BattleScene.prototype._fxTile,_castFX:(style,from,to)=>{captured={from,to};}};
  BattleScene.prototype._pushAreaBeats.call(b,actor,{origin:actor.pos,aim:{x:6+dx,y:6+dy},shape:SPELLS[id].target.kind,tiles:[]},SPELLS[id]);b.beats[0].fn();
  assert(Math.abs(Math.atan2(captured.to.y-captured.from.y,captured.to.x-captured.from.x)-Math.atan2(dy,dx))<1e-10,id);
  assert.equal(captured.to.ground,captured.from.ground);FX.clear();
 }
});
console.error=originalError;assert.deepEqual(effectErrors,[],'No swallowed recipe errors');
fs.mkdirSync('output/spell-animation',{recursive:true});fs.writeFileSync('output/spell-animation/rules-report.json',JSON.stringify({checks,spells:Object.keys(SPELLS).length},null,2));console.log(checks.length+' checks passed over '+Object.keys(SPELLS).length+' spells');
