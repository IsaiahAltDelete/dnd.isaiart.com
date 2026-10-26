// tools/menus/kitguide.js — shot.mjs page script: loads kit-test.html in an iframe and
// returns each style-guide canvas as a snapshot (unpack with tools/menus/unpack.mjs).
const f = document.createElement('iframe');
f.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:900px;opacity:0';
f.src = '/kit-test.html';
document.body.appendChild(f);
await new Promise((r) => { f.onload = r; });
await new Promise((r) => setTimeout(r, 2500));
const shots = [];
for (const c of f.contentDocument.querySelectorAll('canvas')) shots.push({ name: 'kit-' + c.id, url: c.toDataURL('image/png') });
return { shots };
