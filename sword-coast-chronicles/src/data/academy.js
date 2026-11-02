// Original Blackstaff Academy work, lessons and one-time rewards.
const step=(target,text,map='blackstaff-tower')=>({kind:'flag',target,count:1,text,map,optional:false});
export const ACADEMY_QUESTS=[
 {id:'academy-practicum',title:'Measure Twice, Cast Once',giver:'blackstaff-practitioner',turnIn:'blackstaff-practitioner',type:'training',minLevel:1,map:'blackstaff-tower',desc:'Darvin lends a harmless focus for two projection exercises. Ask Tessele about concentration, then report to Darvin. All classes may participate; no spell slots are spent.',steps:[step('academy:precision','Pass Darvin’s single-target exercise.'),step('academy:area','Pass Darvin’s area-placement exercise.'),step('academy:focus','Work through concentration with Tessele.')],rewards:{xp:120,gold:25,items:[{id:'scroll-magic-missile',qty:1}],rep:[]},repeatable:false,generated:false,next:null,faction:null},
 {id:'academy-wards',title:'The Ward Round',giver:'vajra-safahr',turnIn:'vajra-safahr',type:'investigate',minLevel:1,map:'blackstaff-tower',desc:'Check the west delivery anchor and east gate anchor in Blackstaff Court. Compare both readings with Tessele, then report to Vajra. The anchor crystals stand beside the delivery cart and east bench.',steps:[step('academy:west','Clear the west delivery anchor, beside the courtyard cart.','blackstaff-court'),step('academy:east','Reseat the east gate anchor, beside the courtyard bench.','blackstaff-court'),step('academy:readings','Compare both readings with Tessele in the reading room.')],rewards:{xp:150,gold:40,items:[{id:'potion-healing',qty:1}],rep:[]},repeatable:false,generated:false,next:null,faction:null},
];
const bye={text:'Leave it for now.',cancel:true};
export const ACADEMY_DIALOGUE={
 'academy-west-anchor':{start:'start',nodes:{
  start:{speaker:'Delivery Anchor',text:'A blue crystal hums beside the delivery cart, above a carefully chalked tracing. Its maintenance label names this the west delivery anchor.',choices:[{text:'Inspect the crossed lines.',if:{quest:'academy-wards',notFlag:'academy:west'},goto:'inspect'},{text:'Check the repaired anchor.',if:{flag:'academy:west'},goto:'done'},bye]},
  inspect:{speaker:'Delivery Anchor',text:'A loose copper packing clip chatters across two chalk lines. The chalk ring is intact underneath the clip. A label reads: "Keep metal clear of the tracing." There is no break to redraw.',choices:[{text:'Lift the loose clip away from the chalk.',goto:'fixed'},{text:'Feed more power into the crystal.',goto:'wrong'},bye]},
  wrong:{speaker:'Delivery Anchor',text:'The clip rattles harder. More power will not remove the thing bridging the lines. You stop before disturbing the ward.',goto:'inspect'},
  fixed:{speaker:'Delivery Anchor',text:'You lift away the packing clip. The crystal settles into one steady note. You record: west anchor, conductive debris removed. Tessele can compare it with the east reading.',do:{flag:'academy:west'},goto:'done'},
  done:{speaker:'Delivery Anchor',text:'The tracing is clear. The crystal holds a steady note; the discarded clip sits safely beside the cart.',choices:[bye]},
 }},
 'academy-east-anchor':{start:'start',nodes:{
  start:{speaker:'Gate Anchor',text:'A blue crystal sits in a marked socket beside the east bench. Its maintenance label names this the east gate anchor.',choices:[{text:'Inspect the uneven socket.',if:{quest:'academy-wards',notFlag:'academy:east'},goto:'inspect'},{text:'Check the repaired anchor.',if:{flag:'academy:east'},goto:'done'},bye]},
  inspect:{speaker:'Gate Anchor',text:'The light hesitates. Rainwater under one edge makes the crystal rock. A maintenance mark shows where it should sit. Its lines are sound; the loose seating is interrupting the rhythm.',choices:[{text:'Dry the socket and reseat the crystal.',goto:'fixed'},{text:'Scratch another rune over the old one.',goto:'wrong'},bye]},
  wrong:{speaker:'Gate Anchor',text:'You compare the maintenance mark first. Adding a rune would change a working pattern without fixing its loose fitting. Better to correct the seating.',goto:'inspect'},
  fixed:{speaker:'Gate Anchor',text:'With the socket dry and the crystal seated against its mark, the light steadies. You record: east anchor, loose fitting corrected. Bring both readings to Tessele.',do:{flag:'academy:east'},goto:'done'},
  done:{speaker:'Gate Anchor',text:'The crystal sits firmly in its socket. Its pulses keep an even rhythm.',choices:[bye]},
 }},
};

export function addAcademyDialogue(trees){
 const v=trees['vajra-safahr'].nodes,d=trees['blackstaff-practitioner'].nodes,t=trees['blackstaff-reader'].nodes;
 v.hub.choices.unshift(
  {text:'Is there academy work we could help with?',if:{questNot:'academy-wards'},goto:'wardOffer'},
  {text:'About the ward round...',if:{quest:'academy-wards'},goto:'wardStatus'},
  {text:'How are the repaired wards holding?',if:{questDone:'academy-wards'},goto:'wardAfter'});
 v.wardOffer={speaker:'Vajra Safahr',text:'Two courtyard anchors need attention: the west crystal by the delivery cart and the east crystal beside the bench. Inspect before changing anything. Bring both readings to Tessele, then return to me.\n\nForty gold, a healing potion, and credit for the work. This calls for care, not a particular school of magic.',choices:[{text:'We will take the ward round.',do:{quest:'academy-wards',academySync:true},goto:'wardStatus'},{text:'Not just now.',goto:'hub'}]};
 v.wardStatus={speaker:'Vajra Safahr',text:'West anchor by the courtyard cart; east anchor beside the bench. Tessele compares the readings in the academy’s reading room. Come back when all three parts are done.',choices:[{text:'Both anchors are steady; Tessele checked them.',if:{flag:['academy:west','academy:east','academy:readings']},do:{complete:'academy-wards'},goto:'wardPaid'},{text:'We will finish the round.',cancel:true}]};
 v.wardPaid={speaker:'Vajra Safahr',text:'Vajra checks Tessele’s figures, then crosses two entries off her slate.\n\nGood. A careful repair, a useful record, and no new hole in the courtyard. Here is your pay. The next person on rounds will know what changed.',goto:'hub'};
 v.wardAfter={speaker:'Vajra Safahr',text:'Steady. Tessele has put your notes in the maintenance book. Darvin suggested a celebratory demonstration; I suggested lunch. For once, we reached agreement immediately.',goto:'hub'};
 d.start.choices.unshift(
  {text:'Join the supervised practicum.',if:{questNot:'academy-practicum'},goto:'lessonOffer'},
  {text:'Practice with the borrowed focus.',if:{any:[{quest:'academy-practicum'},{questDone:'academy-practicum'}]},do:{academy:'practice'}},
  {text:'Report on the practicum.',if:{quest:'academy-practicum'},goto:'lessonStatus'});
 d.lessonOffer={speaker:'Darvin',text:'Two exercises: place a single projection, then cover both dummies with a burst while keeping the blue observer clear. Tessele handles the concentration discussion.\n\nThe focus is loaned and harmless. Any class can use it here; it spends no slots and teaches no spell automatically. Finish all three parts for twenty-five gold and a Magic Missile scroll. Ordinary scroll rules still apply.',choices:[{text:'Enroll and begin practice.',do:{quest:'academy-practicum',academy:'practice'}},{text:'Maybe later.',goto:'start'}]};
 d.lessonStatus={speaker:'Darvin',text:'You need the single-target exercise, the area exercise, and Tessele’s concentration discussion. Your journal keeps the checklist. Practice again whenever you like.',choices:[{text:'All three parts are complete.',if:{flag:['academy:precision','academy:area','academy:focus']},do:{complete:'academy-practicum'},goto:'lessonPaid'},{text:'Back to practice.',do:{academy:'practice'}},{text:'I will speak to Tessele.',cancel:true}]};
 d.lessonPaid={speaker:'Darvin',text:'Darvin signs the record with a flourish, notices the ink on his cuff, and quietly turns that wrist away.\n\nPassed. The scroll and pay are yours. Repeating the exercises is free; repeating the payment would require a different budget.',goto:'start'};
 t.start.choices.unshift(
  {text:'Work through concentration with me.',goto:'focus'},
  {text:'Compare the courtyard ward readings.',if:{quest:'academy-wards',flag:['academy:west','academy:east'],notFlag:'academy:readings'},goto:'readings'},
  {text:'Remind me where the courtyard anchors are.',if:{quest:'academy-wards'},goto:'anchorDirections'});
 t.focus={speaker:'Tessele',text:'Suppose you are concentrating on one spell. You decide to cast a second spell that also requires concentration. What happens to the first?\n\nShe places two books on the desk. I can stack these. That is not evidence that I can stack concentration.',choices:[{text:'The second replaces the first.',goto:'focusPassed'},{text:'Both stay active if I have enough slots.',goto:'focusRetry'},{text:'Let me come back to this.',cancel:true}]};
 t.focusRetry={speaker:'Tessele',text:'Slots pay for a spell; they do not buy a second concentration. Starting another concentration spell ends the earlier one. Taking damage can also force a check to keep concentration.\n\nTry the example again. The books are being unhelpfully smug.',goto:'focus'};
 t.focusPassed={speaker:'Tessele',text:'Exactly. Choose which effect matters now. Other spells can often be cast while you maintain it, provided they do not require concentration themselves. Read the particulars.\n\nShe marks the discussion complete. Darvin can sign off your practicum once both projection exercises are done.',do:{flag:'academy:focus'},goto:'start'};
 t.readings={speaker:'Tessele',text:'West: a packing clip across an intact tracing. East: an uneven socket. Different causes, both fixed without rewriting the wards.\n\nShe copies your readings into the maintenance book. Take this record to Vajra. Next time I am labeling the packing crate "not a component."',do:{flag:'academy:readings'},goto:'start'};
 t.anchorDirections={speaker:'Tessele',text:'Leave through the southern threshold. The west anchor is the blue crystal beside the delivery cart; the east anchor stands beside the bench toward the street back to Trades Ward. Inspect each before changing anything, then bring both readings here.',goto:'start'};
}

