/* ============================================================================
 * dnd.isaiart.com — THE DUNGEON MASTER'S TABLE
 *
 * A top-down pixel diorama of a session in progress, seen from above a table
 * that is larger than the band showing it. Backs the site's 404 page: the map
 * has run out of drawn rooms and the party is standing on blank paper.
 *
 *     IsaiTable.mount(canvasEl, { hourOverride, reduced, onState })
 *
 * Everything is drawn in code — no images, no fonts, no network.
 * ========================================================================== */
(function () {
'use strict';

"use strict";
/* ==========================================================================
   THE DUNGEON MASTER'S TABLE — procedural pixel diorama
   --------------------------------------------------------------------------
   Everything below draws into ONE low-resolution backing canvas (<= 440x460)
   which is then upscaled with imageSmoothingEnabled = false.
   Rules obeyed:
     * every coordinate is floored before it is drawn
     * every colour comes from the 40-entry palette
     * no createLinearGradient inside the pixel canvas — ordered dither only
     * sprites are hand-authored character grids
     * static layers are baked once into offscreen world canvases
     * 30fps cap, paused when hidden / off-screen / reduced motion
   ========================================================================== */

/* ------------------------------------------------------------------ 0. util */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
var RNG = mulberry32(0xD20D20);
function rr(r,a,b){return a+(b-a)*r();}
function ri(r,a,b){return Math.floor(a+(b-a+1)*r());}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function lerp(a,b,t){return a+(b-a)*t;}

/* 4x4 Bayer ordered-dither matrix, normalised 0..1 */
var BAYER=[0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
function bayer(x,y){return (BAYER[((y&3)<<2)|(x&3)]+0.5)/16;}

function hex2rgb(h){return [parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)];}
function rgb2hex(r,g,b){
  r=clamp(Math.round(r),0,255);g=clamp(Math.round(g),0,255);b=clamp(Math.round(b),0,255);
  return "#"+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
}
function mixHex(a,b,t){var A=hex2rgb(a),B=hex2rgb(b);return rgb2hex(lerp(A[0],B[0],t),lerp(A[1],B[1],t),lerp(A[2],B[2],t));}

/* ------------------------------------------------------- 1. THE PALETTE (40) */
/* ink 3 | wood 5 | parchment 5 | grid 1 | maroon 4 | gold 4 |
   flame 4 | pewter 4 | ooze 3 | cold 3 | skin 3 | snack 1   = 40 exactly     */
var BASE={
  INK1:"#161210", INK2:"#241D18", INK3:"#3A2E25",
  W0:"#2A1A11", W1:"#3D2717", W2:"#53341F", W3:"#6B4429", W4:"#8A5B39",
  P0:"#8B7A5B", P1:"#B6A481", P2:"#D8C9A5", P3:"#EFE3C4", P4:"#F7F1E4",
  G0:"#7F9186",
  M0:"#3A0E07", M1:"#58180D", M2:"#8A2A1B", M3:"#B4432C",
  Y0:"#6E5729", Y1:"#A6873F", Y2:"#C9AD6A", Y3:"#EBD59B",
  F0:"#7A2B08", F1:"#D9631A", F2:"#F5A431", F3:"#FFE9A8",
  S0:"#33383F", S1:"#545C68", S2:"#7E8794", S3:"#B2BAC5",
  E0:"#22402C", E1:"#3E6B43", E2:"#74A55E",
  B0:"#1B2C4A", B1:"#33507E", B2:"#5E86B8",
  K0:"#6E4128", K1:"#A9724A", K2:"#D6A276",
  C0:"#C8500F"
};
var PAL={}; for(var _k in BASE) PAL[_k]=BASE[_k];
var PALVER=0;

/* --------------------------------------------- 2. TINY 3x5 BITMAP TYPEFACE */
var FONT=(function(){
  var f={};
  var d="0:111,101,101,101,111|1:010,110,010,010,111|2:111,001,111,100,111|3:111,001,111,001,111|"+
        "4:101,101,111,001,001|5:111,100,111,001,111|6:111,100,111,101,111|7:111,001,010,010,010|"+
        "8:111,101,111,101,111|9:111,101,111,001,111|"+
        "A:010,101,111,101,101|B:110,101,110,101,110|C:011,100,100,100,011|D:110,101,101,101,110|"+
        "E:111,100,110,100,111|F:111,100,110,100,100|G:011,100,101,101,011|H:101,101,111,101,101|"+
        "I:111,010,010,010,111|J:001,001,001,101,010|K:101,101,110,101,101|L:100,100,100,100,111|"+
        "M:101,111,111,101,101|N:110,101,101,101,101|O:010,101,101,101,010|P:110,101,110,100,100|"+
        "Q:010,101,101,111,011|R:110,101,110,101,101|S:011,100,010,001,110|T:111,010,010,010,010|"+
        "U:101,101,101,101,111|V:101,101,101,101,010|W:101,101,111,111,101|X:101,101,010,101,101|"+
        "Y:101,101,010,010,010|Z:111,001,010,100,111|"+
        "-:000,000,111,000,000|.:000,000,000,000,010|!:010,010,010,000,010|?:110,001,010,000,010|"+
        "':010,010,000,000,000|+:000,010,111,010,000|/:001,001,010,100,100";
  d.split("|").forEach(function(e){
    var i=e.indexOf(":");f[e.slice(0,i)]=e.slice(i+1).split(",");
  });
  f[" "]=["000","000","000","000","000"];
  return f;
})();

/* draw a tiny text string, 1px letterspacing, all coords floored */
function text3(g,str,x,y,col){
  x=x|0; y=y|0; g.fillStyle=col;
  for(var i=0;i<str.length;i++){
    var gl=FONT[str[i].toUpperCase()]||FONT[" "];
    for(var r=0;r<5;r++)for(var c=0;c<3;c++)
      if(gl[r][c]==="1") g.fillRect(x+i*4+c, y+r, 1,1);
  }
}
function text3w(s){return s.length*4-1;}

/* -------------------------------------------------- 3. HAND-AUTHORED SPRITES
   '.' = transparent. Every other char maps through a key object to a palette
   name. Light comes from the UPPER-LEFT on every single one of these.
   ------------------------------------------------------------------------ */
function norm(rows){
  var w=0,i;
  for(i=0;i<rows.length;i++) if(rows[i].length>w) w=rows[i].length;
  for(i=0;i<rows.length;i++) while(rows[i].length<w) rows[i]+=".";
  rows.w=w; rows.h=rows.length;
  return rows;
}

/* --- miniatures: 11 wide, 17 tall, last 4 rows are the round pewter base --- */
/* the round pewter base every mini stands on. Deliberately uses characters
   (z v u) that no body sprite uses, so one BASEK block works for all of them. */
var MINI_BASE=[
  "...ooooo...",
  ".oozzzzzoo.",
  "ouvvvvvvvuo",
  ".ooooooooo."
];
var BASEK={o:"INK1",z:"S3",v:"S1",u:"S2"};
function mkey(extra){
  var k={}; for(var a in BASEK) k[a]=BASEK[a];
  for(var b in extra) k[b]=extra[b];
  return k;
}

var SPR={};

/* the party's tank: closed great-helm, tabard, kite shield, blade over shoulder */
SPR.fighter=norm([
  "....ooo....",
  "...o444o...",
  "..oo433o...",
  "..o41o1o.o.",
  "..oo332o.4o",
  ".oo4333o.4o",
  "oym44mm2o4o",
  "oymn4mnm24o",
  "oymn4mnm23o",
  ".oym4mnm2o.",
  "..oo33o3o..",
  "...o2o.o2o."
].concat(MINI_BASE));
SPR.fighter.key=mkey({"1":"S0","2":"S1","3":"S2","4":"S3",m:"M1",n:"M2",y:"Y2"});

/* wizard: enormous pointed hat, beard, gnarled staff with a lit tip */
SPR.wizard=norm([
  ".....o.....",
  "....obo....",
  "...obbbo..o",
  "..obbbbbo3o",
  ".obbbbbbo4o",
  "obbbbbbbo3o",
  ".oPPPPPo.y.",
  "..oPKPo..y.",
  "..o444o..y.",
  ".ob444bo.y.",
  ".obbbbbo.y.",
  "..ob4bo..y."
].concat(MINI_BASE));
SPR.wizard.key=mkey({b:"B1","3":"B0","4":"P2",P:"P4",K:"INK1",y:"W3"});

/* rogue: deep hood, no face, twin daggers, cloak flare */
SPR.rogue=norm([
  "....ooo....",
  "...okkko...",
  "..okkkkko..",
  "..okKKKko..",
  "..okkkkko..",
  ".ookkkkkoo.",
  "os2kkkkk2so",
  "o.2kkkkk2.o",
  "..okkkkko..",
  "..okkkkko..",
  "..ok.o.ko..",
  "...o2o2o..."
].concat(MINI_BASE));
SPR.rogue.key=mkey({k:"INK3",K:"INK1",s:"S2","2":"S3"});

/* cleric: mitre, holy symbol sunburst, mace, pale vestments */
SPR.cleric=norm([
  "....ooo....",
  "...oPPPo...",
  "...oPy1o...",
  "...o1o1o...",
  "...oPP1o...",
  "..ooPPPoo..",
  ".oyPPPPPyo.",
  "oyPPyyyPPyo",
  "oyPPyKyPPyo",
  ".oPPyyyPPo.",
  "..oPP.PPo..",
  "...o1o1o..."
].concat(MINI_BASE));
SPR.cleric.key=mkey({P:"P3",y:"Y2",K:"Y3","1":"P0"});

/* BEHOLDER: central eye plus three eyestalks — pure silhouette value */
SPR.beholder=norm([
  ".....o.....",
  "....oPo....",
  ".o...r...o.",
  "oPo..r..oPo",
  ".r...r...r.",
  "..r..r..r..",
  "..oorrroo..",
  ".oRRRRRRRo.",
  "oRRRoPoRRro",
  "oRRoPKPorro",
  "oRrroPoorro",
  ".orrrrrrro."
].concat(MINI_BASE));
SPR.beholder.key=mkey({R:"M3",r:"M2",P:"P4",K:"INK1"});

/* OWLBEAR: ear tufts, hooked beak, heavy shoulders */
SPR.owlbear=norm([
  "..o.....o..",
  ".oto...oto.",
  ".ottttttto.",
  "ot44444ttto",
  "ot4o4o4ttto",
  "ot4yyy4ttto",
  ".ot4y4ttto.",
  "obttttttbo.",
  "obbbbbbbbbo",
  "obbBBBBbbbo",
  ".obbBBbbbo.",
  "..ob.o.bo.."
].concat(MINI_BASE));
SPR.owlbear.key=mkey({t:"K1","4":"P2",y:"Y2",b:"K0",B:"K1"});

/* GELATINOUS CUBE: translucent block with a swallowed skeleton and a coin */
SPR.cube=norm([
  "..ooooooo..",
  ".oggggggeo.",
  "oggggggggeo",
  "oggPgggggeo",
  "oggPPgggPeo",
  "oggPgPgPgeo",
  "oggggPPggeo",
  "oggggPgggeo",
  "oggygggggeo",
  "oggggggggeo",
  ".oeeeeeeeo.",
  "..ooooooo.."
].concat(MINI_BASE));
SPR.cube.key=mkey({g:"E1",e:"E0",G:"E2",P:"P4",y:"Y2"});

/* --- table props ---------------------------------------------------------- */

/* candlestick, seen from a hair above eye level: brass dish + wax stub */
SPR.candle=norm([
  ".....ddd.....",
  "....dwwwe....",
  "....dwwwe....",
  "....dwwwe....",
  "....dwwwe....",
  "...odwwwee...",
  "...owwwwwe...",
  "..obbbbbbbo..",
  ".obbBBBbbbao.",
  "obbBBBBBbbaao",
  "obbbbbbbbbaao",
  ".oabbbbbaaao.",
  "..oaaaaaaao..",
  "....ooooo...."
]);
SPR.candle.key={o:"INK1",d:"P4",w:"P3",e:"P1",b:"Y1",B:"Y3",a:"Y0"};

/* flame — three discrete frames, never tweened */
SPR.flameA=norm(["..1..",".121.",".121.",".232.",".232.",".343.",".343.",".232.","..2.."]);
SPR.flameB=norm(["..1..","..12.",".121.",".232.",".233.",".343.",".343.",".232.","..2.."]);
SPR.flameC=norm([".1...",".21..",".121.",".232.",".332.",".343.",".343.",".232.","..2.."]);
SPR.flameA.key=SPR.flameB.key=SPR.flameC.key={"1":"F0","2":"F1","3":"F2","4":"F3"};

/* stoneware mug, from above, with a dark coffee disc and a fat handle */
SPR.mug=norm([
  "...ooooo....",
  "..occcccoo..",
  ".ocPPPPPcoo.",
  "ocPKKKKKPcoo",
  "ocPKKKKKPco0",
  "ocPKKKKKPc0o",
  "ocPKKKKKPc0o",
  ".ocPKKKPcoo.",
  "..occcccoo..",
  "...ooooo...."
]);
SPR.mug.key={o:"INK1",c:"P2",P:"P0",K:"W0","0":"P1"};

/* reading glasses — two gold rims, folded arm */
SPR.glasses=norm([
  ".oooo...oooo..",
  "oyyyyo.oyyyyo.",
  "oyKKyoyoyKKyo.",
  "oyKKyo.oyKKyoy",
  "oyyyyo.oyyyyoy",
  ".oooo...oooo.."
]);
SPR.glasses.key={o:"INK1",y:"Y2",K:"P4"};

/* chewed pencil: yellow, graphite point, pink eraser, teeth marks */
SPR.pencil=norm([
  ".ogggyyyyyyyyyyyyyyrro.",
  "oGgggyYYYYYYYYYYYYYrreo",
  ".ogggyyyyyyoyyyyyyyrro."
]);
SPR.pencil.key={o:"INK1",g:"S1",G:"S3",y:"Y1",Y:"Y2",r:"M3",e:"M2"};

/* a torn-open snack bag with three puffs spilled out */
SPR.chips=norm([
  "..ooooooooo...",
  ".oCCCCCCCCCo..",
  "oCCMMMMMMMCCo.",
  "oCMMYYYYYMMCo.",
  "oCMMYY.YYMMCo.",
  "oCCMMMMMMMCCo.",
  ".oCCCCCCCCo...",
  "..oooooooo....",
  "....ooo..oo...",
  "...oFFo.oFFo..",
  "....oo...oo..."
]);
SPR.chips.key={o:"INK1",C:"C0",M:"M1",Y:"Y2",F:"F2"};

/* the cat — four frame walk, viewed from above, tail whipping */
var CATK={o:"INK1",b:"INK3",B:"S0",f:"P1",p:"K1",e:"E2"};
SPR.cat0=norm([
  "...oo.....oo....",
  "..obbo...obbo...",
  "..obbboooobbo...",
  "..obbeoobebbo...",
  "...obbbbbbbo....",
  "..obBBBBBBBbo...",
  ".obBBBBBBBBBbo..",
  "..obBBBBBBBbo.oo",
  "...obbbbbbboooo.",
  "...o.o...o.o...."
]);
SPR.cat1=norm([
  "...oo.....oo....",
  "..obbo...obbo...",
  "..obbboooobbo...",
  "..obbeoobebbo...",
  "...obbbbbbbo....",
  "..obBBBBBBBbo...",
  ".obBBBBBBBBBbo..",
  "..obBBBBBBBbooo.",
  "...obbbbbbbo..oo",
  "...o..oo..o....."
]);
SPR.cat2=norm([
  "...oo.....oo....",
  "..obbo...obbo...",
  "..obbboooobbo...",
  "..obbeoobebbo...",
  "...obbbbbbbo....",
  "..obBBBBBBBbo...",
  ".obBBBBBBBBBbooo",
  "..obBBBBBBBbo.oo",
  "...obbbbbbbo....",
  "..o.o.....o.o..."
]);
SPR.cat3=norm([
  "...oo.....oo....",
  "..obbo...obbo...",
  "..obbboooobbo...",
  "..obbeoobebbo...",
  "...obbbbbbbo....",
  "..obBBBBBBBbo...",
  ".obBBBBBBBBBbo..",
  "..obBBBBBBBbo...",
  "...obbbbbbbo.ooo",
  "...oo....oo.oo.."
]);
SPR.cat0.key=SPR.cat1.key=SPR.cat2.key=SPR.cat3.key=CATK;

/* moth, two frames — wings up / wings out */
SPR.moth0=norm(["oo...oo","oPPoPPo",".oPPPo.","..oPo..","..o.o.."]);
SPR.moth1=norm([".......","oPPoPPo","oPPPPPo",".oPPPo.","..o.o.."]);
SPR.moth0.key=SPR.moth1.key={o:"INK2",P:"P2"};

/* a hand reaching in from the near edge of the table to nudge a mini */
SPR.hand=norm([
  "....oo..oo..oo....",
  "...oKKooKKooKKo...",
  "..oKKKoKKKoKKKKo..",
  ".oKKKKKKKKKKKKKKo.",
  "oKKKKKKKKKKKKKKKo.",
  "oKKKKKKKKKKKKKKKKo",
  ".oKKKKKKKKKKKKKKKo",
  "..oKKKKKKKKKKKKKo.",
  "...oKKKKKKKKKKKo..",
  "...okKKKKKKKKKko..",
  "...okkKKKKKKKko...",
  "....okkkkkkkko....",
  "....okkkkkkkko....",
  "....o1111111o.....",
  "....o1111111o.....",
  "....o1111111o....."
]);
SPR.hand.key={o:"INK1",K:"K2",k:"K1","1":"B1"};

/* --- polyhedral dice: real, distinct silhouettes -------------------------- */
/* body 'a', lit face 'b', shadow face 'c', outline 'o', number well 'n'      */
SPR.d20=norm([
  "...oooo...",
  "..obbbbo..",
  ".obbbbbbo.",
  "obbnnnnbbo",
  "obnnnnnnbo",
  "obnnnnnnbo",
  "ocnnnnnnco",
  ".occcccco.",
  "..occcco..",
  "...oooo..."
]);
SPR.d12=norm([
  "...oooo...",
  "..obbbbo..",
  ".obbbbbbo.",
  "obnnnnnnbo",
  "obnnnnnnbo",
  "obnnnnnnbo",
  "occnnnncco",
  ".occcccco.",
  "..occcco..",
  "...oooo..."
]);
SPR.d10=norm([
  "....oo....",
  "...obbo...",
  "..obbbbo..",
  ".obnnnnbo.",
  "obnnnnnnbo",
  "obnnnnnnbo",
  ".occnnnco.",
  "..occcco..",
  "...occo...",
  "....oo...."
]);
SPR.d8=norm([
  "....oo....",
  "...obbo...",
  "..obbbbo..",
  ".obnnnnbo.",
  "obnnnnnnbo",
  ".ocnnnnco.",
  "..occcco..",
  "...occo...",
  "....oo....",
  ".........."
]);
SPR.d6=norm([
  "..oooooo..",
  ".obbbbbbo.",
  "obnnnnnnbo",
  "obnnnnnnbo",
  "obnnnnnnbo",
  "obnnnnnnbo",
  "ocnnnnnnco",
  ".occcccco.",
  "..oooooo..",
  ".........."
]);
SPR.d4=norm([
  "....oo....",
  "....bb....",
  "...obbo...",
  "...obbo...",
  "..obnnbo..",
  "..onnnno..",
  ".ocnnnnco.",
  ".occcccco.",
  "occccccclo",
  "oooooooooo"
]);

/* --------------------------------------------------- 4. SPRITE BLIT + CACHE */
var sprCache=new Map();
function makeSprCanvas(spr,key,flip){
  var c=document.createElement("canvas");
  c.width=spr.w; c.height=spr.h;
  var g=c.getContext("2d");
  for(var j=0;j<spr.h;j++){
    var row=spr[j];
    for(var i=0;i<row.length;i++){
      var ch=row[i];
      if(ch==="."||ch===" ") continue;
      var kn=key[ch]; if(!kn) continue;
      g.fillStyle=PAL[kn]||kn;
      g.fillRect(flip?(spr.w-1-i):i, j, 1,1);
    }
  }
  return c;
}
function blit(g,spr,key,id,x,y,flip){
  var cid=id+"|"+PALVER+(flip?"F":"");
  var c=sprCache.get(cid);
  if(!c){ c=makeSprCanvas(spr,key||spr.key,flip); sprCache.set(cid,c); }
  g.drawImage(c, x|0, y|0);
}
/* recolour helper for dice: build a per-colourway key */
function dieKey(set){return {o:"INK1",b:set[2],c:set[0],n:set[1],l:set[0]};}

/* ============================================================ 5. THE WORLD */
var WORLD_W=640, WORLD_H=560;

/* the dungeon, hand-drawn on graph paper. 30 x 26 cells of 12px.
   # rock  . floor  + door  ~ water  > stairs  o pillar  T trap  C chest     */
var MAP=[
"##############################",
"##############################",
"##.......#####.......#########",
"##.>.....#####.......#########",
"##.......#####.o...o.#########",
"##.......+...+.......#########",
"##.......#####.o...o.#########",
"##.......#####.......#########",
"#####+########.......#########",
"#####.###########+############",
"#####.###########.############",
"#####.###########.############",
"#####.###########.############",
"###.....#####..........#######",
"###.....#####..~~~~....#######",
"###.....+...+..~~~~....#######",
"###.....#####..~~~~....#######",
"###.....#####..........#######",
"###.....############+#########",
"###..C..############.#########",
"####################T#########",
"#################..........###",
"#################.........####",
"#################....o....####",
"#################.........####",
"##############################"];
var MCW=30, MCH=26, CELL=12;
var PAPER_X=138, PAPER_Y=112;                 /* world position of the sheet */
var GRID_X=PAPER_X+16, GRID_Y=PAPER_Y+18;     /* world position of cell 0,0  */
var PAPER_W=MCW*CELL+32, PAPER_H=MCH*CELL+34;

function cellAt(cx,cy){
  if(cx<0||cy<0||cx>=MCW||cy>=MCH) return "#";
  return MAP[cy][cx];
}
function isFloor(cx,cy){var c=cellAt(cx,cy);return c!=="#";}
function cellWX(cx){return GRID_X+cx*CELL;}
function cellWY(cy){return GRID_Y+cy*CELL;}

/* BFS distance from the party's entry stair — drives the fog-of-war peel */
var DIST=new Int16Array(MCW*MCH).fill(9999);
(function bfs(){
  var q=[[3,3]]; DIST[3*MCW+3]=0;
  var d=[[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){
    var n=q.shift(), x=n[0], y=n[1], dd=DIST[y*MCW+x];
    for(var i=0;i<4;i++){
      var nx=x+d[i][0], ny=y+d[i][1];
      if(nx<0||ny<0||nx>=MCW||ny>=MCH) continue;
      if(!isFloor(nx,ny)) continue;
      if(DIST[ny*MCW+nx]<=dd+1) continue;
      DIST[ny*MCW+nx]=dd+1; q.push([nx,ny]);
    }
  }
  /* rock cells inherit the distance of their nearest floor neighbour +1 */
  for(var y2=0;y2<MCH;y2++)for(var x2=0;x2<MCW;x2++){
    if(isFloor(x2,y2)) continue;
    var best=9999;
    for(var oy=-1;oy<=1;oy++)for(var ox=-1;ox<=1;ox++){
      var vx=x2+ox, vy=y2+oy;
      if(vx<0||vy<0||vx>=MCW||vy>=MCH) continue;
      if(isFloor(vx,vy)&&DIST[vy*MCW+vx]+1<best) best=DIST[vy*MCW+vx]+1;
    }
    DIST[y2*MCW+x2]=best;
  }
})();
var revealDist=28;          /* grows over the session — the fog peels back   */
var REVEAL_MAX=62;

/* ------------------------------------------------- 6. TIME, PHASE, WEATHER */
var PHASES=[
  {id:"witching", name:"Witching Hour", tint:"#2A1A12", amt:.46, dark:.94, darkCol:"#080604", warm:1.00, beam:"moon", beamA:.26},
  {id:"dawn",     name:"Dawn",          tint:"#4A2E3C", amt:.30, dark:.62, darkCol:"#160E14", warm:.85, beam:"sun",  beamA:.34},
  {id:"morning",  name:"Morning",       tint:"#DCE6F0", amt:.14, dark:.20, darkCol:"#241D18", warm:.42, beam:"sun",  beamA:.60},
  {id:"noon",     name:"High Noon",     tint:"#FFF6E0", amt:.17, dark:.10, darkCol:"#2A2118", warm:.30, beam:"sun",  beamA:.72},
  {id:"dusk",     name:"Dusk",          tint:"#7A3418", amt:.30, dark:.52, darkCol:"#1A0C08", warm:.92, beam:"sun",  beamA:.40},
  {id:"night",    name:"Candlelight",   tint:"#3A1E08", amt:.42, dark:.84, darkCol:"#0C0703", warm:1.00, beam:"moon", beamA:.20}
];
function phaseForHour(h){
  if(h<5)  return PHASES[0];
  if(h<8)  return PHASES[1];
  if(h<11) return PHASES[2];
  if(h<16) return PHASES[3];
  if(h<19) return PHASES[4];
  if(h<23) return PHASES[5];
  return PHASES[0];
}
/* smooth blend between the current phase and the next one across its window */
function phaseBlend(now){
  var h=now.getHours()+now.getMinutes()/60;
  var edges=[0,5,8,11,16,19,23,24];
  var idx=[0,1,2,3,4,5,0];
  var i=0; while(i<7 && h>=edges[i+1]) i++;
  var a=PHASES[idx[i]], b=PHASES[idx[(i+1)%7]];
  var span=edges[i+1]-edges[i];
  var t=clamp((h-edges[i])/span,0,1);
  t=t<.72?0:(t-.72)/.28;                /* hold the phase, then cross-fade   */
  return {a:a,b:b,t:t,cur:a};
}
function mixPhase(pb,f){
  var a=pb.a,b=pb.b,t=pb.t;
  return {
    name:a.name, id:a.id,
    tint:mixHex(a.tint,b.tint,t), amt:lerp(a.amt,b.amt,t),
    dark:lerp(a.dark,b.dark,t), darkCol:mixHex(a.darkCol,b.darkCol,t),
    warm:lerp(a.warm,b.warm,t),
    beam:(t>.5?b.beam:a.beam), beamA:lerp(a.beamA,b.beamA,t)
  };
}

/* correct moon phase for today (Conway-ish, accurate to about a day) */
function moonInfo(d){
  var lp=2551443, base=new Date(1970,0,7,20,35,0);
  var age=(((d.getTime()-base.getTime())/1000)%lp+lp)%lp;
  var frac=age/lp;                                  /* 0 = new, .5 = full    */
  var illum=(1-Math.cos(frac*Math.PI*2))/2;
  var names=["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous",
             "Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];
  var idx=Math.floor(frac*8+.5)%8;
  return {frac:frac, illum:illum, name:names[idx]};
}

/* weather rotates on a slow, deterministic schedule seeded by the date */
var WEATHER=["clear","rain","snow","clear","fog","rain"];
function weatherNow(d){
  var slot=Math.floor(d.getTime()/(1000*60*90));    /* changes every 90 min  */
  var r=mulberry32(slot*2654435761);
  r();r();
  return WEATHER[Math.floor(r()*WEATHER.length)];
}

var TIME={ph:null, moon:null, weather:"clear", stamp:0};

/* ============================================== 7. OFFSCREEN WORLD LAYERS */
function mkCanvas(w,h){var c=document.createElement("canvas");c.width=w;c.height=h;return c;}
var LTable=mkCanvas(WORLD_W,WORLD_H);      /* wood + paper + static props    */
var LFog  =mkCanvas(WORLD_W,WORLD_H);      /* fog of war over the map        */
var LBeam =mkCanvas(WORLD_W,WORLD_H);      /* window light bar               */
var LMask =[mkCanvas(WORLD_W,WORLD_H),mkCanvas(WORLD_W,WORLD_H),mkCanvas(WORLD_W,WORLD_H)];

var CANDLE_X=68, CANDLE_Y=286;             /* the page's actual light source */
var FLAME_X=CANDLE_X+4, FLAME_Y=CANDLE_Y-9;

/* ---------------------------------------------------- 7a. bake the tabletop */
function bakeTable(){
  var g=LTable.getContext("2d");
  g.imageSmoothingEnabled=false;
  var r=mulberry32(0x5EED17);

  /* --- oak planks, 46px, three wood tones + wandering 1px grain ---------- */
  g.fillStyle=PAL.W2; g.fillRect(0,0,WORLD_W,WORLD_H);
  var plank=46;
  for(var py=0; py<WORLD_H; py+=plank){
    var tone=[PAL.W1,PAL.W2,PAL.W3][ri(r,0,2)];
    g.fillStyle=tone; g.fillRect(0,py,WORLD_W,plank);
    /* seam: hard dark line + one dithered row so it is not a razor edge */
    g.fillStyle=PAL.W0; g.fillRect(0,py,WORLD_W,1);
    g.fillStyle=PAL.W1;
    for(var sx=0;sx<WORLD_W;sx++) if(bayer(sx,py)<.5) g.fillRect(sx,py+1,1,1);
    /* grain: long wavering strokes one step off the plank tone */
    var grains=ri(r,7,11);
    for(var gi=0; gi<grains; gi++){
      var gy=py+ri(r,3,plank-4);
      var col=r()<.5?PAL.W0:PAL.W4;
      g.fillStyle=col;
      var x=ri(r,-40,WORLD_W), len=ri(r,60,260), yy=gy;
      for(var s=0;s<len;s++){
        if(r()<.045) yy+=(r()<.5?-1:1);
        yy=clamp(yy,py+1,py+plank-2);
        if(r()<.82) g.fillRect((x+s)|0, yy|0, 1,1);
      }
    }
    /* knots */
    if(r()<.55){
      var kx=ri(r,20,WORLD_W-20), ky=py+ri(r,10,plank-10), kr=ri(r,3,6);
      for(var ry=-kr;ry<=kr;ry++)for(var rx=-kr-2;rx<=kr+2;rx++){
        var dd=Math.sqrt((rx*rx)/1.9+ry*ry);
        if(dd<kr){ g.fillStyle=(dd<kr*.45)?PAL.W0:PAL.W1; g.fillRect(kx+rx,ky+ry,1,1); }
      }
    }
  }

  /* --- old coffee ring stains (mug has been moved twice) ---------------- */
  ringStain(g, 96, 452, 13);
  ringStain(g, 572, 424, 11);

  /* --- the DM screen standing along the far edge ------------------------ */
  drawDMScreen(g);

  /* --- the graph-paper battle map --------------------------------------- */
  drawPaper(g, PAPER_X, PAPER_Y, PAPER_W, PAPER_H);
  drawGraphGrid(g);
  drawDungeonInk(g);

  /* --- loose index cards / handouts scattered on the wood ---------------- */
  drawPaper(g, 26, 372, 76, 52, -1);  ruled(g,26,372,76,52);
  drawPaper(g, 40, 388, 74, 50, 1);   ruled(g,40,388,74,50);
  drawPaper(g, 538, 104, 88, 58, 1);  ruled(g,538,104,88,58);
  drawPaper(g, 176, 486, 92, 54, -1); ruled(g,176,486,92,54);
  /* a scribbled spell list on the top card */
  text3(g,"WARDS",46,394,PAL.M1);
  text3(g,"3 LEFT",46,402,PAL.INK2);
  text3(g,"XP 4400",544,112,PAL.INK2);
  text3(g,"LOOT",544,122,PAL.M1);
  text3(g,"+2 AXE",544,132,PAL.INK2);
  text3(g,"SESSION 14",182,492,PAL.M1);
  text3(g,"THE VAULT",182,502,PAL.INK2);
  text3(g,"OF KARSUS",182,512,PAL.INK2);

  /* --- the initiative strip (static parchment; marker drawn live) -------- */
  drawPaper(g, 148, 78, 196, 24, 0);
  text3(g,"INITIATIVE",152,81,PAL.M1);

  /* --- props, each with a hard 2px offset shadow (light = upper-left) ---- */
  shadowFor(g,SPR.mug,     104,432, PAL.W0);   blit(g,SPR.mug,null,"mug",104,432);
  shadowFor(g,SPR.candle,  CANDLE_X-6,CANDLE_Y-14, PAL.W0);
  blit(g,SPR.candle,null,"candle",CANDLE_X-6,CANDLE_Y-14);
  shadowFor(g,SPR.glasses, 550,178, PAL.W0);   blit(g,SPR.glasses,null,"glasses",550,178);
  shadowFor(g,SPR.pencil,  56,150, PAL.W0);    blit(g,SPR.pencil,null,"pencil",56,150);
  shadowFor(g,SPR.chips,   546,462, PAL.W0);   blit(g,SPR.chips,null,"chips",546,462);
  shadowFor(g,SPR.pencil,  548,80, PAL.W0);    blit(g,SPR.pencil,null,"pencil",548,80);

  /* a few crumbs and one stray cheese puff */
  var cr=mulberry32(99);
  for(var ci=0;ci<26;ci++){
    var cx=ri(cr,520,632), cy=ri(cr,440,536);
    g.fillStyle=cr()<.5?PAL.F2:PAL.C0;
    g.fillRect(cx,cy,1,1);
    if(cr()<.3) g.fillRect(cx+1,cy,1,1);
  }
}

function ringStain(g,cx,cy,rad){
  for(var y=-rad-2;y<=rad+2;y++)for(var x=-rad-3;x<=rad+3;x++){
    var d=Math.sqrt((x*x)/1.35+y*y);
    if(d>rad-2.2 && d<rad+.6){
      if(bayer(cx+x,cy+y) < .62){
        g.fillStyle=PAL.W0; g.fillRect((cx+x)|0,(cy+y)|0,1,1);
      }
    }
  }
}

/* a sheet of paper: base, lit top-left edge, shaded bottom-right, drop shadow */
function drawPaper(g,x,y,w,h,skew){
  x=x|0;y=y|0;w=w|0;h=h|0; skew=skew||0;
  g.fillStyle=PAL.W0;
  g.fillRect(x+3,y+4,w,h);                      /* cast shadow               */
  g.fillStyle=PAL.P3; g.fillRect(x,y,w,h);
  g.fillStyle=PAL.P4; g.fillRect(x,y,w,1); g.fillRect(x,y,1,h);
  g.fillStyle=PAL.P1; g.fillRect(x,y+h-1,w,1); g.fillRect(x+w-1,y,1,h);
  g.fillStyle=PAL.P0;
  g.fillRect(x+1,y+h-1,w-1,1);
  /* dog-eared corner */
  for(var i=0;i<7;i++){
    g.fillStyle=PAL.P1; g.fillRect(x+w-1-i, y+h-7+i, i+1, 1);
  }
  g.fillStyle=PAL.P0; g.fillRect(x+w-8,y+h-8,1,1);
  /* faint edge wear along the bottom, dithered so it is not a clean line */
  for(var ex=0;ex<w;ex++) if(bayer(x+ex,y+h-2)<.35){ g.fillStyle=PAL.P1; g.fillRect(x+ex,y+h-2,1,1); }
  if(skew){ /* one row of lift on a corner so cards don't look stamped */
    g.fillStyle=PAL.P4; g.fillRect(skew>0?x:x+w-6,y,6,1);
  }
}
function ruled(g,x,y,w,h){
  g.fillStyle=PAL.P1;
  for(var ly=y+12; ly<y+h-4; ly+=8) g.fillRect(x+4,ly,w-8,1);
  g.fillStyle=PAL.M2; g.fillRect(x+4,y+8,w-8,1);
}

/* fine blue-green graph rule at 6px, heavier every 12px */
function drawGraphGrid(g){
  var x0=PAPER_X+4, y0=PAPER_Y+4, x1=PAPER_X+PAPER_W-4, y1=PAPER_Y+PAPER_H-4;
  /* start the fine rule on a multiple of 6 away from the dungeon origin so
     the 6px paper grid and the 12px dungeon grid stay locked together      */
  var sx0=GRID_X-Math.ceil((GRID_X-x0)/6)*6;
  var sy0=GRID_Y-Math.ceil((GRID_Y-y0)/6)*6;
  g.fillStyle=PAL.G0;
  for(var x=sx0; x<x1; x+=6) g.fillRect(x|0,y0,1,y1-y0);
  for(var y=sy0; y<y1; y+=6) g.fillRect(x0,y|0,x1-x0,1);
  /* heavier 12px rule, dithered so it reads as a darker pencil pass */
  for(var x2=GRID_X-Math.ceil((GRID_X-x0)/CELL)*CELL; x2<x1; x2+=CELL)
    for(var yy=y0; yy<y1; yy++) if(bayer(x2,yy)<.55){ g.fillStyle=PAL.P0; g.fillRect(x2|0,yy,1,1); }
  for(var y2=GRID_Y-Math.ceil((GRID_Y-y0)/CELL)*CELL; y2<y1; y2+=CELL)
    for(var xx=x0; xx<x1; xx++) if(bayer(xx,y2)<.55){ g.fillStyle=PAL.P0; g.fillRect(xx,y2|0,1,1); }
}

/* hand-drawn ink: wobbling walls, doors, water, stairs, red-pen annotations */
function drawDungeonInk(g){
  var r=mulberry32(0xD4A6);
  function wob(){ return r()<.16 ? (r()<.5?-1:1) : 0; }
  function wall(x0,y0,x1,y1){
    /* 1px ink line with a lighter inner line — that is the classic look */
    if(y0===y1){
      var o=0;
      for(var x=x0;x<x1;x++){
        o+=wob(); o=clamp(o,-1,1);
        g.fillStyle=PAL.INK2; g.fillRect(x|0,(y0+o)|0,1,1);
        g.fillStyle=PAL.INK3; g.fillRect(x|0,(y0+o+1)|0,1,1);
      }
    }else{
      var o2=0;
      for(var y=y0;y<y1;y++){
        o2+=wob(); o2=clamp(o2,-1,1);
        g.fillStyle=PAL.INK2; g.fillRect((x0+o2)|0,y|0,1,1);
        g.fillStyle=PAL.INK3; g.fillRect((x0+o2+1)|0,y|0,1,1);
      }
    }
  }
  for(var cy=0;cy<MCH;cy++)for(var cx=0;cx<MCW;cx++){
    if(!isFloor(cx,cy)) continue;
    var X=cellWX(cx), Y=cellWY(cy);
    if(!isFloor(cx,cy-1)) wall(X,Y,X+CELL,Y);
    if(!isFloor(cx,cy+1)) wall(X,Y+CELL,X+CELL,Y+CELL);
    if(!isFloor(cx-1,cy)) wall(X,Y,X,Y+CELL);
    if(!isFloor(cx+1,cy)) wall(X+CELL,Y,X+CELL,Y+CELL);

    var ch=cellAt(cx,cy);
    if(ch==="~"){                                 /* water: dither + waves   */
      for(var wy=0;wy<CELL;wy++)for(var wx=0;wx<CELL;wx++){
        var b=bayer(X+wx,Y+wy);
        if(b<.55){ g.fillStyle=PAL.B2; g.fillRect(X+wx,Y+wy,1,1); }
        else if(b<.8){ g.fillStyle=PAL.B1; g.fillRect(X+wx,Y+wy,1,1); }
      }
      g.fillStyle=PAL.B0;
      g.fillRect(X+2,Y+3,5,1); g.fillRect(X+6,Y+8,5,1);
    }
    if(ch===">"){                                 /* stairs                  */
      g.fillStyle=PAL.INK2;
      for(var si=2; si<CELL-1; si+=3) g.fillRect(X+2,Y+si,CELL-4,1);
      g.fillStyle=PAL.INK3; g.fillRect(X+2,Y+2,1,CELL-4); g.fillRect(X+CELL-3,Y+2,1,CELL-4);
    }
    if(ch==="o"){                                 /* pillar                  */
      for(var oy=-3;oy<=3;oy++)for(var ox=-3;ox<=3;ox++){
        if(ox*ox+oy*oy<=9){ g.fillStyle=(ox+oy<-1)?PAL.INK3:PAL.INK2; g.fillRect(X+6+ox,Y+6+oy,1,1); }
      }
    }
    if(ch==="+"){                                 /* door: gap + two ticks   */
      g.fillStyle=PAL.P3; g.fillRect(X+1,Y+1,CELL-2,CELL-2);
      g.fillStyle=PAL.INK2;
      if(isFloor(cx-1,cy)&&isFloor(cx+1,cy)){
        g.fillRect(X+4,Y+2,1,CELL-4); g.fillRect(X+7,Y+2,1,CELL-4);
      }else{
        g.fillRect(X+2,Y+4,CELL-4,1); g.fillRect(X+2,Y+7,CELL-4,1);
      }
    }
    if(ch==="C"){                                 /* chest, in gold pen      */
      g.fillStyle=PAL.INK2; g.fillRect(X+2,Y+4,8,6);
      g.fillStyle=PAL.Y1; g.fillRect(X+3,Y+5,6,4);
      g.fillStyle=PAL.INK2; g.fillRect(X+5,Y+6,2,2);
    }
    if(ch==="T"){                                 /* trap, marked in red pen */
      g.fillStyle=PAL.M2;
      for(var ti=0;ti<8;ti++){ g.fillRect(X+2+ti,Y+2+ti,1,1); g.fillRect(X+9-ti,Y+2+ti,1,1); }
    }
  }

  /* pencil hatching outside the walls — DM shading the solid rock */
  var hr=mulberry32(0x4133);
  for(var hy=0;hy<MCH;hy++)for(var hx=0;hx<MCW;hx++){
    if(isFloor(hx,hy)) continue;
    var near=false;
    for(var oy2=-1;oy2<=1&&!near;oy2++)for(var ox2=-1;ox2<=1;ox2++)
      if(isFloor(hx+ox2,hy+oy2)){near=true;break;}
    if(!near) continue;
    var HX=cellWX(hx), HY=cellWY(hy);
    for(var k=0;k<4;k++){
      var sx=HX+ri(hr,1,CELL-5), sy=HY+ri(hr,1,CELL-5), ln=ri(hr,3,5);
      g.fillStyle=PAL.P0;
      for(var q=0;q<ln;q++) g.fillRect(sx+q,sy+q,1,1);
    }
  }

  /* the DM's annotations, in tiny caps */
  text3(g,"ENTRY",cellWX(2)+2,cellWY(1)+4,PAL.INK3);
  text3(g,"GREAT HALL",cellWX(14)+2,cellWY(1)+4,PAL.INK3);
  text3(g,"CISTERN",cellWX(14)+2,cellWY(12)+4,PAL.INK3);
  text3(g,"CRYPT",cellWX(3)+2,cellWY(12)+4,PAL.INK3);
  text3(g,"LAIR",cellWX(18)+2,cellWY(22)+4,PAL.M1);
  text3(g,"TRAP",cellWX(21)+2,cellWY(19)+4,PAL.M2);
  text3(g,"60 FT",cellWX(24)+2,cellWY(3)+4,PAL.INK3);
  /* a scale bar in red pen */
  g.fillStyle=PAL.M2;
  g.fillRect(cellWX(24)+2,cellWY(4)+4,CELL*2,1);
  g.fillRect(cellWX(24)+2,cellWY(4)+2,1,5);
  g.fillRect(cellWX(24)+2+CELL*2,cellWY(4)+2,1,5);
}

/* the DM screen: four maroon panels standing along the top edge, gold trim */
function drawDMScreen(g){
  var y0=0, h=64;
  g.fillStyle=PAL.M0; g.fillRect(0,y0,WORLD_W,h);
  g.fillStyle=PAL.M1; g.fillRect(0,y0,WORLD_W,h-10);
  /* panel hinge shadows */
  for(var px=0;px<WORLD_W;px+=160){
    g.fillStyle=PAL.M0; g.fillRect(px,y0,2,h);
    g.fillStyle=PAL.M2; g.fillRect(px+2,y0,1,h-10);
  }
  /* gold rules */
  g.fillStyle=PAL.Y1; g.fillRect(0,y0+h-12,WORLD_W,1);
  g.fillStyle=PAL.Y2; g.fillRect(0,y0+h-11,WORLD_W,1);
  g.fillStyle=PAL.Y0; g.fillRect(0,y0+h-10,WORLD_W,1);
  /* the near-edge lip catching the candle: the screen leans toward the DM */
  g.fillStyle=PAL.M0; g.fillRect(0,y0+h-9,WORLD_W,9);
  for(var dx=0;dx<WORLD_W;dx++) if(bayer(dx,y0+h-9)<.4){ g.fillStyle=PAL.M1; g.fillRect(dx,y0+h-9,1,1); }
  /* printed reference tables + a big gold d20 emblem */
  for(var t=0;t<4;t++){
    var tx=t*160+14;
    text3(g,["CONDITIONS","COVER  -2","DIFFICULT","DEATH SAVE"][t],tx,10,PAL.Y2);
    g.fillStyle=PAL.Y0; g.fillRect(tx,18,124,1);
    for(var rowi=0;rowi<4;rowi++){
      text3(g,["PRONE","BLIND","GRAPPLE","STUNNED"][rowi],tx,23+rowi*7,PAL.P1);
      text3(g,["DIS","AUTO","SPD 0","FAIL"][rowi],tx+70,23+rowi*7,PAL.P0);
    }
  }
  /* gold d20 emblem stamped in the middle panel */
  var ex=WORLD_W/2-10, ey=16;
  blit(g,SPR.d20,{o:"M0",b:"Y2",c:"Y0",n:"Y1",l:"Y0"},"emblem20",ex,ey);
  text3(g,"20",ex+2,ey+3,PAL.M0);
}

/* silhouette shadow of a sprite, offset down-right (light is upper-left) */
function shadowFor(g,spr,x,y,col){
  var c=sprCache.get("SH|"+PALVER+"|"+spr.w+"x"+spr.h+"|"+col);
  if(!c){
    c=mkCanvas(spr.w,spr.h);
    var gg=c.getContext("2d");
    gg.fillStyle=PAL[col]||col;
    for(var j=0;j<spr.h;j++)for(var i=0;i<spr[j].length;i++)
      if(spr[j][i]!=="."&&spr[j][i]!==" ") gg.fillRect(i,j,1,1);
    sprCache.set("SH|"+PALVER+"|"+spr.w+"x"+spr.h+"|"+col,c);
  }
  g.drawImage(c,(x+2)|0,(y+2)|0);
}

/* --------------------------------------------------------- 7b. bake the fog */
function bakeFog(){
  var g=LFog.getContext("2d");
  g.clearRect(0,0,WORLD_W,WORLD_H);
  for(var cy=0;cy<MCH;cy++)for(var cx=0;cx<MCW;cx++){
    var d=DIST[cy*MCW+cx];
    if(d<=revealDist-2) continue;
    var X=cellWX(cx), Y=cellWY(cy);
    /* soft two-step dithered edge over ~4 cells of distance */
    var t=clamp((d-(revealDist-2))/4,0,1);
    for(var y=0;y<CELL;y++)for(var x=0;x<CELL;x++){
      var b=bayer(X+x,Y+y);
      if(t>=1){ g.fillStyle=PAL.P1; g.fillRect(X+x,Y+y,1,1);
        if(b<.30){ g.fillStyle=PAL.P2; g.fillRect(X+x,Y+y,1,1); } }
      else if(b<t){ g.fillStyle=(b<t*.5)?PAL.P1:PAL.P2; g.fillRect(X+x,Y+y,1,1); }
    }
  }
  /* clip the fog to the paper */
  g.globalCompositeOperation="destination-in";
  g.fillStyle="#fff";
  g.fillRect(PAPER_X+3,PAPER_Y+3,PAPER_W-6,PAPER_H-6);
  g.globalCompositeOperation="source-over";
}

/* ----------------------------------------- 7c. bake the window light bar */
var BEAM={on:false,bx:0,w:132};
function bakeBeam(){
  var g=LBeam.getContext("2d");
  g.clearRect(0,0,WORLD_W,WORLD_H);
  BEAM.on=false;
  var ph=TIME.ph, now=new Date();
  var h=now.getHours()+now.getMinutes()/60;
  var isSun=(ph.beam==="sun");
  var col=isSun?PAL.F3:PAL.B2;
  var amp=ph.beamA*(isSun?1:(0.35+TIME.moon.illum*0.65));
  if(TIME.weather==="rain") amp*=.45;
  if(TIME.weather==="fog")  amp*=.60;
  if(TIME.weather==="snow") amp*=.75;
  if(amp<=0.02) return;

  /* the bar creeps across the table over the daylight / night hours */
  var t = isSun ? clamp((h-5.5)/13.5,0,1) : ((h>=19? (h-19)/10 : (h+5)/10));
  var bx = Math.floor(-200 + t*(WORLD_W+320));
  var barW=132, mun=9;
  BEAM.on=true; BEAM.bx=bx; BEAM.w=barW;
  var steps=[0,amp*0.40,amp*0.72,amp];
  var rgb=hex2rgb(col);
  var img=g.createImageData(WORLD_W,WORLD_H), d=img.data;
  for(var y=0;y<WORLD_H;y++){
    var xoff=Math.floor(y*0.42);
    for(var x=0;x<WORLD_W;x++){
      var u=x-(bx+xoff);
      if(u<-14||u>barW+14) continue;
      var v;
      if(u<0) v=1+u/14; else if(u>barW) v=1-(u-barW)/14; else v=1;
      /* window muntin: a dark cross-bar splitting the light */
      var m=Math.abs(u-barW/2);
      if(m<mun) v*= (m<mun-3?0.06:0.45);
      v=clamp(v,0,1);
      var f=v*3, base=Math.floor(f), fr=f-base;
      if(fr>bayer(x,y)) base++;
      base=clamp(base,0,3);
      if(base===0) continue;
      var i=(y*WORLD_W+x)*4;
      d[i]=rgb[0]; d[i+1]=rgb[1]; d[i+2]=rgb[2]; d[i+3]=Math.round(steps[base]*255);
    }
  }
  g.putImageData(img,0,0);
}

/* --------------------------------------- 7d. bake the three flicker masks */
var FLICK_R=[0,-7,-14];
var DARK_A=[0,.24,.48,.74];
var WARM_A=[0,.09,.17,.27];
function bakeLight(){
  var ph=TIME.ph;
  var dk=hex2rgb(ph.darkCol), wm=hex2rgb(PAL.F2);
  var outerBase=272;
  for(var s=0;s<3;s++){
    var g=LMask[s].getContext("2d");
    var img=g.createImageData(WORLD_W,WORLD_H), d=img.data;
    var R=outerBase+FLICK_R[s];
    var inner=R*0.20;
    var wR=(96+FLICK_R[s]*1.6)*ph.warm;
    for(var y=0;y<WORLD_H;y++){
      var dy=(y-CANDLE_Y)*1.12;
      for(var x=0;x<WORLD_W;x++){
        var dx=x-CANDLE_X;
        var dist=Math.sqrt(dx*dx+dy*dy);
        /* falloff, plus extra darkness hugging the table edges */
        var t=clamp((dist-inner)/(R-inner),0,1); t=t*t;
        var edge=Math.max(
          0,(24-Math.min(x,WORLD_W-1-x))/24,
          (24-Math.min(y,WORLD_H-1-y))/24
        );
        var v=clamp(ph.dark*t + edge*0.35*ph.dark, 0, 1);
        var f=v*3, base=Math.floor(f), fr=f-base;
        if(fr>bayer(x,y)) base++;
        base=clamp(base,0,3);
        var i=(y*WORLD_W+x)*4;
        if(base>0){
          d[i]=dk[0]; d[i+1]=dk[1]; d[i+2]=dk[2]; d[i+3]=Math.round(DARK_A[base]*255);
        }else if(wR>1){
          var wv=clamp(1-dist/wR,0,1); wv*=wv;
          var wf=wv*3, wb=Math.floor(wf), wfr=wf-wb;
          if(wfr>bayer(x+2,y+1)) wb++;
          wb=clamp(wb,0,3);
          if(wb>0){ d[i]=wm[0]; d[i+1]=wm[1]; d[i+2]=wm[2]; d[i+3]=Math.round(WARM_A[wb]*255); }
        }
      }
    }
    g.putImageData(img,0,0);
  }
}

/* ============================================== 8. ACTORS ON THE BATTLEMAP */
var COMBAT=[
  {spr:"fighter", name:"BRAM",  init:19, cx:15, cy:3, tx:15, ty:3, foe:false},
  {spr:"rogue",   name:"VESS",  init:17, cx:16, cy:6, tx:16, ty:6, foe:false},
  {spr:"owlbear", name:"OWLBR", init:14, cx:19, cy:5, tx:19, ty:5, foe:true},
  {spr:"wizard",  name:"ILVOR", init:11, cx:14, cy:7, tx:14, ty:7, foe:false},
  {spr:"beholder",name:"XANTH", init: 8, cx:19, cy:2, tx:19, ty:2, foe:true},
  {spr:"cleric",  name:"MOTA",  init: 5, cx:15, cy:7, tx:15, ty:7, foe:false},
  {spr:"cube",    name:"CUBE",  init: 3, cx:20, cy:7, tx:20, ty:7, foe:true}
];
COMBAT.forEach(function(a){ a.px=cellWX(a.cx); a.py=cellWY(a.cy); a.slide=0; a.bob=0; });
var turnIdx=0, turnTimer=0, roundNo=3;

function actorScreenPos(a){
  /* mini stands on the square, its base centred, body reaching up-left */
  return {x:a.px+CELL/2-5, y:a.py+CELL/2-13};
}
function stepTurn(){
  var a=COMBAT[turnIdx];
  /* pick a legal adjacent square, biased toward the nearest opposing actor */
  var best=null, bestD=1e9;
  var targets=COMBAT.filter(function(o){return o.foe!==a.foe;});
  var opts=[[1,0],[-1,0],[0,1],[0,-1],[0,0]];
  for(var i=0;i<opts.length;i++){
    var nx=a.cx+opts[i][0], ny=a.cy+opts[i][1];
    if(!isFloor(nx,ny)) continue;
    if(DIST[ny*MCW+nx]>revealDist) continue;
    var occupied=COMBAT.some(function(o){return o!==a&&o.tx===nx&&o.ty===ny;});
    if(occupied) continue;
    var d=1e9;
    for(var t2=0;t2<targets.length;t2++){
      var dd=Math.abs(targets[t2].cx-nx)+Math.abs(targets[t2].cy-ny);
      if(dd<d) d=dd;
    }
    if(d<=1) d+=3;                    /* don't crowd — minis keep some space */
    d+=Math.abs(opts[i][0])*0.1;
    if(d<bestD){bestD=d;best=[nx,ny];}
  }
  if(best){ a.tx=best[0]; a.ty=best[1]; a.slide=1; }
  turnIdx=(turnIdx+1)%COMBAT.length;
  if(turnIdx===0) roundNo++;
  setStat("st-init", COMBAT[turnIdx].name+" ("+COMBAT[turnIdx].init+")  RD "+roundNo);
}

/* ------------------------------------------------------------- 9. THE DICE */
var DICE_SETS=[
  ["M0","Y3","M2"],   /* maroon & gold — the house set */
  ["B0","P4","B2"],   /* midnight blue */
  ["INK1","F2","INK3"],/* smoke */
  ["E0","P4","E2"],   /* jade */
  ["M0","P2","P4"]    /* bone with maroon numerals */
];
var DICE=[
  {t:"d20",s:20,spr:SPR.d20,x:560,y:246,set:0},
  {t:"d12",s:12,spr:SPR.d12,x:588,y:262,set:1},
  {t:"d10",s:10,spr:SPR.d10,x:566,y:272,set:2},
  {t:"d10",s:10,spr:SPR.d10,x:594,y:238,set:0},
  {t:"d8", s:8, spr:SPR.d8, x:544,y:262,set:3},
  {t:"d6", s:6, spr:SPR.d6, x:604,y:284,set:4},
  {t:"d6", s:6, spr:SPR.d6, x:582,y:290,set:1},
  {t:"d4", s:4, spr:SPR.d4, x:552,y:288,set:2}
];
var TRAY={x0:534,y0:212,x1:634,y1:404};
DICE.forEach(function(d){ d.vx=0; d.vy=0; d.face=1+Math.floor(Math.random()*d.s); d.roll=0; d.spin=0; });

var rollOutEl=document.getElementById("rollout");
var rollHideT=0;
function say(msg,nat){
  rollOutEl.textContent=msg;
  rollOutEl.className="roll on"+(nat?" nat":"");
  rollHideT=performance.now()+4200;
}
function rollDice(){
  var r=Math.random;
  DICE.forEach(function(d){
    d.vx=(r()*2-1)*3.4; d.vy=(r()*2-1)*3.4;
    d.roll=1; d.spin=0;
  });
}
function settleReport(){
  var d20=DICE[0];
  var msg="d20 "+d20.face;
  var tot=0; DICE.forEach(function(d){tot+=d.face;});
  if(d20.face===20){
    say("Natural 20 — critical hit!",true);
    burst(d20.x+5,d20.y+5);
  }else if(d20.face===1){
    say("Natural 1. The DM is smiling.",false);
  }else{
    say("You rolled "+msg+" · all dice "+tot,false);
  }
}

/* ============================================ 10. PARTICLES & RARE EVENTS */
var motes=[];
(function(){
  var r=mulberry32(7);
  for(var i=0;i<44;i++) motes.push({
    x:rr(r,0,WORLD_W), y:rr(r,0,WORLD_H),
    vx:rr(r,-.14,.14), vy:rr(r,-.10,-.02), ph:rr(r,0,6.28)
  });
})();
var weatherP=[];
(function(){
  var r=mulberry32(21);
  for(var i=0;i<70;i++) weatherP.push({x:rr(r,0,WORLD_W),y:rr(r,0,WORLD_H),s:rr(r,.5,1.6),o:rr(r,0,6.28)});
})();
var sparks=[];
function burst(x,y){
  for(var i=0;i<26;i++){
    var a=Math.random()*Math.PI*2, sp=Math.random()*2.4+.6;
    sparks.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-.5,life:34+Math.random()*22});
  }
}

/* --- the rare events, on a ~30s wheel ------------------------------------ */
var EV={active:null, t:0, next:600};
var moth={x:0,y:0,a:0,r:34,life:0};
var cat={x:-40,y:470,f:0,life:0,dir:1};
var hand={y:0,life:0,tx:0,phase:0,target:null};
var flare={life:0};

function startEvent(){
  var pool=["moth","cat","hand","fog","flare"];
  var pick=pool[Math.floor(Math.random()*pool.length)];
  EV.active=pick; EV.t=0;
  if(pick==="moth"){ moth.life=780; moth.a=Math.random()*6.28; }
  if(pick==="cat"){ cat.life=560; cat.dir=Math.random()<.5?1:-1;
    cat.x=cat.dir>0?-24:WORLD_W+24; cat.y=ri(mulberry32(Date.now()&255),330,480); }
  if(pick==="hand"){ hand.life=420; hand.phase=0;
    hand.target=COMBAT[Math.floor(Math.random()*COMBAT.length)]; }
  if(pick==="fog"){ revealDist=Math.min(REVEAL_MAX,revealDist+7); bakeFog(); EV.active=null; EV.next=420; }
  if(pick==="flare"){ flare.life=150; }
}

/* ================================================== 11. THE RENDER TARGET */
var cv=null, ctx=null;
var VW=384, VH=216, SCALE=4;
var frozen=false;


/* ------------------------------------------------ 12. PALETTE / PHASE BAKE */
function retint(){
  var now=nowDate();
  var pb=phaseBlend(now);
  TIME.ph=mixPhase(pb);
  TIME.moon=moonInfo(now);
  TIME.weather=weatherNow(now);
  for(var k in BASE) PAL[k]=mixHex(BASE[k], TIME.ph.tint, TIME.ph.amt);
  PALVER++; sprCache.clear();
  bakeTable(); bakeFog(); bakeBeam(); bakeLight();
  updateStats();
}
function updateStats(){ /* see publish() */ }

/* ================================================== 13. THE ANIMATION LOOP */
var tick=0, last=0, acc=0, STEP=1000/30;
var panX=0, panY=0, breath=0;
var visible=true;

function viewOffset(){
  var maxY=Math.max(0, WORLD_H-VH), maxX=Math.max(0, WORLD_W-VW);
  var by=Math.sin(breath*0.0031)*7;
  var bx=Math.cos(breath*0.0023)*9;
  /* framed so the candle — the scene's actual light source, at x68 y286 —
     is always in shot, with the inked map running off to the right */
  var vy=clamp(maxY*0.52+by, 0, maxY);
  var vx=clamp(maxX*0.12+bx, 0, maxX);
  return {x:Math.floor(vx), y:Math.floor(vy)};
}

function update(){
  tick++;
  breath++;

  /* initiative: someone takes a turn every ~4.5s */
  turnTimer++;
  if(turnTimer>135){ turnTimer=0; stepTurn(); }
  COMBAT.forEach(function(a){
    if(a.slide>0){
      a.slide-=1/9;
      if(a.slide<=0){ a.slide=0; a.cx=a.tx; a.cy=a.ty; a.px=cellWX(a.cx); a.py=cellWY(a.cy); }
      else{
        var t=1-a.slide;
        a.px=Math.floor(lerp(cellWX(a.cx),cellWX(a.tx),t));
        a.py=Math.floor(lerp(cellWY(a.cy),cellWY(a.ty),t));
      }
    }
    /* integer bob only: 0,-1,0 */
    a.bob=(Math.floor(tick/14)+a.init)%6===0?-1:0;
  });

  /* dice physics — integer positions, no easing */
  var anyRolling=false, wasRolling=DICE.some(function(d){return d.roll>0;});
  DICE.forEach(function(d){
    if(d.roll>0){
      anyRolling=true;
      d.x+=d.vx; d.y+=d.vy;
      d.vx*=0.905; d.vy*=0.905;
      if(d.x<TRAY.x0){d.x=TRAY.x0;d.vx=Math.abs(d.vx)*.55;}
      if(d.x>TRAY.x1-10){d.x=TRAY.x1-10;d.vx=-Math.abs(d.vx)*.55;}
      if(d.y<TRAY.y0){d.y=TRAY.y0;d.vy=Math.abs(d.vy)*.55;}
      if(d.y>TRAY.y1-10){d.y=TRAY.y1-10;d.vy=-Math.abs(d.vy)*.55;}
      d.spin++;
      if(d.spin%2===0) d.face=1+Math.floor(Math.random()*d.s);
      if(Math.abs(d.vx)+Math.abs(d.vy)<0.24){
        d.roll=0; d.vx=d.vy=0; d.face=1+Math.floor(Math.random()*d.s);
      }
    }
  });
  if(wasRolling && !anyRolling) settleReport();

  /* sparks */
  for(var i=sparks.length-1;i>=0;i--){
    var s=sparks[i];
    s.x+=s.vx; s.y+=s.vy; s.vy+=0.055; s.vx*=0.96; s.life--;
    if(s.life<=0) sparks.splice(i,1);
  }

  /* motes drift up through the candle light */
  motes.forEach(function(m){
    m.x+=m.vx+Math.sin((tick*0.02)+m.ph)*0.08;
    m.y+=m.vy;
    if(m.y<-4){ m.y=WORLD_H+4; m.x=Math.random()*WORLD_W; }
    if(m.x<-4) m.x=WORLD_W+4; if(m.x>WORLD_W+4) m.x=-4;
  });

  /* weather particles (rain/snow drift over the beam) */
  if(TIME.weather!=="clear"){
    weatherP.forEach(function(p){
      if(TIME.weather==="rain"){ p.y+=6*p.s; p.x+=1.4; }
      else if(TIME.weather==="snow"){ p.y+=0.9*p.s; p.x+=Math.sin(tick*0.02+p.o)*0.5; }
      else { p.x+=0.25*p.s; }
      if(p.y>WORLD_H+6){p.y=-6;p.x=Math.random()*WORLD_W;}
      if(p.x>WORLD_W+6) p.x=-6;
    });
  }

  /* rare events */
  if(!EV.active){
    EV.next--;
    if(EV.next<=0){ startEvent(); EV.next=780+Math.floor(Math.random()*600); }
  }else{
    EV.t++;
    if(EV.active==="moth"){
      moth.life--; moth.a+=0.045;
      moth.r=30+Math.sin(tick*0.03)*10;
      moth.x=FLAME_X+Math.cos(moth.a)*moth.r;
      moth.y=FLAME_Y+Math.sin(moth.a)*moth.r*0.55;
      if(moth.life<=0) EV.active=null;
    }
    else if(EV.active==="cat"){
      cat.life--;
      cat.x+=0.9*cat.dir;
      if(tick%7===0) cat.f=(cat.f+1)&3;
      /* the cat scatters any die she steps near */
      DICE.forEach(function(d){
        if(Math.abs(d.x-cat.x)<12 && Math.abs(d.y-cat.y)<10 && d.roll===0){
          d.roll=1; d.vx=(Math.random()*2-1)*2.4; d.vy=(Math.random()*2-1)*2.4;
        }
      });
      if(cat.life<=0||cat.x<-40||cat.x>WORLD_W+40) EV.active=null;
    }
    else if(EV.active==="hand"){
      hand.life--;
      var L=420-hand.life;
      hand.y = L<120 ? Math.floor(lerp(WORLD_H+20, WORLD_H-150, L/120))
             : L<300 ? WORLD_H-150
             : Math.floor(lerp(WORLD_H-150, WORLD_H+20, (L-300)/120));
      if(L===260 && hand.target){
        hand.target.tx=clamp(hand.target.cx+(Math.random()<.5?1:-1),0,MCW-1);
        if(isFloor(hand.target.tx,hand.target.cy)) hand.target.slide=1;
        else hand.target.tx=hand.target.cx;
      }
      if(hand.life<=0) EV.active=null;
    }
    else if(EV.active==="flare"){
      flare.life--;
      if(flare.life<=0) EV.active=null;
    }
  }

  /* the phase / weather is re-evaluated (and layers re-baked) once a minute */
  if(tick%1800===0) retint();

  /* hide the roll readout */
  if(rollHideT && performance.now()>rollHideT){ rollOutEl.className="roll"; rollHideT=0; }
}

/* --------------------------------------------------------------- 14. DRAW */
function flickerStep(){
  if(frozen) return 0;
  if(flare.life>0) return 0;
  /* three DISCRETE brightness steps, held for a few frames each */
  var n=Math.floor(tick/4);
  var r=mulberry32(n*2246822519);
  var v=r();
  return v<.55?0:(v<.85?1:2);
}

function draw(force){
  var off=viewOffset();
  var ox=off.x, oy=off.y;
  var g=ctx;
  g.imageSmoothingEnabled=false;

  /* 1. baked tabletop */
  g.drawImage(LTable, ox,oy,VW,VH, 0,0,VW,VH);
  /* 2. fog of war */
  g.drawImage(LFog, ox,oy,VW,VH, 0,0,VW,VH);

  g.save();
  g.translate(-ox,-oy);

  /* 3. the initiative strip marker + names */
  drawInitStrip(g);

  /* 4. minis, back to front by y */
  var order=COMBAT.slice().sort(function(a,b){return a.py-b.py;});
  order.forEach(function(a){
    var p=actorScreenPos(a);
    var sx=Math.floor(p.x), sy=Math.floor(p.y)+a.bob;
    /* shadow on the paper, offset toward lower-right */
    var spr=SPR[a.spr];
    shadowFor(g,spr,sx,sy+1,"P0");
    blit(g,spr,null,"mini"+a.spr,sx,sy);
    /* active-turn marker: a small gold caret above the head */
    if(COMBAT[turnIdx]===a && !frozen && Math.floor(tick/9)%2===0){
      g.fillStyle=PAL.Y3;
      g.fillRect(sx+4,sy-5,3,1); g.fillRect(sx+5,sy-4,1,1);
    }
  });

  /* 5. dice */
  DICE.forEach(function(d){
    var set=DICE_SETS[d.set];
    shadowFor(g,d.spr,d.x|0,(d.y|0)+1,"W0");
    blit(g,d.spr,dieKey(set),"die"+d.t+d.set,d.x|0,d.y|0);
    /* the pip / number on the settled face */
    var f=String(d.face);
    var tw=text3w(f);
    var fx=Math.floor(d.x+5-tw/2), fy=Math.floor(d.y+(d.t==="d4"?5:3));
    text3(g,f,fx,fy,PAL[set[0]]);
  });

  /* 6. the candle flame (three-frame loop) + wick glow */
  var fstep=Math.floor(tick/6)%3;
  var fspr=[SPR.flameA,SPR.flameB,SPR.flameC][frozen?0:fstep];
  blit(g,fspr,null,"flame"+(frozen?0:fstep),FLAME_X-2,FLAME_Y-8);

  /* 7. the cat */
  if(EV.active==="cat"){
    var cs=[SPR.cat0,SPR.cat1,SPR.cat2,SPR.cat3][cat.f];
    shadowFor(g,cs,cat.x|0,(cat.y|0)+2,"W0");
    blit(g,cs,CATK,"cat"+cat.f,cat.x|0,cat.y|0,cat.dir<0);
  }
  /* 8. the hand */
  if(EV.active==="hand"){
    shadowFor(g,SPR.hand,262,hand.y,"W0");
    blit(g,SPR.hand,null,"hand",262,hand.y);
  }
  g.restore();

  /* 9. window light bar (additive) */
  g.globalCompositeOperation="lighter";
  g.drawImage(LBeam, ox,oy,VW,VH, 0,0,VW,VH);
  g.globalCompositeOperation="source-over";

  /* 10. weather specks live ONLY inside the light bar — they are the shadows
         of rain / snow on the unseen window, thrown across the table.       */
  if(TIME.weather!=="clear" && !frozen && BEAM.on){
    g.fillStyle = TIME.weather==="snow"?PAL.P4:(TIME.weather==="fog"?PAL.P2:PAL.B0);
    weatherP.forEach(function(p){
      var u=p.x-(BEAM.bx+Math.floor(p.y*0.42));
      if(u<2||u>BEAM.w-2) return;
      var x=Math.floor(p.x-ox), y=Math.floor(p.y-oy);
      if(x<0||y<0||x>=VW||y>=VH) return;
      if(TIME.weather==="rain") g.fillRect(x,y,1,3);
      else g.fillRect(x,y,1,1);
    });
  }

  /* 11. THE LIGHT MASK — the entire page is lit by this candle */
  g.drawImage(LMask[flickerStep()], ox,oy,VW,VH, 0,0,VW,VH);

  /* 12. things that live *above* the light: motes, sparks, moth */
  if(!frozen){
    g.fillStyle=PAL.F3;
    motes.forEach(function(m){
      var dx=m.x-CANDLE_X, dy=(m.y-CANDLE_Y)*1.1;
      if(dx*dx+dy*dy>150*150) return;
      var x=Math.floor(m.x-ox), y=Math.floor(m.y-oy);
      if(x<0||y<0||x>=VW||y>=VH) return;
      if((Math.floor(tick*0.14+m.ph*4)%5)===0) return;   /* twinkle, 2 states */
      g.fillRect(x,y,1,1);
    });
    g.fillStyle=PAL.Y3;
    sparks.forEach(function(s){
      var x=Math.floor(s.x-ox), y=Math.floor(s.y-oy);
      if(x<0||y<0||x>=VW||y>=VH) return;
      g.fillStyle = s.life>26?PAL.F3:(s.life>12?PAL.F2:PAL.F1);
      g.fillRect(x,y,1,1);
    });
  }
  if(EV.active==="moth"){
    var ms=(Math.floor(tick/4)%2)?SPR.moth1:SPR.moth0;
    var mx=Math.floor(moth.x-ox), my=Math.floor(moth.y-oy);
    blit(g,ms,null,"moth"+((Math.floor(tick/4)%2)?1:0),mx-3,my-2);
  }

  /* 13. the candle's own bright core, punched through the mask */
  var fx2=Math.floor(FLAME_X-ox), fy2=Math.floor(FLAME_Y-oy);
  g.fillStyle=PAL.F3;
  g.fillRect(fx2-1,fy2-2,3,4);

  /* 14. moon reflected in the mug at night — with the real current phase */
  if(TIME.ph.beam==="moon"){
    drawMoonInMug(g,ox,oy);
  }
}

/* the order-of-battle strip: six slots, gold marker on the active one */
function drawInitStrip(g){
  var x=154, y=90;
  for(var i=0;i<COMBAT.length;i++){
    var a=COMBAT[i], sx=x+i*26;
    g.fillStyle = a.foe?PAL.M2:PAL.B1;
    g.fillRect(sx,y,3,5);
    text3(g,String(a.init),sx+5,y,PAL.INK2);
    if(i===turnIdx){
      g.fillStyle=PAL.Y1;
      g.fillRect(sx-1,y+7,13,1);
      g.fillStyle=PAL.Y2;
      g.fillRect(sx+4,y-4,3,1); g.fillRect(sx+5,y-3,1,1);
    }
  }
}

/* a tiny correct-phase moon on the surface of the coffee */
function drawMoonInMug(g,ox,oy){
  var mx=104+6-ox, my=432+5-oy, r=3;
  var frac=TIME.moon.frac;
  for(var y=-r;y<=r;y++)for(var x=-r;x<=r;x++){
    if(x*x+y*y>r*r) continue;
    /* terminator: cosine of the illuminated fraction */
    var k=Math.cos(frac*Math.PI*2);
    var lit;
    if(frac<0.5) lit = (x/r) > -k*Math.sqrt(1-(y*y)/(r*r))*0 + (-k);
    else lit = (x/r) < (k);
    /* simple, readable approximation of a crescent */
    var edge=Math.sqrt(Math.max(0,1-(y*y)/(r*r)));
    var term=(frac<0.5? -k : k)*edge;
    lit = (frac<0.5) ? (x/r >= term) : (x/r <= term);
    if(TIME.moon.illum<0.06) continue;
    if(!lit) continue;
    g.fillStyle=PAL.P4;
    g.fillRect(Math.floor(mx+x),Math.floor(my+y),1,1);
  }
}

/* ------------------------------------------------------------- 15. DRIVER
   The table is drawn once into a 640x560 world; the band shows a window onto
   it that drifts slowly, as if you were sitting at the table breathing. The
   backing store IS the low-resolution buffer — devicePixelRatio is ignored on
   purpose, because CSS scales it up with image-rendering:pixelated.
   -------------------------------------------------------------------------- */

var onState=null, lastStateJSON="";
var hourOverride=null;
var running=false, rafId=0, phaseTimer=0, rzTimer=0;
var ro=null, io=null, onVis=null;

function nowDate(){
  var d=new Date();
  if(hourOverride!=null) d.setHours(hourOverride,0,0,0);
  return d;
}

function resize(){
  if(!cv) return;
  var cw=cv.clientWidth||640, ch=cv.clientHeight||240;
  if(cw<8||ch<8) return;
  var target = cw>=760 ? 520 : 300;   // wide enough to hold candle, map and table edge
  VW=Math.min(WORLD_W, target);
  VH=Math.min(WORLD_H, Math.max(80, Math.round(VW*ch/cw)));
  cv.width=VW; cv.height=VH;
  ctx=cv.getContext("2d",{alpha:false});
  ctx.imageSmoothingEnabled=false;
}

function publish(){
  if(!onState) return;
  var s={
    region:null, chapter:null,
    phase:TIME.ph.name,
    moon:TIME.moon.name,
    moonPct:Math.round(TIME.moon.illum*100),
    weather:TIME.weather==="clear"?"Clear":
            TIME.weather==="rain"?"Rain on the window":
            TIME.weather==="snow"?"Snow":"Fog",
    extra:COMBAT[turnIdx].name+" ("+COMBAT[turnIdx].init+") · Round "+roundNo
  };
  var j=JSON.stringify(s);
  if(j===lastStateJSON) return;
  lastStateJSON=j;
  try{ onState(s); }catch(e){}
}

function frame(ts){
  if(!running) return;
  rafId=requestAnimationFrame(frame);
  if(!last) last=ts;
  var dt=ts-last; last=ts;
  if(frozen || !visible || document.hidden) return;
  acc+=dt;
  if(acc>250) acc=250;
  var steps=0;
  while(acc>=STEP && steps<3){ update(); acc-=STEP; steps++; }
  if(steps>0){ draw(); publish(); }
}

function start(){
  if(running||frozen) return;
  running=true; last=0; acc=0;
  rafId=requestAnimationFrame(frame);
}
function stop(){
  running=false;
  if(rafId) cancelAnimationFrame(rafId);
  rafId=0;
}

function teardown(){
  stop();
  if(ro&&ro.disconnect) ro.disconnect();
  if(io&&io.disconnect) io.disconnect();
  if(onVis) document.removeEventListener("visibilitychange",onVis);
  if(phaseTimer) clearInterval(phaseTimer);
  if(rzTimer) clearTimeout(rzTimer);
  ro=io=onVis=null; phaseTimer=0; rzTimer=0;
  cv=null; ctx=null; onState=null;
}

var NOOP={setHour:function(){},jumpTo:function(){},roll:function(){},
          pause:function(){},resume:function(){},destroy:function(){}};

/* ------------------------------------------------------------ 16. WIRE-UP */
function mount(canvasEl, opts){
  try{
    if(!canvasEl||!canvasEl.getContext) return NOOP;
    teardown();
    opts=opts||{};

    cv=canvasEl;
    onState=typeof opts.onState==="function"?opts.onState:null;
    frozen=!!opts.reduced;
    hourOverride=(opts.hourOverride==null)?null
                :clamp(parseInt(opts.hourOverride,10)||0,0,23);

    lastStateJSON="";
    tick=0; breath=0; acc=0; last=0; visible=true;
    turnTimer=100;

    resize();
    retint();
    update();
    draw(true);
    publish();

    if(!frozen){
      if(window.ResizeObserver){
        ro=new ResizeObserver(function(){
          clearTimeout(rzTimer);
          rzTimer=setTimeout(function(){
            try{ resize(); draw(true); }catch(e){}
          },150);
        });
        ro.observe(cv);
      }
      onVis=function(){ last=0; };
      document.addEventListener("visibilitychange",onVis);
      if(window.IntersectionObserver){
        io=new IntersectionObserver(function(es){
          visible=es[0].isIntersecting; last=0;
        },{threshold:0});
        io.observe(cv);
      }
      phaseTimer=setInterval(function(){
        try{ retint(); publish(); }catch(e){}
      },60000);
      start();
    }

    return {
      setHour:function(h){
        hourOverride=(h==null)?null:clamp(parseInt(h,10)||0,0,23);
        try{ retint(); draw(true); publish(); }catch(e){}
      },
      jumpTo:function(){},
      roll:function(){
        try{
          if(frozen){
            DICE.forEach(function(d){ d.face=1+Math.floor(Math.random()*d.s); });
            draw(true); settleReport();
          } else rollDice();
        }catch(e){}
      },
      pause:stop,
      resume:function(){ last=0; start(); },
      destroy:teardown
    };

  }catch(err){
    if(canvasEl&&canvasEl.classList) canvasEl.classList.add("scene-failed");
    if(window.console&&console.warn) console.warn("IsaiTable disabled:",err);
    return NOOP;
  }
}

window.IsaiTable={ mount:mount };

})();
