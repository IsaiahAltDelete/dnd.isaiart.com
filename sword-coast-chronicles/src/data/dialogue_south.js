// data/dialogue_south.js — every conversation on the road south and inside the
// three cities that share the name Baldur's Gate.
//
// PURE DATA. Nothing is imported; nothing here mutates. `dialogue.js` spreads
// SOUTH_DIALOGUE into the exported DIALOGUE catalogue and deep freezes the lot.
//
// Contract is dialogue.js's, unchanged:
//   SOUTH_DIALOGUE[id] = { start:'nodeId', nodes:{ nodeId: Node } }
//   Node   = { text, speaker, goto?, do?, once?, rumor?, cancelable?, choices? }
//   Choice = { text, goto, success?, failure?, if?, do?, once?, cancel? }
//
// THE ONE STRUCTURAL RULE, and it is the rule that broke forty-four trees the
// last time it was ignored: EVERY node either carries authored `choices` or
// carries a `goto`. A node with neither ends the conversation, which is correct
// only for a deliberate farewell node — every `bye`/`out` node below is one, and
// nothing else in this file is. Never lean on the engine-appended "Draw your
// weapon." option to keep a node alive: `_advancePage` counts authored choices
// only, so an engine-added line cannot stop a node falling through.
//
// `if:` gates: flag notFlag quest questDone questNot gold level item faction
// repMin ability classId species, plus not/all/any.
// `do:` actions: shop quest complete flag clearFlag give take gold recruit heal
// rest teach battle warp rep xp close say goto.
//
// House style: "\\p" for a beat, a blank line for a page break, stage directions
// in the third person inside the same text block, three to five choices at a
// hub, one `cancel: true` exit.
//
// SETTING: 1496 DR, four years after the Absolute. Every name is published
// Forgotten Realms canon or built from the ethnic tables in docs/SETTING.md §5.
// The bitmap font carries no accented glyphs, so display text is unaccented.

export const SOUTH_DIALOGUE = {

  // =========================================================================
  // 1. THE TRADE WAY — the road out of Waterdeep
  // =========================================================================

  'bor-nemetsk': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Serjeant Bor Nemetsk',
        text: "Halt where you are and let me see hands. \\p Good. Alliance patrol, Trade Way, eleven miles of it, and every one of them mine.\n\nHe is Damaran, forty-odd, and has the particular stillness of a man who has stood in one place for a very long time on purpose.\n\nNemetsk. State your road, keep to it, and we shall get on.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Serjeant Bor Nemetsk',
        text: "Well? The road is not going anywhere and neither, apparently, are you.",
        choices: [
          { text: 'What is the road like south of here?', goto: 'road' },
          { text: 'That toll house behind you is empty.', goto: 'tollhouse' },
          { text: 'Any word from Waterdeep?', goto: 'news' },
          { text: 'How far to Daggerford?', goto: 'daggerford' },
          { text: 'We will keep moving.', cancel: true, goto: 'bye' },
        ],
      },
      road: {
        speaker: 'Serjeant Bor Nemetsk',
        text: "South of my stretch it thins. Two more milestones and you are past the last Alliance post until the Way Inn, and the Way Inn is not an Alliance post, it is a man with a wall.\n\nHighwaymen work the ford crossings because that is where a wagon has to slow. Not brave men. Patient ones. They will let four of you pass and take the fifth.",
        goto: 'hub',
      },
      tollhouse: {
        speaker: 'Serjeant Bor Nemetsk',
        text: "It is.\n\nA pause of exactly the length required to be an answer.\n\nIt was not empty in the autumn. There were three men in it and a clerk and a dog, and in the spring there was a door standing open and a ledger with the last four pages torn out of it.\\p I reported it. Waterdeep acknowledged the report. That is the whole of the story I am permitted to tell you and I have told it as loudly as I am able.",
        do: { flag: 'trade-way-tollhouse-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Serjeant Bor Nemetsk',
        rumor: true,
        text: "Waterdeep sends despatches. The despatches say the road is secure. I am standing on the road.",
        goto: 'hub',
      },
      daggerford: {
        speaker: 'Serjeant Bor Nemetsk',
        text: "Two days walking, one if you are rude to your feet. You will see the castle before you see the town; it sits up on the mound and the town sat down around it afterwards like a dog at a fire.\n\nDuchess Morwen holds it. Soldier before she was a duchess. If you want the road south of the Delimbiyr you will want her bridge, and if you want her bridge you will want her.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Serjeant Bor Nemetsk',
        text: "Keep to the metalled part. The verge is soft and the verge is where they wait.",
      },
    },
  },

  'mara-lackman': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Mara Lackman',
        text: "Do not say it. \\p Do not say the word axle.\n\nShe is sitting on a crate at the roadside with a wheel leaning against her knee and the expression of a woman two days into composing a speech.\n\nMara Lackman, pedlar, of the Fields Reach, currently of this crate.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Mara Lackman',
        text: "Well. You are the fourth party to walk past and the first to stop, so you may as well be useful or entertaining.",
        choices: [
          { text: 'What happened?', goto: 'axle' },
          { text: 'What are you carrying?', goto: 'cargo' },
          { text: 'Anything moving on this road we should know about?', goto: 'road' },
          { text: 'We can carry word to the Way Inn.', do: { flag: 'mara-word-carried' }, goto: 'word' },
          { text: 'Good luck with the crate.', cancel: true, goto: 'bye' },
        ],
      },
      axle: {
        speaker: 'Mara Lackman',
        text: "A rut. One rut, in the whole of the Trade Way, in the exact place I was looking at a bird.\n\nShe holds up two fingers a hand's width apart.\n\nThat is how much of the axle was left. Two days I have been sitting here rehearsing what I shall say to the wheelwright at the Way Inn, and it has become very good, and I am now slightly worried he will not deserve it.",
        goto: 'hub',
      },
      cargo: {
        speaker: 'Mara Lackman',
        text: "Sembian needles, four gross. Ribbon. Thread in nine colours, of which two sell. A box of tin whistles which I bought drunk and have carried sober for a year.\n\nShe pats the crate.\n\nNothing anybody would rob me for, which is the only reason I have slept.",
        goto: 'hub',
      },
      road: {
        speaker: 'Mara Lackman',
        rumor: true,
        text: "Sitting still for two days you learn the traffic. Northbound is thin and southbound is thick, and everything southbound is carrying more than it should be and going faster than it needs to.",
        goto: 'hub',
      },
      word: {
        speaker: 'Mara Lackman',
        text: "Would you. \\p Would you really.\n\nShe stops rehearsing.\n\nGorstag Amblecrown, at the Way Inn. Tell him Mara Lackman is on the Fields Reach with a broken stub axle and a cart she will not leave. He will send the boy with the spare — he keeps three, he thinks nobody knows.\n\nAnd tell him I have had two days to think about what I owe him for it, which is nothing, because of Uthgardt Winter, and he will know exactly what that means and go slightly grey.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Mara Lackman',
        text: "Mind the rut. It is about forty paces on and it has my name on it now.",
      },
    },
  },

  'pieron-agosto': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Pieron Agosto',
        text: "Ah — road company! Good. Walk a little, we can talk while the miles go.\n\nHe is Turami, sun-dark, walking with a staff and a rolled blanket and the settled cheer of a man who has been on foot for eleven tendays.\n\nPieron Agosto. Walking to Twin Songs, where all the gods live on one street and none of them fight, which I am told is a lie and I intend to see for myself.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Pieron Agosto',
        text: "So. What shall it be — the road, the gods, or my views on ferrymen?",
        choices: [
          { text: 'The road, then.', goto: 'road' },
          { text: 'Why Twin Songs?', goto: 'gods' },
          { text: 'Your views on ferrymen. Go on.', goto: 'ferry' },
          { text: 'What have you heard walking?', goto: 'news' },
          { text: 'Walk safe, pilgrim.', cancel: true, goto: 'bye' },
        ],
      },
      road: {
        speaker: 'Pieron Agosto',
        text: "The Coast Way is good ground and bad company. From here the city's smoke is on the horizon by the third morning — you smell it before you see it, and what you smell is Gray Harbour, and it is not a smell anybody warns you about.\n\nSleep off the road. Not far off. Far enough that a torch does not find you and near enough that a scream does.",
        goto: 'hub',
      },
      gods: {
        speaker: 'Pieron Agosto',
        text: "Because in Baldur's Gate they let every god have a door.\n\nHe says this with genuine wonder.\n\nWhere I was born there were two temples and one of them was illegal. In Twin Songs there is a shrine to the Lord of Bones with a rope across it and a priest inside who is watched by four people at once — and the shrine is legal. Legal! They watch him and they do not close him.\\p I want to stand on that street. I want to see a city that can hold that and not tear.",
        goto: 'hub',
      },
      ferry: {
        speaker: 'Pieron Agosto',
        text: "You did ask.\n\nThe staff comes up and points, generally, at the whole of the Chionthar.\n\nA copper to cross at the halfling's boat below the bridge, two coppers on the bridge itself, and four if the Fist has decided the bridge is busy. Four! For the same water!\\p And the halfling is a better sailor. I have said this to the toll clerk and he wrote nothing down, which he does not do, which is how I know he heard me.",
        goto: 'hub',
      },
      news: {
        speaker: 'Pieron Agosto',
        rumor: true,
        text: "Eleven tendays of walking is a great deal of other people's talk. Most of it is the same three stories with the names moved.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Pieron Agosto',
        text: "Go with the morning at your back. That is not a blessing from anyone in particular. It is simply better walking.",
      },
    },
  },

  'selise-falone': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Selise Falone',
        text: "Is this still the Coast Way? \\p They keep saying it forks and it has not forked.\n\nShe has a handcart, two children asleep on the load, and the particular exhaustion that comes from being responsible for other people's sleep.\n\nSelise Falone. Out of Beregost. Going to the city because everybody said to go to the city.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Selise Falone',
        text: "You have come down it. So you know it. Tell me something true.",
        choices: [
          { text: 'You will need a writ to get inside the walls.', do: { flag: 'south-writ-rumoured' }, goto: 'writ' },
          { text: 'Why did you leave Beregost?', goto: 'beregost' },
          { text: 'Rivington will take you in. Ask for Kanithar Ulmokina.', goto: 'rivington' },
          { text: 'Here. Take this. [gold]20 gp[/]', if: { gold: 20 }, do: [{ gold: -20 }, { flag: 'selise-helped' }, { rep: { id: 'harpers', amount: 1 } }], goto: 'coin' },
          { text: 'Keep going. It is not far.', cancel: true, goto: 'bye' },
        ],
      },
      writ: {
        speaker: 'Selise Falone',
        text: "A writ.\n\nShe says the word the way you would say a stone in your shoe.\n\nNobody said a writ. Six people said go to the city and not one of them said there was a piece of paper on the far side of the walk.\\p Well. There will be a way. There is always a way, it simply costs more than the honest one and I have not got the honest one either.",
        goto: 'hub',
      },
      beregost: {
        speaker: 'Selise Falone',
        text: "Because the man who held our field died and his brother did not want tenants, and because there is no work in Beregost that is not the temple's work and the temple's work is full.\n\nShe glances at the cart, checks the children are still asleep, and lowers her voice without needing to.\n\nAnd because something has been taking people off the Nashkel road and I would rather be poor in a city than brave on a road.",
        goto: 'hub',
      },
      rivington: {
        speaker: 'Selise Falone',
        text: "Rivington. South bank, before the bridge.\n\nShe repeats the name twice under her breath, fixing it.\n\nKanithar Ulmokina. Thank you. That is the first thing anyone has told me that was a name and not a direction.",
        do: { flag: 'selise-directed' },
        goto: 'hub',
      },
      coin: {
        speaker: 'Selise Falone',
        text: "She looks at the coin in her hand for slightly too long.\n\nI am not going to say the thing people say. You have heard it and it is cheap and you did not do this to hear it.\n\nShe puts it away, deep, in two places.\n\nBut if you are ever on this road going the other way and you are the one sitting down — I will be somewhere in that city, and I will be findable.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Selise Falone',
        text: "Not far. Everybody says not far. \\p One of you will be right eventually.",
      },
    },
  },

  hulmarra: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Hulmarra Stayanoga',
        text: "Do not step on the low ground.\n\nShe does not look up from the tally-stick. She is Rashemi, grey-robed, standing in a field that goes to the horizon in every direction and is not a field.\n\nThe low ground is somebody. All of this is somebody. Four armies came apart here across three centuries and nobody ever tidied, and Kelemvor sent me to count what is left.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Hulmarra Stayanoga',
        text: "You are on the Fields of the Dead. Ask, or walk on. Both are respectable.",
        choices: [
          { text: 'What are you counting?', goto: 'count' },
          { text: 'The barrows are open.', goto: 'barrows' },
          { text: 'We will close them.', if: { questNot: 'the-fields-remember' }, do: { quest: 'the-fields-remember' }, goto: 'take' },
          { text: 'It is done. The barrows are shut.', if: { quest: 'the-fields-remember' }, do: [{ complete: 'the-fields-remember' }, { flag: ['fields-barrows-closed', 'fields-barrows-sealed'] }, { rep: { id: 'gauntlet', amount: 3 } }], goto: 'done' },
          { text: 'What is safe to walk on?', goto: 'walking' },
          { text: 'We will leave you to it.', cancel: true, goto: 'bye' },
        ],
      },
      count: {
        speaker: 'Hulmarra Stayanoga',
        text: "Cairns. Barrows. The long low ridges that are not ridges.\n\nShe turns the stick over. There are a great many notches on it and they are not fresh.\n\nIn 1489 I counted four thousand and six. This spring I counted four thousand and thirty-one.\\p Nobody has been buried here in ninety years. The number is going up because things are being put back.",
        do: { flag: 'fields-count-known' },
        goto: 'hub',
      },
      barrows: {
        speaker: 'Hulmarra Stayanoga',
        text: "Nine of them, that I have found. Opened from beneath, which is a sentence I dislike saying.\n\nShe finally looks at you, and her face is entirely calm, which is worse than if it were not.\n\nThe Fields do not haunt. That is the thing outsiders never understand — this ground has been quiet for three hundred years because the dead here were soldiers and soldiers know how to stop. Something is teaching them to start.",
        goto: 'hub',
      },
      take: {
        speaker: 'Hulmarra Stayanoga',
        text: "Then take the nine in order, north to south, and shut each behind you before you open the next.\n\nShe hands you the tally-stick without ceremony, which from a Kelemvorite is a considerable ceremony.\n\nBrightwood in Twin Songs keeps the pilgrim ledger and has been counting the same thing from the other end — heads out, heads back. When you have shut them, tell him the number. He will need it more than I shall.",
        goto: 'hub',
      },
      done: {
        speaker: 'Hulmarra Stayanoga',
        text: "Nine.\n\nShe takes the stick back, looks at it, and — very deliberately — snaps it.\n\nThat is the count closed. The Fields are quiet again and will stay quiet for a while, and nobody will ever know it, and that is the correct amount of thanks for this work.\\p Kelemvor keeps the ledger, traveller. You are in it now, on the right page.",
        goto: 'hub',
      },
      walking: {
        speaker: 'Hulmarra Stayanoga',
        text: "The high ground and the cart track. Anything flat and green and inviting is a filled ditch, and a filled ditch is where they put the ones there was no time for.\n\nAnd after dark, nothing. Not because of what walks — because you cannot see the low ground after dark, and a boot in the wrong place here is a discourtesy that gets answered.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Hulmarra Stayanoga',
        text: "High ground. Cart track. And when you pass a cairn, say nothing at all — they have had three hundred years of people saying things.",
      },
    },
  },

  lureene: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Lureene Dundragon',
        text: "Softly. \\p Softly — they hear high voices before low ones, it is the one useful thing I have learned in two years.\n\nShe is in a cellar under a monastery, with a lamp, in a Lathanderite's rose and gold gone entirely grey with dust.\n\nDawnbringer Lureene Dundragon. Of Rosymorn. Which is to say, of this cellar.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Lureene Dundragon',
        text: "You are the first voices up here in two years that were not speaking Gith. Ask quickly.",
        choices: [
          { text: 'What happened to the monastery?', goto: 'fall' },
          { text: 'Githyanki. How many?', goto: 'gith' },
          { text: 'Kelddath Ormlyr sent us for a relic.', if: { quest: 'song-of-the-morning-relic' }, goto: 'relic' },
          { text: 'We have the relic. It goes back to Beregost.', if: { all: [{ quest: 'song-of-the-morning-relic' }, { item: 'reliquary' }] }, do: [{ flag: 'rosymorn-relic-carried' }, { rep: { id: 'gauntlet', amount: 2 } }], goto: 'carried' },
          { text: 'Come down the mountain with us.', goto: 'stay' },
          { text: 'We will go quietly.', cancel: true, goto: 'bye' },
        ],
      },
      fall: {
        speaker: 'Lureene Dundragon',
        text: "Nothing happened to it. That is the part nobody believes.\n\nShe sets the lamp down so her hands are free to be still.\n\nThe order left. Not driven — called, to Amn, to a new house with better roads and a patron. Twenty-two of us walked down that path in good order in 1487 and the doors were shut behind us and the mountain was left to the weather.\\p The githyanki came into an empty building. They did not take Rosymorn. They found it.",
        do: { flag: 'rosymorn-history-known' },
        goto: 'hub',
      },
      gith: {
        speaker: 'Lureene Dundragon',
        text: "Between nine and fourteen. It changes and I have never seen them arrive or leave, which means there is a way in that is not the path.\n\nThey keep to the cloister and the tower. They do not come down here — not out of mercy. There is nothing down here they want.\\p They are looking for something. They have been looking for two years and they are still looking, and whatever it is, they have not found it, and I find that very slightly encouraging.",
        goto: 'hub',
      },
      relic: {
        speaker: 'Lureene Dundragon',
        text: "The Dawnmaster's censer. Of course. Kelddath would want that back and Kelddath would send strangers rather than come himself, and I am not going to say a word against him for it — he is eighty and the path is the path.\n\nIt is in the cloister, on the altar, where it has been since 1487, because the gith walk past it eleven times a day and do not see it. It is brass. They are looking for something older than brass.\\p Take the west range. The floor there is stone all the way and the boards in the east range are a bell.",
        do: { flag: 'rosymorn-relic-located' },
        goto: 'hub',
      },
      carried: {
        speaker: 'Lureene Dundragon',
        text: "She looks at it in your hands for a long moment and does not touch it.\n\nGood. Take it down. Put it on Lathander's table at the Song of the Morning where a hundred people will see it every dawn.\n\nThat is what it is for. It was never for a mountain with nobody on it.\\p Tell Kelddath the lamp is still lit up here. He will ask. Tell him it is still lit and that I am not coming down until it is not.",
        goto: 'hub',
      },
      stay: {
        speaker: 'Lureene Dundragon',
        text: "No.\n\nIt is entirely without drama, which makes it worse.\n\nSomebody keeps the dawn office at Rosymorn. That has been true every morning for four hundred years, including every morning since my order walked away, and it will go on being true, and the person of whom it is true is me.\\p If that is stubbornness rather than faith, well. From the inside they are indistinguishable, and I have had two years to look.",
        do: { flag: 'lureene-refused' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Lureene Dundragon',
        text: "West range. Stone floor. And do not run on the stair — running is the only sound up here that carries.",
      },
    },
  },

  // =========================================================================
  // 2. DAGGERFORD
  // =========================================================================

  morwen: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Morwen Daggerford',
        text: "You are on my bridge and in my ledger. Both are checked.\n\nShe was a soldier for twenty years before she was a duchess for eleven, and she has never once managed to stand like the second thing.\n\nMorwen Daggerford. Two thousand souls, one wall, and a road between Waterdeep and Baldur's Gate that both of them think belongs to them. Say your business.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Morwen Daggerford',
        text: "Well?",
        choices: [
          { text: 'Mirt of Waterdeep sent us south.', if: { quest: 'the-long-road-south' }, do: [{ complete: 'the-long-road-south' }, { flag: ['daggerford-reached', 'trade-way-walked'] }, { rep: { id: 'harpers', amount: 3 } }], goto: 'mirt' },
          { text: 'Your bridge tolls are being skimmed.', if: { questNot: 'the-duchess-toll' }, do: { quest: 'the-duchess-toll' }, goto: 'toll' },
          { text: 'We found your skimmer.', if: { quest: 'the-duchess-toll' }, do: [{ complete: 'the-duchess-toll' }, { flag: ['daggerford-road-open', 'daggerford-favour'] }, { rep: { id: 'lords-alliance', amount: 3 } }], goto: 'toll-done' },
          { text: 'Tell us about Daggerford.', goto: 'town' },
          { text: 'What is south of here?', goto: 'south' },
          { text: 'Your wizard came back younger.', goto: 'delfen' },
          { text: 'Duchess.', cancel: true, goto: 'bye' },
        ],
      },
      mirt: {
        speaker: 'Morwen Daggerford',
        text: "Mirt. \\p The fat one with the chair and the view of the door.\n\nSomething that is very nearly a smile happens and is put away again.\n\nHe has money in Baldur's Gate and no legs to fetch it with, so he buys legs. That is not an insult; it is how he has run the North for forty years and it works.\n\nYou have reached Daggerford. Tell him so, and tell him the toll receipts he will ask about are short, and that I know they are short, and that I am dealing with it. \\p Which brings me neatly to you.",
        do: { flag: 'mirt-south-errand' },
        goto: 'hub',
      },
      toll: {
        speaker: 'Morwen Daggerford',
        text: "Eleven silver a day. That is the gap between what my bridge takes and what my treasury receives, and it has been eleven silver a day since Marpenoth, which is the part that offends me.\n\nShe taps the table once.\n\nA thief who takes more when the traffic is heavy is a thief. A thief who takes exactly eleven silver a day whatever crosses is a clerk. I want the clerk.\\p Do not arrest anyone. Bring me the name and the method, and I will decide what Daggerford does about it, because Daggerford is small and everybody here is somebody's cousin.",
        goto: 'hub',
      },
      'toll-done': {
        speaker: 'Morwen Daggerford',
        text: "The name.\n\nShe reads it, sets it down, and is silent for the length of two breaths.\n\nRight. He will be moved to the granary count where the numbers are checked twice, his mother will never be told, and the eleven silver will come back at a silver a tenday for two years, which he will hate more than a rope.\n\nThat is what a small town's justice looks like from the inside and I will not be apologised to for it.\\p Now. The road south. My bridge is open to you, the Way Inn will hear from me before you get there, and if anyone between here and the Chionthar asks who vouches, you say Daggerford does.",
        goto: 'hub',
      },
      town: {
        speaker: 'Morwen Daggerford',
        text: "Walled, ditched, two thousand people and a garrison of sixty, forty of whom are farmers with a rota.\n\nWe survive by being uninteresting to Waterdeep and unprofitable to Baldur's Gate, and I have made a career out of both. Every year a factor comes up from the Gate to explain that we would be happier under a Baldurian charter, and every year he is fed extremely well and sent home.",
        goto: 'hub',
      },
      south: {
        speaker: 'Morwen Daggerford',
        text: "The Way Inn, at the Dusk Road crossing — Amblecrown's place, walled yard, gate shut at dusk and he means it. Then the Fields of the Dead, which is exactly what it sounds like and worse this year.\n\nThen the Chionthar and the city.\\p Understand what you are walking into. Baldur's Gate is three cities in a coat. The Upper City has the law, the Lower City has the money, and the Outer City has everybody, and the gate between the first two is shut to you until somebody in a red tabard decides otherwise.",
        do: { flag: 'south-road-briefed' },
        goto: 'hub',
      },
      delfen: {
        speaker: 'Morwen Daggerford',
        text: "He did.\n\nA very long pause, in which she declines to be drawn and you can watch her decline it.\n\nDelfen Ondabarl served my father and served me, went away for a year on business he did not describe, and came back with the face he had at thirty. I asked him once, directly, in this room. He said he would tell me when he understood it himself.\\p I believed him. I still believe him. I have also quietly stopped putting him in rooms with Waterdhavian ambassadors.",
        do: { flag: 'delfen-noticed' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Morwen Daggerford',
        text: "Use the bridge, pay the toll, and do not make me famous.",
      },
    },
  },

  sherlen: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sherlen Spearslayer',
        text: "Sixty guards. Forty of them are farmers on a rota. \\p That is the answer, and you were going to ask.\n\nShe is broad, scarred across one forearm, and clearly has this conversation twice a tenday.\n\nCaptain Sherlen. Yes, Spearslayer. Yes, there was a lizardfolk. No, I will not tell it standing up.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Sherlen Spearslayer',
        text: "Go on, then. Everyone gets three.",
        choices: [
          { text: 'Tell it sitting down, then.', goto: 'name' },
          { text: 'What is the garrison actually worried about?', goto: 'worry' },
          { text: 'Anything on the road we should know?', goto: 'road' },
          { text: 'Who watches the bridge tolls?', goto: 'tolls' },
          { text: 'Captain.', cancel: true, goto: 'bye' },
        ],
      },
      name: {
        speaker: 'Sherlen Spearslayer',
        text: "There is no chair and you are not getting the good version.\n\nShe holds up the scarred forearm.\n\nLizardfolk champion, in the marsh, in the rain, with a spear each. He got this. I got the spear. \\p Twenty years of being asked, and the true story is four seconds long and mostly mud, and every year somebody in the Happy Cow adds a crocodile to it.",
        goto: 'hub',
      },
      worry: {
        speaker: 'Sherlen Spearslayer',
        text: "Not the walls. The walls are fine and nobody has come at them since the orcs.\n\nThe road. Half my rota are farmers, and farmers stop being farmers when the road stops paying — and the road has been paying less every season since the Gate started taxing northbound freight at the Basilisk Gate.\\p My garrison is a wheat price. Nobody in Waterdeep has ever understood that sentence.",
        goto: 'hub',
      },
      road: {
        speaker: 'Sherlen Spearslayer',
        rumor: true,
        text: "The stretch south of the ford. Three wagons short-loaded in a tenday and every driver told the same story with the same words in it, which is how you know none of them was there.",
        goto: 'hub',
      },
      tolls: {
        speaker: 'Sherlen Spearslayer',
        text: "The bridge sergeant counts, the clerk records, the treasury receives.\n\nShe says the three of them in a line and then, deliberately, again.\n\nCounts. Records. Receives. Three men and two handovers, and the Duchess has asked me twice which handover I would put money on, and both times I have said I am a soldier and not a clerk, and both times she has looked at me as though that were an answer she was writing down.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Sherlen Spearslayer',
        text: "Gate shuts an hour after dark. It opens for the Duchess and for a birth. Not for you.",
      },
    },
  },

  delfen: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Delfen Ondabarl',
        text: "Yellowknife. It is a knife and it is yellow. \\p There, that is the joke done, we need never do it again.\n\nHe looks thirty-five and every person in this town remembers him at fifty-five, and he is entirely comfortable with the arithmetic in your face.\n\nDelfen Ondabarl. Wizard, of Daggerford, evocation, and rather good.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Delfen Ondabarl',
        text: "Ask. Everyone asks. It is only ever the one question and I have twelve answers for it.",
        choices: [
          { text: 'What happened to you?', goto: 'younger' },
          { text: 'The Duchess will not discuss it either.', goto: 'morwen' },
          { text: 'Something in your tower wants answering.', if: { questNot: 'yellowknifes-tower' }, do: { quest: 'yellowknifes-tower' }, goto: 'tower' },
          { text: 'Your tower is answered.', if: { quest: 'yellowknifes-tower' }, do: [{ complete: 'yellowknifes-tower' }, { flag: 'delfen-open' }], goto: 'tower-done' },
          { text: 'Walk south with us.', if: { flag: 'delfen-open' }, goto: 'join' },
          { text: 'What is the road south like for a wizard?', goto: 'road' },
          { text: 'Another time.', cancel: true, goto: 'bye' },
        ],
      },
      younger: {
        speaker: 'Delfen Ondabarl',
        text: "Answer four, which is the true one, and you may have it because you asked plainly.\n\nI do not know.\n\nHe lets that sit.\n\nI went away in the Year of the Nether Mountain Scrolls on business I still consider mine. I was away eleven tendays by my count and fifty-one by everybody else's. And I came back with this face and no memory of losing the other one, and every test I know says I am exactly as old as I was and my body has simply declined to agree.\\p I am a wizard, and the thing I most want in the world is a citation, and there is not one.",
        do: { flag: 'delfen-truth-known' },
        goto: 'hub',
      },
      morwen: {
        speaker: 'Delfen Ondabarl',
        text: "No, she will not, and I am fonder of her for it than I have ever managed to say.\n\nShe asked me once. In the council room, on her feet, in front of nobody. I said I would tell her when I understood it, and she said good, and we went on to the grain returns.\\p Eleven years. Not one hint, not one dropped remark, not one carefully placed sage from Waterdeep. She simply stopped putting me in the room with the ambassadors, which was correct, and which she thinks I did not notice.",
        goto: 'hub',
      },
      tower: {
        speaker: 'Delfen Ondabarl',
        text: "Ah. \\p You have been up the lane and heard it.\n\nThe cheer goes out of him entirely, which is startling.\n\nThere is a room on the third floor. It is my study, it has been my study for forty years, and since I came back there has been a sound in it at the hour I left and the hour I returned. Not every day. Eleven days in a tenday-and-a-half, which is not a pattern, which is the part I mind.\n\nI cannot go in and hear it. It stops when I am in the room. It has never once stopped for anybody else.\\p So: go and listen. Write down what you hear, in the words you hear it, and do not interpret. I shall do the interpreting and I shall probably be wrong.",
        goto: 'hub',
      },
      'tower-done': {
        speaker: 'Delfen Ondabarl',
        text: "He reads it. He reads it again. He puts it face down on the table and puts a book on it, which is not a thing a man does to a piece of paper he is unafraid of.\n\nThat is my voice.\n\nHe says it very evenly.\n\nThat is my voice, saying a thing I have not said yet, in a room I was not in, at an hour I was not there. And it is the first hard fact I have had in two years and I would like to thank you and I find I cannot quite manage it.\\p So instead: I am coming with you. The answer is south, it has been south since the day I came back, and I have been sitting in a walled town waiting for somebody to walk past who was going that way.",
        goto: 'hub',
      },
      join: {
        speaker: 'Delfen Ondabarl',
        text: "Four hundred gold. \\p Yes, I know. I am a wizard of the twelfth degree with an unexplained face and I am worth every coin, and the money is not for me, it is for the town — Morwen will need a hire while I am gone and the good ones cost.\n\nHe is already reaching for a travelling case that has plainly been packed for some time.\n\nSay the word and I shall bore you to death about the Delimbiyr for two hundred miles.",
        choices: [
          { text: 'Come with us. [gold]400 gp[/]', if: { gold: 400 }, do: [{ recruit: 'delfen-ondabarl' }, { flag: 'delfen-joined' }], goto: 'joined' },
          { text: 'Not yet. Keep the case packed.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Delfen Ondabarl',
        text: "Right. \\p Right.\n\nHe looks up at the tower once, briefly, and does not look up at it again.\n\nSouth, then. And when we find whatever is at the end of this, I should like to be the one who writes it down. That is my whole fee and it is non-negotiable.",
        goto: 'hub',
      },
      road: {
        speaker: 'Delfen Ondabarl',
        text: "Thalantyr at High Hedge past Beregost — conjurer, difficult, entirely honest, and the only man south of Waterdeep who will sell you a component without asking what for.\n\nAnd Sorcerous Sundries in the Gate itself. Rolan keeps it now. He is young and he is prickly and he is genuinely gifted, and if you patronise him he will sell you the shelf you deserve rather than the shelf you asked for.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Delfen Ondabarl',
        text: "Go on. And if you hear anything at the hour of dusk that sounds like me, write it down.",
      },
    },
  },

  'daggerford-hound': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bramble',
        text: "The dog is lying across the bridge road. A grain wagon comes up, slows, and goes round him through the mud. The carter does not even look annoyed. This has clearly been settled for years.\n\nBramble opens one eye, establishes that you are neither food nor the Duchess, and closes it.",
        choices: [
          { text: 'Scratch his ear.', goto: 'ear' },
          { text: 'Try to move him.', goto: 'move' },
          { text: 'Go round, like everybody else.', cancel: true, goto: 'bye' },
        ],
      },
      ear: {
        speaker: 'Bramble',
        text: "One back leg begins to move on its own, entirely without his consent. He looks faintly betrayed by it.\n\nHe rolls a quarter turn, which in the language of this bridge is an enormous concession, and goes back to sleep occupying slightly more road than before.",
        do: { flag: 'bramble-friend' },
        goto: 'start',
      },
      move: {
        speaker: 'Bramble',
        text: "He becomes, instantly, twice as heavy as a dog that size can possibly be. It is not aggression. It is physics, deployed with intent.\n\nA passing farmwife says, without stopping: \"That's Bramble, that is. You'll not shift him. Duchess couldn't shift him.\"",
        goto: 'start',
      },
      bye: {
        speaker: 'Bramble',
        text: "You go round. Everyone goes round.",
      },
    },
  },

  filarion: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Filarion Filvendorson',
        text: "The River Shining. Bed, board, and a very long memory.\n\nHe is a moon elf of no obvious age behind a bar of extremely well-kept oak, and he says the line the way a man says a line he has said for a hundred and forty years and still rather likes.\n\nFilarion Filvendorson. I have kept this house through four Dukes of Daggerford and I remember all of them as though it were last tenday, which for me is a technical statement and not a boast.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Filarion Filvendorson',
        text: "So. The house is yours. What of it do you want?",
        choices: [
          { text: 'Show us the house.', do: { shop: 'river-shining-tavern' }, goto: 'hub' },
          { text: 'A room for the night. [gold]12 gp[/]', if: { gold: 12 }, do: { heal: { cost: 12, hours: 8 } }, goto: 'rested' },
          { text: 'Four Dukes. Tell us about one.', goto: 'dukes' },
          { text: 'What is the news on the road?', goto: 'news' },
          { text: 'Who is hiring in Daggerford?', goto: 'hiring' },
          { text: 'Later.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Filarion Filvendorson',
        text: "Upstairs, river side. The Delimbiyr talks all night and after two nights you cannot sleep without it.\n\nYou sleep well. In the morning there is bread, river trout, and an elf downstairs who has evidently been awake the whole time and considers that unremarkable.",
        goto: 'hub',
      },
      dukes: {
        speaker: 'Filarion Filvendorson',
        text: "Pryden. \\p Pryden Daggerford, who held it when I opened these doors.\n\nHe polishes something that does not need it.\n\nHe came in here the night before the orc year and drank one cup of small beer and paid for it and went away, and eleven days later he was dead on the north wall. I have had a hundred and forty years to think about that cup of small beer.\n\nThat is what a long life is, if anyone ever tells you they want one. It is not the great days. It is a great many small beers, and remembering every single one.",
        do: { flag: 'filarion-pryden' },
        goto: 'hub',
      },
      news: {
        speaker: 'Filarion Filvendorson',
        rumor: true,
        text: "News in a river town comes upstream and downstream and disagrees with itself in the middle. I serve both and let the drinkers sort it.",
        goto: 'hub',
      },
      hiring: {
        speaker: 'Filarion Filvendorson',
        text: "The Duchess, if you can get in front of her, and you can, because she sees everyone — it is her one extravagance.\n\nDawnmaster Dlusker at Morninglow, who has a trouble he is being careful about.\n\nAnd Yellowknife, who has not asked anybody for anything in two years and has a tower he will not go up.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Filarion Filvendorson',
        text: "Come back in forty years. I shall be here and I shall remember what you drank.",
      },
    },
  },

  shandri: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Shandri Tallstag',
        text: "Eleven tables, one me, and himself by the fire remembering the Year of the Bloody Tusk.\n\nShe passes with four cups in one hand and does not slow down for the conversation.\n\nShandri. If you want food, the answer is yes; if you want it soon, the answer is also yes but louder.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Shandri Tallstag',
        text: "Go on. I can carry and listen.",
        choices: [
          { text: 'What would you change about this place?', goto: 'change' },
          { text: 'Is he always like that?', goto: 'filarion' },
          { text: 'Heard anything worth hearing?', goto: 'news' },
          { text: 'We will let you work.', cancel: true, goto: 'bye' },
        ],
      },
      change: {
        speaker: 'Shandri Tallstag',
        text: "The list is eleven items long and I have never been asked for it.\n\nShe sets the cups down, which is the first time she has stopped.\n\nTwo fires, not one. A serving hatch. Stop buying the Waterdhavian wine nobody drinks. Put the hiring board where people go in and not where people go out.\\p And write the prices up. He knows every price for a hundred and forty years and he has never once written one down, and every carter who comes through here thinks he is being cheated and he is not, he is being remembered.",
        do: { flag: 'shandri-list' },
        goto: 'hub',
      },
      filarion: {
        speaker: 'Shandri Tallstag',
        text: "Always. And here is the thing I will not say to his face: he is very good at it.\n\nA man came in last winter who had not been in for thirty years, and Filarion looked up and said his father's name and what his father drank. \\p The man sat down and cried into it. And I got no help with the tables that night and I would not have had it otherwise.",
        goto: 'hub',
      },
      news: {
        speaker: 'Shandri Tallstag',
        rumor: true,
        text: "Everything comes past this bar and about a third of it is worth turning round for.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Shandri Tallstag',
        text: "Table four. Coming. \\p I have been coming for six years.",
      },
    },
  },

  fulbar: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Fulbar Hardcheese',
        text: "Two coppers a bed and I will not pretend it is more than that.\n\nHe is round, cheerful, and entirely at peace with running the second-best inn in a town with two.\n\nFulbar Hardcheese, the Happy Cow. Clean straw, thin ale, honest price. If you want the good wine go over the road and pay for it; Filarion is worth it and I will tell anyone so.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Fulbar Hardcheese',
        text: "So. Bed, board, or a sit-down?",
        choices: [
          { text: 'Show us what the Cow has.', do: { shop: 'happy-cow' }, goto: 'hub' },
          { text: 'A bed, then. [gold]4 gp[/]', if: { gold: 4 }, do: { heal: { cost: 4, hours: 8 } }, goto: 'rested' },
          { text: 'You send people to your competitor?', goto: 'rival' },
          { text: 'Who drinks here?', goto: 'drinkers' },
          { text: 'Good day to you.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Fulbar Hardcheese',
        text: "Loft, straw's fresh Thursday, and the goat is not in the loft any more whatever you have been told.\n\nYou sleep on clean straw under a low roof and wake to the smell of frying and the sound of a halfling arguing amiably with a milk cart.",
        goto: 'hub',
      },
      rival: {
        speaker: 'Fulbar Hardcheese',
        text: "Course I do. \\p What am I going to do, sell them a wine I have not got?\n\nHe leans on the counter, delighted with himself.\n\nHere is the trick of it, and it is the only trick I know. Filarion sends me the carters and the drovers and the folk down to their last silver, because he cannot house them at his price and he will not insult them with charity. And I send him the merchants.\n\nWe have done that for nine years and neither of us has ever said it out loud, and both of us have full houses.",
        goto: 'hub',
      },
      drinkers: {
        speaker: 'Fulbar Hardcheese',
        rumor: true,
        text: "Drovers, mostly. Carters. Two of the Duchess's farmer-guards on their off-rota, who talk more than they should and are worth listening to for it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Fulbar Hardcheese',
        text: "Mind the step down. It has had more people than the ale has.",
      },
    },
  },

  lucian: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Lucian Dlusker',
        text: "The Keeper of the Yellow Sun keeps the hours. \\p Come in; we are between them.\n\nHe is precise, gold-vested, and Baldurian to the bone in a way the accent gives away in three words.\n\nDawnmaster Lucian Dlusker, of Morninglow Tower. Amaunator's house in Daggerford, such as it is, and mine, such as I am.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Lucian Dlusker',
        text: "The hours are kept. What can the tower do?",
        choices: [
          { text: 'What does the tower offer?', do: { shop: 'morninglow-tower' }, goto: 'hub' },
          { text: 'Something is putting out your flame.', if: { questNot: 'morninglow-dawn' }, do: { quest: 'morninglow-dawn' }, goto: 'flame' },
          { text: 'The flame is safe. We found it.', if: { quest: 'morninglow-dawn' }, do: [{ complete: 'morninglow-dawn' }, { flag: 'morninglow-safe' }, { rep: { id: 'gauntlet', amount: 2 } }], goto: 'flame-done' },
          { text: 'Dlusker. That is a Baldurian name.', goto: 'name' },
          { text: 'Dawnmaster.', cancel: true, goto: 'bye' },
        ],
      },
      flame: {
        speaker: 'Lucian Dlusker',
        text: "Four times. \\p Four times in eleven days, always between the third and fourth hour after midnight, always the same lamp, always with the oil untouched.\n\nHe is very carefully not showing that this frightens him.\n\nAmaunator is the Keeper of Law and the Sun. The flame at Morninglow has not gone out since 1479. Its going out is not an inconvenience, it is a statement, and I do not know who is making it or in what language.\n\nSit up with it. Two nights. Do not relight it if it goes — watch what the dark does. That is the whole instruction and I am aware of how it sounds.",
        goto: 'hub',
      },
      'flame-done': {
        speaker: 'Lucian Dlusker',
        text: "He listens to the whole of it without once interrupting, which for him is remarkable, and at the end he sits down on the step, which is worse.\n\nA draught. \\p A draught, from a flue that was bricked in 1479, in the year the flame was lit.\n\nSomebody bricked a chimney to make a room, and seventeen years later the mortar failed, and Amaunator's flame went out four times because of a builder's shortcut and a bad winter.\n\nHe laughs once, and it is not a happy sound, and then it becomes one.\n\nI had reached the Shadowfell in my reasoning. I had got as far as writing to Baldur's Gate. And it is a chimney. \\p Take the tower's thanks and take them in coin, because if I try to say them properly I shall be here all night.",
        goto: 'hub',
      },
      name: {
        speaker: 'Lucian Dlusker',
        text: "It is. Second son, third rank, and no seat coming — you send that boy to a temple and you send him a long way off.\n\nHe says it without self-pity, as a fact about family architecture.\n\nAnd then in 1491 Thalamra Vanthampur died and the Council had a chair going spare, and a Dlusker sat down in it. My cousin. Bardeid.\\p If you go south you will meet him. He is loud, he is generous, and he is sitting in a dead woman's chair and knows it. Give him my regards and watch what his hands do.",
        do: { flag: 'dlusker-cousin-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Lucian Dlusker',
        text: "Go with the light. The hours are kept whether you are in them or not; that is rather the point of them.",
      },
    },
  },

  derval: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Derval Ironeater',
        text: "Bring it here and do not tell me how it broke. I will see how it broke.\n\nHe takes whatever is nearest to hand, turns it once, and puts it down having plainly learned everything about you from it.\n\nIroneater. Sixty years, this forge, this valley. I have shod every horse in the Delimbiyr and mended every plough, and about once a decade somebody asks me for a sword and I do it and I am not pleased about it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Derval Ironeater',
        text: "Well. What is it.",
        choices: [
          { text: 'Show us the racks.', do: { shop: 'daggerford-provisions' }, goto: 'hub' },
          { text: 'Why the objection to weapons?', goto: 'weapons' },
          { text: 'What is worth buying before the road south?', goto: 'advice' },
          { text: 'Sixty years in one valley?', goto: 'valley' },
          { text: 'Master smith.', cancel: true, goto: 'bye' },
        ],
      },
      weapons: {
        speaker: 'Derval Ironeater',
        text: "No objection. \\p A preference, which is different, and I will not be argued into calling it the other thing.\n\nHe sets the hammer down.\n\nA plough gets used ten thousand times and every one of them puts food on a board. A sword gets used four times if the man is lucky, and I have shod the horse that carried him and mended the pot his widow cooks in.\n\nI will make you good steel. I make good steel. But I have watched this valley for sixty years and I know which of my work is still working.",
        goto: 'hub',
      },
      advice: {
        speaker: 'Derval Ironeater',
        text: "Boots and buckles.\n\nHe says it flatly, waits for the disappointment, and goes on.\n\nEverybody comes in for the blade and goes out with the blade and dies of the boots. Strapping, buckles, a spare pin, and get the mail re-riveted here where I can see it rather than in the Gate where they will sell you a new one.\\p And oil. South of the Chionthar it is wet, and wet is a slower thief than a bandit and a much surer one.",
        goto: 'hub',
      },
      valley: {
        speaker: 'Derval Ironeater',
        text: "Sixty in this one. Ninety before it in the Sword Mountains, and I will not be discussing those.\n\nHe glances at the door of the forge as though checking it is still where he put it.\n\nA dwarf does not settle somewhere. A dwarf decides somewhere is worth the work, and then keeps deciding it, every morning, for a very long time. Daggerford has been worth the work.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Derval Ironeater',
        text: "Buckles. \\p You are not going to buy the buckles. Nobody buys the buckles.",
      },
    },
  },

  // =========================================================================
  // 3. THE WAY INN
  // =========================================================================

  'gorstag-amblecrown': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Gorstag Amblecrown',
        text: "Way Inn. Gate shuts at dusk and I do not open it twice.\n\nHe is checking a tally against a wall of stacked barrels while he says it and does not stop.\n\nAmblecrown. Trade Way crosses the Dusk Road out there and every caravan on both of them sleeps in my yard sooner or later. Beds inside, wagons in the yard, and everything counted going in and coming out.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Gorstag Amblecrown',
        text: "Right. What do you need and how long are you stopping?",
        choices: [
          { text: 'Show us the stores.', do: { shop: 'way-inn-common' }, goto: 'hub' },
          { text: 'Beds for the night. [gold]10 gp[/]', if: { gold: 10 }, do: { heal: { cost: 10, hours: 8 } }, goto: 'rested' },
          { text: 'Mara Lackman is broken down on the Fields Reach.', if: { flag: 'mara-word-carried' }, do: [{ flag: 'mara-rescued' }, { rep: { id: 'lords-alliance', amount: 1 } }], goto: 'mara' },
          { text: 'Somebody is going missing from your yard.', if: { questNot: 'the-way-inn-vigil' }, do: { quest: 'the-way-inn-vigil' }, goto: 'vigil' },
          { text: 'We sat up. Here is what took them.', if: { quest: 'the-way-inn-vigil' }, do: [{ complete: 'the-way-inn-vigil' }, { flag: 'way-inn-safe' }], goto: 'vigil-done' },
          { text: 'What is the traffic saying?', goto: 'news' },
          { text: 'That is all.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Gorstag Amblecrown',
        text: "Long room, east end, and the gate is barred at dusk whoever is still on the wrong side of it.\n\nYou sleep behind a real wall for the first time since Daggerford. Somewhere in the night a wagon arrives late, and you hear a man argue with a bar he is not going to move.",
        goto: 'hub',
      },
      mara: {
        speaker: 'Gorstag Amblecrown',
        text: "Lackman. \\p On the Fields Reach with a stub axle.\n\nHe is already turning and shouting a boy's name into the yard.\n\nTell him — no. He can hear me. TAKE THE SPARE AND THE LIGHT DRAY AND GO NOW.\n\nHe turns back, and there is something slightly stiff about him.\n\nShe said something about Uthgardt Winter, did she. \\p Yes. She would. Well. She does not owe me for the axle and she has never owed me for anything and one day I shall tell her that in a way she cannot argue with.",
        goto: 'hub',
      },
      vigil: {
        speaker: 'Gorstag Amblecrown',
        text: "Three tendays. Three men. \\p All from the yard, none from the beds, and every one of them on a night the gate was shut and barred and I checked it myself.\n\nHe stops counting barrels, which from him is an emergency.\n\nA drover out of Scornubel. A wheelwright's lad. A Zhent factor nobody will report. Gone out of a walled yard with the gate barred and no wall marked and no gear taken.\n\nSit up with the wagons. One night. I will not ask two of anybody.\\p And do not tell the yard what you are doing, because whatever this is, it knows what the yard knows.",
        goto: 'hub',
      },
      'vigil-done': {
        speaker: 'Gorstag Amblecrown',
        text: "He listens all the way through, and at the end he goes and looks at the well, and stands there a while with his back to you.\n\nThe well. \\p Nineteen years I have drawn off that well.\n\nHe comes back and he has decided something, and you can see him decide the next thing after it.\n\nRight. It is capped by morning, stone, and the yard drinks from the Dusk Road spring like our grandparents did and can complain about the walk. And you three drink for nothing here from now until one of us is dead.\n\nThat is not gratitude, that is a contract, and I honour contracts.",
        goto: 'hub',
      },
      news: {
        speaker: 'Gorstag Amblecrown',
        rumor: true,
        text: "Two roads cross out there. That is twice the traffic and four times the talk, and I hear all of it while I am counting barrels.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Gorstag Amblecrown',
        text: "Dusk. \\p I have said it three times now and people still knock.",
      },
    },
  },

  jasmal: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Jasmal Rein',
        text: "Sit, sit — no, that chair, the other one faces the door and the man who wants that chair has not arrived yet.\n\nShe is Calishite, immaculate in a room full of road dust, with four ledgers and a cup of something dark.\n\nJasmal Rein. I book cargo space for four houses and I am scrupulously honest with three of them, which is a better ratio than anybody else at this crossing.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Jasmal Rein',
        text: "Now. You want something, and it is not cargo space.",
        choices: [
          { text: 'What is moving on the Trade Way?', goto: 'freight' },
          { text: 'Which house are you not honest with?', goto: 'fourth' },
          { text: 'What waits for us in Baldur\'s Gate?', goto: 'gate' },
          { text: 'Anything worth hearing?', goto: 'news' },
          { text: 'Enjoy the chair.', cancel: true, goto: 'bye' },
        ],
      },
      freight: {
        speaker: 'Jasmal Rein',
        text: "Southbound: iron, wool, Waterdhavian glass, and three wagons a tenday that are booked as salt and weigh like salt does not.\n\nNorthbound: nothing. \\p Which is the interesting sentence.\n\nA road that carries in one direction is not a trade road, it is a drain. Somebody in the Gate is buying and not selling, and has been since the winter, and no factor at this table can tell me who.",
        do: { flag: 'trade-way-drain' },
        goto: 'hub',
      },
      fourth: {
        speaker: 'Jasmal Rein',
        text: "The one that asked me to book space for cargo with no manifest and pay the Basilisk Gate toll out of a purse I was not to account for.\n\nShe turns a ledger round so you cannot see it, which is its own kind of answer.\n\nI took the commission. I am not going to pretend otherwise; a factor who turns down the shady house is a factor with three houses. But I write every one of those bookings down in a ledger they have never seen, with dates.\\p One day somebody will want that ledger very badly. I intend to be expensive that day.",
        goto: 'hub',
      },
      gate: {
        speaker: 'Jasmal Rein',
        text: "A writ, at the Black Dragon Gate, if you want the Upper City. Everybody discovers this the same way, standing in a queue, having walked three hundred miles.\n\nGet it honestly. Truly. The forgeries are good and the Fist lieutenant who reads them is better, and the penalty is not a fine.\\p And when you are inside: the Counting House for money, Sorcerous Sundries for anything that glows, and the Blushing Mermaid for anything you would rather nobody wrote down.",
        do: { flag: 'south-writ-rumoured' },
        goto: 'hub',
      },
      news: {
        speaker: 'Jasmal Rein',
        rumor: true,
        text: "Four ledgers, one crossroads, and everybody who sits at this table thinks they are the one doing the listening.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Jasmal Rein',
        text: "Go well. And if you ever want to know what is really on a wagon — ask what it costs to insure, never what it costs to buy.",
      },
    },
  },

  'stor-helder': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Stor Helder',
        text: "Yard's free. Common room is not.\n\nHe is sitting on his pack against a wagon wheel with a sword across his knees and the manner of a man conserving something.\n\nStor Helder. Caravan sword. Twenty-two trips down this road and I have been paid for nineteen of them, which everyone tells me is a good average and everyone who tells me that has never done it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Stor Helder',
        text: "Go on.",
        choices: [
          { text: 'Who did not pay you?', goto: 'unpaid' },
          { text: 'What is the road actually like?', goto: 'road' },
          { text: 'Here. Buy a bed. [gold]10 gp[/]', if: { gold: 10 }, do: [{ gold: -10 }, { flag: 'stor-helped' }], goto: 'bed' },
          { text: 'Rest easy.', cancel: true, goto: 'bye' },
        ],
      },
      unpaid: {
        speaker: 'Stor Helder',
        text: "Three houses. One went under and I will not speak against them. One paid in Amnian paper that a Baldurian teller laughed at.\n\nAnd one told me at the gate that the contract was for arrival, and the wagon had arrived, and I had not, on account of being a day behind carrying a man who had been opened up on the Fields Reach.\\p I got him to the Way Inn. He lived. That is what the trip was worth and I have made my peace with the accounting.",
        goto: 'hub',
      },
      road: {
        speaker: 'Stor Helder',
        rumor: true,
        text: "Bad in patches and the patches move. Anyone who tells you which stretch is safe has not been on it this season.",
        goto: 'hub',
      },
      bed: {
        speaker: 'Stor Helder',
        text: "He looks at the coin, and then at you, and then does the thing tired men do where they decide not to be proud today.\n\nRight. \\p Right, thank you.\n\nHe gets up, slower than a man his age should.\n\nIf you are going south and you want a fourth sword at some point, ask at the Way Inn for me by name. I am cheap and I turn up, and there are not as many of us as there should be.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Stor Helder',
        text: "Aye. Mind the Fields.",
      },
    },
  },

  'way-inn-horse': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Dapple',
        text: "The grey cob regards you with the total, unembarrassed calculation of an animal working out whether you contain apples.\n\nHe has pulled the Way Inn's water cart since before the current ostler was born. He knows exactly how this goes.",
        choices: [
          { text: 'Offer an apple.', goto: 'apple' },
          { text: 'Pat his neck.', goto: 'pat' },
          { text: 'Leave him to it.', cancel: true, goto: 'bye' },
        ],
      },
      apple: {
        speaker: 'Dapple',
        text: "The apple is gone. It was there and then the transaction concluded and there is nothing on either side of it — no gratitude, no acknowledgement, no change in his expression at all.\n\nHe looks past you at the yard gate, in case there are further apples arriving.",
        do: { flag: 'dapple-fed' },
        goto: 'start',
      },
      pat: {
        speaker: 'Dapple',
        text: "He permits it. That is the whole of his position and he holds it firmly.\n\nSomewhere behind you the ostler says, without looking up, \"He's not friendly. He's just heavy.\"",
        goto: 'start',
      },
      bye: {
        speaker: 'Dapple',
        text: "He has already stopped considering you.",
      },
    },
  },

  // =========================================================================
  // 4. ULGOTH'S BEARD
  // =========================================================================

  westra: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Westra Helder',
        text: "Sea Bounty. Fish, bed, and the tide table on the wall is right, which is more than you can say for the one in the Gate.\n\nShe is weathered to the colour of a rope and has the flat, unhurried delivery of somebody who has said everything important already.\n\nWestra Helder. Thirty years. I will sell you passage out to the isles and tell you not to take it in the same breath, and I shall mean both halves.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Westra Helder',
        text: "Well. Which is it?",
        choices: [
          { text: 'Show us the house.', do: { shop: 'sea-bounty' }, goto: 'hub' },
          { text: 'A bed and a fire. [gold]8 gp[/]', if: { gold: 8 }, do: { heal: { cost: 8, hours: 8 } }, goto: 'rested' },
          { text: 'Why should we not take the passage?', goto: 'isles' },
          { text: 'Thirty years here. Why?', goto: 'why' },
          { text: 'What comes in on the tide?', goto: 'news' },
          { text: 'Fair winds.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Westra Helder',
        text: "Back room, and the shutter latches from the inside for a reason nobody has ever needed since I put it on.\n\nYou sleep with the sea forty yards away and wake with salt on the window and a bowl of something grey and excellent already on the table.",
        goto: 'hub',
      },
      isles: {
        speaker: 'Westra Helder',
        text: "Because I have buried two husbands who went out to them and I am not sentimental, I am arithmetical.\n\nShe wipes the counter, once, in a long line.\n\nThe boats are sound and the crews are good and the water between here and the isles is not the problem. The isles are the problem, and the men who have come back from them have come back a bit less than they went, every one, and none of them will say how.\\p I will still book you. I am a business. But you will have been told.",
        do: { flag: 'ulgoth-isles-warned' },
        goto: 'hub',
      },
      why: {
        speaker: 'Westra Helder',
        text: "Because somebody has to keep the light in the window on this coast, and it turns out that once you have done it a few times you cannot stop.\n\nThirty years, and every year the city gets bigger and this place gets smaller, and every year some Baldurian factor comes up to buy the frontage.\\p I let them make an offer. I keep the offers. There is a drawer of them. It is a very good drawer.",
        goto: 'hub',
      },
      news: {
        speaker: 'Westra Helder',
        rumor: true,
        text: "The tide brings talk in before it brings cargo. Fishermen gossip worse than any tavern; they have nothing else to do out there but think.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Westra Helder',
        text: "Mind the quay boards at the third one. It has been loose for nine years and I have decided it is a character now.",
      },
    },
  },

  'luth-hornraven': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Luth Hornraven',
        text: "If you have come about a hull over thirty feet, walk on. \\p I will save us both the afternoon.\n\nHe does not look up from a plank he is steaming, and the yard smells of pitch and pine and a long-settled argument.\n\nHornraven. Small boats. I build them very well and I build nothing else, and the last two men from the Gate who came up here to explain that to me went home in the same boat they came in.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Luth Hornraven',
        text: "Well?",
        choices: [
          { text: 'Why turn down Baldurian money?', goto: 'refuse' },
          { text: 'What makes a small boat good?', goto: 'craft' },
          { text: 'Anything strange come off the water lately?', goto: 'news' },
          { text: 'We will leave you to the plank.', cancel: true, goto: 'bye' },
        ],
      },
      refuse: {
        speaker: 'Luth Hornraven',
        text: "Because they do not want a boat. They want a yard.\n\nHe finally straightens.\n\nFirst commission is a coaster, and it is generous. Second is two coasters and now I need three more hands. Third is a keel I have not the shed for, so they build the shed, and then it is their shed, and then one day a Baldurian factor stands where you are standing and tells me what I am building this year.\\p I have watched it happen to the Beard's ropewalk and to the smoke-house. I am the last yard on this coast that answers to itself. That is not stubbornness. That is the entire point of the yard.",
        do: { flag: 'ulgoth-yard-known' },
        goto: 'hub',
      },
      craft: {
        speaker: 'Luth Hornraven',
        text: "Weight in the right place and nothing in the wrong one.\n\nHe taps the plank.\n\nA man who has never been swamped builds a boat that floats. A man who has been swamped builds one that comes back up. Everything else — the fairing, the finish, the paint the Gate wants — is for people looking at boats from a quay.",
        goto: 'hub',
      },
      news: {
        speaker: 'Luth Hornraven',
        rumor: true,
        text: "Things come off the water here that do not come off it anywhere else. That is what a coast this far out is for.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Luth Hornraven',
        text: "Aye. Mind the shavings; they are slippier than they look and everyone learns it the same way.",
      },
    },
  },

  'ulgoths-beard-cat': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ballast',
        text: "A grey cat with one ear is sitting precisely in the middle of the fish quay. A woman coming up with a basket steps round her without slowing and without looking down, in the manner of someone who has been doing it for years.\n\nBallast watches the basket go past and does not move. The tax, evidently, has already been assessed.",
        choices: [
          { text: 'Offer a fish.', goto: 'fish' },
          { text: 'Ask what happened to the ear.', goto: 'ear' },
          { text: 'Step round, like everyone else.', cancel: true, goto: 'bye' },
        ],
      },
      fish: {
        speaker: 'Ballast',
        text: "The fish is accepted without haste and without thanks, in the manner of a levy rather than a gift.\n\nShe eats it in the middle of the quay, in everybody's way, and a man with a crate says \"Aye, that's how she gets you\" and goes round.",
        do: { flag: 'ballast-paid' },
        goto: 'start',
      },
      ear: {
        speaker: 'Ballast',
        text: "Westra Helder, from the inn doorway, without being asked:\n\n\"Gull. Nine year back. You should see the gull.\"\n\nThe cat's expression does not change in any way you can name, and yet you are quite sure you have just been agreed with.",
        goto: 'start',
      },
      bye: {
        speaker: 'Ballast',
        text: "She holds the middle of the quay. She has held it for nine years.",
      },
    },
  },

  // =========================================================================
  // 5. THE FRIENDLY ARM
  // =========================================================================

  bentley: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bentley Mirrorshade',
        text: "Friendly Arm! Walls thick, gate shut at dusk, best beds on the Coast Way, and nothing under the floor. \\p Nothing at all.\n\nHe is a gnome behind a bar built for one, on a step built for the same, and he delivers the whole greeting in one breath with the ease of thirty years' practice.\n\nBentley Mirrorshade. The keep is mine, the shrine is my wife's, and the rule of the house is that everyone leaves in the same number of pieces they arrived in.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bentley Mirrorshade',
        text: "So! Bed, board, or conversation? The first two are priced and the third is free and worth it.",
        choices: [
          { text: 'Show us the house stores.', do: { shop: 'friendly-arm-common' }, goto: 'hub' },
          { text: 'Beds for the night. [gold]14 gp[/]', if: { gold: 14 }, do: { heal: { cost: 14, hours: 8 } }, goto: 'rested' },
          { text: 'This keep belonged to a Bhaalite priest.', goto: 'keep' },
          { text: '"Nothing under the floor." Say that again, slower.', if: { questNot: 'the-friendly-arm-cellar' }, do: { quest: 'the-friendly-arm-cellar' }, goto: 'cellar' },
          { text: 'The fifth floor is finished, Bentley.', if: { quest: 'the-friendly-arm-cellar' }, do: [{ complete: 'the-friendly-arm-cellar' }, { flag: 'friendly-arm-cellar-closed' }, { rep: { id: 'gauntlet', amount: 4 } }], goto: 'cellar-done' },
          { text: 'What is the road like from here?', goto: 'road' },
          { text: 'Good house, master gnome.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Bentley Mirrorshade',
        text: "Third floor, river side, and the bar on the door works, which I mention to everyone and mean with none of my usual charm.\n\nYou sleep behind six feet of Bhaalite stonework gone entirely respectable. It is the best night on the Coast Way, exactly as advertised.",
        goto: 'hub',
      },
      keep: {
        speaker: 'Bentley Mirrorshade',
        text: "It did! No point being coy; it is on the sign, more or less.\n\nHe polishes a tankard with sudden thoroughness.\n\nA priest of the Lord of Murder kept this hold, and a dozen of us took it off him when Gellana and I were young and immortal like you lot. We cleared it top to bottom, scrubbed it, blessed it, whitewashed it, and opened an inn, and it has been thirty years of honest custom ever since.\\p Top to bottom. That is the story and I have told it a thousand times.",
        goto: 'hub',
      },
      cellar: {
        speaker: 'Bentley Mirrorshade',
        once: true,
        text: "He stops polishing. He puts the tankard down. He looks at the taproom, which is full, and lowers his voice to a size the taproom cannot use.\n\nFour floors. \\p We cleared four floors. There is a fifth. There was a stair going down past where we stopped, and I bricked it myself, at night, alone, and I have told the story with the word 'bottom' in it for thirty years because I wanted the word to be true.\n\nAnd now something down there has started keeping the beds on the north side awake, and my wife — who has known the whole time, do not ask me how — has told me to finish the job or stop telling the story.\\p The brick is behind the ale racks. Take lamps. Take everything. And whatever is left of him down there, do not let it talk to you first.",
        goto: 'hub',
      },
      'cellar-done': {
        speaker: 'Bentley Mirrorshade',
        text: "He listens to all of it standing very still, which is not a thing gnomes are built for, and when you finish he lets out thirty years of breath in one go.\n\nSo that was the noise. Him. All this time, him, waiting under my ale racks for the congregation to come back.\n\nHe wipes his eyes briskly, once, and becomes an innkeeper again.\n\nRight. The story has an ending now, and I shall tell it properly from tonight — five floors, and the last one cleared by better hands than mine. Your beds are free in this house for life, and I shall warn you: people live a long time under Gellana's care, so that is a real amount of money.\\p Go over and see her. She will want to bless the lot of you and she does not take refusals.",
        goto: 'hub',
      },
      road: {
        speaker: 'Bentley Mirrorshade',
        rumor: true,
        text: "South it is a day to Beregost, good road, bad fields — the ankhegs have the farms east of the way and the elf by the fire has opinions on that. North it is the river and the city, and the city will want a writ off you at the Black Dragon Gate, which nobody ever believes until they are standing in the queue.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Bentley Mirrorshade',
        text: "Gate shuts at dusk! It is on the sign, it is in the greeting, and it will still surprise somebody tonight.",
      },
    },
  },

  gellana: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Gellana Mirrorshade',
        text: "Garl's shrine. Sit down, stop bleeding on the floor, and we shall discuss the offering.\n\nShe is half her husband's cheer and twice his weight of attention, in vestments the gold of a good joke well told.\n\nGellana Mirrorshade, priestess of Garl Glittergold, who is the Joker and the Watchful Protector both — and if you cannot see how those go together, you have not protected anything yet.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Gellana Mirrorshade',
        text: "Well? Wounds, wares, or wisdom. I stock all three.",
        choices: [
          { text: 'What does the shrine offer?', do: { shop: 'garl-shrine' }, goto: 'hub' },
          { text: 'A blessing for the road.', goto: 'blessing' },
          { text: 'You knew about the fifth floor.', if: { flag: 'friendly-arm-cellar-closed' }, goto: 'knew' },
          { text: 'How does a gnome shrine end up in a Bhaalite keep?', goto: 'shrine' },
          { text: 'Priestess.', cancel: true, goto: 'bye' },
        ],
      },
      blessing: {
        speaker: 'Gellana Mirrorshade',
        text: "Hold still.\n\nShe reaches up, puts one small thumb to your brow, and says something in Gnomish that has the cadence of a punchline.\n\nThere. Garl's luck: may the ground you fall on be soft, and may the people you fail be forgiving, and may you get one warning before the big one.\\p That is the whole blessing. It is more useful than it sounds. Most of my god's gifts are.",
        do: { flag: 'garl-blessing' },
        goto: 'hub',
      },
      knew: {
        speaker: 'Gellana Mirrorshade',
        text: "Of course I knew. I count floors. It is not an arcane discipline.\n\nShe sets down her taper.\n\nThirty years ago my husband bricked a stair at midnight and came to bed with mortar on his hands and told me he had been checking the ale. I have waited thirty years for him to be ready, and then I stopped waiting, because the thing under the bricks had stopped waiting first.\\p You did well. He will tell the story with the true ending now, and every time he tells it he will get a little lighter. That is how it works with him. It is one of the reasons I married him.",
        goto: 'hub',
      },
      shrine: {
        speaker: 'Gellana Mirrorshade',
        text: "By consecration, which is to say: by scrubbing.\n\nA Bhaalite chapel is not haunted ground, whatever the ballads want. It is only a room somebody used badly. You bless it, you whitewash it, you put a laughing god's altar where the grim one stood, and then — this is the part people miss — you keep an inn in it for thirty years, full of soup and arguments and bad singing.\\p Holiness is not the ceremony. Holiness is the traffic.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Gellana Mirrorshade',
        text: "Go on. And if you are ever dying somewhere ridiculous, remember the shrine's rule: we heal first and laugh at you second, but we do both.",
      },
    },
  },

  'mival-chernin': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Mival Chernin',
        text: "Gate's open till dusk. After that it is not, and there is no story you can tell me that has ever moved it.\n\nHe has a halberd, a stool, and the deep settled calm of a man whose job is one sentence long.\n\nMival Chernin. Eleven years on this gate. Go on in; the taproom is where everything happens, which suits me, because it is in there and I am out here.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Mival Chernin',
        text: "Something else? I am not going anywhere. That is the whole of the position.",
        choices: [
          { text: 'Eleven years. Ever any trouble?', goto: 'trouble' },
          { text: 'What comes up this road?', goto: 'road' },
          { text: 'Ever want the taproom job instead?', goto: 'taproom' },
          { text: 'Keep well, gatekeeper.', cancel: true, goto: 'bye' },
        ],
      },
      trouble: {
        speaker: 'Mival Chernin',
        text: "Four thousand and one nights, more or less. Four thousand of them, the trouble was weather.\n\nHe is quiet for a moment, and the quiet is doing work.\n\nOne night, in the winter of '89, something came up the road that did not walk like the shape it was wearing, and stood outside the gate till dawn asking to be let in, in different voices. Some of the voices were people I knew.\\p I did not open the gate. That is the whole story, and it is the reason Bentley pays me what he pays me, and we have never once discussed it.",
        do: { flag: 'friendly-arm-winter-known' },
        goto: 'hub',
      },
      road: {
        speaker: 'Mival Chernin',
        rumor: true,
        text: "Pilgrims north, iron south, and everything stops here at dusk or keeps walking and regrets it. You hear the road's whole day standing on this gate.",
        goto: 'hub',
      },
      taproom: {
        speaker: 'Mival Chernin',
        text: "No.\n\nHe considers whether the answer needs more, and decides to be generous.\n\nIn the taproom you are wrong twice a night — wrong ale, wrong change, wrong bed. On the gate I am asked one question a day and the answer is dusk. A man should find the size of job that fits what he can carry, and then hold it with both hands.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Mival Chernin',
        text: "Dusk. Mind it. I like you lot and I will still not like you enough.",
      },
    },
  },

  ivellios: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ivellios Nailo',
        text: "The corner seat, because it sees the door.\n\nHe is a wood elf gone the colours of the Cloakwood in autumn, with a longbow against the wall and a map on the table that is mostly annotations.\n\nIvellios Nailo. Enclave. I range the Coast Way. Sit if you like.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ivellios Nailo',
        text: "He moves a cup to make room, which is a speech of welcome, from him.",
        choices: [
          { text: 'What is the map?', goto: 'map' },
          { text: 'What is the Enclave\'s trouble here?', goto: 'ankheg' },
          { text: 'Range with us. The road goes south.', goto: 'join' },
          { text: 'Anything moving we should know about?', goto: 'news' },
          { text: 'Good hunting.', cancel: true, goto: 'bye' },
        ],
      },
      map: {
        speaker: 'Ivellios Nailo',
        text: "The burrows.\n\nHe turns it so you can see: the Coast Way, Beregost, the Friendly Arm, and between them a spreading hatchwork of tunnels marked in forty years of different inks.\n\nEvery ankheg burrow between here and Beregost. The green ink is when I started. The black is this spring.\\p There is a great deal of black.",
        goto: 'hub',
      },
      ankheg: {
        speaker: 'Ivellios Nailo',
        text: "Ankhegs are not a plague. They are a ploughshare that bites — the fields here are rich because of them, and the farmers know it, and for three hundred years the balance held at three farms' width.\n\nIt is eleven farms now. Something below is pushing them up and east, and the Enclave sent me to find what, and I have spent nine years learning that I cannot do it alone.\\p That sentence took me nine years and four words. Do not make me say it twice.",
        do: { flag: 'ankheg-fields-known' },
        goto: 'hub',
      },
      join: {
        speaker: 'Ivellios Nailo',
        text: "He looks at you for the length of a slow breath. Then he rolls up the map.\n\nSouth is where the pushing comes from. Yes.\n\nA pause.\n\nOne hundred and sixty gold. It is not for me. It goes to the farms the burrows took this spring, through Gellana, who will not say where it came from.",
        choices: [
          { text: 'Come with us. [gold]160 gp[/]', if: { gold: 160 }, do: [{ recruit: 'ivellios-nailo' }, { flag: 'ivellios-joined' }], goto: 'joined' },
          { text: 'Not yet.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Ivellios Nailo',
        text: "He stands, shoulders the bow, and leaves coin on the table for an ale he has not finished.\n\nI walk at the front. Not pride. Eyes.",
        goto: 'hub',
      },
      news: {
        speaker: 'Ivellios Nailo',
        rumor: true,
        text: "The road tells you everything if you read the verges instead of the ruts. This tenday the verges are saying: fewer rabbits, more crows.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ivellios Nailo',
        text: "Walk the middle of the road after the second milestone. The verges are undermined. \\p Both of them.",
      },
    },
  },

  // =========================================================================
  // 6. BEREGOST — and High Hedge
  // =========================================================================

  kelddath: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kelddath Ormlyr',
        text: "Dawn's peace. Sit; there is nothing here that will not keep for a cup of something warm.\n\nHe is eighty and carries it the way a good roof carries snow. The Song of the Morning rises behind him, rose stone and gold leaf, and somehow he makes it look like a modest house.\n\nKelddath Ormlyr. High Radiance, they insist. In practice I am the man Beregost sends for when anything at all goes wrong, which is the truest job title I have ever held.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kelddath Ormlyr',
        text: "Now then. What does the morning ask of us?",
        choices: [
          { text: 'What does the temple offer?', do: { shop: 'song-of-the-morning' }, goto: 'hub' },
          { text: 'You lost something to Rosymorn.', if: { questNot: 'song-of-the-morning-relic' }, do: { quest: 'song-of-the-morning-relic' }, goto: 'relic' },
          { text: 'The reliquary comes home.', if: { all: [{ quest: 'song-of-the-morning-relic' }, { item: 'reliquary' }] }, do: [{ take: 'reliquary' }, { complete: 'song-of-the-morning-relic' }, { flag: 'rosymorn-relic-recovered' }, { rep: { id: 'gauntlet', amount: 5 } }], goto: 'relic-done' },
          { text: 'Tell us about Beregost.', goto: 'town' },
          { text: 'The dragonborn in your forecourt.', if: { notFlag: 'kriv-vouched' }, goto: 'kriv' },
          { text: 'Peace of the morning, High Radiance.', cancel: true, goto: 'bye' },
        ],
      },
      relic: {
        speaker: 'Kelddath Ormlyr',
        once: true,
        text: "He is quiet for a moment, and when he speaks the warmth is still there, but it has a stone in it.\n\nThe dawn reliquary. Lathander's own house-gift to this temple, two hundred years on that altar. Three tendays ago a letter came, in a hand I knew, from a chapter at Rosymorn that I also knew — knew, mark you — had been dissolved and gone to Amn in '87.\n\nAnd I am eighty, and I was busy, and the letter said the right prayers in the right order, and I sent it north in a locked cart with four good guards.\\p There is no chapter at Rosymorn. There has not been for nine years. Something wrote to me in a dead man's hand and I answered it with a relic and four lives, and I will carry that up the last hill of my life.\n\nBring it home. And if you find my guards — no. Bring it home, and tell me only what I ask.",
        goto: 'hub',
      },
      'relic-done': {
        speaker: 'Kelddath Ormlyr',
        text: "He takes the reliquary in both hands, and for a moment he is not eighty; he is the age of the temple, and the temple is young.\n\nHome.\n\nHe sets it on the altar himself, adjusts it a finger's width, and stands looking at it while the light moves.\n\nA woman kept the lamp up there, you say. Lureene. \\p Yes. She would. When my letters to Amn are answered — and they will be answered now, I shall use the voice I never use — there will be a chapter at Rosymorn again, and it will be built around her, and I shall climb that path myself to tell her so if it is the last climbing I do.\n\nThe temple's thanks are in your pack and its doors are open to you at any hour. Both of those are permanent.",
        goto: 'hub',
      },
      town: {
        speaker: 'Kelddath Ormlyr',
        text: "Four inns, one smith, one temple, and the temple does the governing, which nobody ever voted on and everybody has watched work for forty years.\n\nFeldepost's for quiet, the Juggler for noise, the Burning Wizard for company I pray over, and Thunderhammer's forge for the best plain steel south of Waterdeep — he will tell you so himself, at volume, and he will be right.\\p And east of town, High Hedge, where Thalantyr keeps his skeletons and his civility. We have an understanding: he does not frighten my flock, and I do not ask him questions I would have to act on the answers to.",
        goto: 'hub',
      },
      kriv: {
        speaker: 'Kelddath Ormlyr',
        text: "Kriv. Yes.\n\nHe lowers his voice, not to hide it from the forecourt, but out of respect for it.\n\nHe came to me four months ago and asked for a penance, and I gave him a broom, and he has used it every day since with the thoroughness of a siege. The judgement he is doing penance for was correct, you understand. Lawful, doctrinal, correct — and a family is dead because being correct was all he did.\\p He does not need a harder penance. He needs a hard task in company that will argue with him. If your road is that company, take him, and count it a favour to me.",
        do: { flag: 'kriv-vouched' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Kelddath Ormlyr',
        text: "Go with the morning. It comes back every day, which is the entire doctrine, if you are ever asked.",
      },
    },
  },

  kriv: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kriv Daardendrian',
        text: "A bronze dragonborn is sweeping the temple forecourt. The forecourt is spotless. He is sweeping it anyway, with the parade-ground economy of a soldier doing a drill he has decided to do perfectly forever.\n\nKriv, of clan Daardendrian. Sworn of the Gauntlet.\\p Currently sworn of this broom.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kriv Daardendrian',
        text: "Ask what you wish. The forecourt does not suffer for conversation.",
        choices: [
          { text: 'What is the penance for?', goto: 'penance' },
          { text: 'The High Radiance speaks well of you.', if: { flag: 'kriv-vouched' }, goto: 'vouched' },
          { text: 'We have a hard task and a plain answer.', goto: 'join' },
          { text: 'What does the Gauntlet do on this road?', goto: 'gauntlet' },
          { text: 'Sweep well.', cancel: true, goto: 'bye' },
        ],
      },
      penance: {
        speaker: 'Kriv Daardendrian',
        text: "For a judgement.\n\nHe does not stop sweeping, and his voice acquires the flatness of a report he has made many times to himself.\n\nOn the Coast Way, in the spring, I found a man stealing a temple tithe-cart. The law was clear. The doctrine was clear. I executed both correctly, and left him bound for the Fist post at Rivington, and rode on satisfied.\n\nThe cart was stolen to pay a toll. The toll was for a bridge. The bridge was between his family and the harvest work.\\p I was correct. Correct was not enough. I am sweeping until I understand the difference in my hands and not only in my mouth.",
        do: { flag: 'kriv-penance-known' },
        goto: 'hub',
      },
      vouched: {
        speaker: 'Kriv Daardendrian',
        text: "For the first time, the broom stops.\n\nHe said that.\n\nA long exhale, through the nose, like a forge cooling.\n\nHe gave me the broom on the first day and has not spoken of the matter since, and I believed I was merely being stored. I was being watched. \\p That is twice now that I have judged a situation correctly and understood it not at all. The pattern is instructive and I do not enjoy it.",
        goto: 'hub',
      },
      join: {
        speaker: 'Kriv Daardendrian',
        text: "He sets the broom against the wall with the care of a man racking a greatsword.\n\nName the task. If it is hard and honest I will take it, and I will pay my own way — no. That is pride. The Order asks two hundred and forty gold to release a sworn blade to private service, and the Order will have it, because the Order feeds widows with it.\\p Including, since the spring, one particular widow. I checked.",
        choices: [
          { text: 'March with us. [gold]240 gp[/]', if: { gold: 240 }, do: [{ recruit: 'kriv-daardendrian' }, { flag: 'kriv-joined' }], goto: 'joined' },
          { text: 'We will come back for you.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Kriv Daardendrian',
        text: "He bows to the temple door — precisely, deeply, once — and takes up a greatsword that has been leaning behind the rain barrel the entire time, oiled and ready.\n\nUnderstand one thing of me. I will always tell you what the law says. \\p I am learning to say the next sentence as well. Be patient with the gap.",
        goto: 'hub',
      },
      gauntlet: {
        speaker: 'Kriv Daardendrian',
        text: "Watch, and be first.\n\nThe Order holds that evil is small before it is large — a shrine desecrated, a road toll that becomes a road tax that becomes a chain. We are sworn to find it while it is small and end it while ending it is cheap.\\p The barrows north of here opened this year. The crypts at Tumbledown are short of their dead. These are small things. The Gauntlet pays for small things to be made smaller, and the board in the journal carries the contracts.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kriv Daardendrian',
        text: "Walk lawfully. And when the law is not enough — walk well anyway. I am told that is possible.",
      },
    },
  },

  thunderhammer: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Taerom Fuiruim',
        text: "THUNDERHAMMER. STEEL ONLY.\n\nThe forge noise stops, which makes his speaking voice seem quiet, and it is not.\n\nIf you want it to glow, that is High Hedge, east, and a worse shop. If you want it to cut for twenty years and be mended by any honest smith on the coast, you have found the last man south of Waterdeep who does nothing else.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Taerom Fuiruim',
        text: "SPEAK UP. The forge takes half of everything said in here and it has first claim.",
        choices: [
          { text: 'Show us the racks.', do: { shop: 'thunderhammer-smithy' }, goto: 'hub' },
          { text: 'Why steel only?', goto: 'steel' },
          { text: 'What should we carry south of here?', goto: 'advice' },
          { text: 'Who taught you?', goto: 'taught' },
          { text: 'Master smith.', cancel: true, goto: 'bye' },
        ],
      },
      steel: {
        speaker: 'Taerom Fuiruim',
        text: "Because steel tells the truth.\n\nHe holds up a half-finished blade, sights down it, and sets it back in the coals.\n\nAn enchanted sword is two crafts stacked, and when it fails you cannot tell which one lied to you. My steel fails honestly — it bends where I made it thin and it holds where I made it thick, and forty years of buyers have come back and told me which, and every blade since is the better for the telling.\\p A wizard's work never writes home. That is my whole objection and it is sufficient.",
        goto: 'hub',
      },
      advice: {
        speaker: 'Taerom Fuiruim',
        text: "SOUTH? South is Amn's road. Carry the following.\n\nHe counts on fingers the size of hammer heads.\n\nA blade you have already bled on — no new steel into old trouble. A second dagger, because the first one ends up in something. And silvered arrows if you are crossing the Fields, which I do not sell, WHICH THE TEMPLE SELLS, because Kelddath and I divided the market twenty years ago over a very good dinner and have both kept the treaty.",
        goto: 'hub',
      },
      taught: {
        speaker: 'Taerom Fuiruim',
        text: "A dwarf of the Ironeater line, at Daggerford, who is still working and still better than me at shoeing and knows it.\n\nHe taught me three things. Heat is patience. Steel remembers everything you do to it. And the customer is describing the wound, not the weapon — LISTEN TO THE WOUND.\\p Forty years and I have never needed a fourth thing.",
        do: { flag: 'thunderhammer-derval-link' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Taerom Fuiruim',
        text: "MIND THE COALS. They are the one thing in Beregost that does not respect the temple.",
      },
    },
  },

  feldepost: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Feldepost',
        text: "Feldepost's. Quiet house.\n\nHe says it the way other men draw a sword: as a warning delivered with full readiness to follow through.\n\nBeds are deep, the cellar is old, the clientele remember the Tethyrian succession first-hand, and the fire has been banked to exactly this height for thirty years. I should like all of that to still be true tomorrow.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Feldepost',
        text: "Well. Quietly, then: what will you have?",
        choices: [
          { text: 'The house\'s hospitality.', do: { shop: 'feldeposts-inn' }, goto: 'hub' },
          { text: 'A room, and no trouble. [gold]16 gp[/]', if: { gold: 16 }, do: { heal: { cost: 16, hours: 8 } }, goto: 'rested' },
          { text: 'Who drinks in a quiet house?', goto: 'clientele' },
          { text: 'Anything worth hearing? Quietly.', goto: 'news' },
          { text: 'Good evening to the house.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Feldepost',
        text: "The garden room. It faces away from the road, the Juggler, and the century.\n\nYou sleep in linen that smells of lavender and wake to a house so quiet you can hear the cellar settling. Somebody has cleaned your boots. Nobody mentions it.",
        goto: 'hub',
      },
      clientele: {
        speaker: 'Feldepost',
        text: "The retired.\n\nA faint dry warmth enters the voice, like one coal declaring itself.\n\nRetired merchants, retired soldiers, one retired archmage who does small wonders with the candle wax when she thinks I am not looking. People who spent forty years being interesting and have earned the other thing.\\p They talk more than anyone on the coast, my guests. They simply do it at a volume that requires you to have been invited.",
        goto: 'hub',
      },
      news: {
        speaker: 'Feldepost',
        rumor: true,
        text: "A quiet house hears everything. That is the economics of it: silence is expensive, and my guests pay for it in the only coin innkeepers take, which is talk.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Feldepost',
        text: "Mind the door as you go. It closes softly. \\p Everything here does.",
      },
    },
  },

  kithri: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kithri Greenbottle',
        text: "THE JUGGLER! Loud, cheap, and the board by the door is free to read!\n\nShe is halfling-high and taproom-wide in spirit, pouring four things at once, and the room behind her contains three musicians, a dice table, and at least one argument being enjoyed by all parties.\n\nKithri Greenbottle. I run the loud inn on purpose. Somebody has to — Feldepost cannot absorb all that quiet alone.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kithri Greenbottle',
        text: "So! Drink, bed, board, or the board? Those are different things and I am very fond of the joke.",
        choices: [
          { text: 'Show us the house.', do: { shop: 'jovial-juggler' }, goto: 'hub' },
          { text: 'Beds. If we can sleep through this. [gold]10 gp[/]', if: { gold: 10 }, do: { heal: { cost: 10, hours: 8 } }, goto: 'rested' },
          { text: 'What is on the hiring board?', goto: 'board' },
          { text: 'Watch the dice table with us.', goto: 'dice' },
          { text: 'Keep it loud, Kithri.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Kithri Greenbottle',
        text: "Top floor! The noise rises but it gets tired on the stairs.\n\nYou sleep, somehow, and wake to the specific silence of a loud room the morning after — swept floors, stacked stools, and a halfling counting a cashbox with the satisfaction of a general reviewing troops.",
        goto: 'hub',
      },
      board: {
        speaker: 'Kithri Greenbottle',
        text: "Anybody hiring pins a name; anybody for hire pins theirs. I take a copper a pin and I take down the liars, which is the actual service.\n\nShe nods at it — a door-side board dense with paper.\n\nThis tenday: the temple wants escorts north, a carter wants company to Nashkel and will not say why at this volume, and the Fist board in the city pays road-work if you can get through their gate. And swords drink here between engagements, so if you are short a blade, look at the corner tables and pick the one watching the door.",
        goto: 'hub',
      },
      dice: {
        speaker: 'Kithri Greenbottle',
        text: "House rules: the dice are mine, the table is mine, the stakes are yours, and I watch every throw like it owes me money.\n\nShe demonstrates the watching. It is formidable.\n\nNo game is crooked in the Juggler. Not out of virtue — out of craft. A crooked table earns for a season. A straight one earns for thirty years, and mine has.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kithri Greenbottle',
        text: "Off you go! And if you hear the third musician tonight, that is not ours, we only pay for two. He just comes.",
      },
    },
  },

  'marta-domine': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Marta Domine',
        text: "Burning Wizard. Drink what you can pay for and bleed outside.\n\nShe is leaning on a bar that has knife scars older than you, and she takes your measure the way a butcher takes a carcass's: professionally, and without malice.\n\nMarta Domine. It is the rough inn. Every town needs one, or the other three get interesting.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Marta Domine',
        text: "Well?",
        choices: [
          { text: 'Drinks, then.', do: { shop: 'burning-wizard' }, goto: 'hub' },
          { text: 'A bed, if the beds are safe. [gold]8 gp[/]', if: { gold: 8 }, do: { heal: { cost: 8, hours: 8 } }, goto: 'rested' },
          { text: 'Why "the Burning Wizard"?', goto: 'name' },
          { text: 'Black Network men drink here.', if: { faction: 'zhentarim', repMin: 3 }, goto: 'zhent' },
          { text: 'What does the rough room know?', goto: 'news' },
          { text: 'Keep the peace, Marta.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Marta Domine',
        text: "Safe as me. Which is to say: nothing in this house touches a paying sleeper, because I have made examples, and the examples took.\n\nYou sleep with your boots on out of habit and wake to find you needn't have. The bar downstairs is already open. It possibly never shut.",
        goto: 'hub',
      },
      name: {
        speaker: 'Marta Domine',
        text: "Before my time. A wizard burned — took a fireball to his own robe, right there where the dartboard is now, over a game gone wrong.\n\nShe pours herself one finger of something and does not drink it.\n\nDied? No. Walked to the temple smoking and lived forty more years, and drank here the whole time under his own sign, because he said any house honest enough to name itself after his worst evening deserved the custom.\\p That is the standard I keep. We are honest about what happens here. Nowhere else in Beregost can afford to be.",
        goto: 'hub',
      },
      zhent: {
        speaker: 'Marta Domine',
        text: "They do. Corner table, backs to the wall, coin always good.\n\nShe looks at you with new arithmetic.\n\nAnd you would know that because you have carried for them. Fine. I take their coin and their measure both, and here is the measure, free: the Network's road men are steady and their city men are not, and the ones moving through Beregost this season are city men.\\p Whatever they offer you south of here — count it twice.",
        do: { flag: 'zhent-city-men-warned' },
        goto: 'hub',
      },
      news: {
        speaker: 'Marta Domine',
        rumor: true,
        text: "The rough room hears what the quiet rooms pay to keep out. Most of it is worthless. I will pour you the rest.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Marta Domine',
        text: "Door's there. Use it walking.",
      },
    },
  },

  'evendur-buckman': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Evendur Buckman',
        text: "Now you look like folk heading south, and if you are heading south I will talk your ear off for nothing, because it is that or talk to the mules, and the mules have heard it.\n\nHe is leaning on a cart loaded with Beregost ironmongery, in no hurry at all.\n\nEvendur Buckman. Carter. Beregost to Nashkel, twice a tenday, nine years. \\p Daylight only, now. That is the story, and you did not even have to ask.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Evendur Buckman',
        text: "Go on, ask me the road. Ask me anything. The mules will thank you.",
        choices: [
          { text: 'Why daylight only?', goto: 'dark' },
          { text: 'What is Nashkel like?', goto: 'nashkel' },
          { text: 'What are you hauling?', goto: 'cargo' },
          { text: 'Safe roads, carter.', cancel: true, goto: 'bye' },
        ],
      },
      dark: {
        speaker: 'Evendur Buckman',
        text: "Because of the third milestone south, is why, and I will tell it in order because it only makes sense in order.\n\nHe settles against the cart. This is clearly the good story.\n\nWinter before last, coming north, dusk, third milestone — and the mules stop. Both of them, same instant, like a door shutting. And there is a man standing in the field. Too far to see his face, close enough to see he is facing us. And I call out, friendly like, and he does not move, and the mules are shaking — nine-year road mules, shaking — and then I look away to gentle them, one breath, and look back.\\p Closer. Not walking. Closer.\n\nI put the whip to the team for the first time in my life and I do not know how long he kept pace because I did not look again. Daylight only, now. The freight can wait and the freight agrees.",
        do: { flag: 'nashkel-road-dark' },
        goto: 'hub',
      },
      nashkel: {
        speaker: 'Evendur Buckman',
        text: "Amnish. First town over the border, and it is a border you cross by noticing the signs count in Amnish weights.\n\nMining town — iron, good iron, or it was. Mayor Ghastkill is a decent sort drowning in a bad year: the mine has been killing men since spring and Athkatla answers his letters with acknowledgements.\\p You can feel it in the inn of an evening. A mining town where the miners will not go down is a pot with the lid on.",
        goto: 'hub',
      },
      cargo: {
        speaker: 'Evendur Buckman',
        rumor: true,
        text: "Thunderhammer's ironmongery south, Amnish wine north, and gossip both directions at no extra charge. The wine travels worse than the gossip.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Evendur Buckman',
        text: "Daylight, remember. You can laugh, everyone laughs. The mules and I know what we know.",
      },
    },
  },

  thalantyr: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Thalantyr',
        text: "You have come up the path without being eaten. That is the interview passed.\n\nHe is precise in grey, in a hall where a conjuration circle is cut into the floor and two skeletons stand at the wall with garden shears, at rest.\n\nThalantyr. Conjurer. I sell to those who can pay and behave, and I have found over nine years that the second condition does more filtering than the first.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Thalantyr',
        text: "State your business. Browsing is business; I merely like it stated.",
        choices: [
          { text: 'Show us the shop.', do: { shop: 'high-hedge' }, goto: 'hub' },
          { text: 'You have work, we hear.', if: { questNot: 'thalantyrs-bargain' }, do: { quest: 'thalantyrs-bargain' }, goto: 'bargain' },
          { text: 'The four things, together, as asked.', if: { all: [{ quest: 'thalantyrs-bargain' }, { item: { id: 'gem-onyx', qty: 2 } }, { item: { id: 'diamond-dust', qty: 2 } }, { item: 'gem-jade' }] }, do: [{ take: { id: 'gem-onyx', qty: 2 } }, { take: { id: 'diamond-dust', qty: 2 } }, { take: 'gem-jade' }, { complete: 'thalantyrs-bargain' }, { flag: 'high-hedge-back-room' }], goto: 'bargain-done' },
          { text: 'Why the skeletons?', goto: 'skeletons' },
          { text: 'Good day, conjurer.', cancel: true, goto: 'bye' },
        ],
      },
      bargain: {
        speaker: 'Thalantyr',
        once: true,
        text: "I have a list. I will not have questions.\n\nHe recites it the way other men recite scripture, once, evenly.\n\nOnyx, two stones, taken out of a grave — taken, not bought, and do not clean them. Diamond dust, two measures, ground fine. One piece of jade with no flaw in it anywhere, and I will look, so you should look first. And two trolls dead within a day of the delivery — the same day, this matters, do not manage your time badly.\\p Bring all four together, to this table, at once. If you bring three I will thank you and shut the door. When you bring four, I open the back of the shop, and you will understand why I do not open it for coin.",
        goto: 'hub',
      },
      'bargain-done': {
        speaker: 'Thalantyr',
        text: "He examines each item in silence. The onyx, still dirty. The dust, sifted through his fingers over black cloth. The jade, held to the window for a very long minute.\n\nAnd the trolls are dead since — yes. I can smell the smoke on you. Good.\n\nHe sets all four in the circle, and for a moment — one moment — the cut lines in the floor hold light the way a channel holds water.\n\nNine years ago I sent something out of this world that had worn a friend of mine as a coat. The door I pushed it through does not stay shut for free. Now you know what the reagents are for and why I do not discuss it, and the back of the shop is open to you.\\p You have behaved. The stock there reflects my opinion of that, which is high, and my prices, which are unchanged.",
        goto: 'hub',
      },
      skeletons: {
        speaker: 'Thalantyr',
        text: "Gardeners.\n\nHe does not elaborate for a moment, then relents by one sentence.\n\nThey were both volunteers — men of my acquaintance who preferred the arrangement to the churchyard, in writing, witnessed. Osric does the roses. The other one, whose name I keep, does the hedge itself.\\p Kelddath disapproves at a distance we have negotiated to the yard. It is a very Beregost arrangement and it has held for nine years.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Thalantyr',
        text: "Down the path, and do not step off it. The hedge is not decorative. Nothing here is.",
      },
    },
  },

  // =========================================================================
  // 7. CANDLEKEEP
  // =========================================================================

  sariel: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sariel Amakiir',
        text: "The gate price is one book we do not hold. You may begin whenever you are ready.\n\nShe is a sun elf of the Avowed in a gatehouse of cold stone and warm lamplight, and she says it without unkindness, the way a mountain mentions its height.\n\nGreat Reader Sariel Amakiir. Sixty years on this gate. I have refused two kings, one archmage and a merchant of Athkatla who tried for eleven years, whom I rather miss.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Sariel Amakiir',
        text: "Speak. The gate has heard everything, but it has time.",
        choices: [
          { text: 'What does the gatehouse trade?', do: { shop: 'candlekeep-gatehouse' }, goto: 'hub' },
          { text: 'Name a book you do not hold.', if: { questNot: 'the-price-of-a-book' }, do: { quest: 'the-price-of-a-book' }, goto: 'price' },
          { text: 'The gate price. Out of Nashkel, out of the rock.', if: { all: [{ quest: 'the-price-of-a-book' }, { item: 'map' }] }, do: [{ take: 'map' }, { complete: 'the-price-of-a-book' }, { flag: 'candlekeep-gate-open' }, { rep: { id: 'harpers', amount: 4 } }], goto: 'price-done' },
          { text: 'Why one book? Why that price?', goto: 'why' },
          { text: 'Great Reader.', cancel: true, goto: 'bye' },
        ],
      },
      price: {
        speaker: 'Sariel Amakiir',
        once: true,
        text: "Most stand there and offer me gold, which is touching, like offering the sea a cup of water.\n\nBut you asked the correct question, so attend.\n\nThe Avowed hold three-quarters of a million works behind this wall. A book we do not hold is therefore not found in shops. It is found where writing goes to be lost — and I will tell you where one is, as a courtesy I extend perhaps twice a century.\\p The Amnish diggers at Nashkel stopped their deepest gallery over something they cut out of the living rock and refused to carry up. The reports call it a slab. The reports are wrong. Survey marks, in a graven hand, older than the mountain has any right to remember. It is written; we do not hold it; it qualifies.\n\nBring it, and Candlekeep opens. There is no second price and I am sixty years past being argued with.",
        goto: 'hub',
      },
      'price-done': {
        speaker: 'Sariel Amakiir',
        text: "She takes it in both hands. She reads. Sixty years of gatehouse stillness, and you watch it break — a fraction, at the eyes — over the space of eleven lines.\n\nThis is a survey of the Sword Coast. \\p The coastline is wrong. It is wrong in the way a coastline is wrong before the sea has finished with it. This was cut before —\n\nShe stops herself, with visible cost, and wraps the slab in silk with the reverence the Avowed usually reserve for First Reader Tethtoril's breakfast.\n\nThe price is paid. The gates of Candlekeep are open to you, now and hereafter — say your name at the wall and it will be known. And when the Avowed have argued about this stone for a decade, which we shall, your name will be in the argument's first footnote. That is immortality, in this house.",
        goto: 'hub',
      },
      why: {
        speaker: 'Sariel Amakiir',
        text: "Because gold buys what exists, and the library's whole purpose is to hold what might otherwise not.\n\nEvery hand that wants through this gate is a pair of eyes that has been somewhere the Avowed have not. The price conscripts you. Kings and beggars pay the same because the library does not care which of them found the book — only that it was found.\\p Alaundo's word stands over the gate: those who would tarry, first give freely of knowledge. Everything else about Candlekeep is architecture.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Sariel Amakiir',
        text: "The road is watched from the walls, for what comfort that is. It has never once been comfort to the walls.",
      },
    },
  },

  tethtoril: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Tethtoril',
        text: "Ah — company. Good. I came down to see who was arguing with Sariel, which is my chief exercise these days.\n\nHe is white-haired, plainly robed, and carries the second rank of the greatest library in the world the way other men carry a hat.\n\nTethtoril. First Reader. Which means I answer to the Keeper of the Tomes, and everything else in Candlekeep answers, eventually and with complaining, to me.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Tethtoril',
        text: "Sit, if the bench suits. The gatehouse is the only room in Candlekeep where conversation is not a discipline.",
        choices: [
          { text: 'What is it like inside the wall?', goto: 'inside' },
          { text: 'Any counsel for the road south?', goto: 'counsel' },
          { text: 'Is the gate price ever waived?', goto: 'waive' },
          { text: 'First Reader.', cancel: true, goto: 'bye' },
        ],
      },
      inside: {
        speaker: 'Tethtoril',
        text: "Quiet, in the way the inside of a bell is quiet.\n\nThree-quarters of a million works, and the Avowed moving among them like tide-pool creatures, each on his own errand of decades. We hold prophecies that named the hour of their own shelving. We hold a love letter that ended a kingdom, filed under Correspondence, Minor.\\p And every morning I walk the Emerald Door corridor and think: all of this, because people wrote things down and other people refused to let the writing die. It is the most optimistic building in Faerun. It is simply very stern about it.",
        goto: 'hub',
      },
      counsel: {
        speaker: 'Tethtoril',
        text: "For Nashkel? Read the miners, not the mayor. A mayor reports; a miner testifies.\n\nHe considers, turning something over.\n\nAnd more generally: you are walking a coast where every second stone remembers Netheril, and things that remember Netheril are waking this decade. When something old speaks to you — and on your road, something will — write down its exact words before you sleep. Memory rounds things toward sense. The exact words are the evidence.\\p You may tell Sariel I said the last part. It is her own rule. She will pretend not to be pleased.",
        do: { flag: 'tethtoril-counsel' },
        goto: 'hub',
      },
      waive: {
        speaker: 'Tethtoril',
        text: "Once, in my time.\n\nHe holds up a single finger.\n\nA girl of nine, on foot, alone, out of the Cloud Peaks, carrying her village's parish register out of a flood. She did not know the rule. She only knew the book should not die.\\p The Keeper of the Tomes came down to the gate himself — which he does not do — and ruled that the price had been paid in intent at compound interest. She is Avowed now. She catalogues floods.\n\nSo: yes, once. Do not plan around it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Tethtoril',
        text: "Go gently. And write things down — I say it to everyone, and I have never once regretted the repetition.",
      },
    },
  },

  'darvin-evenwood': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Darvin Evenwood',
        text: "Gatewarden. State your business at Candlekeep.\n\nHe is grey at the temples, planted in front of the great wall like a bollard, with a ledger chained to his belt.\n\nDarvin Evenwood. Forty men, one gate, one rule, and a list of everybody who has ever tried to get clever with the rule. It is a long list. I am on it twice.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Darvin Evenwood',
        text: "Anything else? The wall is not going anywhere. Neither am I. We are well matched.",
        choices: [
          { text: 'You are on your own list twice?', goto: 'list' },
          { text: 'What do people try, at the gate?', goto: 'tries' },
          { text: 'Anything moving on the coast road?', goto: 'news' },
          { text: 'Warden.', cancel: true, goto: 'bye' },
        ],
      },
      list: {
        speaker: 'Darvin Evenwood',
        text: "Twice.\n\nHe says it with the flat satisfaction of a man who has decided the story is a tool.\n\nNineteen, with a forged donation — a fair copy of a real chapbook with three pages of my own nonsense sewn in. The Reader at the gate found it in four minutes and read my nonsense aloud, slowly. Twenty-two, with somebody else's forgery, worse. The same Reader.\\p Then she offered me a post. She said a man who wanted in that badly would guard the door properly. Thirty years on, here I stand, and nobody has got past me with the tricks I invented, because I invented them.",
        goto: 'hub',
      },
      tries: {
        speaker: 'Darvin Evenwood',
        text: "Gold, first. Always gold, and the wall eats gold like rain.\n\nThen forgeries. Then titles — you would not believe the crowns that have stood where you are standing and been asked for a book like everybody else. Then the criers of emergency: the word is always 'urgent' and the answer is always the gatehouse scriptorium, where urgent things may be copied and handed in at the proper price.\\p Once, a dragon. In a scholar's shape, very good, nearly perfect. The Reader sold him paper and ink at the gatehouse and he wrote his own memoir in eleven days and paid with it. Best gate-price in a century, she says. He visits.",
        goto: 'hub',
      },
      news: {
        speaker: 'Darvin Evenwood',
        rumor: true,
        text: "The wall sees a long way. This tenday it has seen more southbound freight than northbound, gulls further inland than I like, and one light on the Nashkel hills that is not a shepherd.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Darvin Evenwood',
        text: "Mind the rule. It is the only one, which is why it holds.",
      },
    },
  },

  // =========================================================================
  // 8. NASHKEL
  // =========================================================================

  berrun: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Berrun Ghastkill',
        text: "Mayor Ghastkill. If you have come about the mine, say so first and save us both the pleasantries.\n\nHe is Amnian, sleeves rolled, at a desk that is one-third mayoral papers and two-thirds mining assays, all of them bad.\n\nAnd if you have come to buy: the store is honest, the prices are Amnish, and the assay scale is checked, which in this town this year is a sentence I have to say out loud.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Berrun Ghastkill',
        text: "Well? Trade, trouble, or the mine. Everything in Nashkel is one of the three.",
        choices: [
          { text: 'The store, then.', do: { shop: 'nashkel-store' }, goto: 'hub' },
          { text: 'Tell us about the mine.', goto: 'mine' },
          { text: 'What has Athkatla said?', goto: 'amn' },
          { text: 'Who would know what is down there?', goto: 'who' },
          { text: 'Good luck, Mayor.', cancel: true, goto: 'bye' },
        ],
      },
      mine: {
        speaker: 'Berrun Ghastkill',
        text: "Iron. Good iron, the best seam south of the Cloud Peaks, and the reason Nashkel exists.\n\nHe pushes an assay across the desk without being asked.\n\nSince the spring: four dead, eleven hurt, and the deep gallery shut by the miners themselves — not by me, by them, and Amnish miners do not walk off a paying seam. The ore that does come up is wrong. Brittle. Smiths send it back. And the men say the deep gallery is wet where it has no business being wet, and none of them will say the next sentence.\\p I am a mayor. I can tax, I can write letters, and I can stand at the shaft head looking useless. If you go down, go armed, and whatever you find — I want it in writing, because writing is the only weapon Athkatla respects.",
        do: { flag: 'nashkel-mine-briefed' },
        goto: 'hub',
      },
      amn: {
        speaker: 'Berrun Ghastkill',
        text: "Four letters. Four acknowledgements.\n\nHe recites from memory, in the voice of a man reading his own obituary.\n\n'The Council of Six notes the correspondence of the mayor of Nashkel.' Notes it. I have four notings, filed, and a mine that eats men, and the iron quota unchanged at the bottom of every noting in a clerk's beautiful hand.\\p Amn is my country and I love it, and it is a counting-house with a flag, and I have started writing to Beregost's temple instead, which is not my country and answers by return.",
        goto: 'hub',
      },
      who: {
        speaker: 'Berrun Ghastkill',
        text: "Orel Dotsk. Twelve years down the shafts, and the first man to refuse the deep gallery — before the deaths, mark you, before. The others followed him out.\n\nHe is at the inn most evenings, or outside it, being not inside the mine.\\p Buy him a drink and do not rush him. He does not enjoy the telling, and a man who does not enjoy the telling is the one worth hearing.",
        do: { flag: 'orel-pointed' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Berrun Ghastkill',
        text: "Mind the scale at the store is the checked one. It is the one thing in Nashkel I can still vouch for personally.",
      },
    },
  },

  vitiare: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Vitiare Calabra',
        text: "Nashkel Inn. Amnish beds, Amnish prices, and Amnish gossip at no charge.\n\nShe is polishing a glass she has plainly already polished, positioned exactly where every conversation in the room arrives eventually.\n\nVitiare Calabra. I hear everything that comes north over the mountains a day before the mayor does. The good rumours I sell. The true ones I give away — there is no market for them here anyway.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Vitiare Calabra',
        text: "So. Bed, bottle, or the news?",
        choices: [
          { text: 'The house, then.', do: { shop: 'nashkel-inn' }, goto: 'hub' },
          { text: 'A room. [gold]12 gp[/]', if: { gold: 12 }, do: { heal: { cost: 12, hours: 8 } }, goto: 'rested' },
          { text: 'Give us a true one, then.', goto: 'true' },
          { text: 'Sell us a good one. [gold]5 gp[/]', if: { gold: 5 }, do: { gold: -5 }, goto: 'good' },
          { text: 'Charming house, mistress Calabra.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Vitiare Calabra',
        text: "Second floor, mountain side. The shutters fit, which this close to the Cloud Peaks is the whole of hospitality.\n\nYou sleep well. Below you, half the night, the murmur of a town talking about one thing without ever quite saying it.",
        goto: 'hub',
      },
      true: {
        speaker: 'Vitiare Calabra',
        rumor: true,
        text: "Free, as promised: the miners are not afraid of the dark down there. They are afraid of the wet. Ask any of them and watch which word makes them stop talking.",
        goto: 'hub',
      },
      good: {
        speaker: 'Vitiare Calabra',
        text: "For five gold, the vintage stuff.\n\nShe leans in, entirely aware of her own theatre.\n\nThe Council of Six has a standing offer out through the trade houses: double weight for Nashkel iron, paid in Athkatla, no questions on quality. Now — why would Amn pay double for brittle ore, unless somebody in a counting house knows what is making it brittle and wants every scrap of the evidence brought south?\\p That one is true as well, by the way. I only guarantee the good ones are good. Sometimes the house over-delivers.",
        do: { flag: 'amn-iron-offer-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Vitiare Calabra',
        text: "Go gently. And whatever you hear in my taproom tonight — the price of the hearing was the room, so we are square.",
      },
    },
  },

  'orel-dotsk': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Orel Dotsk',
        text: "He is sitting outside the inn with his back to the mountain, which after a moment you understand is the point of the seat.\n\nOrel Dotsk. Twelve years down the Nashkel shafts.\\p Aye, I am the one who stopped. You can say it; everyone says it. The mayor sent you, or the look of you sent yourselves.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Orel Dotsk',
        text: "Ask it, then. I will tell it once, plain, for a drink I will not drink.",
        choices: [
          { text: 'Why did you stop going down?', goto: 'why' },
          { text: 'What should we expect, below?', goto: 'below' },
          { text: 'Would you go down again, ever?', goto: 'again' },
          { text: 'Keep your back to the mountain, then.', cancel: true, goto: 'bye' },
        ],
      },
      why: {
        speaker: 'Orel Dotsk',
        text: "The deep gallery. Before the deaths — I want that said, because they call me the man who saw it coming and I did not see, I heard.\n\nHe turns his tankard a quarter turn and leaves it.\n\nTwelve years down a mine, you know its water. Water drips. Water runs. Water has a clock in it. And in the deep gallery, in the spring, the water started — keeping time. Slower when we stopped to listen. Faster when we worked.\\p Water does not care whether you are listening. Whatever that was, it cared. I put my pick down with the seam two feet from my face and I walked up twelve years of ladders and I have not been wrong yet: everything that has happened since, happened past where I put the pick down.",
        do: { flag: 'orel-water-known' },
        goto: 'hub',
      },
      below: {
        speaker: 'Orel Dotsk',
        text: "Wet where the survey says dry. That first. Trust my survey — twelve years of it, chalked on the pit-head board, and it was right until spring.\n\nThe upper works are honest mine: props, rails, bad air in the third crosscut, nothing a lamp and sense will not manage. Past the deep gallery door, the survey stops being right. Galleries flooded that have no water table. And the men who died — they were not crushed, whatever the ledger says for the widows' sake.\\p They were found dry, in flooded galleries. You take that sentence down with you and you keep it where your courage keeps its accounts.",
        goto: 'hub',
      },
      again: {
        speaker: 'Orel Dotsk',
        text: "For no wage Amn can write.\n\nHe looks at the mountain, which is a thing he does the way other men check a locked door.\n\nBut if somebody went down — somebody armed, somebody who could make it answer for the four — I would stand at the pit head and work the cage for them myself, all day, all night, till they came up.\\p That is not nothing. The cage man is your rope home. Ask any miner which man they trust last and it is him.",
        do: { flag: 'orel-cage-offered' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Orel Dotsk',
        text: "Mind how you go. And below — if the water starts keeping time with you, stop working. That is all the wisdom I brought up and you may have it.",
      },
    },
  },

  // =========================================================================
  // 9. THE OUTER CITY — BLACKGATE, and the gate itself
  // =========================================================================

  'randal-whitburn': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Randal Whitburn',
        text: "Gate is shut to you. Writ or road, and the road runs north.\n\nHe stands square in the arch of the Black Dragon Gate with the black stone dragon over his head and three hundred miles of your walking behind you, and he does not move, because not moving is the whole of the job.\n\nSergeant Whitburn, Flaming Fist. Do not tell me how far you have come. Everyone in that queue has come as far, and half of them are children.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Randal Whitburn',
        text: "State it, whatever it is. The gate has heard it before.",
        choices: [
          { text: 'We carry the writ of entry.', if: { flag: 'bg-writ-of-entry' }, goto: 'writ' },
          { text: 'We have business inside. Important business.', if: { notFlag: 'bg-writ-of-entry' }, goto: 'business' },
          { text: 'What is the toll, then? Everyone has a toll.', if: { notFlag: 'bg-writ-of-entry' }, goto: 'toll' },
          { text: 'How does anyone get a writ?', if: { notFlag: 'bg-writ-of-entry' }, goto: 'how' },
          { text: 'You do not enjoy this post.', goto: 'enjoy' },
          { text: 'The road runs north. Fine.', cancel: true, goto: 'bye' },
        ],
      },
      writ: {
        speaker: 'Randal Whitburn',
        text: "He takes it. He reads it — actually reads it, all of it, and checks the seal against a ring he wears on a cord, and hands it back with something in his face going out like a lamp.\n\nMostana's hand. Real. \\p Right.\n\nHe steps aside, and the arch of the Black Dragon Gate is suddenly just a doorway, which after everything is somehow the strangest thing you have seen on this road.\n\nWelcome to Baldur's Gate. Keep your writ on your body, keep your coin inside your shirt, and keep clear of anything that calls itself a shortcut.\\p Go on. Before I remember the ordinance about parties over four.",
        choices: [
          { text: 'Through the gate, into the Wide.', do: { warp: { map: 'bg-the-wide', x: 28, y: 3, dir: 'down' } } },
          { text: 'A moment more out here first.', goto: 'hub' },
        ],
      },
      business: {
        speaker: 'Randal Whitburn',
        text: "Important business.\n\nHe repeats it with no inflection at all, which is worse than mockery.\n\nBehind you in that queue: a Sembian factor with a cargo bond worth more than my company's year, a priest of Ilmater with a dying man's letter, and a woman who has walked from Beregost with two children to reach a sister she has not seen in nine years. All of them have important business. All of them are standing in the mud.\\p The wall does not weigh business. It weighs paper. Get the paper.",
        goto: 'hub',
      },
      toll: {
        speaker: 'Randal Whitburn',
        text: "For a moment he says nothing, and you understand you have asked the one question that goes home.\n\nThere are gates in this city where coin does what paper should. Everyone knows it. Some nights I have known it with my own hand, and I am not proud of it, and I have stopped explaining it to people who have never held a Fist wage in a Fist winter.\\p Not this arch. Not to you, not tonight. The one thing I still own outright is that this gate is exactly what it says it is. Lieutenant Mostana is at the muster table in the yard. That is the door. There is no other door that I am, tonight, willing to be.",
        do: { flag: 'whitburn-toll-refused' },
        goto: 'hub',
      },
      how: {
        speaker: 'Randal Whitburn',
        text: "Lieutenant Yasheira Mostana. The trestle table by the muster post, west side of the yard, under the awning that has given up.\n\nShe issues the writs. She has read every forgery in the south and she does not take coin — which is not a compliment I hand out in this uniform, so mark it.\\p She takes favours. The Fist has work outside its own paper in these yards, and she trades in it. Go and be useful to her. It is the honest road in, and it is faster than the queue, and I never said that.",
        do: { flag: 'mostana-pointed' },
        goto: 'hub',
      },
      enjoy: {
        speaker: 'Randal Whitburn',
        text: "Enjoy.\n\nHe watches the queue for a moment instead of you.\n\nI held a shield wall at Elturel. I have walked the Coast Way escort eleven times. And the post I will be remembered for is the one where I stand in a stone doorway all day telling tired people no.\\p Somebody has to hold the wall's word. The city sleeps because the wall's word is good. I say that to myself every shift, and most shifts it is enough, and you have caught me on one of the others.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Randal Whitburn',
        text: "North, or the yards. And keep the children in that queue on your right as you pass — the pickpockets work the left.",
      },
    },
  },

  yasheira: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Yasheira Mostana',
        text: "Writs of entry. Name, business, and something the Fist wants more than your coin.\n\nShe is at a trestle table under a ruined awning, a Calishite officer with a stack of paper weighted down by a dagger, and she has looked up at you for exactly as long as it took to price your boots.\n\nLieutenant Mostana. Sit if you like. The stool is the one honest piece of furniture in this yard.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Yasheira Mostana',
        text: "Well? I have four hundred names in the book and the gate passes forty a day. Make your case interesting.",
        choices: [
          { text: 'We want the writ. Name the favour.', if: { all: [{ questNot: 'the-writ-of-entry' }, { notFlag: 'bg-writ-of-entry' }, { level: 11 }] }, do: { quest: 'the-writ-of-entry' }, goto: 'favour' },
          { text: 'The yards are clear. Write the writ.', if: { quest: 'the-writ-of-entry' }, do: [{ complete: 'the-writ-of-entry' }, { flag: 'bg-writ-of-entry' }, { rep: { id: 'lords-alliance', amount: 5 } }], goto: 'writ-done' },
          { text: 'Why favours and not coin?', goto: 'coin' },
          { text: 'What is the city like, inside?', if: { flag: 'bg-writ-of-entry' }, goto: 'inside' },
          { text: 'We will come back.', cancel: true, goto: 'bye' },
        ],
      },
      favour: {
        speaker: 'Yasheira Mostana',
        once: true,
        text: "Interesting enough.\n\nShe moves the dagger, pulls one sheet from the middle of the stack, and turns it to face you. It is a map of the caravan yards, with three of them circled.\n\nThree yards outside my own gate are paying protection. The crew collecting it works out of a wagon shelter on the north side — eight or nine street swords, and two men running them who used to wear this uniform, which is why, on paper, I am not permitted to touch them: former Fist are a Council matter, and the Council file is four years deep.\\p Off the books, then. Clear the yards. All of it, both of the old soldiers included — half-measures come back in a tenday wearing new faces.\n\nDo that, and the writ is written the same hour, in my hand, with the seal. That is the price and it does not move.",
        goto: 'hub',
      },
      'writ-done': {
        speaker: 'Yasheira Mostana',
        text: "Word reached the table before you did. Word always does — that is what a muster post is.\n\nShe writes. It takes a while, because she writes it properly: names, descriptions, the seal pressed twice.\n\nThe two old soldiers. I served with one of them, you should know that. He was good once, and then the wage stopped being enough and nobody above him cared, and that is the whole story of half the rot in this uniform.\n\nShe holds out the writ, and does not quite let go of it for a moment.\n\nThe city this opens is worth the walk — I believe that, or I would not guard it. But hear one thing: inside those walls, everyone is somebody's. The Fist, the Guild, the patriars, the temples. Decide early whose you are, or the city will decide for you, and its taste is terrible.\\p Sergeant Whitburn holds the arch. Show it, and watch what happens to his shoulders. That alone is worth the favour you did.",
        goto: 'hub',
      },
      coin: {
        speaker: 'Yasheira Mostana',
        text: "Because coin is how the last officer at this table left it, and he left it at a run, at night, short.\n\nShe squares the stack of paper with two taps.\n\nEvery forged writ in the south comes over this trestle eventually, and every forger prices in the bribe. When I stopped taking coin the forgers had to start being good, and good is expensive, and expensive is rare. I have simplified my own job.\\p And favours build the thing coin cannot: a yard full of people the Fist has actually helped. You will find that idea is not fashionable inside the walls. Out here it works.",
        goto: 'hub',
      },
      inside: {
        speaker: 'Yasheira Mostana',
        rumor: true,
        text: "Inside: the Wide for goods, the Counting House for coin, the Elfsong for sleep, and the High Hall for disappointment. And whatever you hear about the Guild — it is one-third true, and the third that is true, nobody says out loud.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Yasheira Mostana',
        text: "The table is here every day but Council days. Unlike the gate, I am reasonable.",
      },
    },
  },

  'gorstag-evenwood': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Gorstag Evenwood',
        text: "EVENWOOD'S YARD. Mounts, feed, axles — and no, I will not hold your cargo overnight for free, and I say that first because you would be the ninth today to ask.\n\nHe is big, loud, and moving the entire time he talks: a strap checked, a wheel kicked, a sack shifted.\n\nGorstag Evenwood. Last yard before the wall. Half the Trade Way sleeps in my pens on the way past, and the other half wishes it had.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Gorstag Evenwood',
        text: "Right, what do you need? Quickly — that ox is about to do something to that fence and only one of us can stop it.",
        choices: [
          { text: 'Show us the yard\'s stock.', do: { shop: 'blackgate-yard' }, goto: 'hub' },
          { text: 'What is the state of the yards?', goto: 'yards' },
          { text: 'Advice for the gate queue?', goto: 'queue' },
          { text: 'Mind the ox, then.', cancel: true, goto: 'bye' },
        ],
      },
      yards: {
        speaker: 'Gorstag Evenwood',
        text: "Busy and frightened, which is a bad mix in a yard.\n\nHe lowers the volume by perhaps a tenth, which for him is a whisper.\n\nThere is a crew working the north shelters — collection, they call it. Insurance. Three yards pay. I do not, because I ship for two patriar houses and their names are my fence — but the little yards have no names to hide behind, and the Fist's hands are tied with their own paper.\\p The lieutenant at the muster table knows every knot in that rope. If you are the sort that unties things, talk to her.",
        do: { flag: 'blackgate-crew-known' },
        goto: 'hub',
      },
      queue: {
        speaker: 'Gorstag Evenwood',
        text: "Get out of it. That is the advice.\n\nThe queue is for people with papers coming, cargo manifests, family sending for them. Standing in it hoping is two days of mud and a no. Either get the lieutenant's writ the honest way, or turn around and live in the Outer City like fifty thousand other people the wall said no to.\\p And feed your animals before the gate, not after. Prices double under the arch. That one is free because it offends me professionally.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Gorstag Evenwood',
        text: "Mind the pens as you go — the brown ox is a thief and the grey one is his lookout, AND THEY KNOW I KNOW.",
      },
    },
  },

  ovak: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ovak',
        text: "She is leaning on the pen rail with the oxen, and it takes you a moment to see she is minding them the way other people mind children — by standing where they can see her.\n\nOvak. Drover.\\p The oxen are mine to walk, not mine to own. Same as the road.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ovak',
        text: "Slow day. Ask, if you are asking.",
        choices: [
          { text: 'Nineteen years, and only twice through the gate?', goto: 'gate' },
          { text: 'What do the oxen make of the city?', goto: 'oxen' },
          { text: 'Seen anything odd in the yards?', goto: 'odd' },
          { text: 'Walk easy, drover.', cancel: true, goto: 'bye' },
        ],
      },
      gate: {
        speaker: 'Ovak',
        text: "Twice.\n\nShe holds up two fingers, unhurried.\n\nOnce for a funeral. Once because a factor needed the team taken to the Wide itself, and it took four permits and a Fist escort, and the whole way in, people looked at me like I was the animal that had got loose.\\p Out here, I am Ovak who walks the teams. In there, I am a half-orc. The wall does more than one kind of keeping out. I stopped minding, and then I stopped pretending I stopped minding, and now I just stay out here where the work is honest and the looking is less.",
        goto: 'hub',
      },
      oxen: {
        speaker: 'Ovak',
        text: "They hate the last mile. Every team, every time, right where the road smells the wall.\n\nShe scratches the brown ox between the horns without looking at it.\n\nAn ox reads a place by what it did to the last thousand oxen. That is all memory is, for them. And the last mile before the Black Dragon Gate is three hundred years of teams standing in the mud being afraid while men shouted.\\p The ground remembers it for them. I walk them wide of the queue and they settle. Nobody ever asks me why I take the long line. Now somebody has.",
        goto: 'hub',
      },
      odd: {
        speaker: 'Ovak',
        rumor: true,
        text: "The collection crew counts wagons in the evening. Men who count other people's wagons at dusk are not doing sums for joy.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ovak',
        text: "Road luck. Walk them slow at the end — everything at the end of a road deserves slow.",
      },
    },
  },

  stedd: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Stedd Greycastle',
        text: "There is soup. There is always soup. Sit down while you argue with them.\n\nHe is ladling out of a cauldron on a handcart at the edge of the gate queue, brown-robed, flour on his sleeves, entirely unbothered by the Fist sentry pretending not to watch him.\n\nBrother Stedd. Chauntea's. The Grain Mother does not require a permit, and I have stopped applying for one — it was making the clerks unhappy and the soup cold.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Stedd Greycastle',
        text: "Soup, talk, or both. The queue takes all three.",
        choices: [
          { text: 'Soup, then. Gladly.', do: [{ heal: { cost: 0, hours: 1 } }, { flag: 'stedd-soup' }], goto: 'soup' },
          { text: 'Who feeds all this? Who pays?', goto: 'pays' },
          { text: 'What should we know about the gate?', goto: 'gate' },
          { text: 'Bless the cauldron, brother.', cancel: true, goto: 'bye' },
        ],
      },
      soup: {
        speaker: 'Stedd Greycastle',
        text: "Barley, roots, and a hen who had opinions. Eat.\n\nIt is good — properly good, better than the last three inns — and he watches you discover that with the quiet vanity of a man whose one worldly pride is exactly this.\n\nChauntea's arithmetic: the queue is two hundred long, the cauldron feeds two hundred and ten, and the ten spare are for the Fist lads at the arch, who are not permitted to accept them and have worked out eleven ways to accept them anyway.",
        goto: 'hub',
      },
      pays: {
        speaker: 'Stedd Greycastle',
        text: "The farms of Rivington, mostly — Arveene Tallstag sends what she calls spoilage, and her spoilage is better than most harvests. Olga Stormwind in Sow's Foot and I split the days so the queue eats at noon and the district eats at dusk.\n\nHe refills the ladle.\n\nNobody organised this. That is the thing about the Outer City nobody inside the wall believes: fifty thousand people the city refuses to govern, and they have governed themselves into soup rotas. Meanwhile the Parliament of Peers has debated the queue four times and produced a report.\\p I have read the report. It is not nourishing.",
        do: { flag: 'outer-city-rota-known' },
        goto: 'hub',
      },
      gate: {
        speaker: 'Stedd Greycastle',
        text: "Sergeant Whitburn holds it, and be gentle with him — he is the most hated man on this road and the most honest one in that uniform, and being both is grinding him like a millstone.\n\nThe writ comes from Lieutenant Mostana at the muster table, for a favour. Do it if you can. Every crew she clears out of these yards is a tenday of the queue being robbed less.\\p And the queue itself: mind the left side, give your name to nobody who asks for it smiling, and if a child offers to hold your place, pay them, they are the only honest brokers out here.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Stedd Greycastle',
        text: "Go fed. That is the whole blessing. It is Chauntea's favourite and it is the only one I am licensed for.",
      },
    },
  },

  'blackgate-ox': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'The Yard Ox',
        text: "Eleven hundredweight of ox regards you across the pen rail. The regard is total. The interest is not.\n\nA jaw the size of a bread oven works a mouthful of feed with the patience of geology.",
        choices: [
          { text: 'Offer a handful of feed.', goto: 'feed' },
          { text: 'Scratch between the horns.', goto: 'scratch' },
          { text: 'Withdraw with dignity.', cancel: true, goto: 'bye' },
        ],
      },
      feed: {
        speaker: 'The Yard Ox',
        text: "The feed is accepted. Your hand is inspected afterwards at length, in case it was concealing further feed.\n\nFrom across the yard, Ovak, without turning round: \"Now you are on the list. The list is long and they forget nothing.\"",
        do: { flag: 'blackgate-ox-friend' },
        goto: 'start',
      },
      scratch: {
        speaker: 'The Yard Ox',
        text: "The great head tips one degree into your hand — eleven hundredweight redistributed with the precision of a jeweller.\n\nThe chewing does not stop. The chewing has never stopped. Somewhere in that vast machinery, you suspect, something approves of you.",
        goto: 'start',
      },
      bye: {
        speaker: 'The Yard Ox',
        text: "The ox watches you go for exactly as long as you might still produce feed, and not one heartbeat longer.",
      },
    },
  },

  // =========================================================================
  // 10. NORCHAPEL
  // =========================================================================

  natali: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Natali Shemov',
        text: "Mind the bucket. The bucket is doing important work.\n\nShe is on the chapel steps under a line of washing, and the bucket in question is catching a thin silver thread of water from somewhere in the roof of what was, once, a house of Ilmater.\n\nNatali Shemov. Top floor. Nine families in this building and one stair, and the stair answers to me, because somebody had to be the stair's person and I stood still too long.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Natali Shemov',
        text: "Well, you are not from the district — the district does not stand that straight. What do you want with Norchapel?",
        choices: [
          { text: 'This was a chapel?', goto: 'chapel' },
          { text: 'Who owns these buildings?', goto: 'owns' },
          { text: 'What is the news out here?', goto: 'news' },
          { text: 'Good luck with the roof.', cancel: true, goto: 'bye' },
        ],
      },
      chapel: {
        speaker: 'Natali Shemov',
        text: "Ilmater's, before my mother's time. When the order moved inside the walls they sold the building, and the buyer put in floors, and the floors filled up with us.\n\nShe nods upward.\n\nThe roof leaks over the old altar step exactly, which the grandmothers say is the Broken God still doing his work — taking the suffering on himself, one drip at a time. I say it is the flashing. \\p We are both right. That is how it goes in Norchapel: the flashing fails, and the failing means something, and you fix the flashing anyway.",
        goto: 'hub',
      },
      owns: {
        speaker: 'Natali Shemov',
        text: "A patriar house, through a factor, through a rent-taker, through a man called Osgur who actually climbs the stair on the first of the tenday.\n\nEach layer knows less about the building than the one below it, and the coin goes up through all four like water going the wrong way.\\p We asked the factor for the roof three years running. This year we fixed it ourselves and shorted the rent by the cost, itemised, in writing. Nothing happened. That silence is the only mercy the Upper City has ever shown this district, and I do not think it was on purpose.",
        do: { flag: 'norchapel-rent-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Natali Shemov',
        rumor: true,
        text: "Nine families on one stair. I hear everything in this district twice — once as it happened and once as it improved in the telling.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Natali Shemov',
        text: "Mind the bucket going out. It has seniority.",
      },
    },
  },

  'luth-lackman': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Luth Lackman',
        text: "Whoa there — customers? Guests? Either way, gently through the door, the congregation spooks.\n\nInside what was plainly a chapel nave there are sixteen horses in neat rope stalls, and the light through the old windows falls on them in colours.\n\nLuth Lackman. Hostler. And before you say anything: the building was deconsecrated, I have the paper, I laminated the paper in wax, do not look at me like that.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Luth Lackman',
        text: "So! Stabling, or curiosity? I get a lot of the second and it pays nothing.",
        choices: [
          { text: 'Horses. In a chapel.', goto: 'why' },
          { text: 'Does anyone object?', goto: 'object' },
          { text: 'Heard anything in the district?', goto: 'news' },
          { text: 'Mind the congregation, then.', cancel: true, goto: 'bye' },
        ],
      },
      why: {
        speaker: 'Luth Lackman',
        text: "Acoustics.\n\nHe says it with the confidence of a man who has tested it and the shiftiness of a man who has never told the whole answer.\n\nA nave settles horses. I do not know why. The vet does not know why. Sixteen animals that would kick a plank barn to matchwood stand in here like — well. Like church.\\p Also the rent was nothing, because nobody in Norchapel wants to live in a former chapel, on account of the drip. But mostly the acoustics. Put that first if you tell it.",
        goto: 'hub',
      },
      object: {
        speaker: 'Luth Lackman',
        text: "The Ilmatari at the Shrine of the Suffering, inside the walls — they have never been told, and I would take it as a personal kindness if that continued.\n\nHe glances at the door, entirely without guilt and entirely like a man checking for guilt's arrival.\n\nBrother Anton is a good man, they say. The genuinely good ones are the worst to be caught by. A greedy man you can pay off. A good one just looks at you.\\p Anyway. The horses are happy, the roof is mended — only building in Norchapel where it is, note — and if the Broken God wanted the nave empty he has had six years to say so.",
        do: { flag: 'norchapel-stable-secret' },
        goto: 'hub',
      },
      news: {
        speaker: 'Luth Lackman',
        rumor: true,
        text: "Grooms talk, carters talk, and everything either of them says gets said in here where the acoustics are good. I could sell what this nave hears. I do not. Mostly.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Luth Lackman',
        text: "Out gently! And if a priest asks you what is in the old chapel — hay. Say hay. It is even true, there is loads of hay.",
      },
    },
  },

  'norchapel-dog': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Chapel',
        text: "Half a wolfhound is asleep on the chancel step, in the one patch of coloured light, with the deep commitment of a creature who has personally surveyed every sleeping surface in the district and made his findings known.\n\nOne ear rotates toward you. The rest of the dog declines to be involved.",
        choices: [
          { text: 'Let him sleep.', cancel: true, goto: 'bye' },
          { text: 'Crouch and offer a hand.', goto: 'hand' },
          { text: 'Ask Luth about him.', goto: 'story' },
        ],
      },
      hand: {
        speaker: 'Chapel',
        text: "The ear completes its assessment. Gravely, without lifting his head, he extends one enormous paw and places it in your palm.\n\nIt is not a trick. It is clearly a formality — some ancient treaty between dogs and strangers, honoured on his side with full ceremony and half a snore.",
        do: { flag: 'chapel-dog-friend' },
        goto: 'start',
      },
      story: {
        speaker: 'Chapel',
        text: "Luth, from a stall, without stopping his work:\n\n\"Came with the building. No — listen, that is the truth. First morning, unlocked the door, and there he was on that step like the last parishioner. Vet says he is maybe eleven. The building was shut nine years.\"\n\nA pause, in which nobody does the arithmetic out loud.\n\n\"He is a good dog and we do not ask him questions.\"",
        goto: 'start',
      },
      bye: {
        speaker: 'Chapel',
        text: "He sighs the sigh of a very large dog — a sound like a cellar door — and resettles into the coloured light.",
      },
    },
  },

  // =========================================================================
  // 11. LITTLE CALIMSHAN
  // =========================================================================

  zasheida: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Zasheida Pashar',
        text: "Come under the awning, the sun is a Baldurian and hates us both. Now. What do you need?\n\nShe is enthroned on a cushioned stool amid a stall that is really nine stalls, and a boy is already bringing you tea you did not ask for and will not be charged for. Probably.\n\nZasheida Pashar. Fourth generation out of Calimport. The bazaar is mine the way the tide is the moon's — no paper says so, and watch it happen anyway.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Zasheida Pashar',
        text: "Drink the tea. Nothing is decided until the tea is finished; this is not manners, it is procedure, and it has saved a thousand bargains.",
        choices: [
          { text: 'Show us the bazaar\'s best.', do: { shop: 'little-calimshan-bazaar' }, goto: 'hub' },
          { text: 'How does an enclave thrive out here?', goto: 'enclave' },
          { text: 'We need things the Fist would frown at.', if: { any: [{ flag: 'bg-guild-known' }, { faction: 'zhentarim', repMin: 3 }] }, goto: 'quiet' },
          { text: 'What does the bazaar hear?', goto: 'news' },
          { text: 'The tea was excellent. Good day.', cancel: true, goto: 'bye' },
        ],
      },
      enclave: {
        speaker: 'Zasheida Pashar',
        text: "By being better, dear. It is the only door they left us.\n\nShe gestures at the awnings, the spice pyramids, the shade that the rest of the Outer City does not have.\n\nMy great-grandmother came up from Memnon with a spice chest and slept on it for two years. The city would not let Calishites inside the walls except as servants — so we built our own walls out of awnings, and now their patriars send their cooks OUT here, to US, because the Wide sells them dust and calls it saffron.\\p Hospitality first, always. Then commerce, conducted like war. Then hospitality again, so nobody leaves bleeding where the customers can see. It is the Calimshan method and it has never once failed.",
        goto: 'hub',
      },
      quiet: {
        speaker: 'Zasheida Pashar',
        text: "The smile does not change by one degree, and the temperature under the awning drops anyway.\n\nSo. You know people, or people know you. Either way the tea is finished.\n\nShe produces, from nowhere, a small flat case lined in silk.\n\nCertain botanicals. Certain oils. Priced for professionals, sold with one rule that has no exceptions: nothing from this case is used inside the enclave. My streets, my rule. The Guild honours it; the Guild's mother honoured it to my mother.\\p Ask at the stall for the second inventory, and mind the rule. Everyone minds the rule eventually. Some merely mind it late.",
        do: { flag: 'zasheida-second-inventory' },
        goto: 'hub',
      },
      news: {
        speaker: 'Zasheida Pashar',
        rumor: true,
        text: "A bazaar is a listening instrument, dear — forty stalls, one ear. This tenday it hears more Fist boots than usual and fewer Fist purchases, which any Calishite will tell you is the sound of trouble being planned on an empty stomach.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Zasheida Pashar',
        text: "Go in shade where you find it. And come back — everyone comes back. The tea sees to it.",
      },
    },
  },

  khemed: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Khemed Rein',
        text: "Sit. Coffee first, business after. That is not manners, it is procedure.\n\nThe house is low and cool, lined with cushions and copper, and it smells like the inside of a very good idea. He pours from an arm's height without spilling a drop.\n\nKhemed Rein. Eleven years, this room. Everything Little Calimshan has said over a small cup, I have heard, and the cups are very small, so people order many, and say much.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Khemed Rein',
        text: "Now. The cup is in your hand, so we may speak of anything.",
        choices: [
          { text: 'A quiet corner for the night. [gold]6 gp[/]', if: { gold: 6 }, do: { heal: { cost: 6, hours: 8 } }, goto: 'rested' },
          { text: 'What is the other stock?', goto: 'stock' },
          { text: 'What has the room heard lately?', goto: 'news' },
          { text: 'The coffee alone was worth the walk.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Khemed Rein',
        text: "The alcove behind the curtain — cushions, quiet, and the smell of tomorrow's roast beginning around the fourth hour, which is a better dawn bell than any temple's.\n\nYou sleep in warmth and wake sharp. The city can be heard from here, faintly, being a city. In this room it seems a manageable thing.",
        goto: 'hub',
      },
      stock: {
        speaker: 'Khemed Rein',
        text: "Ah. You have heard the saying. 'The coffee is very good; the other stock is better.'\n\nHe settles, pleased, like a man asked to play his instrument.\n\nThe other stock is this: who is buying, who is selling, who is lying about which. Not secrets — I do not deal in secrets, secrets get people folded into carpets — patterns. The pattern is always for sale and never written down.\\p For instance, and freely, as a sample: the Basilisk Gate toll rose twice this year, and Calishite freight now goes around it by three routes, and only two of the three are mine to know. Somebody has built a third. Somebody ambitious. The pattern says you will meet them before I do.",
        do: { flag: 'khemed-pattern-sample' },
        goto: 'hub',
      },
      news: {
        speaker: 'Khemed Rein',
        rumor: true,
        text: "Eleven years of small cups. Ask me anything except who told me, and drink slowly — the news improves with the coffee and the coffee is improving all the time.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Khemed Rein',
        text: "Go well. The cup will be washed and the seat will be kept. That is the whole of a coffee house, and it is enough.",
      },
    },
  },

  atala: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Atala Basha',
        text: "Sit on the bench. Whatever it is, it is quicker sitting.\n\nShe is at a low bench beneath the dome that shelters two altars — Ilmater's plain one and Sharess's gilded one — with clean linen, a basin, and hands that have seen everything.\n\nSister Atala. The Broken God takes the pain and the Dancing Lady takes the joy, and between the two of them this bench sees the whole of a person. The theologians hate it here. The district does not.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Atala Basha',
        text: "Hurts, or questions? I take both, in that order of importance.",
        choices: [
          { text: 'We need tending. Do what you can.', do: { heal: { cost: 5, hours: 1 } }, goto: 'tended' },
          { text: 'Two gods, one shrine. How?', goto: 'gods' },
          { text: 'What does the bench see, lately?', goto: 'news' },
          { text: 'Peace to the bench, sister.', cancel: true, goto: 'bye' },
        ],
      },
      tended: {
        speaker: 'Atala Basha',
        text: "She works without hurry and without waste — a wash, a binding, a murmured line of Ilmatari that feels like setting down a weight you had stopped noticing.\n\nFive silver if you have it, nothing if you do not, and you look like you have it, so it is five.\n\nShe repacks the linen precisely.\n\nDo not thank me too much. It sours the work. Thank me by walking better than you walked in.",
        goto: 'hub',
      },
      gods: {
        speaker: 'Atala Basha',
        text: "Because a dockworker with a crushed hand and a broken heart is one person, not two cases.\n\nShe says it as settled fact, long past arguing.\n\nIlmater takes what cannot be borne. Sharess reminds you why bearing it was worth it. The temples inside the walls keep them streets apart and send each other letters about doctrine. Out here we have one dome and one bench and no time, and under this dome the two of them get along the way the poor have always known they do.\\p A priest came from Twin Songs once to explain the error to me. He stayed three days and left a donation to both boxes. That is my theology, complete.",
        goto: 'hub',
      },
      news: {
        speaker: 'Atala Basha',
        rumor: true,
        text: "The bench sees the district's true ledger — what work is breaking which bodies. This season: more dock injuries and fewer dock wages, which arithmetic someone at the harbour should be made to explain.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Atala Basha',
        text: "Go. And if you break — come back before you finish breaking. Earlier is always cheaper, on this bench.",
      },
    },
  },

  haseid: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Haseid Dumein',
        text: "You have been looking for a moment before you found me, and I was not hiding. Note that.\n\nHe is seated in shade with tea, utterly still in a district that never stops moving, and his stillness is not idleness — it is a blade in a sheath.\n\nHaseid Dumein. Of the quiet trade. I move things past tolls, and I have never once hurried, and I have never once been caught, and those are the same fact stated twice.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Haseid Dumein',
        text: "Sit, if you like. Stillness is free and almost nobody takes any.",
        choices: [
          { text: 'The quiet trade. Smuggling.', goto: 'trade' },
          { text: 'Where did the discipline come from?', goto: 'monk' },
          { text: 'Walk with us. We move loudly through interesting places.', goto: 'join' },
          { text: 'What passes the gates that should not?', goto: 'news' },
          { text: 'Sit well, then.', cancel: true, goto: 'bye' },
        ],
      },
      trade: {
        speaker: 'Haseid Dumein',
        text: "Smuggling is a crude word for a precise thing.\n\nHe turns his glass one quarter, aligning it with nothing you can see.\n\nThe Basilisk Gate toll is a wall made of attention. Attention has a shape: it watches wagons, not water; evenings, not the hour before dawn; the strong box, never the feed sack. My family has mapped that shape for four generations the way sailors map a reef.\\p I carry spice, silk, letters, and once — once — a person. Nothing that bleeds the district. The Fist would call it crime. The enclave calls it the door tax coming home. Both are right, and only one of them built the wall.",
        goto: 'hub',
      },
      monk: {
        speaker: 'Haseid Dumein',
        text: "A Shou master wintered here when I was fourteen — snowbound, out of coin, proud. My mother fed him for a season and refused his thanks.\n\nSo he paid in the only coin he had. Every dawn, in the yard behind the coffee house: stillness, breath, the shadow forms. He said the body is a rumour and the master learns to start better rumours.\\p Four winters he came back. Then he did not. Everything I am in the dark, an old man taught me in daylight, for soup. The Guild thinks it owns my hands. It rents them. The forms are not for rent.",
        do: { flag: 'haseid-master-known' },
        goto: 'hub',
      },
      join: {
        speaker: 'Haseid Dumein',
        text: "Loudly. Yes. I have heard you coming for three streets, all four of you.\n\nSomething that is nearly a smile.\n\nInteresting places, though — that part is true, and the quiet trade has grown small for me. Two hundred and sixty gold. It clears my standing contracts with the Guild honourably, and honourably is the only way to leave a table you may sit at again.",
        choices: [
          { text: 'Walk with us. [gold]260 gp[/]', if: { gold: 260 }, do: [{ recruit: 'haseid-dumein' }, { flag: 'haseid-joined' }], goto: 'joined' },
          { text: 'Another day, perhaps.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Haseid Dumein',
        text: "He finishes the tea, sets the glass down without a sound, and is standing without ever visibly having stood.\n\nOne term. When the day comes that stealth would save us and you choose noise anyway — and with you it will come — I follow your noise. I merely reserve the right to be silent about it afterwards, at length.",
        goto: 'hub',
      },
      news: {
        speaker: 'Haseid Dumein',
        rumor: true,
        text: "This season the gates leak in a new place, and it is not one of mine, and whoever cut it pays the Guild nothing. That much confidence is either a fool or a patron, and no fool cuts that clean.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Haseid Dumein',
        text: "Go. And practice arriving before your footsteps. It can be done. I have seen it done.",
      },
    },
  },

  meilil: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Meilil Khalid',
        text: "Water! Clean cup! One copper!\n\nShe is nine, quick as a swift, with a jar on her hip and a cup polished to parade standard.\n\nThe cup is clean because my mother checks. You can check too. People check. I do not mind, checking is free.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Meilil Khalid',
        text: "Water, or directions? Directions are also one copper. Everything is one copper, it keeps the sums easy.",
        choices: [
          { text: 'Water for the party. [gold]1 gp[/]', if: { gold: 1 }, do: [{ gold: -1 }, { flag: 'meilil-customer' }], goto: 'water' },
          { text: 'Directions, then. What should we see?', goto: 'directions' },
          { text: 'What do you hear, running the alleys?', goto: 'news' },
          { text: 'Mind the cup, water-seller.', cancel: true, goto: 'bye' },
        ],
      },
      water: {
        speaker: 'Meilil Khalid',
        text: "A whole gold piece. She looks at it, then at you, then executes the fastest transaction of your life and produces change in coppers from four different pockets, counted twice, exact.\n\nThe water is cool and tastes of clean jar and enormous professional pride.\n\nMy mother says never keep the extra, because the extra is how they get you to owe them. I do not know who they are yet. I am keeping a list.",
        goto: 'hub',
      },
      directions: {
        speaker: 'Meilil Khalid',
        text: "Zasheida's for anything you can hold. Khemed's for coffee — tell him Meilil sent you, he gives me nothing for it but he makes a face, the face is worth it.\n\nShe counts off on her fingers at speed.\n\nThe bench under the dome if you are hurt. The bazaar's third alley NEVER after dark, not because of robbers, because of the dye vats, you fall in one and you are purple for a season. Hamid fell in. We still call him Hamid the Evening.\\p That one is free. Hamid pays me a copper a tenday NOT to tell it, but he is behind on the account.",
        goto: 'hub',
      },
      news: {
        speaker: 'Meilil Khalid',
        rumor: true,
        text: "I run every alley in the enclave and everyone talks over the top of me like I am weather. I am not weather. One copper.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Meilil Khalid',
        text: "Water! Clean cup! — that was not for you, you are done, that was for the man behind you. He looks thirsty. I am never wrong.",
      },
    },
  },

  // =========================================================================
  // 12. TUMBLEDOWN
  // =========================================================================

  kosef: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kosef Shemov',
        text: "Warden Shemov. Holy water, oil, shovels. Do not ask about the third trestle.\n\nHe is grey-cloaked among the graves, with a ledger chained to his belt and three trestle tables of goods, and the third one is covered with a cloth.\n\nKelemvor's warden of Tumbledown, which means: I dig, I count, and I sell what the work requires. The Lord of the Dead asks order of me, not poverty. The order is the hard part this season.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kosef Shemov',
        text: "Speak your business. The residents are patient and I have learned it from them.",
        choices: [
          { text: 'Show us the trestles. All three.', do: { shop: 'tumbledown-warden' }, goto: 'hub' },
          { text: 'Your ledger is wrong, we hear.', if: { questNot: 'the-tumbledown-count' }, do: { quest: 'the-tumbledown-count' }, goto: 'count' },
          { text: 'The count is reconciled. Here are the tokens.', if: { all: [{ quest: 'the-tumbledown-count' }, { item: { id: 'gem-onyx', qty: 3 } }] }, do: [{ take: { id: 'gem-onyx', qty: 3 } }, { complete: 'the-tumbledown-count' }, { rep: { id: 'gauntlet', amount: 3 } }], goto: 'count-done' },
          { text: 'What is Tumbledown, exactly?', goto: 'district' },
          { text: 'Keep the count, warden.', cancel: true, goto: 'bye' },
        ],
      },
      count: {
        speaker: 'Kosef Shemov',
        once: true,
        text: "He unchains the ledger and opens it to a page marked with a grey ribbon.\n\nThe book says I have buried three more people than I have graves for. I have walked the rows twice. I have counted three times. The dead I put down are all where I put them — and the ledger is still three long, because three burials happened in my ground, at night, that I did not perform.\n\nSomebody is putting people into my rows without rites and without record. And things have begun to move in the crypts below that were at rest a season ago, because an unquiet burial is a knock on every door in the row.\\p Go down the crypt stair and reconcile my book. Whatever was buried wrong, find it. Whatever it woke, quiet it. And bring me the grave-tokens — the dead hold onyx under the tongue in this city, and the ones the snatchers robbed will want theirs spoken over and returned.",
        goto: 'hub',
      },
      'count-done': {
        speaker: 'Kosef Shemov',
        text: "He takes the three tokens and holds them a moment in a closed hand, and says over them nine words in the Kelemvorite low tone, which do not translate and do not need to.\n\nThen he opens the ledger and makes three corrections in red, slowly, with the whole of his attention.\n\nReconciled.\n\nThe chain goes back on the book.\n\nYou have done grave-work and crypt-work and asked no questions about the third trestle, and that is the conduct of professionals. Kelemvor's regard is not warm, but it is permanent, and you have it. So does the district's, which is warmer and eats more.",
        goto: 'hub',
      },
      district: {
        speaker: 'Kosef Shemov',
        text: "The city's memory, kept outside the city's walls, which tells you most of what you need to know about the city.\n\nEvery Baldurian who cannot afford a Temples District tomb comes through the Cliffgate feet first and joins Tumbledown. Mausolea for the almost-rich, rows for the rest, and below it all the old crypts, cut galleries going back four hundred years.\\p The living here are caretakers, carters, stone-cutters and mourners who stayed. It is the quietest district of Baldur's Gate and the only one where nobody has ever asked me for protection money. The dead are good neighbours. I have had both kinds.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kosef Shemov',
        text: "Walk the rows with your feet where feet go. The residents mind manners more than mourning.",
      },
    },
  },

  navarra: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Navarra Dyernina',
        text: "Kelemvor's house. The dead are counted here and so, eventually, are you.\n\nShe says it the way a ferrywoman names the far bank — no threat in it, only geography. She is Rashemi, grey-veiled, standing at a small altar among the mausolea.\n\nSister Navarra. I read the rites over the city's poor for nothing and over its patriars for a great deal, and I consider the arrangement a form of tithing.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Navarra Dyernina',
        text: "What does the living party require of the dead's house?",
        choices: [
          { text: 'Tend our wounds, sister. [gold]25 gp[/]', if: { gold: 25 }, do: { heal: { cost: 25, hours: 1 } }, goto: 'tended' },
          { text: 'Why serve the Lord of the Dead?', goto: 'why' },
          { text: 'Is the paperwork really the frightening part?', goto: 'paper' },
          { text: 'Peace to the rows, sister.', cancel: true, goto: 'bye' },
        ],
      },
      tended: {
        speaker: 'Navarra Dyernina',
        text: "She works with a mortician's sureness, which is unsettling for the first minute and profoundly comforting after: nothing about a body surprises her, least of all its determination to continue.\n\nThere. Kelemvor prefers his appointments kept punctually — which means not early. Go and be late for him. It is the only lateness the Lord of the Dead approves of.",
        goto: 'hub',
      },
      why: {
        speaker: 'Navarra Dyernina',
        text: "Because I watched a bad death when I was young, in Rashemen, drawn out by things that should not have had a claim on it — and then I watched a Kelemvorite arrive and make it a good death, in one hour, with nothing but order and certainty.\n\nDeath is not the enemy. Death untidy, death unjust, death that lingers or arrives twice — that is the enemy.\\p My god is not grim. My god is the ferryman who has never once capsized. People fear him the way they fear the sea. The drowned never do; only the watchers on the shore.",
        goto: 'hub',
      },
      paper: {
        speaker: 'Navarra Dyernina',
        text: "Entirely.\n\nThe veil moves in what may be a smile.\n\nA revenant, I can settle — the rites are old and they hold. But a patriar family contesting which cousin owns a mausoleum, in the Parliament's probate rolls, across four generations of amended deeds? Kelemvor's own certainty bends before Baldurian probate.\\p There is a tomb on the west row that has stood empty for sixty years while the suit continues. The plaintiffs are all, by now, my parishioners. I find that the only genuinely funny thing in this district, and I ration it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Navarra Dyernina',
        text: "Go and be counted elsewhere, a long time from now. The rites will keep.",
      },
    },
  },

  ghesh: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ghesh',
        text: "A slate-scaled dragonborn is walking beside an empty cart along the row, one hand on the rail, talking to it in a low rumble — not madness, you realise after a moment, but company, the way a sailor talks to a boat.\n\nHe stops when he sees you, without embarrassment.\n\nGhesh. Corpse-carter. She and I do the Cliffgate run.\\p The cart is a she. She has earned it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ghesh',
        text: "Ask. The residents are not in a hurry and she needs the rest — the axle takes the hill badly.",
        choices: [
          { text: 'You talk to the cart.', goto: 'cart' },
          { text: 'What is the work like?', goto: 'work' },
          { text: 'Seen anything wrong in the rows?', goto: 'wrong' },
          { text: 'Good roads to you both.', cancel: true, goto: 'bye' },
        ],
      },
      cart: {
        speaker: 'Ghesh',
        text: "Eleven years, this cart. Four thousand passengers, maybe five.\n\nHe pats the rail once.\n\nEvery one of them made their last journey on her boards, and not one of them had anyone talking to them at the time — that is why they are on the cart and not in a procession. So I talk. To her, for them. The words are nothing. Weather. The hill. The gulls.\\p A last journey should have a voice in it somewhere. That is the whole of my religion and it fits on a cart.",
        do: { flag: 'ghesh-voice-known' },
        goto: 'hub',
      },
      work: {
        speaker: 'Ghesh',
        text: "Steady.\n\nA dragonborn shrug, like a wall settling.\n\nThe city sends its dead out the Cliffgate at dawn and dusk. I take the dawn run. Warden Shemov logs them in, Sister Navarra speaks over the ones with nobody, and the stone-cutters argue about spelling. It is a good crew. Nobody down here pretends anything, which after one season working the Lower City docks felt like clean water.\\p The pay is bad. The company is honest. Show me the district with both.",
        goto: 'hub',
      },
      wrong: {
        speaker: 'Ghesh',
        rumor: true,
        text: "Wheel ruts on the north row at dawn that are not hers — she has a wobble in the off-wheel, I would know her track in the dark. Somebody carts in this ground at night, and night carting is nothing honest.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ghesh',
        text: "Walk well. — That was to you. The next part is for her, and it is about the hill, and it is private.",
      },
    },
  },

  weary: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Weary',
        text: "He is sitting on a flat tomb in the dusk-coloured end of the rows, a tiefling with a spade across his knees, and he watches you come with eyes the colour of banked coals and no alarm whatever.\n\nWeary. It is a virtue-name. My mother had hopes.\\p Go on, say the rest of it. Everyone does. 'What does a tiefling with a spade do in a graveyard at dusk.' I will wait.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Weary',
        text: "Well. You did not say it, which buys you a real conversation. Rare coin out here.",
        choices: [
          { text: 'What DO you do, then?', goto: 'trade' },
          { text: 'You work for the Guild.', if: { flag: 'bg-guild-known' }, goto: 'guild' },
          { text: 'Why this work? Truly.', goto: 'why' },
          { text: 'Rest easy, Weary.', cancel: true, goto: 'bye' },
        ],
      },
      trade: {
        speaker: 'Weary',
        text: "Night work. Removals, mostly. Sometimes deposits.\n\nHe says it flatly, watching what your face does.\n\nBodies come out of Tumbledown for people who pay not to ask why they want them, and other things go in, in boxes I do not open. I am not proud of it and I am not ashamed of it, which upsets people more than either would.\\p It is the last work in this city for someone with my face and no name behind it. I do it carefully, I do it respectfully — you can laugh, but ask the warden if my removals are ever untidy — and I keep a private ledger of every single one, in case a reckoning ever wants receipts.",
        do: { flag: 'weary-ledger-known' },
        goto: 'hub',
      },
      guild: {
        speaker: 'Weary',
        text: "You say it like a key you expect to turn something.\n\nHe turns the spade slowly, once.\n\nYes. The Guild's coin, the Guild's boxes, the Guild's silences. And here is what your key opens: I am the Guild's man the way the spade is mine — held, used, and put down when the job is done. Nine-Fingers does not know my face. Rilsa Rael knows my rate.\\p If you are in their ledgers now, one true word of advice, from the bottom of the trade looking up: the Guild forgets its tools the moment they stop fitting the hand. Be a hand, never a tool. The difference is who gets put down.",
        goto: 'hub',
      },
      why: {
        speaker: 'Weary',
        text: "For a while he does not answer, and the dusk does its work on the rows.\n\nBecause the dead do not flinch.\n\nHe says it without self-pity, as a plain finding.\n\nI have carried this face through every district of this city. Inside the walls they cross the street. In Sow's Foot they check their purses. In Twin Songs they pray at me, which is worse. And down here — nothing. The residents take me exactly as I come.\\p My mother named me Weary hoping I would never have cause to grow into it. I grew into it. But I am less weary here, at dusk, with the spade, than anywhere else in Baldur's Gate, and a man takes the peace that is actually on offer.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Weary',
        text: "Mind how you go in the dark rows. Not everything under Tumbledown got put down properly. \\p I would know. Some of the improper ones were mine.",
      },
    },
  },

  // =========================================================================
  // 13. SOW'S FOOT
  // =========================================================================

  'nine-fingers': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Astele Keene',
        text: "Sit down. Everybody stands in this room and it makes the room tiring.\n\nThe back room is small, dry, and smells of tallow and wet wool like every other room in Sow's Foot, and the woman at the plain table could be a moneylender's clerk until you count her fingers, and then you stop counting things at her entirely, because she has noticed you counting.\n\nAstele Keene. You will have heard the other name. Use whichever one lets you talk sense.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Astele Keene',
        text: "You have the room's attention. The room will tell you that is not always a fortunate thing to have.",
        choices: [
          { text: 'You run the Guild.', if: { notFlag: 'bg-guild-known' }, goto: 'guarded' },
          { text: 'The Guild\'s work suits us. What is there?', if: { flag: 'bg-guild-known' }, goto: 'work' },
          { text: 'Somebody bought a ducal chair with Guild coin.', if: { quest: 'the-fourth-chair' }, goto: 'chair' },
          { text: 'Why Sow\'s Foot? You could hold a palace.', goto: 'why-here' },
          { text: 'We will leave the room to its work.', cancel: true, goto: 'bye' },
        ],
      },
      guarded: {
        speaker: 'Astele Keene',
        text: "Do I.\n\nShe pours two cups of thin wine and pushes one across, and the gesture has the finality of a door closing somewhere else in the building.\n\nI run a benefit society. Burials, dowries, small loans against hard seasons — ask anyone in the district. The Flaming Fist has a different word for it, and the Fist polices everywhere in this city except the places it would cost money to police, which is everywhere I operate. Odd, that.\\p You are new, you are armed, and you found this room, which means somebody let you find it. Drink your wine, be pleasant, and come back when you and I have a reason to know each other. The city usually provides one.",
        goto: 'hub',
      },
      work: {
        speaker: 'Astele Keene',
        text: "Rilsa speaks for me inside the walls — Heapside, by the Mermaid. Her board carries the work: movement, acquisition, the occasional quiet removal of an obstacle, and none of it wet unless somebody breaks the rule first.\n\nShe turns her cup a half-circle, watching you over it.\n\nAnd since you are in the ledgers now, the one speech, once. The Guild squeezes patriars, factors, and anybody who can write to the Parliament about it. It does not squeeze the Outer City. Fifty thousand people out here that the dukes tax and will not govern — somebody keeps their nights orderly, and it is not the Fist, and it is not free, but it is fair.\\p Cross that line while you carry our work and Rilsa will not be sent to speak to you. Nobody will be sent. That is the whole of the personnel policy and it has never needed a second clause.",
        do: { rep: { id: 'zhentarim', amount: 1 } },
        goto: 'hub',
      },
      chair: {
        speaker: 'Astele Keene',
        text: "For the first time, she is entirely still, and you understand that everything before this was motion deployed to be watched.\n\nSo Ravengard sent his new sword to ask the Guild about the chair.\n\nShe lays her hands flat on the table. Nine fingers.\n\nHear it plainly, because I will say it once and I do not repeat things for dukes. The coin was ours the way rain in a barrel is the sky's — stolen coin, skimmed from three of my counting men over two years by somebody who knew our routes because they bought one of my people. I do not buy chairs. A duke in your pocket is a debt that collects YOU.\\p The name you want is in a strong room in this district, in a ledger I have been three tendays working to reach, and you are going to reach it first, because Ravengard's writ opens doors mine cannot. Go and take it. And when the thing that countersigned burns on the High Hall floor — tell the Marshal afterwards whose coin it tried to spend. He will understand what I am owed. He will hate it. He will pay it.",
        do: { flag: 'nine-fingers-denial' },
        goto: 'hub',
      },
      'why-here': {
        speaker: 'Astele Keene',
        text: "Because I was born four doors from where you are sitting, in the mud year, and every silver I have ever moved has moved through streets that know my mother's name.\n\nShe says it without sentiment, like an engineer explaining a foundation.\n\nA palace is a wall with you inside it. Sow's Foot is fifty thousand doors and every one of them opens for me, and half of them would hide me without being asked, because the soup was there in the bad winters and they remember whose kitchens it came out of.\\p Nobody looks for a queen in Sow's Foot. That is the epigram, and it is good, and it misses the point. I am not hiding here. I am HELD here. Learn the difference and you will understand this city better than its dukes do.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Astele Keene',
        text: "Mind the step going out. And the man by the door is called Feng; be civil to him, he is worth four of most people.",
      },
    },
  },

  brem: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Brem',
        text: "Under the tarp. Prices are firm, provenance is not, and I have never seen you before.\n\nThe tarpaulin covers a market that is not on any map: crates, racks, sea-chests, and a counter made of two doors, behind which a compact man is doing four kinds of arithmetic at once.\n\nBrem. Quartermaster. Anything in this city inside two days, including — he does not look up — the thing you lost last tenday, which will cost you slightly more than it did the first time. That is not cruelty. That is freight.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Brem',
        text: "Buying, selling, or asking? The third one is dearest.",
        choices: [
          { text: 'Show us under the tarp.', do: { shop: 'sows-foot-market' }, goto: 'hub' },
          { text: 'How does the finding work?', goto: 'finding' },
          { text: 'Tell us about Feng.', if: { notFlag: 'feng-joined' }, goto: 'feng' },
          { text: 'What is moving, quietly?', goto: 'news' },
          { text: 'Never saw you either.', cancel: true, goto: 'bye' },
        ],
      },
      finding: {
        speaker: 'Brem',
        text: "Everything in Baldur's Gate is somewhere, and every somewhere has a person, and every person has a price or a favour or a cousin.\n\nHe closes one ledger and opens another, identical.\n\nThat is the whole trade. I keep the map of persons. Two days is not the finding — the finding takes an hour — two days is the negotiating, because going faster than the seller's dignity costs extra and dignity out here is the one commodity in short supply.\\p Nothing violent, before you ask. Violence is bad stock-keeping. A thing taken with blood on it is worth half and hums with Fist attention. I deal in the quiet gravity of goods, which pull toward money the way water pulls downhill.",
        goto: 'hub',
      },
      feng: {
        speaker: 'Brem',
        text: "Feng.\n\nHe sets the pen down, which he has not done since you arrived.\n\nBest carrier in the district. A message goes with Feng, it arrives — unopened, unbent, on time, eleven years. And lately he has started asking who the messages are for. Not refusing. Asking. Standing there with the sealed thing in his hand, doing sums behind his eyes.\\p A quartermaster keeps stock of his people same as his goods, so mark this in whatever ledger you keep: a man that size, that honest, starting to count what his work adds up to — that man is about to become either dangerous or free, and the trade would rather he did it far from here. If you take him, take him whole. No half-jobs back this way. Clean break or none.",
        do: { flag: 'brem-feng-blessing' },
        goto: 'hub',
      },
      news: {
        speaker: 'Brem',
        rumor: true,
        text: "Quietly: somebody upstream of me has been buying muscle in bulk and paying over rate, which spoils the market and means they are in a hurry, and hurried money is always somebody's trouble arriving.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Brem',
        text: "Tarp stays down as you go. It is not secrecy, it is the rain. \\p It is somewhat secrecy.",
      },
    },
  },

  olga: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Olga Stormwind',
        text: "Bowl's a copper if you have it and free if you have not. Sit on the barrel.\n\nTwo cauldrons, a wall of bread, and a broad white-haired woman ladling with both arms who has clearly been feeding this district since before half of it was born.\n\nOlga Stormwind. Nineteen years, this corner. Eat first. Everything in Sow's Foot goes better eaten first, including the bad news, of which we keep a full pot.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Olga Stormwind',
        text: "Go on then, eat while you talk. I have never once trusted a person who could not do both.",
        choices: [
          { text: 'A bowl for each of us. [gold]1 gp[/]', if: { gold: 1 }, do: [{ gold: -1 }, { heal: { cost: 0, hours: 1 } }], goto: 'bowl' },
          { text: 'You know every name out here, they say.', goto: 'names' },
          { text: 'What does Sow\'s Foot need?', goto: 'needs' },
          { text: 'What is the district saying?', goto: 'news' },
          { text: 'Keep the pots full, mother.', cancel: true, goto: 'bye' },
        ],
      },
      bowl: {
        speaker: 'Olga Stormwind',
        text: "Barley and bones and whatever the morning brought, and the morning brought decently today.\n\nIt is hot, it is filling, and a whole gold piece has just fed you and eleven strangers, because she made your change into bowls without asking, and dares you with one look to mind.\n\nThere. Now you have eaten in Sow's Foot, you are Sow's Foot. That is the entire naturalisation and it is more binding than the city's.",
        goto: 'hub',
      },
      names: {
        speaker: 'Olga Stormwind',
        text: "Every name, and most of the middle names, and which grandmother is owed an apology by which fence.\n\nShe wipes her hands on her apron, unhurried.\n\nAnd yes — the Fist has come to this corner four times in nineteen years asking after names, polite as you like, with a purse showing. They got soup. Names feed nobody. The purse fed the district for a tenday, mind; I am principled, not stupid.\\p A name given to the wall is a person gone. A name kept is a person who might still come right. I have watched a great many come right, on this corner, eating. It is slower than a magistrate and it works more often.",
        goto: 'hub',
      },
      needs: {
        speaker: 'Olga Stormwind',
        text: "A roof tax that stops at one collector. A well east of the pens — the water walk is an hour for the far lanes. And for the Parliament of Peers to either govern us or stop counting us; being taxed as a district and served as a rumour wears a body down.\n\nShe refills a child's bowl mid-sentence without looking.\n\nBut ask me what we HAVE, sometime. Nine soup corners, a burial fund that has never once defaulted, and fifty thousand people who will carry a neighbour's fever-child across the district at midnight. The Upper City has none of those things. I have catered up there. I checked.",
        do: { flag: 'sows-foot-needs-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Olga Stormwind',
        rumor: true,
        text: "The pot hears everything eventually — soup loosens more than bread does. This tenday it hears that strangers with clean boots have been asking directions to the back room, and the district has been giving them very scenic directions.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Olga Stormwind',
        text: "Off with you. And you know where the corner is now — nobody who knows where the corner is ever properly starves in this district, so that is your inheritance sorted.",
      },
    },
  },

  feng: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Feng',
        text: "He is exactly where a wall would be if the alley had one — a half-orc the size of a doorframe, still, watching the lane with the patience of furniture.\n\nFeng.\n\nA pause you could stack crates in.\n\nI carry things. Hand to hand. That is the job and the whole of the introduction.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Feng',
        text: "Talk if you want. I am not going anywhere until the next message does.",
        choices: [
          { text: 'What do you carry?', goto: 'carry' },
          { text: 'You have started asking questions, we hear.', if: { flag: 'brem-feng-blessing' }, goto: 'counting' },
          { text: 'Carry for us instead. For pay, and answers.', goto: 'join' },
          { text: 'Watch the lane well.', cancel: true, goto: 'bye' },
        ],
      },
      carry: {
        speaker: 'Feng',
        text: "Messages that arrive by hand and are understood without words.\n\nHe flexes one hand slowly, studying it like a tool he is reappraising.\n\nA sealed letter. A purse. Once a ring, once a bird in a cage, twice a man's own knife returned to him, which is a sentence in this district, and both times the man went pale and moved house.\\p Eleven years. Nothing lost, nothing opened, nothing late. I was proud of that for ten of the years.",
        goto: 'hub',
      },
      counting: {
        speaker: 'Feng',
        text: "Brem talks.\n\nIt is not said with anger. He looks down the lane for a while.\n\nEleven years I carried without asking. Then last winter I carried a thing to a door in the Stonyeyes lanes, and a week after, that family was gone — gone quiet, the way doors go empty out here — and they were OUR people. The kind the Guild says it keeps the nights orderly FOR.\\p So I started counting. Which doors. Which families. What my hands have added up to, eleven years of arithmetic I never did. The count is not finished. I already do not like the total.",
        do: { flag: 'feng-count-known' },
        goto: 'hub',
      },
      join: {
        speaker: 'Feng',
        text: "For a long moment he looks at you the way he looks at the lane: completely.\n\nPay, and answers.\n\nHe nods slowly, once, like a cargo shifting into place.\n\nOne hundred and fifty gold. It squares what the Guild says I owe for leaving mid-season — I checked the number twice, it is honest, Brem does not cheat his own. And then my hands are mine, and whatever they carry next, I will know what it is for.\\p That is the price of the whole of me. Nobody has ever offered for the whole of me before. Mostly they hire the shoulders.",
        choices: [
          { text: 'The whole of you. [gold]150 gp[/]', if: { gold: 150 }, do: [{ recruit: 'feng' }, { flag: 'feng-joined' }], goto: 'joined' },
          { text: 'Not today.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Feng',
        text: "He walks to the tarp, sets a purse on Brem's counter, and says nothing, and Brem says nothing, and the whole transaction takes four seconds and closes eleven years.\n\nThen he comes back and rolls his shoulders, and something in the way he stands has changed key entirely.\n\nDone. Clean break.\\p First answer, then, since you are paying in them: whatever we carry, tell me what it is for. You do not have to be right. You have to be willing to say it. That is the whole contract.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Feng',
        text: "Mind the mud past the pens. It looks shallow. It is not shallow.",
      },
    },
  },

  lidda: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Lidda Hilltopple',
        text: "A halfling woman falls into step beside you out of nowhere, radiating the specific innocence of somebody who has just done something.\n\nLidda Hilltopple. Here is your coin purse back — no, take it, check it, all there. I took it forty paces ago by the bread wall. Did you feel it? You did not feel it. NOBODY feels it.\\p She is glowing. This is clearly the entire point of her career.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Lidda Hilltopple',
        text: "Go on, ask me how. Everyone asks how. It is my favourite part. It is possibly the problem.",
        choices: [
          { text: 'Fine. How?', goto: 'how' },
          { text: 'Caught eleven times, we hear.', goto: 'caught' },
          { text: 'Why give it back?', goto: 'back' },
          { text: 'Keep your hands where we can see them.', cancel: true, goto: 'bye' },
        ],
      },
      how: {
        speaker: 'Lidda Hilltopple',
        text: "The purse is never the trick. The purse is easy. The trick is the OTHER shoulder.\n\nShe demonstrates on empty air, narrating like a fencing master.\n\nEverybody guards the purse side, so you brush the OFF shoulder — just weather, just crowd — and the whole body turns to the touch like a sunflower, it cannot help it, and now the purse side is swinging free and the fingers do the rest. Two knuckles, never the thumb. The thumb is an amateur.\\p Beautiful, no? BEAUTIFUL. And that, word for word, is what I said to the magistrate, with gestures, which is how the fourth arrest became the fifth.",
        goto: 'hub',
      },
      caught: {
        speaker: 'Lidda Hilltopple',
        text: "Eleven times. And never once IN the act — after. Every single time, after, because the work goes perfectly and then somebody buys me one ale and asks how and I show them, with the original purse, which I have kept, as evidence. Of skill.\n\nShe sighs the sigh of the misunderstood artist.\n\nRilsa says I am the best hands and the worst mouth in the Lower City and she will hire the hands the day somebody removes the mouth. The Fist sergeant at the Basilisk Gate greets me by NAME. There is a drawing.\\p I am not a criminal, properly. I am a performer whose venue is other people's pockets, and the reviews keep getting me arrested.",
        goto: 'hub',
      },
      back: {
        speaker: 'Lidda Hilltopple',
        text: "Because keeping it is a different job, and the different job is boring.\n\nFor one moment she is entirely serious, and it sits on her strangely.\n\nKeep what you lift and you need fences and shares and Brem's ledger, and everyone in the chain owns a piece of you. Give it back and you own the whole moment forever — the face, the checking, the NOBODY FEELS IT. I am the only person in Sow's Foot who does this for free, which makes me the only rich one.\\p Also my grandmother said a Hilltopple's hands feed the family or they are just weather. I send my real wages home. I earn them at cards, honestly, which is a joke I need you to appreciate.",
        do: { flag: 'lidda-artist-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Lidda Hilltopple',
        text: "Off you go! And check the purse again in an hour, not because of me, because this is still Sow's Foot and the OTHER pickpockets are in it for a living.",
      },
    },
  },

  'sows-foot-dog': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Mudlark',
        text: "A dog the colour of the district — which is to say, mud with ambitions — trots the lane on his morning circuit. He clocks you, adds you to the route without breaking stride, and sits at your feet with the confidence of a rent collector.\n\nEverything about him says this arrangement is now formal.",
        choices: [
          { text: 'Pay the toll. Whatever food you have.', goto: 'toll' },
          { text: 'Scratch the exact spot behind the left ear.', goto: 'spot' },
          { text: 'Decline the arrangement.', cancel: true, goto: 'bye' },
        ],
      },
      toll: {
        speaker: 'Mudlark',
        text: "The offering is inspected, approved, and dispatched with the efficiency of long practice. He then leans his entire muddy weight against your leg for exactly three heartbeats — the district's highest honour, non-transferable.\n\nA woman at the bread wall calls over: \"He's eaten from every door in Sow's Foot, that one. Been kicked by two. He remembers which two, and so does the district, and it went worse for the doors.\"",
        do: { flag: 'mudlark-toll-paid' },
        goto: 'start',
      },
      spot: {
        speaker: 'Mudlark',
        text: "You find it on the first try. His back leg goes, then his dignity, then his entire structural integrity, and eleven hundredweight of district watchdog becomes mud-coloured gravel in the lane.\n\nSomewhere a child laughs. Two more children appear at the sound, as if summoned. The lane is briefly, entirely, a good place.",
        goto: 'start',
      },
      bye: {
        speaker: 'Mudlark',
        text: "He accepts the refusal without offence and resumes the circuit. The circuit is long, and the district is generous, and he has never once gone hungry on it.",
      },
    },
  },

  // =========================================================================
  // 14. TWIN SONGS
  // =========================================================================

  jhessail: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Jhessail Dundragon',
        text: "Six shrines, one avenue, and everyone behaves. Which of them do you need?\n\nShe is rose-and-gold in Lathander's colours, sweeping the step of one shrine while somehow keeping half an eye on five others, like a harbourmaster of gods.\n\nDawnbringer Jhessail Dundragon. I keep the Morninglord's door here, and by unelected custom I keep the peace of the whole street, because somebody has to know everyone's feast days and I was fool enough to learn them.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Jhessail Dundragon',
        text: "So — blessings, business, or the tour? The tour is free and I am told I do it well.",
        choices: [
          { text: 'What do the shrines offer?', do: { shop: 'twin-songs-shrines' }, goto: 'hub' },
          { text: 'The tour, then.', goto: 'tour' },
          { text: 'How do six faiths share a gutter?', goto: 'peace' },
          { text: 'Even the Myrkulite?', goto: 'amnon' },
          { text: 'Dawn keep you, Dawnbringer.', cancel: true, goto: 'bye' },
        ],
      },
      tour: {
        speaker: 'Jhessail Dundragon',
        text: "Left to right, as the sun walks it.\n\nShe points with the broom, precisely.\n\nLathander — mine, candles and beginnings. Eldath's basin, and Sister Quara, who is the stillest thing in this city including the statues. Tymora's fountain, throw honestly or not at all. Gond's shed — Caramip will show you the clock, do NOT ask if it is better than the High House's, she has the speech ready. Kelemvor's slab, for grief, which is allowed here. And the roped shrine at the end is Amnon's, the Lord of Bones, legal and watched and quieter than all of us.\\p Six doors, one street. Pilgrims come off the Coast Way having walked four hundred miles and stand in the middle and turn in a circle. I never tire of watching that.",
        goto: 'hub',
      },
      peace: {
        speaker: 'Jhessail Dundragon',
        text: "By gutter, actually. That is the true answer.\n\nShe leans on the broom, pleased with it.\n\nOne gutter serves the whole avenue, and it blocks — every autumn, without fail — and the year the faiths cleared it together was the year the peace became real. You cannot hold a schism with a priest whose sleeves are rolled in the same drain as yours.\\p Doctrine did not build this street. Maintenance built it. Shared weather, shared beggars, shared bell-rope when the Fist musters. The gods manage their differences at an altitude where it is no longer our business, and down here we manage the gutter.",
        goto: 'hub',
      },
      amnon: {
        speaker: 'Jhessail Dundragon',
        text: "Especially the Myrkulite.\n\nHer voice does not drop, which is itself a statement to the avenue.\n\nAmnon keeps every rule the Parliament wrote and several they forgot to write. He is watched by four separate interests at all times, and he finds it restful, which tells you what his life was before Twin Songs. In six years the shrine of the Lord of Bones has produced no scandal, no theft, and one extremely good casserole for the gutter-clearing.\\p Dawn's whole doctrine is that things rise. I am obliged to believe it of tieflings keeping bone-shrines, or I am not obliged to believe it of anyone. He heard me say that once. He rearranged his candles, which for Amnon is weeping.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Jhessail Dundragon',
        text: "Walk the street end to end at least once — it is the only place in Baldur's Gate where every god can see you behaving well, and it does a body good to be witnessed.",
      },
    },
  },

  amnon: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Amnon',
        text: "You may look. Everyone looks. That is what the shrine is for.\n\nBehind a neat rope, an altar of grey stone, candles in bone-white wax, and a tiefling in charcoal robes arranging them with the precision of a watchmaker. Somewhere nearby, at least two people are pretending not to observe him.\n\nAmnon. Keeper of the Lord of Bones' shrine, licensed, inspected, and — he says it with perfect mildness — the most law-abiding man on this avenue by a margin the Watch finds annoying.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Amnon',
        text: "Ask what you like. I answer everything. It unsettles people far more than secrecy would, and it is also less work.",
        choices: [
          { text: 'Why keep Myrkul\'s shrine at all?', goto: 'why' },
          { text: 'Being watched is restful?', goto: 'watched' },
          { text: 'What does the Lord of Bones actually teach?', goto: 'teach' },
          { text: 'Keep your candles, keeper.', cancel: true, goto: 'bye' },
        ],
      },
      why: {
        speaker: 'Amnon',
        text: "Because somebody keeps it, or somebody keeps it badly.\n\nHe straightens a candle by a degree.\n\nMyrkul's name does not stop being spoken because a shrine closes. It goes to cellars, and in cellars it curdles — I have seen the cellar version, and the cellar version costs lives. Here it is a rope, a slab, daylight, and me, filing a quarterly return with the Parliament like a chandler.\\p The city thinks it is tolerating me. It is inoculating itself, and I am the needle, and I am content to be the needle. It is honest work and the hours suit the clientele, who are patient.",
        do: { flag: 'amnon-needle-known' },
        goto: 'hub',
      },
      watched: {
        speaker: 'Amnon',
        text: "Deeply.\n\nHe indicates, without pointing, the watchers: a Watch corporal at the fountain, a Fist informer buying the same apple as yesterday, one of Jhessail's novices, and a fourth party he identifies only as 'ecclesiastical'.\n\nConsider: for a tiefling keeping a death-god's shrine, the historical alternatives to being watched are being suspected, being blamed, and being burned. Four sets of eyes confirming hourly that I am doing nothing wrong is the finest security arrangement of my life and it costs me nothing.\\p I bring the corporal tea in the cold months. He declines it correctly. We are both very good at our jobs, and there is a kind of peace in that no temple ever gave me.",
        goto: 'hub',
      },
      teach: {
        speaker: 'Amnon',
        text: "That everything ends. That is the whole of it, and everything else is commentary.\n\nHe finishes the candles and gives you his full mild attention.\n\nPeople hear it as a threat. It is a unit of measure. Nothing you build lasts; therefore what you build matters ONLY for what it does while it stands — feed, shelter, teach, delight. The Lord of Bones is the god of clear accounting. Sub specie ossium: what did the thing do before it fell down?\\p The pilgrims who understand this leave lighter. The ones who do not, leave quickly. Both outcomes are acceptable to the management.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Amnon',
        text: "Go well. Everything ends; be unhurried about it anyway. That is the blessing. It is a better one than it sounds.",
      },
    },
  },

  'taman-brightwood': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Taman Brightwood',
        text: "Pilgrim-Marshal Brightwood. Are you walking north, or are you the reason people stop?\n\nHe is weathered, badged with a dozen shrine-tokens, and carrying a ledger on a neck-strap the way other men carry a holy symbol. In a sense it is one.\n\nI organise the pilgrim trains — Twin Songs to Candlekeep, Twin Songs to the northern shrines. Heads out, heads back. I have kept the difference in this book since 1489, and this year the difference is the worst it has ever been.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Taman Brightwood',
        text: "Ask, or offer. I am short of everything except need.",
        choices: [
          { text: 'The barrows on the Fields are open. We can shut them.', if: { questNot: 'the-fields-remember' }, do: { quest: 'the-fields-remember' }, goto: 'offer' },
          { text: 'The Fields are quiet. The barrows are sealed.', if: { quest: 'the-fields-remember' }, do: [{ complete: 'the-fields-remember' }, { flag: ['fields-barrows-sealed', 'fields-barrows-closed'] }, { rep: { id: 'gauntlet', amount: 3 } }], goto: 'sealed' },
          { text: 'What is the ledger\'s count?', goto: 'ledger' },
          { text: 'Who walks these roads, and why?', goto: 'pilgrims' },
          { text: 'Good roads, Marshal.', cancel: true, goto: 'bye' },
        ],
      },
      offer: {
        speaker: 'Taman Brightwood',
        once: true,
        text: "He looks at you for a moment like a man checking the weather for a break in it.\n\nThen the Morninglord is kind after all. Hear the shape of it.\n\nThe Fields of the Dead — every pilgrim train north crosses them, there is no other road. The barrows are opening. Not robbed: OPENED, from beneath. I buried two of my own people out of the spring crossing, and I have suspended the trains, which means the shrines north of the Chionthar are cut off from the whole south coast for the first time since the count began.\\p A Kelemvorite barrow-watcher named Hulmarra walks the Fields — find her, she knows the mounds by name. Shut them, all nine. And when it is done, come and tell me, because my book needs the entry, and Baldur's Gate needs a witness who will say it plainly in front of people who did not want to fund the mending.",
        goto: 'hub',
      },
      sealed: {
        speaker: 'Taman Brightwood',
        text: "He opens the ledger flat on his knee, there in the street, and writes the entry while you speak — date, names, nine barrows, sealed — and signs it, and has you make a mark beside his.\n\nWitnessed.\n\nHe closes the book, and something in his shoulders comes down half an inch for the first time in, you would guess, a year.\n\nThe trains walk again on the new moon. Four hundred people are going to cross that ground in the spring and complain about their feet and notice nothing, NOTHING, and that beautiful nothing is your work.\\p The difference in this book has names, every one, back to 1489. Tonight is the first night since spring I add none. Walk with every god on this street, the watched one included.",
        goto: 'hub',
      },
      ledger: {
        speaker: 'Taman Brightwood',
        text: "Heads out, heads back.\n\nHe holds the book but does not open it, the way you hold a thing that is heavier than it looks.\n\nSince 1489: four thousand and eleven out, three thousand nine hundred and sixty back. Fifty-one. Storms, fevers, two drownings at the ferry, bandits in the bad years — every entry has its reason written beside it, except nine from the spring crossing, whose reason was the Fields, and whose entries I wrote with the worst hand of my life.\\p People call the book grim. It is the opposite. Every pilgrimage ever preached promises the road costs something. Mine is the only ledger on the coast that tells the pilgrims the true price before they walk. They deserve the number. Everyone deserves the number.",
        do: { flag: 'taman-ledger-known' },
        goto: 'hub',
      },
      pilgrims: {
        speaker: 'Taman Brightwood',
        rumor: true,
        text: "Grief, mostly, and gratitude, in about equal measure — the two great engines of walking. This season more of them ask about safety than about shrines, which in nineteen years of this work is the worst change I have measured.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Taman Brightwood',
        text: "Take water, take company, and tell somebody your road before you walk it. That is the whole of pilgrim-craft. The rest is feet.",
      },
    },
  },

  caramip: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Caramip Folkor',
        text: "Mind the threshold, it is a gear rack. Everything in here is something.\n\nGond's shrine at Twin Songs is a shed the size of a generous pantry, and every surface of it is workbench, and at the centre, on a velvet cushion under a glass dome, a clock is ticking.\n\nCaramip Folkor. Keeper. Yes, that is the clock. You may ask about the clock. Everyone properly interesting asks about the clock.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Caramip Folkor',
        text: "Well? Worship here is done with the hands. Talking also counts, if it is precise.",
        choices: [
          { text: 'Tell us about the clock.', goto: 'clock' },
          { text: 'The High House of Wonders has three clocks, we hear.', goto: 'rivalry' },
          { text: 'What is Gond\'s teaching, in a shed this size?', goto: 'teach' },
          { text: 'Tick on, keeper.', cancel: true, goto: 'bye' },
        ],
      },
      clock: {
        speaker: 'Caramip Folkor',
        text: "Built here. On that bench. Every gear cut in this shed, every jewel set with these hands, four years and one month and nine days, which the clock itself will confirm because it has not drifted a minute since I wound it.\n\nShe watches it tick with the expression other keepers save for their altars, because it IS the altar.\n\nIt tells the hour, the tide at Gray Harbour, the phase of the moon, and the feast days of every shrine on this avenue — ALL six, note, including the Bone Lord's, because a calendar that omits a neighbour is not a calendar, it is an opinion.\\p Gond does not want your candles. Gond wants to see what you MADE. This is what I made. He has not complained.",
        goto: 'hub',
      },
      rivalry: {
        speaker: 'Caramip Folkor',
        text: "THREE clocks. Yes. I have inspected all three, at length, with instruments.\n\nShe holds up one finger, gathering herself, and delivers the speech with the crispness of long rehearsal.\n\nClock one keeps splendid time and was built in LANTAN, which makes it an import, not a devotion. Clock two is beautiful and loses four minutes a tenday, which in a temple of the Wonderbringer is not a clock, it is furniture that lies. Clock three, I will grant, is honest work — Fonkin's own — and if the High House ever admits that ONE working clock made on the premises equals my one working clock made on these premises, we will be even, at one all, in a city where they have nine hundred artificers and I have a shed.\\p Fonkin sends me gear stock at Midwinter with no note. I send him spring oil with no note. The rivalry is the friendship. Do not explain this to either of us.",
        do: { flag: 'caramip-fonkin-known' },
        goto: 'hub',
      },
      teach: {
        speaker: 'Caramip Folkor',
        text: "That making is prayer. The whole creed fits on a gear blank.\n\nShe taps the bench.\n\nThe world arrived unfinished. On purpose, mind — the Wonderbringer left the interesting parts undone the way a good master leaves the apprentice the join. Every hinge that stops a door dragging, every pump that spares a back, every clock that lets a midwife time a labour: prayer, answered by the pray-er, which is the efficient design.\\p The big temples add processions. Processions are fine. But the god comes to the shed, pilgrim. The god has ALWAYS come to the shed.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Caramip Folkor',
        text: "Go and make something. It can be small. He likes the small ones best — more of the maker shows.",
      },
    },
  },

  quara: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Quara Ramondo',
        text: "Sit by the water a moment. It costs nothing and it is the only thing here that does.\n\nEldath's shrine is a stone basin of still water and a bench, and a woman beside it whose stillness makes the water look busy.\n\nSister Quara. There is no sermon. The basin is the sermon. People argue with it sometimes. The basin has never lost.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Quara Ramondo',
        text: "She waits. It is somehow the most attentive waiting you have ever been the object of.",
        choices: [
          { text: 'Sit by the basin a while.', goto: 'sit' },
          { text: 'They say you step between knives.', goto: 'knives' },
          { text: 'Walk with us. The road needs your kind of quiet.', goto: 'join' },
          { text: 'Peace to the water, sister.', cancel: true, goto: 'bye' },
        ],
      },
      sit: {
        speaker: 'Quara Ramondo',
        text: "You sit. The avenue goes on behind you — carts, bells, a gull with opinions — and the basin holds its stillness through all of it, and after a while something in your shoulders consents to be persuaded.\n\nShe does not fill the silence. That is the discipline: everyone else in this city is filling something.\n\nWhen you rise, she says only:\n\nThat. Carry that. It travels better than people think.",
        do: { heal: { cost: 0, hours: 1 } },
        goto: 'hub',
      },
      knives: {
        speaker: 'Quara Ramondo',
        text: "When it is needful.\n\nShe says it as plainly as naming the weather.\n\nA drawn knife wants one of two things: to be used, or to be allowed to stop. Almost always the second. The man holding it has usually run out of road, and everyone facing him is shouting, and shouting is road running out faster.\\p So I stand in the gap and am quiet at him. Not brave — accurate. I have done it more times than the Watch, which the Watch knows, which is why the Watch corporal brings the hard calls to this bench first when there is time.\n\nEldath's peace is not the absence of the knife. It is the moment the hand remembers it has a choice. I am only ever pointing at the moment.",
        do: { flag: 'quara-knives-known' },
        goto: 'hub',
      },
      join: {
        speaker: 'Quara Ramondo',
        text: "She looks at the basin for a while, and the basin, as ever, is candid.\n\nThe Green Goddess's peace is not made by standing still in it. I have said that to myself at this bench for nine years, and you are the first thing to walk up the avenue that made it sound like an instruction.\n\nOne hundred and forty gold — the shrine's, not mine, for the novice who must be fed and trained to keep a basin she cannot yet sit still at.\\p And understand the terms of me: I will mend what you break and stand between you and what hunts you, and when your plan is cruel I will say so, once, quietly, at the moment you can still change it. I am told this is the most annoying possible arrangement. The teller was bleeding at the time, and lived.",
        choices: [
          { text: 'Walk with us, sister. [gold]140 gp[/]', if: { gold: 140 }, do: [{ recruit: 'quara-ramondo' }, { flag: 'quara-joined' }], goto: 'joined' },
          { text: 'The basin keeps you yet.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Quara Ramondo',
        text: "She rises, touches the water once — not a ritual you recognise; possibly just goodbye — and takes up a staff that was leaning by the bench the whole time, worn smooth at exactly two grip-heights.\n\nThe novice will keep the basin. The basin will keep the novice. It is a very reliable arrangement; it kept me.\\p Walk, then. I will be the quiet one. You will learn to hear it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Quara Ramondo',
        text: "Go gently. And when the city is too loud — there is water somewhere near you, being still, holding your place. There always is.",
      },
    },
  },

  // =========================================================================
  // 15. WYRM'S CROSSING
  // =========================================================================

  sergor: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sergor Starag',
        text: "Wyrm's Rock. Everything that crosses this river crosses it in front of me.\n\nThe office is bare stone, one table, two chairs, and a window commanding both spans of the bridge. The Fist Flame behind the table has a Damaran winter for a face and he does not ask you to sit.\n\nFlame Starag. State your names and your cargo. You have none? Everyone is cargo. State yourselves.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Sergor Starag',
        text: "Speak. I am listening completely, which people find worse than not being listened to at all.",
        choices: [
          { text: 'What is Wyrm\'s Rock for?', goto: 'rock' },
          { text: 'They say you interrogate in a room with a drain.', goto: 'drain' },
          { text: 'What crosses this bridge that worries you?', goto: 'worries' },
          { text: 'Flame.', cancel: true, goto: 'bye' },
        ],
      },
      rock: {
        speaker: 'Sergor Starag',
        text: "The throat of the city.\n\nHe turns slightly to the window, and the two spans lie below like a diagram of his own sentence.\n\nEverything from the south — Amn, Beregost, the Coast Way entire — funnels onto two spans of stone with a fortress between them. Close my gates and Baldur's Gate starves in twenty days; I have done the arithmetic annually for nine years. The toll pays the garrison. The garrison keeps the spans. The spans ARE the city, whatever the Upper City thinks the city is.\\p I am not liked in this posting. I am not required to be liked. I am required to be exact, and the bridge has not closed in nine years.",
        goto: 'hub',
      },
      drain: {
        speaker: 'Sergor Starag',
        text: "There is a room. There is a drain. The floor is scrubbed, which is what drains are for.\n\nHe says it without flinching from what you are implying, and without confirming it either, and you understand this is a man who has decided exactly where his lines are and will not show you the map.\n\nWhat happens in that room is interviews. Long ones. Boring ones, mostly — a smuggler's arithmetic falling apart across four hours is not theatre, it is bookkeeping. I do not beat answers out of people; beaten answers are WRONG, and I have no use for wrong.\\p The drain is for the fear, Flame Chergoba said once. She meant it as a criticism. I wrote it in the manual.",
        do: { flag: 'sergor-room-known' },
        goto: 'hub',
      },
      worries: {
        speaker: 'Sergor Starag',
        rumor: true,
        text: "This season: refugee trains thickening out of the south, freight thinning under them, and twice this tenday, cargo bonds with seals I could not fault and weights that were wrong. A seal I cannot fault is the most dangerous object on this bridge.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Sergor Starag',
        text: "Cross. Pay the clerk, mind the carts, and be exactly what you declared. Everyone who has ever regretted this bridge regretted the gap between those two things.",
      },
    },
  },

  'bardeid-astorio': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bardeid Astorio',
        text: "EELS! FRESH EELS! FRESHER THAN THE RIVER THEY— hello! Customers! Or an audience, either is good!\n\nThe stall is built out over the bridge parapet on four beams and visible faith, and the fishmonger fills it entirely: apron, grin, and a voice that reaches both banks.\n\nBardeid Astorio. North span. Three authorities have told me to take the stall down, and all three of them buy their eels here, WHICH I MENTION EVERY TIME.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bardeid Astorio',
        text: "So! Eels, or the news? The news is free with eels. The news is also free without eels but I say it quieter.",
        choices: [
          { text: 'Eels, then. For the road. [gold]2 gp[/]', if: { gold: 2 }, do: [{ gold: -2 }, { give: { id: 'rations', qty: 2 } }], goto: 'eels' },
          { text: 'How is the stall still standing? Legally?', goto: 'legal' },
          { text: 'The news, then. Loudly.', goto: 'news' },
          { text: 'Mind the beams, fishmonger.', cancel: true, goto: 'bye' },
        ],
      },
      eels: {
        speaker: 'Bardeid Astorio',
        text: "Smoked, wrapped, and better than whatever the inn was going to sell you — the inn buys from ME, so you have simply removed a middleman, WHICH IS GOOD ECONOMICS.\n\nHe wraps them with showman's flourish and enormous actual skill.\n\nMy grandfather sold eels off a boat below this bridge. My father sold them from a barrow ON the bridge. I have achieved ARCHITECTURE. The Astorios rise one storey a generation and my daughter is going to have a SHOP, with a DOOR.",
        goto: 'hub',
      },
      legal: {
        speaker: 'Bardeid Astorio',
        text: "LEGALLY, the stall does not exist! It is not on the bridge — measure it, go on! Not one beam touches the roadway! It is OVER the river, and the river is harbour jurisdiction, and the harbourmaster's office is a mile downstream and buys my eels on Fridays.\n\nHe raps a beam with total confidence.\n\nFlame Starag himself came out with the ordinance book. Read it, right here, twenty minutes, and closed it, and said — I will treasure this — 'the drafting is defective.' THE DRAFTING IS DEFECTIVE! That is bridge law! Then he bought four eels.\\p My grandfather is laughing in whatever afterlife takes eelmen, which is all of them. Eelmen are welcome everywhere.",
        do: { flag: 'astorio-loophole-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Bardeid Astorio',
        rumor: true,
        text: "A bridge stall hears BOTH banks — that is twice the city of any tavern! This tenday: more southbound families than northbound freight, and the toll queue arguing in Amnish, which means the Coast Way is squeezing somewhere and the eels and I will hear where by Friday.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Bardeid Astorio',
        text: "GO WELL! Mind the carts, mind the gulls, and tell them where the eels came from — the ADDRESS IS 'OVER THE RIVER', it is a LEGAL DISTINCTION!",
      },
    },
  },

  kallista: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kallista',
        text: "Sharess' Caress. Warm rooms, warm welcome, and nobody has ever been robbed in mine.\n\nThe festhall glows out over the south span — lamplight, incense, laughter arranged in comfortable registers — and the tiefling in the doorway wears the establishment like a second gown.\n\nKallista. Hostess. That last part of the greeting is not advertising, dears. It is a POLICY, and the bridge knows what enforcing it looks like, and we have all agreed not to need a second demonstration.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kallista',
        text: "So — rest, news, or merely the warmth? The fire is free. Everything else has a menu.",
        choices: [
          { text: 'Show us the house.', do: { shop: 'sharess-caress' }, goto: 'hub' },
          { text: 'Rooms for the night. [gold]20 gp[/]', if: { gold: 20 }, do: { heal: { cost: 20, hours: 8 } }, goto: 'rested' },
          { text: 'Tell us about the policy.', goto: 'policy' },
          { text: 'What does a festhall hear?', goto: 'news' },
          { text: 'Warmth to the house, hostess.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Kallista',
        text: "River side, top floor. The Chionthar talks under the windows all night, and the bridge lamps come in gold through the shutters, and it is the prettiest sleep for sale south of the walls.\n\nYou wake soothed, fed, and — you check, out of city habit — precisely as wealthy as you went to bed, minus the bill. The policy holds.",
        goto: 'hub',
      },
      policy: {
        speaker: 'Kallista',
        text: "Sharess is the goddess of pleasure, and pleasure, dears, is TRUST wearing its evening clothes.\n\nShe settles against the doorframe, professionally at ease and actually formidable.\n\nA guest who watches their purse cannot enjoy the wine. So: no theft in my house, ever, enforced without appeal. Eleven years ago a Guild cutpurse worked my common room. I did not call the Fist. I closed the house for one night and let the bridge wonder, and by morning the Guild had returned every coin with interest and a letter of apology I keep FRAMED, upstairs.\\p Nine-Fingers and I understand each other perfectly. Her people drink here. Off duty. It is the only neutral ground between the Rock and the river, and neutral ground, kept honestly, is worth more than either side.",
        do: { flag: 'kallista-neutral-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Kallista',
        rumor: true,
        text: "Everything crosses the bridge, and everything that crosses tired stops here, and tired people talk beautifully. Ask me anything except who said it — discretion is the other half of the policy, and the expensive half.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kallista',
        text: "Cross carefully, dears. And come back when the road has been unkind — that is what the house is FOR. The road is always eventually unkind.",
      },
    },
  },

  corrin: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Corrin Leagallow',
        text: "Toll's two coppers a head. I shall know you again; do not take it personally.\n\nThe booth is halfling-sized and the clerk fills it like a nut in its shell: spectacles, ledger, and eyes that take one unhurried pass across each of your faces and file them somewhere permanent.\n\nCorrin Leagallow. Twenty-six years, this booth. Go on, it is done — you are in the collection now.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Corrin Leagallow',
        text: "Something else? The queue is light. The queue is never light; treasure this.",
        choices: [
          { text: 'You memorise every face?', goto: 'faces' },
          { text: 'Why not write them down?', goto: 'writing' },
          { text: 'Anything cross lately that we should know about?', goto: 'news' },
          { text: 'Mind the booth, clerk.', cancel: true, goto: 'bye' },
        ],
      },
      faces: {
        speaker: 'Corrin Leagallow',
        text: "Every one, twenty-six years. Somewhere past the first ten thousand it stopped being memory and became something more like weather sense.\n\nHe polishes the spectacles, which you suspect are ceremonial.\n\nFaces come in families, you see — not blood families. Road families. The hopeful walk, the fleeing walk, the returning-and-dreading walk. You four are 'errand, armed, means well, will cause an incident anyway', which is my favourite family, professionally. Always something to see next market day.\\p And once a year, perhaps twice, a face crosses that belongs to no family at all. Those I remember with my whole spine. There has been one this season. Southbound. I am still thinking about it.",
        do: { flag: 'corrin-strange-face' },
        goto: 'hub',
      },
      writing: {
        speaker: 'Corrin Leagallow',
        text: "Because a written list can be bought, burned, or subpoenaed, and then everyone who ever crossed my bridge is in somebody's evidence.\n\nHe taps his own temple.\n\nIn HERE, the collection answers to exactly one authority, which is my judgement of who is asking and why. The Fist has asked. The Guild has asked, more politely, which offended me more. A patriar's clerk once offered me a year's wage for one fortnight of crossings.\\p They all got the same answer: the toll is two coppers, gentlemen, and the ledger records COIN. Faces are not revenue. Faces are guests, and a Leagallow does not sell the guest list. My grandmother ran an inn. Some laws are older than the city's.",
        goto: 'hub',
      },
      news: {
        speaker: 'Corrin Leagallow',
        rumor: true,
        text: "Professionally observed and freely given: the same three wagons have crossed north empty and south heavy four times this tenday, which is a shape of business with no honest name, and the Rock has not stopped them, which is the interesting part.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Corrin Leagallow',
        text: "Mind how you go. I shall know you next time — that is not a warning, it is the nearest thing to a welcome this booth is licensed for.",
      },
    },
  },

  // =========================================================================
  // 16. RIVINGTON
  // =========================================================================

  danthelon: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Danthelon',
        text: "THE DANCING AXE! Weapons, armour, shields — and I will not sell you a blade you cannot lift, THAT IS THE GUARANTEE!\n\nThe shop announces itself across half of Rivington, and so does the man: leather-aproned, delighted, arms like dock pilings, presiding over racked steel with the pride of a choirmaster.\n\nDanthelon! The axe over the door is the original — it danced, the story goes, and the story is EXCELLENT, and I will tell it at the slightest provocation!",
        goto: 'hub',
      },
      hub: {
        speaker: 'Danthelon',
        text: "SO! Buying, browsing, or provoking the story? All three are welcome and one is FREE!",
        choices: [
          { text: 'Show us the racks.', do: { shop: 'danthelons-dancing-axe' }, goto: 'hub' },
          { text: 'Fine. The story of the axe.', goto: 'axe' },
          { text: 'Why the south bank? Why not inside the walls?', goto: 'bank' },
          { text: 'What steel moves, this season?', goto: 'news' },
          { text: 'Guard the guarantee, shopman.', cancel: true, goto: 'bye' },
        ],
      },
      axe: {
        speaker: 'Danthelon',
        text: "PROVOKED! Excellent. Attend.\n\nHe takes a stance. This has been performed before, possibly today.\n\nMy great-uncle Wilden kept this shop, and one night a burglar came through the roof — the ROOF, mark the ambition — and the axe over the door came OFF ITS PEGS and chased him. Chased! Three streets! Witnesses on two of them! The Watch report — I have a COPY — says, and I quote, 'the instrument moved with apparent purpose.'\\p Now: was it a haunting? A ward Wilden paid a wizard for and never mentioned? Was it my great-aunt, who was strong as a derrick and fond of the dark? The FAMILY takes no position! The axe has not moved since! We keep the pegs LOOSE, out of respect, and burglars keep to the OTHER bank, out of SENSE!",
        do: { flag: 'dancing-axe-story' },
        goto: 'hub',
      },
      bank: {
        speaker: 'Danthelon',
        text: "Because the south bank is where steel is NEEDED, friend!\n\nHe gestures at the door, the road, the camps beyond it.\n\nInside the walls they buy rapiers to match their coats. Out here comes everyone the road chewed on the way in — carters, farm folk, caravan guards, refugees who reached the bridge with nothing and start over as bridge porters. They need honest mail at an honest weight, and a shopman who checks the FIT, and somebody to tell them their old sword is fine and only wants a new grip, WHICH IS USUALLY TRUE and loses me money every time I say it.\\p The Lionshields sell the north road. Danthelon sells the south. Between us the whole coast is covered and neither of us has ever said it out loud. THERE. Now it is said. HISTORIC.",
        goto: 'hub',
      },
      news: {
        speaker: 'Danthelon',
        rumor: true,
        text: "Steel news, freely: silvered goods are moving again for the first time since the spring — that is the Fields trouble — and somebody with deep pockets has been buying crossbow bolts in QUANTITY through the camps, which I have declined to supply, because quantity plus quiet equals a question with a BAD ANSWER.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Danthelon',
        text: "GO WELL! And mind the guarantee works both directions — anything of mine that fails you, bring back the PIECES and I make it RIGHT!",
      },
    },
  },

  alfira: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Alfira',
        text: "She is on a crate at the road's edge with a lute, singing something low for a family sorting their bundles — not a performance; more like lamplight, kept where people need it. When the verse ends she marks a small book with a pencil tied on ribbon.\n\nAlfira. The book comes up in a small salute.\n\nNames. Everyone who came up the road with me, and after me. It is nearly full. That is either hopeful or terrible and I change my mind daily.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Alfira',
        text: "Sit, if you like. The crate concert has no fee. Donations go entirely to the crate.",
        choices: [
          { text: 'Tell us about the book of names.', goto: 'book' },
          { text: 'You came up this road yourself.', goto: 'road' },
          { text: 'Bring the book, and the lute. Travel with us.', goto: 'join' },
          { text: 'What do the camps sing about?', goto: 'news' },
          { text: 'Keep the light on, bard.', cancel: true, goto: 'bye' },
        ],
      },
      book: {
        speaker: 'Alfira',
        text: "Every entry is a person who walked the Coast Way with everything they still owned.\n\nShe opens it — columns in a careful hand: names, home villages, the date they reached the bridge, and beside some, in lighter pencil, where they landed. A stall in Eastway. A farm place at Tallstag's. A grave marker, twice, drawn tiny and exact.\n\nThe city counts them as 'the camps'. One word. But a song about 'the camps' moves nobody, and a song about VELLA of TRADEMEET, who carried her mother's loom-weights three hundred miles and set up weaving by the bridge — that song got her four commissions and a roof.\\p Names are the whole difference between pity and witness. I am on the witness side. The book is my instrument. The lute is just louder.",
        do: { flag: 'alfira-book-known' },
        goto: 'hub',
      },
      road: {
        speaker: 'Alfira',
        text: "Four years ago, out of Elturel — after. With a teacher.\n\nShe tunes a string that did not need it, buying a small silence.\n\nShe did not finish the road. Her name is the first one in the book, and the book exists because when I reached this bridge, no one asked me who I had lost, only what I could pay.\\p I decided somebody at this end of the road should be the person who ASKS. It has been me ever since. It is better work than grieving and it is, if I am honest, the same work, worn kinder.",
        goto: 'hub',
      },
      join: {
        speaker: 'Alfira',
        text: "She looks down the road south, the direction the names come from, and then at you, and does the mathematics of it aloud.\n\nThe road is where the book's people come from. Someone should walk it who writes things down — who can stand in front of what happens out there and make it STAY happened, in verse, where the city cannot file it away.\n\nOne hundred and twenty gold. It finishes the well the camp is digging — ask Kanithar, the figure is his and he blushed asking.\\p And fair warning, because you seem the sort to deserve it: I write EVERYTHING down. Including you. Especially you. People behave beautifully or terribly when they think a bard is watching, and either way, the book gets a good page.",
        choices: [
          { text: 'Fill the book with us. [gold]120 gp[/]', if: { gold: 120 }, do: [{ recruit: 'alfira' }, { flag: 'alfira-joined' }], goto: 'joined' },
          { text: 'The crate needs you yet.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Alfira',
        text: "She hands the coin to a boy with instructions and a look that makes the instructions binding, slings the lute, and pockets the book with the pencil ready.\n\nRight.\n\nA breath, half nerves, half beginning.\n\nNew page. It says — she writes as she walks — 'Went south with four strangers who asked for the singer AND the book. Promising.'\\p Do try to stay promising. The rhymes for 'disappointing' are all terrible.",
        goto: 'hub',
      },
      news: {
        speaker: 'Alfira',
        rumor: true,
        text: "The camps sing home songs, mostly — Elturel's evening hymn, Amnish field rounds. Lately somebody has added a new verse to the bridge song, about paying the toll in names, and I did not write it, and I have not found who did, and it is BETTER than mine, which is professionally devastating.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Alfira',
        text: "Safe road. And if you meet anyone out there who needs remembering — send me the name. The book has room. I keep making room.",
      },
    },
  },

  grigor: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Grigor Dotsk',
        text: "Fist post, Rivington. Corporal Dotsk. If you are reporting a crime, the queue starts behind the other four crimes.\n\nThe post is a lean-to, a table, a kettle, and one Damaran corporal with the composure of a man bailing a boat with a spoon and refusing to stop on principle.\n\nFour spears and me, friend. The whole Coast Way funnels into Rivington, and the Rock gets the fortress, and I get — he indicates the lean-to, the road, the entirety of the south — the funnel.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Grigor Dotsk',
        text: "Well? Quickly, if you can — the kettle and the district both boil over on the hour.",
        choices: [
          { text: 'How bad is the post, honestly?', goto: 'post' },
          { text: 'What are you writing down?', goto: 'writing' },
          { text: 'Anything we can actually help with?', goto: 'news' },
          { text: 'Hold the funnel, corporal.', cancel: true, goto: 'bye' },
        ],
      },
      post: {
        speaker: 'Grigor Dotsk',
        text: "Arithmetic, honestly.\n\nHe counts on his fingers, deadpan.\n\nRivington: six thousand souls, plus the camps, call it nine. Wyrm's Rock garrison, two hundred men, a quarter mile north, guarding a BRIDGE from the possibility of a QUEUE. Me: four spears, one kettle. The kettle is the popular one.\n\nAnd here is the thing nobody at the Rock will have: it mostly WORKS, because Rivington polices itself — Kanithar settles the camps, Tallstag feeds the edges, Danthelon's volume alone deters street crime within earshot. My actual job is to be the uniform that stands next to what they were doing anyway, so the city thinks a uniform did it.\\p I put that in a report once. Word for word. It came back stamped 'NOTED', which in the Fist is a burial at sea.",
        do: { flag: 'grigor-arithmetic-known' },
        goto: 'hub',
      },
      writing: {
        speaker: 'Grigor Dotsk',
        text: "Everything. That is the project.\n\nHe turns the ledger so you can see: dates, incidents, needs, in a hand as neat as a paymaster's.\n\nEvery fire the camps put out themselves. Every grain delivery that arrived short. Every night the four of us covered nine thousand people and nothing went wrong DESPITE the arithmetic, and the three nights things did. Names redacted, patterns kept.\n\nBecause someday — a new Marshal, a Parliament inquiry, a bad fire — somebody with power is going to ask what was really happening south of the river, and on that day there will exist ONE honest document, and it will be this one.\\p A corporal cannot fix the Fist. A corporal can leave evidence. I have made my peace with which one I am doing.",
        goto: 'hub',
      },
      news: {
        speaker: 'Grigor Dotsk',
        rumor: true,
        text: "Since you offer: watch the road south of the last farms after dusk — three travellers this tenday came in white-faced saying the milestones had company. And if you pass the Rock, tell them my requisition for a FIFTH SPEAR enters its third year. I have started decorating it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Grigor Dotsk',
        text: "Mind how you go. And if anything happens out there — tell somebody it happened. You would be amazed how much of this job is just being the place where things get SAID.",
      },
    },
  },

  arveene: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Arveene Tallstag',
        text: "Food, rations, remedies. It is all off my own ground and I will tell you which field.\n\nThe trestle at the road's edge is ranked with produce in parade order, and the woman behind it has the settled authority of somebody who argues with weather for a living and wins slightly more than half the time.\n\nArveene Tallstag. Last flat ground before the city. Everything the wall eats comes past this table, and a fair bit of it FROM it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Arveene Tallstag',
        text: "Well then. Buying, or asking? Both are fine; only one of them moves cabbages.",
        choices: [
          { text: 'Show us the trestle.', do: { shop: 'rivington-provisions' }, goto: 'hub' },
          { text: 'Tell us about the "spoilage".', goto: 'spoilage' },
          { text: 'What is farming the city\'s doorstep like?', goto: 'farming' },
          { text: 'What does the road tell a farmer?', goto: 'news' },
          { text: 'Good harvests to you.', cancel: true, goto: 'bye' },
        ],
      },
      spoilage: {
        speaker: 'Arveene Tallstag',
        text: "Spoilage is spoilage. Produce that will not keep to market. It goes to the camps because the alternative is the pigs, and the pigs are fat enough.\n\nShe weighs your look and elects, visibly, to be caught.\n\nFine. My 'spoilage' runs a third of the harvest in a good year and rather more in a bad one, and it is the best-looking spoilage on the coast, and Brother Stedd collects it in crates I somehow never get back, and the account books balance because I am creative and my husband was a clerk before he was a farmer and taught me exactly one crime.\\p Say a word of this at market and I will deny it with my whole chest. Charity prices are contagious, and I have neighbours who would catch meanness from it instead.",
        do: { flag: 'arveene-spoilage-known' },
        goto: 'hub',
      },
      farming: {
        speaker: 'Arveene Tallstag',
        text: "It is farming with an audience.\n\nShe tops up a basket without pausing.\n\nThe wall watches you plough. The camps watch you harvest. The Fist watches everybody, and the gulls watch the lot of us and answer to no flag. Every cabbage on this table has been wanted by four parties before it was ever picked.\n\nGood ground, though — river silt, the best on the coast. My family has cropped it since before the Outer City reached us, and we will crop it after the next thing happens, whatever the next thing is. That is what farms are FOR. Cities have events. Farms have Tuesdays.\\p I have buried two wars under those furrows, and the barley comes up every year knowing nothing about either, and I find that the most reassuring fact I own.",
        goto: 'hub',
      },
      news: {
        speaker: 'Arveene Tallstag',
        rumor: true,
        text: "A farmer reads the road by what it buys. This tenday it is buying travel bread and liniment and NOT buying seed, which means people moving through, not settling — and more of them than the bridge admits to counting.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Arveene Tallstag',
        text: "Take the greens; they travel. And mind Duchess by the gate — the hen. She has opinions about strangers and the beak to publish them.",
      },
    },
  },

  kanithar: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kanithar Ulmokina',
        text: "He is seated on a bench between the tents where the path widens, and you understand within four steps that the bench is an office, and the queue of one waiting behind you is a docket.\n\nKanithar Ulmokina.\n\nHe inclines his head, Rashemi-grave.\n\nI speak for the camps — three hundred souls, thirty tongues. I did not seek the post. I sat still too long in a visible place, and now the sitting is the work.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kanithar Ulmokina',
        text: "Ask. The bench hears everything; it may as well hear you.",
        choices: [
          { text: 'How do the camps stand, truly?', goto: 'camps' },
          { text: 'A woman named Selise Falone was walking here.', if: { flag: 'selise-directed' }, goto: 'selise' },
          { text: 'What do the camps need most?', goto: 'needs' },
          { text: 'Where did you walk from?', goto: 'from' },
          { text: 'Strength to the bench, elder.', cancel: true, goto: 'bye' },
        ],
      },
      camps: {
        speaker: 'Kanithar Ulmokina',
        text: "Better than the city believes and worse than it pretends.\n\nHe folds his hands, a man ordering an inventory.\n\nWe have water — the well is nearly dug. We have bread: Tallstag's table, Stedd's cauldron, the district's own strange mercy. We have work, at bridge wages, which are wages. What we do not have is TOMORROW — no tenancy, no writ, nothing in writing anywhere that says these three hundred people may still be here when the Parliament next remembers the word 'Rivington'.\\p A camp can survive rain, fever, even the Fist. What kills camps is indefiniteness. I spend my days manufacturing tomorrow out of routines — school at the ropewalk, elections for the water rota. Small clocks, wound daily. People can live on clocks a long time. Not forever.",
        do: { flag: 'camps-tomorrow-known' },
        goto: 'hub',
      },
      selise: {
        speaker: 'Kanithar Ulmokina',
        text: "Falone. Beregost. Two children and a handcart.\n\nHe does not consult anything; the ledger is behind his eyes.\n\nShe arrived eight days ago. The elder boy had road-fever; Sister Atala broke it in two nights. She has the corner tent by the ropewalk and three days of washing work at the Caress, and the younger one has already joined the bridge children's parliament, which is more functional than the city's.\n\nHe studies you a moment.\n\nShe named the strangers on the road who told her to ask for me. She said it the way people out here say such things — as a debt she is carrying carefully.\\p It was a small kindness, you will say. Out here we weigh them differently. A name given at the right mile is worth a wall. You built one of hers. The camps note it.",
        do: [{ flag: 'selise-arrived' }, { rep: { id: 'harpers', amount: 1 } }],
        goto: 'hub',
      },
      needs: {
        speaker: 'Kanithar Ulmokina',
        text: "Ranked, since you ask like somebody who ranks things.\n\nThe well finished — forty gold of stone lining, and Alfira is singing at the fund nightly. Ink: every paper the city will ever accept from us must be written, and paper is dearer than bread out here. And a NAME — not 'the camps'. Names are what the city files; 'the camps' is what it floods.\\p I have proposed 'Rivington Reach' to the district. Bree the ferrywoman is spreading it for me, one crossing at a time, because a name that arrives by ferry sounds like it was always true. Ask her the fare sometime. You will learn the whole economy of this bank in one sentence.",
        goto: 'hub',
      },
      from: {
        speaker: 'Kanithar Ulmokina',
        text: "Far east, and I will leave it at that, and you will let me, because you are polite.\n\nHis face does not change, but the grammar of him does, subtly, like ice settling.\n\nI will say this much, for it is the useful part: I have been the man arriving with nothing, twice, in two different decades, in two different lands. I know the exact weight of the bundle and the exact face of the clerk who decides your winter.\\p That is my entire qualification for this bench, and it is the only qualification the bench respects. The camps did not choose me for wisdom. They chose me because I remember the weight.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kanithar Ulmokina',
        text: "Go well. And practice saying 'Rivington Reach' — the name needs feet, and yours travel further than most.",
      },
    },
  },

  'bree-goodbarrel': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bree Goodbarrel',
        text: "Ferry! Crossing the— oh, you are not for crossing, you are for TALKING. Even better, talking floats free.\n\nThe boat is halfling-sized, tar-dark and immaculate, and its mistress ships the oars with the ease of somebody doing it since before she could see over them.\n\nBree Goodbarrel. Below-bridge crossing. A copper when I remember to charge, which is — she considers honestly — Tuesdays?",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bree Goodbarrel',
        text: "Ask away! The river is patient and the queue is imaginary.",
        choices: [
          { text: 'A copper? The bridge charges two.', goto: 'fare' },
          { text: 'What does the river tell you?', goto: 'river' },
          { text: 'Kanithar says you are spreading a name.', if: { flag: 'camps-tomorrow-known' }, goto: 'name' },
          { text: 'Row well, ferrywoman.', cancel: true, goto: 'bye' },
        ],
      },
      fare: {
        speaker: 'Bree Goodbarrel',
        text: "The bridge charges two coppers and a QUEUE, and the queue is the real price — an hour of your morning, standing in Flame Starag's shadow being counted.\n\nShe pats the gunwale.\n\nMy crossing costs a copper, four minutes, and a conversation, and I forget the copper whenever the passenger looks like the copper matters. Rivington folk mostly. The toll is for people going TO money. Nobody rows away from the bridge toward money; I have checked, for years.\\p The clerk up there — Corrin — sends me his overflow with a wave, and I send him gossip with the current. Between us the river works. The city thinks it is infrastructure. It is two people being sensible.",
        goto: 'hub',
      },
      river: {
        speaker: 'Bree Goodbarrel',
        rumor: true,
        text: "Everything ends up in the Chionthar, dear — news, cargo, secrets, the occasional gentleman. This tenday the river smells of pitch above the harbour, which means the dry docks are busy, which means somebody rich is expecting trouble at sea.",
        goto: 'hub',
      },
      name: {
        speaker: 'Bree Goodbarrel',
        text: "Rivington Reach! — she says it exactly the way you would say 'fine weather', which is clearly the technique.\n\nFourth crossing today it has come up, and I never bring it up, that is the ART of it. You say a name like it is already old, and by autumn the fish-wives say it, and by winter the carters, and one day a Fist clerk writes it on a form because he has HEARD it, and then, my dear, it is REAL. Paper is how the city dreams. We are smuggling a name into the city's dreams one boatload at a time.\\p Kanithar worked all this out on his bench. That man could take a city with an afternoon and a rowing boat. LUCKY for everyone he only wants a well.",
        do: { flag: 'rivington-reach-spread' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Bree Goodbarrel',
        text: "Off you pop! And if you ever need the crossing at a strange hour — knock the rail three times. The river and I keep no schedule, only habits.",
      },
    },
  },

  'rivington-chicken': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Duchess',
        text: "A hen of considerable presence is patrolling the farm gate. She has the plumage of an ordinary red hen and the bearing of a garrison commander, and she has clocked your party as a formation and is assessing it flank by flank.\n\nThis is, unmistakably, Duchess.",
        choices: [
          { text: 'Offer a respectful pinch of grain.', goto: 'grain' },
          { text: 'Attempt to pass the gate.', goto: 'gate' },
          { text: 'Withdraw from the inspection.', cancel: true, goto: 'bye' },
        ],
      },
      grain: {
        speaker: 'Duchess',
        text: "The tribute is inspected with one eye, then the other, then accepted in three precise strikes. You are then given a look that establishes, beyond appeal, that this changes nothing between you.\n\nFrom the trestle, Arveene, not looking up: \"She was named as a joke about the Upper City. Then she grew into it. We do not make that joke any more.\"",
        do: { flag: 'duchess-tribute-paid' },
        goto: 'start',
      },
      gate: {
        speaker: 'Duchess',
        text: "Duchess repositions. It is one unhurried sidestep, and it places her exactly in your line of march with the geometric authority of a toll gate.\n\nYou could step over her. You both know you could step over her. You also both know, somehow, that you are not going to, and after a moment of being looked at, you adjust your route around the gatepost instead.\n\nBehind you, distinctly, the hen resumes patrol.",
        goto: 'start',
      },
      bye: {
        speaker: 'Duchess',
        text: "You withdraw in good order. Duchess notes it, files it, and returns to the wall — the walked stretch of it, her stretch — leaving you with the peculiar conviction that the farm is, in fact, adequately defended.",
      },
    },
  },

  // =========================================================================
  // 17. GRAY HARBOUR
  // =========================================================================

  imzel: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Imzel Chergoba',
        text: "Flame Chergoba. The board is on the wall behind me. Read it before you talk.\n\nThe Seatower's command room smells of salt, lamp oil and paper, and the woman at the table has a Rashemi accent worn smooth by nineteen years and a face that has given up nothing in the same period.\n\nShe finishes the line she is writing before she looks up, and when she looks up you have the whole of her attention, which is a weight.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Imzel Chergoba',
        text: "Say it plainly. I have been in this uniform nineteen years; I am out of patience for preambles, and it is not coming back.",
        choices: [
          { text: 'What work does the Fist post?', goto: 'board' },
          { text: 'What is the Flaming Fist, to you?', goto: 'fist' },
          { text: 'The harbour looks wrong lately.', goto: 'harbour' },
          { text: 'March with us, Flame. The city\'s business is done.', if: { questDone: 'the-fourth-chair' }, goto: 'join' },
          { text: 'Flame.', cancel: true, goto: 'bye' },
        ],
      },
      board: {
        speaker: 'Imzel Chergoba',
        rumor: true,
        text: "Escorts on the Trade Way and the Coast Way. Road-clearing. Bounties on whatever is taking travellers south of the river. The board pays flat rates, posted, no haggling — the one corner of this company where the price is the price.\n\nDo the work clean and the Fist learns your name. In this city that is worth more than the fee, and costs more too, eventually. Everything here has a second price. You will find yours.",
        goto: 'hub',
      },
      fist: {
        speaker: 'Imzel Chergoba',
        text: "A mercenary company that woke up one morning owning a city, and has spent forty years pretending it planned that.\n\nShe sets down the pen, which means this answer is the real one.\n\nIt is corrupt at the gates and honest in the middle, which is the opposite of most institutions and harder to fix. It is also, and I say this with my whole nineteen years: the only thing standing between this city and the road. I have seen the road. I came up it with a spear and no Common.\\p Ravengard is trying to make the company worth what it costs. He will not finish in his lifetime. I will not finish in mine. You do the work anyway. That is what a wall is — stones that agreed to keep standing.",
        do: { flag: 'imzel-creed-known' },
        goto: 'hub',
      },
      harbour: {
        speaker: 'Imzel Chergoba',
        text: "It does. You have eyes.\n\nShe comes to the window, and the harbour lies below: quays, hulls, the grey water working.\n\nDock wages down, dock injuries up, and cargo moving to Wyrm's Rock that has no business preferring a fortress to a harbour. Somebody is squeezing the wharf trade and doing it slowly enough that no single tenday is worth an inquiry.\\p The Water Queen's House took in a ship this month that every sailor on the quay walks wide of. Vonda Pisacar does not frighten. She is frightened now. When the priestess of Umberlee starts keeping her voice down, harbourmasters should listen. I am listening. So far the harbour is only whispering. When it says a name, I will act on it.",
        goto: 'hub',
      },
      join: {
        speaker: 'Imzel Chergoba',
        text: "She considers you for a long moment, and then she does something you have not seen her do: she takes off the gorget, and sets it on the table, and rolls her neck like a woman setting down a yoke.\n\nThe chair business is settled. The company owes you past what its ledgers can write, and Ravengard has told me — ordered me, which was kind of him, it saves me deciding — to take the Fist's business onto the road while the city digests what you did to it.\n\nNo fee. I have drawn Fist wages nineteen years and never once spent the field allowance; I am the cheapest expensive soldier you will ever hire.\\p One condition. When we pass a Fist post doing its work badly, I will stop and correct it, and you will wait, and it will be boring. That is the whole price of me.",
        choices: [
          { text: 'March with us, Flame Chergoba.', do: [{ recruit: 'imzel-chergoba' }, { flag: 'imzel-joined' }], goto: 'joined' },
          { text: 'The Seatower needs you a while yet.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Imzel Chergoba',
        text: "She signs three documents without sitting down, hands the watch to a lieutenant who has clearly been ready for years, and takes a halberd off the wall rack that is visibly older and better-kept than everything else on it.\n\nMine from Rashemen. It has walked further than the whole garrison.\n\nAt the door she pauses, once, and looks back at the command room, and does not sigh.\n\nRight. The road, then. I warn you now: I sing on marches. Nobody warns anybody about that in time. It is traditional.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Imzel Chergoba',
        text: "Read the board on your way out. And mind the Seatower stairs — they were cut for sailors, and sailors fall differently.",
      },
    },
  },

  bran: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bran Windrivver',
        text: "CHANDLERY! Rope, oil, rations, shot and boat gear — I AM NOT ANGRY, THIS IS MY VOICE.\n\nThe harbourmaster's store smells of tar and hemp and herring, and the man behind the counter has shoulders like a capstan and a voice calibrated to carry over four hundred yards of working wharf, which indoors is a lot.\n\nBran Windrivver. Harbourmaster. THIRTY YEARS. Everything a ship or a road needs, and I can tell your draught by LOOKING AT YOU.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bran Windrivver',
        text: "WELL? Speak up. Not for my sake — the gulls listen and I like them to feel included.",
        choices: [
          { text: 'Show us the chandlery.', do: { shop: 'gray-harbour-chandlery' }, goto: 'hub' },
          { text: 'What is our draught, then?', goto: 'draught' },
          { text: 'How does the harbour fare?', goto: 'harbour' },
          { text: 'What is the wharf saying?', goto: 'news' },
          { text: 'Fair winds, harbourmaster.', cancel: true, goto: 'bye' },
        ],
      },
      draught: {
        speaker: 'Bran Windrivver',
        text: "HA. Right.\n\nHe leans on the counter and reads you like a manifest, one at a time, top to bottom.\n\nHeavy in the boots, light in the purse — no, MIDDLING in the purse, purse recently IMPROVED. Armed past the wharf average, walked further than you sailed, and carrying — he squints — one object in that pack that none of you wants to be the one holding it. Am I wrong? I AM NEVER WRONG. Thirty years reading hulls; people are just hulls that complain.\\p Deep draught, the lot of you. Deep draught means you can carry. It also means you touch bottom where light boats pass. MIND THE CHANNELS.",
        goto: 'hub',
      },
      harbour: {
        speaker: 'Bran Windrivver',
        text: "The water is fine. The BUSINESS is sick.\n\nHe jerks a thumb at the window, the quays, the idle cranes.\n\nEleven berths empty at the busy season. Cargo consigned past us to Wyrm's Rock — a FORTRESS, with a WINCH, doing a HARBOUR'S work — because somebody made the Rock's fees pretty and let ours climb. Stevedores on half-shifts. Vola put down a crate last tenday and there was no next crate. You know what a wharf sounds like when the shouting stops? WRONG. It sounds WRONG.\\p Thirty years I have kept this water honest. Whoever is starving it is doing it from a desk, and desks are the one thing I have never learned to read. FIND ME THE DESK and the harbour will owe you.",
        do: { flag: 'harbour-squeeze-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Bran Windrivver',
        rumor: true,
        text: "The wharf says: the Water Queen took delivery of a ship nobody ordered, the dry docks are lit past midnight, and the herring have moved deep early, which the sailors mind more than either of the first two. FISH KNOW THINGS.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Bran Windrivver',
        text: "OFF YOU GO. And oil those boots — you are one wet crossing from learning why chandlers die rich!",
      },
    },
  },

  vonda: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Vonda Pisacar',
        text: "The Bitch Queen's house. She takes what she is owed. I only carry the reckoning.\n\nThe Water Queen's House is the oldest stone in Baldur's Gate, and it is cold in every season, and the tide-bowl at its heart never stops moving. The Mother of Storms stands beside it in vestments the grey-green of deep water, and her voice has the cadence of liturgy even ordering candles.\n\nVonda Pisacar. Say what you came to say. In this house, all of it is heard twice — once by me.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Vonda Pisacar',
        text: "Well? The tide does not wait, and I have given up apologising for what it teaches me about conversation.",
        choices: [
          { text: 'What mercies does the House sell?', do: { shop: 'water-queens-house' }, goto: 'hub' },
          { text: 'A ship came in that should not have.', if: { questNot: 'umberlees-tithe' }, do: { quest: 'umberlees-tithe' }, goto: 'tithe' },
          { text: 'The tithe is paid. The pearl, with our own hand.', if: { all: [{ quest: 'umberlees-tithe' }, { item: 'gem-black-pearl' }] }, do: [{ take: 'gem-black-pearl' }, { complete: 'umberlees-tithe' }, { rep: { id: 'lords-alliance', amount: 2 } }], goto: 'tithe-done' },
          { text: 'Why serve Umberlee at all?', goto: 'why' },
          { text: 'Mother of Storms.', cancel: true, goto: 'bye' },
        ],
      },
      tithe: {
        speaker: 'Vonda Pisacar',
        once: true,
        text: "So the harbour sent you. Good. The harbour is learning.\n\nShe walks you to the window, and points, and you follow the line of her arm to a carrack riding at anchor apart from every other hull, and you understand that the other ships have moved away from it the way a congregation moves from a coffin.\n\nShe came in on a dead calm with her sails furled and her way on. Her crew were at their stations. They had been drowned for a tenday — at their stations, hands on the lines, drowned standing up.\n\nHer master crossed the Queen's water without paying, and mocked the paying, and the Queen has come up the anchor chain to collect the difference in person.\\p Hear the tithe, and do not bargain, for I have no authority to bargain and neither does anyone. Clear what came up with her — it will not stay aboard; it is already in the harbour water. Break the standing wave that has held off the quay since dawn. And in the wreck of her master's cabin there is a black pearl he stole from a sea-shrine in the Nelanther. The Queen names it as her share.\n\nBring it, and put it in the tide-bowl with your own hand. Your OWN hand. The House cannot touch another's tithe. That is the whole of the law I serve, and tonight it is not gentle.",
        goto: 'hub',
      },
      'tithe-done': {
        speaker: 'Vonda Pisacar',
        text: "You put the pearl into the tide-bowl with your own hand, and the water takes it — takes it, visibly, the way a purse takes a coin — and the bowl goes still for the first time since you entered this house.\n\nStill. You did not know it had never been still. Now you know.\n\nVonda watches the stillness with an expression you were not meant to see: relief, and under it, awe that thirty years of service has not worn ordinary.\n\nThe tithe is paid. The harbour is hers again — which it always was; now it is hers and QUIET about it. Ships will come in sweetly for a season, and the sailors will say the weather turned, and I will not correct them, for the Queen loves a rumour of mercy so long as nobody relies on it.\\p You have paid Umberlee with your own hand and taken no scratch from it. Sailors will drink with you on the strength of that who would not drink with kings. It is a better coin than you think, in this city. Spend it slowly.",
        goto: 'hub',
      },
      why: {
        speaker: 'Vonda Pisacar',
        text: "Because the sea does not become kind when you stop believing in her. She only becomes uninsured.\n\nShe says it without heat, an actuary of drowning.\n\nEvery hull out of Gray Harbour carries someone's whole family fortune and someone's whole family. Lathander cannot bring them home. Gond cannot. The Queen can — or rather, the Queen can refrain, which on the water is the same power. I keep the tithes honest so that refusal stays purchasable. I am not loved for it. The drowned are not consulted for their opinion of the arrangement, but I have stood at three hundred rails with three hundred widows, and not one of them asked me whether Umberlee is NICE.\\p The House heals, mind. Antitoxin, salt-mercy, the raising of the drowned in the first hour. The Queen takes; the Queen's house gives back what it can. That balance is my whole priesthood, and I keep it to the copper.",
        do: { flag: 'vonda-balance-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Vonda Pisacar',
        text: "Go, and pay what the water asks before it asks twice. That is the whole of the catechism travellers need.",
      },
    },
  },

  sudeiman: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sudeiman Khalid',
        text: "Ah. No. Yes. Forgive me — you have the look of people about to ask me for something, and I find it saves time to begin apologising immediately.\n\nHe is Calishite, neat as a bill of lading, stationed between two stacks of crates with a portfolio under his arm and the permanent wince of a man whose conscience is on a payment plan.\n\nSudeiman Khalid. Dock factor. I facilitate. It is a beautiful word and I hide a great deal behind it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Sudeiman Khalid',
        text: "How may I be of service? I say that sincerely. The sincerity is the part that costs me.",
        choices: [
          { text: 'What exactly do you facilitate?', goto: 'trade' },
          { text: 'We need a look at a cargo manifest.', if: { gold: 15 }, do: { gold: -15 }, goto: 'manifest' },
          { text: 'Why apologise for everything?', goto: 'sorry' },
          { text: 'Facilitate in peace, factor.', cancel: true, goto: 'bye' },
        ],
      },
      trade: {
        speaker: 'Sudeiman Khalid',
        text: "Officially: I match cargo to hulls and hulls to buyers, and take a factor's percentage, and it is all extremely legal and I have the stamps.\n\nHe lowers his voice and leans in, apologising with his whole posture.\n\nUnofficially — and I am so sorry to be like this — a manifest is only paper, and paper can be read, and certain parties pay to read it before the harbourmaster does. Who is shipping what, insured for how much, guarded by how many. I sell the reading. I am not proud. Well. I am a LITTLE proud; the copying is very fast and I have never once been caught, and — no. No, proud is the wrong word. Solvent. I am solvent.\\p Everyone on this wharf does something the tide would not approve of. Mine merely has better handwriting.",
        goto: 'hub',
      },
      manifest: {
        speaker: 'Sudeiman Khalid',
        text: "Of course, of course — fifteen gold, which I want you to know is the FRIEND rate, and I am now going to be anxious about whether we are friends.\n\nThe portfolio opens; a copy appears with conjurer's speed; the portfolio closes.\n\nThere. This tenday's harbour, in summary, and I am sorry for what it tells you: the empty berths are not empty by accident. Three consignments a tenday rebooked from Gray Harbour to Wyrm's Rock, all through the same broker's mark — a little anchor-and-key, no house name — paying a premium to move AWAY from the cheaper harbour, which no honest freight has ever done in the history of water.\\p Somebody is paying extra for the Rock's privacy. I do not know who. I have been careful not to know who, and even MORE careful to notice exactly how careful that is.",
        do: { flag: 'anchor-and-key-known' },
        goto: 'hub',
      },
      sorry: {
        speaker: 'Sudeiman Khalid',
        text: "Because I am, you see. That is the terrible inefficiency of me.\n\nHe straightens his cuffs, miserably candid.\n\nMy cousin Meilil — the little one, the water-seller in the enclave — keeps a list of 'them'. The ones who get you to owe. I facilitate for 'them', daily, with excellent handwriting. And every copy I sell, some small voice with my mother's accent says: Sudeiman, this pays for the winter, and also, Sudeiman, you know exactly what it pays FOR.\\p Most men in my trade drown the voice. I have decided to keep mine fed instead. It is why my rates are high — the apology is included, and the apology is REAL, and one day, when the right person asks me the right question, the apology intends to testify.",
        do: { flag: 'sudeiman-conscience-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Sudeiman Khalid',
        text: "Go well — and I am sorry about the gulls, in advance. They know me, and by association they will now expect things of you.",
      },
    },
  },

  vola: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Vola',
        text: "She is sitting on a crate that took two men to bring ashore, eating bread and dripping, watching the harbour not work.\n\nVola.\n\nShe looks you over once.\n\nYou carry your own packs. Good start. Most people I meet are furniture with opinions.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Vola',
        text: "Talk if you want. Crate's got room. Harbour's got nothing better on.",
        choices: [
          { text: 'How goes the wharf work?', goto: 'work' },
          { text: 'They say you broke three arms on this quay.', goto: 'arms' },
          { text: 'Swing an axe for us instead. For pay.', goto: 'join' },
          { text: 'Mind the crate, stevedore.', cancel: true, goto: 'bye' },
        ],
      },
      work: {
        speaker: 'Vola',
        text: "Slow.\n\nShe tears the bread, unhurried.\n\nNineteen years, this wharf. Used to be, the day started before the sun and the crates never stopped. Now — she nods at the empty berths — half-shifts. Cargo's gone to the Rock. Rich men's business, moved by paper. Paper is heavy for everyone except the men holding it. Noticed that?\\p Wharf work is honest: pick it up, put it down, get paid, ache. I am watching the honest part dry up while the paper part grows. Says something about this city. Says it loudly.",
        goto: 'hub',
      },
      arms: {
        speaker: 'Vola',
        text: "Three. All earned.\n\nShe holds up fingers, counting with the bread still in hand.\n\nOne: put his hand where a hand goes asking first. Two: shorted a day-girl's wage and laughed about it, and the laugh was the mistake. Three — she considers — three I will give you free: he kicked the wharf cat. Broke his arm same hour. Magistrate asked me if I regretted it. Told him: ask the cat.\\p Two of the three drink with me now. Arms heal. Manners keep. Wharf rules are short rules, but they hold better than the city's.",
        do: { flag: 'vola-arms-known' },
        goto: 'hub',
      },
      join: {
        speaker: 'Vola',
        text: "She finishes the bread, brushes her hands, and stands off the crate, and standing she is a different fact than sitting.\n\nAxe work instead of crate work. Same motion, better pay, worse company usually. Yours looks — she assesses — tolerable.\n\nHundred and eighty gold. Ship-share rate, what a good voyage pays out. I am not walking off this wharf for less than the sea offers, on principle.",
        choices: [
          { text: 'Ship-share it is. [gold]180 gp[/]', if: { gold: 180 }, do: [{ recruit: 'vola' }, { flag: 'vola-joined' }], goto: 'joined' },
          { text: 'The crates need you yet.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Vola',
        text: "She fetches a greataxe from behind the harbourmaster's rain barrel — stored there, you realise, the way other people leave an umbrella at a friend's.\n\nBran holds my tools. Held.\n\nShe shoulders it, and rolls her neck, and something that was banked in her lights all the way up.\n\nRight. Fair warning: I count things. Crates, doors, enemies. When I say a number in a fight, it is the number left. Saves talk.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Vola',
        text: "Mind the third bollard walking back. Rope's frayed. Been reporting it a month. Cheaper to warn people than fix it, apparently.",
      },
    },
  },

  'marta-agosto': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Marta Agosto',
        text: "The Lantern. Beds above, tables below, and no questions on either deck.\n\nThe Low Lantern is a three-masted merchantman that will never sail again and has made peace with it gorgeously: lamplight in the rigging, dice on the gun deck, and a mistress leaning on the rail at the head of the gangway like the figurehead's cleverer sister.\n\nMarta Agosto. Welcome aboard. Mind your head below and your purse at the tables — the first out of courtesy, the second out of MY courtesy, because past that rail it is your own affair.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Marta Agosto',
        text: "So, loves. Sleeping, playing, or selling? The Lantern does all three and remembers none of them.",
        choices: [
          { text: 'Show us the house.', do: { shop: 'low-lantern' }, goto: 'hub' },
          { text: 'A cabin for the night. [gold]15 gp[/]', if: { gold: 15 }, do: { heal: { cost: 15, hours: 8 } }, goto: 'rested' },
          { text: 'The house always wins, they say.', goto: 'house' },
          { text: 'What passes across your tables?', goto: 'news' },
          { text: 'Keep her afloat, captain.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Marta Agosto',
        text: "The stern cabin — the old master's own, and he had taste. The river rocks her just enough to remember she is a ship, and the dice below sound like soft rain on the deckhead.\n\nYou sleep the sleep of the anchored, and wake to gulls and the smell of the galley doing something ambitious with yesterday's catch.",
        goto: 'hub',
      },
      house: {
        speaker: 'Marta Agosto',
        text: "The house always wins, yes — and the trick, loves, is that I have arranged for that to be TRUE, and honestly true, which is rarer.\n\nShe walks two fingers along the rail, purring the arithmetic.\n\nStraight dice, posted odds, and a margin thin as a sail's edge — the house takes three in a hundred, forever, and forever is the whole secret. Crooked houses win fast and die young; the Lantern wins slow and is IMMORTAL. I learned it watching my mother's card table in Little Calimshan: never cheat, never hurry, never let a debt grow past what a friendship can carry.\\p The fencing, now — she says it without a flicker — that is the OTHER deck, and the other deck's rule is the same rule. Fair price, no questions, no hurry. The Guild sends me their delicate things because I am patient. Patience is the only vice I run at full stake.",
        do: { flag: 'lantern-house-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Marta Agosto',
        rumor: true,
        text: "Everything crosses a gaming table eventually, loves — coin, cargo, secrets, marriages. This tenday the tables are loud with harbour men betting angry, and angry money always knows something before it says it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Marta Agosto',
        text: "Mind the gangway, loves — the river takes a step a season, and it has never once given one back. Ships and cities both, that is the tide for you.",
      },
    },
  },

  gundis: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Gundis Balderk',
        text: "MIND THE— no, too late, you have stepped in the pitch. Everyone steps in the pitch. I have requested a sign for eleven years.\n\nThe Oberon dry docks rise around you in a cathedral of scaffolding, and the dwarf foreman in the middle of it wears his displeasure like a well-fitted coat, which is to say: permanently, and with pride.\n\nGundis Balderk. Foreman. Forty years, and I will tell you what I tell the Oberons: the scaffolds do not fall down. THAT is my argument, complete.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Gundis Balderk',
        text: "Go on then, since you are here and the pitch is already ruined for both of us.",
        choices: [
          { text: 'What are you building?', goto: 'building' },
          { text: 'Forty years of complaint. Any of it fixed?', goto: 'complaint' },
          { text: 'The docks are lit past midnight, we hear.', goto: 'midnight' },
          { text: 'Mind the pitch, foreman.', cancel: true, goto: 'bye' },
        ],
      },
      building: {
        speaker: 'Gundis Balderk',
        text: "Rebuilding. Different word, better trade.\n\nHe slaps a rib of the hull looming overhead, with disapproval and total love.\n\nThis one took a reef off the Nelanther and came home on prayers and pumps. We take her down to the honest wood and put her back better than her builders managed the first time, because her builders — he inhales through his nose — were LANTANESE, and Lantanese builders design for the sea they WISH existed.\\p A dwarf builds for the sea that showed up. Forty years, no Balderk hull lost to weather. Lost to PIRATES, twice, which I take personally but cannot scaffold against.",
        goto: 'hub',
      },
      complaint: {
        speaker: 'Gundis Balderk',
        text: "Every word of it fixed. THAT is what nobody understands about complaint.\n\nHe counts on thick fingers, gaining momentum.\n\nI complained about the crane ropes: renewed, nobody crushed. Complained about the sluice: rebuilt, no more winter flooding. Complained about the apprentice ladders for nine years — NINE — and the day after young Oberon finally signed the order, a lad slipped and the new rail held him, and I went home and told my wife: there. Nine years of my breath, one boy's neck, fair trade.\\p Cheerful men let things slide. Complaint is LOVE, with paperwork. The scaffolds do not fall down because I have never once been pleasant about them.",
        do: { flag: 'gundis-complaint-creed' },
        goto: 'hub',
      },
      midnight: {
        speaker: 'Gundis Balderk',
        rumor: true,
        text: "We are. Double shifts on a patriar hull that came in sound and is being refitted anyway — armoured ports, strongbox holds, davits for boats she should not need. Somebody rich is dressing a merchantman for trouble, paying rush rates, and complaining about MY questions, which tells you the questions are good.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Gundis Balderk',
        text: "Out the way you came, and the pitch — leave it, it is YOURS now, pitch is a lifetime appointment. ELEVEN YEARS I have asked for that sign.",
      },
    },
  },

  // =========================================================================
  // 18. BLOOMRIDGE
  // =========================================================================

  amafrey: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Amafrey Whitburn',
        text: "The Counting House. Item one: what you have. Item two: what it is worth. Item three: my fee.\n\nThe hall is marble and iron, quiet as a chapel and considerably better guarded, and the Chief Teller regards you across a scale so fine it is kept under glass.\n\nAmafrey Whitburn. The House exchanges, appraises, and keeps. It has done all three through four wars, two coups and one dragon, and its ledgers balanced through each of them, which is more than the city can say.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Amafrey Whitburn',
        text: "State your business. The House values precision, and I am the House, itemised.",
        choices: [
          { text: 'Exchange, appraisal, safekeeping.', do: { shop: 'counting-house' }, goto: 'hub' },
          { text: 'What makes this the best rate in the south?', goto: 'rate' },
          { text: 'How is the assay floor kept?', if: { quest: 'nine-fingers-favour' }, goto: 'floor' },
          { text: 'A dragon? Itemise the dragon.', goto: 'dragon' },
          { text: 'Balance well, Chief Teller.', cancel: true, goto: 'bye' },
        ],
      },
      rate: {
        speaker: 'Amafrey Whitburn',
        text: "Volume, verification, and the absence of fear. Itemised, since you ask properly.\n\nShe taps the glass over the scale, once per item.\n\nOne: everything south of Waterdeep that needs valuing comes here eventually, so we see enough stones to know a Nelanther pearl from an Amnish paste at arm's length, and knowledge is margin. Two: our assay is bonded — the House pays out of its own vault if our number proves wrong, which in my nineteen years it has done twice, both times before lunch, both tellers retired by supper. Three: we do not buy frightened. A house that gouges the desperate sees the desperate once. We pay the true rate to a widow at midnight and she banks with us for forty years.\\p Item four, gratis: everyone in this city will tell you the Counting House is patriar-cold. We are. Cold is incorruptible. You will learn to prize it.",
        goto: 'hub',
      },
      floor: {
        speaker: 'Amafrey Whitburn',
        text: "An unusual question, phrased carefully, from a heavily armed party.\n\nShe looks at you for precisely two heartbeats longer than is comfortable, and elects — visibly, the way she does everything — to answer the letter of it.\n\nThe assay floor is kept by protocol, not locks. Ledgers out only during assay hours, two tellers to a book, and the Fist pair by the door are counted IN by me and OUT by me, by name. A lock can be picked quietly; a protocol can only be broken in front of witnesses. That is why the House has never — she permits the word its full weight — never lost a ledger.\\p Whatever you were actually asking: the House has noticed you asking it. The House notices beautifully. It is what we are for.",
        do: { flag: 'counting-house-protocol-known' },
        goto: 'hub',
      },
      dragon: {
        speaker: 'Amafrey Whitburn',
        text: "1477. Before my time; the ledger survives.\n\nShe recites it with the reverence other houses save for scripture, which here it is.\n\nItem: one blue dragon, adult, arriving through the roof of the western strongroom at the fourth bell. Item: forty-one minutes of occupancy. Item: gold taken, eleven thousand and change — the exact figure is in the ledger, with the teller's note, written WHILE IT FED, quote: 'specie only; it disdained the letters of credit; noted for future architecture.'\\p Item the last: the House reopened the following morning, paid every depositor in full from reserve, and put the teller's note under glass, where the apprentices read it on their first day. That is the Counting House, entire, in one entry. We survived a dragon and improved our filing.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Amafrey Whitburn',
        text: "The House thanks you for your custom, or failing custom, your precision. Mind the step; it is marble, and marble files no reports but takes no excuses.",
      },
    },
  },

  holg: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Holg',
        text: "The Baldur's Gate itself — the old arch the city is named for — and filling the middle of it, a half-orc gatecaptain built along the lines of the masonry, watching the traffic with the economy of a man who spends words like a miser spends gold.\n\nGate's open. Behave.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Holg',
        text: "He watches you. The watching is the conversation.",
        choices: [
          { text: 'Busy post?', goto: 'busy' },
          { text: 'Any advice for the Upper City?', goto: 'advice' },
          { text: 'How long have you held this gate?', goto: 'years' },
          { text: 'Captain.', cancel: true, goto: 'bye' },
        ],
      },
      busy: {
        speaker: 'Holg',
        text: "Always.\n\nA cart passes. He counts it with his eyes.\n\nGate manages.",
        goto: 'hub',
      },
      advice: {
        speaker: 'Holg',
        text: "He considers the question with the gravity of a toll assessment, and delivers.\n\nWalk slow. Buy nothing. Smile less.\n\nA pause. Then, with what you slowly recognise as enormous generosity — a fourth word:\n\nWorks.",
        do: { flag: 'holg-advice' },
        goto: 'hub',
      },
      years: {
        speaker: 'Holg',
        text: "Eleven.\n\nSomething crosses his face that on a smaller man would be a whole speech about the arch, the years, the city that names itself after a doorway and forgets to hold the door.\n\nGood arch.\n\nHe touches the stone once, the way you would touch an old dog.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Holg',
        text: "He nods. One nod. You have the sense of having passed something that is not the gate.",
      },
    },
  },

  'esvele-amblecrown': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Esvele Amblecrown',
        text: "Flowers, fruit, and remedies for what the fruit does. All fresh this morning, all of it!\n\nThe Bloomridge market froths with colour around her stall, which is the best-placed, best-stocked and most cheerfully overpriced in the district, and its mistress beams at you with the sunny ruthlessness of a woman who has never once lowered a price and never once lost a customer over it.\n\nEsvele Amblecrown. If it grows, forces, blooms or preserves, I sell it — and to the patriar houses I sell it at rates that would make a jeweller blush, WHICH THEY PAY, because I am the only one who can get peonies in Hammer.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Esvele Amblecrown',
        text: "So! Buying beauty, or just standing in its light? Both welcome. One is billable.",
        choices: [
          { text: 'Show us the stall.', do: { shop: 'bloomridge-market' }, goto: 'hub' },
          { text: 'Peonies in Hammer? How?', goto: 'secret' },
          { text: 'What do the flowers hear?', goto: 'news' },
          { text: 'Bloom on, mistress.', cancel: true, goto: 'bye' },
        ],
      },
      secret: {
        speaker: 'Esvele Amblecrown',
        text: "Ha! The question worth gold, asked for free.\n\nShe leans in, sunny and merciless.\n\nGlasshouses, dear. Three of them, on the south slope behind my mother's cottage, glazed with dry-dock offcut glass I bought for a song when the Oberons re-ported a hull — Gundis SOLD it me to spite the waste, forty years of complaint working in my favour. Charcoal heat, river silt, and my sister reads the frost like scripture.\n\nEvery florist in this district could do it. None of them DO. They wait for spring like it is owed them, and I sell winter at summer prices.\\p That is the whole of commerce, my loves: everyone knows the secret, and the secret is WORK, and knowing is not doing, and doing is the margin.",
        do: { flag: 'esvele-glasshouse-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Esvele Amblecrown',
        rumor: true,
        text: "Flowers go to every door in Bloomridge, dears — weddings, funerals, apologies. You can read the district by its orders. This tenday: three patriar houses buying white lilies quietly, which is mourning worn privately, and NOBODY has died in the broadsheet. Interesting, no?",
        goto: 'hub',
      },
      bye: {
        speaker: 'Esvele Amblecrown',
        text: "Take the rosemary sprig — free, it is bruised, it is still better than anyone else's. Come back when you need an apology; I do a DEVASTATING apology bouquet.",
      },
    },
  },

  silaqui: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Silaqui Liadon',
        text: "The workshop is small, perfectly lit, and quiet in the way of rooms where the work is measured in centuries. A moon elf looks up from a stone on a velvet block, sets down her loupe with no hurry whatever, and considers you.\n\nSilaqui Liadon. I cut for three houses, and I have cut for their grandmothers, and their grandmothers' grandmothers.\\p Sit, if you wish. Nothing in this room can be rushed, including me. ESPECIALLY me.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Silaqui Liadon',
        text: "She returns to the stone while you speak, which you come to understand is not rudeness but its opposite: her hands listen too.",
        choices: [
          { text: 'Two hundred years of the same three families?', goto: 'families' },
          { text: 'What is the district worth? You would know.', goto: 'worth' },
          { text: 'Would you look at our stones sometime?', goto: 'stones' },
          { text: 'Cut well, jeweller.', cancel: true, goto: 'bye' },
        ],
      },
      families: {
        speaker: 'Silaqui Liadon',
        text: "Two hundred and eleven years. Oberon, Rillyn, Whitburn — I have set the betrothal stones of nine generations, and reset four of them after divorces which I also saw coming, in the stones, in how they asked for them.\n\nThe loupe comes up; a facet is interrogated; the loupe goes down.\n\nHumans think a jeweller sells sparkle. A jeweller keeps ARCHIVES. Every house's fortunes pass across this bench in carats — the lean decades when the good stones went quietly to Amn, the fat ones when they came home. I could write this district's true history in settings alone.\\p I never shall. Discretion is the setting the whole trade sits in. But it is a comfort, on slow afternoons, to be the only honest ledger on the ridge.",
        goto: 'hub',
      },
      worth: {
        speaker: 'Silaqui Liadon',
        text: "In stones alone? More than the Lower City's shipping, year on year, and it fits in four strongrooms.\n\nShe says it without envy, an elf pricing weather.\n\nBut you asked what the DISTRICT is worth, and the district is worth its pretence. Bloomridge sells the idea that money can be gentle — flowers at the gate, marble at the bank, my window glowing kindly. Come the day the pretence drops, this is the richest street in the city and the softest, in both senses.\\p The wise houses know it. THEY buy my plainest settings — stones that travel, stones that sew into a hem. Two hundred years teaches a jeweller one thing above all: the best families are always, quietly, packed.",
        do: { flag: 'silaqui-packed-known' },
        goto: 'hub',
      },
      stones: {
        speaker: 'Silaqui Liadon',
        text: "Bring them when they matter.\n\nShe glances at your packs with two centuries of appraisal and the first flicker of warmth.\n\nAdventurers' stones arrive with the worst provenance and the best stories, and I confess a weakness. The Counting House will give you the fair PRICE — Amafrey's assay is honest as frost. But price is not the same as reading, and I read: where a stone was cut, when, by whose school, and once — she permits herself the memory — a sapphire that had been cut by a hand I studied under, four hundred years dead, come back to me through a troll's hoard like a letter.\\p For stones like that I pay above the House rate. Not for value. For the correspondence.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Silaqui Liadon',
        text: "Go gently. And carry your bright things wrapped soft — half of what I mend was broken by pockets, not perils. Pockets are the great predator of beautiful objects.",
      },
    },
  },

  'ivor-kulenov': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ivor Kulenov',
        text: "A moment of your time — no longer, I promise, I keep promises about time professionally.\n\nHe is Damaran, quietly dressed, with a leather folder under one arm and the calm of a man who has never once needed to raise his voice, which in his trade is the most frightening credential there is.\n\nIvor Kulenov. I call on debtors for the House of Rillyn. You are not debtors — I checked before approaching, it is the first courtesy of the trade — so this is merely conversation, which I find I get very little of.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ivor Kulenov',
        text: "Ask what you like. Everyone wants to ask; almost nobody does; the folder puts them off. It is mostly receipts.",
        choices: [
          { text: 'How does a reasonable man collect debts?', goto: 'method' },
          { text: 'What is Lady Rillyn like to serve?', goto: 'rillyn' },
          { text: 'Do you ever forgive a debt?', goto: 'forgive' },
          { text: 'Keep your appointments, collector.', cancel: true, goto: 'bye' },
        ],
      },
      method: {
        speaker: 'Ivor Kulenov',
        text: "By arithmetic, and by arriving.\n\nHe opens the folder to a blank page, as if to demonstrate its harmlessness.\n\nI explain the sum — principal, accrual, the date it turned. I agree that it is hard; it is nearly always genuinely hard, and pretending otherwise is where collectors go wrong. Then I name the day I will come back, and I come back on that day. Not before, which is harassment. Not after, which is mercy, and mercy from a collector is a hook with the barb showing.\\p Just: on the day. Nine years, and I have never once been late, and that is the entire method. People pay the man who arrives. The knee-breakers never understand it — fear spends itself. PUNCTUALITY compounds.",
        do: { flag: 'ivor-method-known' },
        goto: 'hub',
      },
      rillyn: {
        speaker: 'Ivor Kulenov',
        text: "Precise in the amounts, generous in the schedules, and never to be surprised. I give her the same courtesy I give the debtors: she always knows which day I am coming, and with what.\n\nA small, careful pause, the folder squared.\n\nYou will hear that House Rillyn's money moves in company I should not name. I keep the accounts I am given, and I have noticed — noticing is not a crime — that some debts I collect were never lent by any Rillyn. I collect them anyway, on the day, exactly. And I keep, at home, a private list of which ones.\\p A reasonable man in an unreasonable trade must decide what he is FOR. I have decided I am for the record. Records outlive houses. Even that one.",
        do: { flag: 'ivor-list-known' },
        goto: 'hub',
      },
      forgive: {
        speaker: 'Ivor Kulenov',
        text: "I have no authority to forgive. I have authority to REPORT, and reports have margins.\n\nSomething very nearly warm crosses the Damaran winter of his face.\n\nIn nine years I have written 'circumstances warrant review' eleven times. A dockman crushed under his own crane. A widow whose husband's debt was drunk, not lent. A girl of sixteen inheriting a father's folly. Lady Rillyn reviewed all eleven. She forgave nine, restructured two, and never once asked me why I flagged them — which is either the kindest thing about her or the most careful, and I have stopped trying to decide.\\p The trade calls me the Rillyns' hard man. The margins know better. But margins, thank goodness, do not gossip.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ivor Kulenov',
        text: "A pleasure. Genuinely — you would be astonished how rarely this folder and I are spoken to voluntarily. Keep clear of borrowing in this district, and if you cannot: borrow from someone punctual.",
      },
    },
  },

  nedda: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Nedda Tosscobble',
        text: "A halfling child arrives at your elbow at speed, braking with a two-foot skid that has clearly been practised for style.\n\nMessage? Parcel? Directions? I do all three, I am the fastest in the Lower City, and before you ask: eleven, and a half, and the half does the running.\n\nNedda Tosscobble! A copper a message, anywhere below the Old Wall, FASTER THAN PIGEONS. Pigeons stop for bread. I have PROFESSIONAL STANDARDS.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Nedda Tosscobble',
        text: "Well?? I have four undelivered and my legs are going cold. Cold legs are SLOW legs.",
        choices: [
          { text: 'How does the message trade work?', goto: 'trade' },
          { text: 'You run for the Guild too, we hear.', if: { flag: 'bg-guild-known' }, goto: 'guild' },
          { text: 'What is the fastest way round the district?', goto: 'routes' },
          { text: 'Run fast, courier.', cancel: true, goto: 'bye' },
        ],
      },
      trade: {
        speaker: 'Nedda Tosscobble',
        text: "Copper a message, memorised not written — WRITING is EVIDENCE, my gran says, and my gran ran messages during the WAR, she is the reason the trade has rules.\n\nShe counts the rules off at speed, hopping foot to foot to keep the legs warm.\n\nRule one: the message belongs to the sender till it is said, then it belongs to NOBODY. Rule two: no messages into Sow's Foot after dark — not danger, MANNERS, the district likes its evenings private. Rule three: if two messages fight — like, one says 'tell him yes' and the other says 'tell him she said no' — you deliver in the order PAID.\\p Rule three causes SO much trouble. Rule three is my favourite.",
        goto: 'hub',
      },
      guild: {
        speaker: 'Nedda Tosscobble',
        text: "She stops hopping. She looks at you with eleven-and-a-half years of sudden, complete assessment, and then decides — you can watch the decision — that you are the sort the rule allows.\n\nFor the Guild I run for FREE, and before you make the face: free means nobody OWNS the run. Gran's rule again. Take their copper and you are their courier. Run it free and you are a NEIGHBOUR doing a kindness, and neighbours cannot be handed to the Fist, because what would the charge be? EXCESSIVE KINDNESS?\\p My gran ran free for the old Guild forty years and died owing nobody and owed by EVERYONE. Half the Lower City came to the burying. THAT is wages, she used to say. I am collecting the same ones.",
        do: { flag: 'nedda-free-runs-known' },
        goto: 'hub',
      },
      routes: {
        speaker: 'Nedda Tosscobble',
        rumor: true,
        text: "Depends what is BLOCKING, and something is always blocking! Today: fish cart tipped on the harbour steps — gulls having a FESTIVAL — Fist checkpoint on the Heapside corner counting somebody's barrels, and the washing lines are low on Sail Street because it is Duchess-day at the bathhouse. Go by the flower market and thank me at the other end!",
        goto: 'hub',
      },
      bye: {
        speaker: 'Nedda Tosscobble',
        text: "Right! Legs! — she is four doors away before the farewell lands, and takes the corner in another skid, and you hear, distantly, doppler-shifted: PROFESSIONAL STANDARDS!",
      },
    },
  },

  // =========================================================================
  // 19. HEAPSIDE
  // =========================================================================

  'kethra-buckman': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kethra Buckman',
        text: "The Mermaid. Beds are rough, board is worse, and the hiring wall is behind you.\n\nThe Blushing Mermaid is loud, low-ceilinged, and smells of tar, spilled ale and forty years of nothing surprising anybody, and its keeper pulls three pints while assessing you with the flat calm of a woman who has seen every kind of trouble come through that door and outlived each one.\n\nKethra Buckman. Twenty-two years. Say what you want plainly; the house does not stock the other kind of conversation.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kethra Buckman',
        text: "Well?",
        choices: [
          { text: 'The house, then. Rough as it comes.', do: { shop: 'blushing-mermaid' }, goto: 'hub' },
          { text: 'Beds for the night. [gold]8 gp[/]', if: { gold: 8 }, do: { heal: { cost: 8, hours: 8 } }, goto: 'rested' },
          { text: 'Three of your regulars are missing.', if: { questNot: 'the-mermaid-debt' }, do: { quest: 'the-mermaid-debt' }, goto: 'debt' },
          { text: 'About your three regulars. It is finished.', if: { quest: 'the-mermaid-debt' }, do: [{ complete: 'the-mermaid-debt' }, { flag: 'mermaid-debt-settled' }, { rep: { id: 'zhentarim', amount: 2 } }], goto: 'debt-done' },
          { text: 'Who is the half-elf in the back room?', if: { notFlag: 'jaheira-pointed' }, do: { flag: 'jaheira-pointed' }, goto: 'backroom' },
          { text: 'Mind the house, Kethra.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Kethra Buckman',
        text: "Second landing, mind the third stair and the man asleep on it — he has paid, in his way.\n\nThe bed is rough. The sleep, oddly, is not: the Mermaid's noise is honest noise, and honest noise is a lullaby in this city once you have heard the other kind.",
        goto: 'hub',
      },
      debt: {
        speaker: 'Kethra Buckman',
        once: true,
        text: "She sets down the pint she is pulling. That is all — but you have been in the room long enough to know it is the Mermaid's equivalent of a scream.\n\nThree. In one tenday. Down the Undercellar stair and not up it.\n\nShe pulls a slate from behind the bar: three names, three sums.\n\nHannis, dock-lad. Old Ferret, who has drunk the corner stool for thirty years. And Marta's boy Piet. All owing the slate, which I mention because it is easier to say than the other thing, and I have run this house twenty-two years on saying the easier thing.\\p Nothing surprises me. Mark that: NOTHING. But something is wearing the faces of my regulars down there and drinking in my house wearing one of them — Ferret came up two nights past and ordered wine. WINE. Thirty years of dark ale and the thing did not know.\n\nGo down and settle the slate. Whatever the sum comes to.",
        goto: 'hub',
      },
      'debt-done': {
        speaker: 'Kethra Buckman',
        text: "She hears the whole of it without a word: the nest, the cells, the thing that wore Ferret. When you finish she takes the slate off its hook, looks at the three names, and wipes it clean with one pass of her sleeve.\n\nSlate's settled.\n\nShe pours four drinks unasked and one for herself, which the regulars will tell you has happened twice in twenty-two years.\n\nHannis had a mother in Norchapel; she will hear it from me and not from the street. Ferret's stool goes to the wall — nobody sits it for a year, house rule as of now. And the wine-drinker — she looks at you over the rim — you are sure.\\p Good. Then the Mermaid owes you, and the Mermaid pays: beds at family rate, first pour on the house, and my word behind the hiring wall, which in Heapside is worth more than the beds.",
        goto: 'hub',
      },
      backroom: {
        speaker: 'Kethra Buckman',
        text: "What half-elf.\n\nShe says it perfectly flat, holding your eye, and then — having established the principle — relents by a fraction.\n\nThe back room is let, long-term, to a woman who pays on time and asks less noise than the house makes. People go through that door with troubles and come out with errands. That is the whole of what I see, and I am careful about the whole of what I see.\\p If she wants you, she has seen you already. Knock or do not. But wipe your boots — she has opinions, and unlike the rest of this house she is always right.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kethra Buckman',
        text: "Mind the step, mind the slate, and whatever you heard in here — you heard the fiddle. House policy.",
      },
    },
  },

  jaheira: {
    start: 'start',
    nodes: {
      oldFriends: {
        speaker:'Jaheira',
        text:"Minsc sent a note. Three lines about helping someone, two about lunch, and a paw-print presented as Boo's considered opinion.\n\nShe puts it under the papers she intends to keep.\n\nThe hamster's spelling remains the better of the two. They do good where they find it. Often loudly. You could learn the first part without copying the second.",
        goto:'hub',
      },
      start: {
        speaker: 'Jaheira',
        text: "Sit down before somebody notices you standing. There. Now we may talk.\n\nThe back room of the Blushing Mermaid holds a table, a map of the south under a wine jug, and a half-elf woman who has been running Harper business out of this chair since before the Fist held the gates, and who looks up at you with the expression of a druid pricing a storm.\n\nJaheira. Yes, that one. No, we are not doing the part where you list what you have heard; half of it is wrong and the other half I was younger.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Jaheira',
        text: "Speak. I have letters to burn and a city to keep from noticing itself being kept.",
        choices: [
          { text: 'What are the Harpers doing in Baldur\'s Gate?', goto: 'harpers' },
          {text:'Do you still hear from your old companions?',goto:'oldFriends'},
          { text: 'What work does the harp have for us?', goto: 'board' },
          { text: 'The Elfsong has stopped singing.', if: { quest: 'the-elfsong-silent' }, goto: 'elfsong' },
          { text: 'Come south with us, Harper.', goto: 'join' },
          { text: 'We will let you get to the burning.', cancel: true, goto: 'bye' },
        ],
      },
      harpers: {
        speaker: 'Jaheira',
        text: "The same three things we are always doing, everywhere: watching, remembering, and being disbelieved.\n\nShe moves the wine jug and the map underneath is annotated in a hand like bird-strikes.\n\nThis city nearly ended four years ago, and it has responded, with great civic energy, by pretending otherwise. The Fist patrols, the Guild collects, the patriars redecorate. And underneath: coin moving where coin should not, dead cults that will not stay filed, and the harbour trade bleeding in a pattern — a PATTERN, which is the word this city hates most.\\p The Harpers' work here is to be the one institution whose job is the pattern. We are not loved for it. Love is not the wage. The wage is that twice a decade, somebody in this chair says 'now' at the right moment, and the city does not end. I have said it twice. I am watching a third gathering.",
        do: { flag: 'jaheira-pattern-known' },
        goto: 'hub',
      },
      board: {
        speaker: 'Jaheira',
        rumor: true,
        text: "The board runs through me, and it pays in the harp's coin: some gold, more favours, and the occasional truth ahead of the market. Reconnaissance south, rescues that must not look like rescues, and proof — always proof — of the things everybody already suspects. Do the work honestly and do not embroider your reports. I have read forty years of embroidered reports. I can smell thread.",
        goto: 'hub',
      },
      elfsong: {
        speaker: 'Jaheira',
        text: "So Alyth finally asked for help. Good. He is courteous the way stones are heavy; it took him four tendays to admit the house was frightened.\n\nShe leans back and, for a moment, looks her years, which are considerable and mostly classified.\n\nHear the shape of it from someone who drank in that room when your grandparents were being careless: the Elfsong does not perform. She GRIEVES — the same lament, four hundred years, for a sailor the sea kept. A grief that constant does not stop. It can only be interrupted. Something down in the dark under Eastway has started making a sound she would rather listen to than sing over, and I have been alive too long to find that anything but terrifying.\\p Go down through the drains. And when you find what sings back — do not listen with your ears. That is the only Harper field-craft I have for ghosts, and it has kept me alive to pass it on.",
        do: { flag: 'jaheira-elfsong-counsel' },
        goto: 'hub',
      },
      join: {
        speaker: 'Jaheira',
        text: "She looks at you for a long, unhurried moment — the way you would look at a sapling you were deciding whether to stake.\n\nI have buried a husband, two wars, and more promising young companies than you have had hot suppers. I do not walk out of this room for promising. I walk for NECESSARY.\n\nShe taps the map, south, along the roads you have been walking.\n\nShow me necessary. Do the harp's work where it counts, or drag this city's rot into daylight where I can watch you do it — and then ask me again, and I will pack before you finish the sentence. The cause takes no coin either way; I am not a sellsword, I am a consequence.",
        choices: [
          { text: 'Walk with us, Jaheira. It is necessary.', if: { any: [{ faction: 'harpers', repMin: 5 }, { questDone: 'the-ducal-summons' }] }, do: [{ recruit: 'jaheira' }, { flag: 'jaheira-joined' }], goto: 'joined' },
          { text: 'We will earn the asking.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Jaheira',
        text: "She stands, rolls the map into a bone tube that has plainly done this a hundred times, and banks the lamp with two fingers.\n\nKethra. — this through the wall, at conversational volume, entirely confident of being heard — The room sleeps. You know the arrangement.\n\nA grunt through the boards, which is the Mermaid's notarised seal.\n\nShe shoulders a pack that was packed before you arrived — has been packed, you suspect, for years — and looks you over once more at the door.\\p Very well. Rules of the march: I scout at dawn, I say so when you are being foolish, and I am fond of exactly the sort of people who need telling twice, which is fortunate, for you will need telling twice. Come. The south does not improve while we stand here.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Jaheira',
        text: "Go. Watch the pattern, not the noise. And eat something green; you have the look of a party that has been living out of a fryer.",
      },
    },
  },

  rilsa: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Rilsa Rael',
        text: "You are new and you are loud. Walk with me and be neither.\n\nShe falls in beside you without breaking stride — Outer City bones, Lower City coat, eyes doing a full inventory of the street while she talks — and you understand you have been walking with the Guild's lieutenant for half a block before you agreed to anything.\n\nRilsa Rael. I speak for someone you do not get to meet yet. This corner is fine. Corners are honest; rooms have doors.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Rilsa Rael',
        text: "Say your piece. I am listening and also counting the Fist patrol, so if I glance past you it is not rudeness, it is both.",
        choices: [
          { text: 'What is the Guild, straight?', goto: 'guild' },
          { text: 'We hear you have work worth the risk.', if: { questNot: 'nine-fingers-favour' }, do: { quest: 'nine-fingers-favour' }, goto: 'favour' },
          { text: 'The ledger. Taken as asked — no locks broken.', if: { quest: 'nine-fingers-favour' }, do: [{ take: 'book' }, { complete: 'nine-fingers-favour' }, { flag: 'bg-guild-known' }, { rep: { id: 'zhentarim', amount: 5 } }], goto: 'favour-done' },
          { text: 'What does the Guild post, for people it knows?', if: { flag: 'bg-guild-known' }, goto: 'board' },
          { text: 'Another corner, another day.', cancel: true, goto: 'bye' },
        ],
      },
      guild: {
        speaker: 'Rilsa Rael',
        text: "Straight, then, because you asked straight and that is rarer than it should be.\n\nThe Guild is what grows where the law will not. The Upper City has the Watch. The Lower City has the Fist. The Outer City — where I was born, where fifty thousand people live — has NOTHING, by design, because governing us would cost and taxing us does not.\\p So we govern. Ugly word for it, fine: we take a cut, we break the odd door, and I will not paint that pretty. But when a Norchapel tenement burns, it is Guild coin that rebuilds it. When a camp girl goes missing in Rivington, the Fist files a note and WE find her. Nine-Fingers holds the nights of three districts together with string and fear and soup, and the dukes call it crime because the alternative is calling it a rebuke.\\p That is the Guild, straight. Now you know what you are working for, if you work.",
        do: { flag: 'rilsa-creed-known' },
        goto: 'hub',
      },
      favour: {
        speaker: 'Rilsa Rael',
        once: true,
        text: "Good. Then walk closer and smile like I am telling you about my grandmother.\n\nThe Counting House, Bloomridge. A patriar keeps a private ledger on the assay floor — grey calf-leather, his own cipher, never leaves the building. Nine-Fingers wants it. Not copied: TAKEN. And here is the term that makes it art: not one lock broken. A broken lock is an incident, an incident is Fist boots on every corner I care about for a tenday, and my people pay for your clumsiness in searches and shakedowns.\n\nShe stops at the corner and looks at you fully for the first time, and the look is the interview.\n\nProtocols, not locks — that house runs on ritual, and ritual has gaps a patient person walks through. I am told you have watched things work before taking them. That is the entire reason we are talking.\\p Bring it to me here. Nowhere else, no one else. And if you are caught — she smiles, Outer City to the bone — be boring about it. Boring people get fined. Interesting ones get remembered.",
        goto: 'hub',
      },
      'favour-done': {
        speaker: 'Rilsa Rael',
        text: "She takes the ledger without looking at it — looking would be telling the street what matters — and it is gone into her coat between one stride and the next.\n\nNo locks. No incident. The House does not even know yet, which means when they find the gap they will blame protocol, and tighten protocol, and never once say the word 'taken' out loud, because the Counting House cannot AFFORD the word.\n\nShe almost smiles. It reaches about half distance, which you suspect is its full deployment.\n\nNine-Fingers reads this tonight, and what is in it buys three streets another quiet winter — that is not your business, but I find I want it said, because you did it CLEAN and clean deserves to know what it bought.\\p You are known now. That has a weight in this city — doors will open that should not, and one day a door will close because of it, and you will not hear either happen. Welcome to the ledgers, southerner. You were always in somebody's. At least ours pays.",
        goto: 'hub',
      },
      board: {
        speaker: 'Rilsa Rael',
        rumor: true,
        text: "Movement work, mostly — things and occasionally people shifted past attention. Acquisitions, like the one you did. And the quiet removals, which are exactly what they sound like and are offered, note, only against those who broke the rule first. The board pays in coin and in standing, and standing is the realer currency. Check it through the journal, work clean, and never — NEVER — freelance in the Outer City. That is not a rule of mine. It is a rule of hers.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Rilsa Rael',
        text: "Walk on, then. Count the patrol as you go — two by the pump, one on the roof. You did not see the roof one. Learn to see the roof one.",
      },
    },
  },

  fonkin: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Fonkin Timbers',
        text: "Wonder-house! Smithing, tools, alchemy, clockwork, repairs — and yes, that IS supposed to be ticking, and the one behind you is NOT, so do not touch it, it sulks.\n\nThe High House of Wonders is Gond's cathedral and it sounds like one: forges, gears, a choir of small hammers. The gnome at the centre of it wears a leather apron with eleven specialised pockets and is talking before you arrive and after you expected him to stop.\n\nHigh Artificer Fonkin Timbers! Which is a title with a HISTORY, the short version being that the long version takes an hour, WORTH IT, another time.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Fonkin Timbers',
        text: "So! Buying, mending, commissioning, or ASKING? All four welcome, in ascending order of how much I will talk.",
        choices: [
          { text: 'Show us the workshops.', do: { shop: 'high-house-of-wonders' }, goto: 'hub' },
          { text: 'You need something fetched, we hear.', if: { questNot: 'the-gond-commission' }, do: { quest: 'the-gond-commission' }, goto: 'commission' },
          { text: 'One driftglobe, out of Dragonspear. You owe us an apology.', if: { all: [{ quest: 'the-gond-commission' }, { item: 'driftglobe' }] }, do: [{ take: 'driftglobe' }, { complete: 'the-gond-commission' }, { rep: { id: 'gauntlet', amount: 3 } }], goto: 'commission-done' },
          { text: 'What is Gond\'s house FOR, in a city like this?', goto: 'gond' },
          { text: 'Tick on, High Artificer.', cancel: true, goto: 'bye' },
        ],
      },
      commission: {
        speaker: 'Fonkin Timbers',
        once: true,
        text: "AH. Yes. The errand. The little errand. A morning's walk with a lantern, essentially, in the sense that all walks are a morning's walk if you START in the morning and walk FAST.\n\nHe produces a technical drawing with suspicious readiness.\n\nA driftglobe — but THIS pattern, the Gondsman workshop pattern, see the housing? Cast at Dragonspear Castle's chapter-house before the — before the interruptions. The last one in the world sits on a bench in that workshop, and the House needs it, because the pattern solves a problem in the new harbour lamps that I have failed to solve independently for two years, and my professional humility has LIMITS but it exists.\\p Dragonspear is — he waves a hand with tremendous airiness — historied. Ruined. Somewhat occupied. There were devils, HISTORICALLY, in the sense that — hm. Bring lamps. Bring several lamps. And whatever is in the workshop with it, remember the globe is the SPHERICAL one and everything else can be left to its — activities.\n\nThat is four questions you have not asked! EXCELLENT. The commission is yours.",
        goto: 'hub',
      },
      'commission-done': {
        speaker: 'Fonkin Timbers',
        text: "He takes the driftglobe in both hands like a midwife receiving triplets, holds it to the light, and goes silent.\n\nSILENT. Around you, journeymen stop work to witness it. One of them mouths the word 'silent' to another.\n\nThen, quietly, which is somehow louder than everything before:\n\nThe housing. Look at the housing. They solved the condensation gap with a THREAD CHANNEL. Two hundred years ago. With a file and no jig. I have a jig ROOM.\n\nHe sets it on velvet, and turns, and bows — a full formal Gondsman bow, apron pockets rattling.\n\nThe apology, as invoiced: I said a morning's walk. It was DEVILS, was it not. Of course it was devils, it is always devils there, that is why the errand sat on the wish-list for thirty years while braver artificers than me invented REASONS.\\p Winter after next, when the harbour lamps go up and no ship gulls itself on the Gray Harbour mole EVER AGAIN — that is yours. I will have your names cast into the base plates. Gond remembers in BRONZE.",
        goto: 'hub',
      },
      gond: {
        speaker: 'Fonkin Timbers',
        text: "For the ten thousand small mercies nobody prays for! Which is my sermon, and it fits in a pocket, unlike most sermons.\n\nHe counts on fingers while somehow also adjusting a gear train.\n\nThe pump that keeps the Undercellar from drowning Heapside — ours. The crane brakes at the harbour: ours, after the second accident, and there has been no third. The little water-clock at the Shrine of the Suffering that tells Brother Anton when to turn the fever patients — ours, gratis, and Gond counts it the best work in the building.\\p The other temples sell comfort about the NEXT world. We are the ones betting everything on the proposition that THIS one can be improved with a file and honest measurements. In Baldur's Gate, I grant you, that is the most radical theology on offer. — Caramip at Twin Songs would add: and a SHED is enough to practice it. She is right. Do not tell her I said so; we have a SYSTEM.",
        do: { flag: 'fonkin-sermon-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Fonkin Timbers',
        text: "Go well! Mind the threshold — it is a gauge plate, if it rocks your boots are uneven, FREE DIAGNOSIS, no other temple offers that!",
      },
    },
  },

  anton: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Anton Calabra',
        text: "The Broken God's house. Sit. We shall discuss the price after, and it will be less than you think.\n\nThe Shrine of the Suffering is one room, whitewashed, with a plain altar, a bench, and a queue that tells you everything the ornament does not. The Ilmatari within is Turami, grey at the temples, with the settled quiet of a man who decided everything difficult decades ago.\n\nBrother Anton. What hurts?",
        goto: 'hub',
      },
      hub: {
        speaker: 'Anton Calabra',
        text: "Take your time. The queue behind you will wait; waiting kindly is half the discipline of this room, and they are all further along in it than you.",
        choices: [
          { text: 'What does the shrine offer?', do: { shop: 'shrine-of-suffering' }, goto: 'hub' },
          { text: 'Tend us, brother. We will pay what is right.', do: { heal: { cost: 10, hours: 1 } }, goto: 'tended' },
          { text: 'Charges what you can pay. How does that survive?', goto: 'price' },
          { text: 'Who tries to move you? You said pressure.', goto: 'pressure' },
          { text: 'Peace to the queue, brother.', cancel: true, goto: 'bye' },
        ],
      },
      tended: {
        speaker: 'Anton Calabra',
        text: "He works the way water works: no hurry, no waste, finding every crack. Ilmater's healing is not gentle exactly — it is THOROUGH, and somewhere in it you have the brief, disorienting sense of your pain being not removed but carried, by someone with better shoulders.\n\nThere.\n\nHe washes his hands in the basin, and winces, very slightly, in a way that has nothing to do with the water.\n\nTen gold, since you have it; the man behind you has three coppers and will pay one. The mathematics of this room are not complicated. They are only unfashionable.",
        goto: 'hub',
      },
      price: {
        speaker: 'Anton Calabra',
        text: "It survives because the poor are honest and the rich are embarrassed, and the Broken God harvests both.\n\nA dockhand pays a copper and is healed. A patriar hears of it, and cannot BEAR the copper, and sends fifty gold so the story will have him in it. I take the fifty with exactly the thanks I gave the copper — exactly, I have practised — and the fifty heals forty more dockhands, and the patriar tells the story at supper, and next season his cousin sends a hundred.\\p Thirty years, and the shrine has never once lacked. Ilmater's economics: suffering flows downhill, so build the well at the bottom. Every temple in this city knows it works. They also know why they do not copy it, and THAT knowledge is between them and their gods, and I am careful to be busy on the days it visits me.",
        do: { flag: 'anton-economics-known' },
        goto: 'hub',
      },
      pressure: {
        speaker: 'Anton Calabra',
        text: "Everyone, at intervals. It is almost liturgical.\n\nHe dries his hands, unhurried.\n\nThe Guild sent a man, years ago, to explain about protection. I explained that the shrine has no lock, no strongbox, and no thing worth carrying except the queue, and asked if the Guild proposed to protect the queue. He came back the next tenday with a bad shoulder, as a patient. He still comes. He mends the roof now, when it wants it.\n\nThe temples have offered to 'elevate' the shrine inside a proper precinct, where the queue could not reach it. The patriars have twice tried to buy the street. And the Fist, after the crisis, wanted a permanent post at my door — for safety.\\p I refused all of them with the same sentence: the door does not shut. It has not shut in thirty years. It is the only doctrine I hold that cannot be argued with, because it is a FACT, and facts are the one thing this city has never learned to bribe.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Anton Calabra',
        text: "Go gently. And when you cannot go gently — and in your trade you cannot — come back after, and we will see to what it cost. The door does not shut.",
      },
    },
  },

  nal: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Nal Dumein',
        text: "Down you come. Down everybody comes. Tools, poisons, and things that were somebody else's.\n\nThe Undercellar is lamplit dark and moving commerce, and the stall at its heart glows like a jewel-box: velvet trays, lockpicks fanned like cutlery, and a Calishite fence whose delight at seeing you is — this is the unsettling part — completely genuine.\n\nNal Dumein. WELCOME. Everyone who finds this stall was looking for it, whatever they tell themselves, so let us skip that dance and be friends immediately.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Nal Dumein',
        text: "Browse, sell, or gossip — the trinity of the trade, and I am devout in all three.",
        choices: [
          { text: 'Show us the trays.', do: { shop: 'the-undercellar' }, goto: 'hub' },
          { text: 'Why so happy, fence?', goto: 'happy' },
          { text: 'What moves in the Undercellar?', goto: 'news' },
          { text: 'Stay delighted, Nal.', cancel: true, goto: 'bye' },
        ],
      },
      happy: {
        speaker: 'Nal Dumein',
        text: "Because I am the only honest shop in Baldur's Gate! — he says it in a whisper, which is his only volume, and it loses nothing.\n\nConsider. Upstairs, every trade wears a face: the banker is serving you, the priest is saving you, the patriar is not even seeing you. Lies, lies, lovely necessary lies. Down here? You know what this is. I know what this is. The goods know what they are. NOBODY IS PRETENDING. Do you understand how RESTFUL that is? Merchants upstairs die of their own faces by fifty. I am sixty-one.\\p Also — practically — I was born in the Outer City to a mother who fenced for the OLD Guild, and I have watched every trade in this city from underneath, and this one has the best conversation. Thieves are INTERESTING. Bankers are thieves with worse stories.",
        do: { flag: 'nal-honest-shop' },
        goto: 'hub',
      },
      news: {
        speaker: 'Nal Dumein',
        rumor: true,
        text: "The Undercellar hears the city through its floor, friend. This tenday: somebody upstairs is buying silence in BULK — good rates, quick coin, no questions about the questions — and when silence trades at a premium, noise is coming. Buy your tools before the rush.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Nal Dumein',
        text: "Up you go, up everybody goes. Mind the third stair — loose, always been loose, we VOTED to keep it loose, it is our doorbell.",
      },
    },
  },

  cefrey: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Cefrey Helder',
        text: "He is at the corner table with his back to the wall and his eyes on the room over your shoulder, and he answers your greeting half a beat late — not slow; listening to something under the conversation, the way sailors listen to a hull.\n\nCefrey Helder.\n\nA measured look.\n\nSay what you want plainly. I have had eleven years of orders and two years of hints and I am done with one of them.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Cefrey Helder',
        text: "Go on. I am listening. I am always listening; it is the whole problem with me.",
        choices: [
          { text: 'You were Flaming Fist.', goto: 'fist' },
          { text: 'What happened on the Coast Way?', goto: 'order' },
          { text: 'Soldier for us instead. Out the gates, away from the rope.', goto: 'join' },
          { text: 'Watch the room, then.', cancel: true, goto: 'bye' },
        ],
      },
      fist: {
        speaker: 'Cefrey Helder',
        text: "Eleven years. Shield line at the Rock, escort rotation on the Coast Way, two commendations, one of them earned.\n\nHe turns his cup a quarter, keeping his hands busy and his eyes on the door.\n\nAnd I will say this for the company, because deserters who spit on the flag are hiding something: the Fist works. The roads hold because of it. Most of the men are trying. It is the machine ABOVE the men — the machine takes a good order and a bad officer and makes them the same weight, and eleven years in, I could no longer tell which I was carrying.\\p Desertion is the rope in this city. So I live in Heapside, half a sentence behind every conversation, listening for boots that walk in step. You get good at it. I am the best in the district at a skill I would give anything not to need.",
        goto: 'hub',
      },
      order: {
        speaker: 'Cefrey Helder',
        text: "He is quiet for a moment. Then he says it the way a man lays down a weight he has carried up too many stairs: flatly, once, all of it.\n\nEscort duty, spring before last. A grain convoy, and refugees walking the same road, and orders to keep the road CLEAR for the freight. A family would not clear — could not, the cart wheel was gone. The lieutenant ordered the cart off the road. The scarp side. With their winter in it.\n\nI put the order down. In front of the company. He said the next word and I walked north, and I have not stopped hearing which word it was.\\p That is the whole of it. I will not tell it again, so if your company needs the story retold for entertainment, hire a bard. If it needs a soldier who knows exactly where orders end — that man is for sale, and cheap, because the market for him is small.",
        do: { flag: 'cefrey-order-known' },
        goto: 'hub',
      },
      join: {
        speaker: 'Cefrey Helder',
        text: "For the first time, he looks at you fully — the room, briefly, unwatched — and something in him stands down by one degree.\n\nOut the gates is the only direction with air in it. Two hundred gold. It clears my landlady, my slate, and the man who holds my old kit in pawn, and it leaves nothing owing in Heapside, because a man on the road with debts behind him is a man who has to come BACK.\\p One term of service, stated up front: give me orders. Real ones, plain ones. I am a soldier; I am no good freelance. But know that if the day comes you order me to put a family's winter down a scarp — I will put the order down instead, in front of everyone, again. That is not a threat. It is a reference.",
        choices: [
          { text: 'Those are terms. [gold]200 gp[/]', if: { gold: 200 }, do: [{ recruit: 'cefrey-helder' }, { flag: 'cefrey-joined' }], goto: 'joined' },
          { text: 'Hold the corner a while longer.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Cefrey Helder',
        text: "He settles three debts in the space of an hour — you watch the landlady's face do something complicated and kind — and comes back wearing his old kit out of pawn: Fist-pattern brigandine with the badges carefully, neatly unpicked.\n\nThe seams show where they were. He knows the seams show. He wears it anyway.\n\nRight.\n\nAnd it is remarkable: the half-beat lag is gone. Orders received, world simple, shoulders square.\\p First watch is mine tonight. I listen better than anyone you have ever hired. It is the whole problem with me, and now it is yours, and honestly — he almost smiles — I am glad to have it spent on purpose.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Cefrey Helder',
        text: "Mind how you go past the pump — two men there have been not-drinking the same two pints for an hour. Probably nothing. I am telling you anyway. Free sample.",
      },
    },
  },

  'old-bess': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Betha Lackman',
        text: "HEE. Look at these ones, dressed for the surface and asking after old Bess. Sit down, sit down, mind the ferret — no, that one is a RAT, mind the DIFFERENCE, it is the whole of my profession.\n\nShe is sixty-odd, bright-eyed as her stock in trade, festooned with the tools of the ratting art, and the cackle arrives every few sentences like punctuation.\n\nBetha Lackman. Old Bess. Ratcatcher to the Mermaid and the district, and the only living soul who has been down every sewer mouth in the Lower City. EVERY one. There is a certificate. I wrote it myself. HEE.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Betha Lackman',
        text: "Go on then, ask. Everyone wants the underneath eventually. The city is a table and I know the LEGS.",
        choices: [
          { text: 'Tell us about the sewers.', goto: 'sewers' },
          { text: 'What is under the Elfsong?', if: { quest: 'the-elfsong-silent' }, goto: 'elfsong' },
          { text: 'What do the rats know?', goto: 'rats' },
          { text: 'Catch well, Bess.', cancel: true, goto: 'bye' },
        ],
      },
      sewers: {
        speaker: 'Betha Lackman',
        text: "Older than the streets, half of them. The city builds UP, always has — new Baldur's Gate stands on old Baldur's Gate's shoulders, and the drains are old Baldur's Gate's BONES.\n\nShe draws in spilled ale with one finger: lines, junctions, a map that has never existed on paper.\n\nThe Heapside grate by the pump — that is your door, the only honest one. Down past the first vault the brick goes ROMAN — hee, older, OLD old — and the water runs the wrong way twice a day, which nobody has ever explained to me and I have stopped asking in case something answers.\\p Rule of the underneath: where the rats go, go. Where the rats do NOT go — she taps the table, suddenly not cackling at all — you turn around, and you count your party TWICE on the way up.",
        do: { flag: 'bess-sewer-map' },
        goto: 'hub',
      },
      elfsong: {
        speaker: 'Betha Lackman',
        text: "AH. So somebody finally asks Bess the right question. HEE. Sit closer.\n\nUnder the Elfsong there is a drain chamber, old as the wall, and my rats will not work it. Have not since spring. A ratter KNOWS her beasts — they will work a plague house, they will work under the shambles, and they will not go under that tavern for cheese OR for love.\n\nAnd here is the part I have told nobody, because who would a ratcatcher tell?\n\nShe leans in, and the cackle is gone entirely.\n\nI went down myself, autumn-end, along the Eastway run. And under the singing — you can hear her down there, through the stones, clearer than in the taproom — under it, something was keeping TIME. Slow. Patient. Like a man tapping a table, waiting for a song he knows to end.\\p Whatever waits for a four-hundred-year song to finish, dearie, has TIME. Take the Heapside grate, follow the old brick east, and do not you hum. HEE. I wish I was joking about the humming.",
        do: { flag: 'bess-elfsong-counsel' },
        goto: 'hub',
      },
      rats: {
        speaker: 'Betha Lackman',
        rumor: true,
        text: "Everything, dearie, EVERYTHING — rats are the city's ledger with legs. This tenday they are moving UP, out of the east drains, whole families of them, which means something below has made the low rooms unpleasant, and rats have a very high bar for unpleasant. HEE. Sleep well!",
        goto: 'hub',
      },
      bye: {
        speaker: 'Betha Lackman',
        text: "Off with you, surface-folk. And if you ever hear scratching UNDER a stone floor — that is fine, that is normal, that is mine probably. It is the KNOCKING you write to Bess about. HEE.",
      },
    },
  },

  // =========================================================================
  // 20. EASTWAY
  // =========================================================================

  'alan-alyth': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Alan Alyth',
        text: "The Elfsong. Best beds in the city, and no, I could not tell you what she is singing.\n\nThe tavern is warm, wood-panelled and glowing, and its proprietor is courtesy itself in a pressed apron — and you notice, as he greets you, that the famous third element of the house is missing: the air where a song should be is only air.\n\nAlan Alyth. Welcome. Rooms above, supper below, and the house's other resident is — he pauses, with eleven years of practised deflection failing him for the first time — the house's other resident is quiet tonight.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Alan Alyth',
        text: "What can the house do for you?",
        choices: [
          { text: 'The best the house offers.', do: { shop: 'elfsong-tavern' }, goto: 'hub' },
          { text: 'Rooms for the night. [gold]25 gp[/]', if: { gold: 25 }, do: { heal: { cost: 25, hours: 8 } }, goto: 'rested' },
          { text: '"Quiet tonight." She has stopped singing.', if: { questNot: 'the-elfsong-silent' }, do: { quest: 'the-elfsong-silent' }, goto: 'silent' },
          { text: 'Stand in the common room, Alan. Listen.', if: { quest: 'the-elfsong-silent' }, do: [{ complete: 'the-elfsong-silent' }, { flag: 'elfsong-heard' }, { rep: { id: 'harpers', amount: 3 } }], goto: 'sings' },
          { text: 'Tell us about the song. The usual version.', goto: 'song' },
          { text: 'Keep the house warm.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Alan Alyth',
        text: "The river room. It is the one travellers write home about, and I have stopped pretending modesty on its behalf.\n\nThe bed is deep, the linen lavendered, the quiet absolute — and that last is wrong, and you know it now, and some hour past midnight you wake and listen to the no-song the way you would listen to a stopped heart.",
        goto: 'hub',
      },
      silent: {
        speaker: 'Alan Alyth',
        once: true,
        text: "The courtesy holds. Everything else about him sits down.\n\nEleven years I have kept this house, and she has sung every one of them — every night, the same lament, an elven voice grieving a sailor the sea kept. You understand the words without knowing the tongue. Guests cross the Sword Coast for it. I have three sentences I say when they ask, and I have said them so long I nearly believe them.\n\nFour tendays ago she stopped. Mid-verse. And here is the part I have told no one:\n\nHe leans in, hands flat on the bar.\n\nShe has not GONE. The room is not empty — any innkeep knows an empty room, it is our one wizardry. She is still here. She is LISTENING. To something below the floor, through the stones, and whatever it is, it has her whole attention, and I stood in my own cellar last tenday and felt it listening BACK.\\p The Harper in Heapside says the drains under Eastway answer to the old wall. The ratcatcher will not send her beasts under my floor. I am a courteous man with the best beds in the city and I am asking strangers for help in the only sentence I have left: make it let go of her.",
        goto: 'hub',
      },
      sings: {
        speaker: 'Alan Alyth',
        text: "You stand in the common room. Alan stands beside you, not breathing.\n\nAnd she begins.\n\nMid-verse — precisely where she stopped, four tendays ago, as though no time has passed, because for her perhaps none has. The lament rises through the boards and the lamplight, an elven woman grieving a sailor the sea kept, four hundred years old and absolutely undiminished, and every conversation in the room stops, and the regulars — dockhands, Fist off-duty, a Guild knife by the door — sit still as church.\n\nAlan Alyth listens all the way to the verse's end. Then he pours two glasses of something from the very top shelf, and his three practised sentences are nowhere in evidence.\n\nEleven years I have deflected every question about her, because what I guard in this house is not the song. It is her PRIVACY. She died grieving; the least a landlord owes her is not to make the grief a menu item.\\p But tonight, one time, the true sentence: she is the oldest guest in Baldur's Gate, she pays in the only coin that outlasts cities, and you have just settled her bill with whatever was waiting down there for her song to end. The Elfsong is yours — beds, board, and the corner she favours — for as long as this house stands. She would say it better. She says everything better.",
        goto: 'hub',
      },
      song: {
        speaker: 'Alan Alyth',
        text: "The usual version, then, polished by eleven years of telling.\n\nAn elven woman's voice, in the common room, from no direction, singing in Elvish that every listener understands. A lament for a sailor lost at sea — her sailor, the story goes, four hundred years drowned. She sings, she has always sung, and the tavern was named for her by a keeper so long ago the deed is in a hand nobody alive learned.\n\nThree things I tell the curious: no, there is no schedule. No, she does not answer. And no, you cannot buy the corner seat where the sound is sweetest — it is kept for her, which the regulars enforce more fiercely than I do.\\p And one thing I do not tell them, which you may have on the house: after eleven years, I still stop work when she reaches the third verse. Every night. A man who cannot be stopped by that has taken a wrong turning somewhere, and should not be trusted with an inn.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Alan Alyth',
        text: "Good evening to you. Mind the step down, and if you hear her tonight — you need do nothing at all. That is rather the beauty of it.",
      },
    },
  },

  'the-elfsong': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'The Elfsong',
        text: "There is a place in the common room where the air is different — cooler, and attentive, the way a room is attentive when someone in it is about to speak.\n\nNobody is there. Everybody in the tavern is careful around the space where nobody is.\n\nYou are standing at the edge of her.",
        goto: 'hub',
      },
      hub: {
        speaker: 'The Elfsong',
        text: "The presence does not move. Presences do not need to.",
        choices: [
          { text: 'Listen.', if: { notFlag: 'elfsong-heard' }, goto: 'listening' },
          { text: 'Listen.', if: { flag: 'elfsong-heard' }, goto: 'singing' },
          { text: 'Speak to her.', goto: 'speak' },
          { text: 'Leave her the room.', cancel: true, goto: 'bye' },
        ],
      },
      listening: {
        speaker: 'The Elfsong',
        text: "You listen. There is no song.\n\nBut at the very bottom of the quiet — below the fire, below the taproom murmur — there is something like the shape a voice leaves when it is holding still. She is here. She is listening too.\n\nAnd for one moment, following her attention the way you would follow a pointing hand, you hear what she hears: far below the floorboards, through four centuries of stone, something is keeping time.\\p Slow. Patient. Waiting for the song it knows to end.",
        do: { flag: 'elfsong-listened' },
        goto: 'hub',
      },
      singing: {
        speaker: 'The Elfsong',
        text: "She is singing.\n\nUp close — at the edge of her — it is not louder, but it is DEEPER: an elven lament for a sailor the sea kept, four hundred years old, grief kept perfectly, like a garden, like a vigil, like a lamp.\n\nYou understand every word. You will never afterwards be able to repeat one of them.\n\nAnd beneath the verse, so slight you may be inventing it, something new: the shading of a singer who knows she was listened for, in the dark, and was not left to face it alone.",
        goto: 'hub',
      },
      speak: {
        speaker: 'The Elfsong',
        text: "You speak to the space where nobody is. The taproom pretends, courteously, not to watch you do it.\n\nNo answer comes — no words, at least.\n\nBut the cool air moves, once, past your cheek: the smallest turning, the way a singer half-turns toward a sound at the door and back to her music. You have been noticed. Four hundred years of one grief, and there is still room in it for noticing.\\p It feels, oddly, like being remembered by someone you have not met yet.",
        do: { flag: 'elfsong-spoken' },
        goto: 'hub',
      },
      bye: {
        speaker: 'The Elfsong',
        text: "You step back from the edge of her. The room's warmth takes you again, and behind you the cool and listening air keeps its place — hers, kept for her, as long as the house stands.",
      },
    },
  },

  rolan: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Rolan',
        text: "Sorcerous Sundries. Scrolls, wands, foci, identification. Do not touch the second shelf.\n\nThe great domed shop hums with contained power, and the tiefling at its centre desk wears master's robes cut a shade too formally, the way a young man dresses for a title he earned early and defends daily.\n\nRolan. Yes, THAT Rolan; whatever version of the story reached you is wrong in my favour or against it, and I no longer sort them.\\p What do you need? I ask because the alternative is watching you browse toward the second shelf.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Rolan',
        text: "Well? Magic waits beautifully — it is one of its two virtues — but I have a wand curing in the back and it does NOT.",
        choices: [
          { text: 'Show us the shop.', do: { shop: 'sorcerous-sundries' }, goto: 'hub' },
          { text: 'How did you come to hold Sundries?', goto: 'story' },
          { text: 'What is on the second shelf?', goto: 'shelf' },
          { text: 'What does the arcane trade hear?', goto: 'news' },
          { text: 'Mind the curing wand, master wizard.', cancel: true, goto: 'bye' },
        ],
      },
      story: {
        speaker: 'Rolan',
        text: "The short version, which is the only one I perform sober.\n\nI came up the Chionthar a refugee, apprenticed to the shop's last master, and discovered — in roughly this order — that he was a fraud, a coward, and standing between me and the door when the fighting started. The fighting concluded. He did not. The city needed the shop open more than it needed the story straight, and I was the one who knew where everything was.\\p Four years now. The trade came to sneer at the tiefling apprentice playing master, stayed to have their auras read correctly for the first time in their lives, and now sends me their OWN apprentices, which is the entire war won, quietly, in ledger form.\n\nHe adjusts a perfectly adjusted scroll case.\n\nMy sisters say I tell it too coldly. They were there. They are allowed to say so. Nobody else is.",
        do: { flag: 'rolan-story-known' },
        goto: 'hub',
      },
      shelf: {
        speaker: 'Rolan',
        text: "The things I bought to keep them off the market.\n\nHe does not look at it while he says this, which tells you the habit is disciplined.\n\nA sending-stone that answers a dead correspondent. A wand of binding with three charges and someone still in it, PROBABLY — the diagnostics disagree. A folio of Netherese leaves that rearranges itself toward whatever the reader most wants to believe.\n\nEvery arcane shop accumulates such stock. My predecessor SOLD his, to whoever paid, and I spent my first two years buying it back at a loss that still shows in the books.\\p The second shelf is my penance for a man I did not respect. The trade thinks it is my treasury. Let them. A reputation for hoarding power is CHEAPER than the truth, which is that some things simply need a shelf that never sells.",
        do: { flag: 'rolan-shelf-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Rolan',
        rumor: true,
        text: "The trade hears everything; enchanters gossip worse than fishwives, they merely footnote it. This season: somebody south of the river is buying scrying-wards in quantity through intermediaries who do not know they are intermediaries. Amateurs shield a room. Professionals shield a ROUTE. This is a route.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Rolan',
        text: "Go carefully with whatever you are carrying — and you ARE carrying something; the wards flickered when you came in, and my wards do not editorialise. Good day.",
      },
    },
  },

  lakrissa: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Lakrissa',
        text: "Mind the crates, love — half this stall arrived an hour ago and the other half leaves in one.\n\nThe Eastway stall is small, fiercely organised and stacked with goods from four districts, and the tiefling running it moves like a woman doing three jobs because she is: selling, sorting, and keeping half an eye on two younger tieflings minding the far end.\n\nLakrissa. Four years off the Rivington camps, and this stall is what four years builds if you never once sit down.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Lakrissa',
        text: "So — buying, or asking? I can do both at once; it is the sitting down I never learned.",
        choices: [
          { text: 'What does the stall carry?', goto: 'stall' },
          { text: 'You came up from the camps yourself?', goto: 'camps' },
          { text: 'Alfira travels with us now.', if: { flag: 'alfira-joined' }, goto: 'alfira' },
          { text: 'What does the Eastway hear?', goto: 'news' },
          { text: 'Never sit down, trader.', cancel: true, goto: 'bye' },
        ],
      },
      stall: {
        speaker: 'Lakrissa',
        text: "Everything the camps make and the city pretends it does not want.\n\nShe walks you down the stall with a vendor's pride and a partisan's edge.\n\nRope and net from the bridge weavers — better than the chandlery's, ask any honest sailor. Elturel-style leatherwork. Preserves from Tallstag fruit, put up by three grandmothers who could run the Counting House between them. Half the refugees on the south bank sell through me, because a stall INSIDE the walls pays camp prices no southbank trestle ever will.\\p The Basilisk Gate clerks made it hard for exactly one year. Then Sergeant Nemetsk worked out my paperwork was better than theirs — I make SURE it is better than theirs — and now he waves the cart through and pretends he always did.",
        goto: 'hub',
      },
      camps: {
        speaker: 'Lakrissa',
        text: "Elturel, then the road, then two years in the tents by the ropewalk. Yes.\n\nShe weighs an apple, sets it down, and gives you the truth at trade rate: quick and unpadded.\n\nWhat nobody tells you about coming up from the camps is that the hard part is not the work. Camp folk work like weather. The hard part is the THRESHOLD — every door in this city has a moment where the person behind it decides what you are, and you stand there watching them decide, and you cannot flinch, because flinching confirms them.\\p Four years. I stopped flinching in year two. This year, for the first time, somebody at a patriar kitchen door looked at my horns, and then at my invoice, and the INVOICE won. That is what victory looks like at my scale, love, and I take it.",
        do: { flag: 'lakrissa-threshold-known' },
        goto: 'hub',
      },
      alfira: {
        speaker: 'Lakrissa',
        text: "Her whole face changes — four years of stall-keeper's guard gone in a blink, and underneath it somebody young and fierce and glad.\n\nShe FINALLY went. Gods. I have been telling her for two years: the book is full, love, the road is where the next pages are.\n\nShe grabs your sleeve, entirely unembarrassed.\n\nRight, listen, because somebody in your company needs to know these things. She forgets to eat when she is writing. She will give her coat away — she has done it four times, WATCH the coat. And when she goes quiet in the evenings it is the teacher she is thinking of, and you do not fix it, you just — be there, and hum something badly so she can correct you. That works. That is the whole manual.\\p We came up the same road, her and me. She sang the miles I could not walk. You take CARE of her, and when the book is full — she comes back here, and reads me every page, and I will have the good chairs by then. Tell her that. The good chairs. She will laugh. Do it anyway.",
        do: { flag: 'lakrissa-alfira-charge' },
        goto: 'hub',
      },
      news: {
        speaker: 'Lakrissa',
        rumor: true,
        text: "A stall on the Eastway hears both cities — the one with the walls and the one with the tents. This tenday, both are saying the same thing for once: the river trade is being steered by somebody with soft hands, and steered SOUTH.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Lakrissa',
        text: "Go well, love. Camps rule: if you cannot help, do not linger; if you can — you know where the stall is. It is never moving again.",
      },
    },
  },

  pavel: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Pavel Nemetsk',
        text: "Toll, declaration, and stand on the mark. The mark is there for a reason.\n\nThe Basilisk Gate's stone monsters glare down at a queue that has made its peace with eternity, and at the head of it, behind a lectern-desk of terrifying neatness, a Fist sergeant with a Damaran accent and a stamp he wields like a mace.\n\nSergeant Nemetsk. Forms are on the left. Ink is chained for a REASON. Next.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Pavel Nemetsk',
        text: "You are not moving. The queue has noticed you are not moving. State your business or become a precedent.",
        choices: [
          { text: 'Why all the forms, sergeant?', goto: 'forms' },
          { text: 'What is the strangest thing you have stamped?', goto: 'strangest' },
          { text: 'Anything unusual through the gate lately?', goto: 'news' },
          { text: 'We will stand on the mark, then.', cancel: true, goto: 'bye' },
        ],
      },
      forms: {
        speaker: 'Pavel Nemetsk',
        text: "Because the forms are the WALL, citizen.\n\nHe aligns three papers that were already aligned, with visible satisfaction.\n\nAny fool with a ram can test stone. Nobody rams a DECLARATION. The smuggler does not fear the portcullis; he fears question FOUR — contents, origin, consignee, DECLARED VALUE — because stone can be climbed and question four can only be ANSWERED, and answers can be CHECKED.\n\nHe leans forward, and delivers the credo of his life.\n\nI have caught eleven smugglers this year. The wall caught NONE. The wall is decoration for what I do. My stamp — he holds it up, reverent — weighs half a pound and holds this city better than the basilisks, and THEY get the statues.\\p No, I am not bitter. There is a form for bitter. I filed it.",
        do: { flag: 'pavel-credo-known' },
        goto: 'hub',
      },
      strangest: {
        speaker: 'Pavel Nemetsk',
        text: "A moment. This requires the correct order, which is ascending.\n\nHe counts, with relish, on ink-stained fingers.\n\nItem: one wagon of mirrors declared as 'windows for looking the other way'. Amended and admitted. Item: a Calishite gentleman attempting to declare the same crate TWICE, on the theory that a thing declared twice is doubly legal. It is not. There is now a form clarifying this, and it is named after him.\n\nItem the last, and I tell this one slowly because it earned it: four years ago, a cart of 'temple bells' for Twin Songs. Weight: correct. Documents: BEAUTIFUL. And I passed my hand near the tarp and one of the bells — he pauses, a showman under all that procedure — BREATHED.\\p I stamped DENIED with such force the lectern cracked. The Fist took the cart. What was in the bells went back down the Coast Way under guard, and I was commended, and the lectern was replaced, and I requested the cracked one as a memento. DENIED. There is symmetry in that. I respect it.",
        goto: 'hub',
      },
      news: {
        speaker: 'Pavel Nemetsk',
        rumor: true,
        text: "Unusual is a category, and the category is FULL this season: outbound declarations exceeding inbound for the first time in my nine years. Coin, goods and quiet men, all flowing SOUTH. When the paperwork starts emigrating, citizen, the paperwork knows something.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Pavel Nemetsk',
        text: "Mind the mark as you go. THE MARK. — Thank you. The queue thanks you. The mark, in its way, thanks you. NEXT.",
      },
    },
  },

  zora: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Zora Marsk',
        text: "She is at the wall table with wine she is not drinking, and she has watched you cross the whole room without appearing to watch anything at all.\n\nZora Marsk.\n\nShe indicates the opposite chair with her eyes. Nothing else moves.\n\nYou are the ones the ledgers mention. Sit.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Zora Marsk',
        text: "She waits. Eight words at a time, you were told. So far you have had eleven, which may be a courtesy.",
        choices: [
          { text: 'What do you do here, exactly?', goto: 'work' },
          { text: 'Why the wall table?', goto: 'wall' },
          { text: 'Come and watch doors for us instead.', goto: 'join' },
          { text: 'Enjoy the wine you are not drinking.', cancel: true, goto: 'bye' },
        ],
      },
      work: {
        speaker: 'Zora Marsk',
        text: "I watch the door. People come through it.\n\nA pause. You realise that was the complete answer, and also, slowly, that it was not evasive — it is the entire job, said exactly.\n\nShe adds, with what you will later understand was extraordinary generosity:\n\nTwo years. Every face. Nothing forgotten. Nothing yet missed.",
        goto: 'hub',
      },
      wall: {
        speaker: 'Zora Marsk',
        text: "No one behind. Everyone in front.\n\nShe turns the wine glass one quarter-turn — the first unnecessary motion you have seen from her, and therefore, you suspect, not unnecessary.\n\nThe singer likes this corner. Dead elves are restful company.\\p Eight words at a time, and she has just spent sixteen on you, and something in the stillness suggests she knows you counted.",
        goto: 'hub',
      },
      join: {
        speaker: 'Zora Marsk',
        text: "She looks at you for a long moment. Whatever arithmetic runs behind those eyes, it runs to completion.\n\nThree hundred gold. The Guild's release fee. Not mine.\n\nShe sets one finger on the table — a single point, precisely placed.\n\nMy terms. I pick the watch spot. Always.",
        choices: [
          { text: 'Done. [gold]300 gp[/]', if: { gold: 300 }, do: [{ recruit: 'zora-marsk' }, { flag: 'zora-joined' }], goto: 'joined' },
          { text: 'Not at that price.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Zora Marsk',
        text: "She rises, leaves the untouched wine as payment for the table — the barman nods; this is clearly a settled currency — and is somehow already wearing a travel cloak you never saw arrive.\n\nAt the door she pauses, looking back at the corner where the air is cool, and inclines her head a fraction. Farewell to the singer. Two years of quiet company, acknowledged in full.\n\nThen, to you, the terms restated:\n\nI watch. You will sleep better. Everyone does.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Zora Marsk',
        text: "She returns to the door and its traffic. You have the sudden, complete certainty that your exit will be noted, timed, and filed, and that this is the safest you have been all day.",
      },
    },
  },

  'bardeid-jassan': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bardeid Jassan',
        text: "Come in, come in — you are standing under the second most famous signboard on the Sword Coast and the FIRST most famous is a lie invented by jealous men in Waterdeep.\n\nThe Blade and Stars is handsome, lamplit and half full, and its keeper expands to fill the remainder: a Calishite host in a good coat, pouring welcome like it is on tap.\n\nBardeid Jassan! The sign, yes — it turns to face the weather BEFORE the weather arrives; my grandfather won it in a card game from a wizard who should not have been playing cards. Everything in this house has a story and most of them are TRUE.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bardeid Jassan',
        text: "So! Drink, bed, or INTELLIGENCE? I sell all three and only the third appreciates in value.",
        choices: [
          { text: 'What is the caravan intelligence, then?', goto: 'pitch' },
          { text: 'Buy the good ledger. [gold]15 gp[/]', if: { gold: 15 }, do: [{ gold: -15 }, { flag: 'jassan-ledger-bought' }], goto: 'ledger' },
          { text: 'Tell us about the enchanted sign.', goto: 'sign' },
          { text: 'What is the road saying, freely?', goto: 'news' },
          { text: 'Mind the famous signboard, host.', cancel: true, goto: 'bye' },
        ],
      },
      pitch: {
        speaker: 'Bardeid Jassan',
        text: "Every caravan master on the Coast Way drinks in this room, friend, and caravan masters talk about ONE thing: the road. Schedules, cargoes, guard counts, which fords are bad, which tolls are worse, who is late and WHY they are late.\n\nHe taps his temple, expansively.\n\nI listen, I collate, I VERIFY — verification is the house specialty, any fool can repeat a rumour, I sell CONFIRMED — and the result is the finest commercial intelligence south of Waterdeep, priced by appetite. The scale slides, I confess it, with the evident wealth of the buyer. You look — he assesses you with cheerful larceny — moderately prosperous and rising.",
        goto: 'hub',
      },
      ledger: {
        speaker: 'Bardeid Jassan',
        text: "The GOOD ledger. Excellent choice. Observe how I lower my voice; this is included.\n\nHe leans in, and beneath the showmanship the intelligence is, in fact, professional.\n\nThree items, confirmed twice each. One: the Amnish wine consortium runs a double-guarded shipment north next tenday — double-guarded because the LAST one arrived at Wyrm's Crossing four casks light, and the casks were the ones packed at the BOTTOM, which no honest thief bothers with. Two: a patriar house has been hiring caravan guards who never guard caravans — muster point south of Rivington, wages above rate, questions refused. Three — and this one cost me a bottle of the good Calishite — the Fist escort rotation south of the bridge changes at month's end, and somebody outside the Fist knew it BEFORE the sergeants did.\\p Spend it wisely. And if anyone asks where you heard — the Blade and Stars, friend, SAY the name, accurate intelligence is my advertising.",
        goto: 'hub',
      },
      sign: {
        speaker: 'Bardeid Jassan',
        text: "Ah, the sign! My inheritance, my landmark, my one insoluble mystery.\n\nHe walks you to the window where the signboard hangs: a blade crossed with a scatter of stars, old paint, oddly vivid.\n\nIt turns to face weather before the weather comes — sailors check it against the harbour glass, it has never once lost. It will not be painted over; the painter falls asleep, EVERY painter, we have stopped trying. And on one night in the year — never the same night — the stars on it are in DIFFERENT PLACES, and my grandmother swore they are the sky of some particular evening, and she would never say which evening, and she died smiling about it.\\p The wizard my grandfather won it from came back once, years later, and stood under it a long while. And he paid for his room — the wizard, PAYING — and left a note: 'Keep it dry, and never ask it the question it is waiting for.' We have NOT. Well. My grandfather asked it something once, alone, near the end. He never told, and the sign never turned again for a full year, and that, friends, is the whole story, and I tell it FREE because it is worth more that way.",
        do: { flag: 'blade-and-stars-sign' },
        goto: 'hub',
      },
      news: {
        speaker: 'Bardeid Jassan',
        rumor: true,
        text: "Freely, and worth every copper of it: the road south is crowded and the road north is not, the toll queues run longer at DUSK than noon, which is backwards, and every caravan master in this room has quietly bought a second strongbox this season. Draw your own map, friend. The paid version has NAMES on it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Bardeid Jassan',
        text: "Go WELL! And glance up at the sign as you leave — if it turns as you pass, come straight back in and tell me, there is a standing free bottle on it, unclaimed these forty years!",
      },
    },
  },

  'elfsong-cat': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Nib',
        text: "In the middle of the Elfsong's common room, ignoring the fire, the kitchen and every law of feline economics, a black cat sits facing the corner where nobody is.\n\nHis tail is curled around his feet with the finality of a signature. He has been here, the room's geography suggests, for hours.",
        choices: [
          { text: 'Sit near him and look at the corner too.', goto: 'corner' },
          { text: 'Offer a morsel from the table.', goto: 'morsel' },
          { text: 'Leave him to his vigil.', cancel: true, goto: 'bye' },
        ],
      },
      corner: {
        speaker: 'Nib',
        text: "You settle beside him and regard the empty corner together.\n\nThe air there is cooler. Attentive. After a moment — you will swear to this later — the cool moves, gently, the way a hand passes over a cat's ears, and Nib's eyes narrow to golden seams of complete satisfaction.\n\nHe glances at you once, sidelong: acknowledgement, from one professional to an apprentice.\\p Some guests, the glance says, have simply been here longer than others. The management sees to her regulars.",
        do: { flag: 'nib-vigil-shared' },
        goto: 'start',
      },
      morsel: {
        speaker: 'Nib',
        text: "The morsel is considered, accepted with the graciousness of visiting royalty, and dispatched.\n\nHe then returns his gaze to the corner, making it clear the transaction, while appreciated, has purchased nothing. His attention is a standing appointment, and the appointment is not with you.\n\nFrom behind the bar, Alan Alyth, quietly: \"He has kept her company eleven years. Longer than me. We do not charge his tab.\"",
        goto: 'start',
      },
      bye: {
        speaker: 'Nib',
        text: "You leave him to it: one small black sentry in the lamplight, keeping the oldest appointment in the house, entirely unbothered by how it looks. The corner, you notice on your way out, seems less empty for it.",
      },
    },
  },

  // =========================================================================
  // 21. THE WIDE
  // =========================================================================

  miri: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Miri Tallstag',
        text: "Corporal Tallstag, Wide muster. Lost? Everybody is. Which gate do you want?\n\nThe Wide roars around her — the greatest market square on the Sword Coast in full voice — and the Fist corporal at the muster post is, improbably, smiling: the one friendly uniform in a plaza of hurrying money.\n\nGo on, ask. Directions are the half of this posting nobody trained me for and the only half I am good at.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Miri Tallstag',
        text: "Well? The Wide will still be here when you decide. It is the one thing that will.",
        choices: [
          { text: 'Give us the lay of the Upper City.', goto: 'lay' },
          { text: 'What should we see on the Wide itself?', goto: 'wide' },
          { text: 'You would rather be on the wall.', goto: 'wall' },
          { text: 'What is the muster hearing?', goto: 'news' },
          { text: 'Carry on, corporal.', cancel: true, goto: 'bye' },
        ],
      },
      lay: {
        speaker: 'Miri Tallstag',
        text: "Simplest city in Faerun, this end of it — everything important is a straight line from where you stand.\n\nShe points, economically, four times.\n\nEast avenue to the Temples District: the High Hall, the Dukes, and Oghma's people at the Unrolling Scroll, who will sell you a book and an argument. West to Citadel Streets: the Watch's keep, the patriar manors, and mind the manners, the Watch fines LOITERING and defines it hourly. South arch is the Baldur's Gate itself, down into the Lower City. And north — she taps the wall behind her — the Black Dragon Gate, out, which is the direction the Upper City likes visitors best.\\p That last is the district talking, not me. I am from Rivington. We like everybody; we cannot afford not to.",
        goto: 'hub',
      },
      wide: {
        speaker: 'Miri Tallstag',
        text: "The statue of Balduran, middle of the plaza, first — everyone does, and the pickpockets know everyone does, so keep a hand on your purse while you look UP; that angle pays their rent.\n\nThe fountain court is the good water. Baldur's Mouth stands the north side — the broadsheet; the bell on its roof rings for a death, a war, or a very good scandal, and the whole city stops to count the strokes.\n\nAnd the stalls — she gestures at the roaring acreage of them — Aseir Basha's, by the west arcade, if you want the best and can survive the bargaining.\\p Market court sits under the blue awning if anyone cheats you. Lady Oberon presides. Nobody cheats twice.",
        goto: 'hub',
      },
      wall: {
        speaker: 'Miri Tallstag',
        text: "Every shift.\n\nShe says it cheerfully, which makes it worse somehow.\n\nI did two years on the Black Dragon Gate — real work, cold and honest. Then somebody up the chain decided the Wide's muster post should have, quote, 'an approachable aspect', and here I am, the company's official approachable aspect, giving directions to silk merchants while my squad-mates freeze usefully.\\p Still. — she straightens, catching herself — A lost person helped is helped, wherever the helping happens. That is Rivington doctrine, and it survives even posting to the prettiest square in Faerun. BARELY.",
        goto: 'hub',
      },
      news: {
        speaker: 'Miri Tallstag',
        rumor: true,
        text: "The muster post hears the polite version of everything. This tenday, even the polite version says the patriars are nervous — more private guards hired, fewer garden parties. When the Upper City stops entertaining, corporal wisdom says, it is because somebody at the table cannot be seated with somebody else.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Miri Tallstag',
        text: "Off you go. And if you get turned around, look for the bell tower — Baldur's Mouth is north, always. Cheapest compass in the city.",
      },
    },
  },

  sirene: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sirene Oberon',
        text: "Your stall is four inches over the line and I have already written it down.\n\nShe says it without looking up, then does look up, establishes that you have no stall, and files even that with a small notation.\n\nSirene Oberon. Market court. The Wide polices its own commerce and I am the polices — weights, measures, frontages, and the eternal war of the encroaching awning. Try to be interesting; the morning has been honest so far, and honest is dull.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Sirene Oberon',
        text: "Well? Court is in session whenever I am standing up. I am always standing up.",
        choices: [
          { text: 'What does the market court actually do?', goto: 'court' },
          { text: 'An Oberon, running weights and measures?', goto: 'oberon' },
          { text: 'What passes across the court, lately?', goto: 'news' },
          { text: 'Mind the four inches, my lady.', cancel: true, goto: 'bye' },
        ],
      },
      court: {
        speaker: 'Sirene Oberon',
        text: "Everything beneath the Parliament's dignity and above a fistfight, which on the Wide is a substantial jurisdiction.\n\nShe ticks the docket off with terrifying fluency.\n\nShort weights: fined by the ounce. False saffron: fined by the yard of frontage, confiscation, and I make them watch me burn it, which does more than the fine. Stall lines: the four-inch war, eternal, unwinnable, waged anyway. And disputes — forty a day, everything from a bruised peach to a betrothal conducted via rival fruit stalls, which I ruled on LAST tenday and do not wish to discuss.\\p The dukes govern the city, allegedly. I govern eleven acres of it in fact, by the yard, and my eleven acres turn more coin than the harbour. Boredom, you see, is not the absence of importance. It is importance, PERFECTED.",
        do: { flag: 'market-court-known' },
        goto: 'hub',
      },
      oberon: {
        speaker: 'Sirene Oberon',
        text: "Third daughter. The dry docks went to my brother, the marriage went to my sister, and I was offered — she pronounces the word with museum-quality contempt — LEISURE.\n\nA merchant hurries past; she fines his awning two inches with one glance and he adjusts it without being spoken to.\n\nI declined. The market court was vacant, being beneath every patriar in the city, and I have held it eleven years and made it feared, which no Oberon has managed with a shipyard in two generations. My family finds it eccentric. My family also notes that when the Wide's rents are argued at the Parliament, it is MY ledgers that settle the matter.\\p Power in this city wears silk upstairs and thinks itself grand. Power is actually a woman with a measuring rod whom nobody dares lie to. I have measured both kinds. Mine is four inches longer.",
        goto: 'hub',
      },
      news: {
        speaker: 'Sirene Oberon',
        rumor: true,
        text: "The court sees commerce with its face washed off. Lately: three old stall families selling their pitches — PITCHES, held for generations — to the same discreet broker, at prices nobody sane refuses. Somebody is buying the Wide by the yard, and doing it politely, which in my experience is how the largest things are stolen.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Sirene Oberon',
        text: "Go. You have loitered the statutory maximum, and I have written that down too. It is a warning. The fine is for staying to argue.",
      },
    },
  },

  aseir: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Aseir Basha',
        text: "You have stopped walking. That is the hard part done — the rest is only price.\n\nThe stall is a spice-scented empire in miniature: saffron under glass, silks in graded light, and a Calishite factor presiding with the serenity of a man who has never once lost a negotiation he chose to begin.\n\nAseir Basha. Little Calimshan born, Wide risen. Everything here is the best of its kind inside these walls, and priced accordingly, and worth it, and you already suspect all three, or you would still be walking.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Aseir Basha',
        text: "Browse with your eyes, your hands, or your purse — but browse. Leaving empty is permitted. It has simply never happened.",
        choices: [
          { text: 'Show us the stall.', do: { shop: 'bg-wide-market' }, goto: 'hub' },
          { text: 'From the enclave to the Wide. How?', goto: 'rise' },
          { text: 'Zasheida Pashar speaks of you.', if: { flag: 'zasheida-second-inventory' }, goto: 'zasheida' },
          { text: 'What does the Wide\'s money whisper?', goto: 'news' },
          { text: 'We are leaving empty. Historically.', cancel: true, goto: 'bye' },
        ],
      },
      rise: {
        speaker: 'Aseir Basha',
        text: "Eleven years of the Basilisk Gate toll, paid in full, with a smile the clerks learned to dread.\n\nHe arranges a fan of cinnamon sticks while he talks, and the arranging is itself a small performance of the answer.\n\nThe walls keep Calishites out of the Upper City in every way but one: commerce. A stall permit cannot ask about your grandmother. So I paid the toll daily, sold better goods than the inside men at better grace, and when the Wide's stall families sneered, I sent their COOKS home with free samples. The cooks, my friend. The cooks run every kitchen in the district. Within three years the patriars were demanding my saffron by NAME at dinners I could not attend.\\p Now I am inside, and the sneer is a bow, and the bow is worth nothing, and I return it beautifully every single day. Commerce, done properly, is the politest revenge ever invented.",
        do: { flag: 'aseir-rise-known' },
        goto: 'hub',
      },
      zasheida: {
        speaker: 'Aseir Basha',
        text: "Ah.\n\nThe performance stops entirely, one moment, and underneath it is something older and warmer.\n\nMy mother's cousin. She staked my first stall out of the bazaar strongbox when the proper lenders laughed, and the terms — he smiles — the terms were Calimshan itself: no interest, no schedule, and one condition. That I never pretend, inside these walls, to be anything but Little Calimshan wearing its market face.\n\nI have kept the condition. It has been easier than expected; the Wide pays a premium for authenticity, which is the great joke of the walls — they charge us the toll and then buy the very thing they tolled.\\p If she sent you to me, you sit in the good chair, such as it is, and the first measure of saffron travels free. Do not argue. The argument is also hers, and I have never won it.",
        do: { flag: 'aseir-zasheida-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Aseir Basha',
        rumor: true,
        text: "The Wide's money whispers constantly; the trick is to hear which whisper pays for the next one. This season it says: the patriar kitchens are ordering funeral spice and calling it festival stock, and the difference, my friend, is one I have never once mistaken in thirty years.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Aseir Basha',
        text: "Go well — and take the scent of the stall with you; it is free, it is deliberate, and it will bring you back. It always brings them back.",
      },
    },
  },

  'kethra-hornraven': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kethra Hornraven',
        text: "She stands at the base of the Baldur's Mouth bell tower with the rope's end in reach, watching the Wide with twenty years of Fist stillness repurposed for civilian use.\n\nHornraven.\n\nA nod.\n\nBellringer.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kethra Hornraven',
        text: "She waits. Two words at a time, they say. You suspect you will learn to count them.",
        choices: [
          { text: 'When does the bell ring?', goto: 'when' },
          { text: 'You were Flaming Fist.', goto: 'fist' },
          { text: 'What is the bell like, up close?', goto: 'bell' },
          { text: 'Good watch, bellringer.', cancel: true, goto: 'bye' },
        ],
      },
      when: {
        speaker: 'Kethra Hornraven',
        text: "Death. War.\n\nA pause, precisely measured.\n\nGood gossip.\n\nAnd — because your face asks the obvious next question — she holds up fingers: one stroke, three strokes, seven strokes. The city counts. The city always counts.\\p Seven strokes, the whole Wide stops. Best moment. Everyone honest.",
        goto: 'hub',
      },
      fist: {
        speaker: 'Kethra Hornraven',
        text: "Twenty years.\n\nShe looks at the plaza the way veterans look at ground: cover, lanes, fields of fire, force of habit.\n\nGood years. Loud years.\n\nA long moment. Then, with the air of a woman granting an entire memoir:\n\nBell is louder. Bell lies less.",
        do: { flag: 'hornraven-fist-known' },
        goto: 'hub',
      },
      bell: {
        speaker: 'Kethra Hornraven',
        text: "She considers you. Then, evidently deciding you have earned the long version, she gives it:\n\nOld bronze. Named Speaker. Cast from — she taps the tower stone — melted cannon. Elturel war.\n\nShe touches the rope, once, the way Holg touches his arch.\n\nRings true. Twenty years, never early. Never late.\\p Four words over budget, that. You have had the whole of her. She returns to the watching, and the Wide, unaware, is watched well.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kethra Hornraven',
        text: "A nod. Two words, at parting, spent like gold:\n\nWalk straight.",
      },
    },
  },

  grim: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Grim Guthmere',
        text: "A copper for a rumour, two for a good one, and three if you want it to be true!\n\nHe is draped on the Wide's steps in a coat that was worth a house when it was new — it is no longer new, and neither is he — with a bottle at his elbow and the cheerfullest ruin of a face you have seen inside these walls.\n\nGrim Guthmere. Of THE Guthmeres — yes, the ones on the plaque, no, they do not wave. The family disappointment, at your service, fully licensed by nobody and beloved of the step.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Grim Guthmere',
        text: "Well? Commerce or company? I am delightful at both and solvent at neither.",
        choices: [
          { text: 'Three coppers. The true kind. [gold]1 gp[/]', if: { gold: 1 }, do: { gold: -1 }, goto: 'rumour' },
          { text: 'What happened? Coat like that, steps like these.', goto: 'ruin' },
          { text: 'What do the patriars not want said?', goto: 'patriars' },
          { text: 'Enjoy the step, Guthmere.', cancel: true, goto: 'bye' },
        ],
      },
      rumour: {
        speaker: 'Grim Guthmere',
        rumor: true,
        text: "A whole gold piece! The vintage service, then — he bites the coin, theatrically, approves — and the vintage rule: I tell you true things the polished people say NEAR me, because nobody guards their talk around a ruin. We are furniture, dear hearts. EXPENSIVE ears, going cheap.",
        goto: 'hub',
      },
      ruin: {
        speaker: 'Grim Guthmere',
        text: "Cards, first, which everyone believes. Then drink, which everyone enjoys believing. But the TRUTH — he taps the bottle, fondly — the truth is duller and worse: I said the wrong true thing at the right dinner.\n\nHe stretches, entirely at ease on his stone.\n\nEleven years ago, at my father's table, before the assembled cream of four houses, somebody toasted a business venture, and I — young, drunk, and CORRECT — named the venture for what it was, which was tenement rents in Norchapel dressed as a charitable trust. Pin-drop silence. And by season's end I was the drunk one, the unstable one, the one the family regrettably no longer — you know the phrasing. The phrasing is beautiful. We breed for phrasing.\\p They took the allowance, the rooms, the name in everything but law. They could not take the steps. And here is the joke that keeps me warm, dear hearts: from the steps, you hear EVERYTHING. I know more about the four houses now than I did at the table. I simply drink where the rent is honest.",
        do: { flag: 'grim-truth-known' },
        goto: 'hub',
      },
      patriars: {
        speaker: 'Grim Guthmere',
        text: "Oh, the MENU. Where to begin.\n\nHe counts on ringless fingers, savouring each.\n\nThey do not want said: that half the old houses are mortgaged to a certain moneylender whose collectors wear such CLEAN coats. That the garden parties stopped because two families cannot be seated together since the Stelmane business — seated TOGETHER, note, nobody asks why. That there are more private guards inside the Old Wall this season than at any time since the crisis, hired quietly, paid in cash.\\p And the grandest unsayable of all, dear hearts, the one I was exiled for saying early: that the money up here has not been MADE inside these walls for two generations. It is collected. From below. The Upper City is a beautiful roof, and roofs, as any drunk on any step will tell you — he raises the bottle in toast — roofs are held up by the house.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Grim Guthmere',
        text: "Off you go, dear hearts! Mind the polish — the steps are slick and the people slicker, and only ONE of them will help you up again. It is the steps. It is always the steps.",
      },
    },
  },

  astorio: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Astorio Falone',
        text: "He materialises beside you in the market crowd with a smile of professional warmth — and then sees your faces properly, and the smile changes key entirely: less warmth, more craft, the pretence set down like a tool between colleagues.\n\nAh. The ledger people. — He inclines his head. — Astorio Falone. Ordinarily I would be being your friend right now, delightfully, while my fingers did the accounting. But the Guild's word is that you are IN the accounting, so instead: professional courtesy.\\p It is so restful. You have no idea. Smiling is the hardest work on this plaza.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Astorio Falone',
        text: "Ask what you like. The crowd will keep — the crowd, bless it, always keeps.",
        choices: [
          { text: 'How does the Wide get worked?', goto: 'craft' },
          { text: 'The Guild operates inside the walls too?', goto: 'guild' },
          { text: 'What have your fingers heard lately?', goto: 'news' },
          { text: 'Good hunting, Falone.', cancel: true, goto: 'bye' },
        ],
      },
      craft: {
        speaker: 'Astorio Falone',
        text: "Beautifully, since you ask a craftsman.\n\nHe watches the crowd flow past, marking targets the way a fisherman reads water, purely for the pleasure of the reading.\n\nThe Wide is the richest water on the coast and the most overfished, so the work is SELECTION. Never the merchants — they count constantly, it is a tic. Never the poor — nothing there, and the Guild's rule besides. The catch is the COMFORTABLE: the visiting factor, the patriar's nephew, the silk-shopper so certain of this square that her attention is entirely on the saffron.\\p Confidence, friend. I do not steal purses. I steal the moment when a person believes nothing can happen to them, and the purse merely comes with it. The Upper City manufactures that moment in BULK. It is the one local industry that has never once slowed.",
        goto: 'hub',
      },
      guild: {
        speaker: 'Astorio Falone',
        text: "Delicately. The walls make everything up here delicate.\n\nHe adjusts a glove, the craft speaking through the smallest motions.\n\nBelow, the Guild is government. Up here it is WEATHER — a light hand, a levy on the market's shadows, eyes at every gate. Nine-Fingers keeps it deliberately small: too much Guild inside the Old Wall and the patriars would finally unite about something, and a united patriarch is the one animal she has never wanted to meet.\\p So we take modestly, watch enormously, and report everything. I lift four purses a day and RETURN two of them, chosen carefully, because a district that half-trusts its thieves never organises against them. That is not my rule. That is HER rule, and it is why the Guild has outlived every crackdown since before I was born.",
        do: { flag: 'astorio-weather-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Astorio Falone',
        rumor: true,
        text: "Fingers hear better than ears up here. Lately: the comfortable are carrying LESS — half the purses on this plaza are decoys now, patriar households drilling their people like a siege was coming. Somebody has frightened the money, friend, and I would dearly love an introduction.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Astorio Falone',
        text: "Go gently. And do check your purse — not me, obviously, COLLEAGUES do not — but this is still the Wide, and the Wide, bless it, always keeps.",
      },
    },
  },

  'rowan-linnacker': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Rowan Linnacker',
        text: "Yes. What. Be brief; the forme closes at the bell.\n\nThe composing room of Baldur's Mouth smells of ink and hot metal, and its editor stands at the stone in sleeve-garters, reading type upside down and backwards at speed, which she continues to do while addressing you.\n\nRowan Linnacker. I write the prose this city reads aloud at breakfast, and I speak like a telegraph because the prose takes ALL of it. What.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Rowan Linnacker',
        text: "Still here. Brief, then. Briefer than that.",
        choices: [
          { text: 'Your paper printed a lie, and you know it.', if: { questNot: 'what-the-mouth-prints' }, do: { quest: 'what-the-mouth-prints' }, goto: 'lie' },
          { text: 'The proof sheets. On the stone, as asked.', if: { quest: 'what-the-mouth-prints' }, do: [{ complete: 'what-the-mouth-prints' }, { flag: 'bg-mouth-owes-you' }, { rep: { id: 'harpers', amount: 4 } }], goto: 'sheets' },
          { text: 'What is Baldur\'s Mouth, to the city?', goto: 'mouth' },
          { text: 'The forme is waiting. Good day.', cancel: true, goto: 'bye' },
        ],
      },
      lie: {
        speaker: 'Rowan Linnacker',
        once: true,
        text: "She sets down the composing stick. In this room, you sense, that is a fire bell.\n\nFour editions. Four, stating the Guild had, quote, no hand whatever, unquote, in the rope-walk fire — florid, categorical, and NOT MINE. I write this paper's every leader and I did not write THAT, and I cannot prove it, because my own compositor set the formes and then stopped coming to work, and the proof sheets — the only pages showing the text as it arrived, in whose hand, with whose marks — went out of this building in his apron pocket.\n\nShe comes around the stone, and drops the telegraph style entirely for one sentence:\n\nSomebody is using my press to launder a lie, and a press that can be used once can be OWNED, and I would rather burn the building.\\p Find Wellum. Find the sheets. Heapside, he lodged, past the rope-walk — which is EITHER an irony or a confession, and the difference is the story. Bring me the pages and I will put the Mouth's correction on the front in type you can read across the Wide. And after that, the Mouth owes you, and the Mouth's debts — unlike everything else in this city — are paid in DAYLIGHT.",
        goto: 'hub',
      },
      sheets: {
        speaker: 'Rowan Linnacker',
        text: "She takes the sheets and reads them at the stone, fast, twice — once as an editor, once as something angrier — and when she looks up, the sleeve-garters are coming off, which the apprentices watch the way sailors watch weather.\n\nWellum's hand on the takes. A PAYMASTER'S hand on the margins — see the reckoning marks, that is a counting-house habit, gods, they did not even trouble to hide it from paper, only from PEOPLE.\n\nShe is already pulling type as she talks, the composing stick filling at telegraph speed.\n\nCorrection, front page, tomorrow: the fire, the lie, the hand that bought it — attributed, evidenced, and in forty-eight point. The Mouth eats its own error in public, which will cost me a season of dignity and buy back ten years of the only capital this trade has.\\p And you. — She stops, one moment, entirely. — The Mouth owes you, printed and standing. When you need the Upper City's ear — and in this town, you will — come to the stone. The bell is about to ring for the forme, and for once, the news is TRUE.",
        goto: 'hub',
      },
      mouth: {
        speaker: 'Rowan Linnacker',
        text: "The only institution in Baldur's Gate that everyone reads and nobody owns. So far.\n\nShe pulls a fresh galley and marks it while she talks — the prose, as advertised, taking all of her, the speech coming out of the margins.\n\nFour pages, daily. The dukes read it to learn what the docks think; the docks, what the dukes DID. The bell rings the big stories and the print carries the true ones, and between bell and print this city has ONE shared set of facts, one, and it is four pages long and I close it at the bell every night with my own hands.\\p The patriars call it a scandal-sheet. Correct. Scandal is what power calls the weather report. We print the weather.",
        do: { flag: 'mouth-creed-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Rowan Linnacker',
        text: "Good. Out through the press room, mind the ink, and if anything true happens to you — the Mouth pays for TRUE. It is the only word in the shop with a fixed rate.",
      },
    },
  },

  ellyjobell: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ellyjobell Nackle',
        text: "Mind the type case — no, MIND it, that is eight-point Amnish and it took four years to — thank you. Hello. Sorry. Priorities.\n\nThe gnome at the composing frame is setting type at a speed that looks like sleight of hand, reading everything backwards, talking in a rapid parenthetical stream that never quite stops.\n\nEllyjobell Nackle (typesetter, twenty-two years, the fast frame — the OTHER frame is Wellum's, which is a whole — hm. Never mind. Or ask. Probably ask.)",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ellyjobell Nackle',
        text: "Talk while I set — I hear better with my hands busy (this is medically untrue but professionally accurate).",
        choices: [
          { text: 'Tell us about Wellum\'s frame.', if: { quest: 'what-the-mouth-prints' }, goto: 'wellum' },
          { text: 'What is it like, reading everything first?', goto: 'first' },
          { text: 'What has passed through your hands lately?', goto: 'news' },
          { text: 'Mind the eight-point Amnish, then.', cancel: true, goto: 'bye' },
        ],
      },
      wellum: {
        speaker: 'Ellyjobell Nackle',
        text: "Her hands stop. In this room, that is the second fire bell you have seen.\n\nWellum. Nineteen years at that frame (slow but CLEAN, cleanest sorts in the shop, never a turned letter) — and then the rope-walk pieces came in, and he set them without a word, and Wellum ALWAYS talks setting, it is how he keeps the line, and then he stopped coming in.\n\nShe lowers her voice into a parenthesis meant only for you.\n\nHere is what I have told nobody (because who checks the typesetter's memory? NOBODY, which is the whole story of this trade): the copy came in a fair hand, not a reporter's — reporters cross out, this had NO crossings — on counting-house laid paper (the wire-marks, you learn the papers, twenty-two years) — and Wellum read it, and went GREY, and set it anyway, and took the proofs himself, which was never his job.\\p He was not bought, whatever the shop whispers. He was FRIGHTENED, and a frightened compositor keeps the proofs (evidence keeps a man alive, we all learn that here) — so wherever Wellum is, the sheets are, and wherever the sheets are — she looks at you, entirely un-parenthetical for one moment — go CAREFULLY. Somebody thought about paper. People who think about paper think about people.",
        do: { flag: 'ellyjobell-wellum-known' },
        goto: 'hub',
      },
      first: {
        speaker: 'Ellyjobell Nackle',
        text: "Backwards, twice, before the city reads it once — that is the job (and the joke, and the honour, in that order).\n\nHer hands resume, click-click, the thought keeping pace.\n\nEvery duke's proclamation, every scandal, every death notice: it exists in my composing stick before it exists in the WORLD (in a sense, don't examine the sense too hard, the sense is load-bearing). I have set the ends of wars and the prices of onions with the same eight fingers, and here is what twenty-two years teaches: they are the SAME SIZE. In type, everything true is the same size, and only the point-size is politics.\\p (The editor sets the point sizes. I set the truth. We have an understanding, and the understanding is that I am right and she is in charge.)",
        goto: 'hub',
      },
      news: {
        speaker: 'Ellyjobell Nackle',
        rumor: true,
        text: "Through my hands lately (setting is reading, reading is knowing, knowing is — anyway): three patriar death notices in a hand that was alive last season's garden-party lists, two shipping notices withdrawn AFTER setting (withdrawn costs double, somebody paid double to unsay a boat), and a betrothal — she pauses, relishing — set, pulled, and RESET with a different groom. Eight-point. Nobody noticed. I noticed.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ellyjobell Nackle',
        text: "Off you go (mind the case, mind the ink, mind the — yes, exactly, all of it). And whatever you do out there — make it FIT in a headline. The ones that don't fit are the ones that end badly. Typesetter's wisdom. No charge.",
      },
    },
  },

  // =========================================================================
  // 22. THE TEMPLES DISTRICT
  // =========================================================================

  'glar-bersk': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Glar Bersk',
        text: "The Hall is not open. It has not been open. Summons or step aside.\n\nThe High Hall rises behind him, fortress-turned-palace, and its usher stands on the step with a staff of office and the immovable calm of a man who has made dukes wait in the rain, on procedure, and slept soundly after.\n\nUsher Bersk. The step is public. The door is not. That is the whole of the constitution and I am the paragraph that enforces it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Glar Bersk',
        text: "Well? The step holds all day. I have seen it done.",
        choices: [
          { text: 'The Mouth\'s front page. You know what we did.', if: { all: [{ questDone: 'what-the-mouth-prints' }, { notFlag: 'bg-ducal-summons' }] }, goto: 'summons' },
          { text: 'We carry the ducal summons.', if: { flag: 'bg-ducal-summons' }, goto: 'pass' },
          { text: 'We have business with the Council.', if: { notFlag: 'bg-ducal-summons' }, goto: 'business' },
          { text: 'What would get us through this door?', if: { notFlag: 'bg-ducal-summons' }, goto: 'how' },
          { text: 'Hold the step, usher.', cancel: true, goto: 'bye' },
        ],
      },
      summons: {
        speaker: 'Glar Bersk',
        text: "He looks at you for a long moment. Then he produces, from within the staff of office — it is hollow; you suspect this is the only levity in his entire body — a sealed paper.\n\nDuchess Sashenstar's hand. Held at this step four days, against the persons matching a description which — he consults it, gravely — 'will be obvious.'\n\nHe hands it over: a ducal summons, seal unbroken, your names in a precise, furious hand.\n\nThe Mouth printed a correction this morning that the Parliament has been failing to discuss loudly all day. Her Grace does not fail to discuss things. She summons the persons responsible.\\p Procedure is satisfied. I am — he pauses, and the admission costs him visibly — PLEASED to be able to say so. The Hall is open to you. Mind the floor; it is older than the city and it echoes opinions.",
        do: { flag: 'bg-ducal-summons' },
        goto: 'hub',
      },
      pass: {
        speaker: 'Glar Bersk',
        text: "He verifies the seal — thoroughly, because a summons unverified is worse than none — and steps aside with the full ceremony of the office, staff grounded, head inclined at the precise angle owed to invited persons of no rank.\n\nThe High Hall receives you. Grand Duke Ravengard keeps the map room, the Duchess her chamber, Duke Portyr the long gallery, and the Parliament the benches, and all of them can hear you coming on that floor, which is by design.\\p Enter.",
        choices: [
          { text: 'Into the High Hall.', do: { warp: { map: 'high-hall', x: 15, y: 22, dir: 'up' } } },
          { text: 'A moment yet on the step.', goto: 'hub' },
        ],
      },
      business: {
        speaker: 'Glar Bersk',
        text: "Everyone has business with the Council. The Council IS business; that is the complaint about it.\n\nHe recites, with the fluency of ten thousand repetitions:\n\nPetitions are lodged with the Parliament clerks, east door, third bell to sixth. Audiences are granted by summons only. Summonses are issued at the Council's pleasure, and the Council's pleasure, I am instructed to say, is CONSIDERABLE but not indiscriminate.\\p I have turned dukes' cousins from this step, and a Waterdhavian envoy, and once — he permits himself the memory — a dragon in a clerk's body, who took it well, all things considered. You are in distinguished company on the outside of this door. It is the best-attended side.",
        goto: 'hub',
      },
      how: {
        speaker: 'Glar Bersk',
        text: "Notice.\n\nHe says it as one word, complete, then — unusually — elaborates:\n\nThe Council summons what it has noticed. It notices what the city cannot stop discussing. And the city — he glances, with the faintest professional distaste, toward the Wide and its bell tower — discusses what the Mouth prints.\\p I do not advise persons. I observe procedure. But I have stood this step thirty years, and every private citizen I have ever admitted through this door arrived by the same road: they did something the broadsheet could not leave alone. The door is opened by the bell, one way or another. It has never once been opened by the step.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Glar Bersk',
        text: "Good day. The step will be here. So will I. The two facts are related.",
      },
    },
  },

  ravengard: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ulder Ravengard',
        text: "You are in the High Hall. Say the thing you came to say, and say it once.\n\nThe map room holds a table of the whole Sword Coast, worked in relief, and the man over it is grey at the temples and built like the wall of a keep: Marshal of the Flaming Fist, Grand Duke of Baldur's Gate, and four years past a crisis that is still visibly standing behind his eyes.\n\nRavengard. Sit if you must. I stopped sitting in '92.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ulder Ravengard',
        text: "Speak. Everything in this room is an order or a report, including the kindnesses. Choose which yours is.",
        choices: [
          { text: 'The Duchess\'s business is finished. We are known to you.', if: { all: [{ questDone: 'the-ducal-summons' }, { questNot: 'the-fourth-chair' }] }, do: { quest: 'the-fourth-chair' }, goto: 'charge' },
          { text: 'It is done. Speak to the Parliament, Grand Duke.', if: { quest: 'the-fourth-chair' }, do: [{ complete: 'the-fourth-chair' }, { flag: ['bg-fourth-chair-settled', 'baldurs-gate-complete'] }, { rep: { id: 'lords-alliance', amount: 8 } }], goto: 'finished' },
          { text: 'What is the city, from where you stand?', goto: 'city' },
          { text: 'Grand Duke.', cancel: true, goto: 'bye' },
        ],
      },
      charge: {
        speaker: 'Ulder Ravengard',
        once: true,
        text: "Known to me. Yes. Sashenstar's report was two pages; the first page was what you did, and the second was that you can be trusted, and she does not write second pages.\n\nHe moves to the table, and sets one scarred finger on the city — on the High Hall itself, the room you are standing in.\n\nSo hear the thing I cannot say outside this room. Somebody is buying the fourth chair on the Council of Four. Guild coin, moved through wages and manor repairs and a dozen honest-looking hands, assembling toward a vacancy that does not exist yet — which means the buyer knows how the vacancy ARRIVES, and when. And the contract that arranged it all was not signed in ink. My own diviners went grey reading the ash of it.\n\nHe straightens, and it is the Marshal speaking now, parade-ground plain.\n\nI do not want an arrest. Arrests are for things this city can survive knowing. I want it FINISHED — the money followed to Sow's Foot, the ledger taken, and the thing that countersigned brought out where it stands, in this Hall, in daylight, with the Parliament of Peers on their benches watching. Baldur's Gate nearly died four years ago of what it refused to look at.\\p This time the city looks. That is the whole order. Go.",
        goto: 'hub',
      },
      finished: {
        speaker: 'Ulder Ravengard',
        text: "The Hall is silent the way a battlefield is silent after: the scorch on the ancient floor, the Parliament of Peers on their benches with fifty faces the colour of parchment, and the thing that countersigned gone back to whatever ledger keeps IT.\n\nRavengard walks to the centre — through it, through the scorch, deliberately — and addresses the benches without notes.\n\nPeers of Baldur's Gate. You saw. You will not be asked to pretend otherwise, and no bell will ring tonight to soften it. A chair on your Council was for sale, the coin was stolen, the buyer dealt with powers this city has bled to keep out, and it ended HERE, in daylight, in front of you — because the last time we looked away, the price was nearly everything.\n\nHe turns to you, in front of all of them, and the parade-ground voice does not soften, which is precisely what makes it an honour.\n\nThese persons acted for the city when the city did not know it needed acting for. The Fist knows their names. The Hall knows their faces. Baldur's Gate — he sets the words down like standards — pays its debts.\\p Later, at the map table, quietly, the other voice — the one from before the titles: The chair stays empty a season, and the Parliament will argue the succession properly, in the open, at TEDIOUS length. That tedium is what you bought. It is the most expensive thing in this city, and the only thing I have ever wanted for it. Go and be paid, and then go and rest. That last is an order. It is the kind I am worst at following and best at giving.",
        goto: 'hub',
      },
      city: {
        speaker: 'Ulder Ravengard',
        text: "From here?\n\nHe looks at the relief map: the three cities in their walls, the river, the roads running south and north like moored ropes.\n\nA soldier's answer, because I have no other kind. Baldur's Gate is a fortress that forgot it is one. The walls face outward, and the rot walks in through the gates with a bill of lading. Four years I have spent teaching a mercenary company to be an army, a Council to be a government, and a city to look at things — and I will finish none of it, and I knew that when I took the chain.\\p My predecessors kept the city rich. The crisis taught me the other job: keep it HONEST enough to survive its wealth. It is slower work. It has no parades. Stelmane understood it, of everyone — she and I disagreed about everything except that.\n\nHe is quiet a moment, and the grey shows.\n\nSay what you came to say, whenever you are ready. This room does not rush people. It is the only mercy I have been able to institutionalise.",
        do: { flag: 'ravengard-creed-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Ulder Ravengard',
        text: "Go. And whatever you are carrying out of this room — carry it like an order. Things carried like orders arrive.",
      },
    },
  },

  portyr: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Dillard Portyr',
        text: "Ah! Company! Sit, sit — the gallery chairs are the only honest comfort in this building, I had them sent from my own house when I stopped being important.\n\nDuke Dillard Portyr is silver-haired, beautifully dressed and radiating a warmth so genuine you nearly miss the eyes doing the arithmetic behind it. He was Grand Duke once. He gave it up. Everyone has a theory.\n\nWine? No? Wise, wise. The Hall's cellar survived the crisis; the vintages did not, and we serve them anyway out of civic loyalty.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Dillard Portyr',
        text: "Now! What can an old man who used to matter do for you? Ask anything. ANYTHING. I so enjoy questions.",
        choices: [
          { text: 'Why did you give up the Grand Dukedom?', goto: 'gave' },
          { text: 'What should we know about the Council?', goto: 'council' },
          { text: 'A straight question: who do you serve?', goto: 'serve' },
          { text: 'Keep the honest chairs, your Grace.', cancel: true, goto: 'bye' },
        ],
      },
      gave: {
        speaker: 'Dillard Portyr',
        text: "Do you know, you are the fourth person this season to ask, and I gave the other three entirely different answers, and every one was true!\n\nHe settles back, delighted, pouring himself the disloyal vintage.\n\nTo the first I said: age, dear boy, the chain weighs four pounds and the years weigh more. To the second: that Ravengard was simply BETTER at the parts that matter now — a soldier's city wants a soldier — and a wise man leaves the stage while the applause is still confused. To the third, who was a Parliament clerk and deserved richness: I said the fishing had gotten unmissable.\n\nHe raises the glass to you, twinkling, and the arithmetic behind his eyes never once stops.\n\nAnd to you, hm? To you I shall say: a Grand Duke can do nothing quietly, and I found, late in life, a great appetite for the quiet ones.\\p There! Four answers, four gifts. You may keep whichever fits. That is more than most people leave this gallery with, and notice — he beams — you have learned NOTHING, and had such a pleasant time doing it.",
        do: { flag: 'portyr-four-answers' },
        goto: 'hub',
      },
      council: {
        speaker: 'Dillard Portyr',
        text: "The Council of Four! Yes. Well. Officially: four dukes, one grand, governing in harmonious concert with the advice of the Parliament of Peers.\n\nHe leans in, confiding, warm as a hearth.\n\nUnofficially — and you must never say I said this, which is safe, because I am about to say nothing — it is three people who remember the crisis differently, and me, pouring the wine. Ravengard governs like a man holding a door. Dear Katernin holds her predecessor's chair and her predecessor's QUESTIONS, and works too hard at both. And Dlusker — he smiles with real fondness, which is somehow the most opaque thing he has done yet — Dlusker is loud precisely as a kettle is loud, to let you know how hot things are getting underneath.\n\nAnd the empty pause where a fifth opinion should be? — He swirls the wine, benign. — Every council keeps one chair for the person none of them have agreed to fear yet.\\p More wine? No. No, you are learning.",
        goto: 'hub',
      },
      serve: {
        speaker: 'Dillard Portyr',
        text: "A straight question! Oh, WELL done — nobody brings me those any more; they are quite my favourite, they take such lovely dodging.\n\nHe sets down the glass, and for a moment the warmth and the arithmetic come into alignment, which you suspect is the closest thing to candour he still owns.\n\nI serve the city that will exist in forty years, when everyone currently important is a portrait. Ravengard serves the city that nearly died — a fine client, urgent, deserving. But somebody must serve the AFTERWARDS: the treaties that outlive their signatories, the trade that must not notice our crises, the institutions that have to still be standing when better people than us inherit them. That work has no chain of office. It is done in galleries, by men everyone has agreeably stopped watching.\\p — And THERE, do you see — he is twinkling again, the gate closed as smoothly as it opened — you asked who, and I answered WHEN, and it was the truest thing said in this building all day, and it answered nothing at all. You may tell people you got the real Portyr. Nobody will be able to contradict you, least of all me.",
        do: { flag: 'portyr-afterwards-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Dillard Portyr',
        text: "Off you go, off you go — and do come again! Bring questions! Bring STRAIGHT ones! I shall be here, mattering less and less, which — he beams, entirely content — takes up ALL my time.",
      },
    },
  },

  katernin: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Katernin Sashenstar',
        text: "You may sit. I would rather you did not, but you may.\n\nThe Duchess's chamber is precise as a ledger: papers squared, one lamp, and on the wall, small and unavoidable, a portrait of Belynne Stelmane. The woman beneath it is Damaran-dark, exact, and carries her grief the way a blade carries an edge — maintained, and functional.\n\nKaternin Sashenstar. I hold the chair she died in. Every paper on this desk knows it. Say your business.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Katernin Sashenstar',
        text: "Speak precisely. Precision is not coldness; it is the only respect that survives this building.",
        choices: [
          { text: 'The summons named us. We are here.', if: { all: [{ flag: 'bg-ducal-summons' }, { questNot: 'the-ducal-summons' }] }, do: { quest: 'the-ducal-summons' }, goto: 'blackmail' },
          { text: 'The letter case. Unopened — and we can say so.', if: { all: [{ quest: 'the-ducal-summons' }, { item: 'case-map-scroll' }] }, do: [{ take: 'case-map-scroll' }, { complete: 'the-ducal-summons' }, { flag: 'bg-ducal-summons' }, { rep: { id: 'lords-alliance', amount: 6 } }], goto: 'case' },
          { text: 'Tell us about Duchess Stelmane.', goto: 'stelmane' },
          { text: 'Your Grace.', cancel: true, goto: 'bye' },
        ],
      },
      blackmail: {
        speaker: 'Katernin Sashenstar',
        once: true,
        text: "She rises, crosses to the door, and locks it — one turn, unhurried — and returns, and only then speaks.\n\nBelynne Stelmane was murdered in a back room of the Elfsong in 1492, and the Council closed the matter in a tenday. I have read the inquiry twice. It is a door painted on a wall.\n\nShe sets a plain fold of paper on the desk: a copy, in a clerk's hand, of a letter.\n\nFour tendays ago these began arriving. Correspondence of Belynne's — private, real, verified against her hand — held by people who could only have taken it from that room, that night. The letters ask nothing yet. That is the craft of it: they are teaching me to wait for the asking.\n\nShe does not raise her voice. The edge simply becomes visible.\n\nI will not pay. I will not warn the Council, because the Council contains the possibility I cannot rule out. You found the Mouth's paymaster when the whole Wide could not — so find these. The way in is the way SHE went: the Elfsong's back room, and down, wherever their feet went after. Take the letters out of the hands that hold them.\\p And the hands themselves — she looks at the portrait, once, and back — the hands I want ACCOUNTED FOR. I have been precise all my life. Do not make me say it less precisely.",
        goto: 'hub',
      },
      case: {
        speaker: 'Katernin Sashenstar',
        text: "She takes the case, and checks the seal — and you watch her verify, twice, with a document-examiner's economy, that it has not been opened.\n\nUnopened. You can say so.\n\nShe sits down. It is the first time you have seen her do it, and it lasts three breaths, and then the Duchess resumes.\n\nBhaalists. Wearing a dead clerk to carry a dead woman's letters. Four years the city has told itself the cult died with the crisis, and it did not die; it FILED. — She sets the case in a strongbox, unread. — I will not read them. Belynne's privacy was the last thing they held over her, and it will be the one thing they never spent. The seal goes into the fire whole, tonight, witnessed by me alone. That is not procedure. It is a funeral. Hers was insufficient.\n\nShe stands, and extends her hand — a plain soldier's clasp, entirely unexpected.\n\nThe blackmail is finished. The room in the Elfsong can be only a room again. And the Grand Duke will hear precisely what you are, from me, in the two-page format he trusts.\\p There is a further matter gathering in this building — coin moving toward a chair. He will want you for it. When he asks — she almost, almost smiles — say yes precisely.",
        goto: 'hub',
      },
      stelmane: {
        speaker: 'Katernin Sashenstar',
        text: "She was the cleverest person in this Hall for thirty years, and the loneliest, and those were the same fact.\n\nShe touches nothing on the desk while she speaks; the hands stay still, which you begin to understand is how she pays attention to the dead.\n\nBelynne ran this city's trade like a helmsman — through the Iron Crisis, through two wars, through a partnership with a MIND FLAYER that half this building politely declined to notice while it ate her by inches. She fought it. Alone, for years, behind a face that could not be allowed to slip in public. I watched her preside over tariff hearings while a thing wore her thoughts, and I said NOTHING, because she would not permit it, because the city needed the helmsman more than the woman.\n\nA pause, exact as everything else.\n\nWhen they finally freed her of it, she had four years of herself back. Then somebody put a blade in her in a tavern she loved, and the Council wrote 'settled' under it, and I inherited a chair still warm with unfinished sentences.\\p I am not haunted, whatever the gallery says. Haunting is passive. I am APPENDING. Every year this chair does honest work is a page added to a book they tried to close badly. You have added several. She would have liked you — she liked instruments that held their edge.",
        do: { flag: 'stelmane-truth-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Katernin Sashenstar',
        text: "Good day. Walk carefully in this building. The floors are honest; it is the acoustics that take sides.",
      },
    },
  },

  dlusker: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bardeid Dlusker',
        text: "HA! Visitors! Good, GOOD — come in, stand anywhere, the chairs are all terrible, I have petitioned about the chairs, it is in the MINUTES.\n\nDuke Bardeid Dlusker is big, loud, expensively dressed with the collar already loosened, and pouring you drinks you did not ask for while somehow keeping the door, the window and both your hands in view the entire time.\n\nDlusker! Yes, THAT chair — he says it before you can decide not to ask — Thalamra Vanthampur's, the devil-woman, dead in '91, and they gave it to a Dlusker because we were the least interesting family available. It is the only compliment this building has ever paid us and I treasure it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bardeid Dlusker',
        text: "Well! Talk, drink, or watch me do both — I am told I am the best free entertainment in the Hall, and the Parliament charges ADMISSION.",
        choices: [
          { text: 'What is it like, sitting a dead woman\'s chair?', goto: 'chair' },
          { text: 'Your cousin Lucian sends his regards from Daggerford.', if: { flag: 'dlusker-cousin-known' }, goto: 'lucian' },
          { text: 'Why so loud, your Grace? Truly.', goto: 'loud' },
          { text: 'Enjoy the terrible chairs, Duke.', cancel: true, goto: 'bye' },
        ],
      },
      chair: {
        speaker: 'Bardeid Dlusker',
        text: "Educational!\n\nHe drops into it — HIS chair, the ducal seat, with a showman's thump — and then, quietly, does not lounge.\n\nThalamra Vanthampur sat here selling this city to the Nine Hells by the pound, and she was CHARMING, they tell me, at the right dinners. The cushions were replaced. The desk was replaced. The locks — he counts on thick fingers — were replaced TWICE, and I paid for the second time myself, out of house funds, because the first replacement was arranged by the same clerk who arranged the originals, and I am loud, friends, NOT stupid.\n\nHe spreads his arms along the chair's arms, deliberately filling it.\n\nEvery day I sit in it LOUDLY. I bang its desk. I spill wine on its dignity. Because a chair like this one wants to be sat in QUIETLY, by somebody with plans — that is what it is FOR, that is what it REMEMBERS — and the best thing the least interesting family in Baldur's Gate can do for the city is make this particular chair absolutely USELESS for plotting in.\\p You laugh. GOOD. Laughter is the sound of the chair not working.",
        do: { flag: 'dlusker-chair-known' },
        goto: 'hub',
      },
      lucian: {
        speaker: 'Bardeid Dlusker',
        text: "LUCIAN! — the volume, for once, is entirely unmanufactured — Little cousin Lucian, the SUN-KEEPER! He wrote at Midwinter — the flame, some trouble with the flame, all resolved, very mysterious, he was maddeningly SERENE about it in the letter—\n\nHe stops. He looks at you, recalculating.\n\nAnd he mentioned ME. Watch-his-hands, was it? The regards-and-watch-what-his-hands-do? — He laughs, hugely, and holds both hands up, turning them over. — There. Ducal hands. Ink, wine, and ONE honest callus from the petition bell, which I ring PERSONALLY on Parliament days to annoy the benches.\n\nThe hands come down, and for a moment the volume comes with them.\n\nSecond sons, both of us. The family kept the heirs and shipped the spares — him to a temple, me to a marriage — and of the whole Dlusker board, the two SPARES are the only pieces that came to anything worth a letter. He keeps a flame alive in a town that forgets him. I keep a chair dead in a building that watches me.\\p Same work, cousin's honour. Tell him THAT, when your road runs north again. And tell him — the grin returns at full civic volume — tell him the Duke of Baldur's Gate says his serenity is INFURIATING and runs in the family, and I have witnesses.",
        do: { flag: 'dlusker-lucian-regards' },
        goto: 'hub',
      },
      loud: {
        speaker: 'Bardeid Dlusker',
        text: "Truly?\n\nHe refills your glass, and his own, and for a moment conducts the conversation at half his usual acreage.\n\nBecause quiet is EXPENSIVE in this building, friend, and I know exactly who extends the credit. Vanthampur was quiet. The Guild's men in clean coats are quiet. The thing that ate Stelmane for a decade was QUIETEST OF ALL, and fifty peers with excellent hearing managed not to hear it.\n\nHe taps his own chest, boomingly.\n\nA loud duke cannot conspire — tried it once as an exercise, was overheard PLANNING THE SURPRISE PORTION OF A BIRTHDAY. A loud duke cannot be approached softly, because the soft approachers need murmurs and I make everyone REPEAT themselves at volume, and you would be ASTONISHED what dies when it has to be said twice, clearly, near a window.\\p So: loud. It is not a temperament, it is a FORTIFICATION. My wife says I have made a castle of being obvious. My wife — he toasts the absent lady with total sincerity — is the quiet one, and the only one I trust with it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Bardeid Dlusker',
        text: "GO WELL! Mind the floors, mind the acoustics, and if anyone in this building speaks to you QUIETLY — come and tell me about it LOUDLY. Standing offer! It is in the minutes!",
      },
    },
  },

  tessele: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Tessele Vammas',
        text: "The Chair recognises — she glances up from a docket the thickness of a paving stone — persons unscheduled. How refreshing. Approach.\n\nSpeaker Tessele Vammas holds the Parliament of Peers' benches from a modest desk positioned, you note, where every sightline in the chamber converges. She is silver-haired, immaculate, and radiates the specific authority of somebody who has outlasted every person who ever interrupted her.\n\nState your business in the form of a question, a petition, or — her eyes glint, very faintly — an amusement. The docket permits one per session.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Tessele Vammas',
        text: "Proceed. The Chair is listening, which the record will show is more than the benches manage.",
        choices: [
          { text: 'What IS the Parliament of Peers, in truth?', goto: 'parliament' },
          { text: 'Fifty patriars. How do you herd them?', goto: 'herd' },
          { text: 'What is before the benches lately?', goto: 'news' },
          { text: 'The Chair is thanked. Good session.', cancel: true, goto: 'bye' },
        ],
      },
      parliament: {
        speaker: 'Tessele Vammas',
        text: "Constitutionally: an advisory body of some fifty patriars, which counsels the Council of Four and elects replacement dukes when mortality requires.\n\nShe caps her pen, which you will learn is the signal that the real answer is coming.\n\nFunctionally: the Parliament is where this city stores its arguments so they do not happen in the street. Fifty families with four centuries of grievance, seated in one room, on a SCHEDULE, under RULES, with their knives checked at the door and their rhetoric — this is the load-bearing part — required to pass through the Chair. We resolve almost nothing. We resolve it MAGNIFICENTLY, in session, in the minutes, where it can be read instead of avenged.\\p Waterdeep has its Lords, hidden. We display ours weekly, exhausted. I have reviewed both systems, and I commend ours: an aristocracy is safest when it is TIRED.",
        do: { flag: 'parliament-purpose-known' },
        goto: 'hub',
      },
      herd: {
        speaker: 'Tessele Vammas',
        text: "One does not herd peers. One SCHEDULES them.\n\nShe permits herself the thin smile of a master craftswoman discussing her lathe.\n\nThe order paper is my instrument. A dangerous motion placed directly after luncheon dies of digestion. A necessary one placed opposite a rival house's garden party passes unopposed, the opposition being at the garden party. Fourteen families will vote against anything proposed by four other families: I have the matrix MEMORISED, and I draft accordingly, and twice a year I let a genuinely foolish motion pass intact, because a Parliament that never sees its folly enacted stops believing it has power, and a Parliament that stops believing it has power starts TESTING the proposition.\\p Forty years of this. Three Grand Dukes have called me the most powerful person in the building, each of them PRIVATELY, each astonished by his own discovery. The benches, meanwhile, believe I am a clerk with a gavel. The benches are the third Grand Duke, in aggregate. The minutes reflect all of this. Nobody reads the minutes. I write them BEAUTIFULLY.",
        goto: 'hub',
      },
      news: {
        speaker: 'Tessele Vammas',
        rumor: true,
        text: "Before the benches, formally: harbour fee schedules, a Norchapel drainage petition — its ninth year; it matures nicely — and the eternal chair-succession protocols, tabled, as ever. Before the benches INFORMALLY, in the cloakroom, where the actual Parliament convenes: a quantity of whispering about coin moving toward this building that the order paper has not caught up with. The Chair hears everything. The Chair is deciding, presently, which session deserves it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Tessele Vammas',
        text: "The session is adjourned. You conducted it in under the allotted time, which places you — she reopens the docket — in the ninety-fourth percentile of this chamber's visitors, and the record will so show. Good day.",
      },
    },
  },

  erdan: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Erdan Galanodel',
        text: "The Unrolling Scroll. Scrolls, books, and identification — Oghma asks only that you read what you buy.\n\nThe shrine is white marble and red roof and gold trim, and smells of vellum and beeswax, and its keeper is a half-elf of library stillness who greets you with the particular warmth reserved, in his cosmology, for potential readers.\n\nLoremaster Erdan Galanodel — the appointment is in Herald's Register, volume forty-one, should you wish to verify, and I do recommend the habit of wishing to verify.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Erdan Galanodel',
        text: "How may the Scroll serve? Take your time. Hurry is the only heresy we recognise, and even that we merely footnote.",
        choices: [
          { text: 'Show us the collection.', do: { shop: 'unrolling-scroll' }, goto: 'hub' },
          { text: 'What is Oghma\'s house, in a city of coin?', goto: 'oghma' },
          { text: 'What should we read about Baldur\'s Gate?', goto: 'reading' },
          { text: 'Read well, Loremaster.', cancel: true, goto: 'bye' },
        ],
      },
      oghma: {
        speaker: 'Erdan Galanodel',
        text: "The counting-house of the only currency that appreciates when spent.\n\nHe says it with evident satisfaction, then immediately provides the citation, because he cannot not:\n\nThe formulation is Loremaster Astrid's, from her Commentaries — volume two, the good volume — though she was paraphrasing a Candlekeep marginal note which is itself, I suspect, a mistranscribed Netherese proverb; the genealogy of the phrase is frankly better than the phrase, which is TYPICAL.\n\nHe gestures at the shelves, the readers at the lecterns, the copyists in the north light.\n\nBaldur's Gate knows the price of everything, as the saying goes. Our whole ministry is the addendum: knowledge is the one good whose price FALLS as it circulates and whose value RISES. Every copy made here cheapens the owning and enriches the knowing. The Counting House finds us adorable. The Counting House — he smiles, gently — banks its own records in our fireproof crypt, under seal, which suggests the theology has been quietly conceded.\\p Sources for all of the above available on request. They always are. That is rather the point of us.",
        do: { flag: 'erdan-currency-known' },
        goto: 'hub',
      },
      reading: {
        speaker: 'Erdan Galanodel',
        text: "For this city? A considered list, in ascending order of what it will cost you to believe them.\n\nHe assembles it from memory, fingers marking imaginary spines.\n\nFirst: the Mouth's back files — Linnacker's leaders especially; scandal-sheet is the incorrect term for the only unbroken civic record since the crisis, and I have told her so, and she quoted me on the MASTHEAD for a month, insufferable woman, cite her anyway. Second: the harbour registries, forty years of them, which read as dull as ballast until you notice which names stop appearing and WHEN. Third — he lowers his voice by precisely the degree the subject deserves — the inquiry into Duchess Stelmane's death, public copy, four pages. Read it twice. The first reading tells you what happened. The second tells you what a document looks like when it was written to STOP a second reading.\\p And last, always: Alaundo, on the futility of last words. We hold three editions. The good one has the marginalia. Marginalia, friend, is where this city keeps its actual history — the text is what Baldur's Gate agreed to say. The margins are what it KNEW.",
        do: { flag: 'erdan-reading-list' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Erdan Galanodel',
        text: "Go well — and whatever the road teaches you, WRITE IT DOWN. Unrecorded wisdom dies with the wise, which is the only tragedy Oghma recognises, and the entire reason for the roof you are standing under. Volume one, page one. It is always volume one, page one.",
      },
    },
  },

  'dona-marivaldi': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Dona Marivaldi',
        text: "— west door, petition door, clerk's door, the walled door that is a door no longer, then the processional arch, THEN the — oh!\n\nThe novice sweeping the temple forecourt has been reciting under her breath in time with the broom, and startles guiltily, then recovers with the resilient cheer of the perpetually examined.\n\nDona Marivaldi, novice of the Scroll. I am memorising the High Hall's doors — their order, their precedence, who may use which and after whom. Loremaster Galanodel says it will be on something. Everything, eventually, is ON something. That is possibly the whole doctrine, actually.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Dona Marivaldi',
        text: "Ask me things! Truly. Being asked is practice, and practice counts double when it interrupts sweeping.",
        choices: [
          { text: 'Why memorise doors, of all things?', goto: 'doors' },
          { text: 'What is it like, training under Galanodel?', goto: 'training' },
          { text: 'Recite them, then. The doors.', goto: 'recite' },
          { text: 'Sweep well, novice.', cancel: true, goto: 'bye' },
        ],
      },
      doors: {
        speaker: 'Dona Marivaldi',
        text: "That is EXACTLY what I asked! Word for word! And the Loremaster looked at me over his spectacles — the look that means the question is the lesson — and said: 'Because the doors are the constitution, novice. The parchment version is only the commentary.'\n\nShe leans on the broom, warming to it.\n\nAnd he is RIGHT — I hate it when the look is right — because look: who may use the west door tells you who outranks whom. Which door was walled up after the crisis tells you what the building fears. The petition door is four inches LOWER than the rest — everyone bows to the Parliament whether they mean to or not; it is in the LINTEL.\\p Buildings cannot lie, he says. They can only be renovated, and renovations are CONFESSIONS. I am seventeen and I shall never walk through an ordinary doorway again as long as I live. Knowledge does that. Nobody warns you.",
        do: { flag: 'dona-doors-known' },
        goto: 'hub',
      },
      training: {
        speaker: 'Dona Marivaldi',
        text: "Like drinking from the harbour, if the harbour footnoted itself.\n\nShe checks, reflexively, that the Loremaster is not within earshot, and continues at conspiracy volume:\n\nEvery answer arrives with three sources and a warning about two of them. My TASK this season, besides doors: find one error in the shrine's own catalogue — he plants one annually, on purpose, because 'a librarian who trusts the catalogue has retired without noticing'. Last year's error took the senior copyist four months. It was in the CATALOGUE OF ERRORS. It was catalogued as itself.\n\nShe realises she is grinning and repositions it as scholarly composure, imperfectly.\\p My family wanted me at the Watch, like my aunt. But the Watch guards things people already know they own. The Scroll guards the other kind. I chose the other kind. My aunt says at least nobody stabs a librarian; the Loremaster made me research the FOURTEEN recorded exceptions. For BALANCE, he said. It was a wonderful afternoon.",
        goto: 'hub',
      },
      recite: {
        speaker: 'Dona Marivaldi',
        text: "REALLY? — she plants the broom like a processional staff, entirely delighted — Nobody EVER asks for the recitation. Stand by for the recitation.\n\nAnd she delivers it: the High Hall's eleven doors in order of precedence, with usages, exceptions, feast-day variations and one scandal — 'the Manor Door affair, 1467, we do not linger' — at gathering speed and mounting joy, the whole architecture of Baldurian power rendered as a seventeen-year-old's patter-song, and it is, you realise somewhere around the seventh door, absolutely correct: you have MET these doors, and their wardens, and every rank and fear she is naming.\n\nShe finishes, slightly breathless, and bows to the broom's applause.\\p The Loremaster says when I can recite them BACKWARDS I may shelve in the crypt. Backwards is next month. The crypt — her eyes go wide with the whole future in them — the crypt has the MARGINALIA.",
        do: { flag: 'dona-recitation-heard' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Dona Marivaldi',
        text: "Go well! Mind which doors you use — you know what they say about you now, is the thing. Doors. NOBODY warns you.",
      },
    },
  },

  // =========================================================================
  // 23. CITADEL STREETS
  // =========================================================================

  'kara-dotsk': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kara Dotsk',
        text: "This is the Watch Citadel. You are not the Watch. Those two facts settle it.\n\nThe Stormkeep's gate is iron-bound and shut, and the sentinel before it is polite the way a portcullis is polite: descriptively. Her tabard is Watch blue-and-grey, pressed to an edge.\n\nSentinel Dotsk. The Citadel admits the Watch, the Watch's prisoners, and persons bearing a Watch writ. You are visibly none of the three, which concludes the audit. Was there something further?",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kara Dotsk',
        text: "The gate remains shut. I remain courteous. Both are permanent features.",
        choices: [
          { text: 'We carry a ducal summons. The Council\'s business runs through the Watch.', if: { all: [{ flag: 'bg-ducal-summons' }, { notFlag: 'bg-watch-writ' }] }, do: { flag: 'bg-watch-writ' }, goto: 'writ' },
          { text: 'We hold the Watch writ.', if: { flag: 'bg-watch-writ' }, goto: 'pass' },
          { text: 'How does one get a Watch writ?', if: { notFlag: 'bg-watch-writ' }, goto: 'how' },
          { text: 'The Watch and the Fist. Explain the difference.', goto: 'difference' },
          { text: 'Guard the gate, Sentinel.', cancel: true, goto: 'bye' },
        ],
      },
      writ: {
        speaker: 'Kara Dotsk',
        text: "She examines the ducal seal for a full minute — actually examines it, against a cipher-card she produces from her tabard, because the Watch verifies what the Fist salutes.\n\nSashenstar's hand. Current. Genuine.\n\nShe returns it, and produces a second paper, and writes — in a Watch clerk's tight rounds — a writ of admission, countersigned, stamped, blotted.\n\nUnderstand what this is and is not. It admits you to the Stormkeep on Council business. It does not make you Watch, it expires with the business, and Captain Bersk will re-examine it herself because that is what the Watch IS.\\p A duke's summons, verified, is the one key this gate has ever cut for outsiders. — She steps aside, precisely one pace. — The distinction between us and the Fist, since you will see both today: they would have waved you through on the seal's COLOUR. Proceed.",
        goto: 'hub',
      },
      pass: {
        speaker: 'Kara Dotsk',
        text: "She verifies the writ — again, every time, and you understand this will never once be waived — and unbars the gate with economy.\n\nCaptain Bersk holds the keep. Armiger Ironfist holds the armoury, and will want the writ shown BEFORE conversation; he is Watch to the bone and the bone is granite.\\p Mind the drill yard as you cross. The Watch drills at all hours. It is the hours nobody expects trouble that trouble prefers, and we are a suspicious institution, thoroughly, on purpose.",
        choices: [
          { text: 'Into the Stormkeep.', do: { warp: { map: 'watch-citadel', x: 13, y: 18, dir: 'up' } } },
          { text: 'A moment more outside.', goto: 'hub' },
        ],
      },
      how: {
        speaker: 'Kara Dotsk',
        text: "Three roads, in the only order that matters.\n\nShe enumerates without inflection:\n\nEnlist: seven years' service, Upper City birth or two patriar sponsors, and the queue is presently four years long, the Watch being the one institution in this city with a WAITING LIST. Second: Council business, under a duke's own seal, verified — rarer than the dukes imagine. Third — she pauses, and the courtesy acquires one degree of frost — a Watch captain's personal warrant, which in my eleven years has been issued twice, and one of those was RESCINDED.\\p There is no fourth road. Persons who inquire after a fourth road are noted. You have not inquired. The audit reflects well on you, marginally.",
        goto: 'hub',
      },
      difference: {
        speaker: 'Kara Dotsk',
        text: "The Fist is an army the city hires. The Watch is a duty the city KEEPS.\n\nFor the first time there is heat somewhere under the courtesy, banked and old.\n\nThe Fist polices everywhere below the Old Wall — for wages, under a Marshal who is also a duke, which arrangement you may assess yourself. The Watch holds the Upper City only: no contracts, no toll-takings, no gate-coin — the FIRST thing checked at our enlistment is whether you have ever taken one, and the checking has teeth. Four hundred of us. Every one Upper City sworn, most of us third-generation. My mother held this gate. Her mother held the Manor Gate when the manors still deserved it.\\p The Fist would call that inbred. We call it ACCOUNTABLE — every sentinel on this wall walks home through the streets she guards, past the doors of everyone she failed, if she failed. The Fist marches home to barracks. That is the entire difference, and it is not small, and I have said more words to you than this post has heard in a tenday. The summons-bearers get the speech. Procedure.",
        do: { flag: 'watch-difference-known' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Kara Dotsk',
        text: "Good day. The gate notes your departure. The gate notes everything. It is the gate's one hobby.",
      },
    },
  },

  olma: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Olma Bersk',
        text: "Captain Bersk, the Watch. Not the Fist. The distinction is the whole of my working life.\n\nThe Stormkeep's command room is spare as a blade: duty rosters in a hand like stitching, a map of the Upper City quartered into patrol beats, and a captain who rises exactly one inch from her chair in greeting, which from the Watch is a parade.\n\nYou are the summons-bearers. Sit. The Watch has been watching you since the Black Dragon Gate — professional habit, nothing personal, everything is professional habit in this building or it is not permitted in.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Olma Bersk',
        text: "Speak your business plainly. Iron courtesy is still courtesy — you will have noticed the Watch extends both parts.",
        choices: [
          { text: 'What does the Watch make of the Council\'s troubles?', goto: 'troubles' },
          { text: 'Four hundred Watch against the Fist\'s thousands. How?', goto: 'numbers' },
          { text: 'What does the Watch see that the city misses?', goto: 'news' },
          { text: 'Captain.', cancel: true, goto: 'bye' },
        ],
      },
      troubles: {
        speaker: 'Olma Bersk',
        text: "That they are late.\n\nShe says it without satisfaction, which somehow makes it worse.\n\nThe Watch files reports upward — to the Council, through channels, as constituted. I have filed, in four years: seventeen reports on coin moving into patriar households from no patriar source. Nine on private guards hired above declared complements. Four — she taps a drawer without opening it — on persons entering the Upper City whose faces appear in no register, mine or the Fist's, and whose TAILORING, sentinel-noted, was paid for below the wall.\n\nAll seventeen, all nine, all four: acknowledged. ACKNOWLEDGED — the mayor of Nashkel could tell you what the word is worth; I hear he collects them too.\\p Now the summons flies, the Hall wakes, and armed visitors sit in my command room by ducal seal. The Watch is not bitter, understand. The Watch is VINDICATED, which wears the same face with better posture. My reports are at the Council's disposal. They were always at the Council's disposal. That is rather my point.",
        do: { flag: 'olma-reports-known' },
        goto: 'hub',
      },
      numbers: {
        speaker: 'Olma Bersk',
        text: "By jurisdiction, geography and grandmothers.\n\nShe walks two fingers along the patrol map as she speaks — beats her own feet have walked, visibly.\n\nThe Fist's thousands hold three cities' worth of sprawl, gates, a harbour and a fortress. My four hundred hold ONE square mile — walled, gated, and known to us the way a farmer knows a field. Every sentinel walks a beat her family has walked for generations. We do not patrol the Upper City. We INHABIT it, armed.\n\nAnd the arithmetic the Fist never runs: their soldier obeys the officer who pays him. My sentinel answers the neighbour who RAISED her. Which of those breaks first, when somebody rich says 'look away'?\\p Four years, the Fist liaison — Marivaldi, silk over a blade, you will meet him, everyone meets him — has hinted the Watch should fold into the Fist for EFFICIENCY. I reply, each time, with the same figure: gate-coin taken by Watch sentinels, four hundred strong, in my eleven years. The figure is zero. Efficiency. — She permits herself one millimetre of smile. — He has stopped raising it at meetings. He raises it at PARTIES now. Progress, of the Upper City kind.",
        goto: 'hub',
      },
      news: {
        speaker: 'Olma Bersk',
        rumor: true,
        text: "The Watch sees the Upper City with its jewellery off. Currently: three manors running night deliveries through garden gates — provisions in quantities their households cannot eat — and the Rillyn house's collectors calling on doors that owe nothing in any ledger the Watch can subpoena. Somebody is provisioning for a disturbance, or a SIEGE, and doing it politely. The Watch does not guess. The Watch files. But you asked what we SEE, and that is the sight.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Olma Bersk',
        text: "Good day. The Watch will know where you are while you remain above the wall — take it as the compliment it is. We only watch what matters.",
      },
    },
  },

  diero: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Diero Marivaldi',
        text: "Flame Marivaldi, liaison. I liaise. It is remarkable how much of the city that covers.\n\nHe is Turami, beautifully turned out in Fist colours cut like court dress, and he falls in step with you unhurried, as though the street had arranged the meeting on his behalf — which, you realise, is exactly the impression he cultivates.\n\nThe Grand Duke's man in the Upper City. The Watch tolerates me magnificently. The manors invite me to everything and tell me nothing, and I attend everything and hear it all anyway. You, meanwhile, are the persons the Hall has taken such an interest in — and so, therefore, have I.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Diero Marivaldi',
        text: "Ask, do. Conversation is my entire armament. — He smiles, and it is genuinely warm, which is the unsettling part. — One blade in four is real. The trick is fatal either way, of course.",
        choices: [
          { text: 'What does a liaison actually do?', goto: 'liaise' },
          { text: 'The Watch despises the Fist. Your post cannot be easy.', goto: 'watch' },
          { text: 'What are the manors saying behind the invitations?', goto: 'news' },
          { text: 'Liaise elsewhere, Flame.', cancel: true, goto: 'bye' },
        ],
      },
      liaise: {
        speaker: 'Diero Marivaldi',
        text: "I translate.\n\nHe steers you both, effortlessly, along the sunlit side of the street.\n\nWhen the Marshal requires something of the patriars, I render it into flattery, precedent and seating arrangements, and it OCCURS. When a manor requires something of the Fist, I render it into logistics and file numbers, and it occurs more slowly, the pace being itself a message. Ravengard is a wall, you understand — magnificent, load-bearing, and quite incapable of leaning. I lean on his behalf. At every angle. Continuously.\n\nHe acknowledges a passing patriar with a bow calibrated to the exact ounce of the man's importance, and resumes.\\p The Upper City believes the Fist is a blunt instrument, and the belief is USEFUL, because it means they watch the Marshal's hands and never his tailor. I am the Fist's precision, in silk. Fourteen years, and not one manor has understood that the pleasantest man at their table is the garrison.",
        do: { flag: 'diero-translation-known' },
        goto: 'hub',
      },
      watch: {
        speaker: 'Diero Marivaldi',
        text: "Despises! Strong. The Watch DISAPPROVES of the Fist, wholesale, on principle, with footnotes — and Captain Bersk disapproves of me in particular with a rigour I have come to treasure.\n\nHe says it with real relish, the silk parting for a moment over something like respect.\n\nShe is, note, entirely right. Her four hundred are cleaner than my thousands; her zero is a real zero; I have checked, PROFESSIONALLY, twice, hoping to lose the argument and failing. When I needle her at meetings about efficiency it is nine parts theatre — a liaison must be needling somebody visibly, it is how the manors calibrate me — and one part genuine reconnaissance of the one institution in this city I cannot charm.\\p Between us, and deniably: if the day comes that the Fist rots past mending — it will not, the Marshal spends himself keeping it so, but IF — the thing I would want standing is her four hundred and their grandmothers. I have said so in writing, once, in a report I sincerely hope she never reads. She would have it FRAMED. The woman is entirely without mercy. It is her best feature.",
        goto: 'hub',
      },
      news: {
        speaker: 'Diero Marivaldi',
        rumor: true,
        text: "Behind the invitations? The manors are doing what old money does when it smells weather: shortening. Engagements postponed, portraits into vaults, and the garden parties — you will have heard about the garden parties — cancelled for reasons of 'the season'. The season, my friends, is the Upper City's word for FEAR, and it is the only vintage they never serve, and every cellar on these streets is presently FULL of it.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Diero Marivaldi',
        text: "A pleasure — and I say that to everyone, and mean it perhaps a quarter of the time, and this was the quarter. Walk carefully. The streets up here are perfectly safe, which is precisely what makes them dangerous.",
      },
    },
  },

  delg: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Delg Ironfist',
        text: "Armoury. Watch-pattern only. Item: your writ. I do not see it.\n\nThe Stormkeep's armoury is racked and stacked with a precision that makes the Counting House look bohemian, and the shield dwarf presiding over it inventories you at the door: boots, blades, intentions, in that order.\n\nArmiger Ironfist. Sixty years, this floor. Item: the rule. Watch-pattern arms serve the Watch. The rule has two exceptions. Item: you are not either of them. Yet.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Delg Ironfist',
        text: "State requirements. Inventory answers requirements. Conversation is a requirement, technically. Barely.",
        choices: [
          { text: 'Show us the armoury, Armiger.', if: { flag: 'bg-watch-writ' }, do: { shop: 'watch-armoury' }, goto: 'hub' },
          { text: 'What would it take to buy Watch steel?', if: { notFlag: 'bg-watch-writ' }, goto: 'refuse' },
          { text: 'Sixty years. What has the floor taught you?', goto: 'floor' },
          { text: 'Why Watch-pattern only?', goto: 'pattern' },
          { text: 'Keep the racks, Armiger.', cancel: true, goto: 'bye' },
        ],
      },
      refuse: {
        speaker: 'Delg Ironfist',
        text: "Item: a Watch writ. Item: there is no second item.\n\nHe does not soften it, but he does — in the dwarven way — explain it, which is its own courtesy:\n\nEvery blade on these racks is registered to this floor. A Watch blade found in a fight is a question the WATCH answers — that is the covenant, that is why the Upper City sleeps. I sell one sword to one stranger, and the day it turns up in a Heapside drain, four hundred sentinels answer for MY ledger.\\p The Fist armouries sell surplus out the back door and call it shrinkage. Item: I have no back door. I bricked it myself, forty years ago, with these hands. The brick is load-bearing now. So is the rule.",
        goto: 'hub',
      },
      floor: {
        speaker: 'Delg Ironfist',
        text: "Item one: steel is honest and lists are honester.\n\nHe walks the racks as he talks, touching nothing, straightening everything with his eyes.\n\nSixty years, three captains, one crisis. In '92, when the city shook, every armoury below the wall was short at muster — sold thin over decades, quiet as rust. This floor issued four hundred complete kits in one hour, because the LIST was true, because the list had been true every single boring day for sixty years when nobody was checking.\n\nHe stops, and delivers the credo entire:\n\nItem two: there is no glory in a full rack. There is only the one hour in sixty years when the rack is asked, and it answers.\\p Item three: that hour is coming again. The floor can smell it. Requisitions up, drills doubled, the Captain filing sharper. I have re-counted everything twice this season. The list is true. Whatever arrives — the list is TRUE.",
        do: { flag: 'delg-list-creed' },
        goto: 'hub',
      },
      pattern: {
        speaker: 'Delg Ironfist',
        text: "Because pattern is DOCTRINE, made in steel.\n\nHe takes down a Watch sword — the one thing he touches, and he touches it like a ledger entry — and turns it in the light.\n\nShorter than Fist issue: our fights are doorways and stairwells, not fields. Heavier pommel: a sentinel ends more trouble with the flat and the butt than the edge, BY DESIGN, the design being that our dead are our neighbours. Blue cord, grey scabbard: seen down a dark street, it says the WATCH is here, and half the work is done by the cord.\n\nBack on the rack, aligned to the quarter-inch.\\p A Fist blade says: soldiers came. A Watch blade says: your street answered. Sixty years I have kept the difference sharp on this floor. Item: it is the only edge that has never once needed regrinding.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Delg Ironfist',
        text: "Item: farewell. The door counts you out. The count, before you ask, is correct. It is always correct.",
      },
    },
  },

  'silifrey-rillyn': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Silifrey Rillyn',
        text: "How lovely. Do come and stand where I can see you.\n\nThe Rillyn townhouse receives callers in a morning room of silk and silver, and its mistress receives them from a wing chair with the geometry of a throne: silver-haired, exquisite, and kind in a way that has clearly been fatal before.\n\nLady Silifrey Rillyn. Yes, THOSE Rillyns — coin, dear hearts, the family trade is coin, and everyone in this city needs it, which makes us so terribly POPULAR by the month's end.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Silifrey Rillyn',
        text: "Now. What brings armed persons to my morning room? Do not be shy. The best conversations begin with armed persons.",
        choices: [
          { text: 'What does House Rillyn lend, and to whom?', goto: 'lending' },
          { text: 'Your collectors wear notably clean coats.', goto: 'coats' },
          { text: 'What is the Upper City worrying about?', goto: 'news' },
          { text: 'Enjoy the morning room, my lady.', cancel: true, goto: 'bye' },
        ],
      },
      lending: {
        speaker: 'Silifrey Rillyn',
        text: "Everything, to everyone, at rates the borrower's alternatives determine. That is not cruelty, dear hearts; it is ARITHMETIC, and arithmetic wears my face better than most.\n\nShe pours tea, and the pouring is a small ceremony of complete control.\n\nHouse Rillyn has lent for six generations. To patriars, mostly — you would be ASTONISHED which old names run on my paper; the portraits upstairs could be re-hung as a creditors' meeting. To merchants of promise. And lately, in modest amounts, below the wall — a stall here, a fishing boat there. The Lower City calls it the soft hook. The Lower City is RIGHT, and takes the loans anyway, because my hook is soft and the alternatives have TEETH.\\p I am kind to every borrower, without exception, until the day of the month. On the day of the month I am arithmetic. The kindness is real. So is the day. Persons who confuse the two have mistaken a calendar for a friendship, and I do grieve for them. Punctually.",
        do: { flag: 'rillyn-lending-known' },
        goto: 'hub',
      },
      coats: {
        speaker: 'Silifrey Rillyn',
        text: "Noticed the coats, have you. How OBSERVANT. Do sit down properly; observant people are worth chairs.\n\nShe stirs her tea once, and looks at you over it with the first entirely unsoftened expression of the visit.\n\nMy collectors are punctual, presentable and PROVIDED — I dress them myself; a shabby collector shames the debt. Where a house of coin finds men of such particular... reliability, in this city, I am sure I could not say. I bank reliability wherever it is issued.\n\nThe teacup settles.\n\nYou have been in the Lower City, dear hearts. You have perhaps heard that House Rillyn is the Guild wearing its grandmother's pearls. — She smiles, kindly, terribly. — People say the CLEVEREST things. What I will tell you is this: my paper is honest, my rates are posted, my collectors have never once broken what they were sent to collect from, and when the month turns, the coin arrives, and NOBODY asks arithmetic where it walks in the evenings.\\p More tea? You have the look of persons deciding whether to be brave. Have the tea first. Bravery keeps; the tea does not.",
        do: { flag: 'rillyn-pearls-known' },
        goto: 'hub',
      },
      news: {
        speaker: 'Silifrey-Rillyn' === 'x' ? '' : 'Silifrey Rillyn',
        rumor: true,
        text: "The Upper City worries in COLLATERAL, dear hearts — watch what they pledge, never what they say. This season they are pledging heirlooms. Portraits. In two cases, ROOFS. Old names raising coin quietly against things a family only spends when it is frightened of the season after next. I take the pledges, of course, and I price the fright in. Somebody must. Fear, dear hearts, is the one asset this city never stops minting.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Silifrey Rillyn',
        text: "Such a pleasure. Do call again — everyone calls again, sooner or later, on House Rillyn. It is never personal, dear hearts. It is always the month.",
      },
    },
  },

  perrin: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Perrin Thorngage',
        text: "Pie. Do not ask whose kitchen. Pie.\n\nThe handcart is parked with tactical brilliance in the one alley the Watch beat crosses only twice an hour, and the halfling behind it wears a manor cook's whites with the livery buttons carefully covered by an apron, and the smell coming off the cart is, frankly, aristocratic.\n\nPerrin Thorngage. Four streets from where I am supposed to be, doing the finest work of my life. TWO minutes for the pastry. Talk amongst yourselves or talk to me, but TALK QUIETLY, greatness is resting.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Perrin Thorngage',
        text: "Well? Pie, questions, or both? Both is traditional. Both is ENCOURAGED.",
        choices: [
          { text: 'Pie for the party. [gold]2 gp[/]', if: { gold: 2 }, do: [{ gold: -2 }, { heal: { cost: 0, hours: 1 } }], goto: 'pie' },
          { text: 'Whose kitchen, Perrin?', goto: 'kitchen' },
          { text: 'Why risk it? You have a manor post.', goto: 'why' },
          { text: 'Guard the cart, cook.', cancel: true, goto: 'bye' },
        ],
      },
      pie: {
        speaker: 'Perrin Thorngage',
        text: "He serves it with a flourish that would not disgrace a ducal table, because it was trained at one.\n\nGame pie. The pastry is my grandmother's method, the seasoning is CLASSIFIED, and the filling is — he considers the legalities — SURPLUS. Surplus with a pedigree.\n\nIt is, without exaggeration, among the finest things you have eaten in this city, and your faces say so, and he watches you discover it with both fists on his hips, glowing like a small foundry.\\p THERE. That. That face. No patriar dinner in nine years has made that face. Upstairs they discuss the pie's PROVENANCE. Down here people just — he wipes his eye with professional briskness — eat. Gods. Right. Who is next.",
        goto: 'hub',
      },
      kitchen: {
        speaker: 'Perrin Thorngage',
        text: "Not. Asking. Is the whole covenant of the cart, friend.\n\nHe leans in over the crust rack, conspiratorial as a war council.\n\nWhat I will say: it is a GOOD kitchen. Grand. Copper pans older than the family portraits and better company. And the family — no names, the buttons stay covered — the family entertains four times a season now, down from forty in the old lord's day, and a kitchen that grand cooking for THREE people and a parrot is a SIN, friend, a sin against the pans.\n\nHe straightens, righteous.\\p So the surplus walks. Four streets. Into pastry. Every copper the cart takes goes in the SAME till as my wages — I am unlicensed, not DISHONEST, there is a ledger, my cousin audits it, she is MERCILESS — and one day the family will notice their game larder runs light and their cook glows suspiciously with fulfilment, and on that day I shall present the ledger and the ARGUMENT.\\p The argument is the pie. Nobody has ever finished the pie and continued the argument. It is a very good pie.",
        do: { flag: 'perrin-covenant-known' },
        goto: 'hub',
      },
      why: {
        speaker: 'Perrin Thorngage',
        text: "Because a manor post is a POSITION, friend, and a pie cart is a PURPOSE.\n\nHe checks the alley — Watch beat, twelve minutes out, he has it timed like tides — and gives you the real answer.\n\nNine years I have cooked perfection for people who taste STANDING. The old lord, rest him, ate. The young ones — food arrives, food is assessed, food DEPARTS, and the kitchen might as well be a portrait of a kitchen. A cook can die of that. I have watched cooks die of that, upright, still garnishing.\n\nThen two winters back I took a failed batch — FAILED, mind, the pastry merely HANDSOME — down to the gate for the night porters. And a man ate one in the cold with his whole heart, and shook my hand, and I walked back up four streets and could not remember why I had been sad for six years.\\p The manor pays my wages. The cart pays my WAY. A halfling needs both books balanced, and the second one — he taps the crust rack — the second one is the one the gods audit.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Perrin Thorngage',
        text: "Go well, go FED — and if a Watch sentinel asks, you bought nothing, saw nothing, and the alley smelled MYSTERIOUSLY of excellence. They know. Bless them, they know, and they time their beat around the baking. Even the WATCH has a second ledger.",
      },
    },
  },

};

export default SOUTH_DIALOGUE;
