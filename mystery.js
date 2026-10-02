// Who poisoned the well? A different townsperson each game. SPOILERS, like story.js.
// The five clue slots always come from the same witnesses (Pell, Vex, Morwen, Haddock, Aldous), but what they say
// depends on who did it. When the culprit is the witness, their "clue" is a slip they can't explain away.
// Each culprit raised a different horror, so the final boss is always the payoff for solving it.

export const SLOTS = { dust: "pell", ledger: "vex", book: "morwen", watch: "haddock", confess: "aldous" };

export const SUSPECTS = {
  grubb: {
    name: "Mayor Grubb", short: "the Mayor", color: "#c9a46a", hat: "tophat", boss: "drowned",
    said: {
      dust: "\"Only good money I made all year was grave-dust. Sold six sacks to the Mayor in spring. For his roses, he said.\" Pell spits. \"Grubb hasn't got roses.\"",
      ledger: "He flips back through the ledger. \"Twelve barrels of best pig slop. Spring. Paid out of the town treasury, signed M. Grubb. I did wonder what the Mayor wanted with that much slop. Didn't ask. Never ask.\"",
      book: "\"Only one person ever borrowed it. Came down here in the spring in a very nice coat, asking about 'garden pests'. Never gave it back.\" She taps the gold chain drawn in the mud by her fire.",
      watch: "His jaw tightens. \"Night it started, we got orders to guard the north wall. From the Mayor himself. First order he's ever given. Nothing came from the north. Everything came from the well.\"",
      confess: "He leans close. \"I will say only this. It was a man of high office. He confessed twice, and wept both times, and he left a very expensive handkerchief in the booth.\"",
    },
    label: { dust: "The Mayor, you say.", ledger: "M. Grubb. Interesting.", book: "A gold chain...", watch: "Orders from the Mayor.", confess: "Thank you, Brother." },
    clue: {
      dust: "Pell sold six sacks of grave-dust to Mayor Grubb. Grubb said it was 'for the roses'. Grubb has no roses.",
      ledger: "Vex's ledger: twelve barrels of pig slop sold to M. Grubb, paid for out of town funds.",
      book: "Slop plus grave-dust wakes the dead. It's in Morwen's book. Someone in a gold chain of office borrowed it in spring and never gave it back.",
      watch: "The night it began, Grubb ordered the town watch to the north wall. It's the only order he has ever given.",
      confess: "Brother Aldous cannot break the seal of confession, but he will say a man of high office confessed. Twice. And cried into an expensive handkerchief.",
    },
    motive: "Grubb sits down heavily on a turnip crate. \"I just wanted people to need me. Nobody needs a mayor when nothing happens. So I made something happen. I poured it all in Grandfather's well, and... and I think I woke him up.\"",
    bossLine: "The slop Grubb poured into the well has raised his grandfather, the Drowned Mayor, and his whole drowned council with him.",
    fate: {
      exposed: "Grubb spent a month in the stocks and was re-elected anyway. Politics.",
      blackmail: "Grubb is still paying. He always will be.",
      pardoned: "Grubb kept his promise and paid for everything. He's a better mayor for it. Slightly.",
      unmasked: "Grubb confessed in front of the whole valley, then fainted into the turnips. Nobody voted for him again.",
    },
  },
  vex: {
    name: "Vex", short: "the merchant", color: "#7a3fa0", hat: "fedora", boss: "golem",
    said: {
      dust: "\"Only good money I made all year was grave-dust. Sold six sacks to that merchant, Vex. Said it was for polishing brass.\" Pell spits. \"Paid me in store coupons.\"",
      ledger: "He flips back through the ledger, then stops. One page has been torn out: the week in spring the well turned black. \"Mice,\" he says, a little too fast. \"Very literate mice.\"",
      book: "\"Only one person ever borrowed it. A man with a cart and a very wide smile, asking how you'd make brass get up and walk. Never gave it back.\" She draws a coin in the mud by her fire.",
      watch: "His jaw tightens. \"Night it started, a cart went past the gate at midnight, heading for the well, rattling like a sack of spanners. Vex's cart. Said he was making a delivery.\"",
      confess: "He leans close. \"Someone came to confess about the well. They tried to pay for absolution. In coupons. Store coupons, with a little smiling face on them.\"",
    },
    label: { dust: "Vex, you say.", ledger: "Literate mice. Sure.", book: "Brass that walks...", watch: "Vex's cart.", confess: "Thank you, Brother." },
    clue: {
      dust: "Pell sold six sacks of grave-dust to Vex in spring. Vex said it was 'for polishing brass' and paid in store coupons.",
      ledger: "Vex's ledger is missing exactly one page: the week the well turned black. He blames mice.",
      book: "Slop plus grave-dust wakes the dead. It's in Morwen's book. A merchant with a wide smile borrowed it, asking how to make brass walk.",
      watch: "The night it began, Vex's cart rattled past the gate at midnight, heading for the well. 'A delivery', he said.",
      confess: "Brother Aldous cannot break the seal of confession, but whoever confessed about the well tried to pay for absolution in store coupons.",
    },
    motive: "Vex drops the smile. \"Your grandparents ran my family out of this valley. So I came back with a business plan. The dead buy nothing, but the living buy everything when they're scared. Tins, guns, insurance. And when it all goes wrong, who do they call? The man who built the golem.\"",
    bossLine: "Vex built his Brass Golem to sell you the solution to his own problem. Now it's loose, and it doesn't take coupons.",
    fate: {
      exposed: "Vex was run out of the valley, just like his grandfather. He still sends a catalogue every Christmas.",
      blackmail: "Vex pays you a cut of every sale. It's the most honest money he's ever handled.",
      pardoned: "Vex gave every penny back. Then he sold you the receipts.",
      unmasked: "Vex was caught with a wagon of brass parts and a sign saying GOLEM INSURANCE. He's banned from the valley for life. He has a shop just over the border.",
    },
  },
  morwen: {
    name: "Morwen of the Reeds", short: "the witch", color: "#5a8a5a", hat: "witch", boss: "leshen",
    said: {
      dust: "\"Only good money I made all year was grave-dust. Sold six sacks to the witch in the reeds.\" Pell spits. \"Paid me in soup. Terrible soup.\"",
      ledger: "He flips back through the ledger. \"Twelve barrels of best pig slop, delivered to the reeds in spring. Paid in... herbs. Strong herbs. I've not been right since.\"",
      book: "She snaps the book shut, but not before you see the page: the rite that wakes the dead, its margins thick with fresh ash. \"For reference,\" she says. \"Everyone needs a reference.\"",
      watch: "His jaw tightens. \"Night it started, someone was singing at the well. A woman's voice, coming up from the reeds. My lads were too scared to go and look. So was I.\"",
      confess: "He looks at his hands. \"My sister came to the booth for the first time in eleven years. She didn't ask to be forgiven. She asked what the Hearth would do if the old god woke. I can't say more.\"",
    },
    label: { dust: "The witch, you say.", ledger: "Strong herbs.", book: "For reference.", watch: "Singing at the well.", confess: "Your sister..." },
    clue: {
      dust: "Pell sold six sacks of grave-dust to Morwen in spring. She paid in soup.",
      ledger: "Vex's ledger: twelve barrels of pig slop delivered to the reeds, paid for in herbs.",
      book: "Morwen's book was open at the rite that wakes the dead, with fresh ash in the margins. She says it's 'for reference'.",
      watch: "The night it began, the watch heard a woman singing at the well, from the direction of the reeds.",
      confess: "Morwen went to Brother Aldous's booth for the first time in eleven years, asking what the Hearth would do if the old god woke.",
    },
    motive: "Morwen laughs, and the reeds laugh with her. \"Your Hearth-Church burned my teachers. Your mayor's family drained my bog. I only asked the old god under the well to remind you whose valley this is. I didn't think he'd be so... enthusiastic.\"",
    bossLine: "Morwen's rite woke the Slop Leshen, the rotten god under the well, and it remembers every one of you.",
    fate: {
      exposed: "Morwen was driven out of the reeds. Every spring they grow back in the shape of a rude gesture.",
      blackmail: "Morwen pays you in soup, every week, forever. Nobody is sure who's punishing whom.",
      pardoned: "Morwen and Brother Aldous share a pot of soup every Sunday now. The old god sleeps. Mostly.",
      unmasked: "Morwen walked into the reeds singing and never came out. The well still hums her tune.",
    },
  },
};
export const SUSPECT_IDS = Object.keys(SUSPECTS);
export const pickCulprit = () => SUSPECT_IDS[(Math.random() * SUSPECT_IDS.length) | 0];
export const culpritOf = (f) => SUSPECTS[f.culprit] || SUSPECTS.grubb;

// what a wrongly accused suspect says
export const WRONG = {
  grubb: "Grubb goes purple. \"ME? I've never done anything in my life! Ask anyone!\" A crowd has gathered. They are not on your side.",
  vex: "Vex laughs until he coughs. \"Friend, if I'd done it, I'd have charged admission.\" Everyone in earshot thinks less of you.",
  morwen: "Morwen spits in the fire and it turns green. \"Always the witch. Always.\" The reeds go silent, and so does everyone else.",
};
