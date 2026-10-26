// tools/menus/optprobe.js — shot.mjs page script: drives the Options screen's
// customization rows and the songbook and reports what each one changed.
const { Game, Save, Stage, Layout, Audio } = window.SC;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const M = await import('/src/ui/menus.js');
const { UI } = await import('/src/ui/kit.js');
const out = {};
const o = new M.OptionsScene({ group: 'style' });
Game.push(o); await wait(200);
const rows = o._build();
out.styleRows = rows.map((r) => r.key || r.kind);
const row = (k) => rows.find((r) => r.key === k);
o._cycle(row('uiTheme'), 1); await wait(50);
out.theme = [Save.settings.uiTheme, UI.theme];
o._cycle(row('pixelFilter'), 1); await wait(50);
out.filter = [Save.settings.pixelFilter, Stage.pixelFilter];
o._cycle(row('scanlines'), 1); await wait(50);
out.scan = [Save.settings.scanlines, Stage.scanlines];
o._cycle(row('hudPreset'), 1); await wait(50);
out.preset = [Save.settings.hudPreset, Layout.preset];
o.group = 5; const songs = o._build();
const song = songs.find((r) => r.kind === 'song' && r.id === 'yawningPortalRota') || songs.find((r) => r.kind === 'song');
o._play(song); await wait(50);
out.playing = Audio.playing;
o._favourite(song); out.favs = Save.settings.musicFavorites;
o._favourite(song); out.favsAfter = Save.settings.musicFavorites;
out.songCount = songs.filter((r) => r.kind === 'song').length;
// put everything back and check Arrange opens from the menu
o._cycle(row('uiTheme'), -1); o._cycle(row('pixelFilter'), -1); o._cycle(row('scanlines'), -1); o._cycle(row('hudPreset'), -1);
o.group = 2; o._arrange(); await wait(100);
out.arranging = Layout.editing; out.top = Game.top && Game.top.id;
try { Layout.endArrange ? Layout.endArrange() : (Layout.editing = false); } catch (e) { out.endErr = String(e); }
out.musicAfterExit = Audio.playing;
return out;
