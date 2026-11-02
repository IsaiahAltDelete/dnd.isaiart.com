// A brief illustrated chapter break for a real journey, with no fake progress.
import { UI } from '../ui/kit.js';
import { makeCanvas, resOf } from '../ui/ornament.js';

// Only the current card is retained; all artwork and wording are static for
// one journey. Preserve the fine UI resolution while fading a single image.
let card = null;

const LINES = {
  'stonehill-inn': 'Firelight, pipe smoke, and news from the Triboar Trail.',
  'barthens-provisions': 'Lamp oil and coiled rope beneath the timber beams.',
  'lionshield-coster': 'Steel rings softly behind the blue lion shield.',
  'shrine-of-luck': 'A silver coin turns in the candlelight of Tymora.',
  phandalin: 'Lanterns gather beneath the Sword Mountains.',
  thundertree: 'Ash in the streets. Green wings above the ruined tower.',
  waterdeep: 'The City of Splendors opens its gates.',
  neverwinter: 'Smoke rises from the hearths of the Jewel of the North.',
};

export function journeyInfo(from, destination, state) {
  const d = destination || {};
  const type = /cave|dungeon|crypt|mine|lair/.test(d.kind || d.biome || '') ? 'depths' : d.kind === 'ruins' ? 'wild' : d.indoor ? 'interior' : /city|town/.test(d.kind || d.biome || '') ? 'town' : 'wild';
  return { from: from?.name || 'The road', to: d.name || String(d.id || 'The road').replaceAll('-', ' '),
    type, timber:/inn|provisions|tavern|coster|farm/.test(d.id||''), line: LINES[d.id] || (type === 'interior' ? 'Beyond the threshold, the road falls quiet.' : type === 'depths' ? 'Footsteps echo where the daylight cannot follow.' : type === 'town' ? 'Rooflines rise ahead. The road becomes a street.' : 'The road unwinds beneath an open sky.'),
    day: state?.day || 1, time: state?.time || 0 };
}

export function drawJourney(ctx, info, progress) {
  const res = resOf(ctx);
  if (!card || card.info !== info || card.res !== res || card.theme !== UI.theme) {
    const canvas = makeCanvas(400 * res, 240 * res), c = canvas.getContext('2d');
    c.scale(res, res);
    paintJourney(c, info);
    card = { info, res, theme: UI.theme, canvas };
  }
  const fade = Math.min(1, progress / 0.16, (1 - progress) / 0.2);
  ctx.save(); ctx.globalAlpha = Math.max(0, fade);
  ctx.drawImage(card.canvas, 0, 0, 400, 240);
  ctx.restore();
}

function paintJourney(ctx, info) {
  ctx.save();
  ctx.fillStyle = '#171c22'; ctx.fillRect(0, 0, 400, 240);
  UI.panel(ctx, 14, 13, 372, 214, { style: 'dark', shadow: 0.5 });
  // Copperplate skyline, inset into the folio, with stable engraved texture.
  ctx.fillStyle = '#242d35'; ctx.fillRect(24, 31, 352, 96);
  const night=info.time < 360 || info.time >= 1140;
  ctx.fillStyle = '#9c8d6d';
  if(night)for (const [x,y] of [[46,44],[87,62],[132,42],[246,48],[298,38],[354,60]]) ctx.fillRect(x,y,0.5,0.5);
  const ink = '#52606a', edge = '#a99a76';
  ctx.fillStyle = '#c9b783'; ctx.beginPath();ctx.arc(326,52,9,0,Math.PI*2);ctx.fill();
  if(night){ctx.fillStyle = '#242d35';ctx.beginPath();ctx.arc(330,49,8,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#46525a';ctx.lineWidth=0.5;
  for(const [x,y,w]of [[54,53,46],[238,62,58],[278,42,27]]){
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.moveTo(x+9,y-2);ctx.lineTo(x+w-6,y-2);ctx.stroke();
  }
  const hill = (points, c) => {
    ctx.save();ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();ctx.clip();
    const minX=Math.floor(Math.min(...points.map(p=>p[0]))),maxX=Math.max(...points.map(p=>p[0]));
    const minY=Math.floor(Math.min(...points.map(p=>p[1]))),maxY=Math.max(...points.map(p=>p[1]));
    // Broken ink strokes follow the slope; warm flecks lift the lit planes.
    for(let yy=minY;yy<maxY && c!=='#111c24' && c!=='#252f34';yy+=2)for(let xx=minX;xx<maxX;xx+=4){
      const n=((xx*73856093)^(yy*19349663))>>>0;
      ctx.fillStyle=n%4===0?'rgba(212,196,153,.16)':'rgba(9,19,24,.22)';
      ctx.fillRect(xx+(yy%3),yy,1+n%3,1);
    }
    ctx.restore();
  };
  hill([[24,113],[39,101],[47,100],[65,76],[78,84],[84,83],[92,93],[121,70],[130,71],[149,53],[160,61],[169,63],[193,100],[211,88],[227,87],[240,71],[257,82],[283,103],[301,97],[307,91],[333,81],[346,85],[376,106],[376,127],[24,127]],'#36434b');
  hill([[149,53],[160,61],[169,63],[193,100],[177,90],[162,78]],'#29373f');
  hill([[240,71],[257,82],[283,103],[252,95]],'#29373f');
  if(info.type==='interior') {
    ctx.fillStyle=info.timber?'#776b53':ink;ctx.fillRect(142,57,116,70);
    ctx.fillStyle='#777766';ctx.fillRect(233,36,10,24);ctx.fillStyle='#3b4549';ctx.fillRect(231,34,14,3);
    hill([[132,60],[200,32],[268,60]],edge);
    ctx.strokeStyle='#6f674e';ctx.lineWidth=0.5;
    for(let yy=40;yy<60;yy+=3){const half=(yy-32)*68/28;ctx.beginPath();ctx.moveTo(200-half+3,yy);ctx.lineTo(200+half-3,yy);ctx.stroke();}
    ctx.strokeStyle='#35424a';
    ctx.save();ctx.beginPath();ctx.rect(142,60,116,67);ctx.clip();
    if(info.timber){
      ctx.strokeStyle='#534c3e';for(let yy=66;yy<127;yy+=3){ctx.beginPath();ctx.moveTo(142,yy);ctx.lineTo(258,yy);ctx.stroke();}
      ctx.fillStyle='#353b37';for(const xx of [142,171,226,255])ctx.fillRect(xx,62,3,65);
      ctx.fillRect(142,99,116,3);ctx.fillRect(142,63,116,3);
      ctx.lineWidth=2;ctx.strokeStyle='#353b37';for(const xx of [145,229]){ctx.beginPath();ctx.moveTo(xx,119);ctx.lineTo(xx+24,103);ctx.stroke();}
    }else for(let yy=64;yy<127;yy+=7)for(let xx=144+(yy%2)*7;xx<256;xx+=14){ctx.strokeRect(xx,yy,13,6);}
    ctx.fillStyle='rgba(15,24,30,.24)';ctx.fillRect(142,60,116,5);ctx.fillRect(246,65,12,62);ctx.restore();
    ctx.fillStyle='#242d35';ctx.fillRect(180,79,40,48);
    ctx.beginPath();ctx.arc(200,79,20,Math.PI,0);ctx.fill();
    ctx.fillStyle='#8d6b46';ctx.fillRect(183,81,34,46);
    ctx.fillStyle='#644e39';for(let xx=187;xx<217;xx+=6)ctx.fillRect(xx,81,1,46);
    ctx.fillStyle='#383d3d';ctx.fillRect(183,90,34,2);ctx.fillRect(183,117,34,2);
    ctx.fillStyle=edge;for(let xx=186;xx<216;xx+=9){ctx.fillRect(xx,90,1,1);ctx.fillRect(xx,117,1,1);}
    ctx.fillStyle='#dbc07b';ctx.fillRect(203,99,2,2);
    for(const x of [155,235]) {ctx.fillStyle='#242d35';ctx.fillRect(x-2,80,12,17);ctx.fillStyle=edge;ctx.fillRect(x,82,8,13);ctx.fillStyle='#e7bd69';ctx.fillRect(x+2,85,4,7);ctx.fillStyle='#6f6246';ctx.fillRect(x+4,82,1,13);ctx.fillRect(x,88,8,1);}
    if(info.timber){ctx.fillStyle='#242d35';ctx.fillRect(128,66,16,2);ctx.fillRect(130,68,1,7);ctx.fillStyle=edge;ctx.fillRect(124,74,14,15);ctx.fillStyle='#3c494c';ctx.fillRect(126,76,10,11);ctx.fillStyle='#ccb87c';ctx.fillRect(129,78,4,6);ctx.fillRect(133,80,2,3);}
    ctx.fillStyle='#2b373f';ctx.fillRect(143,121,35,6);ctx.fillRect(221,121,37,6);
    ctx.fillStyle='#7b8175';for(let xx=177;xx<224;xx+=3)ctx.fillRect(xx,125,2,2);
  } else if(info.type==='depths') {
    hill([[99,127],[111,91],[123,85],[123,62],[146,60],[162,44],[182,49],[202,54],[226,44],[238,45],[259,68],[284,78],[290,108],[304,127]],ink);
    // Sunward slabs, a darker right buttress and the ledge over the mouth.
    hill([[111,91],[123,62],[146,60],[162,44],[174,54],[151,76],[145,110],[128,127],[99,127]],'#778079');
    hill([[226,44],[238,45],[259,68],[284,78],[290,108],[304,127],[265,127],[251,94],[249,67]],'#35424a');
    hill([[162,44],[182,49],[202,54],[226,44],[249,67],[230,79],[203,67],[177,68],[151,76]],'#8b8b77');
    // The portal recedes through a thick broken lip, then a second shadowed
    // arch. A narrowing floor path makes the dark read as distance.
    hill([[139,127],[149,94],[168,72],[190,65],[213,70],[239,90],[258,127]],'#252f34');
    hill([[154,127],[166,94],[182,82],[203,78],[222,91],[239,127]],'#111c24');
    hill([[169,127],[187,100],[204,95],[216,127]],'#2d3739');
    hill([[186,127],[198,104],[203,103],[207,127]],'#48504a');
    hill([[150,76],[177,68],[190,65],[179,78],[171,79],[166,94],[159,86],[149,101],[139,127],[132,127],[144,89]],'#657268');
    hill([[203,67],[230,79],[239,90],[258,127],[246,127],[232,99],[224,97],[217,83],[209,82]],'#4b5756');
    // Fractured foreground blocks overlap the entrance, grounding its scale.
    hill([[110,112],[128,104],[143,112],[148,127],[104,127]],'#4c5959');
    hill([[110,112],[128,104],[143,112],[127,118]],'#96917a');
    hill([[258,114],[274,103],[288,114],[294,127],[251,127]],'#303e45');
    hill([[258,114],[274,103],[288,114],[269,118]],'#68736b');
    ctx.fillStyle='#bc9e67';ctx.fillRect(156,100,2,19);
    ctx.fillStyle='#9d623a';ctx.fillRect(153,94,8,7);ctx.fillStyle='#dd9b50';ctx.fillRect(154,92,5,8);ctx.fillStyle='#f1d38b';ctx.fillRect(155,94,2,5);
  } else if(info.type==='town') {
    // The civic spire rises behind a broad guildhall, an overhanging house,
    // and a fortified gate. Their different masses tell a city silhouette.
    ctx.fillStyle='#46555d';ctx.fillRect(153,60,23,67);
    hill([[147,61],[164,32],[182,61]],'#a3936e');
    hill([[164,32],[182,61],[164,61]],'#716c58');
    ctx.fillStyle='#738078';ctx.fillRect(151,71,27,4);ctx.fillRect(151,91,27,3);
    ctx.fillStyle='#202e37';ctx.fillRect(161,64,6,12);ctx.fillRect(162,97,5,12);
    ctx.fillStyle='#b8a878';ctx.fillRect(163,66,2,7);
    // Low, wide guildhall with a side plane and two dormers.
    ctx.fillStyle='#687168';ctx.fillRect(64,94,73,33);ctx.fillStyle='#39474d';ctx.fillRect(137,94,15,33);
    hill([[56,95],[75,72],[135,72],[152,95]],'#9a8b68');
    hill([[135,72],[152,95],[137,95]],'#5e655a');
    for(const xx of [81,112]){ctx.fillStyle='#48555b';ctx.fillRect(xx,83,9,10);hill([[xx-2,83],[xx+4,76],[xx+11,83]],'#c0ac79');ctx.fillStyle='#d5b674';ctx.fillRect(xx+3,85,3,5);}
    ctx.fillStyle='#26373f';for(const xx of [73,94,115])ctx.fillRect(xx,103,8,16);
    ctx.fillStyle='#b4a57d';for(const xx of [75,96,117])ctx.fillRect(xx,106,3,7);
    // Jettied merchant house: steep asymmetric roof, side wall, timber braces.
    ctx.fillStyle='#424f53';ctx.fillRect(186,86,48,41);ctx.fillStyle='#7a7964';ctx.fillRect(182,79,42,27);
    hill([[175,80],[195,52],[229,77],[237,86],[224,81]],'#7d846f');
    hill([[195,52],[229,77],[237,86],[212,75]],'#4b5a58');
    ctx.fillStyle='#2a3a40';ctx.fillRect(183,102,41,3);ctx.fillRect(202,80,3,24);ctx.fillRect(184,79,2,26);ctx.fillRect(221,79,2,26);
    ctx.fillStyle='#c8b27c';ctx.fillRect(190,86,5,9);ctx.fillRect(211,86,5,9);
    ctx.fillStyle='#27353d';ctx.fillRect(201,112,9,15);
    ctx.fillStyle='#a2997d';ctx.fillRect(214,55,5,17);ctx.fillStyle='#3b484d';ctx.fillRect(213,54,7,2);
    // Gatehouse with two unequal square towers and crenellated battlements.
    ctx.fillStyle='#58666a';ctx.fillRect(246,94,69,33);ctx.fillRect(242,80,19,47);ctx.fillRect(301,85,19,42);
    ctx.fillStyle='#35464e';ctx.fillRect(256,80,5,47);ctx.fillRect(315,85,5,42);
    ctx.fillStyle='#879084';for(const [xx,yy,ww]of [[240,78,23],[299,83,23],[263,93,36]])for(let q=0;q<ww;q+=7)ctx.fillRect(xx+q,yy-4,4,6);
    ctx.fillStyle='#1c2a34';ctx.fillRect(274,110,14,17);ctx.beginPath();ctx.arc(281,110,7,Math.PI,0);ctx.fill();
    ctx.fillStyle='#d5b674';ctx.fillRect(249,92,3,8);ctx.fillRect(308,96,3,8);
  } else {
    for(const [x,h] of [[54,42],[84,30],[287,49],[318,35],[350,43]]) {
      const top=126-h;
      ctx.fillStyle='#827658';ctx.fillRect(x-1,top+12,3,h-10);
      hill([[x,top],[x-8,top+14],[x-4,top+13],[x-12,top+26],[x-7,top+25],[x-17,123],[x+17,123],[x+7,top+25],[x+12,top+26],[x+4,top+13],[x+8,top+14]],'#53655c');
      hill([[x,top+2],[x+8,top+14],[x+4,top+13],[x+12,top+26],[x+7,top+25],[x+17,123],[x+3,121]],'#2e4243');
    }
    hill([[154,127],[188,111],[198,96],[203,96],[195,113],[180,127]],'#817d65');
    hill([[174,127],[195,113],[203,96],[205,97],[199,115],[190,127]],'#b1a27b');
  }
  // Fine copperplate hatch along the foreground and a worn double rule.
  ctx.strokeStyle='#a99a76';ctx.lineWidth=0.5;
  for(let x=27;x<374;x+=5){ctx.beginPath();ctx.moveTo(x,123);ctx.lineTo(x+2,120);ctx.stroke();}
  ctx.strokeRect(24.5,31.5,351,95);
  UI.divider(ctx, 36, 137, 328);
  UI.text(ctx,200,143,'JOURNEY', {size:'xs',color:'#a99a76',align:'center'});
  UI.text(ctx,200,157,info.to,{size:'title',color:'#e6cf96',align:'center',maxWidth:330});
  UI.text(ctx,200,181,info.line,{size:'fine',color:'#c6bfac',align:'center',maxWidth:330});
  UI.text(ctx,200,208,`From ${info.from}  /  Day ${info.day}`,{size:'xs',color:'#8e958e',align:'center',maxWidth:330});
  ctx.restore();
}
