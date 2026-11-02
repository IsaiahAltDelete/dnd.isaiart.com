// data/dialogue.js — every conversation in the game: the whole cast of Phandalin,
// the travellers on the Triboar Trail, and the voices waiting in Neverwinter,
// Waterdeep and Undermountain.
//
// PURE DATA. The only import is the southern half of this same catalogue —
// dialogue_south.js, spread in at the bottom of DIALOGUE exactly the way
// npcs.js concatenates SOUTH_CAST. Nothing here mutates. ui/dialogue.js pulls
// this catalogue in with a dynamic import and drives it.
//
// Contract (SPEC.md §3, and the implementation in ui/dialogue.js):
//   DIALOGUE[id] = { start:'nodeId', nodes:{ nodeId: Node } }
//   Node   = { text, speaker, portrait?, goto?, do?, once?, rumor?, cancelable?,
//              choices:[Choice] }
//   Choice = { text, goto, success?, failure?, if?, do?, failDo?, once?, cancel? }
//
// `if:` gates understood by ui/dialogue.js evalIf():
//   flag notFlag quest questDone questNot gold level item faction/rep repMin
//   ability classId species  ·  and the combinators not / all / any.
//   Narrative gates (flags, quests) hide a choice; resource gates (gold, level,
//   items, reputation) show it greyed with the reason, so a player can see what
//   they cannot yet afford.
//
// `do:` actions understood by ui/dialogue.js _runDo():
//   shop quest complete flag clearFlag give take gold recruit heal rest teach
//   battle warp rep xp close say goto
//
// Text markup: {name} {party} {npc} {gold} {level} tokens, [gold]…[/] colour
// runs (also red/blue/green/purple/cyan/dim/white/yellow), "\\p" for a beat,
// and a blank line for a page break. A "[Persuasion 15]" style tag anywhere in
// a choice's text becomes a live skill check rolled by the best-suited
// companion, branching to `success:` / `failure:`.
//
// Setting note: every name, place, deity and faction below is published
// Forgotten Realms canon or is built from the ethnic naming tables in
// docs/SETTING.md §5. Nothing is coined.

import { SOUTH_DIALOGUE } from './dialogue_south.js';
import { LEGEND_DIALOGUE } from './legends.js';
import { BLACKSTAFF_DIALOGUE } from './blackstaff.js';

// ---------------------------------------------------------------------------
// deepFreeze — recursive Object.freeze for the exported catalogue (HARD RULE 8).
// ---------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ===========================================================================
// THE CATALOGUE
// ===========================================================================

export const DIALOGUE = deepFreeze({

  // =========================================================================
  // 1. THE STONEHILL INN
  // =========================================================================

  // --- Toblen Stonehill: anxious, chatty, over-shares -----------------------
  toblen: {
    start: 'start',
    nodes: {
      northernTraveler: {
        speaker:'Toblen Stonehill',
        text:"A carter came in talking about a white-haired drow fixing a pack beside the northbound trail in Neverwinter Wood, just south of the stream bridge. Drizzt, he reckoned.\n\nToblen folds a towel over his arm.\n\nPip asked whether he'd fought a dragon. The carter said he'd lent him a buckle. Pip found this an unsatisfactory use of a famous adventurer.",
        goto:'hub',
      },
      start: {
        speaker: 'Toblen Stonehill',
        text: "Room and board, friend? Or just the ale?\\p Sorry — sorry, I say it at the door now, I have said it so often the words come out before I look at who is standing there.\n\nToblen Stonehill. My name is on the sign and the sign is the best thing about the place. Trilena does the cooking, I do the worrying, and between the two of us the Stonehill stands up.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Toblen Stonehill',
        text: "So. What can the house do for you?",
        choices: [
          { text: 'A room and a hot supper.', do: { shop: 'stonehill-inn' }, goto: 'hub' },
          {
            text: 'We will take the night. [gold]5 gp[/]',
            if: { gold: 5 },
            do: { heal: { cost: 5, hours: 8 } },
            goto: 'rested',
          },
          { text: 'What is the news?', goto: 'news' },
          { text: 'Any interesting travelers lately?', goto:'northernTraveler' },
          {
            text: 'You keep mentioning a brother.',
            if: { notFlag: 'seen:toblen:brother' },
            goto: 'brother',
          },
          {
            text: 'How is your brother in Triboar?',
            if: { flag: 'seen:toblen:brother' },
            goto: 'brother2',
          },
          { text: 'Something is moving in your cellar.', goto: 'cellar' },
          { text: 'Who are those hard cases by the stair?', goto: 'bench' },
          {
            text: 'The red cloaks are finished, Toblen.',
            if: { flag: 'redbrands-broken' },
            goto: 'after',
          },
          { text: 'Nothing. Good health.', cancel: true, goto: 'bye' },
        ],
      },

      rested: {
        speaker: 'Toblen Stonehill',
        text: "Second door on the left, and mind the third stair, it argues.\n\nYou sleep the way people sleep when somebody else is minding the fire. Trilena has bread and drippings on the board before the shutters are open, and Toblen has already been up two hours worrying about the price of lamp oil.",
        goto: 'hub',
      },

      news: {
        speaker: 'Toblen Stonehill',
        rumor: true,
        text: "News. Yes. Well.\\p I hear everything in here and I believe about half of it, and Trilena says I pick the wrong half.",
        goto: 'hub',
      },

      brother: {
        speaker: 'Toblen Stonehill',
        once: true,
        text: "My brother? Which — oh, you mean Ulmar. In Triboar. He kept the family house when I came west, and he was right to, and I have never once said so to his face.\n\nThe mining boom, they told us. Phandelver's Pact, they told us, and the whole of the Sword Coast walking through your taproom on the way to it. Well. The boom went and I stayed, and now I pour ale for Redbrands who do not pay.",
        choices: [
          {
            text: 'Write to him. We will carry it east.',
            do: [{ quest: 'toblens-brother' }, { flag: 'toblen-letter-taken' }],
            goto: 'brother-quest',
          },
          { text: 'Triboar is only a tenday on the Trail.', goto: 'brother-road' },
          { text: 'Back to business, Toblen.', goto: 'hub' },
        ],
      },

      'brother-quest': {
        speaker: 'Toblen Stonehill',
        text: "You would? \\pYou would. Gods. Wait — wait, do not go anywhere.\n\nHe presses a folded square of paper into your hand, still damp, and you suspect he has been carrying a version of it for two years.\n\nIt does not say anything clever. It says the inn is standing and the boy is well and I should like to see the house again. That is all it needs to say, I think.",
        goto: 'hub',
      },

      'brother-road': {
        speaker: 'Toblen Stonehill',
        text: "A tenday on the Trail, yes, and four of those days are goblin country now. I have a wife, a boy, a cellar full of ale and no sword at all.\n\nBesides. If I walk east and the Redbrands come while I am gone, what comes back to?",
        goto: 'hub',
      },

      brother2: {
        speaker: 'Toblen Stonehill',
        text: "Ulmar? Nothing yet, and no news is — well. No news is no news, whatever people say.\n\nHe polishes the same clean spot on the bar for a while.\n\nIf you are going east anyway. That is all. If you are going east anyway.",
        goto: 'hub',
      },

      cellar: {
        speaker: 'Toblen Stonehill',
        text: "The cellar is fine. The cellar is perfectly — \\pno. No, it is not. Something down there has been at the salt pork and it is not rats, or it is rats the size of a bad dog, and I have not been down those steps in a tenday and Trilena knows it.\n\nI cannot pay you much. I can pay you in beds and beer for as long as you are in Phandalin, and I will not water either.",
        choices: [
          {
            text: 'We will clear it out.',
            do: { quest: 'stonehill-cellar-rats' },
            goto: 'cellar-yes',
          },
          {
            text: 'Go down there yourself. [Persuasion 13]',
            success: 'cellar-brave',
            failure: 'cellar-coward',
          },
          { text: 'Get a cat.', goto: 'cellar-cat' },
        ],
      },

      'cellar-yes': {
        speaker: 'Toblen Stonehill',
        text: "Trapdoor behind the bar, and the lamp is on the hook, and — thank you. Truly. Do not tell Trilena I asked you before I asked her.",
        goto: 'hub',
      },

      'cellar-brave': {
        speaker: 'Toblen Stonehill',
        text: "You are right. You are right, it is my cellar.\n\nHe takes the lamp off its hook, looks at the trapdoor for a long moment, and goes down. He comes up rather fast, with the lamp out and both eyebrows gone, but he comes up grinning like a boy.\n\nRats. Big ones. Very big ones. I have seen them now, so you can go and kill them and I shall not feel a coward about it.",
        do: [{ quest: 'stonehill-cellar-rats' }, { flag: 'toblen-went-down' }],
        goto: 'hub',
      },

      'cellar-coward': {
        speaker: 'Toblen Stonehill',
        text: "I will. I will, absolutely, first thing, once the breakfast trade is through and the barrels are turned and — \\pyou are looking at me the way Trilena looks at me.",
        choices: [
          { text: 'We will clear it out, then.', do: { quest: 'stonehill-cellar-rats' }, goto: 'cellar-yes' },
          { text: 'Leave him to it.', goto: 'hub' },
        ],
      },

      'cellar-cat': {
        speaker: 'Toblen Stonehill',
        text: "We have a cat. We have the best-fed and least-employed cat between here and Neverwinter, and he is asleep on the hearthstone this instant. Ask Pip. Pip will tell you all about him. Pip will tell you all about him for an hour.",
        goto: 'hub',
      },

      bench: {
        speaker: 'Toblen Stonehill',
        text: "Sellswords. Every one of them came up the Trail on a rumour and none of them can afford to go back down it.\n\nThey drink slow and they watch the door and they are waiting for exactly the sort of person you look like. Buy a round and ask their names. Half of them will name a price before you finish the question.",
        goto: 'hub',
      },

      after: {
        speaker: 'Toblen Stonehill',
        text: "I know. I know, I saw them carried out.\\p Nobody has stood in my doorway and taken coin off my counter in nine days.\n\nHe wipes his hands on his apron, twice, because they are already dry.\n\nI have not thanked you properly and I do not think I know how. So there is no charge here. Not for you. Trilena has already told me not to argue about it, which saves us both the trouble.",
        do: { flag: 'toblen-grateful' },
        goto: 'hub',
      },

      bye: {
        speaker: 'Toblen Stonehill',
        text: "Mind the third stair. And the Trail after dark. And — well. Mind everything, really. Somebody has to.",
      },
    },
  },

  // --- Trilena Stonehill: warm, practical, worries about Pip ----------------
  trilena: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Trilena Stonehill',
        text: "Sit down before you fall down. There is stew, there is bread, and there is a bench right there that nobody is using.\n\nShe says all of it without looking up from the pot, and it is not a suggestion.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Trilena Stonehill',
        text: "Well? Speak while I work, I have forty loaves and one oven.",
        choices: [
          { text: 'What do people actually say in here?', goto: 'talk' },
          { text: 'Your boy has a lot to say for himself.', goto: 'pip' },
          { text: 'Tell me about the Redbrands.', goto: 'redbrands' },
          {
            text: 'Anything you need from the market?',
            if: { questNot: 'trilenas-market-list' },
            do: { quest: 'trilenas-market-list' },
            goto: 'list',
          },
          {
            text: 'Toblen worries.',
            goto: 'toblen',
          },
          {
            text: 'The Redbrands are finished.',
            if: { flag: 'redbrands-broken' },
            goto: 'after',
          },
          { text: 'I will let you cook.', cancel: true, goto: 'bye' },
        ],
      },

      talk: {
        speaker: 'Trilena Stonehill',
        rumor: true,
        text: "Everything that comes through that door gets said twice: once loud for the room, once quiet for the person they meant it for. I hear the quiet one.\n\nSo here is one worth the hearing.",
        goto: 'hub',
      },

      pip: {
        speaker: 'Trilena Stonehill',
        text: "He does. He is eight, and he thinks the men in the red cloaks are the most exciting thing that has ever happened in this town, and he follows them down the street at a distance he believes is clever.\n\nShe sets the spoon down. It is the first time she has stopped moving.\n\nThe Dendrar boy's father is dead in the ground for saying one true thing in the street in daylight. My son thinks that is a story. Keep him out of it, if you can do it without telling him why.",
        do: { flag: 'trilena-asked-about-pip' },
        choices: [
          { text: 'I will keep an eye on him.', do: { rep: { id: 'harpers', amount: 1 } }, goto: 'pip-yes' },
          { text: 'Boys are boys. He will learn.', goto: 'pip-no' },
          { text: 'Back to the pot.', goto: 'hub' },
        ],
      },

      'pip-yes': {
        speaker: 'Trilena Stonehill',
        text: "Then you are a better sort than most of what walks in here.\n\nShe puts a heel of new bread in your hand, still too hot to hold properly, and turns back to the oven before you can say anything about it.",
        do: { give: { id: 'trail-bread', qty: 2 } },
        goto: 'hub',
      },

      'pip-no': {
        speaker: 'Trilena Stonehill',
        text: "That is what Nars Dendrar's wife thought too, and Nilsa learned it in one afternoon and has not smiled since.\n\nHer voice does not rise at all. That is somehow worse.",
        goto: 'hub',
      },

      redbrands: {
        speaker: 'Trilena Stonehill',
        text: "They came a season ago and started drinking at the Sleeping Giant, which Grista put up with because Grista puts up with anything that pays.\n\nThen it was a coin off the top of every till. Then it was Nars in the street with a rope. Harbin Wester bolted his shutters and called it prudence, and the four guards he calls a garrison have families, so.\n\nThey answer to somebody. A wizard, they say, in the manor ruin. That is what my taproom says and my taproom is usually right.",
        goto: 'hub',
      },

      list: {
        speaker: 'Trilena Stonehill',
        text: "Since you asked, and since nobody ever does — salt, lamp wicks, and a bolt of plain cloth, and Mirna Dendrar sells all three out of her front room and has not had a customer in a tenday.\n\nBuy it from her. Pay her price and do not haggle and do not be kind about it where she can see. She has her pride and it is nearly all she has left.",
        goto: 'hub',
      },

      toblen: {
        speaker: 'Trilena Stonehill',
        text: "He does. He worries for the both of us, which frees me up to get things done.\n\nA smile goes across her face and is gone again.\n\nHe is a good man and a bad innkeeper and I would not swap either half. If he has told you about his brother in Triboar, he has told you three times. Let him tell you a fourth. It does him good.",
        goto: 'hub',
      },

      after: {
        speaker: 'Trilena Stonehill',
        text: "I heard. Pip has told the story eleven times and it grows a dragon in it around the seventh.\n\nShe looks at you properly, for once, and takes rather a long time about it.\n\nMirna Dendrar sat in my kitchen last night and ate a whole meal. First time since they hanged Nars. You did that. Take the bread, sit down, and let somebody feed you for once.",
        do: [{ give: { id: 'rations', qty: 3 } }, { rep: { id: 'lords-alliance', amount: 1 } }],
        goto: 'hub',
      },

      bye: {
        speaker: 'Trilena Stonehill',
        text: "Go on. And eat something that is not dried, you look like a fence post.",
      },
    },
  },

  // --- Pip Stonehill: excitable boy, dares you to things --------------------
  pip: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Pip Stonehill',
        text: "Are you adventurers? \\pYou ARE. I knew it. Ander said you were just caravan guards and Ander does not know anything, he is nineteen and he has never even been to Neverwinter.\n\nHow many goblins have you killed? Is that real? Can I hold it? I will hold it very carefully and I will not tell my mother.",
        choices: [
          { text: 'Let him hold it.', goto: 'hold' },
          { text: 'Absolutely not.', goto: 'nope' },
          { text: 'What do you know, Pip?', goto: 'hub' },
        ],
      },

      hold: {
        speaker: 'Pip Stonehill',
        text: "It is HEAVY.\n\nHe holds it exactly the way you showed him for about four seconds and then entirely differently, and hands it back before his mother comes round the corner, which she does, because she always does.",
        do: { flag: 'pip-friend' },
        goto: 'hub',
      },

      nope: {
        speaker: 'Pip Stonehill',
        text: "That is what my father says about everything.\n\nHe considers you for a moment and evidently decides you are still worth talking to, on probation.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Pip Stonehill',
        text: "Ask me anything. I know everything that happens in this town, because nobody stops talking when I am in the room.",
        choices: [
          { text: 'Tell me about the men in the red cloaks.', goto: 'redbrands' },
          { text: 'Have you lost that cat again?', goto: 'cat' },
          { text: 'What is this dare of yours?', goto: 'dare' },
          { text: 'Who is the boy at the farm — Carp?', goto: 'carp' },
          { text: 'Go and help your mother, Pip.', cancel: true, goto: 'bye' },
        ],
      },

      redbrands: {
        speaker: 'Pip Stonehill',
        text: "They have swords. Real ones, not the ones the guards have, and one of them let me look at his and it had a notch in it right here.\n\nHe shows you, on his own arm, with tremendous relish.\n\nMother says do not go near them so I only go near them a bit. They go into the old burnt house on the hill and they do not come out the same side they went in. I have watched. I have watched loads.",
        do: { flag: 'pip-watched-manor' },
        goto: 'hub',
      },

      cat: {
        speaker: 'Pip Stonehill',
        text: "Coppertail is NOT lost. He is exploring.\\p He is exploring somewhere I cannot find, which is different.\n\nHe does this. He did it at Highharvestide and he did it when the snow came and he always turns up, but last time he came back with his ear torn and he would not go near the cellar door.\n\nWill you find him? I will pay you. I will pay you in secrets, I have got loads.",
        choices: [
          {
            text: 'We will find your cat.',
            do: { quest: 'pips-lost-cat' },
            goto: 'cat-yes',
          },
          { text: 'Cats come back on their own.', goto: 'cat-no' },
          { text: 'Something else, Pip.', goto: 'hub' },
        ],
      },

      'cat-yes': {
        speaker: 'Pip Stonehill',
        text: "Here is one for down payment: the man at the Miner's Exchange with the grey hat is not a miner, and Mistress Thornton writes a letter every tenday and gives it to him and never to the post rider.\n\nHe delivers this in a whisper of enormous carrying power.\n\nThat is a GOOD one. That one is worth a whole cat.",
        do: { flag: 'pip-zhent-hint' },
        goto: 'hub',
      },

      'cat-no': {
        speaker: 'Pip Stonehill',
        text: "He came back with his ear torn last time.\n\nThe boy's face does something complicated and he looks at the floor and scuffs it.\n\nFine. Fine, I will find him myself, I know where the tunnels are anyway.",
        goto: 'hub',
      },

      dare: {
        speaker: 'Pip Stonehill',
        text: "Right. Right, listen.\n\nHe drops his voice to a conspirator's rasp and leans in.\n\nThe old manor on the hill. Tresendar. Everyone says it is empty and everyone is a liar, and I dare you — I DARE you — to go up to the cellar door on the east side and put your hand flat on it and count to ten.\n\nCarp Alderleaf says he has been INSIDE, but Carp Alderleaf also says he can whistle through his nose.",
        choices: [
          {
            text: 'Consider it taken.',
            do: { quest: 'pips-dare' },
            goto: 'dare-yes',
          },
          {
            text: "A dreadful idea. I love it. [Persuasion 10]",
            success: 'dare-secret',
            failure: 'dare-yes',
            do: { quest: 'pips-dare' },
          },
          { text: 'Nobody is daring anybody today.', goto: 'dare-no' },
        ],
      },

      'dare-yes': {
        speaker: 'Pip Stonehill',
        text: "Ten whole seconds. And you have to tell me EXACTLY what it sounded like.",
        goto: 'hub',
      },

      'dare-secret': {
        speaker: 'Pip Stonehill',
        text: "You are the best one that has ever come through here.\n\nHe checks over both shoulders with pantomime care.\n\nThe door is not the way in. There is a gap under the roots on the north side, where the ground fell, and Carp goes through it and I am too big now. I have got a lamp hid in the hedge for you. Do not tell my mother, she would take my knees off.",
        do: [{ flag: 'manor-tunnel-known' }, { give: 'torch' }],
        goto: 'hub',
      },

      'dare-no': {
        speaker: 'Pip Stonehill',
        text: "You are exactly like my father.\n\nThis is, it is very clear, the worst thing he can think of to say.",
        goto: 'hub',
      },

      carp: {
        speaker: 'Pip Stonehill',
        text: "Carp Alderleaf. Halfling. Lives at the farm south of town with all the turnips.\n\nHe is my second best friend and he is a terrible liar, except when he is not, and the problem is you cannot tell which. He says he found a tunnel under the manor. He says it every tenday.\n\nBut he has stopped saying it since Tenthday. That is the bit I do not like.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Pip Stonehill',
        text: "I will be right here. I am ALWAYS right here.",
      },
    },
  },

  // --- Coppertail the inn cat: wordless ------------------------------------
  'stonehill-cat': {
    start: 'n1',
    nodes: {
      n1: {
        speaker: 'Coppertail',
        text: "The ginger tom opens one eye, establishes that you are not the hearthstone and are not holding fish, and closes it again.\n\nA moment later he rolls onto his back in front of the fire with no dignity whatsoever and begins to purr like a badly made bellows.",
        choices: [
          { text: 'Scratch his ears.', goto: 'n2' },
          { text: 'Check that torn ear.', goto: 'n3' },
          { text: 'Leave him to his fire.', cancel: true },
        ],
      },
      n2: {
        speaker: 'Coppertail',
        text: "He permits it. He permits it for exactly as long as it suits him, then closes his teeth gently around your wrist to indicate that the audience is over, and goes back to sleep.\n\nSomewhere across the taproom, Pip makes a noise like a kettle.",
        do: { flag: 'petted-coppertail' },
      },
      n3: {
        speaker: 'Coppertail',
        text: "The left ear is notched, and the fur along his flank is stiff with old cellar dust and something darker.\n\nWhen you shift him towards the trapdoor behind the bar he goes rigid, all four feet, and is under the settle before you can apologise.",
        do: { flag: 'coppertail-cellar-sign' },
      },
    },
  },

  // --- Milo Brushgather, wandering minstrel --------------------------------
  milo: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Milo Brushgather',
        text: "Peace, peace — I am tuning, and a tuning halfling is a dangerous halfling.\n\nMilo Brushgather. Ninety-one songs, forty-two of them true, and I am always in the market for the ninety-second.\n\nHave you done anything worth a ballad, or are you still working up to it?",
        goto: 'hub',
      },
      hub: {
        speaker: 'Milo Brushgather',
        text: "Well? Give me a verse to work with.",
        choices: [
          { text: 'Play something.', goto: 'song' },
          { text: 'What is worth a song around here?', goto: 'gossip' },
          {
            text: 'Write about us. We will supply the verses.',
            if: { questNot: 'a-song-for-phandalin' },
            do: { quest: 'a-song-for-phandalin' },
            goto: 'commission',
          },
          {
            text: 'We broke the Redbrands. Sing that.',
            if: { flag: 'redbrands-broken' },
            do: { rep: { id: 'harpers', amount: 1 } },
            goto: 'ballad',
          },
          { text: 'Later, Master Brushgather.', cancel: true, goto: 'bye' },
        ],
      },
      song: {
        speaker: 'Milo Brushgather',
        text: "Something cheerful, then, since the room is grim enough.\n\nHe gives you three verses of [gold]The Bargewright's Daughter[/], which is filthy, and then a fourth that is not in any version you have heard, and which is about a mine under a hill and the men who never came up out of it.\n\nOld one, that. Older than the Pact. Phandalin was singing it before Phandalin was a name.",
        goto: 'hub',
      },
      gossip: {
        speaker: 'Milo Brushgather',
        rumor: true,
        text: "A minstrel's ear is his trade, friend, and I have been drinking on this bench for eleven days.",
        goto: 'hub',
      },
      commission: {
        speaker: 'Milo Brushgather',
        text: "A commission! Gods bless the working adventurer.\n\nHe is writing before you have finished agreeing.\n\nTerms: I follow at a safe distance, I embellish freely, and if you die I get to make it heroic. That last one is not negotiable, it is the whole art.",
        goto: 'hub',
      },
      ballad: {
        speaker: 'Milo Brushgather',
        text: "The red cloaks. \\pOh, that is a good one. That is a Waterdeep-in-winter, sing-it-at-the-Moonstone-Mask sort of good one.\n\nHe scribbles, mutters, scribbles again.\n\nI shall need the wizard's name for the second verse. A villain wants naming or the crowd cannot boo him properly.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Milo Brushgather',
        text: "Go and do something rhymeable. I shall be here, ruining a perfectly good lute.",
      },
    },
  },

  // --- Sildar Hallwinter: honourable Lords' Alliance veteran, recruitable ---
  sildar: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sildar Hallwinter',
        text: "Sit. Please. I will buy the first round and I will not hear otherwise — I owe you a great deal more than a round and this is what the house has.\n\nSildar Hallwinter, of Waterdeep, in the service of the Lords' Alliance. \\pThe Cragmaws had me eight days and I have not yet got my hands to stop doing that.\n\nHe puts the offending hand flat on the table.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Sildar Hallwinter',
        text: "So. Where do we stand?",
        choices: [
          { text: 'Why were you on the Triboar Trail?', goto: 'commission' },
          { text: 'What happened to Gundren?', goto: 'gundren' },
          {
            text: 'Who is Iarno Albrek?',
            if: { notFlag: 'glasstaff-defeated' },
            goto: 'iarno',
          },
          {
            text: 'Iarno Albrek was Glasstaff. He is dead.',
            if: { flag: 'glasstaff-defeated' },
            goto: 'iarno-after',
          },
          {
            text: 'What do we do about the Redbrands?',
            if: { notFlag: 'redbrands-broken' },
            do: { quest: 'redbrand-menace' },
            goto: 'redbrands',
          },
          {
            text: 'What does the Alliance want from Phandalin?',
            goto: 'alliance',
          },
          {
            text: 'Take up a sword and come with us.',
            if: { notFlag: 'sildar-joined' },
            goto: 'join',
          },
          { text: 'Rest that arm, Sildar.', cancel: true, goto: 'bye' },
        ],
      },

      commission: {
        speaker: 'Sildar Hallwinter',
        text: "Two errands, and the Alliance thought them both small.\n\nThe first was to see Gundren Rockseeker safely to Phandalin, because a dwarf who has found the Phandelver mine is worth more to this coast than a company of spears.\n\nThe second was to find out what became of Iarno Albrek. A wizard. Our man. He came here four months ago to establish order and his letters stopped.",
        do: { quest: 'sildars-commission' },
        goto: 'hub',
      },

      gundren: {
        speaker: 'Sildar Hallwinter',
        text: "They took him alive and they took his map, and they did not take either for themselves. Goblins do not plan a road ambush for one dwarf and one dwarf's papers.\n\nSomebody paid the Cragmaws. Their king sits in a castle in the Sword Mountains and answers to a name I heard twice through a wall — the [purple]Black Spider[/].\n\nI do not know what it means. I know it was said with respect, and goblins do not respect much.",
        do: { flag: 'black-spider-heard' },
        goto: 'hub',
      },

      iarno: {
        speaker: 'Sildar Hallwinter',
        text: "A wizard of decent skill and better manners. I sat on the panel that approved him and I will carry that a while.\n\nHe was to raise a town watch, put a roof back on the townmaster's hall and make Phandalin somewhere a caravan could stop. Instead the Redbrands arrived, and Iarno's letters stopped, and nobody in this town has seen his face.\n\nA man does not vanish in a settlement of four hundred souls. He changes his cloak.",
        choices: [
          {
            text: 'We will find him for you.',
            do: { quest: 'iarno-albrek-missing' },
            goto: 'iarno-quest',
          },
          { text: 'You think he turned.', goto: 'iarno-turned' },
          { text: 'Back to it.', goto: 'hub' },
        ],
      },

      'iarno-quest': {
        speaker: 'Sildar Hallwinter',
        text: "Then start where the Redbrands go to ground. Tresendar Manor, on the eastern rise — burned in the orc raids and never rebuilt, and the cellars under it were built to outlast the house.\n\nBring me anything in a Waterdhavian hand. I will know the writing. I would rather not know it.",
        goto: 'hub',
      },

      'iarno-turned': {
        speaker: 'Sildar Hallwinter',
        text: "I think a man sent alone to a lawless town with the Alliance's letter of authority in his pocket found out what that letter was worth out here.\n\nHe turns his cup a half-circle on the table and does not drink from it.\n\nAnd I think I would like to be wrong, and I have stopped expecting to be.",
        goto: 'hub',
      },

      'iarno-after': {
        speaker: 'Sildar Hallwinter',
        text: "I have read the letters twice now. The second time was worse.\n\nHe sets them down very carefully, squares the edges, and leaves his hand on top of them.\n\nHe sold this town to a drow for a title and a red cloak, and he signed the orders in a hand I recommended to the Masked Lords. I will write to Waterdeep tonight, and I will name myself in it.\n\nNow. Phandalin has no watch, no wall and no townmaster worth the seal. Let us do something about the first two.",
        do: [{ quest: 'the-alliance-road' }, { rep: { id: 'lords-alliance', amount: 2 } }],
        goto: 'hub',
      },

      redbrands: {
        speaker: 'Sildar Hallwinter',
        text: "We cut the head off, and we do it in one move, because a half-broken gang burns the town on the way out.\n\nHe clears the cups aside and draws the rise on the table in spilled ale.\n\nTresendar Manor. Eleven of them, not the six the town believes, and they go in at the burnt house and come out in the lane behind the Sleeping Giant — which means the cellars run the whole length of the rise.\n\nGo in by the lane and they are between you and the only door they know. Do that and it is over in an afternoon.",
        do: { flag: 'sildar-manor-plan' },
        goto: 'hub',
      },

      alliance: {
        speaker: 'Sildar Hallwinter',
        text: "Roads, mostly. The Alliance is Waterdeep and Neverwinter and Silverymoon and a dozen towns that need the ore to move and the wagons to arrive, and when the Trail is goblin country every one of them is poorer.\n\nThat is the unromantic answer and it is the true one. The romantic answer is that I have watched a town be frightened for four months and I am sick of it.",
        goto: 'hub',
      },

      join: {
        speaker: 'Sildar Hallwinter',
        text: "You are asking me to walk out that door with a sword again.\\p I had rather hoped somebody would.\n\nI cannot pay you and I will not take pay from you. Whatever a hired blade would cost, put it in the town instead — a watch house, a decent gate, forty feet of palisade.\n\nMy arm is yours until Phandalin can hold itself up. Then I go home to Waterdeep and drink something better than this.",
        choices: [
          {
            text: 'Then draw it. Welcome, Sildar.',
            do: [{ recruit: 'sildar-hallwinter' }, { flag: 'sildar-joined' }, { rep: { id: 'lords-alliance', amount: 3 } }],
            goto: 'joined',
          },
          { text: 'Heal first. We will come back for you.', goto: 'hub' },
        ],
      },

      joined: {
        speaker: 'Sildar Hallwinter',
        text: "Good. Then I shall want a longsword, a shield, and half an hour on the green to find out whether the eight days took anything permanent.\n\nHe stands, and the stiffness goes out of him somewhere between the bench and the door, and what walks out is not an old man at all.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Sildar Hallwinter',
        text: "Watch the Trail east of the milestone. That is where they took us, and they will use it again — it is the only good ground for it in ten miles.",
      },
    },
  },

  // =========================================================================
  // 2. BARTHEN'S PROVISIONS
  // =========================================================================

  // --- Elmar Barthen: kindly shopkeeper, misses the Rockseekers -------------
  elmar: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Elmar Barthen',
        text: "Barthen's. Rope, rations, lamp oil, and no credit past a tenday — I say that to everyone and I mean it about half the time.\n\nElmar Barthen. Thirty-one years on this corner. If you are walking east you will want more rope than you think and less iron than you want to carry.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Elmar Barthen',
        text: "What will it be?",
        choices: [
          { text: 'Show me the shelves.', do: { shop: 'barthens-provisions' }, goto: 'hub' },
          { text: 'What is the trade like these days?', goto: 'prices' },
          { text: 'You knew the Rockseekers.', goto: 'rockseekers' },
          {
            text: "There is a wagon of yours on the Trail.",
            if: { questNot: 'deliver-barthens-supplies' },
            do: { quest: 'deliver-barthens-supplies' },
            goto: 'wagon',
          },
          {
            text: 'We brought your provisions in.',
            if: { quest: 'deliver-barthens-supplies' },
            do: [{ complete: 'deliver-barthens-supplies' }, { flag: 'barthen-wagon-returned' }],
            goto: 'wagon-done',
          },
          {
            text: 'Your ledger is short, is it not?',
            if: { questNot: 'barthens-ledger' },
            do: { quest: 'barthens-ledger' },
            goto: 'ledger',
          },
          {
            text: 'What happens to the Rockseeker debt?',
            if: { flag: 'gundren-rescued' },
            do: { quest: 'the-rockseeker-debt' },
            goto: 'debt',
          },
          { text: 'That will do, Master Barthen.', cancel: true, goto: 'bye' },
        ],
      },

      prices: {
        speaker: 'Elmar Barthen',
        text: "Bad and getting worse, and not for the reason people say.\n\nRope was four coppers a coil in Marpenoth. It is eleven now, because the Lionshield wagons are being taken on the Trail and Linene will not sell me cordage below her own cost, and I do not blame her for it.\n\nA town that cannot get rope cannot get anything. That is the whole of frontier economics and it fits on a coin.",
        goto: 'hub',
      },

      rockseekers: {
        speaker: 'Elmar Barthen',
        text: "Gundren, Tharden and Nundro. Yes. They outfitted here for eleven years and paid on the day, every time, which in this trade is nearly a form of affection.\n\nHe puts down the tally stick.\n\nGundren came in a tenday past, paid up front for a full wagon — picks, rope, salt pork, forty foot of chain — and rode east ahead of it with that Waterdhavian swordsman. The wagon has not come in. Neither has he.\n\nI am not sentimental. I would simply like to know.",
        goto: 'hub',
      },

      wagon: {
        speaker: 'Elmar Barthen',
        text: "You would go? Then take this and take it seriously: the ambush ground is two days east, where the Trail cuts down to the stream and the banks come up on both sides.\n\nMy drivers say there are dead horses on the road there and nobody has moved them, which means nobody has dared walk past them.\n\nBring me the oxen if you cannot bring the wagon. Bring me neither and bring me the news, and I will still call it a fair day's work.",
        goto: 'hub',
      },

      'wagon-done': {
        speaker: 'Elmar Barthen',
        text: "Nettle. \\pYou brought me my ox back.\n\nHe goes out into the yard without another word and stands with his hand on the beast's neck for rather longer than a man counts crates.\n\nThirty-one years and I have never lost a wagon on that road. Ander, get the ledger. No — get the good ledger, the one with the lock on it.\n\nTake this with my thanks, and take the healing draught too. It is Sister Garaele's work and it is better than anything I could sell you.",
        goto: 'hub',
      },

      ledger: {
        speaker: 'Elmar Barthen',
        text: "It is short. Eight gold and some coppers across four months, and it is not Ander, whatever Thistle says, because Ander cannot count well enough to steal.\n\nSomeone comes in at closing with a red cloak and buys nothing, and afterwards the drawer is light. I have not said a word about it to anyone because I am sixty-two and I live alone above the shop.\n\nSay it for me, if you have the shoulders for it.",
        goto: 'hub',
      },

      debt: {
        speaker: 'Elmar Barthen',
        text: "Now that Gundren is walking about again — no, I am not going to dun a man who has been in a goblin cage.\n\nHe pushes the tally stick across the counter to you instead.\n\nHere. The Rockseeker account, paid and unpaid, eleven years of it. If that mine of theirs opens, this shop can carry the whole town's outfitting on credit for a season. If it does not, I am a very careful old fool with a stick.\n\nSee it opened. That is the debt I am calling in.",
        do: { rep: { id: 'lords-alliance', amount: 1 } },
        goto: 'hub',
      },

      bye: {
        speaker: 'Elmar Barthen',
        text: "More rope than you think. Every one of you laughs, and every one of you comes back for rope.",
      },
    },
  },

  // --- Ander, the clerk who desperately wants to go adventuring -------------
  'ander-clerk': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ander',
        text: "Crate you want is third from the left, unless it is the salt, in which case it is the one that says lamp oil, because I — anyway.\n\nHe straightens up so fast he cracks his head on the shelf and does not appear to notice.\n\nYou are adventurers. Actual ones. With the — yes. All right.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ander',
        text: "Was there something, or can I just look at you a bit longer?",
        choices: [
          { text: 'Where is everything in here?', goto: 'stock' },
          { text: 'You want to come with us, do you not?', goto: 'want' },
          {
            text: 'Count the storeroom properly and we will talk.',
            if: { questNot: 'anders-first-inventory' },
            do: { quest: 'anders-first-inventory' },
            goto: 'inventory',
          },
          { text: 'What do you hear from the drivers?', goto: 'drivers' },
          { text: 'Back to work, lad.', cancel: true, goto: 'bye' },
        ],
      },
      stock: {
        speaker: 'Ander',
        text: "I know where every single thing in this building is and that is not nothing, Thistle says it is nothing but she cannot lift a barrel.\n\nRope by the door, packs on the beam, oil in the cool room, and the good pitons are under the counter because a Coster driver kept helping himself.",
        goto: 'hub',
      },
      want: {
        speaker: 'Ander',
        text: "Yes.\\p Yes, obviously.\n\nHe deflates about an inch.\n\nMaster Barthen took me on when my mother died and I have never once been further east than the milestone. I can carry, I can count crates, I can go all day. That is a real thing! Caravans hire for that!\n\nBut he is sixty-two and he cannot shift the flour on his own, so.",
        do: { flag: 'ander-wants-out' },
        choices: [
          {
            text: 'Learn the storeroom first. [Persuasion 12]',
            success: 'want-good',
            failure: 'want-bad',
          },
          { text: 'Stay where you are safe, Ander.', goto: 'want-bad' },
          { text: 'Something else.', goto: 'hub' },
        ],
      },
      'want-good': {
        speaker: 'Ander',
        text: "Learn it cold. \\pThat is — nobody has ever given me a thing to actually do about it.\n\nHe is already reaching for the chalk.\n\nRight. Right. Every crate, every count, every price, and I will have it by Tenthday and I will put it in front of him and he will not be able to say I am a boy who loses things.",
        do: { quest: 'anders-first-inventory' },
        goto: 'hub',
      },
      'want-bad': {
        speaker: 'Ander',
        text: "That is what everyone says. That is exactly what everyone says.\n\nHe goes back to the crates, and stacks them rather harder than the crates deserve.",
        goto: 'hub',
      },
      inventory: {
        speaker: 'Ander',
        text: "The whole storeroom? Counted proper, with the prices, in a hand he can read?\n\nHe is grinning like a lamp.\n\nGive me till Tenthday. And — when it is done. When it is done and he sees it. Would you tell him I did it right? He listens to people with swords.",
        goto: 'hub',
      },
      drivers: {
        speaker: 'Ander',
        rumor: true,
        text: "Everything comes through this door before it goes anywhere else in Phandalin, and the drivers talk while they are being unloaded.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ander',
        text: "If you need a body to carry things — I am just saying it. Once. I have said it now.",
      },
    },
  },

  // --- Thistle, the clerk with the sense --------------------------------
  thistle: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Thistle',
        text: "Do not let Ander price anything for you. He rounds down when he is nervous and he is always nervous.\n\nShe does not look up from the map case.\n\nThistle. I keep the ledger, the charts and a private list of everyone who has ever short-counted a coin across this counter. You are not on it. Yet.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Thistle',
        text: "Ask.",
        choices: [
          { text: 'You keep the maps?', goto: 'maps' },
          {
            text: 'We are going east. Chart it for us.',
            if: { questNot: 'thistles-cartography' },
            do: { quest: 'thistles-cartography' },
            goto: 'chart',
          },
          { text: 'Who is on your list?', goto: 'list' },
          { text: 'Nothing yet.', cancel: true, goto: 'bye' },
        ],
      },
      maps: {
        speaker: 'Thistle',
        text: "Somebody has to. The Coster charts stop at the Trail, the Alliance charts stop at Leilon, and the only thing anybody has for the Sword Mountains is a woodcut copied off a woodcut.\n\nShe taps a blank hollow north-west of the Trail.\n\nThat is where the Cragmaws are, and that is what I have on it. Nothing. Thirty leagues of nothing, on the main road to Neverwinter, in the Year of the Purple Dragons.",
        goto: 'hub',
      },
      chart: {
        speaker: 'Thistle',
        text: "Then I want the stream courses. Not battles, not caves — water. Where it runs, which way, and how deep at the crossing.\n\nEverything out there is built on a stream. Find the water and you have found the goblins, the mine and every road worth walking, and I will have a chart that is worth something to somebody after we are all dead.\n\nBring me that and the map case is open to you.",
        do: { give: 'case-map-scroll' },
        goto: 'hub',
      },
      list: {
        speaker: 'Thistle',
        text: "A teamster of Linene's who counts crates in his own favour. Two of the men in red cloaks, though they do not short-count so much as decline to pay. And Harbin Wester, who has had a lantern on the town's account since Eleasis and has never once lit it in the hall.\n\nShe closes the ledger.\n\nI do not tell anyone. I simply know. It is a great deal more useful than telling.",
        do: { flag: 'thistle-list-heard' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Thistle',
        text: "More rope than you think. He is right about that, whatever else.",
      },
    },
  },

  // --- Nettle, Barthen's ox: wordless --------------------------------------
  'barthen-ox': {
    start: 'n1',
    nodes: {
      n1: {
        speaker: 'Nettle',
        text: "Two thousand pounds of patient beef considers you at length from beneath a fringe of eyelashes, decides nothing whatsoever, and goes back to the hay.\n\nThe wagon behind her has been to Neverwinter and back forty times and has the ruts of the High Road worn into its wheels.",
        choices: [
          { text: 'Scratch her poll.', goto: 'n2' },
          { text: 'Look over the wagon.', goto: 'n3' },
          { text: 'Leave her be.', cancel: true },
        ],
      },
      n2: {
        speaker: 'Nettle',
        text: "She leans into it with the full weight of her enormous head, and you take a step backwards to stay upright, and she follows.\n\nSomewhere behind you, Elmar Barthen says, without turning round: she will do that all day if you let her.",
      },
      n3: {
        speaker: 'Nettle',
        text: "Good axle, good bed, and a blue lion burned into the tailboard where a Lionshield crate has sat so often it has left its own brand.\n\nThere is a notch in the yoke shaped rather exactly like a goblin arrowhead. It has been patched, and patched again.",
        do: { flag: 'barthen-wagon-inspected' },
      },
    },
  },

  // =========================================================================
  // 3. THE LIONSHIELD COSTER
  // =========================================================================

  // --- Linene Graywind: brisk, mercantile, furious ------------------------
  linene: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Linene Graywind',
        text: "Blades and mail. Mind the stamp and mind the price, and if you want to haggle, go to the Exchange and let Halia Thornton do it to you properly.\n\nLinene Graywind, factor for the Lionshield Coster out of Yartar. Every blade on that rack came up the Trail under the blue lion.\n\nOr it did, until somebody started taking my wagons.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Linene Graywind',
        text: "Well? I have a rack to inventory.",
        choices: [
          { text: 'Show me the rack.', do: { shop: 'lionshield-coster' }, goto: 'hub' },
          {
            text: 'Tell me about the stolen goods.',
            if: { questNot: 'lionshield-stolen-goods' },
            do: { quest: 'lionshield-stolen-goods' },
            goto: 'stolen',
          },
          {
            text: 'We found your crates.',
            if: { all: [{ quest: 'lionshield-stolen-goods' }, { item: 'coster-crate' }] },
            do: [{ take: 'coster-crate' }, { complete: 'lionshield-stolen-goods' }],
            goto: 'returned',
          },
          {
            text: 'Who guards your next caravan?',
            if: { questNot: 'coster-caravan-escort' },
            do: { quest: 'coster-caravan-escort' },
            goto: 'escort',
          },
          {
            text: 'Somebody in town is selling under your brand.',
            if: { flag: 'redbrands-broken' },
            do: { quest: 'blue-lion-brand' },
            goto: 'brand',
          },
          { text: 'What is the Coster, exactly?', goto: 'coster' },
          { text: 'That is all.', cancel: true, goto: 'bye' },
        ],
      },

      stolen: {
        speaker: 'Linene Graywind',
        text: "Three wagons in a season. Three. Yartar sends me a factor's letter each time asking whether the Phandalin branch is worth the freight, and one more and the answer will be no.\n\nAnd here is the part that has me sleeping badly: they take the arms crates and leave the cloth. Goblins do not know a stamped crate of shortswords from a bolt of wool.\n\nSomebody is telling them which wagon. Find my crates. Then find out who is doing the telling.",
        goto: 'hub',
      },

      returned: {
        speaker: 'Linene Graywind',
        text: "Blue lion on the lid, seal intact, and — she prises it with a bar — the full count inside.\n\nShe stands back and looks at the crate rather than at you, and does not say anything for a moment.\n\nRight. Right. That is my letter to Yartar written, and it says the branch stands.\n\nPick something off the rack. Not the cheap end of it either — I will not be paid back in politeness.",
        goto: 'hub',
      },

      escort: {
        speaker: 'Linene Graywind',
        text: "Nobody, is who. Taman Helder drives it and Taman Helder has lost two wagons already, and I have said things to that man I shall have to apologise for eventually.\n\nEight days to Triboar and back. I pay the going rate for a Coster escort, which is generous, and I pay it on delivery, which is not.\n\nSay yes and I will have the wagon loaded by dawn.",
        goto: 'hub',
      },

      brand: {
        speaker: 'Linene Graywind',
        text: "The red cloaks are gone and the stamped goods are still turning up on somebody's table.\n\nShe puts a shortsword on the counter between you. The blue lion on the ricasso is a shade too deep and a shade too round.\n\nThat is not my stamp. That is a good copy of my stamp, and a good copy means a die, and a die means somebody paid a smith. When you find out who, I want the die. Not the smith. The die.",
        goto: 'hub',
      },

      coster: {
        speaker: 'Linene Graywind',
        text: "A merchant company out of Yartar with branches from Waterdeep to Silverymoon, and the blue lion means the goods are what the crate says they are.\n\nThat is the whole business. Not the steel — anyone can sell steel. The stamp. A caravan master four hundred miles away buys a Lionshield crate unopened because in eighty years nobody has been short-counted.\n\nWhich is why a man with a copied die is stealing something rather more expensive than swords.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Linene Graywind',
        text: "If you are going east, buy the mail. If you are going east cheaply, buy the mail anyway and eat less.",
      },
    },
  },

  // --- Dorn Tallstag, the Coster's bored spear ----------------------------
  'coster-guard-dorn': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Dorn Tallstag',
        text: "Door is that way. Rack is that way. Mistress Graywind is at the counter and she does not like being kept waiting.\n\nThe spear does not move. Neither, particularly, does he.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Dorn Tallstag',
        text: "Something else?",
        choices: [
          { text: 'Ever had to use that spear?', goto: 'spear' },
          { text: 'What do you make of the Redbrands?', goto: 'redbrands' },
          {
            text: 'Whose side is the Coster on?',
            goto: 'sides',
          },
          { text: 'Carry on, then.', cancel: true, goto: 'bye' },
        ],
      },
      spear: {
        speaker: 'Dorn Tallstag',
        text: "In here? No.\n\nA pause of some length.\n\nThat is the job. Man stands in a door with a spear and nobody tries the door. You pay me the day I am useless, and if I ever earn it you have already lost the crate.",
        goto: 'hub',
      },
      redbrands: {
        speaker: 'Dorn Tallstag',
        text: "Four of them came to the door in Eleint. I stood in it.\n\nHe adjusts his grip a fraction.\n\nThey went and drank at the Sleeping Giant instead. That is not courage on my part, that is arithmetic on theirs — a shop with a spear in the door and a shop without one, and the town is full of the second sort.",
        goto: 'hub',
      },
      sides: {
        speaker: 'Dorn Tallstag',
        text: "The Coster's. Which is not nothing — Yartar leans Alliance, the Alliance leans towards roads that work, and roads that work is what Phandalin has not got.\n\nHe glances at the counter and lowers his voice by exactly one notch.\n\nBut I take Lionshield coin, and Lionshield coin says stand here. So if you are minded to go up that hill and settle things, do it with somebody else's spear and I will hold the door open on the way out.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Dorn Tallstag',
        text: "Mind the step.",
      },
    },
  },

  // =========================================================================
  // 4. THE SHRINE OF LUCK
  // =========================================================================

  // --- Sister Garaele: earnest, devout, secretly a Harper ------------------
  garaele: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Sister Garaele',
        text: "Tymora smiles on those who move. \\pShe has no patience at all with the ones who sit still and wait to be lucky, and neither, if I am honest, have I.\n\nSister Garaele. This is the Shrine of Luck, and it is one room and a coin-bowl and rather more of the Lady's attention than either deserves. What do you need for the road?",
        goto: 'hub',
      },

      hub: {
        speaker: 'Sister Garaele',
        text: "Speak. The Lady favours the direct.",
        choices: [
          { text: 'What can the shrine spare?', do: { shop: 'shrine-of-luck' }, goto: 'hub' },
          {
            text: 'We are hurt. Can you help? [gold]25 gp[/] to the bowl.',
            if: { gold: 25 },
            do: { heal: { cost: 25, hours: 1 } },
            goto: 'healed',
          },
          { text: 'Tell me about Tymora.', goto: 'tymora' },
          {
            text: 'You went to Conyberry. Why?',
            if: { questNot: 'agathas-answer' },
            do: [{ quest: 'agathas-answer' }, { give: 'silver-comb' }, { flag: 'agatha-comb-received' }],
            goto: 'agatha',
          },
          {
            text: 'Agatha gave us her answer.',
            if: { flag: 'agatha-answered', quest: 'agathas-answer' },
            do: [{ flag: 'agatha-reported' }, { complete: 'agathas-answer' }, { rep: { id: 'harpers', amount: 3 } }],
            goto: 'agatha-done',
          },
          {
            text: 'The shrine needs offerings, does it not?',
            if: { questNot: 'shrine-offerings' },
            do: { quest: 'shrine-offerings' },
            goto: 'offerings',
          },
          {
            text: 'That pin in your sleeve is a silver harp.',
            if: { faction: 'harpers', repMin: 3 },
            goto: 'harper',
          },
          {
            text: 'The Harpers have work for us.',
            if: { all: [{ flag: 'garaele-harper-open' }, { faction: 'harpers', repMin: 8 }] },
            do: { quest: 'harper-cipher' },
            goto: 'cipher',
          },
          {
            text: 'Walk the road with us, Sister.',
            if: { flag: 'garaele-harper-open' },
            goto: 'join',
          },
          { text: 'Luck to you.', cancel: true, goto: 'bye' },
        ],
      },

      healed: {
        speaker: 'Sister Garaele',
        text: "Kneel, or do not — the Lady is not fussy about knees.\n\nThe coin goes into the bowl, and the light in the little room changes very slightly, the way a room does when a shutter is opened somewhere behind you.\n\nThere. Go carefully and then stop going carefully at exactly the right moment. That is the whole of her teaching and it takes a lifetime.",
        goto: 'hub',
      },

      tymora: {
        speaker: 'Sister Garaele',
        text: "Lady Luck. Tymora. She is not fortune the way a gambler means it — she is the coin that is only worth anything when you spend it.\n\nHer sister is Beshaba, who is misfortune, and they came out of the same broken goddess and neither will admit it. So: the same fall that breaks a leg carries a man past the ambush that would have killed him. That is the Lady's joke and she tells it constantly.\n\nLuck is spent, never saved. Write that on something.",
        goto: 'hub',
      },

      agatha: {
        speaker: 'Sister Garaele',
        text: "Because there is a banshee in a grove outside ruined Conyberry, and she was an elf of some renown before she was that, and she will answer one question truthfully to anyone who courts her properly.\n\nOne question. She will not give a second and she will not forgive a rude first.\n\nI went. I asked. I came back — she gives you a small, unamused smile — considerably paler than I went, and without an answer, because I brought her nothing she wanted.",
        choices: [
          { text: 'What does a banshee want?', goto: 'agatha-gift' },
          { text: 'What was your question?', goto: 'agatha-question' },
          { text: 'We will go to Conyberry.', goto: 'agatha-go' },
        ],
      },

      'agatha-gift': {
        speaker: 'Sister Garaele',
        text: "What she was. She was beautiful, in the way the poems mean it, and she has been cold in a grove for a hundred years and knows exactly what she looks like now.\n\nBring her a comb, a mirror, a silver thing. Speak to her as you would to a lady of a great house who has fallen very far and remembers the house perfectly. Do not pity her out loud. She will hear it.",
        do: { flag: 'agatha-gift-known' },
        goto: 'hub',
      },

      'agatha-question': {
        speaker: 'Sister Garaele',
        text: "Where the spellbook of Bowgentle went.\n\nShe says it flatly, and then, after a beat, rather less flatly.\n\nIt is not for me. It is for — people I write to. That is as much as I will say standing in this room in daylight.",
        do: { flag: 'garaele-secret-hinted' },
        goto: 'hub',
      },

      'agatha-go': {
        speaker: 'Sister Garaele',
        text: "North-east, past the Trail, where the ruins of Conyberry sit in the long grass. The grove is a stand of alders and you will know it because nothing sings in it.\n\nHer question first, if you would. Then ask her whatever you like — she is bound to one answer and I would rather it were spent on something worth it.\n\nAnd — go carefully. She was a lady once. She is a scream now, and both are true at the same time.",
        goto: 'hub',
      },

      'agatha-done': {
        speaker: 'Sister Garaele',
        text: "You spoke to her. \\pAnd she answered.\n\nShe listens to the whole of it without moving, and at the end she sits down on the shrine step, which is not a thing a priestess does in front of strangers.\n\nThank you. Truly, and not in the Lady's name — in mine.\n\nAnd now I must trust you with something, because I have just written it in a letter with your names in it.",
        do: { flag: 'garaele-harper-open' },
        goto: 'harper',
      },

      offerings: {
        speaker: 'Sister Garaele',
        text: "It always does. The bowl pays for the healing draughts and the healing draughts go out of the door faster than the coin comes into it, and there is no temple behind me — Tymora's houses in Waterdeep have never heard of Phandalin.\n\nBring me what the wilds give up. Herbs for the poultices, a gem for the altar, and any coin the Redbrands have not already taken from somebody.\n\nAnd let the town see you do it. That is worth more than the gem.",
        goto: 'hub',
      },

      harper: {
        speaker: 'Sister Garaele',
        text: "You have good eyes and worse manners.\n\nShe closes her hand over her cuff, thinks better of it, and turns the little pin into the light instead. A silver harp between a crescent moon.\n\nI serve Tymora. That is entirely true and I would die for it. \\pAnd I write, every tenday, to a woman in Neverwinter who serves nobody you could name, about who is buying Netherese fragments out of Old Owl Well and why the Black Network has taken an interest in a mining town of four hundred souls.\n\nThe Harpers do not recruit. They notice. You have been noticed.",
        do: [{ flag: 'garaele-harper-open' }, { rep: { id: 'harpers', amount: 2 } }],
        goto: 'hub',
      },

      cipher: {
        speaker: 'Sister Garaele',
        text: "Then here is the work, and it is not glorious.\n\nA sheet of tally figures — ore weights, out of the Miner's Exchange, in Halia Thornton's own hand. And they are wrong. Not stolen-wrong. Coded-wrong.\n\nI need a second sheet from the same ledger to break it, and I cannot walk into that building without her knowing exactly why. You can. She thinks you are hirelings.\n\nLet her go on thinking it.",
        do: { give: 'parchment' },
        goto: 'hub',
      },

      join: {
        speaker: 'Sister Garaele',
        text: "Leave the shrine? \\pFor a tenday, perhaps. The Lady is not kept in a building.\n\nI can set a bone, turn a wound and call down rather more than either when it is needed, and I would sooner do it beside you than hear about it afterwards from a wounded man on my step.\n\nSixty gold to the bowl. Not for me — for the shrine, so it is here when we come back to it.",
        choices: [
          {
            text: 'Sixty to the bowl. Walk with us, Sister.',
            if: { gold: 60 },
            do: { recruit: 'sister-garaele' },
            goto: 'joined',
          },
          {
            text: 'Forty. She favours the bold. [Persuasion 15]',
            success: 'haggle-good',
            failure: 'haggle-bad',
            do: { recruit: { id: 'sister-garaele', cost: 40 } },
          },
          {
            // Charm Person on a Harper agent of Tymora. She will not thank you
            // for it when it wears off, but she will already be on the road.
            text: 'Twenty, Sister, and you know it is the right road. [Charmed]',
            if: { charmed: true },
            do: { recruit: { id: 'sister-garaele', cost: 20 } },
            goto: 'haggle-good',
          },
          { text: 'Not yet. Keep the shrine.', goto: 'hub' },
        ],
      },

      joined: {
        speaker: 'Sister Garaele',
        text: "Then let me get the mace. \\pYes, the shrine has a mace. Tymora is a gambler, not a pacifist.",
        goto: 'hub',
      },

      'haggle-good': {
        speaker: 'Sister Garaele',
        text: "She laughs — a real one, entirely undignified, hand over her mouth.\n\nQuoting the Lady at her own priestess. Forty, then, and I shall tell the bowl it was a wager and it came in.",
        goto: 'hub',
      },

      'haggle-bad': {
        speaker: 'Sister Garaele',
        text: "Sixty. The draughts cost what the draughts cost, and I will not have this shrine shut because I was flattered into a discount.\n\nShe softens it with half a smile.\n\nNice try. Beshaba's own try, in fact.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Sister Garaele',
        text: "Go carefully, and then stop going carefully at exactly the right moment.",
      },
    },
  },

  // =========================================================================
  // 5. THE PHANDALIN MINER'S EXCHANGE
  // =========================================================================

  // --- Halia Thornton: silkily manipulative, never says "Zhentarim" --------
  halia: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Halia Thornton',
        text: "Ore, gems, or something less easily weighed?\n\nShe sets down the assay scale with great care, as though it were listening, and gives you the whole of her attention. It is a considerable amount of attention.\n\nHalia Thornton. I run the Exchange, which means I decide what a claim is worth, which means — she smiles — that I am the most popular woman in Phandalin, and the least.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Halia Thornton',
        text: "And what may the Exchange do for you?",
        choices: [
          { text: 'We have ore to weigh.', do: { shop: 'miners-exchange' }, goto: 'hub' },
          { text: 'What is the Exchange, really?', goto: 'exchange' },
          {
            text: 'You said "less easily weighed".',
            if: { notFlag: 'halia-offer-made' },
            goto: 'offer',
          },
          {
            text: 'About that other business.',
            if: { flag: 'halia-offer-made' },
            goto: 'offer2',
          },
          {
            text: 'What do you want done about Glasstaff?',
            if: { all: [{ flag: 'glasstaff-identified' }, { questNot: 'glasstaffs-head' }] },
            do: { quest: 'glasstaffs-head' },
            goto: 'glasstaff',
          },
          {
            text: 'There is a shipment you want moved.',
            if: { faction: 'zhentarim', repMin: 5 },
            do: { quest: 'zhent-shipment' },
            goto: 'shipment',
          },
          {
            text: 'Show me the Exchange ledger. [Persuasion 18]',
            if: { flag: 'garaele-secret-hinted' },
            success: 'ledger-yes',
            failure: 'ledger-no',
            do: { quest: 'the-exchange-ledger' },
          },
          {
            // The Zhentarim's woman in Phandalin, charmed into candour. DC 18
            // is a wall at low level; a 1st-level slot is the other way round it.
            text: 'The ledger, Halia. Between friends. [Charmed]',
            if: [{ flag: 'garaele-secret-hinted' }, { charmed: true }],
            do: { quest: 'the-exchange-ledger' },
            goto: 'ledger-yes',
          },
          { text: 'Good day, mistress.', cancel: true, goto: 'bye' },
        ],
      },

      exchange: {
        speaker: 'Halia Thornton',
        text: "A guildhall without a guild. There are perhaps sixty prospectors working the foothills and not one of them can carry ore to Neverwinter alone, so they bring it here, and I weigh it, and I pay them, and I sell it on in quantity.\n\nThat is the honest and rather dull answer. The interesting one is that I also decide whose claim is registered, whose is disputed, and whose assay comes back worthless.\n\nAsk Freda about hers. She will tell you it was a lie. She will be quite passionate.",
        do: { flag: 'halia-freda-hint' },
        goto: 'hub',
      },

      offer: {
        speaker: 'Halia Thornton',
        text: "Did I?\\p How careless of me.\n\nShe puts a small weight on the scale and watches it settle.\n\nPhandalin is going to be worth a great deal of money and it is currently being run by a fat banker who bolts his shutters and a wizard nobody has met. That is not a town. That is a vacancy.\n\nI represent — let us say a company of merchants with an interest in the region, a long patience, and no particular affection for the Lords' Alliance. They pay well. They pay in advance. And they never write anything down that a magistrate could read.",
        do: { flag: 'halia-offer-made' },
        choices: [
          {
            text: 'Say the name and we will talk.',
            goto: 'name',
          },
          {
            text: 'We will take work. Not oaths.',
            do: { rep: { id: 'zhentarim', amount: 2 } },
            goto: 'work',
          },
          { text: 'We are not for hire like that.', goto: 'refuse' },
        ],
      },

      name: {
        speaker: 'Halia Thornton',
        text: "Names are for people who intend to be arrested.\n\nThe smile does not shift by a hair.\n\nCall it the Black Network if it helps you sleep, or call it a company of merchants, or call it nothing at all — which is what I call it, and what I shall go on calling it, and what you would be wise to call it too.\n\nThe work is real. The coin is real. Nothing else needs to be.",
        do: { rep: { id: 'zhentarim', amount: 1 } },
        goto: 'hub',
      },

      work: {
        speaker: 'Halia Thornton',
        text: "That is the sensible answer, and I like sensible people. Oaths are for the Order of the Gauntlet, and look how cheerful they are.\n\nShe writes nothing down. She simply looks at you for a moment as though setting a weight on the scale.\n\nStart small, then. There is a man in a red cloak who thinks the Exchange is a purse. Persuade him otherwise and we shall see how you get on.",
        goto: 'hub',
      },

      refuse: {
        speaker: 'Halia Thornton',
        text: "Of course you are not. How refreshing.\n\nShe returns to the scale, entirely unbothered, and does not raise her voice at all.\n\nDo come back when you have priced a night at the Stonehill, a Coster breastplate and a cleric's healing draught against what Harbin Wester pays for a Redbrand's cloak. I shall be here. I am always here.",
        do: { flag: 'halia-refused' },
        goto: 'hub',
      },

      offer2: {
        speaker: 'Halia Thornton',
        text: "The offer does not expire. That is rather the point of it.\n\nShe weighs a nugget, notes the figure, and does not look up.\n\nEvery other party in this town wants you to be something — the Alliance wants soldiers, the Gauntlet wants saints, that earnest girl at the shrine wants friends. I only want you to be useful, and to be paid for it. You will find that restful eventually.",
        goto: 'hub',
      },

      glasstaff: {
        speaker: 'Halia Thornton',
        text: "Ah. So you have his name.\n\nThe scale is set aside entirely. This is new.\n\nIarno Albrek. A Lords' Alliance wizard who came here to build a watch and built a protection racket instead, which I would almost admire if he were any good at it. He takes a tenth off every till on this street. Including mine.\n\nI want him ended, and I want it done by people with no connection whatever to this building. Bring me proof and there is a purse for you, and rather more than a purse afterwards.",
        do: { rep: { id: 'zhentarim', amount: 2 } },
        goto: 'hub',
      },

      shipment: {
        speaker: 'Halia Thornton',
        text: "Good. Then we are past the part where I pretend and you pretend back.\n\nEleven crates, at the old assay shed north of town, going east to a factor who will not meet you and does not need to. They are not to be opened. They are not to be weighed. They are not to be mentioned to the man at the gate with the chalk.\n\nThe Network pays on delivery and the Network remembers both directions. Do keep that in mind.",
        goto: 'hub',
      },

      'ledger-yes': {
        speaker: 'Halia Thornton',
        text: "You have been talking to the priestess.\n\nThe pause that follows is very short and entirely different from all her other pauses.\n\nHow interesting. Well — here. Ore weights, four months, Exchange copy. Every figure in it is true.\n\nShe hands it over with perfect grace.\n\nWhat is not in it is what those figures are for. And you will not find that in a ledger, dear. You will find it in Yartar, and you will not enjoy the journey.",
        do: [{ give: 'parchment' }, { flag: 'exchange-ledger-copy' }],
        goto: 'hub',
      },

      'ledger-no': {
        speaker: 'Halia Thornton',
        text: "The Exchange ledger is the property of the Exchange, and the Exchange is me.\n\nThe smile arrives precisely on time.\n\nDo ask again when you have something to trade for it. That is how this building works and it is the only way it has ever worked.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Halia Thornton',
        text: "Do come back. You have {gold} gold on you and I can think of four better uses for it than you can.",
      },
    },
  },

  // =========================================================================
  // 6. THE TOWNMASTER'S HALL
  // =========================================================================

  // --- Harbin Wester: a coward who talks big -------------------------------
  harbin: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Harbin Wester',
        text: "Yes, yes — the board is on the wall. Read it there, not at me.\n\nHe does not get up. He is a soft, fussy man behind a great deal of desk, and the shutters behind him are closed on a bright morning.\n\nHarbin Wester, Townmaster. If it is about the Redbrands, the town's position is that the matter is in hand and that private persons should not inflame it.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Harbin Wester',
        text: "Well? I have the tax rolls to see to.",
        choices: [
          {
            text: 'What is on the board?',
            do: { quest: 'townmasters-bounty' },
            goto: 'board',
          },
          {
            text: 'There are orcs on Wyvern Tor.',
            if: { questNot: 'wyvern-tor' },
            do: { quest: 'wyvern-tor' },
            goto: 'wyvern',
          },
          { text: 'What defences does this town have?', goto: 'defences' },
          { text: 'Nars Dendrar was hanged in your street.', goto: 'nars' },
          {
            text: 'The Redbrands are dead. All of them.',
            if: { flag: 'redbrands-broken' },
            goto: 'after',
          },
          {
            text: 'The tax rolls, then.',
            if: { flag: 'thistle-list-heard' },
            do: { quest: 'the-tax-rolls' },
            goto: 'taxes',
          },
          { text: 'You have been no help at all.', cancel: true, goto: 'bye' },
        ],
      },

      board: {
        speaker: 'Harbin Wester',
        text: "Ten gold a head for orcs on the Tor, and I posted that myself, at some personal risk, I might add.\n\nHe adjusts something on the desk that did not need adjusting.\n\nThere is also a standing sum for Redbrand cloaks, which I did not post, and which I would thank you not to repeat, and which I shall pay in the back room and not across this desk.",
        do: { flag: 'harbin-cloak-bounty' },
        goto: 'hub',
      },

      wyvern: {
        speaker: 'Harbin Wester',
        text: "Orcs on Wyvern Tor. A dozen, the drivers say, which means four, and they are on the high ground above the Trail where the road bends.\n\nThe town cannot spare men — we have four guards and two of them are related to me — so the town is offering coin instead, which is the modern way and a great deal more efficient.\n\nTen gold a head. Bring the — well. Bring something. I shall not be examining it closely.",
        goto: 'hub',
      },

      defences: {
        speaker: 'Harbin Wester',
        text: "Considerable! The hall is stone to the first storey, the gate is watched at all hours by a veteran of some experience, and I have personally requisitioned — he checks a paper — forty feet of palisade timber, which is on order.\n\nOn order from Favric, who has not cut it, because the town has not paid him, because the tax rolls are short.\n\nBut the position is sound. Write that down if you are writing anything down.",
        goto: 'hub',
      },

      nars: {
        speaker: 'Harbin Wester',
        text: "That is — \\pthat was a most regrettable business and I have said so.\n\nThe pen stops moving.\n\nWhat exactly would you have had me do? Send Kerri Amblecrown, who is twenty-two, against six armed men? Open the hall to a mob and have this building burned like Tresendar?\n\nI locked the shutters. I am not proud of it. I am, however, alive, and so is everyone in my employ, which is more than the Dendrars can say about principle.",
        do: { flag: 'harbin-nars-asked' },
        goto: 'hub',
      },

      after: {
        speaker: 'Harbin Wester',
        text: "All of them! Well. \\pWell.\n\nHe is on his feet, and the shutters are open behind him, and he has evidently been rehearsing.\n\nThe town's position — my position — was always that the matter would be resolved by decisive action, and I am gratified that my confidence in the private sector has been so thoroughly vindicated.\n\nThere will be a proclamation. I shall read it from the steps. You may stand nearby.",
        choices: [
          {
            text: 'Pay the bounty, Harbin.',
            if: { item: 'redbrand-cloak' },
            do: [{ take: { id: 'redbrand-cloak', qty: 2 } }, { gold: 60 }, { complete: 'townmasters-bounty' }],
            goto: 'paid',
          },
          {
            text: 'Give Sildar the seal. [Persuasion 16]',
            success: 'seal-yes',
            failure: 'seal-no',
          },
          { text: 'Stand nearby. Of course.', goto: 'hub' },
        ],
      },

      paid: {
        speaker: 'Harbin Wester',
        text: "Sixty. Counted, and I shall want the cloaks burned rather than left about, they upset people.\n\nHe counts it twice and pushes it across as though it were leaving the family.",
        goto: 'hub',
      },

      'seal-yes': {
        speaker: 'Harbin Wester',
        text: "Hallwinter. \\pThe Alliance man.\n\nSomething goes out of him, and what is left underneath is a tired banker who never wanted the seal in the first place.\n\nDo you know, nobody has ever offered to take it. They complain about how I hold it. Nobody offers to take it.\n\nHe can have the watch. He can have the palisade and the tax rolls and the whole miserable business. I shall keep the ledgers, which I am actually good at, and I shall sleep for a tenday.",
        do: [{ flag: 'sildar-made-watch-captain' }, { rep: { id: 'lords-alliance', amount: 3 } }],
        goto: 'hub',
      },

      'seal-no': {
        speaker: 'Harbin Wester',
        text: "The seal of Phandalin is not a thing to be handed about like a tankard.\n\nHe sits back down, and the shutters are still open, but he glances at them.\n\nThe proclamation stands. That is the town's gratitude and it is a considerable thing.",
        goto: 'hub',
      },

      taxes: {
        speaker: 'Harbin Wester',
        text: "Short by eleven gold and some silver, and before you say it — no, it is not me.\n\nHe hesitates in a way that suggests it is at least partly him.\n\nThe rolls have not been walked in four months because the last man who went door to door with a tally book came back without the tally book and with a good deal to say about red cloaks.\n\nWalk them. People will open the door to you. They have stopped opening it to me.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Harbin Wester',
        text: "The board is on the wall. Read it there.",
      },
    },
  },

  // --- Kerri Amblecrown, town guard ---------------------------------------
  'guard-kerri': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Kerri Amblecrown',
        text: "Hall is open. Townmaster is in. He is always in.\n\nThe hauberk is two sizes too large and she has taken it up at the shoulders with wire.\n\nKerri Amblecrown. One of the four people this town calls a garrison, which is a joke everyone makes and nobody finds funny twice.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Kerri Amblecrown',
        text: "Something you need?",
        choices: [
          { text: 'Four guards for four hundred people?', goto: 'four' },
          {
            text: 'Who walks the night watch?',
            if: { questNot: 'night-watch' },
            do: { quest: 'night-watch' },
            goto: 'watch',
          },
          { text: 'Where were you when they hanged Nars Dendrar?', goto: 'nars' },
          {
            text: 'You have a proper captain now.',
            if: { flag: 'sildar-made-watch-captain' },
            do: { rep: { id: 'lords-alliance', amount: 1 } },
            goto: 'captain',
          },
          { text: 'Carry on.', cancel: true, goto: 'bye' },
        ],
      },
      four: {
        speaker: 'Kerri Amblecrown',
        text: "Four, and two of them are the townmaster's cousins and one of those is sixty.\n\nSo it is me and Stor Hornraven at the gate, and Stor is old enough to have watched this town be built twice.\n\nWe do not stop anything. We count things and we write them down. That is the honest job description and I would rather say it than have you find it out.",
        goto: 'hub',
      },
      watch: {
        speaker: 'Kerri Amblecrown',
        text: "Nobody. Not since Eleint.\n\nShe says it without flinching, which costs her something.\n\nHarbin took the night watch off the roster because a watch that meets Redbrands in the dark either fights them or bows to them, and either way the town sees it happen.\n\nIf you walked it — even three nights, even just the well and the Dendrar house and the road out — people would sleep. That is not nothing. I would come. I am off duty at dusk and I am not doing anything with the dark.",
        do: { flag: 'kerri-volunteered' },
        goto: 'hub',
      },
      nars: {
        speaker: 'Kerri Amblecrown',
        text: "Standing in this doorway with the bolt across it and the townmaster behind me telling me not to be a fool.\n\nA long, flat silence.\n\nHe was right. I am twenty-two and there were six of them and I would have been the second body. I know all of that. I have known all of that every night since.\n\nI would still rather have gone out.",
        do: { flag: 'kerri-nars-asked' },
        goto: 'hub',
      },
      captain: {
        speaker: 'Kerri Amblecrown',
        text: "Hallwinter has us on the green at first light and he has already told me the hauberk is wrong and shown me how to take it in properly with a strap instead of wire.\n\nShe is trying very hard not to be pleased and failing entirely.\n\nHe says four is enough to hold a gate if four know what they are doing. Nobody has ever said enough about us before.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Kerri Amblecrown',
        text: "Mind the hall step. It has had three people over this tenday and two of them were me.",
      },
    },
  },

  // --- Stor Hornraven, the gate watch --------------------------------------
  'guard-stor': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Stor Hornraven',
        text: "In or out?\n\nThe old spearman marks a stroke of chalk on the gatepost without appearing to look at it.\n\nStor Hornraven. I count what comes down the Triboar road and what goes back up it, and I have done it since before that inn had a roof.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Stor Hornraven',
        text: "Well?",
        choices: [
          { text: 'What does the chalk say?', goto: 'chalk' },
          {
            text: 'Keep a proper tally for us.',
            if: { questNot: 'the-gate-tally' },
            do: { quest: 'the-gate-tally' },
            goto: 'tally',
          },
          { text: 'What is the road like east?', goto: 'road' },
          { text: 'Anything odd come through lately?', goto: 'odd' },
          { text: 'Out, then.', cancel: true, goto: 'bye' },
        ],
      },
      chalk: {
        speaker: 'Stor Hornraven',
        text: "Wagons, riders, foot. Four strokes and a cross for a tenday, and I rub it off on the tenth day and start again.\n\nHe taps the post.\n\nEleven wagons in Marpenoth. Six last tenday. Two this one, and one of those was Barthen's, going out empty to fetch what never arrived.\n\nA town dies at the gate first. You can watch it happen in chalk.",
        goto: 'hub',
      },
      tally: {
        speaker: 'Stor Hornraven',
        text: "You want the count written proper? For somebody who will read it?\n\nHe looks at you sideways for a while.\n\nI can do that. I have asked the townmaster for a book eleven times. If you are getting me a book, get me one with a hard cover — the damp gets everything out here.\n\nAnd if it goes to that Alliance man rather than to Harbin, so much the better, and I did not say that.",
        do: { flag: 'stor-tally-started' },
        goto: 'hub',
      },
      road: {
        speaker: 'Stor Hornraven',
        text: "Fine for two days. After that it is goblin country and everyone has agreed to keep calling it the Triboar Trail.\n\nDead horses on the road at the stream cut, and nobody has moved them, which tells you what the drivers think of the place.\n\nWalk it in daylight, walk it fast, and do not camp in the bottom of the cut whatever the wind is doing.",
        goto: 'hub',
      },
      odd: {
        speaker: 'Stor Hornraven',
        rumor: true,
        text: "Everything comes past this post. Most of it is nothing. Some of it is not.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Stor Hornraven',
        text: "Out.\n\nA stroke of chalk goes on the post as you pass.",
      },
    },
  },

  // =========================================================================
  // 7. EDERMATH ORCHARD
  // =========================================================================

  // --- Daran Edermath: warm old half-elf soldier of the Gauntlet -----------
  daran: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Daran Edermath',
        text: "Mind the low branch. Sit, if you like — the bench is sound, I made it myself and I made it badly, so it will outlast the house.\n\nDaran Edermath. These are my apples and that is my whole occupation, whatever the town tells you.\n\nHe is a hundred and some, and he stands like a man who has spent forty of those years in mail.",
        goto: 'hub',
      },

      hub: {
        speaker: 'Daran Edermath',
        text: "Now. What brings armed people up my orchard path?",
        choices: [
          { text: 'What did you do before the apples?', goto: 'before' },
          {
            text: 'Something is wrong at Old Owl Well.',
            if: { questNot: 'old-owl-well' },
            do: { quest: 'old-owl-well' },
            goto: 'well',
          },
          {
            text: 'We have been to Old Owl Well.',
            if: { flag: 'old-owl-well-found' },
            do: { rep: { id: 'gauntlet', amount: 2 } },
            goto: 'well-back',
          },
          {
            text: 'Your trees are dying.',
            if: { questNot: 'orchard-blights' },
            do: { quest: 'orchard-blights' },
            goto: 'blights',
          },
          {
            text: 'Tell me about the Order of the Gauntlet.',
            goto: 'gauntlet',
          },
          {
            text: 'Swear us in, Marshal.',
            if: { all: [{ flag: 'daran-gauntlet-open' }, { faction: 'gauntlet', repMin: 5 }] },
            do: { quest: 'gauntlet-oath' },
            goto: 'oath',
          },
          {
            text: 'Take up the sword again. Come with us.',
            if: { flag: 'daran-gauntlet-open', notRecruited: 'daran-edermath' },
            goto: 'join',
          },
          { text: 'Enjoy the shade, old man.', cancel: true, goto: 'bye' },
        ],
      },

      before: {
        speaker: 'Daran Edermath',
        text: "I was a Marshal of the Order of the Gauntlet, and before that I was a boy in Neverwinter, and there is rather a lot of hitting people in between.\n\nHe turns an apple over in his hands and does not eat it.\n\nI was on the wall the year Mount Hotenow blew and the city burned from underneath. We saved perhaps a third of the Blacklake. That is the number I have and I have had a long time to get used to it.\n\nAfterwards I found I could not hold a sword without hearing the wall. So: apples.",
        do: { flag: 'daran-gauntlet-open' },
        goto: 'hub',
      },

      well: {
        speaker: 'Daran Edermath',
        text: "Old Owl Well. A Netherese watchtower, or what four thousand years have left of one, up in the hills north-east where the Trail gives out.\n\nA prospector came down out of there a tenday past with his hair gone white in patches and would not go back for any money. He said there are men in red robes walking the ruin, and things walking behind them that ought not to be walking at all.\n\nI would go myself. I would have gone in a heartbeat, fifty years ago, and I am not fifty years ago.",
        goto: 'hub',
      },

      'well-back': {
        speaker: 'Daran Edermath',
        text: "You went. \\pAnd you came back, which is more than the last two did.\n\nHe listens to all of it, and at the end he is quiet for a while, looking up the hill towards the north-east.\n\nA Red Wizard of Thay. On the Sword Coast. Digging in a Netherese ruin with a work-gang of the dead.\n\nThat is not a local matter and it never was. The Order will want to know, and the Order will send somebody, and I am rather afraid that somebody has already been sent and is sitting on his own bench eating his own apples.",
        goto: 'hub',
      },

      blights: {
        speaker: 'Daran Edermath',
        text: "Ah. You noticed.\n\nHe leads you to the eastern row, where four trees stand black and needled, the bark split into something closer to thorn than wood.\n\nThat is not blight, whatever I call it in the market. Reidoth would give it its proper name. Something in Neverwinter Wood is making them, and something is walking them south, and they came out of the treeline and into my orchard in a straight line.\n\nBurn them at the root or they seed. And do it before the frost, or I lose the whole eastern row and the town loses its cider.",
        goto: 'hub',
      },

      gauntlet: {
        speaker: 'Daran Edermath',
        text: "We are the ones who go and look.\n\nHarpers watch and write. The Enclave tends the wild. The Alliance keeps the roads open and the ledgers balanced. And the Order of the Gauntlet finds out where the evil actually lives and goes into the room with it.\n\nRanks: Chevall, Marshal, Whitehawk, Vindicator. I stopped at Marshal, and I stopped rather abruptly.\n\nIt is not a righteous order, whatever we tell ourselves in the chapterhouse. It is a practical one. Somebody has to open the door.",
        do: { flag: 'daran-gauntlet-open' },
        goto: 'hub',
      },

      oath: {
        speaker: 'Daran Edermath',
        text: "You are asking me to put the Order's mark on you. \\pI have not done that in thirty years and I am not certain I still can.\n\nHe stands, and something in the way he does it is entirely different from the man on the bench.\n\nThe oath is four lines and none of them are about being good. They are about being there. Say them where you mean them and I will write to the chapterhouse at Helm's Hold, and after that you are ours and we are yours and nobody will thank either of us for it.",
        do: { rep: { id: 'gauntlet', amount: 3 } },
        goto: 'hub',
      },

      join: {
        speaker: 'Daran Edermath',
        text: "Come with you.\n\nHe looks at the eastern row for a long moment.\n\nI have a sword in the roof beam wrapped in oilcloth and I have taken it down and put it back up four times since Eleint. A hundred and twenty gold — not for me, for a lad to mind the orchard, because I will not let good trees die for my pride.\n\nAnd — thank you for asking straight out. Everyone else in this town looks at me and sees the apples.",
        choices: [
          {
            text: 'A hundred and twenty. Get the sword.',
            if: { gold: 120 },
            do: { recruit: 'daran-edermath' },
            goto: 'joined',
          },
          {
            text: 'Ander will mind the trees. [Persuasion 14]',
            success: 'haggle-good',
            failure: 'haggle-bad',
            do: { recruit: { id: 'daran-edermath', cost: 80 } },
          },
          { text: 'Keep the sword in the beam a while longer.', goto: 'hub' },
        ],
      },

      joined: {
        speaker: 'Daran Edermath',
        text: "Well. \\pIt still fits.\n\nHe fastens the belt with the ease of a man who has done it ten thousand times, and the whole shape of him changes.\n\nOne condition, and it is not negotiable. When it is done, I come back here, and you carry me if you have to. I have promised these trees.",
        goto: 'hub',
      },

      'haggle-good': {
        speaker: 'Daran Edermath',
        text: "That boy would give his teeth to be useful and everyone in Phandalin keeps telling him to stack crates.\n\nA slow grin, entirely undignified for a man of his age.\n\nEighty, then, for the lad's wage and a barrel of pitch for the blighted row. Go and tell Elmar Barthen I am stealing his clerk two days a tenday, and mind, tell him gently, he is fond of that boy.",
        goto: 'hub',
      },

      'haggle-bad': {
        speaker: 'Daran Edermath',
        text: "Ander Barthen could not tell a canker from a wasp hole and I say that with affection.\n\nHe shakes his head, still smiling.\n\nA hundred and twenty. I am an old soldier, not a charity, and the trees are not negotiable.",
        goto: 'hub',
      },

      bye: {
        speaker: 'Daran Edermath',
        text: "Take an apple on the way down. Take two. They do not keep and nobody in this town buys cider any more.",
      },
    },
  },

  // =========================================================================
  // 8. ALDERLEAF FARM
  // =========================================================================

  // --- Qelline Alderleaf: shrewd halfling farmer ---------------------------
  qelline: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Qelline Alderleaf',
        text: "Wipe your feet or do not come in, and if you are here about the boy I already know and I am dealing with it.\n\nShe is elbow-deep in a bucket of turnips and does not stop.\n\nQelline Alderleaf. Best turnips in Phandalin and the second-best information, and the person with the best information does not share hers, so.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Qelline Alderleaf',
        text: "Go on, then.",
        choices: [
          { text: 'Who has the best information?', goto: 'halia' },
          {
            text: 'We need to find the druid Reidoth.',
            if: { questNot: 'reidoths-whereabouts' },
            do: { quest: 'reidoths-whereabouts' },
            goto: 'reidoth',
          },
          {
            text: 'Your harvest is short-handed.',
            if: { questNot: 'alderleaf-harvest' },
            do: { quest: 'alderleaf-harvest' },
            goto: 'harvest',
          },
          { text: 'Your son says he found a tunnel.', goto: 'carp' },
          { text: 'What do you make of the Redbrands?', goto: 'redbrands' },
          { text: 'We will let you get on.', cancel: true, goto: 'bye' },
        ],
      },
      halia: {
        speaker: 'Qelline Alderleaf',
        text: "Halia Thornton, at the Exchange. Obviously.\n\nShe wrings out a cloth with more force than the cloth requires.\n\nThat woman knows what every claim in these foothills is worth, who owes whom, and which of them will sell when they are hungry enough. She is very pleasant about it. She is the most pleasant person in Phandalin and I would not turn my back on her for a wagon of seed corn.",
        goto: 'hub',
      },
      reidoth: {
        speaker: 'Qelline Alderleaf',
        text: "Reidoth. Yes, he stops here — twice a year, back door, eats standing up and will not sit at a table.\n\nHe keeps Thundertree. The ruin, north-west past the Trail on the edge of Neverwinter Wood, where the mountain came down on the village thirty years ago and the wood took the rest.\n\nIf he is not in Thundertree he is in the pines and you will not find him, you will simply be found. Do not go blundering about calling for him. He does not care for that.",
        do: { flag: 'reidoth-located' },
        goto: 'hub',
      },
      harvest: {
        speaker: 'Qelline Alderleaf',
        text: "Short-handed is a polite word for it. I have got the boy, six hens and my own back.\n\nThe hired lads went off to wash gravel in the foothills because a dwarf told them there was a mine, and half of them are still up there being disappointed.\n\nIf you have got shoulders and half a day, I have got a field and a barrel of ale, and I do not pay in gratitude — I pay in things, because gratitude does not keep.",
        goto: 'hub',
      },
      carp: {
        speaker: 'Qelline Alderleaf',
        text: "My son says a great many things. He said a hen laid a gold egg and he said Bree Tealeaf can fly.\n\nShe sets the bucket down. This is different.\n\nBut he has stopped saying this one. He said it every day for a tenday and then he stopped, and he has not been past the eastern rise since, and he is eight and he does not have that kind of self-control.\n\nSo go and ask him, and take him seriously, and if it is true I would like to know before he goes back in.",
        do: { flag: 'qelline-carp-worried' },
        goto: 'hub',
      },
      redbrands: {
        speaker: 'Qelline Alderleaf',
        text: "I am half a mile outside the town and they have never come down my lane, and I have thought hard about why.\n\nA farm has nothing they want. No till, no strongbox, no shelves. And a farm has forks, and neighbours, and a lot of open ground to cross in daylight.\n\nThey are not brave. That is the whole of the Redbrands. They are simply the only ones in Phandalin who have worked out that nobody else will start.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Qelline Alderleaf',
        text: "Take some turnips. No, take them, I am not asking.",
      },
    },
  },

  // --- Carp Alderleaf: mischievous halfling boy ----------------------------
  carp: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Carp Alderleaf',
        text: "You are not from here.\n\nHe assesses you with enormous suspicion from behind a wheelbarrow.\n\nIf my mother sent you, I have done the hens. If Pip Stonehill sent you, whatever he said is a lie. Especially about the nose whistling. I CAN whistle through my nose.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Carp Alderleaf',
        text: "So what do you want?",
        choices: [
          { text: 'Show me the nose whistling.', goto: 'whistle' },
          { text: 'Tell me about the tunnel.', goto: 'tunnel' },
          {
            text: 'You are frightened of something. [Insight 12]',
            success: 'scared',
            failure: 'scared-no',
          },
          { text: 'Nothing. Carry on.', cancel: true, goto: 'bye' },
        ],
      },
      whistle: {
        speaker: 'Carp Alderleaf',
        text: "He does it. It is an appalling sound and he is enormously proud of it, and a hen leaves the yard entirely.\n\nSee? SEE? You tell him. You tell Pip Stonehill you heard it with your own ears.",
        do: { flag: 'carp-friend' },
        goto: 'hub',
      },
      tunnel: {
        speaker: 'Carp Alderleaf',
        text: "I never said anything about a tunnel.\\p Who said tunnel.\n\nHe is looking at the eastern rise, where the burnt shell of Tresendar Manor stands against the sky, and he is not looking at you at all.",
        choices: [
          {
            text: 'Carp. We are going in there anyway.',
            goto: 'tunnel-yes',
          },
          {
            text: 'A copper for the way in.',
            do: { gold: -1 },
            goto: 'tunnel-yes',
          },
          {
            text: 'It will not touch you again. [Persuasion 12]',
            success: 'tunnel-yes',
            failure: 'tunnel-no',
          },
        ],
      },
      'tunnel-yes': {
        speaker: 'Carp Alderleaf',
        text: "All right. \\pAll right, but you have to actually go, because if you tell my mother and do not go she will just shout at me and it will still be down there.\n\nEast side of the rise, where the ground fell away under the old roots. There is a gap. I fit and you will not, but it opens out into a cut passage with dressed stone, proper stone, like the hall floor.\n\nThat is where I stopped. Something down the passage said my name.",
        do: [{ quest: 'carps-secret-tunnel' }, { flag: 'manor-tunnel-known' }],
        goto: 'hub',
      },
      'tunnel-no': {
        speaker: 'Carp Alderleaf',
        text: "There is no tunnel.\n\nHe picks up the wheelbarrow handles and takes it somewhere it did not need to go.",
        goto: 'hub',
      },
      scared: {
        speaker: 'Carp Alderleaf',
        text: "The bravado comes off him all at once, the way it does at eight.\n\nIt said my name.\n\nIt was dark and it was down the passage and it was not a person and it said Carp, and I have not told anybody, because if I tell my mother she will go up there herself and she has not got a sword, she has got a hoe.",
        do: [{ flag: 'manor-tunnel-known' }, { quest: 'carps-secret-tunnel' }],
        goto: 'hub',
      },
      'scared-no': {
        speaker: 'Carp Alderleaf',
        text: "I am not frightened of ANYTHING.\n\nHe says it a bit too loudly and goes to stand nearer the house.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Carp Alderleaf',
        text: "If you see Pip, tell him about the nose. Tell him I did it twice.",
      },
    },
  },

  // --- The Alderleaf hens: wordless ----------------------------------------
  'alderleaf-hen': {
    start: 'n1',
    nodes: {
      n1: {
        speaker: 'The Alderleaf Hens',
        text: "Six brown hens patrol the yard in a loose skirmish line, entirely certain of their business.\n\nOne of them stops directly in front of you, turns her head to bring a single flat orange eye to bear, and holds it. The other five continue their advance around your boots without breaking step.",
        choices: [
          { text: 'Scatter a handful of grain.', goto: 'n2' },
          { text: 'Look under the coop.', goto: 'n3' },
          { text: 'Give them the yard.', cancel: true },
        ],
      },
      n2: {
        speaker: 'The Alderleaf Hens',
        text: "The formation dissolves instantly into six separate emergencies.\n\nFrom the house, without looking out, Qelline Alderleaf says: do not feed them, they are already impossible.",
      },
      n3: {
        speaker: 'The Alderleaf Hens',
        text: "Straw, feathers, a great deal of what one expects under a coop, and — pushed well back against the timber — a boy's woollen cap, a stub of tallow candle, and a coil of twine tied off at measured intervals.\n\nSomebody has been counting paces in the dark and hiding the evidence.",
        do: { flag: 'carp-tunnel-evidence' },
      },
    },
  },

  // =========================================================================
  // 9. THE SLEEPING GIANT
  // =========================================================================

  // --- Grista: monosyllabic, hostile dwarf ---------------------------------
  grista: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Grista',
        text: "Ale.\n\nIt is not a question. A tankard arrives. The taproom smells of spilled beer and wet wool and there are more red cloaks in it than there are other people.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Grista',
        text: "Well?",
        choices: [
          {
            text: 'Ale, then. [gold]2 gp[/] for the room.',
            if: { gold: 2 },
            do: [{ gold: -2 }, { give: 'neverwinter-ale' }],
            goto: 'ale',
          },
          {
            text: 'A bed and a night. [gold]3 gp[/]',
            if: { gold: 3 },
            do: { heal: { cost: 3, hours: 8 } },
            goto: 'bed',
          },
          { text: 'Talk to me, Grista.', goto: 'talk' },
          { text: 'You serve those men in red.', goto: 'redbrands' },
          {
            text: 'They are gone. Every one.',
            if: { flag: 'redbrands-broken' },
            goto: 'after',
          },
          {
            text: 'Your stock is running low.',
            if: { questNot: 'gristas-stock' },
            do: { quest: 'gristas-stock' },
            goto: 'stock',
          },
          {
            text: 'Somebody should throw them out.',
            if: { notFlag: 'redbrands-broken' },
            do: { quest: 'sleeping-giant-brawl' },
            goto: 'brawl',
          },
          { text: 'Who is drinking alone over there?', goto: 'bench' },
          { text: 'Nothing.', cancel: true, goto: 'bye' },
        ],
      },
      ale: {
        speaker: 'Grista',
        text: "It is sour and it is cold and it is honestly poured, which in this room is two out of three.\n\nGrista watches you drink it. She does not say anything. She appears to be counting something.",
        goto: 'hub',
      },
      bed: {
        speaker: 'Grista',
        text: "Loft. Straw. Door bolts from inside.\n\nShe points with her chin and goes back to the barrels. The bolt, when you find it, is new iron on old wood, and it has been fitted recently by somebody who took it seriously.",
        goto: 'hub',
      },
      talk: {
        speaker: 'Grista',
        rumor: true,
        text: "No.\\p\n\nShe wipes the bar. Then, without looking up, and in exactly the voice of someone who has decided to say one thing and only one:",
        goto: 'hub',
      },
      redbrands: {
        speaker: 'Grista',
        text: "They pay.\n\nA very long pause.\n\nSometimes.\n\nAnother one.\n\nWhat would you have me do — bar the door? It is my door. It is the only thing in Phandalin that is mine, and the day I bar it to six men with swords is the day it stops being a door and starts being kindling.",
        do: { flag: 'grista-asked-redbrands' },
        goto: 'hub',
      },
      brawl: {
        speaker: 'Grista',
        text: "Somebody should.\n\nShe sets down a tankard she has been polishing for far too long, and for the first time she looks straight at you.\n\nNot in here. Tables cost money.\n\nOutside, in the lane, where the lookout stands. Do it there and I will not have seen anything, and there will be a barrel behind the bar with your name chalked on it for as long as I am pouring.",
        goto: 'hub',
      },
      stock: {
        speaker: 'Grista',
        text: "Two barrels. Both sour.\n\nShe jerks a thumb north.\n\nThe brewer's dray from Triboar has not come in three tendays. Goblins on the Trail, or the brewer has decided Phandalin is not worth the axle. Either way, when these two go, this room is a room with benches in it.\n\nBring me barrels. I do not care whose.",
        goto: 'hub',
      },
      bench: {
        speaker: 'Grista',
        text: "Sellswords. Worse ones than the inn gets, and cheaper.\n\nShe pours without being asked.\n\nThe goliath in the corner has not started a fight in here in a year, which is a recommendation. The tiefling woman by the fire counts your purse when you walk past. The dwarf at the end has been at that table since Eleasis and I am not going to talk about it.",
        goto: 'hub',
      },
      after: {
        speaker: 'Grista',
        text: "Aye.\n\nShe pours you one without being asked, and then, after a moment, pours herself one, which nobody in Phandalin has ever seen her do.\n\nMy door is mine again.\n\nThat is all she says. She does not toast anything. But the tankard stays full for as long as you sit at that bar, and it stays full every time you come back.",
        do: [{ flag: 'grista-grateful' }, { give: { id: 'neverwinter-ale', qty: 3 } }],
        goto: 'hub',
      },
      bye: {
        speaker: 'Grista',
        text: "Mm.",
      },
    },
  },

  // --- Veit Ungart, a dwarf in his cups ------------------------------------
  veit: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Veit Ungart',
        text: "Sit down, sit down, y'r blocking the — no, y'r not, there's nothing behind you, ignore me.\n\nVeit Ungart. Ungart of Mirabar, mind, not the Waterdeep lot, they spell it wrong and they mine worse.\n\nHe gestures at the table, which holds four empty tankards and one map so worn through at the folds that it is mostly holes.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Veit Ungart',
        text: "Well? Y'r still here, so y'want something.",
        choices: [
          { text: 'What is on that map?', goto: 'map' },
          { text: 'Why Phandalin?', goto: 'why' },
          { text: 'What do you hear in here?', goto: 'gossip' },
          {
            text: 'Your tab is on the wall, Veit.',
            if: { questNot: 'veits-debt' },
            do: { quest: 'veits-debt' },
            goto: 'debt',
          },
          {
            text: 'Settle it for him. [gold]15 gp[/]',
            if: { all: [{ quest: 'veits-debt' }, { gold: 15 }] },
            do: [{ gold: -15 }, { complete: 'veits-debt' }],
            goto: 'paid',
          },
          { text: 'Get some water in you.', cancel: true, goto: 'bye' },
        ],
      },
      map: {
        speaker: 'Veit Ungart',
        text: "Foothills. Every wash, every seam, every hole I've put a pick in for two years.\n\nHe smooths it flat with great tenderness. It is genuinely good work.\n\nAnd there's nothing in it. Not a thing. Two years of proper prospecting and the only silver in these hills is under a mountain that swallowed the Rockseekers, and I am not that sort of fool.\n\nI'm this sort.",
        goto: 'hub',
      },
      why: {
        speaker: 'Veit Ungart',
        text: "Same as everybody. Phandelver's Pact, the old mine, the Forge of Spells. Dwarves and gnomes and human wizards, all working the one seam together, four hundred years back.\n\nCame south from Mirabar with a good pick and eighty gold. Got the pick still.\n\nHe looks at the tankards for a while.\n\nMy sister writes. I have not opened the last three.",
        do: { flag: 'veit-sister' },
        goto: 'hub',
      },
      gossip: {
        speaker: 'Veit Ungart',
        rumor: true,
        text: "Nobody stops talking when there's a drunk at the next table. Best listening post in the North, this chair.",
        goto: 'hub',
      },
      debt: {
        speaker: 'Veit Ungart',
        text: "Fifteen gold and some chalk marks, aye. Grista's got it up there where the whole room can read it, which is the point.\n\nHe does not look at the wall.\n\nShe'll not throw me out. That's the worst of it — she'll not throw me out, she'll just keep the marks up until I'm the thing people point at when they're explaining what not to become.",
        goto: 'hub',
      },
      paid: {
        speaker: 'Veit Ungart',
        text: "Grista rubs the chalk off the wall with her thumb without a word and goes back to the barrels.\n\nVeit Ungart looks at the clean patch of wall for a long time.\n\nRight. \\pRight, then. I'll open my sister's letters.\n\nHe pushes the map across the table to you. Every wash and seam in the foothills, in a good hand.\n\nTake it. I'll not need it. I'm going home.",
        do: [{ give: 'map' }, { flag: 'veit-going-home' }, { rep: { id: 'lords-alliance', amount: 1 } }],
        goto: 'hub',
      },
      bye: {
        speaker: 'Veit Ungart',
        text: "Aye. Water. \\pIn a bit.",
      },
    },
  },

  // --- A Redbrand bruiser at the Sleeping Giant ----------------------------
  'redbrand-bruiser': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'A Redbrand Bruiser',
        text: "You're new.\n\nHe does not stand up. He does not need to; he has taken up the whole bench and both ends of the conversation.\n\nSo here's how it goes for new. You drink, you pay, you don't look at anybody, and when you leave town you leave a little something behind for the trouble. Everyone here understands it. Ask them.\n\nNobody in the taproom is looking at you.",
        goto: 'hub',
      },
      hub: {
        speaker: 'A Redbrand Bruiser',
        text: "Well? Say something clever.",
        choices: [
          {
            text: 'Pay him and move on. [gold]10 gp[/]',
            if: { gold: 10 },
            do: [{ gold: -10 }, { flag: 'paid-redbrands' }],
            goto: 'paid',
          },
          {
            text: 'Who is Glasstaff?',
            goto: 'glasstaff',
          },
          {
            text: 'Take the cloak off. [Intimidation 14]',
            success: 'cowed',
            failure: 'angry',
          },
          {
            text: 'You hanged Nars Dendrar.',
            goto: 'nars',
          },
          {
            text: 'Draw, then.',
            do: { battle: { monsters: [{ id: 'redbrand-ruffian', count: 3 }], biome: 'city' } },
          },
          { text: 'Say nothing and sit elsewhere.', cancel: true, goto: 'bye' },
        ],
      },
      paid: {
        speaker: 'A Redbrand Bruiser',
        text: "There. That wasn't hard.\n\nHe puts the coin away without counting it, which is somehow worse than counting it.\n\nSee, this is a nice town. Nothing happens in a nice town. That's what we're for.",
        goto: 'hub',
      },
      glasstaff: {
        speaker: 'A Redbrand Bruiser',
        text: "Glasstaff.\n\nSomething moves behind the sneer for the first time.\n\nYou don't ask about Glasstaff. Glasstaff asks about you. He's up at the manor and he's got a staff made of — well. It's glass, isn't it. It's in the name.\n\nI've seen a man argue with him. Once. \\pDrink your drink.",
        do: { flag: 'glasstaff-named' },
        goto: 'hub',
      },
      cowed: {
        speaker: 'A Redbrand Bruiser',
        text: "The bench creaks as he stops leaning on it.\n\nHe looks at the taproom, and the taproom, for the first time in a season, is looking back.\n\nAll right. All right, no need for — we're all drinking here, aren't we.\n\nHe sits down again a good deal smaller than he stood up, and the whole room notices, and after a moment somebody at the back laughs.",
        do: [{ flag: 'redbrand-cowed' }, { quest: 'redbrand-menace' }, { rep: { id: 'lords-alliance', amount: 1 } }],
        goto: 'hub',
      },
      angry: {
        speaker: 'A Redbrand Bruiser',
        text: "The sneer comes back wider and the bench goes over.\n\nGrista says, from the bar, flatly: outside.\n\nNobody moves outside.",
        do: { battle: { monsters: [{ id: 'redbrand-ruffian', count: 2 }], biome: 'city' } },
      },
      nars: {
        speaker: 'A Redbrand Bruiser',
        text: "The tailor.\n\nHe drinks.\n\nHe stood in the street and said what he thought about us where people could hear it. That's the whole of it. Wasn't about him. It was about the next fellow who fancies standing in a street.\n\nWorked, didn't it. Nobody's stood in a street since.",
        do: [{ flag: 'nars-confirmed' }, { quest: 'redbrand-menace' }],
        goto: 'hub',
      },
      bye: {
        speaker: 'A Redbrand Bruiser',
        text: "That's right. Keep walking.",
      },
    },
  },

  // --- A Redbrand lookout in the lane --------------------------------------
  'redbrand-lookout': {
    start: 'start',
    nodes: {
      start: {
        speaker: 'A Redbrand Lookout',
        text: "Lane's closed.\n\nHe is leaning on the wall by the Sleeping Giant, counting strangers and pretending not to, and his cloak is dyed the colour of a fresh cut.\n\nTurn round. Go and look at the well, everyone likes the well.",
        goto: 'hub',
      },
      hub: {
        speaker: 'A Redbrand Lookout',
        text: "Still here?",
        choices: [
          {
            text: 'What is down this lane?',
            goto: 'lane',
          },
          {
            text: 'Slip past him. [Stealth 13]',
            success: 'past',
            failure: 'caught',
          },
          {
            text: 'Go and look at the well. [gold]5 gp[/]',
            if: { gold: 5 },
            do: [{ gold: -5 }, { flag: 'lookout-bribed' }],
            goto: 'bribed',
          },
          {
            text: 'Where does the tunnel go? [Intimidation 15]',
            success: 'tunnel',
            failure: 'caught',
          },
          {
            text: 'Move him.',
            do: { battle: { monsters: [{ id: 'redbrand-ruffian', count: 2 }], biome: 'city' } },
          },
          { text: 'Look at the well.', cancel: true, goto: 'bye' },
        ],
      },
      lane: {
        speaker: 'A Redbrand Lookout',
        text: "Nothing. That's rather the point of a lane.\n\nHe smiles with about half his face.\n\nBack door of the Giant, three houses that pay on time, and a set of steps that go down. Nothing at all worth a stranger's afternoon.",
        goto: 'hub',
      },
      past: {
        speaker: 'A Redbrand Lookout',
        text: "He is watching the street. The street is where strangers come from.\n\nYou go the other way, over the low wall behind him, and he is still counting when you are three houses down and looking at a set of stone steps that go down into the dark under Tresendar's eastern wall.",
        do: { flag: 'manor-side-entrance' },
      },
      caught: {
        speaker: 'A Redbrand Lookout',
        text: "He is off the wall and whistling before you have finished, and the whistle is answered from inside the taproom.\n\nBad idea. Bad, bad idea.",
        do: { battle: { monsters: [{ id: 'redbrand-ruffian', count: 3 }], biome: 'city' } },
      },
      bribed: {
        speaker: 'A Redbrand Lookout',
        text: "He weighs the coin, decides it is exactly enough, and goes to look at the well.\n\nTen minutes, he says, over his shoulder. And you never saw the steps.",
        do: { flag: 'manor-side-entrance' },
        goto: 'hub',
      },
      tunnel: {
        speaker: 'A Redbrand Lookout',
        text: "The bravado goes out of him all at once and what is left is a frightened man in a dyed cloak.\n\nSteps at the end of the lane. Cellar door, then a passage under the east wall, and there's a crevasse with a bridge that isn't a bridge, and — and don't tell him I said, he'll know it was me, there's only three of us on the lane.\n\nAnd there's a thing in the dark down there that isn't ours. Nobody goes past the crevasse.",
        do: [{ flag: 'manor-side-entrance' }, { flag: 'manor-nothic-warned' }, { quest: 'redbrand-menace' }],
        goto: 'hub',
      },
      bye: {
        speaker: 'A Redbrand Lookout',
        text: "That's it. Everyone likes the well.",
      },
    },
  },

  // =========================================================================
  // 10. THE DENDRAR HOUSE
  // =========================================================================

  // --- Mirna Dendrar: grieving mother, the emerald necklace ----------------
  mirna: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Mirna Dendrar',
        text: "Salt, lamp wicks and plain cloth. That is what there is.\n\nShe says it to the counter rather than to you. The front room is very clean and very nearly empty, and there is a man's coat on a peg by the door that has clearly not been moved in a season.\n\nMirna Dendrar. If you want the cloth measured I will measure it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Mirna Dendrar',
        text: "Was there something?",
        choices: [
          {
            text: 'Salt and wicks. Your price, no haggling.',
            if: { gold: 6 },
            do: [{ gold: -6 }, { give: { id: 'rations', qty: 2 } }, { give: 'candle' }, { rep: { id: 'harpers', amount: 1 } }],
            goto: 'bought',
          },
          { text: 'Whose coat is that?', goto: 'coat' },
          {
            text: 'They took something from you.',
            if: { questNot: 'dendrar-emerald-necklace' },
            do: { quest: 'dendrar-emerald-necklace' },
            goto: 'necklace',
          },
          {
            text: 'We found your necklace.',
            if: { all: [{ quest: 'dendrar-emerald-necklace' }, { item: 'gem-emerald' }] },
            do: [{ take: 'gem-emerald' }, { complete: 'dendrar-emerald-necklace' }, { rep: { id: 'harpers', amount: 2 } }],
            goto: 'returned',
          },
          {
            text: 'Nars has no marker.',
            if: { flag: 'redbrands-broken' },
            do: { quest: 'nars-grave' },
            goto: 'grave',
          },
          { text: 'Nothing today.', cancel: true, goto: 'bye' },
        ],
      },
      bought: {
        speaker: 'Mirna Dendrar',
        text: "She measures it out exactly, and wraps it properly, and takes the coin, and her hands are entirely steady until the moment the money is in the drawer.\n\nThank you.\n\nIt is the first sale she has made in nine days and everyone in the room knows it, including Nilsa, who is watching from the stairs and has not blinked.",
        goto: 'hub',
      },
      coat: {
        speaker: 'Mirna Dendrar',
        text: "My husband's. Nars.\n\nShe does not look at it.\n\nHe was a tailor and he made it himself and it is the best-made thing in this house. He said one true thing about the Redbrands in the street, in daylight, where people could hear, and they hanged him for it in front of the well.\n\nNobody moved. I do not blame them and I have stopped being able to look at them.",
        do: { flag: 'nars-story-heard' },
        goto: 'hub',
      },
      necklace: {
        speaker: 'Mirna Dendrar',
        text: "An emerald necklace. My grandmother's, out of Neverwinter, and it was the only thing this family had that was worth anything at all.\n\nI gave it to them. That is the part people get wrong — they did not take it, I carried it out to them, because they had come for Nilsa, and I had one thing left to trade and I traded it.\n\nIt is in that manor somewhere. I do not expect it back. I would simply like to stop thinking about where it is.",
        goto: 'hub',
      },
      returned: {
        speaker: 'Mirna Dendrar',
        text: "She does not take it at first. She puts both hands flat on the counter and looks at it and does not take it.\n\nThen she does, and she is not steady at all, and Nilsa is down the stairs and into her before either of them can decide not to.\n\nMy grandmother wore this out of Neverwinter the year the city burned.\n\nGo — go and sit down, both of you, there is stew and there is bread and I will not hear a word about it. You will eat in my house.",
        do: [{ give: 'potion-greater-healing' }, { flag: 'dendrar-repaid' }],
        goto: 'hub',
      },
      grave: {
        speaker: 'Mirna Dendrar',
        text: "There is no marker. They would not let us cut one, and afterwards I could not — \\pI could not ask anybody, because asking meant saying it out loud in a shop.\n\nHe is under the elm on the north side, three paces from the wall, and Nilsa knows exactly where because she counted.\n\nA stone. Just a stone with the name on it. He was a tailor. He would want it neat.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Mirna Dendrar',
        text: "The cloth is a fair price. Everything in here is a fair price.",
      },
    },
  },

  // --- Nilsa Dendrar: twelve, furious, out of tears -------------------------
  nilsa: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Nilsa Dendrar',
        text: "You have got swords.\n\nShe is twelve and she is standing on the stairs and she has not blinked since you came in.\n\nSo are you going to use them or are you going to be like everybody else in this town and stand in a doorway and be very sorry.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Nilsa Dendrar',
        text: "Well?",
        choices: [
          { text: 'Tell me what you saw.', goto: 'saw' },
          { text: 'What will you do when you are grown?', goto: 'grown' },
          {
            text: 'We are going to use them.',
            do: { flag: 'nilsa-promised' },
            goto: 'promise',
          },
          {
            text: 'It is done. They are finished.',
            if: { flag: 'redbrands-broken' },
            do: [{ quest: 'nilsas-courage' }, { rep: { id: 'gauntlet', amount: 1 } }],
            goto: 'after',
          },
          { text: 'Say nothing.', cancel: true, goto: 'bye' },
        ],
      },
      saw: {
        speaker: 'Nilsa Dendrar',
        text: "All of it.\n\nFlat. Completely flat.\n\nSix of them. The one with the notched sword did the rope. My mother went out with the necklace and gave it to them so they would go away from me, and they took it and they did it anyway, and then they went and drank at the Sleeping Giant.\n\nI counted their faces. I have got all six.",
        do: { flag: 'nilsa-witness' },
        goto: 'hub',
      },
      grown: {
        speaker: 'Nilsa Dendrar',
        text: "Kill every Redbrand in Faerûn.\n\nShe says it the way another child would say be a baker, and she means it exactly that literally, and that is the frightening part.\n\nI am twelve. That is eight years. They will still be somewhere.",
        choices: [
          {
            text: 'Then learn properly. [Persuasion 15]',
            success: 'taught',
            failure: 'grown-no',
          },
          { text: 'Eight years is a long time to carry that.', goto: 'grown-no' },
          { text: 'Say nothing.', goto: 'hub' },
        ],
      },
      taught: {
        speaker: 'Nilsa Dendrar',
        text: "She listens all the way through, which nobody has expected of her in a season.\n\nProperly.\n\nA very long pause, and then, for the first time, something in her face moves.\n\nThe guard woman at the hall. Kerri. She was in the doorway with the bolt across it and she was crying about it afterwards where she thought nobody could see. \\pShe would teach me. If somebody asked her.\n\nWould you ask her?",
        do: [{ flag: 'nilsa-apprenticed' }, { quest: 'nilsas-courage' }],
        goto: 'hub',
      },
      'grown-no': {
        speaker: 'Nilsa Dendrar',
        text: "Everybody says that.\n\nShe goes back up two stairs and stays there.\n\nEverybody says it and then they go home to houses with everybody in them.",
        goto: 'hub',
      },
      promise: {
        speaker: 'Nilsa Dendrar',
        text: "The one with the notched sword did the rope.\n\nShe says it immediately, as though she has been holding it ready for a season for anybody who would take it.\n\nHe has got a scar across his knuckles and he drinks in the corner nearest the fire. That is what I have got. That is all I have got, so use it.",
        goto: 'hub',
      },
      after: {
        speaker: 'Nilsa Dendrar',
        text: "All six?\n\nShe makes you say it again. Then she makes you say it a third time, with the faces, and she checks them off against something behind her eyes and gets to the end of the list.\n\nThen she sits down on the stairs, quite suddenly, and puts her head on her knees, and for the first time since Eleint the girl cries like a twelve-year-old.\n\nFrom the shop, Mirna Dendrar says her daughter's name once and does not manage to say anything else.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Nilsa Dendrar',
        text: "The corner nearest the fire. Do not forget it.",
      },
    },
  },

  // =========================================================================
  // 11. THE ROCKSEEKERS AND THE MINE
  // =========================================================================

  // --- Gundren Rockseeker: gruff, excited, secretive -----------------------
  gundren: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Gundren Rockseeker',
        text: "There y'are! \\pThere y'are, and I'll not have any nonsense about it — that's my hand, take it, and take it properly.\n\nThe beard is a briar and the grip could crack walnuts and he has, by the look of him, been in a goblin cage for a tenday and got over it entirely.\n\nGundren Rockseeker. And before y'ask: no. I'm not telling you where it is.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Gundren Rockseeker',
        text: "Well? Out with it.",
        choices: [
          { text: 'Where is what, exactly?', goto: 'coy' },
          { text: 'Tell me about Wave Echo Cave.', goto: 'cave' },
          { text: 'Where are your brothers?', goto: 'brothers' },
          { text: 'Who is the Black Spider?', goto: 'spider' },
          {
            text: 'We will find Tharden and Nundro.',
            if: { questNot: 'rockseeker-brothers' },
            do: { quest: 'rockseeker-brothers' },
            goto: 'brothers-quest',
          },
          {
            text: 'Take us to the mine, Gundren.',
            if: { flag: 'glasstaff-defeated' },
            do: { quest: 'wave-echo-cave' },
            goto: 'mine',
          },
          {
            text: 'Just tell me where it is. [Persuasion 18]',
            success: 'told',
            failure: 'not-told',
          },
          {
            // A charmed Gundren Rockseeker cannot keep a secret from a friend,
            // and a Rockseeker counts everyone he likes as a friend anyway.
            text: 'Gundren. Old friend. Where is the mine? [Charmed]',
            if: { charmed: true },
            goto: 'told',
          },
          { text: 'Later, master dwarf.', cancel: true, goto: 'bye' },
        ],
      },
      coy: {
        speaker: 'Gundren Rockseeker',
        text: "Where is WHAT. Ha!\n\nHe is delighted with you.\n\nY'see, that's the game. Half this town thinks I found a seam. The other half thinks I found nothing and I'm covering. And I'll tell you plain, because you pulled me out of a cage and I'm not an ingrate:\n\nIt's neither. We found the door.",
        do: { flag: 'gundren-teasing' },
        goto: 'hub',
      },
      cave: {
        speaker: 'Gundren Rockseeker',
        text: "Wave Echo Cave. The Lost Mine of Phandelver.\n\nHe lowers his voice, which for Gundren Rockseeker means the next table can hear him instead of the whole room.\n\nFive hundred years back, dwarves and gnomes and human wizards worked the one seam together — the Phandelver's Pact. And down in the deep of it they raised the Forge of Spells, where a smith and a mage together could put enchantment into steel while it was still hot.\n\nThen something came up out of the dark and the Pact ended in one night and nobody's found the place since. Till us.",
        do: { flag: 'wave-echo-lore' },
        goto: 'hub',
      },
      brothers: {
        speaker: 'Gundren Rockseeker',
        text: "Tharden and Nundro went ahead to hold the entrance while I rode for Phandalin with the map.\n\nThe delight goes off him.\n\nThat was three tendays. Then the Cragmaws took me on the Trail — took me and took the map, and goblins don't ambush a man for a piece of paper unless somebody's told them the paper's worth it.\n\nMy brothers are sitting on a hole in the ground that somebody else now has directions to.",
        goto: 'hub',
      },
      'brothers-quest': {
        speaker: 'Gundren Rockseeker',
        text: "Aye. \\pAye, y'will.\n\nHe grips your arm hard enough to leave marks and does not apologise for it.\n\nNundro's the young one and he'll be arguing with somebody about ore quality even now, that's how y'll know him. Tharden's the quiet one and he'll not have run.\n\nBring me my brothers. The mine can rot. Bring me my brothers.",
        goto: 'hub',
      },
      spider: {
        speaker: 'Gundren Rockseeker',
        text: "A name I heard through a sack over my head, and I heard it more'n once, and every time I heard it the goblins went quiet.\n\nHe rubs at his wrists.\n\nDrow, they say. Comes up out of the Underdark and hires the surface for coin. He wants the Forge, and he doesn't want it for smithing.\n\nAnd he's got my map, which had my brothers' position marked on it in my own hand.",
        do: { flag: 'black-spider-heard' },
        goto: 'hub',
      },
      told: {
        speaker: 'Gundren Rockseeker',
        text: "He looks at you for a long, long moment. Then he laughs, once, like a rock splitting.\n\nY'know what? Aye. Y'pulled me out of a cage and y'stood up to a wizard and I'd be a poor sort of dwarf to keep it now.\n\nSouth-east of Phandalin, under the shoulder of the mountain, where the stream comes out of the hill and goes back into it again. That's why they called it Wave Echo — put your ear to the rock and it's the sea down there, five hundred years and eighty miles from any sea.\n\nDon't make me regret it.",
        do: [{ flag: 'wave-echo-located' }, { quest: 'wave-echo-cave' }],
        goto: 'hub',
      },
      'not-told': {
        speaker: 'Gundren Rockseeker',
        text: "No.\n\nEntirely cheerful. Entirely immovable.\n\nI liked you before y'asked and I like you now. But the last person who got that out of me got it with a sack over my head, and I've had a think about my habits since.",
        goto: 'hub',
      },
      mine: {
        speaker: 'Gundren Rockseeker',
        text: "The wizard's dead and the red cloaks are burned and my brothers are still up that hill.\n\nHe is already pulling his pack on.\n\nSo we go. Today. Me in front, because it's my mine, and you behind, because it's your swords, and if anybody says otherwise they can take it up with a Rockseeker.\n\nSouth-east. Under the mountain shoulder. And put your ear to the rock when we get there — it's worth the walk on its own.",
        do: { flag: 'wave-echo-located' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Gundren Rockseeker',
        text: "Ale's on me. It's always on me. That's the only thing I'll spend it on till the mine's open.",
      },
    },
  },

  // --- Nundro Rockseeker: half-starved and still arguing about ore ---------
  nundro: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Nundro Rockseeker',
        text: "About time. \\pAnd before anybody says anything — the eastern face is not spoil. It is not. I have been telling them for a tenday and they hit me for it, which is not an argument.\n\nHe is chained to a post, he has not eaten properly in three tendays, and he is entirely furious about assay quality.\n\nNundro Rockseeker. Who are you and have you got water.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Nundro Rockseeker',
        text: "Well? Get on with it.",
        choices: [
          {
            text: 'Get those chains off him.',
            do: [{ complete: 'nundros-rescue' }, { flag: 'nundro-freed' }],
            goto: 'freed',
          },
          { text: 'Gundren is alive. He sent us.', goto: 'gundren' },
          { text: 'Where is Tharden?', goto: 'tharden' },
          { text: 'What is down here with you?', goto: 'below' },
          { text: 'Sit tight. We are not done down here.', cancel: true, goto: 'bye' },
        ],
      },
      bye: {
        speaker: 'Nundro Rockseeker',
        text: "Aye. Go on then.\n\nHe settles back against the post and folds his arms, which with the chain on takes some doing.\n\nAnd when you come back past — the eastern face. Look at it yourself. You will see it.",
      },
      freed: {
        speaker: 'Nundro Rockseeker',
        text: "The pin comes out of the ring and the chain goes down and he stands up on legs that have forgotten it.\n\nHe does not thank you. He walks four paces to the eastern face, puts his hand flat on it, and stands there with his back to you for rather a long time.\n\nIt is not spoil, he says, to the rock. It never was.\n\nThen, without turning round: my brother sent you. \\pGood. Good.",
        do: { rep: { id: 'lords-alliance', amount: 2 } },
        goto: 'hub',
      },
      gundren: {
        speaker: 'Nundro Rockseeker',
        text: "Gundren's alive?\n\nEverything else goes out of him at once.\n\nThey told us he was dead. Every day. It was the only thing they bothered saying to us in Common.\n\nHe sits back down on the stone rather heavily.\n\nRight. Right. Then it was worth not signing anything.",
        goto: 'hub',
      },
      tharden: {
        speaker: 'Nundro Rockseeker',
        text: "The long silence tells you before he does.\n\nIn the great cavern. The first day, when they came up through the old workings and we did not know there was a way up through the old workings.\n\nHe was between them and me. That is the whole of it and I have had three tendays to look at it.\n\nDon't tell Gundren in a taproom. Tell him outside, where he can shout.",
        do: { flag: 'tharden-dead' },
        goto: 'hub',
      },
      below: {
        speaker: 'Nundro Rockseeker',
        text: "Bugbears on the door and worse further in, and something that walks the deep galleries that the bugbears will not go near.\n\nAnd the drow. He comes and goes and he does not use the entrance you used.\n\nThe Forge is still down there. That is the thing nobody has grasped — it is still lit. Five hundred years and the Forge of Spells is still lit, and he means to have it, and he is a great deal closer to it than my brother is.",
        do: { flag: 'forge-still-lit' },
        goto: 'hub',
      },
    },
  },

  // --- Droop: a pathetic goblin in broken Common ---------------------------
  droop: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Droop',
        text: "Droop good. Droop very good. Droop not bite.\n\nHe has his hands up by his face and he is watching your weapon hand and not your face.\n\nBoss dead. Other boss dead. All boss dead now, so Droop is — Droop is nobody's. Is that bad? Droop think that maybe is bad.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Droop',
        text: "You want thing? Droop get thing.",
        choices: [
          { text: 'What did you do for the Cragmaws?', goto: 'job' },
          { text: 'What do you know about the Black Spider?', goto: 'spider' },
          {
            text: 'Nobody is going to hit you. Sit down.',
            do: [{ flag: 'droop-kind' }, { rep: { id: 'harpers', amount: 1 } }],
            goto: 'kind',
          },
          {
            text: 'You are free, Droop. Go anywhere you like.',
            if: { questNot: 'droops-freedom' },
            do: { quest: 'droops-freedom' },
            goto: 'free',
          },
          { text: 'Stay out of trouble.', cancel: true, goto: 'bye' },
        ],
      },
      job: {
        speaker: 'Droop',
        text: "Droop carry. Droop fetch. Droop go in hole first, see if hole has bad thing, and if hole has bad thing then everyone know, because Droop shout.\n\nHe says this entirely without self-pity, as a description of a job.\n\nKlarg say Droop is lucky. Droop go in eleven hole and come out of eleven hole. Other goblin go in hole one time.",
        goto: 'hub',
      },
      spider: {
        speaker: 'Droop',
        text: "Sss. \\pDroop not say name in dark place.\n\nHe checks the ceiling. He genuinely checks the ceiling.\n\nBlack Spider come to King Grol. Come at night, come without feet noise. Give gold, take dwarf, take dwarf paper. Say: no one go in cave until Spider say.\n\nGoblin who talk to Spider — Droop count four. Now Droop count none. So Droop not talk to Spider. Droop very careful goblin.",
        do: { flag: 'droop-spider-warning' },
        goto: 'hub',
      },
      kind: {
        speaker: 'Droop',
        text: "He sits. It takes him three tries, because he keeps starting to stand up again.\n\nNobody say sit to Droop before. Say fetch. Say go in hole. Not say sit.\n\nA very long pause, during which he examines the floor with tremendous concentration.\n\nDroop can carry. Droop carry a lot, and Droop know where Cragmaw put shiny in cave, in the wet part, under the flat rock. Droop show. Not for gold. For sit.",
        do: { give: { id: 'gem-malachite', qty: 2 } },
        goto: 'hub',
      },
      free: {
        speaker: 'Droop',
        text: "Free.\n\nHe turns the word over as though it is a rock with something under it.\n\nFree where? Droop go to wood, wolf eat Droop. Droop go to road, man kill Droop. Droop go to goblin, goblin say Droop lost boss and goblin kill Droop.\n\nHe looks up.\n\nDroop stay near you? Not fight. Droop very bad at fight. Droop carry. Droop go in hole first.",
        choices: [
          {
            text: 'You do not have to go in holes any more.',
            do: [{ flag: 'droop-loyal' }, { rep: { id: 'harpers', amount: 1 } }],
            goto: 'loyal',
          },
          { text: 'Then carry, and stay behind us.', do: { flag: 'droop-loyal' }, goto: 'loyal' },
        ],
      },
      loyal: {
        speaker: 'Droop',
        text: "Droop stay. Droop stay behind. Droop very good at behind.\n\nHe follows at exactly eight paces for the rest of the day and stops when you stop, and once, when nobody is looking at him, he practises saying a name that is not a boss's.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Droop',
        text: "Yes. Yes. Droop stay out of trouble. Droop is very good at that one too.",
      },
    },
  },

  // --- Iarno "Glasstaff" Albrek: silky villain, talks his way out ----------
  glasstaff: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Iarno Albrek',
        text: "Do come in. You have made a great deal of noise getting here and I have had time to put the kettle on, metaphorically speaking.\n\nHe is standing quite calmly beside a workbench, and the staff in his hand is glass, and the light through it is doing something the light in this room should not.\n\nIarno Albrek. Formerly of the Lords' Alliance, currently — well. Currently the only person in Phandalin who has actually governed it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Iarno Albrek',
        text: "Now. Before anybody does anything irreversible.",
        choices: [
          { text: 'The Alliance sent you here to build a watch.', goto: 'alliance' },
          { text: 'You hanged a tailor in the street.', goto: 'nars' },
          { text: 'Who is the Black Spider?', goto: 'spider' },
          {
            text: 'What are you offering?',
            goto: 'offer',
          },
          {
            text: 'Surrender to Sildar Hallwinter. [Persuasion 18]',
            success: 'surrender',
            failure: 'fight-talk',
          },
          {
            text: 'He is stalling. Take him. [Insight 14]',
            success: 'caught-stalling',
            failure: 'escapes',
          },
          { text: 'No more talking.', goto: 'fight-talk' },
        ],
      },
      alliance: {
        speaker: 'Iarno Albrek',
        text: "They did. And I did.\n\nHe is entirely unruffled.\n\nI arrived in a town with no law, no wall and no revenue, holding a letter from Waterdeep that everyone here found extremely amusing. So I raised an armed body of men, established a levy sufficient to pay them, and made this town quiet.\n\nThat is a watch and a tax. It is called something uglier when the man doing it wears red, and I have never understood why.",
        goto: 'hub',
      },
      nars: {
        speaker: 'Iarno Albrek',
        text: "A regrettable excess by men who are, I will be the first to say, not of the finest quality available.\n\nSomething flickers and is smoothed over.\n\nBut let us be honest with one another. One tailor, in a street, on one afternoon — against a season in which no caravan has been robbed within a mile of this town and no house has burned.\n\nEvery government in Faerûn is that arithmetic. Mine is simply written on a smaller page.",
        do: { flag: 'glasstaff-unrepentant' },
        goto: 'hub',
      },
      spider: {
        speaker: 'Iarno Albrek',
        text: "Ah. So you have got that far.\n\nFor the first time he glances, very briefly, at the door behind him.\n\nA drow. Nezznar, if you must have it, though the name will do you no good — he has been called the Black Spider since before he came up out of the Underdark and he will be called it after.\n\nHe wanted the Rockseekers found and the Forge of Spells located. I wanted a town. It was a perfectly reasonable arrangement and I am beginning to suspect I was the smaller party in it.",
        do: [{ flag: 'nezznar-named' }, { flag: 'glasstaff-identified' }],
        goto: 'hub',
      },
      offer: {
        speaker: 'Iarno Albrek',
        text: "Everything on that bench, and the correspondence in the strongbox, and a name that Waterdeep will pay a great deal to have.\n\nHe sets the glass staff down on the workbench — slowly, and not quite far enough away from his hand.\n\nAnd the Redbrands disband tonight. I dismiss them, I ride south, and this town gets exactly what it wanted without any of you having to explain to Harbin Wester why there is blood on his street.\n\nYou may even keep the staff. It is really rather good.",
        choices: [
          {
            text: 'Take the deal. Let him ride.',
            do: [{ flag: 'glasstaff-fled' }, { give: 'scroll-magic-missile' }, { gold: 150 }, { complete: 'glasstaff' }],
            goto: 'deal',
          },
          {
            text: 'The letters and the name. [Persuasion 16]',
            success: 'surrender',
            failure: 'escapes',
          },
          { text: 'No.', goto: 'fight-talk' },
        ],
      },
      deal: {
        speaker: 'Iarno Albrek',
        text: "A pleasure. Genuinely — you are the first people in this town to do arithmetic in four months.\n\nHe takes the strongbox key off his own neck, sets it down, and goes out through a door in the panelling that you had not seen.\n\nThe Redbrands are told at dusk. Most of them simply walk away. Two of them do not, and that is the last violent thing that happens in Phandalin for a season.\n\nSomewhere south of Leilon, a wizard begins again.",
        do: { flag: 'redbrands-broken' },
      },
      surrender: {
        speaker: 'Iarno Albrek',
        text: "Hallwinter.\n\nThe smooth thing comes off his face all at once, and what is underneath is a middle-aged man who has not slept.\n\nHe sat on the panel that approved me. Did you know that? He wrote the recommendation.\n\nThe staff goes down on the bench and he steps away from it, and he puts his hands where you can see them without being asked.\n\nThen let it be him and not a magistrate. He at least will understand how a man gets from that letter to this room.",
        do: [{ flag: 'glasstaff-captured' }, { flag: 'redbrands-broken' }, { complete: 'glasstaff' }, { rep: { id: 'lords-alliance', amount: 4 } }],
      },
      'caught-stalling': {
        speaker: 'Iarno Albrek',
        text: "He has been talking towards the door in the panelling for the last two minutes, and his weight is already on the wrong foot.\n\nWhen you move, he is a half-second late, and the glass staff is on the bench and not in his hand.\n\nAh, he says. \\pWell.",
        do: [{ flag: 'glasstaff-cornered' }, { flag: 'glasstaff-identified' }],
        goto: 'fight-talk',
      },
      escapes: {
        speaker: 'Iarno Albrek',
        text: "Do give my regards to Sildar.\n\nThe glass staff comes up, the room goes white, and the panelling door is shutting before your eyes have finished with the light.\n\nWhat is left is a workbench, a strongbox, and a bolt-hole running east under the rise — and every letter in it signed in a careful Waterdhavian hand.",
        do: [{ flag: 'glasstaff-fled' }, { flag: 'glasstaff-identified' }, { give: 'parchment' }],
      },
      'fight-talk': {
        speaker: 'Iarno Albrek',
        text: "A pity. You had the makings of the sensible sort.\n\nHe lifts the glass staff, and the light in the room stops behaving.",
        do: { battle: { monsters: [{ id: 'redbrand-ruffian', count: 2 }], boss: true, biome: 'dungeon' } },
      },
    },
  },

  // =========================================================================
  // 12. PHANDALIN TOWNSFOLK
  // =========================================================================

  // --- Freda, the stubborn prospector --------------------------------------
  freda: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Freda',
        text: "If you are from the Exchange you can turn round.\n\nShe has a pan in one hand and two years of foothill gravel under her nails.\n\nFreda. I had a loom and a house and now I have a claim in the foothills and a stubbornness problem. Ask anybody. They all say it in the same tone.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Freda',
        text: "Well?",
        choices: [
          {
            text: 'What happened with your claim?',
            if: { questNot: 'fredas-claim' },
            do: { quest: 'fredas-claim' },
            goto: 'claim',
          },
          { text: 'Why give up the loom?', goto: 'loom' },
          { text: 'Is there anything in these hills at all?', goto: 'hills' },
          {
            text: 'Here — for the next season. [gold]20 gp[/]',
            if: { gold: 20 },
            do: [{ gold: -20 }, { flag: 'freda-staked' }, { rep: { id: 'harpers', amount: 1 } }],
            goto: 'staked',
          },
          { text: 'Good luck with the gravel.', cancel: true, goto: 'bye' },
        ],
      },
      claim: {
        speaker: 'Freda',
        text: "Assayed worthless. In writing, on Exchange paper, in Halia Thornton's own hand.\n\nShe scrapes the pan clean rather harder than it needs.\n\nAnd I have washed that gravel with my own eyes for two years and there is colour in it. Not a fortune. Colour. Enough to work, enough to live, enough that worthless is not the word an honest assayer would write.\n\nGet me a second assay. Anywhere but here. Neverwinter, Leilon, a dwarf with a scale in a tent, I do not care.",
        goto: 'hub',
      },
      loom: {
        speaker: 'Freda',
        text: "Because a weaver in Phandalin makes cloth for four hundred people and there are three weavers.\n\nShe shrugs, entirely without self-pity.\n\nEverybody said the mine was coming back. Everybody sold up and bought a pick, including me, and then the mine did not come back and half of them went home and I did not have one to go to.\n\nSo. Gravel.",
        goto: 'hub',
      },
      hills: {
        speaker: 'Freda',
        text: "There is silver in these hills and it is all under one mountain and the Rockseekers found the door to it.\n\nShe says this flatly, as fact.\n\nThe rest of us are washing the crumbs that came down the streams in four hundred years of weather. That is not prospecting, that is scavenging with better manners, and every one of us knows it and none of us will say it out loud.",
        goto: 'hub',
      },
      staked: {
        speaker: 'Freda',
        text: "She looks at the coin in her palm for rather a long time and does not close her hand on it.\n\nThat is a season. That is a whole season.\n\nAnd then, because she cannot help it:\n\nI will pay it back in silver. Not in thanks. Silver. Write your name somewhere so I can find you.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Freda',
        text: "It is not worthless. Somebody is going to be sorry about that eventually.",
      },
    },
  },

  // --- Narth, the grumbling farmer -----------------------------------------
  narth: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Narth',
        text: "Rain in Mirtul. Rain in MIRTUL. Forty years I have worked this strip and I have never once had rain in Mirtul that did any good to anybody.\n\nHe does not appear to have noticed you arriving, or to require you for the conversation.\n\nAnd the barley is thin, and the Trail is shut, and there is a thing walking my field at night.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Narth',
        text: "You still there?",
        choices: [
          {
            text: 'A thing walking your field?',
            if: { questNot: 'narths-scarecrows' },
            do: { quest: 'narths-scarecrows' },
            goto: 'scarecrows',
          },
          { text: 'How is the barley, really?', goto: 'barley' },
          { text: 'Forty years — you have seen this town change.', goto: 'years' },
          { text: 'Mind the rain.', cancel: true, goto: 'bye' },
        ],
      },
      scarecrows: {
        speaker: 'Narth',
        text: "Turned round. Every one of them, facing the wrong way of a morning, and I set them all facing the road myself.\n\nHe stops grumbling, which is more alarming than the grumbling.\n\nFirst tenday I thought it was the Stonehill boy. Second tenday I sat up with a lamp and I did not see anything and in the morning they were all facing the treeline.\n\nAnd there is a track through the barley. Small. Bare feet, if feet is the word, and there is no toe on it that I know.",
        do: { flag: 'narth-tracks' },
        goto: 'hub',
      },
      barley: {
        speaker: 'Narth',
        text: "Thin. And do not tell me it is the rain, I said it was the rain to be sociable.\n\nHe pulls a head and rolls it between his palms.\n\nIt is thin on the eastern strip and only the eastern strip, and the eastern strip is the one nearest the wood. Things have come out of that wood since the mountain blew, and every year they come a little further, and every year I put the fence back a little nearer the house.",
        goto: 'hub',
      },
      years: {
        speaker: 'Narth',
        text: "Seen it burned, seen it rebuilt, seen it fill up with fools carrying picks and empty out again.\n\nHe leans on the fork.\n\nHere is the thing nobody wants told: this town has never once looked after itself. It waits. It waited for the Pact, it waited for the mine, it waited for a townmaster from Waterdeep, and now it is waiting for you.\n\nAnd when you go it will wait for the next lot. That is Phandalin.",
        do: { flag: 'narth-lecture' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Narth',
        text: "Rain in Mirtul. There is no sense in it at all.",
      },
    },
  },

  // --- Favric, who will bet on anything ------------------------------------
  favric: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Favric',
        text: "Two coppers says you are here about the Redbrands.\\p Two more says you are going up that hill before Tenthday.\n\nHe is enormous, cheerful, covered in pine resin, and has already got a hand out.\n\nFavric. I cut timber and I take wagers, and there is more money in the second one, which tells you everything about Phandalin.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Favric',
        text: "Go on, then. Name a thing and I will price it.",
        choices: [
          {
            text: 'What are the odds on us?',
            if: { questNot: 'favrics-wager' },
            do: { quest: 'favrics-wager' },
            goto: 'odds',
          },
          {
            text: 'Arm-wrestle for it. [Athletics 15]',
            success: 'won',
            failure: 'lost',
          },
          { text: 'What about the palisade timber?', goto: 'timber' },
          { text: 'What is the book on the Redbrands?', goto: 'book' },
          { text: 'No wagers today.', cancel: true, goto: 'bye' },
        ],
      },
      odds: {
        speaker: 'Favric',
        text: "Honestly? Four to one against, and I am being kind because you are standing here.\n\nHe is entirely good-natured about it.\n\nSix parties have come through since Eleint. Two went east and did not come back, three went home, and one is drinking at the Giant and has been for a tenday.\n\nBut I will lay you a wager on your own account, at your odds, and if you win I pay in coin and if I win I get to tell the story in the taproom for the rest of my life. That is the wager. That is always the wager.",
        goto: 'hub',
      },
      won: {
        speaker: 'Favric',
        text: "The table goes over. Favric looks at his own arm as though it has personally betrayed him, and then roars with laughter and picks up the table.\n\nRight! Right. Three to one, then, and I have moved the book, and half the town has moved with it.\n\nHe pays without being asked, which is the honest thing, and puts a wedge of cheese and a flask on top of it because he is that sort.",
        do: [{ gold: 25 }, { give: 'trail-bread' }, { flag: 'favric-impressed' }],
        goto: 'hub',
      },
      lost: {
        speaker: 'Favric',
        text: "Forty years of pine, friend. Forty years of pine.\n\nHe puts your hand down gently, which is worse.\n\nFive to one now. Do not look at me like that — it is not personal, it is arithmetic, and if you come back having done something about that hill I will move it and I will move it loudly.",
        do: { gold: -5 },
        goto: 'hub',
      },
      timber: {
        speaker: 'Favric',
        text: "Forty foot of palisade, ordered by the townmaster, on the town's account.\n\nHe scratches his beard.\n\nI will cut it the day I am paid for the last lot, which was in Eleasis. That is not spite. I have a wife and a saw and both need feeding.\n\nGet Harbin Wester to settle and there will be a wall on that road inside a tenday. I am fast. Ask anybody. Two coppers says I am fast.",
        do: { flag: 'favric-timber-terms' },
        goto: 'hub',
      },
      book: {
        speaker: 'Favric',
        rumor: true,
        text: "The book on the red cloaks moves every day and I do not much like the direction. But the taproom talks and I write it down, and here is today's line.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Favric',
        text: "Two coppers says you come back.",
      },
    },
  },

  // --- Mosk, the quiet miner -----------------------------------------------
  mosk: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Mosk',
        text: "Mm.\n\nHe is soot-dark to the elbows and does not stop sorting the day's haul into two piles, one of which is very much smaller.\n\nAfter a while, without looking up: Mosk. Shallow diggings. It is not much of a living and it is a living.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Mosk',
        text: "Something?",
        choices: [
          {
            text: 'Your pick is finished.',
            if: { questNot: 'mosks-pick' },
            do: { quest: 'mosks-pick' },
            goto: 'pick',
          },
          { text: 'What does Halia pay you?', goto: 'halia' },
          { text: 'What is down the shallow workings?', goto: 'workings' },
          { text: 'Good digging.', cancel: true, goto: 'bye' },
        ],
      },
      pick: {
        speaker: 'Mosk',
        text: "Aye.\n\nHe holds it up. The head is a wreck and the haft has been spliced twice.\n\nSmith in Neverwinter would re-steel it for eight gold. Coster would sell me a new one for twelve and it would be a worse pick, because that head is Mirabar iron and there is none of it coming south any more.\n\nI have not got eight gold. I have got this and my hands.",
        goto: 'hub',
      },
      halia: {
        speaker: 'Mosk',
        text: "Whatever she names.\n\nThe sorting does not stop.\n\nI took a bag to Neverwinter once. Walked it. Four days each way, and I got near double what the Exchange gives, and then I worked out the days I did not dig and it came out level.\n\nThat is not an accident. She has done that sum too, and she has done it better than me, and she prices exactly to it.",
        do: { flag: 'mosk-exchange-prices' },
        goto: 'hub',
      },
      workings: {
        speaker: 'Mosk',
        text: "Old galleries. Netherese, some of them, older than the Pact, and the dwarves cut through them and did not much like what they found.\n\nHe finally looks up.\n\nThere is dressed stone under this town. Floors. Doors with lintels. I have put a pick through a wall at eleven feet and had cold air come out of it, and I bricked it up and I have not been back to that face.\n\nWhatever Phandalin is standing on, it was somebody's before it was ours.",
        do: { flag: 'netherese-under-town' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Mosk',
        text: "Mm.",
      },
    },
  },

  // --- The Stray: a yellow dog, wordless -----------------------------------
  'phandalin-stray': {
    start: 'n1',
    nodes: {
      n1: {
        speaker: 'The Stray',
        text: "A lean yellow dog crosses the street at an angle designed to look accidental, and arrives at your knee.\n\nShe belongs to the whole of Phandalin and to nobody, and she is carrying something in her mouth that is longer than she is and very clearly should not be hers.",
        choices: [
          { text: 'See what she has got.', goto: 'n2' },
          { text: 'Throw a stick for her.', goto: 'n3' },
          { text: 'Let her get on with it.', cancel: true },
        ],
      },
      n2: {
        speaker: 'The Stray',
        text: "It is a bone, and it is not a beef bone, and one end of it has been cut rather than broken.\n\nShe drops it at your feet with enormous ceremony, backs off two steps, and looks from you to it and back, waiting to see whether you are going to be sensible about this.",
        do: [{ flag: 'stray-bone-found' }, { quest: 'the-strays-bone' }],
      },
      n3: {
        speaker: 'The Stray',
        text: "She watches the stick go, watches it land, and looks back at you with an expression of frank disappointment in your priorities.\n\nThen she goes and gets it anyway, because she is a dog, and returns it with the air of someone humouring a slow child.",
        do: { flag: 'stray-friend' },
      },
    },
  },

  // --- Rowan Buckman, terror of the town well ------------------------------
  rowan: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Rowan Buckman',
        text: "Halt.\n\nShe is nine. She has a stick. She has taken up a position between you and the well and she is entirely serious.\n\nAre you a hero or are you a Redbrand. Because they wear red and you are not wearing red, but Bree says that is exactly what a clever Redbrand would do.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Rowan Buckman',
        text: "Well?",
        choices: [
          { text: 'A hero, obviously.', goto: 'hero' },
          { text: 'What would a hero have to do?', goto: 'test' },
          {
            text: 'Solemnly present your sword hilt-first.',
            do: { flag: 'rowan-sworn' },
            goto: 'sworn',
          },
          { text: 'Neither. Move.', goto: 'neither' },
          { text: 'Carry on, sentry.', cancel: true, goto: 'bye' },
        ],
      },
      bye: {
        speaker: 'Rowan Buckman',
        text: "She does not answer. She has gone back to watching the road, both hands on the stick, in the exact posture of somebody who has decided that the well is her responsibility now.",
      },
      hero: {
        speaker: 'Rowan Buckman',
        text: "That is what a Redbrand would say.\n\nShe does not lower the stick.\n\nBut you did not push me over, and they push you over, so. \\pProvisional. You are provisionally a hero and I am watching.",
        goto: 'hub',
      },
      test: {
        speaker: 'Rowan Buckman',
        text: "Go up the hill and make them stop.\n\nAll the theatre goes out of it and she says it perfectly plainly.\n\nThat is the whole thing. Everyone in this town says a lot of words and nobody goes up the hill. Nilsa's da went out in the street and he did not even have a stick.",
        do: { flag: 'rowan-serious' },
        goto: 'hub',
      },
      sworn: {
        speaker: 'Rowan Buckman',
        text: "She goes absolutely rigid. She has clearly imagined this precise moment several hundred times and has not prepared for it actually happening.\n\nThen she touches the hilt with two fingers, very gravely, and steps aside from the well, and salutes with the stick.\n\nYou may pass. \\pThe well is secure. It has been secure all day.",
        goto: 'hub',
      },
      neither: {
        speaker: 'Rowan Buckman',
        text: "That is EXACTLY what a Redbrand would say.\n\nShe retreats to a defensive position behind the well trough and continues the surveillance from there.",
        goto: 'hub',
      },
    },
  },

  // --- Bree Tealeaf, braver than she lets on -------------------------------
  bree: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Bree Tealeaf',
        text: "Do not tell Rowan I talked to you.\n\nShe is a head shorter than every other child in Phandalin and considerably harder to alarm.\n\nBree Tealeaf. Rowan does the shouting and the stick. I do the finding out. It works very well and she does not know about it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Bree Tealeaf',
        text: "So?",
        choices: [
          { text: 'What have you found out?', goto: 'found' },
          {
            text: 'You have been in that tunnel. [Insight 13]',
            success: 'tunnel-yes',
            failure: 'tunnel-no',
          },
          { text: 'Is Carp Alderleaf all right?', goto: 'carp' },
          { text: 'Keep your ears open.', cancel: true, goto: 'bye' },
        ],
      },
      found: {
        speaker: 'Bree Tealeaf',
        text: "The red cloak men go into the burnt house and come out at the lane by the Giant, and that is a long way apart to be the same building.\n\nShe counts on her fingers with great precision.\n\nThere are eleven of them, not six, and everybody says six. And one of them is not one of them. He does not drink with them and he comes out at night and he is not wearing a cloak, he is wearing a good coat.",
        do: { flag: 'bree-count' },
        goto: 'hub',
      },
      'tunnel-yes': {
        speaker: 'Bree Tealeaf',
        text: "She considers denying it, decides you are not worth the effort of a lie, and shrugs.\n\nTwice. Carp only went once and then he heard the voice and would not go again, and I went back on my own to see whether the voice was a real one.\n\nIt is a real one. It is not a person. It says your name and it sounds pleased about knowing it, and there is a crack in the floor down there with a bridge across it made of a plank.\n\nI did not go past the plank. I am brave, not stupid.",
        do: [{ flag: 'manor-tunnel-known' }, { flag: 'manor-nothic-warned' }],
        goto: 'hub',
      },
      'tunnel-no': {
        speaker: 'Bree Tealeaf',
        text: "What tunnel.\n\nShe holds your eye for slightly too long, entirely unbothered, and then goes to look at something else with great casualness.",
        goto: 'hub',
      },
      carp: {
        speaker: 'Bree Tealeaf',
        text: "No.\n\nThe first entirely straight answer she has given you.\n\nHe has not been past the eastern rise since Tenthday and he does not sleep with the shutter open any more, and his mother thinks he is being difficult.\n\nSomebody should tell her. I cannot tell her, because then I have to say how I know.",
        do: { flag: 'qelline-carp-worried' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Bree Tealeaf',
        text: "I always do. That is the whole job.",
      },
    },
  },

  // =========================================================================
  // 13. THE TRIBOAR TRAIL AND THE HIGH ROAD
  // =========================================================================

  // --- Ivor Marsk, travelling peddler --------------------------------------
  ivor: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ivor Marsk',
        text: "Friend! Friend, you have the look of somebody who has just realised they forgot something.\n\nThe handcart is already open. It was open before you were close enough to speak to.\n\nIvor Marsk. Eleven years on this road and never robbed once, which is either luck or judgement and I let people choose.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ivor Marsk',
        text: "So. What did you forget?",
        choices: [
          { text: 'Show me the cart.', do: { shop: 'barthens-provisions' }, goto: 'hub' },
          { text: 'Never robbed? On this road?', goto: 'robbed' },
          { text: 'What is the road like ahead?', goto: 'road' },
          {
            text: 'You have lost a wagon, have you not?',
            if: { questNot: 'peddlers-lost-wagon' },
            do: { quest: 'peddlers-lost-wagon' },
            goto: 'wagon',
          },
          { text: 'Safe travels, peddler.', cancel: true, goto: 'bye' },
        ],
      },
      robbed: {
        speaker: 'Ivor Marsk',
        text: "Never once!\n\nA slight pause, and the wheedling drops off a notch.\n\nWell. Never robbed of anything I minded. A goblin took eleven feet of ribbon off this cart in Eleint and I let him have it, because a goblin walking away with ribbon is a goblin not walking towards me.\n\nThat is the trick of the road and you may have it for nothing. Always carry something you can afford to lose in the outside pocket.",
        do: { flag: 'ivor-road-wisdom' },
        goto: 'hub',
      },
      road: {
        speaker: 'Ivor Marsk',
        rumor: true,
        text: "Ahead? Ahead is where I have just come from, and I will tell you exactly what is in it, because a peddler with a reputation for honest roads eats better than one with a reputation for bargains.",
        goto: 'hub',
      },
      wagon: {
        speaker: 'Ivor Marsk',
        text: "Ah. \\pYou have been talking to somebody.\n\nHe shuts the cart, which is the first time he has done that.\n\nA wagon, yes. Mine, once, before the knee. Left it at the stream cut two seasons back with a broken axle and a promise to come back for it, and I have been past that spot forty times since and never once stopped.\n\nThere is a strongbox under the seat. Nothing valuable. Only everything I had before I had a handcart.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ivor Marsk',
        text: "Something in the outside pocket, friend. Always something in the outside pocket.",
      },
    },
  },

  // --- Ceidil Pashar, pilgrim of Ilmater -----------------------------------
  ceidil: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Ceidil Pashar',
        text: "Peace on the road. Sit if you are tired, and if you are hurt, sit whether you are tired or not.\n\nShe is walking from Waterdeep to Leilon barefoot, which she will explain is the point, and her feet are exactly as bad as that suggests.\n\nCeidil Pashar. I bind wounds and I ask for the news, and the news is the only payment I take.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Ceidil Pashar',
        text: "What has the road done to you?",
        choices: [
          {
            text: 'We are hurt. Bind us up.',
            do: { heal: { minutes: 60 } },
            goto: 'bound',
          },
          { text: 'Why barefoot?', goto: 'barefoot' },
          { text: 'Tell me about Ilmater.', goto: 'ilmater' },
          {
            text: 'The road ahead is not safe for you.',
            if: { questNot: 'pilgrims-road' },
            do: { quest: 'pilgrims-road' },
            goto: 'danger',
          },
          { text: 'Peace on your road.', cancel: true, goto: 'bye' },
        ],
      },
      bound: {
        speaker: 'Ceidil Pashar',
        text: "She works quickly and without ceremony, and she is very good, and she talks the whole time about nothing at all so that you have something other than the wound to attend to.\n\nThere. The Crying God does not take the hurt away. He sits with you in it until it is over. That is the whole doctrine and people find it disappointing.\n\nNow. The news, if you please. That is my fee and I collect it strictly.",
        goto: 'hub',
      },
      barefoot: {
        speaker: 'Ceidil Pashar',
        text: "Because the road hurts, and Ilmater's people do not step over the hurting.\n\nShe says it entirely without piety, the way one explains a rota.\n\nI could ride. I could ride from Waterdeep to Leilon in six days and arrive fresh and useless. Instead I walk, and I arrive slowly, and on the way I meet every wounded carter and every fevered child between the two, because they are all on the road too and none of them are on horses.",
        goto: 'hub',
      },
      ilmater: {
        speaker: 'Ceidil Pashar',
        text: "The Broken God. The One Who Endures. He is the god you get when the other gods have finished and there is still a person on the floor.\n\nHer hands do not stop rolling bandage.\n\nTymora is luck, and I like her very much. Lathander is the dawn, and everybody likes him. Ilmater is the fourth hour of a bad night, and nobody likes him at all until they need him, and then there is nobody else.",
        goto: 'hub',
      },
      danger: {
        speaker: 'Ceidil Pashar',
        text: "The Mere of Dead Men, yes. I know.\n\nShe finishes the roll and ties it off.\n\nLizardfolk in the reeds and lights over the water that are not lights, and the causeway is under a foot of brine at the spring tide. Three pilgrims went that way at Greengrass and one came back.\n\nI am still going. If you are going north as far as Leilon, I would be glad of the company, and you would be glad of me the first time somebody takes an arrow.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Ceidil Pashar',
        text: "Go gently. And if you cannot go gently, come back to me afterwards and I will do what I can.",
      },
    },
  },

  // --- Evendur Greycastle, caravan master ----------------------------------
  evendur: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Evendur Greycastle',
        text: "We stop at dusk. That is not up for discussion, it has never been up for discussion, and the last man who wanted to push on to the milestone is a story I tell at every camp.\n\nHe squints at you, and the squint has twenty years of High Road dust in it.\n\nEvendur Greycastle. Waterdhavian goods, Waterdeep to Triboar, and I have not lost a wagon yet.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Evendur Greycastle',
        text: "What do you want, then?",
        choices: [
          {
            text: 'You are short of guards.',
            if: { questNot: 'caravan-to-triboar' },
            do: { quest: 'caravan-to-triboar' },
            goto: 'guards',
          },
          { text: 'Why never after dark?', goto: 'dark' },
          { text: 'What is the freight?', goto: 'freight' },
          { text: 'Good roads, master.', cancel: true, goto: 'bye' },
        ],
      },
      guards: {
        speaker: 'Evendur Greycastle',
        text: "Short by four. The last four took Lionshield coin because Lionshield pays a half-copper more and does not make them stop at dusk.\n\nHe spits.\n\nEight days to Triboar. You walk beside the wagons, not on them. You take a watch. You do not drink on the road and I will know.\n\nPay on arrival, at the Triboar rate, which is honest, and a bonus if every wagon arrives, which is how I have kept the record.",
        goto: 'hub',
      },
      dark: {
        speaker: 'Evendur Greycastle',
        text: "Because everything on this coast that wants your throat can see in the dark and you cannot.\n\nHe holds up the bad leg by way of exhibit.\n\nMere of Dead Men, Year of the Nether Mountain Scrolls. We pushed on for one hour past the light to make the causeway. I got this. Sixteen other people got worse.\n\nOne hour. That is what an hour past dusk costs on the High Road, and I have been paying it in instalments ever since.",
        do: { flag: 'evendur-mere-story' },
        goto: 'hub',
      },
      freight: {
        speaker: 'Evendur Greycastle',
        text: "Cloth, glass, Waterdhavian wine and one crate I have not opened and am not going to.\n\nHe pats the tailgate.\n\nEvery caravan master carries one of those. You are paid to deliver it, not to be curious about it, and the day you get curious is the day the good contracts stop coming.\n\nIt is not gold. Gold you can feel. This one shifts on its own on the corners.",
        do: { flag: 'evendur-strange-crate' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Evendur Greycastle',
        text: "Camp is at dusk. Whatever you are doing, be inside the wagon ring by then.",
      },
    },
  },

  // --- Taman Helder, the unlucky Lionshield teamster -----------------------
  taman: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Taman Helder',
        text: "If Linene Graywind sent you, tell her I have heard it, tell her I have heard all of it, and tell her the axle is not the point.\n\nHe is fixing a trace that does not need fixing, so that he has something to do with his hands.\n\nTaman Helder. I drive Lionshield wagons out of Yartar and I have lost two in a season and I have not slept properly since the first one.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Taman Helder',
        text: "Well?",
        choices: [
          { text: 'Tell me how they took them.', goto: 'took' },
          {
            text: 'Somebody is telling them which wagon.',
            goto: 'informer',
          },
          {
            text: 'What is this toll they are asking?',
            if: { questNot: 'teamsters-toll' },
            do: { quest: 'teamsters-toll' },
            goto: 'toll',
          },
          { text: 'Mind the axle.', cancel: true, goto: 'bye' },
        ],
      },
      took: {
        speaker: 'Taman Helder',
        text: "Both times at the stream cut. Both times at the same hour of the afternoon. Both times they took the arms crates and left the cloth standing in the road.\n\nHe finally stops fiddling with the trace.\n\nGoblins do not know cloth from steel through a nailed lid. They went straight to the right crates like a man going to his own cupboard.\n\nAnd both times I had told exactly four people what was on the wagon.",
        do: { flag: 'taman-four-people' },
        goto: 'hub',
      },
      informer: {
        speaker: 'Taman Helder',
        text: "Aye. And I have had a season to think about which four.\n\nHe counts them off, flat and unhappy.\n\nLinene, who lost the goods. The Coster clerk in Yartar, who is eighty. The lad at the gate with the chalk, who writes down every wagon that leaves.\n\nAnd the woman at the Exchange, who asked me what was on the wagon while she was weighing my sister's brooch, and who was so pleasant about it that I did not notice she had asked until Marpenoth.",
        do: { flag: 'halia-suspected' },
        goto: 'hub',
      },
      toll: {
        speaker: 'Taman Helder',
        text: "A toll. That is what they are calling it now — a goblin came down the bank with a stick and a bit of Common and asked for a toll.\n\nTwo crates a wagon and the road stays open. And here is the poison in it: it is cheaper than losing the wagon, and every driver on this road can do that sum.\n\nOne of us pays and the road is a tollroad for ever. Somebody has to break it and it cannot be a man with a family and an axle.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Taman Helder',
        text: "The stream cut. Afternoon. If you are going that way, go early or go loud.",
      },
    },
  },

  // --- Silifrey Windrivver, Alliance post rider ----------------------------
  silifrey: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Silifrey Windrivver',
        text: "Make it quick. The mare has run since dawn and I have to be in Neverwinter before the gate.\n\nShe does not dismount. She has not dismounted, you suspect, in some hours.\n\nSilifrey Windrivver, Alliance post. If you are not on fire or carrying a dispatch, I am already leaving.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Silifrey Windrivver',
        text: "Well?",
        choices: [
          {
            text: 'We can carry your Leilon dispatch.',
            if: { questNot: 'leilon-dispatch' },
            do: { quest: 'leilon-dispatch' },
            goto: 'dispatch',
          },
          { text: 'What is the news out of Neverwinter?', goto: 'news' },
          { text: 'Your horse is finished.', goto: 'horse' },
          { text: 'Ride on.', cancel: true, goto: 'bye' },
        ],
      },
      dispatch: {
        speaker: 'Silifrey Windrivver',
        text: "You?\n\nShe looks at you properly for the first time, which takes about a second and a half.\n\nLeilon. Sealed, Alliance cipher, into the hand of the garrison captain and nobody else's. It is four days south on the High Road and the Mere is the middle two of them.\n\nIf you open it, I will know, because the seal is Neverwinter work and it does not lie. If you lose it, do not come back and tell me, just keep going.",
        do: { give: 'parchment' },
        goto: 'hub',
      },
      news: {
        speaker: 'Silifrey Windrivver',
        rumor: true,
        text: "I ride between Leilon and Neverwinter twice a tenday and I hear everything twice. Have it and let me go.",
        goto: 'hub',
      },
      horse: {
        speaker: 'Silifrey Windrivver',
        text: "She is. I know.\n\nThe first crack in the clipped voice.\n\nThere is meant to be a remount station at the Phandalin turning. There has not been one since Eleasis, because the Alliance pays for it out of Neverwinter and Neverwinter is rebuilding a city.\n\nSo it is her legs or nothing, and she has done four hundred miles this tenday, and I have written it in the report every single time.",
        do: { flag: 'silifrey-remount' },
        goto: 'hub',
      },
      bye: {
        speaker: 'Silifrey Windrivver',
        text: "Before the gate.\n\nShe is already gone.",
      },
    },
  },

  // --- The Alliance post horse: wordless -----------------------------------
  'post-horse': {
    start: 'n1',
    nodes: {
      n1: {
        speaker: 'A Very Tired Mare',
        text: "The mare stands with her head low and her sides going, and there is dried salt in white lines down her shoulders where the sweat has come and dried and come again.\n\nShe has run from Leilon since dawn and she would like everyone involved to know it.",
        choices: [
          { text: 'Water her.', goto: 'n2' },
          { text: 'Check her legs.', goto: 'n3' },
          { text: 'Leave her to rest.', cancel: true },
        ],
      },
      n2: {
        speaker: 'A Very Tired Mare',
        text: "She drinks for a very long time, and when she is done she puts her forehead flat against your chest and leaves it there, with the whole weight of her head, and does not move.\n\nFrom the saddle, Silifrey Windrivver says nothing at all, and does not hurry you.",
        do: { flag: 'watered-post-horse' },
      },
      n3: {
        speaker: 'A Very Tired Mare',
        text: "Off fore is hot. Not lame yet — hot, and filling, and another two days of this will make it lame for good.\n\nShe lets you handle it without a sound, which is its own kind of answer.",
        do: { flag: 'post-horse-lame' },
      },
    },
  },

  // =========================================================================
  // 14. NEVERWINTER WOOD, CONYBERRY AND OLD OWL WELL
  // =========================================================================

  // --- Reidoth: terse druid who distrusts adventurers ----------------------
  reidoth: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Reidoth',
        text: "You are loud. The wood does not thank you for it.\n\nHe has been standing there for some time. You did not see him arrive and you are not certain he did.\n\nReidoth. I keep Thundertree. Say what you want and then be quieter about wanting it.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Reidoth',
        text: "Well?",
        choices: [
          { text: 'What happened to Thundertree?', goto: 'thundertree' },
          {
            text: 'Guide us through the wood.',
            if: { questNot: 'thundertree-ruins' },
            do: { quest: 'thundertree-ruins' },
            goto: 'guide',
          },
          {
            text: 'The blights are spreading south.',
            if: { questNot: 'thundertree-blights' },
            do: { quest: 'thundertree-blights' },
            goto: 'blights',
          },
          { text: 'Why do you dislike us?', goto: 'dislike' },
          {
            text: 'What is the Emerald Enclave?',
            goto: 'enclave',
          },
          {
            text: 'The ash and the wood — tell us the rest.',
            if: { faction: 'emerald-enclave', repMin: 5 },
            do: { quest: 'the-ash-and-the-wood' },
            goto: 'ash',
          },
          {
            text: 'Walk with us.',
            if: { flag: 'reidoth-respect' },
            goto: 'join',
          },
          { text: 'We will go quietly.', cancel: true, goto: 'bye' },
        ],
      },
      thundertree: {
        speaker: 'Reidoth',
        text: "Mount Hotenow. Thirty years ago. The mountain came down on Neverwinter and the ash came down on Thundertree, and the people who did not burn walked out and did not come back.\n\nHe says it without any weight at all, which is somehow heavier.\n\nThe wood has been taking it back ever since. That is not a tragedy. That is the wood doing what a wood does.\n\nThe tragedy is what has moved into it while nobody was looking.",
        goto: 'hub',
      },
      guide: {
        speaker: 'Reidoth',
        text: "I will take you as far as the ash line and no further.\n\nA flat stare.\n\nThere is a dragon in the tower on the north side. Green, young, and young for a dragon is still older than everyone you have ever met. She came out of Kryptgarden and she is looking for somewhere to be a dragon in, and Thundertree is quiet and roofless and full of nothing that will complain.\n\nThe cultists in the village have decided this is wonderful. They are wrong in a way that will take them some time to understand.",
        do: { flag: 'venomfang-known' },
        goto: 'hub',
      },
      blights: {
        speaker: 'Reidoth',
        text: "Twig, needle and vine. They came up in the ash where nothing should grow, and they are walking south down the streambeds.\n\nHe crouches and turns over a black stem with one finger.\n\nSomething is seeding them. Not the dragon — a dragon does not garden. Something in the deep pines with a grudge and a great deal of patience.\n\nBurn what you find at the root. Not the stem. The root. And do not carry a cutting home in your boot, which is how they got to the orchard at Phandalin.",
        goto: 'hub',
      },
      dislike: {
        speaker: 'Reidoth',
        text: "I do not dislike you. I have not decided anything about you at all, which you are finding uncomfortable, which is interesting.\n\nHe straightens up.\n\nI dislike what your sort does. You arrive, you kill the visible thing, you take what is portable, and you leave, and the hole you have made in the wood fills with something worse inside a season.\n\nProve me wrong. I have thirty years free.",
        goto: 'hub',
      },
      enclave: {
        speaker: 'Reidoth',
        text: "People who have noticed that the wild is not scenery.\n\nSpringwarden, Summerstrider, Autumnreaver, Winterstalker. I am a Summerstrider, which means I hold ground rather than take it, and I have held this ground for thirty years.\n\nWe are not the Gauntlet. We do not go looking for evil. We go looking for the place where the balance has been pushed over, and then we push back exactly as hard as we were pushed and not one inch harder.\n\nThat last part is the whole discipline and nobody outside the Enclave has ever understood it.",
        do: { flag: 'reidoth-respect' },
        goto: 'hub',
      },
      ash: {
        speaker: 'Reidoth',
        text: "Then you have earned the rest of it, and I did not expect to be saying that.\n\nHe sits, which he has not done.\n\nThe ash is not just ash. There is something under Thundertree that the mountain uncovered — older than the village, older than the Pact at Phandelver. The blights come out of the ground above it and they always come from the same quarter.\n\nI have kept people away from it for thirty years by being unpleasant at them. That has stopped working. Now it needs somebody to go down.",
        do: { rep: { id: 'emerald-enclave', amount: 2 } },
        goto: 'hub',
      },
      join: {
        speaker: 'Reidoth',
        text: "You want me to leave the wood.\n\nA very long pause, filled entirely with wood noises.\n\nA hundred and fifty gold. Not for me — I have no use for it. For the Enclave's people at Leilon, who are replanting the Mere margins with no tools and no seed, and who would weep over a hundred and fifty gold.\n\nAnd you carry your own water. I am not a pack animal and I will not be treated as a guide.",
        choices: [
          {
            text: 'A hundred and fifty to Leilon. Agreed.',
            if: { gold: 150 },
            do: { recruit: 'reidoth' },
            goto: 'joined',
          },
          {
            text: 'Gold does not stop a blight. [Nature 16]',
            success: 'haggle-good',
            failure: 'haggle-bad',
            do: { recruit: { id: 'reidoth', cost: 100 } },
          },
          { text: 'Then keep the wood.', goto: 'hub' },
        ],
      },
      joined: {
        speaker: 'Reidoth',
        text: "Then we go at first light and we go quietly, and you will find that harder than the fighting.\n\nHe picks up the quarterstaff. Nothing else. He has nothing else.",
        goto: 'hub',
      },
      'haggle-good': {
        speaker: 'Reidoth',
        text: "He is silent for long enough that you think you have offended him.\n\nYou are right.\n\nThat is all. He does not elaborate, and he does not look pleased, and he shoulders the staff and waits by the treeline for you to be ready.\n\nA hundred. And I will be reminding you that you said it.",
        goto: 'hub',
      },
      'haggle-bad': {
        speaker: 'Reidoth',
        text: "The blights reach Leilon in a season either way. Gold does not stop a blight. People with seed and tools stop a blight.\n\nHe is entirely unmoved.\n\nA hundred and fifty. I have not named a price in thirty years and I am not going to enjoy negotiating the first one.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Reidoth',
        text: "Quietly. And do not carry anything home in your boot.",
      },
    },
  },

  // --- Agatha: an imperious banshee who answers one question ---------------
  agatha: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Agatha',
        text: "The alders are silent. Nothing sings here and nothing has for a hundred years, and the cold in the grove has a shape.\n\nThen the shape turns, and it is a woman, and she was beautiful once in the way the poems mean it, and she knows exactly what she is now.\n\n[blue]You are living[/], she says. [blue]How very loud of you.[/]",
        goto: 'hub',
      },
      hub: {
        speaker: 'Agatha',
        text: "[blue]Speak, then. I am told the living cannot help it.[/]",
        choices: [
          {
            text: 'Offer her the silver comb.',
            if: { item: 'silver-comb', notFlag: 'agatha-answered' },
            do: { take: 'silver-comb' },
            goto: 'gift',
          },
          {
            text: 'Address her as a great lady. [Persuasion 15]',
            success: 'courted',
            failure: 'rebuffed',
          },
          {
            text: 'A moonstone, my lady. For the grove.',
            if: { item: 'gem-moonstone' },
            do: { take: 'gem-moonstone' },
            goto: 'gift',
          },
          { text: 'What are you?', goto: 'what' },
          {
            text: 'Ask your question.',
            if: { flag: 'agatha-courted', notFlag: 'agatha-answered' },
            goto: 'ask',
          },
          { text: 'Leave the grove.', cancel: true, goto: 'bye' },
        ],
      },
      what: {
        speaker: 'Agatha',
        text: "[blue]A question already. How eager.[/]\n\nThe cold moves a step closer and stops.\n\n[blue]I was Agatha. I kept a house and I was sung about, and I am neither of those and I am still Agatha, which is the part none of you can hold in your heads.[/]\n\n[blue]That was not your question. I do not give them away.[/]",
        goto: 'hub',
      },
      gift: {
        speaker: 'Agatha',
        text: "She does not take it. She looks at it, on your palm, for a very long time.\n\n[blue]Silver. Yes. There was silver.[/]\n\nSomething goes through the grove that is not wind, and for a moment — one moment, and no longer — the cold is not a shape but a woman standing in her own hall with the lamps lit.\n\n[blue]Very well. You have been courteous, and courtesy is the only currency left that I can spend. Ask. Once.[/]",
        do: [{ flag: 'agatha-courted' }, { rep: { id: 'harpers', amount: 1 } }],
        goto: 'hub',
      },
      courted: {
        speaker: 'Agatha',
        text: "[blue]Say that again.[/]\n\nYou say it again. My lady. Of the house that was.\n\nThe grove goes so still that your own pulse is loud in it.\n\n[blue]A hundred years and the priestess of the luck goddess came with a question and no manners, and you come with manners and no question worth the name.[/]\\p [blue]Ask. Once. And ask it well, for I shall not be asked twice.[/]",
        do: { flag: 'agatha-courted' },
        goto: 'hub',
      },
      rebuffed: {
        speaker: 'Agatha',
        text: "[blue]No.[/]\n\nThe word arrives from every direction at once and the alders shed a year of leaves.\n\n[blue]You come into my grove and you speak to me as one speaks to a thing in a grove. Go. Come back when somebody has taught you what I was, and bring silver, and do not raise your voice in here again.[/]",
        do: { flag: 'agatha-offended' },
      },
      ask: {
        speaker: 'Agatha',
        text: "[blue]Bowgentle's book.[/]\n\nShe answers before you have finished, because she has known the question since Sister Garaele stood where you are standing.\n\n[blue]The archmage's spellbook went east out of Conyberry in a raider's saddlebag and it went into the Sword Mountains, and it is in the castle the goblins call Cragmaw, in the hands of a king who cannot read it and will not sell it.[/]\n\n[blue]That is true, and it is all, and it is spent. Go and be loud somewhere else.[/]",
        do: [{ flag: 'agatha-answered' }, { flag: 'bowgentle-book-located' }, { xp: 200 }],
      },
      bye: {
        speaker: 'Agatha',
        text: "[blue]Yes. Go.[/]\n\nNothing sings behind you for a mile.",
      },
    },
  },

  // --- Hamun Kost: coldly polite Red Wizard of Thay -----------------------
  kost: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Hamun Kost',
        text: "That is close enough, and I say so as a courtesy rather than a threat, because the distinction matters to me even if it does not to you.\n\nThe skeletons working the trench do not look up. There are eleven of them and they are lifting Netherese masonry with perfect economy.\n\nHamun Kost, of Thay. You are, I assume, the local response.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Hamun Kost',
        text: "Well. Let us establish terms before anybody is unreasonable.",
        choices: [
          { text: 'What are you digging for?', goto: 'digging' },
          { text: 'Those were people.', goto: 'skeletons' },
          {
            text: 'What are you offering?',
            if: { questNot: 'kosts-bargain' },
            do: { quest: 'kosts-bargain' },
            goto: 'bargain',
          },
          { text: 'Thay is a very long way from here.', goto: 'thay' },
          {
            text: 'Leave Old Owl Well. Now. [Intimidation 17]',
            success: 'yields',
            failure: 'refuses',
          },
          {
            text: 'The Order of the Gauntlet says otherwise.',
            if: { faction: 'gauntlet', repMin: 5 },
            do: { battle: { monsters: [{ id: 'skeleton', count: 4 }], boss: true, biome: 'ruins' } },
          },
          { text: 'Withdraw for now.', cancel: true, goto: 'bye' },
        ],
      },
      digging: {
        speaker: 'Hamun Kost',
        text: "A Netherese watchtower, four thousand years dead, of which this is the foundation course and rather more of the cellar than anyone expected.\n\nHe indicates the trench with the flat of one hand.\n\nNetheril fell out of the sky. What it left in the ground is the only intact corpus of pre-Weave arcana on this continent, and your people have spent a century using it to shelter goats.\n\nI am not stealing anything. I am reading a library that nobody else can be bothered to open.",
        do: { flag: 'kost-purpose' },
        goto: 'hub',
      },
      skeletons: {
        speaker: 'Hamun Kost',
        text: "They were. They are not.\n\nHe says this with the mild patience of a man correcting a unit of measurement.\n\nOrcs, most of them, out of the raid that broke against this hill in Eleint. I did not kill them. I found them. They were going to be nothing at all and instead they are moving three tons of masonry a day.\n\nYou find this distasteful. I find your objection ornamental. We may both be right; it does not affect the trench.",
        goto: 'hub',
      },
      bargain: {
        speaker: 'Hamun Kost',
        text: "There are orcs on Wyvern Tor — the survivors of the same raid, and they come down at night and interfere with my work, and my labourers are not built for a running fight.\n\nDeal with them and I will pay you properly, in coin and in something better than coin.\n\nAnd I will add this, because it costs me nothing: I will be gone by winter. I want a cellar, not a province. Whatever the Order of the Gauntlet has told you about Thayans, I am here for four thousand years of dead grammar and then I am going home.",
        goto: 'hub',
      },
      thay: {
        speaker: 'Hamun Kost',
        text: "It is. Deliberately.\n\nThe first flicker of anything at all.\n\nSzass Tam has a great many Red Wizards and a limited tolerance for those who are more interested in the scholarship than in the — she calls it the enterprise. I am on the Sword Coast because the Sword Coast is where the interesting rubble is, and because nobody in Thay is watching me here.\n\nThat is more candour than you were owed. Do not mistake it for friendship.",
        do: { flag: 'kost-exile' },
        goto: 'hub',
      },
      yields: {
        speaker: 'Hamun Kost',
        text: "He considers you the way a man considers a sum, and then, very slightly, inclines his head.\n\nThe arithmetic is against me. Eleven labourers, one wizard, and however many of you there turn out to be at the moment it matters.\n\nHe raises one hand and the trench stops. All eleven, mid-motion, entirely still.\n\nI shall want a tenday to copy what is exposed. Then the well is yours, the labourers go back in the ground, and you will never hear the name Hamun Kost again. That is a better bargain than either of us deserves.",
        do: [{ flag: 'kost-withdrew' }, { complete: 'old-owl-well' }, { rep: { id: 'gauntlet', amount: 2 } }],
        goto: 'hub',
      },
      refuses: {
        speaker: 'Hamun Kost',
        text: "No.\n\nHe does not raise his voice, and the eleven in the trench put down the masonry at exactly the same moment.\n\nI have been threatened by better and by worse and the distinction has never once altered the outcome. You may leave, or you may join the work-gang. I am indifferent, and I say so as a courtesy.",
        do: { battle: { monsters: [{ id: 'skeleton', count: 5 }], boss: true, biome: 'ruins' } },
      },
      bye: {
        speaker: 'Hamun Kost',
        text: "Sensible. Do give my regards to the old paladin with the apples. He has been meaning to come up here for some time.",
      },
    },
  },

  // =========================================================================
  // 15. NEVERWINTER
  // =========================================================================

  // --- General Sabine, commander of the Neverwinter guard ------------------
  sabine: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'General Sabine',
        text: "Adventurers. \\pI have a wall half-built, a treasury half-empty and a Chasm that is only mostly closed, so be useful quickly or be elsewhere.\n\nShe does not sit and does not offer you a seat.\n\nSabine. I hold the Protector's Enclave for Lord Neverember, which in practice means I hold it and he sends letters.",
        goto: 'hub',
      },
      hub: {
        speaker: 'General Sabine',
        text: "Well?",
        choices: [
          {
            text: 'We will take a patrol.',
            if: { questNot: 'protectors-enclave-patrol' },
            do: { quest: 'protectors-enclave-patrol' },
            goto: 'patrol',
          },
          { text: 'What is the state of the city?', goto: 'city' },
          { text: 'There is a Red Wizard at Old Owl Well.', goto: 'kost' },
          {
            text: 'Phandalin needs the Alliance to look east.',
            if: { faction: 'lords-alliance', repMin: 8 },
            do: { rep: { id: 'lords-alliance', amount: 2 } },
            goto: 'phandalin',
          },
          { text: 'General.', cancel: true, goto: 'bye' },
        ],
      },
      patrol: {
        speaker: 'General Sabine',
        text: "Blacklake District, north side, where the rebuilt streets give out and the burned ones start.\n\nMy people go in fours and come back in fours and that is the whole of the requirement. Whatever is denning in the collapsed cellars up there has eaten two patrols' worth of nerve and I cannot spare a third.\n\nClear it. City rate, paid by the Enclave, and I will put your names on the register, which matters more here than the coin does.",
        goto: 'hub',
      },
      city: {
        speaker: 'General Sabine',
        text: "Standing. Which after Mount Hotenow is not the small claim it sounds.\n\nShe crosses to the window and does not soften at all.\n\nThirty years since the mountain took the eastern half of it. We have the Protector's Enclave whole, the Blacklake half rebuilt and the rest is a wall with a district behind it that nobody talks about at dinner.\n\nAnd Neverember pays for it out of Waterdeep, and every year the sum is smaller and the letter is longer.",
        goto: 'hub',
      },
      kost: {
        speaker: 'General Sabine',
        text: "A Thayan. On the Trail. Digging.\n\nShe is very still for a moment.\n\nWrite it down. Every detail — how many walking dead, what he is lifting out of the ground, and whether he was alone.\n\nI cannot send a company east; I have not got a company to send. But a Red Wizard on this coast is a thing the Alliance council will hear about in Waterdeep, and they will hear it from me tonight.",
        do: [{ flag: 'sabine-told-kost' }, { rep: { id: 'lords-alliance', amount: 2 } }],
        goto: 'hub',
      },
      phandalin: {
        speaker: 'General Sabine',
        text: "Phandalin. \\pFour hundred people, a townmaster who bolts his shutters and a mine that may or may not exist.\n\nShe looks at the map for rather a long time.\n\nAnd it sits on the only road east that does not go through the Mere, and if that road works, Neverwinter is fed from Triboar instead of from Waterdeep's charity.\n\nYou have made the case better than my own factors have. I will send Hallwinter twenty spears and a mason. Do not tell him it was your doing; he is proud and I need him useful.",
        do: { flag: 'neverwinter-backs-phandalin' },
        goto: 'hub',
      },
      bye: {
        speaker: 'General Sabine',
        text: "Register your names at the gate. If you are going to be in my city, I would rather have you on a list.",
      },
    },
  },

  // --- Esvele Dundragon, Enclave trader ------------------------------------
  esvele: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Esvele Dundragon',
        text: "Everything on this stall is sound, everything is priced, and nothing on it came from further away than I am prepared to discuss.\n\nEsvele Dundragon. I sell to the rebuilding, which means I sell timber, nails, lamp oil and hope, and the last one has the best margin.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Esvele Dundragon',
        text: "Buying?",
        choices: [
          { text: 'Show me the stall.', do: { shop: 'neverwinter-market' }, goto: 'hub' },
          { text: 'What is the market like here?', goto: 'market' },
          { text: 'What are they saying in the Enclave?', goto: 'talk' },
          { text: 'Not today.', cancel: true, goto: 'bye' },
        ],
      },
      market: {
        speaker: 'Esvele Dundragon',
        text: "Better than Phandalin and worse than Waterdeep, which is the entire economy of this coast in one line.\n\nShe weighs a handful of nails and does not look at the scale.\n\nEverything here is priced against the rebuilding. Timber is four times what it was in Waterdeep this morning, because half the Sword Coast's pine goes through this gate and none of it goes back out.\n\nIf you are carrying anything cut, sawn or forged, sell it here. If you are buying it, do not.",
        goto: 'hub',
      },
      talk: {
        speaker: 'Esvele Dundragon',
        rumor: true,
        text: "A market stall is a listening post that pays for itself. Here is what has come over this counter this tenday.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Esvele Dundragon',
        text: "Sell here. Buy in Waterdeep. That is my whole advice and it is worth more than the nails.",
      },
    },
  },

  // =========================================================================
  // 16. WATERDEEP AND THE YAWNING PORTAL
  // =========================================================================

  // --- Durnan: granite, and does not talk about it -------------------------
  durnan: {
    start: 'start',
    nodes: {
      silverVisitor: {
        speaker:'Durnan',
        text:"Alustriel Silverhand. At the table near Volo, sorting letters. Visiting her sister; asking sensible questions about the roads.\n\nHe sets another cup on the counter.\n\nShe pays her tab. That puts her ahead of several people with shorter titles.",
        goto:'hub',
      },
      start: {
        speaker: 'Durnan',
        text: "Two coppers the ale. One gold to go down the well. No refunds on either.\n\nHe is enormous, entirely grey, and drying a tankard with the patience of geology. Behind him, in the middle of the taproom floor, is a stone-rimmed well with a winch over it, and the rope goes a very long way down.\n\nDurnan. Sit anywhere that is not somebody.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Durnan',
        text: "Well?",
        choices: [
          { text:'Who is the silver-haired traveler?',goto:'silverVisitor' },
          { text: 'Ale and a bed.', do: { shop: 'yawning-portal' }, goto: 'hub' },
          {
            text: 'A room for the night. [gold]8 gp[/]',
            if: { gold: 8 },
            do: { heal: { cost: 8, hours: 8 } },
            goto: 'rested',
          },
          { text: 'What is down the well?', goto: 'well' },
          { text: 'You went down yourself, they say.', goto: 'himself' },
          {
            text: 'What is on the tab?',
            if: { questNot: 'durnans-tab' },
            do: { quest: 'durnans-tab' },
            goto: 'tab',
          },
          {
            text: 'We are going down. [gold]1 gp[/] each.',
            if: { all: [{ gold: 4 }, { level: 5 }] },
            do: [{ gold: -4 }, { quest: 'descent-into-undermountain' }, { flag: 'undermountain-open' }],
            goto: 'descend',
          },
          {
            text: 'Put us on the board.',
            if: { questNot: 'the-yawning-portal' },
            do: { quest: 'the-yawning-portal' },
            goto: 'board',
          },
          { text: 'Just the ale.', cancel: true, goto: 'bye' },
        ],
      },
      rested: {
        speaker: 'Durnan',
        text: "Top of the stair. The one at the end is quieter, which matters more here than you would think, because the winch runs at all hours and it does not always come back up with what went down.",
        goto: 'hub',
      },
      well: {
        speaker: 'Durnan',
        text: "Undermountain.\n\nHe sets the tankard down.\n\nHalaster Blackcloak's dungeon. Twenty-odd levels that anyone has mapped and nobody will say how many under those, and the mad old wizard is still in it and still moving the walls.\n\nA gold to lower you. Free to be pulled up, if you are on the rope and there is anything left to pull.\n\nThat is the whole arrangement and it has not changed in forty years.",
        do: { flag: 'undermountain-explained' },
        goto: 'hub',
      },
      himself: {
        speaker: 'Durnan',
        text: "Aye.\n\nHe goes on drying the tankard.\n\nThe silence stretches out and it becomes clear that this was the answer, the whole answer, and that no amount of standing there is going to produce a second one.\n\nEventually: bought this place with what I brought up. That is the useful part. The rest is mine.",
        do: { flag: 'durnan-asked' },
        goto: 'hub',
      },
      tab: {
        speaker: 'Durnan',
        text: "Four names, and three of them are dead, which is how a tab works in this house.\n\nHe turns the slate round.\n\nThe fourth went down on Tenthday with a party of six and came up on his own two days later, and has been drinking on credit and not going home.\n\nI do not chase debts. I do not much like a man sitting at my bar who will not say what he saw. Find out which it is.",
        goto: 'hub',
      },
      board: {
        speaker: 'Durnan',
        text: "Names on the board, dates beside them, and I cross them out when the rope comes up empty.\n\nHe writes yours without ceremony.\n\nPeople think it is grim. It is not grim, it is the only honest register on the Sword Coast. Every other guildhall in this city will tell you nine out of ten come back. That board tells you the number.",
        goto: 'hub',
      },
      descend: {
        speaker: 'Durnan',
        text: "Four gold. On the rope, one at a time, hands inside.\n\nThe winch takes your weight and the taproom light goes up and away, and the cold comes up to meet you, and it goes on coming for rather longer than a well ought to be deep.\n\nDurnan's voice, from a very long way above, entirely level:\n\nRope stays down an hour. After that it comes up whether you are on it or not.",
        do: { warp: { map: 'undermountain', x: 12, y: 12, dir: 'down' } },
      },
      bye: {
        speaker: 'Durnan',
        text: "Two coppers.",
      },
    },
  },

  // --- Volothamp Geddarm: self-important, magnificent ----------------------
  volo: {
    start: 'start',
    nodes: {
      legends: {
        speaker:'Volothamp Geddarm',
        text:"Famous acquaintances? Several. Correspondents? Innumerable. People who have corrected my books in the margins? We need not dwell on numbers.",
        choices:[
          {text:"Drizzt and the Companions of the Hall?",goto:'hall'},
          {text:'Elminster?',goto:'oldMage'},
          {text:'The Silverhands and the Blackstaff?',goto:'silverhands'},
          {text:'Back to your book.',goto:'hub'},
        ],
      },
      hall: {
        speaker:'Volothamp Geddarm',
        text:"Drizzt, Catti-brie, Bruenor, Wulfgar, Regis. A splendid company, with an infuriating habit of surviving long enough to dispute the account.\n\nHe lowers his voice.\n\nA carter placed Drizzt on the trail through Neverwinter Wood, south of the stream crossing. I have not verified it myself. Forests are dreadfully unaccommodating to a writing desk.",goto:'legends',
      },
      oldMage: {
        speaker:'Volothamp Geddarm',
        text:"The Sage of Shadowdale is visiting Candlekeep. Outside the gate, last I heard, with a parcel for one of the Avowed.\n\nVolo covers a heavily marked page with his sleeve.\n\nIf he asks whether I received his corrections, say that the matter is receiving the attention it deserves. That is both true and admirably difficult to measure.",goto:'legends',
      },
      silverhands: {
        speaker:'Volothamp Geddarm',
        text:"Laeral governs Waterdeep. Her sister Alustriel is visiting; you may have noticed the letters and the unusually patient expression. Vajra Safahr, our Blackstaff, has enough work keeping the city's magic in order without my assistance.\n\nHe straightens his collar.\n\nShe has said so. In writing. Her tower is in the Castle Ward: take the west opening from this ward's upper cross-street, then approach the silver mark on the black stone.",goto:'legends',
      },
      start: {
        speaker: 'Volothamp Geddarm',
        text: "Stop! \\pStop exactly there, do not move, the light is doing something to your — no, it has gone.\n\nHe is up from the table before you have decided whether to be alarmed.\n\nVolothamp Geddarm. Volo, to my friends, my readers and, regrettably, my creditors. You are adventurers. You have the boots. Nobody who is not an adventurer has boots like that on purpose.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Volothamp Geddarm',
        text: "Now. Tell me everything, and tell it in the right order for once.",
        choices: [
          {
            text: 'We have a story. What is it worth?',
            if: { questNot: 'volos-notes' },
            do: { quest: 'volos-notes' },
            goto: 'notes',
          },
          { text: 'What are you actually writing?', goto: 'guide' },
          { text:'Who have you met worth writing about?',goto:'legends' },
          { text: 'Have you ever been to Phandalin?', goto: 'phandalin' },
          {
            text: 'Twenty gold. No less. [Persuasion 14]',
            success: 'paid',
            failure: 'haggled',
          },
          { text: 'Some other time, Master Geddarm.', cancel: true, goto: 'bye' },
        ],
      },
      notes: {
        speaker: 'Volothamp Geddarm',
        text: "Worth! My dear fellow, worth is the wrong axis entirely.\n\nHe is already writing.\n\nI require three things and I require them accurate: a monster nobody in this city has seen with their own eyes, a location I can describe well enough that a reader could find it, and — this is the important one — the name of somebody local who will confirm it when the Watch comes asking.\n\nBring me those and there is coin, and rather more than coin, there is a footnote.",
        goto: 'hub',
      },
      guide: {
        speaker: 'Volothamp Geddarm',
        text: "Volo's Guide to the Sword Coast. Companion volume to the Guide to Monsters, which you have read, do not pretend otherwise, everyone has read it.\n\nHe waves an expansive hand and knocks over somebody else's drink.\n\nThe difficulty, and I say this to you in confidence, is that the publishing trade in this city has developed an unreasonable enthusiasm for what they call verification. Blackstaff Tower is involved. It is all very small-minded.\n\nHence: eyewitnesses. Preferably surviving ones. You would be astonished how much that narrows the field.",
        goto: 'hub',
      },
      phandalin: {
        speaker: 'Volothamp Geddarm',
        text: "Phandalin! \\pNo.\n\nA pause.\n\nWhich is precisely the problem, is it not? Four hundred souls sitting on a Netherese foundation on the only good road east, with a lost dwarven spellforge under the hill, and there is not one line about it in any guide on this coast including mine.\n\nThat is not obscurity. That is a gap. And a gap, my friends, is where a second edition comes from.",
        do: { flag: 'volo-interested-phandalin' },
        goto: 'hub',
      },
      paid: {
        speaker: 'Volothamp Geddarm',
        text: "Twenty! For an eyewitness account of — yes. \\pYes, all right, yes, that is actually rather good and I am not going to insult you by pretending otherwise.\n\nHe counts it out with the pained air of a man parting with somebody else's advance.\n\nAnd your names spelled correctly in the footnote, which in thirty years' time will be worth considerably more than the twenty. People never believe me about that.",
        do: [{ gold: 20 }, { flag: 'volo-footnote' }, { xp: 100 }],
        goto: 'hub',
      },
      haggled: {
        speaker: 'Volothamp Geddarm',
        text: "Twenty gold! For a story with no corroborating witness and one dead goblin in it!\n\nHe presses a hand to his chest.\n\nFive. Five, and the footnote, and I am robbing myself, and my publisher will have my liver.",
        do: { gold: 5 },
        goto: 'hub',
      },
      bye: {
        speaker: 'Volothamp Geddarm',
        text: "Do come back with something enormous. Ideally something with a good silhouette — the woodcut has to work at half a page.",
      },
    },
  },

  // --- Mirt: jovial old Waterdhavian moneylender, and rather more ----------
  mirt: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Mirt',
        text: "Sit down, sit down, you are blocking my view of the door and the door is the whole of my entertainment.\n\nHe is enormous, wheezing, and comfortably ruining a doublet that was expensive some decades ago.\n\nMirt. Moneylender. Also several other things, none of which you need this afternoon. What do you want and how much is it?",
        goto: 'hub',
      },
      hub: {
        speaker: 'Mirt',
        text: "Well? I have got all day and you have not.",
        choices: [
          {
            text: 'We need a loan.',
            if: { questNot: 'mirts-loan' },
            do: { quest: 'mirts-loan' },
            goto: 'loan',
          },
          {
            text: 'Take the loan. [gold]300 gp[/] now.',
            if: { quest: 'mirts-loan' },
            do: [{ gold: 300 }, { flag: 'mirt-loan-taken' }],
            goto: 'lent',
          },
          {
            text: 'Settle up. [gold]360 gp[/]',
            if: { all: [{ flag: 'mirt-loan-taken' }, { gold: 360 }] },
            do: [{ gold: -360 }, { complete: 'mirts-loan' }, { clearFlag: 'mirt-loan-taken' }],
            goto: 'settled',
          },
          {
            text: 'You have business in the south, we hear.',
            if: { all: [{ questNot: 'the-long-road-south' }, { level: 8 }] },
            goto: 'south',
          },
          {
            text: 'The Trade Way is walked, Old Wolf. Ask Daggerford.',
            if: { all: [{ questDone: 'the-long-road-south' }, { notFlag: 'mirt-south-thanked' }] },
            goto: 'south-done',
          },
          { text: 'What are the other things you are?', goto: 'other' },
          {
            text: 'Sister Garaele sent us.',
            if: { faction: 'harpers', repMin: 5 },
            goto: 'harper',
          },
          { text: 'Nothing today, Old Wolf.', cancel: true, goto: 'bye' },
        ],
      },
      loan: {
        speaker: 'Mirt',
        text: "Everyone needs a loan. That is why I have a chair and a view of the door.\n\nHe wheezes something that is probably a laugh.\n\nThree hundred, at a fifth. No collateral, because you have not got any, and I have looked. What I take instead is the story of what you spend it on, and I take that in person, in this chair, and I take it whether you can pay or not.\n\nThat is not sentiment. A man who knows what four hundred adventurers spent their money on knows what is happening on this coast before the Lords do.",
        goto: 'hub',
      },
      lent: {
        speaker: 'Mirt',
        text: "Three hundred, counted, and here is the part everybody forgets: three hundred and sixty back, whenever you like.\n\nHe shovels it across the table.\n\nI do not send men after debtors. I simply stop being at home to them, and in this city that is a great deal worse. Now go and do something interesting with it.",
        goto: 'hub',
      },
      settled: {
        speaker: 'Mirt',
        text: "Paid. \\pPaid in full and inside the season.\n\nHe counts it, marks the slate, and then, unexpectedly, pours two glasses of something that is not what he has been drinking.\n\nDo you know how many pay? One in five. The rest die, or go to Amn, which for my purposes is the same thing.\n\nYou are now on a very short list of people I am at home to. That is worth rather more than the sixty.",
        do: [{ flag: 'mirt-repaid' }, { rep: { id: 'harpers', amount: 2 } }],
        goto: 'hub',
      },
      other: {
        speaker: 'Mirt',
        text: "A Lord of Waterdeep, for one. Masked, so you have not seen me and I have not said it.\n\nHe says it exactly as cheerfully as everything else, which is the most disconcerting thing about him.\n\nAnd a fair hand with a blade, once, and better than fair at getting out of rooms. And a man who has been sitting in this chair long enough to have watched three generations of adventurer come through that door and go out of it.\n\nThe fat is real, mind. I have earned every pound of it.",
        do: { flag: 'mirt-lord-known' },
        goto: 'hub',
      },
      harper: {
        speaker: 'Mirt',
        text: "Garaele. The elf girl at the luck shrine.\n\nThe joviality does not go anywhere, but something behind it comes forward and looks at you properly.\n\nShe writes a good report. Short, dated, no adjectives. Half the Harpers write like poets and I burn theirs.\n\nSo. Phandalin. Netherese cellars, a spellforge under the hill, and the Black Network taking an interest in a town of four hundred souls.\\p Tell me all of it, in order, and I shall tell you what it means, and then neither of us will sleep.",
        do: [{ flag: 'mirt-harper-open' }, { rep: { id: 'harpers', amount: 3 } }],
        goto: 'hub',
      },
      south: {
        speaker: 'Mirt',
        text: "Hear. \\pYou HEAR. Wonderful. I own four walls and a chair and apparently a town crier.\n\nHe heaves himself forward, and the chair and the joviality both creak.\n\nFine. Yes. Four thousand gold, sitting in a Baldurian counting house with my name on it, six hundred miles down the Trade Way. In two years I have sent three factors after it. One came back robbed. One came back in a box. One wrote to say he has married a Daggerford girl and taken up cheesemaking, which of the three is the fate I understand least.\\p I do not want the money carried. I want the ROAD. Walk it, all of it, and hand my letter of credit to Morwen Daggerford — the Duchess, and do call her that, she has a sword — and come back able to tell me plainly what is eating my couriers between here and the Delimbiyr.",
        choices: [
          {
            text: 'We will walk it. Give us the letter.',
            do: { quest: 'the-long-road-south' },
            goto: 'south-yes',
          },
          { text: 'What is on the road, that you know of?', goto: 'south-road' },
          { text: 'Six hundred miles is a lot of walking. Not yet.', goto: 'hub' },
        ],
      },
      'south-road': {
        speaker: 'Mirt',
        text: "If I knew, I would not be paying to find out — but I shall give you the shape of it.\n\nHe counts it off on thick ringed fingers.\n\nBandits above the Delimbiyr, organised ones, which is the interesting word. Daggerford, safe, ruled by a Duchess worth ten of most lords. The Way Inn, safe-ish. Then the Fields of the Dead, which are named honestly, and Dragonspear, which I will not discuss after dark, and the long coast down to the Gate itself.\\p And at the end of it, Baldur's Gate. A city that makes this one look sentimental. If you get that far, keep your purse inside your shirt and your opinions inside your teeth.",
        goto: 'south',
      },
      'south-yes': {
        speaker: 'Mirt',
        text: "There. Sealed, watermarked, and worth precisely nothing to anyone who steals it, which is the beauty of paper over coin.\n\nHe produces the letter from somewhere inside the doublet, warm and slightly bent.\n\nMorwen Daggerford, her own hand, no other. She will know what it is.\\p And — listen. He is suddenly not wheezing. The Harpers lost two good friends on that road this year and nobody southward will say the right names about it. Walk it with your eyes open. I am buying the LOOKING, understand. The gold is an excuse.",
        goto: 'hub',
      },
      'south-done': {
        speaker: 'Mirt',
        text: "I know. Morwen wrote. Shorter letter than yours will be, and it still said more than three factors managed in two years.\n\nHe pours two glasses without asking and pushes one across.\n\nOrganised toll-thieves on my road, a Duchess short of swords, and the Gate at the end of it sitting on its own trouble like a hen on a griffon egg. That is worth knowing and I now know it.\\p The letter of credit is spent, the account is open, and you are on the short list of people I am at home to. Go south again when it calls you. It will. It always calls the useful ones.",
        do: [{ flag: 'mirt-south-thanked' }, { rep: { id: 'harpers', amount: 2 } }],
        goto: 'hub',
      },
      bye: {
        speaker: 'Mirt',
        text: "Mind the step. Everyone forgets the step and I have never once had it fixed, because watching people forget it is free.",
      },
    },
  },

  // --- Zasheir Rein, bazaar trader of the Market Ward ---------------------
  zasheir: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Zasheir Rein',
        text: "Ah — no, no, come back, I saw you look. You looked at the second stall and a man does not look at the second stall by accident.\n\nZasheir Rein. Three stalls, four languages, and the finest goods in the Market Ward, which is to say the finest goods in Faerûn, which is to say the finest goods.\n\nWhatever you are carrying, I will give you a price for it. It will be an insult. We will get past that together.",
        goto: 'hub',
      },
      hub: {
        speaker: 'Zasheir Rein',
        text: "Now. Business.",
        choices: [
          { text: 'Show me the stalls.', do: { shop: 'waterdeep-bazaar' }, goto: 'hub' },
          { text: 'Where does all this come from?', goto: 'goods' },
          { text: 'What is worth having in this city?', goto: 'talk' },
          {
            text: 'Give me the honest price. [Insight 15]',
            success: 'honest',
            failure: 'flattery',
          },
          { text: 'Later, friend.', cancel: true, goto: 'bye' },
        ],
      },
      goods: {
        speaker: 'Zasheir Rein',
        text: "Everywhere! Calimshan for the glass, Amn for the silk, Sembia for anything I do not wish to explain, and Waterdeep for the mark-up.\n\nHe spreads his hands.\n\nMy grandfather brought a bale of cloth up the Trade Way from Memnon with a mule and a knife. I have three stalls and no mule and I am, my mother says, a disappointment to the family, because the knife is also gone.",
        goto: 'hub',
      },
      talk: {
        speaker: 'Zasheir Rein',
        rumor: true,
        text: "Everything in this city is worth having and nothing in it is worth the asking price. But information — information is priced badly here, and that is where a man makes his living.",
        goto: 'hub',
      },
      honest: {
        speaker: 'Zasheir Rein',
        text: "He stops. He looks at you for a moment with an expression of pure, delighted professional respect.\n\nYou are no fun at all and I like you enormously.\n\nVery well. The honest price: everything on this stall is worth two-thirds of what the tag says, except the Calishite glass, which is worth exactly what it says because it is the only thing here I did not buy from somebody desperate.\n\nBuy the glass. Haggle me down on the rest and we shall both go home content.",
        do: [{ flag: 'zasheir-honest' }, { give: 'gem-quartz' }],
        goto: 'hub',
      },
      flattery: {
        speaker: 'Zasheir Rein',
        text: "The honest price! Every price on this stall is honest, my friend, they are simply honest about different things.\n\nHe beams at you with total sincerity.\n\nThis one is honest about the silk. That one is honest about my rent. And this one — this one is honest about how much I liked you when you walked up, which is a great deal, which is why it is so high.",
        goto: 'hub',
      },
      bye: {
        speaker: 'Zasheir Rein',
        text: "You will be back. Everyone comes back. It is the second stall — it gets them every time.",
      },
    },
  },

  // =========================================================================
  // 17. UNDERMOUNTAIN
  // =========================================================================

  // --- Halaster Blackcloak: mad, gleeful, taunting. Never present. ---------
  halaster: {
    start: 'start',
    nodes: {
      start: {
        speaker: 'Halaster Blackcloak',
        text: "There is nobody there.\n\nThe corridor behind you has been a corridor for the last hundred paces and is now, quite definitely, a stair. Nothing moved. You would have heard something move.\n\nThen the stone says, in a cracked and enormously cheerful old voice, and from no particular direction:\n\n[purple]{name}.[/]\\p [purple]I do like it when they bring a lamp.[/]",
        goto: 'hub',
      },
      hub: {
        speaker: 'Halaster Blackcloak',
        text: "[purple]Well? Say something. They so rarely say anything.[/]",
        choices: [
          { text: 'Where are you?', goto: 'where' },
          { text: 'What do you want?', goto: 'want' },
          { text: 'Put the corridor back.', goto: 'corridor' },
          {
            text: 'Threaten the walls.',
            goto: 'threat',
          },
          {
            text: 'We are going deeper.',
            goto: 'deeper',
          },
          { text: 'Say nothing at all.', cancel: true, goto: 'silence' },
        ],
      },
      where: {
        speaker: 'Halaster Blackcloak',
        text: "[purple]Everywhere. Obviously. It is my house.[/]\n\nSomething that is not laughter goes along the ceiling from left to right.\n\n[purple]I am in the stair you came up, and the stair you did not, and the room with the water in it that you have not found yet, and — oh, this is good — I am in the lamp. Look at the lamp. \\pNo, do not, you will only worry.[/]",
        goto: 'hub',
      },
      want: {
        speaker: 'Halaster Blackcloak',
        text: "[purple]Want![/]\n\nThe word comes from four places and none of them are where the last one was.\n\n[purple]A thousand years I have had, and every one of them somebody comes down my well and asks me what I want, as though I were a merchant. \\pI want you to go left at the third arch. That is all. That is genuinely all.[/]\n\n[purple]There is nothing behind the third arch. I simply want to know whether you will do it because I said so.[/]",
        do: { flag: 'halaster-third-arch' },
        goto: 'hub',
      },
      corridor: {
        speaker: 'Halaster Blackcloak',
        text: "[purple]No.[/]\n\nA pause of exactly the length required.\n\n[purple]Do you know, in nine hundred years, four people have asked me politely and I put it back for every one of them, and not one of them believed it was because they asked.[/]\n\nThe stair is a corridor again. Nothing moved.",
        do: { flag: 'halaster-amused' },
        goto: 'hub',
      },
      threat: {
        speaker: 'Halaster Blackcloak',
        text: "[purple]Oh, do. Do go on.[/]\n\nThe delight in it is entirely genuine and that is the worst part.\n\n[purple]Threaten the stone. I shall stand here — I am not standing anywhere — and I shall be threatened, and then in a moment I shall move a wall four feet to the left while you are still speaking and you will find that you were addressing a different room.[/]\n\nThe air behind you changes pressure. You do not look round.",
        goto: 'hub',
      },
      deeper: {
        speaker: 'Halaster Blackcloak',
        text: "[purple]Deeper. Yes. They always go deeper.[/]\n\nSomething far below shifts, on a scale that a building should not be able to shift on.\n\n[purple]Down, then. And mind the levels — they are not floors, whatever your map says, they are moods. This one is patient. The next one is not.[/]\\p [purple]I shall be along. I am always along.[/]",
        do: { flag: 'halaster-descent-marked' },
        goto: 'hub',
      },
      silence: {
        speaker: 'Halaster Blackcloak',
        text: "The silence goes on for a very long time.\n\n[purple]…hm.[/]\n\nAnd then, sounding almost put out:\n\n[purple]Well. That is new.[/]\n\nThe corridor is a corridor. Nothing else happens, and that is somehow much worse than something happening.",
        do: { flag: 'halaster-silenced' },
      },
    },
  },

  // =========================================================================
  // THE SOUTH — the Trade Way, the Coast Way, and Baldur's Gate entire.
  // =========================================================================

  ...SOUTH_DIALOGUE,
  ...LEGEND_DIALOGUE,
  ...BLACKSTAFF_DIALOGUE,

});

// ===========================================================================
// HELPERS
// ===========================================================================

export const DIALOGUE_IDS = Object.freeze(Object.keys(DIALOGUE));

/** The dialogue tree for `id`, or null. Never throws. */
export function getDialogue(id) {
  if (!id || typeof id !== 'string') return null;
  const t = DIALOGUE[id];
  return t && t.nodes ? t : null;
}

/** Whether a usable tree exists for `id`. */
export function hasDialogue(id) {
  return !!getDialogue(id);
}

/** A single node out of a tree, or null. Used by the journal and debug tools. */
export function getNode(id, nodeId) {
  const t = getDialogue(id);
  if (!t) return null;
  return t.nodes[nodeId || t.start] || null;
}

/** How many trees and nodes shipped — the smoke test in main.js reads this. */
export function dialogueCounts() {
  let nodes = 0;
  let choices = 0;
  for (const id of DIALOGUE_IDS) {
    const t = DIALOGUE[id];
    for (const k of Object.keys(t.nodes)) {
      nodes++;
      const c = t.nodes[k].choices;
      if (Array.isArray(c)) choices += c.length;
    }
  }
  return { trees: DIALOGUE_IDS.length, nodes, choices };
}

export default DIALOGUE;
