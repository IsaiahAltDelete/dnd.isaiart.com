// Original everyday scenes. Ambient goods and mishaps never affect party resources.
const activity=(title,props,sprites,names,task,lines,from=360,to=1260)=>({title,props,sprites,names,task,line:lines[0],call:lines[0],from,to,voices:lines});
export const PLACE_ACTIVITIES={
 arcane:activity('Paired spell practice',[],['hooded','acolyte'],['Ilyra, apprentice','Fen, apprentice'],'shaping a harmless light',[
  '[Holds two fingers very still.] Yesterday it was a sphere. Today it has ambitions. Darvin says the important part is keeping it inside the circle.',
  'Aye, I am the observer today. We take turns. Last time my eyebrows observed rather too closely. These are harmless practice lights; the embarrassment is quite real.']),
 study:activity('Reading partners',['TABLE'],['scribe','acolyte'],['Neris, apprentice','Oren, apprentice'],'comparing annotated primers',[
  '[Turns a book sideways.] Oren put his correction in my margin. I corrected his correction. We need a wider book.',
  'I know where the missing library key is. Inside the locked library. [Waits.] Yes, we have reached that part of the discussion already. Tessele has the spare.']),
 kettle:activity('Enchantment chores',['TABLE'],['acolyte','hooded'],['Mira, apprentice','Joss, apprentice'],'settling a singing kettle',[
  '[Lifts the lid a fraction.] It was meant to whistle when the water boiled. It now insists on a second verse. Nobody has the heart to tell it.',
  'Softly, Mira. It copies the last sound it hears. [Lowers his voice.] I sneezed into it yesterday. Tea was difficult.']),
 wards:activity('Courtyard ward practice',[],['hooded','scribe'],['Sella, ward student','Tam, ward student'],'testing a contained ward light',[
  'Two gentle taps, then wait for the light. Vajra wants the timings written down. Apparently "eventually" is not a unit.',
  '[Shields a notebook from the weather.] I write, she tests, then we swap. The book has passed every test by remaining a book.']),
 weigh:activity('Weights and measures',['TABLE','SACK'],['merchant','goodwife','porter'],['Dessa, pulse seller','Maud, regular customer','Tovin, delivery hand'],'balancing a measure of beans',[
  '[Levels the measure.] Same scoop, same weights, every morning. Maud checks anyway. Her father checked my father. It is practically a family visit.',
  'Aye, she weighs fair. I ask her to show me because it annoys her. [Smiles.] She saves the good lentils because it annoys me to admit it.',
  'Aseir has the travelling goods at his stall. Mine is the sack that keeps shedding beans. I am beginning to recognise them individually.']),
 textiles:activity('Cloth and mending',['TABLE','SHELF_GOODS'],['villager-f','noble','labourer'],['Letha, cloth seller','Ivon, tailor','Bess, seamstress'],'unrolling dyed cloth',[
  '[Unrolls a blue length.] He orders sober grey every week. Every week he picks up the blue first. I have stopped putting the grey on top.',
  'The client said distinguished. [Holds cloth against a sleeve.] Blue can be distinguished. My wife says grey makes me look apologetic.',
  'Two hems before lunch. Then my own coat, if nobody notices me doing it. The Wide is very good at noticing.']),
 auction:activity('Household auction',['TABLE','CRATE'],['merchant','villager-m','goodwife'],'Perrin, auctioneer|Dell, bidder|Noma, bidder'.split('|'),'selling a household tea service',[
  '[Raises a little brass bell.] This lot is already in bidding. A tea service, three sound cups, one very optimistic saucer. Aseir handles ordinary shopping on the west side of the market.',
  'I only wanted the jug. Noma wants the cups. We agreed to stop bidding against each other. Then he rang the bell and we forgot.',
  '[Counts on her fingers.] Cups for my daughters. The jug can go to Dell. The saucer can go into a very dark cupboard.']),
};
export const PLACE_PARTICIPANTS=Object.fromEntries(Object.entries(PLACE_ACTIVITIES).map(([k,v])=>[k,v.names.slice(1).map((n,i)=>[v.title.toLowerCase(),v.voices[i+1]])]));
export const PLACE_EXCHANGES={
 arcane:{duration:5,lines:[['Keep it round, Ilyra.','It WAS round.','Your light has ears.'],['Small and steady this time.','There. One quiet light.','Keep that one for the exam.']]},
 study:{item:'paper',lines:[['Your margin ate my footnote.','Your footnote ate my lunch.','We need a second book.'],['Which page are we on?','This is page forty-two.','Other way up. There we are.']]},
 kettle:{duration:5,lines:[['Just a whistle this time.','Do not encourage it.','It knows the chorus now.'],['Will the lid stay on this time?','Tell the lid, not me.','Tea first. Theory later.']]},
 wards:{duration:4,lines:[['Two taps, then count.','One... two... oh.','Write down the oh.'],['Try a smaller light.','Small enough?','The notebook approves.']]},
 weigh:{item:'parcel',lines:[['Let me see the balance.','Level. As it was yesterday.','Good. See you tomorrow.'],['That scoop looks hopeful.','Watch the brass weights.','Fair enough. Two measures.']]},
 textiles:{item:'cloth',lines:[['May I see the blue again?','Just to compare the grey?','...I will take the blue.'],['Will that dye run?','Only if you chase it.','Letha. A serious answer.']]},
 auction:{duration:4,lines:[['I bid for the jug!','Three cups come with it.','Noma, we need a plan.'],['That is my final bid.','Sold! Mind the saucer.','Noma, you carry that bit.']]},
};




