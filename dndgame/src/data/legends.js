// Optional encounters in this campaign, not claims about a canonical itinerary.
// Established identities are grounded in the sources in docs/overhaul/legends.md.
const cameo = (id, name, o) => ({
  id, name, role:'flavor', tag:'legend', species:'human', colorway:null,
  dir:'down', wander:0, shop:null, quests:[], faction:null, schedule:null,
  greeting:null, solid:true, hidden:false, requires:null, removedBy:null,
  noCombat:true, voice:'plain', dialogue:id, ...o,
});

export const LEGEND_CAST = [
  cameo('drizzt-dourden', "Drizzt Do'Urden", {
    title:'Ranger of the North', species:'elf', sprite:'npc-drizzt', voice:'quiet',
    map:'neverwinter-wood', x:33, y:40, dir:'left',
    desc:'A white-haired drow kneels over a broken pack strap. Two curved scabbards rest within reach; he has kept the trail clear while he works.',
    greeting:'One moment. This buckle has survived three winters and chosen today to develop principles.',
  }),
  cameo('elminster', 'Elminster Aumar', {
    title:'The Sage of Shadowdale', sprite:'npc-elminster', voice:'dry',
    map:'candlekeep-approach', x:28, y:22, dir:'left',
    desc:'The old mage has a battered hat, a white beard and a parcel of corrected pages. Today even he has business at the library gate.',
    greeting:'Mind the parcel, there. The corrections weigh more than the book.',
  }),
  cameo('alustriel-silverhand', 'Alustriel Silverhand', {
    title:'The Shining Lady', sprite:'npc-alustriel', voice:'warm',
    map:'waterdeep', x:24, y:17, dir:'down',
    desc:'Silver hair falls over a travel cloak. Alustriel has paused at the Yawning Portal between meetings, sorting letters beside a cooling cup.',
    greeting:'Would you hold this corner? The letter is determined to return to Silverymoon without a courier.',
  }),
];

const leave = {text:'Safe travels.',cancel:true};
const node = (speaker,text,more={}) => ({speaker,text,...more});
export const LEGEND_DIALOGUE = {
  'drizzt-dourden': {start:'start',nodes:{
    start:node("Drizzt Do'Urden", "The drow draws a fresh strap through a battered buckle. White hair slips over one shoulder; he tucks it back with the patience of someone who has done this twice already.\n\nOne moment. A merchant's pack gave out by the bridge. The merchant blamed the road. The road has declined to comment.", {do:{flag:'met:drizzt'},goto:'hub'}),
    hub:node("Drizzt Do'Urden", 'He tests the knot, then leaves room for you beside the trail.', {choices:[
      {text:'Drizzt? The stories never mention repairs.',goto:'stories'},
      {text:'What brings you through this wood?',goto:'road'},
      {text:'Do you travel alone?',goto:'companions'},
      {text:'Any advice for the road ahead?',goto:'advice'},leave,
    ]}),
    stories:node("Drizzt Do'Urden", "They seldom mention wet socks, either. I have spent rather more of my life dealing with those than with dragons.\n\nHe gives the strap a final pull.\n\nA story can make one choice sound inevitable. It rarely was. Judge the person in front of you by what they choose to do.", {goto:'hub'}),
    road:node("Drizzt Do'Urden", "Following the northern trail until this borrowed pack is back with its owner. Then onward. I have friends waiting, and a talent for finding reasons to arrive late.\n\nHe glances toward the bridge.\n\nThe planks are sound. Keep to the crossing; the banks are softer than they look.", {goto:'hub'}),
    companions:node("Drizzt Do'Urden", "Not in the way the ballads suggest. Bruenor would object to being reduced to a supporting verse. Catti-brie would improve the verse, then tell the singer what they had left out.\n\nHis thumb rests briefly against a small onyx figurine.\n\nAnd Guenhwyvar is a companion, not a pet. If you meet her, allow her to decide whether you are interesting.", {goto:'hub'}),
    advice:node("Drizzt Do'Urden", "Notice who is tired before they have to ask you to stop. Listen when a companion sees something you do not. And mend the strap before it breaks.\n\nHe holds up the pack.\n\nThat last wisdom is very recent.", {goto:'hub'}),
  }},
  elminster:{start:'start',nodes:{
    start:node('Elminster Aumar', "An old man smooths a parcel of densely corrected pages against his knee. His pointed hat has weathered better journeys than this morning's breeze.\n\nMind the parcel, there. I've spent an hour finding an error in a book that cites me as its authority. Apparently I was very confident.", {do:{flag:'met:elminster'},goto:'hub'}),
    hub:node('Elminster Aumar', 'He pins the loose page beneath his cup and regards you over his beard.', {choices:[
      {text:'Are you really Elminster?',goto:'name'},
      {text:'Even you wait outside Candlekeep?',goto:'library'},
      {text:'What should a new spellcaster learn?',goto:'magic'},
      {text:'Will you solve our troubles for us?',goto:'troubles'},leave,
    ]}),
    name:node('Elminster Aumar', "Aye. Though if the bill concerns a broken window, describe the hat before making accusations. There are a great many hats.\n\nHe taps the parcel.\n\nShadowdale is home. This is an errand. Being old and well known has not, regrettably, abolished errands.", {goto:'hub'}),
    library:node('Elminster Aumar', "A library that makes exceptions for every wizard who considers himself exceptional would soon be a smoking hole with an excellent guest list.\n\nI'm waiting for a particular reader, not trying to get around the gatekeeper. If you've business within, ask the Avowed about their entry terms. My hat is not a letter of introduction.", {goto:'hub'}),
    magic:node('Elminster Aumar', "What the spell does. What it costs. Who is standing behind the thing you intend to hit. Most spectacular mistakes neglect one of those.\n\nHe turns a heavily amended page.\n\nTry different workings. Read the particulars. A familiar cantrip and a well-chosen spell both have their uses. Ye needn't become a smaller copy of another wizard.", {goto:'hub'}),
    troubles:node('Elminster Aumar', "Tell me what you've already tried before asking me to invent a more elaborate mistake.\n\nHe listens without touching the parcel for a while.\n\nStart with the people living beside the trouble. They know what changed, and someone usually remembers when. If I learn anything useful here, I shall do my part. Yours needn't wait for mine.", {goto:'hub'}),
  }},
  'alustriel-silverhand':{start:'start',nodes:{
    start:node('Alustriel Silverhand', "The silver-haired woman weighs down a curling letter with her cup. A second sheet escapes; she catches it before it reaches the floor.\n\nThank you for stopping there. You have intercepted the entire northern correspondence. Please, there is room beside the table.", {do:{flag:'met:alustriel'},goto:'hub'}),
    hub:node('Alustriel Silverhand', 'Alustriel sorts the letters into two piles, then moves one back with a small sigh.', {choices:[
      {text:'What brings you to Waterdeep?',goto:'visit'},
      {text:'I have heard stories of Silverymoon.',goto:'city'},
      {text:'Is diplomacy always this much paper?',goto:'letters'},
      {text:'What can ordinary travelers do to help?',goto:'help'},leave,
    ]}),
    visit:node('Alustriel Silverhand', "A visit to my sister Laeral, and a discussion about keeping travelers supplied on the northern roads. Several discussions, now. One has acquired a subcommittee.\n\nShe takes a sip of cold tea and politely refrains from blaming it.\n\nI came here between meetings to hear what the people using those roads have to say.", {goto:'hub'}),
    city:node('Alustriel Silverhand', "Silverymoon taught me how many different people can make a home together, if they are given the chance. I spent many years helping to protect it. I am no longer its ruler.\n\nThe songs remember towers and magic. I remember arguments over bridges, musicians practicing through open windows, and neighbors who brought food when someone was ill. Those things deserved protecting too.", {goto:'hub'}),
    letters:node('Alustriel Silverhand', "No. Sometimes it is chairs. Someone must decide how many, who sits nearest the fire, and whether the person who insists they need no chair will complain when none appears.\n\nHer smile is brief and thoroughly practiced.\n\nLaeral and I agree on rather more than our clerks suspect. We occasionally let the clerks discover this after they have found a compromise.", {goto:'hub'}),
    help:node('Alustriel Silverhand', "Bring accurate news. Share a warning before you sell it. If a caravan has lost a wheel, an hour of your time may matter more than a heroic speech.\n\nShe leaves the letters aside.\n\nAnd tell us when our plans are making life harder. Good intentions are not much comfort to the person waiting in the rain.", {goto:'hub'}),
  }},
};
