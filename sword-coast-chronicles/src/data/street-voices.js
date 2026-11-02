// Conversations already in progress. Voices belong to a job/person, never a
// species; small verbal habits keep them readable in the pixel dialogue panel.
const VOICES = {
  market: [
    ["[Turns an apple in a floury cloth.] That one's for my sister. She'll say it's bruised. She says that about every apple I give her.", "Two coppers. Same as yesterday. [Slides a smaller apple onto the pile.] That one's for the walk home."],
    ["He keeps the good pears under the counter. I keep asking. We've had this arrangement for eleven years.", "[Tests a pear with one thumb.] Firm enough. My husband likes them soft, but my husband isn't carrying them."],
    ["Last basket, then I'm off. Unless someone remembers another last basket.", "[Adjusts a shoulder strap.] Mum wants onions. I wrote it on my hand. Then I washed my hands."],
    ["Only looking. Well, smelling. Those are very persuasive peaches.", "I reckon one more'll fit. [Rearranges a perilous armful.] Don't tell the basket I said that."],
  ],
  food: [
    ["Mind your sleeve, love. [Nudges the hot tray away.] My son keeps offering to take over. He's already practised telling me I'm doing it wrong.", "End crust? I save those for the old fellow on the corner. Claims he hasn't any favourites. Here he comes early again."],
    ["Aye, same loaf as always. Half for supper, half for breakfast. That's the plan, anyhow.", "[Brushes crumbs from a cuff.] Been telling myself to go home for ten minutes. Smells like there's another tray coming."],
    ["The little one asked for bread shaped like a horse. This is... a very tired horse. [Turns the loaf sideways.]", "I've left a pot on. Low flame. I think. Best finish this conversation fairly soon."],
    ["We've reached the part of supper where nobody admits who forgot the butter.", "[Makes room at the table.] Sit if you like. We've been arguing about that roof since spring. No expertise required."],
  ],
  music: [
    ["[Tunes a stubborn string.] Third verse is for the woman upstairs. She bangs on the shutters if I leave it out.", "I used to play this faster. Then they started dancing, and the cobbler asked me to slow down."],
    ["That's our wedding tune. He always gets the ending wrong. My wife says so did the wedding.", "[Taps a boot, half a beat late.] I've nearly got it. Don't look down; that makes it worse."],
    ["Quite a pleasant arrangement. My daughter would insist it needs a drum. Everything needs a drum, apparently.", "[Feels for a coin.] I promised myself one song. That was before the good part."],
    ["This bit! Here comes this bit! ...No, the next bit.", "[Hums quietly, then stops.] I only know the chorus. Fortunately, so does most of the street."],
  ],
  news: [
    ["[Folds the damp corner back.] No, the missing goat isn't mine. Mine knows the way home. Better than my brother does.", "The price of lamp oil's up again. [Looks over the page.] That's the news. The rest is people explaining whose fault it is."],
    ["One letter left. It's for my landlord, so I'm giving the news a very careful reading first.", "[Checks a seal.] My aunt sends the same cake recipe every month. Think she's trying to tell me something."],
    ["The notice says Thursday. She told me Friday. I shall turn up Saturday and disappoint everyone equally.", "[Tilts the sheet toward the light.] That's my nephew's name. Apprentice wanted, apprentice found. I'll save him this copy."],
  ],
  repair: [
    ["Aye, hold there. [Squints along the axle.] My apprentice calls that straight. My apprentice walks home.", "Nay, don't tighten that one. It's the only thing holding the others in a good mood."],
    ["If I let go, he starts the explanation again. I'm fond of him, but I've heard the explanation.", "[Shifts aching fingers.] There. Steady. We're having stew tonight if we ever finish this wheel."],
    ["I told the receiver I'd be a moment. That was one wheel ago.", "[Leans against the empty cart.] Nothing to carry until they're done. I'm trying to appreciate the distinction."],
  ],
  cargo: [
    ["Three sacks of flour. Two of beans. One marked 'miscellaneous'. That's my brother's handwriting. Could be anything.", "[Checks the knots.] We load the heavy ones first. We have this discussion every morning."],
    ["Aye, I've counted 'em. Twice. They haven't had any little sacks in between.", "Mind the left handle, mate. Splinter. Told the warehouse last week; they've probably filed it."],
    ["Short way's flooded. Long way has my cousin's doorstep. I'll take the water.", "[Rolls one shoulder.] Last run, then the washing. My shirts have begun standing up for themselves."],
  ],
  fish: [
    ["[Shoos a gull off the barrel.] That's the third time. Bird owes me rent.", "Fresh this morning. The fish, I mean. I've been up since yesterday."],
    ["Aye, this knot again. Same bit o' net, every week. I'm beginning to think it's personal.", "[Draws the mesh tight.] Wife says mend the good net. This is the good net. Don't ask about the other one."],
    ["Something small, please. Last night's supper looked at me from both ends of the plate.", "My neighbour wants the recipe. It's fish and a pan. I'm trying to make that sound more impressive."],
  ],
  garden: [
    ["[Pats soil around a stem.] He says these need more sun. He also thought that was a cabbage.", "The children water this one on their way home. Mostly the path, but they're getting there."],
    ["The yellow ones are out. My mother would have liked those. I take this way when they bloom.", "We were meant to meet for a short walk. She's brought a cushion. I know what that means."],
    ["[Offers a pinch of seed.] For the birds. The greedy one has a name, but I won't say it in company.", "Her grandson planted that. He's taller than it now. She checks every week."],
  ],
  prayer: [
    ["There's water in the shade. [Rinses a cup.] No need to earn a rest.", "We mend clothes here after the bells. I do the sleeves. Someone more patient does the small buttons."],
    ["[Warms both hands around a cup.] I said I'd stay a moment. It's been a kind sort of moment.", "They remembered how I take it. That matters more than you'd think."],
    ["My sister baked too much again. She always does, on purpose. [Sets down a covered basket.]", "Just dropping these off before work. The blue cloth's hers; I'd better bring it back."],
  ],
  watch: [
    ["[Wipes soot from a thumb.] If anyone asks, the lamp was always that crooked. I've nearly got it level.", "The lads want another game after shift. Last time we spent longer finding the dice than playing."],
    ["Three copies. One for the post, one for the gate, one for whoever loses theirs first.", "[Blows gently on fresh ink.] My tea's gone cold. At least something in this office has finished its work."],
    ["Keep that crossing clear, please. Yes, even if the cart's 'only thinking about stopping'.", "Quiet round so far. [Loosens a stiff collar.] I'd like to get home while supper's still supper."],
  ],
  errand: [["[Checks the address, then the next door.] Third bell on the left. There are four bells. Of course there are.", "Can't stop long. I promised I'd fetch the children after this. They charge interest in biscuits."]],
};

// One particular neighbour has a stutter, rather than a random speech effect
// assigned to the whole crowd. Neither the hesitation nor an accent is the joke.
const LOCAL = {
  'bg-citadel-streets:news:1': { name:'Pell, letter carrier', lines:[
    "Th-the notice by the gate? I copied it out for Mum. [Smooths a folded page.] She can't manage the small print anymore.",
    "P-please mind the ink. [Lifts a letter clear of the table.] My sister's finally written back. Three pages about her cat. I'm glad she's well.",
  ] },
  'waterdeep:music:0': { name:'Nessa, street musician', lines:VOICES.music[0] },
  'waterdeep:repair:0': { name:'Bram, repairer', lines:VOICES.repair[0] },
  'bg-the-wide:food:0': { name:'Hettie, bread seller', lines:VOICES.food[0] },
};

export function streetVoice(mapId,kind,member) {
  return LOCAL[`${mapId}:${kind}:${member}`] || {lines:VOICES[kind]?.[member]};
}
