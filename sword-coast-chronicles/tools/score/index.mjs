// Build a local audition desk from rendered WAVs. No network or autoplay.
// node tools/score/index.mjs output/queue-all/music
import fs from 'node:fs';
import path from 'node:path';
import {TRACKS} from '../../src/core/music.js';
import {CATALOGUE} from '../../src/core/music_catalogue.js';
const out=path.resolve(process.argv[2]||'output/music');
fs.mkdirSync(out,{recursive:true});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=Object.entries(TRACKS).map(([id,t])=>{
 const notes=CATALOGUE[id]||{},file=id+'.wav',exists=fs.existsSync(path.join(out,file));
 const instruments=(t.layers||[]).map(l=>String(l.inst||l.wave||'').replace(/([a-z])([A-Z])/g,'$1 $2'));
 return `<article data-id="${escape(id)}" data-search="${escape([id,t.title,notes.form,...instruments,...(t.contexts||[])].join(' ').toLowerCase())}"><h2>${escape(t.title||id)}</h2><p>${escape(notes.form)} · ${escape(notes.mood)}</p><p class="context">${escape((t.contexts||[]).join(' / '))} · ${(t.loopBars*240/t.bpm).toFixed(1)} seconds per phrase</p>${exists?`<audio controls preload="none" src="${encodeURIComponent(file)}"></audio><a href="${encodeURIComponent(file)}" download>Download WAV</a>`:'<p>Render pending</p>'}<small>${escape(id)}${notes.source?' · '+escape(notes.source):''}</small></article>`;
});
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sword Coast songbook</title><style>
body{margin:0;background:#171b1c;color:#eee4cf;font:17px/1.5 Georgia,serif}main{max-width:1100px;margin:auto;padding:36px 24px}h1{font-size:36px;margin:0}p{margin:.4em 0}header{margin-bottom:24px}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 24px;background:#252c2c;color:#fff;border:1px solid #bda574;font:inherit}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:18px}article{background:#242a2a;border:1px solid #555949;border-radius:6px;padding:20px}article[hidden]{display:none}h2{font-size:23px;color:#e7c98e;margin:0 0 8px}small,.context{font:14px/1.5 system-ui;color:#c4c5b9}small{display:block;margin-top:15px}audio{display:block;width:100%;margin:18px 0 8px}a{color:#e7c98e}label{font-family:system-ui}
</style><main><header><h1>Sword Coast songbook</h1><p>A quiet desk for listening through the game's ${rows.length} pieces.</p><p>Each full-loop render includes the next phrase's opening. Compare city, battle and dragon pieces at a comfortable volume.</p></header><label for="find">Find a title, instrument or setting</label><input id="find" type="search" placeholder="Try dragon, lute, city…"><p id="count" aria-live="polite">${rows.length} pieces</p><section>${rows.join('')}</section></main><script>
const find=document.querySelector('#find'),cards=[...document.querySelectorAll('article')];find.addEventListener('input',()=>{const q=find.value.trim().toLowerCase();for(const c of cards){c.hidden=!c.dataset.search.includes(q);if(c.hidden)c.querySelector('audio')?.pause();}document.querySelector('#count').textContent=cards.filter(c=>!c.hidden).length+' pieces';});document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')for(const a of document.querySelectorAll('audio'))if(a!==e.target)a.pause();},true);
</script></html>`);
console.log(`Wrote ${path.join(out,'index.html')} (${rows.length} entries)`);
