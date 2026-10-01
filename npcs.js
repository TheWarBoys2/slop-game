// The people of the valley, and everything they will (and won't) tell you.
// Each NPC is a little dialogue graph. Nodes: { text(c), opts: [{ label, to, if(c), do(c) }] }.
// `c` is { p, f (story flags), aff (team affinity per npc), clues (Set), q (player's quests), api }.
// Clues are shared by the whole team. Four of five lets you confront the person behind the slop.

export const QUESTS = {
  pell_wake:    { npc: "pell", title: "A Proper Wake", desc: "Harvest 3 crops for Pell's wake.", stat: "crops", goal: 3 },
  had_pest:     { npc: "haddock", title: "Pest Control", desc: "Kill 30 of the dead.", stat: "kills", goal: 30 },
  had_marks:    { npc: "haddock", title: "Marksmanship", desc: "Land 15 headshots.", stat: "hs", goal: 15 },
  mor_voice:    { npc: "morwen", title: "The Voice", desc: "Hit 20 of the dead with your shout.", stat: "shoutHits", goal: 20 },
  ald_labour:   { npc: "aldous", title: "Tithe of Labour", desc: "Repair the Hearth once, from the shop.", stat: "repairs", goal: 1 },
  vex_research: { npc: "vex", title: "Market Research", desc: "Open 2 Mystery Cases.", stat: "cases", goal: 2 },
  chef_raw:     { npc: "chef", title: "Kitchen Nightmare", desc: "Harvest 4 crops before Gordon leaves at nightfall.", stat: "crops", goal: 4 },
  bear_live:    { npc: "bear", title: "Live Off the Land", desc: "Eat 3 things you grew yourself (turnips or Hearth stew) before Bear leaves.", stat: "ateGrown", goal: 3 },
  rock_smack:   { npc: "boulder", title: "The Smackdown", desc: "Kill 25 of the dead before The Boulder leaves.", stat: "kills", goal: 25 },
  dav_planet:   { npc: "david", title: "Planet Slop", desc: "Kill 4 different kinds of the dead for Sir David's documentary.", stat: "ztypes", goal: 4 },
  war_buy:      { npc: "warren", title: "Buy and Hold", desc: "Buy 20 shares on the Slop Valley Stock Exchange [M].", stat: "sharesBought", goal: 20 },
};

export const CLUES = {
  dust:    "Pell sold six sacks of grave-dust to Mayor Grubb. Grubb said it was 'for the roses'. Grubb has no roses.",
  ledger:  "Vex's ledger: twelve barrels of pig slop sold to M. Grubb, paid for out of town funds.",
  book:    "Slop plus grave-dust wakes the dead. It's in Morwen's book. The Mayor borrowed her book in spring and never gave it back.",
  watch:   "The night it began, Grubb ordered the town watch to the north wall. It's the only order he has ever given.",
  confess: "Brother Aldous cannot break the seal of confession, but he will say that the Mayor confessed. Twice. And cried.",
};

const has = (c, id) => c.clues.has(id);
const q = (c, id) => c.q[id];
const ready = (c, id) => c.q[id] && !c.q[id].done && c.api.progress(c.p, id) >= QUESTS[id].goal;
const turnIn = (c, id) => { if (c.q[id]) c.q[id].done = true; };

export const NPCS = {
  grubb: {
    name: "Mayor Grubb", role: "Mayor of the valley", color: "#c9a46a", hat: "tophat",
    nodes: {
      start: {
        text: (c) => c.f.exposed ? "Grubb stares at his shoes. \"I suppose you want me to resign. I suppose I shall. I suppose.\""
          : c.f.blackmail ? "\"Ah! My favourite constituents. Can I interest you in a little more money? Please don't tell anyone.\""
          : `"Welcome, welcome! Terrible business, the dead walking. Just terrible. Election's in a month, you know. Not that that's relevant." He dabs his forehead with a very expensive handkerchief.`,
        opts: [
          { label: "What happened to the well?", to: "well", if: (c) => !c.f.exposed },
          { label: "Tell me about the valley.", to: "history" },
          { label: "Who was the drowned man?", to: "grandad", if: (c) => c.f.path === "drink" || c.aff.grubb >= 1 },
          { label: "Any chance of a campaign donation?", to: "donate", if: (c) => !c.f.exposed && !c.p.flags.grubbGold },
          { label: "We know it was you, Grubb.", to: "confront", if: (c) => c.clues.size >= 4 && !c.f.exposed && !c.f.blackmail && !c.f.pardoned },
          { label: "Goodbye.", to: null },
        ],
      },
      well: {
        text: () => "\"The well? Nature, I expect. Or foreigners. Or the witch! Yes, probably the witch. I'd look into the witch. Don't look into me. There's nothing to see. Look at the witch.\"",
        opts: [
          { label: "That was suspiciously specific.", to: "sweat", do: (c) => { c.aff.grubb -= 1; } },
          { label: "Thanks, Mayor. Very helpful.", to: "start", do: (c) => { c.aff.grubb += 1; } },
        ],
      },
      sweat: {
        text: () => "Grubb laughs for slightly too long. \"Ha! Ha. Ha. Specific. No. Next question.\" A drop of sweat lands on his chain of office.",
        opts: [{ label: "Back.", to: "start" }],
      },
      history: {
        text: () => "\"Three hundred years this valley's stood! Founded by my ancestor, Aldermayor Grubb the First, who drained the bog with his bare hands. And a lot of other people's hands. The well was his pride and joy. Sixty feet deep and never once run dry. Until, well. Now.\"",
        opts: [
          { label: "And the Hearth?", to: "hearth" },
          { label: "Back.", to: "start" },
        ],
      },
      hearth: {
        text: () => "\"The Hearth has burned since the founding. The Church says it keeps the dead down. The witch says it's just a big fire. I say it's on the town crest, so it had better keep burning, or I'll have to redesign the stationery.\"",
        opts: [{ label: "Back.", to: "start" }],
      },
      grandad: {
        text: () => "Grubb goes pale. \"My grandfather. Mayor before my father. He fell in the well forty years ago, drunk at the harvest feast. Or pushed, some said. Nobody proved anything. We don't talk about it. Please stop talking about it.\"",
        opts: [
          { label: "Pushed by whom?", to: "grandad2" },
          { label: "Sorry for your loss.", to: "start", do: (c) => { c.aff.grubb += 1; } },
        ],
      },
      grandad2: {
        text: () => "\"By his rival. Old Vex. Vex the merchant's grandfather. That family has been selling this town things it doesn't need for three generations.\" He brightens. \"So if anyone did anything to the well, look at the Vexes! Or the witch!\"",
        opts: [{ label: "Back.", to: "start" }],
      },
      donate: {
        text: () => "\"A donation! To you! From the campaign! Well, the campaign is flush this year. Very flush. Suspiciously... no, normally flush. Here. Vote Grubb.\"",
        opts: [{ label: "Take the money.", to: "start", do: (c) => { c.p.flags.grubbGold = true; c.api.gold(c.p, 60); c.aff.grubb += 1; return "+60g campaign donation"; } }],
      },
      confront: {
        text: (c) => `You lay it out: ${c.clues.size} pieces of evidence. The grave-dust, the barrels, the book, the watch. Grubb sits down heavily on a turnip crate. "I just wanted people to need me," he says. "Nobody needs a mayor when nothing happens. So I made something happen. It was only meant to be a few zombies."`,
        opts: [
          { label: "Expose him to the whole valley.", to: "exposed", do: (c) => { c.f.exposed = true; c.api.story("The Mayor is Exposed", `${c.api.name(c.p)} dragged Grubb to the Hearth and read out the evidence. Without his slop barrels, the final horror will be weaker.`); c.api.mods().bossHp *= 0.65; c.api.mods().dmg *= 1.05; } },
          { label: "Blackmail him. 250g each or we talk.", to: "blackmail", do: (c) => { c.f.blackmail = true; c.api.goldAll(250); c.api.story("A Quiet Arrangement", `${c.api.name(c.p)} had a quiet word with the Mayor. Everyone is 250g richer, and nobody knows why.`); } },
          { label: "Forgive him. Everyone makes mistakes.", to: "pardon", do: (c) => { c.f.pardoned = true; c.aff.grubb += 3; c.api.pointsAll(1); c.api.story("Mercy", `${c.api.name(c.p)} forgave Mayor Grubb. He's so grateful he paid for everyone's training. (+1 skill point each)`); } },
        ],
      },
      exposed: { text: () => "The crowd turns on him. Grubb is pelted with turnips all the way to the stocks. Somewhere out in the dark, the slop feels weaker.", opts: [{ label: "Justice.", to: null }] },
      blackmail: { text: () => "Grubb counts out the coins with shaking hands. \"This never happened,\" he whispers. \"None of it happened. Least of all the zombies.\"", opts: [{ label: "Pleasure doing business.", to: null }] },
      pardon: { text: () => "Grubb weeps into his handkerchief. \"I'll make it right. I'll pay for the Hearth. I'll pay for everything. I'll pay for training!\"", opts: [{ label: "You will.", to: null }] },
    },
  },

  aldous: {
    name: "Brother Aldous", role: "Keeper of the Hearth-Church", color: "#e8e0c8", hat: "hood",
    nodes: {
      start: {
        text: (c) => c.f.tithe === "stolen" ? "\"Thieves. Thieves at my own collection plate. The Hearth forgives. I do not.\""
          : `"Peace be upon you, child of the Hearth." Aldous is younger than his beard. ${c.f.ally === "witch" ? "\"Though I hear you've been keeping company in the reeds.\"" : "\"The flame is strong today.\""}`,
        opts: [
          { label: "What is the Hearth, really?", to: "faith" },
          { label: "You and Morwen don't get along.", to: "sister" },
          { label: "Do you know who poisoned the well?", to: "secret", if: (c) => !has(c, "confess") },
          { label: "Is there work that needs doing?", to: "quest", if: (c) => !q(c, "ald_labour") },
          { label: "The Hearth is repaired, Brother.", to: "questdone", if: (c) => ready(c, "ald_labour") },
          { label: "Goodbye.", to: null },
        ],
      },
      faith: {
        text: () => "\"The founders lit it on the first night, when the bog-dead rose. As long as it burns and someone tends it, the dead remember that they are dead. That is the whole of our faith. Tend the fire. Remember the dead. Don't eat the yellow mushrooms.\"",
        opts: [{ label: "Why the mushrooms?", to: "mush" }, { label: "Back.", to: "start" }],
      },
      mush: { text: () => "\"Brother Tobias. Rest his soul. He saw colours no man should see, and then he saw nothing at all.\"", opts: [{ label: "Back.", to: "start" }] },
      sister: {
        text: () => "Aldous sighs. \"Morwen is my sister. We were both raised in the Church. She read the old books and decided the fire was just a fire. I read the same books and decided it didn't matter if it was. We haven't spoken in eleven years.\"",
        opts: [
          { label: "Maybe you should talk to her.", to: "start", do: (c) => { c.aff.aldous += 1; c.f.siblings = (c.f.siblings || 0) + 1; return c.f.siblings >= 2 ? "Aldous and Morwen might yet make peace..." : undefined; } },
          { label: "She's right. It's just a fire.", to: "start", do: (c) => { c.aff.aldous -= 1; } },
        ],
      },
      secret: {
        text: () => "Aldous hesitates. \"Someone has come to me for confession, about the well. I cannot break the seal. The Hearth would dim. But... the roof leaks, and the roof is not the Hearth.\"",
        opts: [
          { label: "Donate 50g for the roof.", to: "confess", if: (c) => c.p.gold >= 50, do: (c) => { c.api.gold(c.p, -50); c.aff.aldous += 1; } },
          { label: "Swear on the Hearth you'll keep it quiet.", to: "confess", if: (c) => c.aff.aldous >= 2 },
          { label: "Never mind.", to: "start" },
        ],
      },
      confess: {
        text: () => "He leans close. \"I will say only this. It was a man of high office. He confessed twice, and wept both times, and he left a very expensive handkerchief in the booth.\"",
        opts: [{ label: "Thank you, Brother.", to: "start", do: (c) => c.api.clue("confess") }],
      },
      quest: {
        text: () => "\"The Hearth takes damage every night, and I am one man with one trowel. Buy stone from the store and repair it. Labour is a kind of prayer. So is stone.\"",
        opts: [{ label: "I'll see to it.", to: "start", do: (c) => c.api.accept(c.p, "ald_labour") }, { label: "Not now.", to: "start" }],
      },
      questdone: {
        text: () => "\"The flame thanks you. Kneel.\" He presses warm ash to your forehead, and something settles in your chest.",
        opts: [{ label: "Rise.", to: "start", do: (c) => { turnIn(c, "ald_labour"); c.p.bonusHp += 25; c.p.hp += 25; c.aff.aldous += 2; return "Blessed: +25 max HP (and your heirs keep it)"; } }],
      },
    },
  },

  morwen: {
    name: "Morwen of the Reeds", role: "Hedge-witch", color: "#6a8a5a", hat: "witch",
    nodes: {
      start: {
        text: (c) => c.f.price === "paid" ? "\"Your heir is doing very well. Eats a lot. I've named them 'Tuesday'.\""
          : `A woman in a coat of reeds is stirring a pot that smells of pond and pepper. "${c.f.ally === "witch" ? "My favourite little arsonists." : "Come to be rude about my soup?"}"`,
        opts: [
          { label: "What's in the slop?", to: "slop" },
          { label: "Tell me about your brother.", to: "brother" },
          { label: "Teach me something.", to: "quest", if: (c) => !q(c, "mor_voice") },
          { label: "I've been shouting at the dead.", to: "questdone", if: (c) => ready(c, "mor_voice") },
          { label: "What's in the soup?", to: "soup" },
          { label: "Goodbye.", to: null },
        ],
      },
      slop: {
        text: (c) => has(c, "book") ? "\"I've told you already. Grave-dust and pig slop, and my missing book. Go and bother whoever has it.\"" : "She fishes a gobbet of slop out of her pocket, because of course she has one. \"Pig slop. Ordinary. But there's grave-dust in it. Slop and grave-dust wakes the dead. It's on page forty of my book.\"",
        opts: [
          { label: "Who else has read your book?", to: "book", if: (c) => !has(c, "book") },
          { label: "Back.", to: "start" },
        ],
      },
      book: {
        text: (c) => c.aff.morwen >= 1 || q(c, "mor_voice")?.done ? "\"Only one person ever borrowed it. Came down here in the spring in a very nice coat, asking about 'garden pests'. Never gave it back.\" She taps the gold chain drawn in the mud by her fire."
          : "\"Why should I tell you? You've not so much as complimented the soup.\"",
        opts: [
          { label: "Thank you, Morwen.", to: "start", if: (c) => c.aff.morwen >= 1 || q(c, "mor_voice")?.done, do: (c) => c.api.clue("book") },
          { label: "The soup is magnificent.", to: "book", if: (c) => c.aff.morwen < 1 && !q(c, "mor_voice")?.done, do: (c) => { c.aff.morwen += 1; } },
          { label: "Back.", to: "start" },
        ],
      },
      brother: {
        text: () => "\"Aldous? He thinks the fire is holy. I think it's a fire. We're both right, which is the most annoying possible outcome. He still makes our mother's bread, you know. Badly.\"",
        opts: [
          { label: "He misses you.", to: "start", do: (c) => { c.aff.morwen += 1; c.f.siblings = (c.f.siblings || 0) + 1; return c.f.siblings >= 2 ? "Aldous and Morwen might yet make peace..." : undefined; } },
          { label: "Back.", to: "start" },
        ],
      },
      soup: { text: () => "\"Pond. Pepper. A frog, who volunteered. And a secret ingredient, which is also a frog.\"", opts: [{ label: "Back.", to: "start" }] },
      quest: {
        text: () => "\"You have a voice in you. Everyone does. Most people use it to complain. Go out tonight and shout the dead backwards, twenty of them, and come back to me.\"",
        opts: [{ label: "FUS RO... okay.", to: "start", do: (c) => c.api.accept(c.p, "mor_voice") }, { label: "Not now.", to: "start" }],
      },
      questdone: {
        text: () => "She listens to your voice like it's weather. \"Good. Rougher than I'd like. Here.\" She blows into your mouth, which is disgusting, and your throat goes cold and clear.",
        opts: [{ label: "...thanks?", to: "start", do: (c) => { turnIn(c, "mor_voice"); c.p.shoutMult *= 0.75; c.aff.morwen += 2; return "Your shout recharges 25% faster, for good"; } }],
      },
    },
  },

  vex: {
    name: "Vex", role: "Travelling merchant", color: "#b05a8a", hat: "tophat",
    nodes: {
      start: {
        text: (c) => c.f.vex === "robbed" && !c.p.flags.vexSorry ? "Vex doesn't look up from his ledger. \"You have some nerve. Some nerve. Fifty gold and I'll pretend I don't know your face.\""
          : `"Friend! Customer! Friend-customer!" Vex spreads his arms. His coat has forty pockets and every one is full.`,
        opts: [
          { label: "Pay 50g to make peace.", to: "start", if: (c) => c.f.vex === "robbed" && !c.p.flags.vexSorry && c.p.gold >= 50, do: (c) => { c.api.gold(c.p, -50); c.p.flags.vexSorry = true; c.aff.vex += 1; } },
          { label: "Show me the good stuff.", to: "black", if: (c) => c.f.vex !== "robbed" || c.p.flags.vexSorry },
          { label: "You sold barrels to someone. Who?", to: "ledger", if: (c) => !has(c, "ledger") && (c.f.vex !== "robbed" || c.p.flags.vexSorry) },
          { label: "Why did you leave the valley?", to: "past", if: (c) => c.f.vex !== "robbed" || c.p.flags.vexSorry },
          { label: "Any work going?", to: "quest", if: (c) => !q(c, "vex_research") && (c.f.vex !== "robbed" || c.p.flags.vexSorry) },
          { label: "I opened those cases.", to: "questdone", if: (c) => ready(c, "vex_research") },
          { label: "Goodbye.", to: null },
        ],
      },
      black: {
        text: () => "He opens his coat. \"The Very Mysterious Case. Three hundred gold. Could be anything. Could be nothing! It's never nothing. It's often quite bad. But sometimes...\" He winks. \"Mythic.\"",
        opts: [
          { label: "Buy it (300g).", to: "start", if: (c) => c.p.gold >= 300, do: (c) => { c.api.gold(c.p, -300); c.api.blackCase(c.p); c.aff.vex += 1; } },
          { label: "Too rich for me.", to: "start" },
        ],
      },
      ledger: {
        text: (c) => q(c, "vex_research")?.done || c.aff.vex >= 2 ? "He flips back through the ledger. \"Twelve barrels of best pig slop. Spring. Paid out of the town treasury, signed M. Grubb. I did wonder what the Mayor wanted with that much slop. Didn't ask. Never ask. That's the Vex promise.\""
          : "\"Client confidentiality, friend. The Vex promise. Now, a loyal customer, on the other hand...\"",
        opts: [
          { label: "M. Grubb. Interesting.", to: "start", if: (c) => q(c, "vex_research")?.done || c.aff.vex >= 2, do: (c) => c.api.clue("ledger") },
          { label: "Back.", to: "start" },
        ],
      },
      past: {
        text: () => "For once he stops smiling. \"My grandfather was blamed for pushing the old Mayor down the well. Never proved it. Didn't matter. They ran us out. I came back because the slop was good business.\" He shrugs. \"And because I wanted to see the Grubbs sweat.\"",
        opts: [
          { label: "Did your grandfather do it?", to: "past2" },
          { label: "Back.", to: "start" },
        ],
      },
      past2: { text: () => "\"He always said the old Mayor jumped. Said he'd seen something down there, forty years ago. Something that hummed.\"", opts: [{ label: "...hummed?", to: "start", do: (c) => { c.aff.vex += 1; } }] },
      quest: {
        text: () => "\"Market research! I need to know if people love my Mystery Cases or merely adore them. Open two, from the store, and tell me how it felt.\"",
        opts: [{ label: "For science.", to: "start", do: (c) => c.api.accept(c.p, "vex_research") }, { label: "No.", to: "start" }],
      },
      questdone: {
        text: () => "\"And? Thrilling? Life-changing? I'll put 'life-changing' on the posters.\" He slips you a card. \"Loyalty card. Ten percent off everything. For life. Or until I go bankrupt.\"",
        opts: [{ label: "Pleasure.", to: "start", do: (c) => { turnIn(c, "vex_research"); c.p.discount += 0.1; c.aff.vex += 2; return "Vex loyalty card: 10% off everything in the store"; } }],
      },
    },
  },

  pell: {
    name: "Old Pell", role: "Gravedigger", color: "#8a8a7a", hat: "flatcap",
    nodes: {
      start: {
        text: (c) => `A bent old man leans on a shovel older than he is. "Four hundred and twelve," he says, by way of hello. "Graves. I've dug four hundred and twelve. ${c.f.path === "drink" ? "And you lot drank from the well. Four hundred and seventeen, then." : "Want to make it four hundred and thirteen?"}"`,
        opts: [
          { label: "Business must be good.", to: "biz" },
          { label: "Do the dead ever stay dead?", to: "dead" },
          { label: "Anything I can do for you?", to: "quest", if: (c) => !q(c, "pell_wake") },
          { label: "Here are your turnips.", to: "questdone", if: (c) => ready(c, "pell_wake") },
          { label: "Goodbye.", to: null },
        ],
      },
      biz: {
        text: (c) => q(c, "pell_wake")?.done || c.aff.pell >= 2 ? "\"Terrible, if you must know. Nobody stays in the ground long enough to pay. Only good money I made all year was grave-dust. Sold six sacks to the Mayor in spring. For his roses, he said.\" Pell spits. \"Grubb hasn't got roses.\""
          : "\"Hmph. Mind your business and I'll mind mine.\"",
        opts: [
          { label: "The Mayor, you say.", to: "start", if: (c) => q(c, "pell_wake")?.done || c.aff.pell >= 2, do: (c) => c.api.clue("dust") },
          { label: "Back.", to: "start" },
        ],
      },
      dead: {
        text: () => "\"They used to. Stayed nice and still, bless them. Since spring they wander off. I've had to start writing 'PLEASE STAY' on the headstones. Hasn't helped.\"",
        opts: [
          { label: "That's awful, Pell.", to: "start", do: (c) => { c.aff.pell += 1; } },
          { label: "Ha!", to: "start", do: (c) => { c.aff.pell -= 1; } },
        ],
      },
      quest: {
        text: () => "\"When I go, I want a proper wake. Turnip stew, and a lot of it. Grow me three turnips. I'll hold my own wake early, in case you lot don't survive to throw it.\"",
        opts: [{ label: "Three turnips. Got it.", to: "start", do: (c) => c.api.accept(c.p, "pell_wake") }, { label: "Not now.", to: "start" }],
      },
      questdone: {
        text: () => "Pell sniffs the turnips like fine wine. \"Good. Good soil. You'll make a fine corpse one day.\" From Pell, that's a compliment. He presses something into your hand: a gravedigger's lucky coin.",
        opts: [{ label: "Thank you, Pell.", to: "start", do: (c) => { turnIn(c, "pell_wake"); c.p.pts += 1; c.aff.pell += 2; return "+1 skill point"; } }],
      },
    },
  },

  haddock: {
    name: "Sergeant Haddock", role: "The entire town watch", color: "#5a6a8a", hat: "helmet",
    nodes: {
      start: {
        text: () => "A man in dented armour snaps a salute. \"Sergeant Haddock, town watch! Last of it. The rest were eaten. Or quit. Mostly eaten.\"",
        opts: [
          { label: "What happened to the watch?", to: "watch" },
          { label: "Give me a job, Sergeant.", to: "quest", if: (c) => !q(c, "had_pest") },
          { label: "Pest control done.", to: "pestdone", if: (c) => ready(c, "had_pest") },
          { label: "Got anything harder?", to: "quest2", if: (c) => q(c, "had_pest")?.done && !q(c, "had_marks") },
          { label: "Headshots done.", to: "marksdone", if: (c) => ready(c, "had_marks") },
          { label: "Any tips?", to: "tips" },
          { label: "Dismissed.", to: null },
        ],
      },
      watch: {
        text: (c) => q(c, "had_pest")?.done || c.aff.haddock >= 2 ? "His jaw tightens. \"Night it started, we got orders to guard the north wall. From the Mayor himself. First order he's ever given. Nothing came from the north. Everything came from the well.\""
          : "\"Classified. Prove yourself on the line and maybe I'll tell you.\"",
        opts: [
          { label: "Orders from the Mayor.", to: "start", if: (c) => q(c, "had_pest")?.done || c.aff.haddock >= 2, do: (c) => c.api.clue("watch") },
          { label: "Back.", to: "start" },
        ],
      },
      tips: {
        text: () => "\"Stand still when you shoot. First shot's always true, then it wanders. Aim for the middle of them, that's the head from up here. When you reload, do it again at the right moment, like a proper soldier. And never, ever shoot your mates. Unless they've got stars over their head. Then it's legal.\"",
        opts: [{ label: "Yes, Sergeant!", to: "start", do: (c) => { c.aff.haddock += 1; } }],
      },
      quest: {
        text: () => "\"Pest control. Thirty of the dead, put down proper. Come back when you've done it.\"",
        opts: [{ label: "Sir, yes sir!", to: "start", do: (c) => c.api.accept(c.p, "had_pest") }, { label: "Later.", to: "start" }],
      },
      pestdone: {
        text: () => "\"Thirty! Not bad for a farmer. Here. Requisitioned it from the armoury. Well. The armoury was a cupboard. I requisitioned it from the cupboard.\"",
        opts: [{ label: "Thank you, Sergeant.", to: "start", do: (c) => { turnIn(c, "had_pest"); c.api.crate(c.p, 2, "rifle"); c.aff.haddock += 2; return "An Epic Rifle crate drops at your feet"; } }],
      },
      quest2: {
        text: () => "\"Harder? Fifteen headshots. Clean ones. Show me you can aim.\"",
        opts: [{ label: "Consider it done.", to: "start", do: (c) => c.api.accept(c.p, "had_marks") }, { label: "Later.", to: "start" }],
      },
      marksdone: {
        text: () => "Haddock actually smiles. It's terrifying. \"You'd have made the watch, you would. This was my old captain's. Look after it.\"",
        opts: [{ label: "I will.", to: "start", do: (c) => { turnIn(c, "had_marks"); c.api.crate(c.p, 3, "sniper"); c.aff.haddock += 2; return "A Legendary Sniper crate drops at your feet"; } }],
      },
    },
  },
  // A celebrity passing through for one day only. Any resemblance to a real shouty TV chef is entirely affectionate.
  chef: {
    name: "Gordon Rampage", role: "Celebrity chef. Filming a show.", color: "#f0d0b0", hat: "chef", guest: true, ride: "limo",
    arrive: "A famous chef has rolled into the valley in a pink limo. He's only here until nightfall [E].",
    feed: "Gordon Rampage is filming in the valley today. Nobody invited him.",
    leave: "Gordon Rampage's limo roars off into the night. \"You've all been SHUT DOWN!\"",
    quips: ["IT'S RAW!", "DONKEY!", "SHUT IT DOWN!", "WHERE'S THE LAMB SAUCE?"],
    nodes: {
      start: {
        text: (c) => c.p.flags.raw ? "\"YOU AGAIN. Look at me. LOOK AT ME. Are you going to be sensible this time, you walking turnip?\""
          : "A man in chef's whites strides out of a pink limousine with a camera crew. \"Right. What IS this place? It smells like a bin had a baby with another bin. I'm here for one day for my new show, 'Nightmare Valley'. Impress me.\"",
        opts: [
          { label: "Welcome to the valley, Chef!", to: "welcome", if: (c) => !c.p.flags.raw },
          { label: "Could you judge our crops?", to: "quest", if: (c) => !c.q.chef_raw },
          { label: "Here's the harvest, Chef.", to: "questdone", if: (c) => ready(c, "chef_raw") },
          { label: "Can you cook something for the Hearth?", to: "cook", if: (c) => !c.f.chefCooked },
          { label: "Can I have your autograph?", to: "autograph", if: (c) => !c.p.flags.autograph },
          { label: "What do you think of Vex's slop?", to: "slop" },
          { label: "Your cooking is overrated, mate.", to: "insult" },
          { label: "Bye, Chef.", to: null },
        ],
      },
      welcome: {
        text: () => "He sniffs the air, then sniffs you. \"Welcome, he says. WELCOME. The dead are walking about and the mayor's serving canapés made of what I can only describe as regret. Stunning. Absolutely stunning television.\"",
        opts: [{ label: "Back.", to: "start", do: (c) => { c.aff.chef += 1; } }],
      },
      quest: {
        text: () => "\"Crops? Go on then. Four of them, fresh out of the ground, before I leave tonight. And if even ONE of them is raw, I'm putting it in the bin, and then I'm putting YOU in the bin.\"",
        opts: [{ label: "Yes, Chef!", to: "start", do: (c) => c.api.accept(c.p, "chef_raw") }, { label: "Maybe later.", to: "start" }],
      },
      questdone: {
        text: () => "He bites a turnip. Chews. Closes his eyes. The camera crew holds its breath. \"...That. Is. BEAUTIFUL. Finally, some good food in this godforsaken valley. Take this. I use it for the really stubborn onions.\"",
        opts: [{ label: "Thank you, Chef!", to: "start", do: (c) => { turnIn(c, "chef_raw"); c.api.crate(c.p, 3, "shotgun"); c.aff.chef += 2; c.api.deed("soil", 8); return "A Legendary Shotgun crate drops at your feet"; } }],
      },
      cook: {
        text: () => "\"For the Hearth? A proper meal for the whole valley? Fine. FINE. Stand back, and nobody touch the pan.\" He produces a Wellington from absolutely nowhere and throws it into the fire.",
        opts: [{ label: "Watch in awe.", to: "start", do: (c) => { c.f.chefCooked = true; c.api.healAll(); c.api.hearth(250); c.aff.chef += 1; c.api.story("Hearth Wellington", "Gordon Rampage cooks a Wellington in the Hearth. Everyone is healed, the Hearth grows by 250 and the whole valley smells incredible for about ten minutes."); return "Everyone healed. The Hearth grows by 250."; } }],
      },
      autograph: {
        text: () => "\"Autograph. Right. Where? On the forehead? Brilliant, hold still.\" He signs your forehead with a marker that smells like truffle oil.",
        opts: [{ label: "I'll never wash again.", to: "start", do: (c) => { c.p.flags.autograph = true; c.p.pts += 1; c.aff.chef += 1; return "+1 skill point. Your forehead reads 'IDIOT SANDWICH, LOVE GORDON'"; } }],
      },
      slop: {
        text: () => "His eye twitches. \"Slop? SLOP? I tasted it this morning and I have NEVER been so offended by a liquid. It's got grave-dust in it. GRAVE DUST. Somebody's been seasoning the well, and it's not me, because I would have used salt.\"",
        opts: [
          { label: "Grave-dust? Are you sure?", to: "slop2", if: (c) => c.clues.has("dust") },
          { label: "Back.", to: "start" },
        ],
      },
      slop2: {
        text: () => "\"Sure? I can taste the difference between four kinds of basil with my eyes shut. It's grave-dust and pig swill, and I'd bet my restaurants that whoever did it owns a very expensive handkerchief. You can always tell a man by his handkerchief.\"",
        opts: [{ label: "Interesting...", to: "start", do: (c) => { c.aff.chef += 1; c.api.deed("word", 5); } }],
      },
      insult: {
        text: () => "The whole camera crew gasps. Gordon goes very, very quiet. Then he takes a deep breath...",
        opts: [{ label: "Uh oh.", to: null, do: (c) => { c.p.flags.raw = true; c.aff.chef -= 2; c.api.raw(c.p); c.api.deed("blood", 3); return "\"IT'S RAAAAAAW!\""; } }],
      },
    },
  },
};

// The other celebrities who might turn up instead. All affectionate parodies; nobody here is real.
Object.assign(NPCS, {
  bear: {
    name: "Bear Gritts", role: "Survival expert. Will drink anything.", color: "#a08a5a", hat: "flatcap", guest: true, ride: "jeep",
    arrive: "A survival expert has parachuted into the valley. He's here until nightfall, eating things he shouldn't [E].",
    feed: "Bear Gritts has landed in the valley. He's already eaten a beetle.",
    leave: "Bear Gritts abseils out of the valley from a helicopter nobody saw arrive.",
    quips: ["IMPROVISE!", "HYDRATE!", "PROTEIN!", "ADAPT!"],
    nodes: {
      start: {
        text: (c) => c.q.bear_live && c.q.bear_live.done ? "\"You've got the instincts of a survivor. And the smell of one.\" He crunches something that is still moving."
          : "A man in a muddy fleece is chewing on a root. \"Out here, the valley is trying to kill you. The dead, the thirst, the hunger. The trick is to stay calm, stay positive, and drink your own wee.\"",
        opts: [
          { label: "Drink my own... what?", to: "pee" },
          { label: "Teach me to live off the land.", to: "quest", if: (c) => !c.q.bear_live },
          { label: "I've been eating what I grow.", to: "questdone", if: (c) => ready(c, "bear_live") },
          { label: "What's the worst thing you've ever eaten?", to: "worst" },
          { label: "Bye, Bear.", to: null },
        ],
      },
      pee: {
        text: () => "\"Out here, every drop counts. When nature calls, you answer it... into a bottle. Then later, when you're desperate, you drink it. It's not nice, but it'll keep you alive.\"",
        opts: [{ label: "Fill a bottle (uses your bladder)", to: "start", do: (c) => c.g.bottlePee(c.p) }, { label: "Absolutely not.", to: "start" }],
      },
      quest: {
        text: () => "\"Shop food is for tourists. Grow it, pull it out of the ground and eat it. Three times before I leave. Turnips count. Stew counts. Cook two turnips in the Hearth and you've got a hot meal.\"",
        opts: [{ label: "I'll do it.", to: "start", do: (c) => c.api.accept(c.p, "bear_live") }, { label: "Maybe later.", to: "start" }],
      },
      questdone: {
        text: () => "\"You're a natural. Here. These have walked me across three deserts and one very angry swamp.\"",
        opts: [{ label: "Thanks, Bear.", to: "start", do: (c) => { turnIn(c, "bear_live"); c.g.gear(c.p, "boots", 2); c.g.card(c.p, "bear"); c.aff.bear = (c.aff.bear || 0) + 2; c.api.deed("soil", 8); return "Epic Combat Boots and a Bear Gritts card"; } }],
      },
      worst: {
        text: () => "He thinks for a long time. \"A zombie's ear. Raw. Morwen dared me. ...Actually, it wasn't bad. Bit chewy. Tasted of regret and a little bit of chicken.\"",
        opts: [{ label: "Back.", to: "start", do: (c) => { c.aff.bear = (c.aff.bear || 0) + 1; } }],
      },
    },
  },
  boulder: {
    name: "The Boulder", role: "Wrestler. Actor. Eyebrow.", color: "#9a6a4a", hat: "none", guest: true, ride: "limo",
    arrive: "A very famous wrestler has arrived to film a zombie movie. He's here until nightfall [E].",
    feed: "The Boulder is in the valley, filming 'Jungle Slop 3'. One of his eyebrows is raised.",
    leave: "The Boulder's limo leaves. Somewhere, an eyebrow lowers.",
    quips: ["KNOW YOUR ROLE!", "SMELL THAT?", "IT DOESN'T MATTER!", "*raises eyebrow*"],
    nodes: {
      start: {
        text: (c) => c.p.flags.boulderLost ? "\"Back for more? The Boulder respects that. The Boulder does not respect your technique.\""
          : "A man the size of a wardrobe raises one eyebrow at you. \"Can you SMELL... what The Boulder... is cooking? It's turnips. Craft services is turnips. This valley is weird.\"",
        opts: [
          { label: "Arm wrestle me.", to: "wrestle" },
          { label: "Need any help with the movie?", to: "quest", if: (c) => !c.q.rock_smack },
          { label: "Twenty-five of the dead, down.", to: "questdone", if: (c) => ready(c, "rock_smack") },
          { label: "What's the movie about?", to: "movie" },
          { label: "See you, Boulder.", to: null },
        ],
      },
      wrestle: {
        text: () => "He slams an elbow on a hay bale. The hay bale gives up. \"Best of one. Loser gets thrown into the next field.\"",
        opts: [{ label: "Grip his enormous hand.", to: "start", do: (c) => { const r = c.g.wrestle(c.p); if (/throws/.test(r)) c.p.flags.boulderLost = true; return r; } }, { label: "On second thoughts...", to: "start" }],
      },
      quest: {
        text: () => "\"The script says I fight twenty-five zombies. The Boulder's insurance says I fight none. You fight them, and I'll be in the trailer, being inspirational.\"",
        opts: [{ label: "Deal.", to: "start", do: (c) => c.api.accept(c.p, "rock_smack") }, { label: "Maybe later.", to: "start" }],
      },
      questdone: {
        text: () => "\"You just did all your own stunts. The Boulder is... moved. Take this. Wardrobe department won't miss it.\"",
        opts: [{ label: "Thanks!", to: "start", do: (c) => { turnIn(c, "rock_smack"); c.g.gear(c.p, "plate", 2); c.g.card(c.p, "boulder"); c.aff.boulder = (c.aff.boulder || 0) + 2; c.api.deed("blood", 8); return "An Epic Plate Carrier and a Boulder card"; } }],
      },
      movie: {
        text: () => "\"It's about a man who is very strong and has to save a valley from zombies using only his strength and his eyebrow. It's based on a true story. Mine.\"",
        opts: [{ label: "Back.", to: "start" }],
      },
    },
  },
  david: {
    name: "Sir David Attenbarrow", role: "Naturalist. National treasure.", color: "#c8b890", hat: "cowboy", guest: true, ride: "jeep",
    arrive: "A beloved naturalist is filming the valley's wildlife (the dead). He's here until nightfall [E].",
    feed: "Sir David Attenbarrow is whispering at a shambler from behind a bush.",
    leave: "Sir David packs up his cameras. \"And so, as the sun sets on Slop Valley... the dead stir once more.\"",
    quips: ["*whispering*", "Remarkable.", "Extraordinary.", "And here... the shambler."],
    nodes: {
      start: {
        text: () => "An elderly man crouches in the grass, whispering. \"Here, in the valley... we find the farmer. Bewildered. Underfed. And yet, somehow... still standing. Remarkable.\"",
        opts: [
          { label: "Could you narrate my life?", to: "narrate" },
          { label: "What are you filming?", to: "quest", if: (c) => !c.q.dav_planet },
          { label: "I've found four kinds of the dead.", to: "questdone", if: (c) => ready(c, "dav_planet") },
          { label: "Are the dead... natural?", to: "nature" },
          { label: "Goodbye, Sir David.", to: null },
        ],
      },
      narrate: {
        text: () => "\"The farmer stands in the mud, clutching a weapon it barely understands. It is frightened. It is hungry. But look closer... it is magnificent.\"",
        opts: [{ label: "*Weep quietly*", to: "start", do: (c) => c.g.calm(c.p) }],
      },
      quest: {
        text: () => "\"Planet Slop. A documentary about the valley's most... extraordinary creatures. I need footage of four different kinds of the dead. Ideally, while you are killing them.\"",
        opts: [{ label: "I'll get your footage.", to: "start", do: (c) => c.api.accept(c.p, "dav_planet") }, { label: "Maybe later.", to: "start" }],
      },
      questdone: {
        text: () => "\"Extraordinary footage. The boomer sequence alone... Here. These cards came free with my last series. And this, for the radiation. One never knows.\"",
        opts: [{ label: "Thank you, Sir David.", to: "start", do: (c) => { turnIn(c, "dav_planet"); c.g.pack(c.p); c.g.card(c.p, "david"); c.g.gear(c.p, "gasmask", 2); c.aff.david = (c.aff.david || 0) + 2; c.api.deed("word", 8); return "A card pack, a Sir David card and an Epic Gas Mask"; } }],
      },
      nature: {
        text: () => "\"Nothing that comes up out of a well is natural, my dear. But it is... fascinating. They are drawn to the Hearth, as moths are drawn to a flame. Or as I am drawn to a good badger.\"",
        opts: [{ label: "Back.", to: "start" }],
      },
    },
  },
  warren: {
    name: "Warren Muffett", role: "The world's richest investor. Drinks slop cola.", color: "#4a5a7a", hat: "tophat", guest: true, ride: "limo",
    arrive: "The world's richest investor is touring the valley's businesses. He's here until nightfall [E].",
    feed: "Warren Muffett is in the valley, looking for undervalued turnips.",
    leave: "Warren Muffett's limo leaves. He has bought the road it drove out on.",
    quips: ["Buy the dip!", "Be greedy...", "Compound interest!", "*sips cola*"],
    nodes: {
      start: {
        text: () => "An old man in a cheap suit is sipping a Slop Cola and reading the share prices. \"Rule one: never lose money. Rule two: never forget rule one. Rule three: this cola is excellent value.\"",
        opts: [
          { label: "Any stock tips?", to: "tip" },
          { label: "Teach me to invest.", to: "quest", if: (c) => !c.q.war_buy },
          { label: "I bought my twenty shares.", to: "questdone", if: (c) => ready(c, "war_buy") },
          { label: "Spare a fiver?", to: "fiver", if: (c) => !c.p.flags.fiver },
          { label: "Bye, Warren.", to: null },
        ],
      },
      tip: { text: (c) => c.g.tip(c.p), opts: [{ label: "Thanks!", to: "start" }] },
      quest: {
        text: () => "\"Open the market (M) and buy twenty shares in anything you understand. If you don't understand anything, buy the farmers. People always need turnips.\"",
        opts: [{ label: "I'm on it.", to: "start", do: (c) => c.api.accept(c.p, "war_buy") }, { label: "Maybe later.", to: "start" }],
      },
      questdone: {
        text: () => "\"Look at you. A shareholder. Here's a little something to compound.\"",
        opts: [{ label: "Thanks, Warren.", to: "start", do: (c) => { turnIn(c, "war_buy"); c.api.gold(c.p, 250); c.g.card(c.p, "warren"); c.aff.warren = (c.aff.warren || 0) + 2; c.api.deed("coin", 10); return "+250g and a Warren Muffett card"; } }],
      },
      fiver: { text: () => "He sighs deeply, the sigh of a man who once bought a railway.", opts: [{ label: "Back.", to: "start", do: (c) => { c.p.flags.fiver = true; return c.g.fiver(c.p); } }] },
    },
  },
});

export function npcLines(f, aff) {
  const lines = [];
  if (f.siblings >= 2) lines.push("Brother Aldous and Morwen shared a pot of bad bread and worse soup. It was the first time in eleven years. It will not be the last.");
  if (aff.pell >= 3) lines.push("Old Pell got his wake early, and then lived another nine years out of spite.");
  if (aff.haddock >= 3) lines.push("Sergeant Haddock rebuilt the town watch. It has four members now, all of them wearing your old hats.");
  if (aff.vex >= 3) lines.push("Vex named his next shop after you. It sells mostly slop.");
  if (aff.bear >= 2) lines.push("Bear Gritts' new series opens with you, drinking from a bottle you'd rather not talk about.");
  if (aff.boulder >= 2) lines.push("'Jungle Slop 3' made a billion gold. You're credited as 'Farmer Who Did All The Stunts'.");
  if (aff.david >= 2) lines.push("'Planet Slop' won every award going. The boomer sequence made grown men cry.");
  if (aff.warren >= 2) lines.push("Warren Muffett bought the valley's farmers' co-op. He kept the turnip prices low. Mostly.");
  if (aff.chef >= 3) lines.push("Gordon Rampage's show 'Nightmare Valley' won an award. You're in the trailer. So is the well.");
  else if (aff.chef < 0) lines.push("Gordon Rampage's show aired. The only clip anyone shares is of him shouting you into a hedge.");
  if (f.exposed) lines.push("Mayor Grubb spent a month in the stocks and was re-elected anyway. Politics.");
  else if (f.blackmail) lines.push("Mayor Grubb is still paying. He always will be.");
  else if (f.pardoned) lines.push("Mayor Grubb kept his promise and paid for everything. He's a better mayor for it. Slightly.");
  else if (f.clueCount >= 2) lines.push("Nobody ever found out who poisoned the well. A few people had their suspicions. Mostly about the handkerchief.");
  return lines;
}
