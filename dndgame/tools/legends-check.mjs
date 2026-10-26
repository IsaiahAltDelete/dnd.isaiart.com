import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LEGEND_CAST,LEGEND_DIALOGUE} from '../src/data/legends.js';
import {NPCS,spawnableOnMap} from '../src/data/npcs.js';
import {DIALOGUE} from '../src/data/dialogue.js';
import {registerCharacterSprites,npcLook,characterSpriteNames} from '../src/render/spritedata_chars.js';
import {portraitLook} from '../src/render/actor.js';
registerCharacterSprites();
const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
check('Cameos are in the live cast with reachable dialogue and stable art',()=>{
 for(const n of LEGEND_CAST){assert(spawnableOnMap(n.map).some(v=>v.id===n.id));assert.equal(NPCS[n.id].dialogue,n.id);assert(DIALOGUE[n.id]);assert(npcLook(n.sprite));assert(!characterSpriteNames().some(id=>id.startsWith(n.sprite+'-v')));}
});
check('Every new dialogue branch resolves and has a path back or out',()=>{
 for(const tree of Object.values(LEGEND_DIALOGUE))for(const [id,n]of Object.entries(tree.nodes)){
  for(const dest of [n.goto,...(n.choices||[]).map(c=>c.goto)].filter(Boolean))assert(tree.nodes[dest],id+' -> '+dest);
  assert(n.goto||n.choices?.some(c=>c.cancel),id+' can exit');
  const actions=[n.do,...(n.choices||[]).map(c=>c.do)].filter(Boolean);assert(actions.every(a=>Object.keys(a).every(k=>k==='flag')),'No repeatable resource rewards');
 }
});
check('Named appearance keeps portrait identity',()=>{
 assert.equal(portraitLook(NPCS['drizzt-dourden']).speciesId,'elf');assert.equal(portraitLook(NPCS['drizzt-dourden']).hair,'#efedf5');assert.equal(portraitLook(NPCS['alustriel-silverhand']).body,'f');assert.equal(portraitLook(NPCS.elminster).helm,'helm-wizard');
});
check('Existing dialogue leads are linked into live hubs',()=>{
 for(const [tree,node]of [['toblen','northernTraveler'],['durnan','silverVisitor'],['volo','legends'],['jaheira','oldFriends']]){assert(DIALOGUE[tree].nodes[node]);assert(DIALOGUE[tree].nodes.hub.choices.some(c=>c.goto===node));}
});
fs.mkdirSync('output/legends',{recursive:true});fs.writeFileSync('output/legends/rules-report.json',JSON.stringify({checks},null,2));console.log(checks.length+' legend data checks passed');
