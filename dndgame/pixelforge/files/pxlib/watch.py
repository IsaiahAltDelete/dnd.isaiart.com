"""Live sprite viewer -- a tiny stdlib HTTP server that streams the current
state of a .pxa file to a browser page.

The page polls /state, re-renders when the file's version changes, and flashes
the cells that just changed, so edits are visible as they land.
"""

import json
import os
import threading
import time

try:
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
except ImportError:                                        # pragma: no cover
    from BaseHTTPServer import BaseHTTPRequestHandler
    from SocketServer import ThreadingMixIn
    from BaseHTTPServer import HTTPServer

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        pass

from . import fmt
from .fmt import color_hex


PAGE = r"""<!doctype html>
<html><head><meta charset="utf-8"><title>pixelforge - live</title>
<style>
  :root{--bg:#14141a;--panel:#1c1c25;--line:#2e2e3c;--ink:#e8e8f0;--dim:#8a8fa3;--accent:#78beff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
  header{display:flex;align-items:baseline;gap:14px;padding:10px 16px;
         border-bottom:1px solid var(--line);flex-wrap:wrap}
  h1{margin:0;font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
  .meta{color:var(--dim)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3ecf6a;
       margin-right:6px;vertical-align:middle}
  .dot.stale{background:#d9663f}.dot.err{background:#e8474b}
  main{display:flex;gap:18px;padding:16px;align-items:flex-start;flex-wrap:wrap}
  #stage{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
  canvas{display:block;image-rendering:pixelated}
  aside{width:250px;display:flex;flex-direction:column;gap:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
  .card h2{margin:0 0 8px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
  .sw{display:flex;align-items:center;gap:8px;padding:2px 0}
  .chip{width:16px;height:16px;border-radius:3px;border:1px solid #0006;flex:none;
        background-image:linear-gradient(45deg,#3a3a44 25%,transparent 25%,transparent 75%,#3a3a44 75%),
                         linear-gradient(45deg,#3a3a44 25%,transparent 25%,transparent 75%,#3a3a44 75%);
        background-size:8px 8px;background-position:0 0,4px 4px}
  .k{color:var(--accent);width:14px}
  .n{color:var(--dim);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #log{max-height:260px;overflow:auto;font-size:11px}
  #log div{padding:2px 0;border-bottom:1px solid #26262f;color:var(--dim)}
  #log b{color:var(--ink);font-weight:500}
  #err{color:#ff8a8a;white-space:pre-wrap;font-size:11px}
  .tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
  .tab{padding:3px 9px;border:1px solid var(--line);border-radius:99px;cursor:pointer;
       color:var(--dim);font-size:11px}
  .tab.on{border-color:var(--accent);color:var(--accent)}
</style></head><body>
<header>
  <h1>pixelforge live</h1>
  <span class="meta"><span class="dot" id="dot"></span><span id="status">connecting</span></span>
  <span class="meta" id="info"></span>
</header>
<main>
  <div>
    <div class="tabs" id="tabs"></div>
    <div id="stage"><canvas id="c"></canvas></div>
  </div>
  <aside>
    <div class="card"><h2>palette</h2><div id="pal"></div></div>
    <div class="card"><h2>activity</h2><div id="log"></div></div>
    <div class="card" id="errcard" style="display:none"><h2>parse error</h2><div id="err"></div></div>
  </aside>
</main>
<script>
const cv=document.getElementById('c'),cx=cv.getContext('2d');
let ver=-1,frame=null,flash=[],flashAt=0,state=null,raf=null;

function pick(){
  const w=state.w,h=state.h;
  const s=Math.max(2,Math.min(20,Math.floor(Math.min(820/w,620/h))));
  return s;
}
function draw(){
  if(!state||!state.rows)return;
  const w=state.w,h=state.h,s=pick(),pad=1;
  cv.width=w*s;cv.height=h*s;
  cx.imageSmoothingEnabled=false;
  // checkerboard
  const cell=Math.max(4,s>>1);
  for(let y=0;y<cv.height;y+=cell)for(let x=0;x<cv.width;x+=cell){
    cx.fillStyle=((x/cell+y/cell)&1)?'#2c2c34':'#3a3a44';
    cx.fillRect(x,y,cell,cell);
  }
  for(let y=0;y<h;y++){const row=state.rows[y]||'';
    for(let x=0;x<w;x++){const c=state.palette[row[x]];
      if(!c||c==='transparent')continue;cx.fillStyle=c;cx.fillRect(x*s,y*s,s,s);}}
  if(s>=8){cx.strokeStyle='rgba(255,255,255,.05)';cx.lineWidth=1;
    for(let x=0;x<=w;x++){cx.beginPath();cx.moveTo(x*s+.5,0);cx.lineTo(x*s+.5,h*s);cx.stroke();}
    for(let y=0;y<=h;y++){cx.beginPath();cx.moveTo(0,y*s+.5);cx.lineTo(w*s,y*s+.5);cx.stroke();}
    cx.strokeStyle='rgba(255,255,255,.13)';
    for(let x=0;x<=w;x+=8){cx.beginPath();cx.moveTo(x*s+.5,0);cx.lineTo(x*s+.5,h*s);cx.stroke();}
    for(let y=0;y<=h;y+=8){cx.beginPath();cx.moveTo(0,y*s+.5);cx.lineTo(w*s,y*s+.5);cx.stroke();}}
  const age=(performance.now()-flashAt)/900;
  if(flash.length&&age<1){
    cx.strokeStyle='rgba(120,190,255,'+(1-age).toFixed(3)+')';
    cx.lineWidth=Math.max(1,s/8);
    cx.fillStyle='rgba(120,190,255,'+(0.30*(1-age)).toFixed(3)+')';
    for(const [x,y] of flash){cx.fillRect(x*s,y*s,s,s);cx.strokeRect(x*s+.5,y*s+.5,s-1,s-1);}
    raf=requestAnimationFrame(draw);
  }
}
function setStatus(t,cls){document.getElementById('status').textContent=t;
  document.getElementById('dot').className='dot'+(cls?' '+cls:'');}
function renderPal(){
  const el=document.getElementById('pal');el.innerHTML='';
  for(const k of state.used){
    const c=state.palette[k]||'transparent';
    const d=document.createElement('div');d.className='sw';
    d.innerHTML='<span class="chip" style="'+(c==='transparent'?'':'background:'+c)+'"></span>'+
      '<span class="k">'+(k==='&'?'&amp;':k.replace('<','&lt;'))+'</span>'+
      '<span class="n">'+(state.notes[k]||c)+'</span>';
    el.appendChild(d);
  }
}
function renderTabs(){
  const el=document.getElementById('tabs');el.innerHTML='';
  if(state.frames.length<2)return;
  for(const f of state.frames){
    const d=document.createElement('div');d.className='tab'+(f===state.frame?' on':'');
    d.textContent=f;d.onclick=()=>{frame=f;ver=-1;poll();};el.appendChild(d);
  }
}
function log(entries){
  const el=document.getElementById('log');el.innerHTML='';
  for(const e of entries.slice().reverse()){
    const d=document.createElement('div');
    d.innerHTML='<b>'+e.time+'</b> &nbsp;'+e.msg;el.appendChild(d);
  }
}
async function poll(){
  try{
    const r=await fetch('/state?v='+ver+(frame?'&frame='+encodeURIComponent(frame):''),
                        {cache:'no-store'});
    const j=await r.json();
    if(j.error){document.getElementById('errcard').style.display='';
      document.getElementById('err').textContent=j.error;setStatus('parse error','err');}
    else{document.getElementById('errcard').style.display='none';}
    if(j.version!==ver){
      const first=ver===-1;
      ver=j.version;state=j;
      flash=first?[]:(j.changed||[]);flashAt=performance.now();
      if(raf)cancelAnimationFrame(raf);
      draw();renderPal();renderTabs();log(j.log||[]);
      document.getElementById('info').textContent=
        j.name+' / '+j.frame+'  '+j.w+'x'+j.h+'  v'+j.version;
    }
    if(!j.error)setStatus('watching '+j.file,'');
  }catch(e){setStatus('server offline','stale');}
  setTimeout(poll,250);
}
poll();
</script></body></html>
"""


class _State(object):
    def __init__(self, path):
        self.path = os.path.abspath(path)
        self.lock = threading.Lock()
        self.version = 0
        self.mtime = None
        self.sprite = None
        self.error = None
        self.prev_rows = {}
        self.changed = []
        self.log = []
        self.refresh()

    def _note(self, msg):
        self.log.append({"time": time.strftime("%H:%M:%S"), "msg": msg})
        del self.log[:-40]

    def refresh(self):
        try:
            mt = os.path.getmtime(self.path)
        except OSError:
            with self.lock:
                if self.error != "file missing":
                    self.error = "file missing"
                    self.version += 1
                    self._note("file disappeared")
            return
        if mt == self.mtime:
            return
        self.mtime = mt
        try:
            sprite = fmt.load(self.path)
            errors, _ = fmt.validate(sprite)
            if errors:
                raise fmt.PxaError("; ".join(errors[:4]))
        except Exception as exc:
            with self.lock:
                self.error = str(exc)
                self.version += 1
                self._note("invalid: " + str(exc)[:90])
            return

        with self.lock:
            changed = []
            for f in sprite.frames:
                old = self.prev_rows.get(f.name)
                if old and len(old) == len(f.rows):
                    for y, (a, b) in enumerate(zip(old, f.rows)):
                        if a != b:
                            for x in range(max(len(a), len(b))):
                                ca = a[x] if x < len(a) else None
                                cb = b[x] if x < len(b) else None
                                if ca != cb:
                                    changed.append([x, y])
            first = not self.prev_rows
            self.prev_rows = dict((f.name, list(f.rows)) for f in sprite.frames)
            self.sprite = sprite
            self.error = None
            self.changed = changed
            self.version += 1
            if first:
                self._note("loaded %s (%dx%d, %d frame%s)"
                           % (sprite.name, sprite.width, sprite.height,
                              len(sprite.frames), "" if len(sprite.frames) == 1 else "s"))
            elif changed:
                self._note("<b>%d</b> cell%s changed"
                           % (len(changed), "" if len(changed) == 1 else "s"))
            else:
                self._note("saved (no pixel change)")

    def payload(self, frame_ref):
        self.refresh()
        with self.lock:
            if self.sprite is None:
                return {"version": self.version, "error": self.error or "no sprite",
                        "log": self.log, "file": os.path.basename(self.path)}
            s = self.sprite
            try:
                f = s.frame(frame_ref) if frame_ref else s.frames[0]
            except Exception:
                f = s.frames[0]
            notes = dict(s.meta.get("notes", {}))
            from . import palettes as _pal
            if s.meta.get("use") in _pal.PALETTES:
                for k, v in _pal.get(s.meta["use"])["notes"].items():
                    notes.setdefault(k, v)
            used = sorted(set("".join(f.rows)))
            return {
                "version": self.version,
                "file": os.path.basename(self.path),
                "name": s.name,
                "frame": f.name,
                "frames": [x.name for x in s.frames],
                "w": f.width, "h": f.height,
                "rows": list(f.rows),
                "palette": dict((k, color_hex(v)) for k, v in s.palette.items()),
                "used": [k for k in used if k in s.palette],
                "notes": notes,
                "changed": self.changed,
                "log": self.log,
                "error": self.error,
            }


def serve(path, port=8765, host="127.0.0.1"):
    state = _State(path)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _send(self, body, ctype):
            data = body.encode("utf-8") if isinstance(body, str) else body
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            route = self.path.split("?")[0]
            if route == "/state":
                q = self.path.split("?", 1)[1] if "?" in self.path else ""
                frame = None
                for part in q.split("&"):
                    if part.startswith("frame="):
                        from urllib.parse import unquote
                        frame = unquote(part[6:])
                self._send(json.dumps(state.payload(frame)), "application/json")
            elif route in ("/", "/index.html"):
                self._send(PAGE, "text/html; charset=utf-8")
            else:
                self.send_error(404)

        def log_message(self, *a):
            pass                      # keep the console readable

    srv = ThreadingHTTPServer((host, port), Handler)
    print("watching %s" % os.path.abspath(path))
    print("http://%s:%d" % (host, port))
    srv.serve_forever()
