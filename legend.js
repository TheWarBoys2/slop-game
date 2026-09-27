// The valley watches what you actually do, not just what you vote for.
// Four kinds of deed pile up over the run. Whichever the valley notices most becomes your legend,
// and the legend bends the story: the Reckoning on day 3, the Trial, the last day's plan and the epilogue.
// `api` is provided by the server (see legendApi in server.js).

export const LEGENDS = {
  blood: { title: "the Butchers", color: "#ff6a5a", blurb: "You kill things. A lot of things. Sometimes each other." },
  soil:  { title: "the Wardens", color: "#7fd34d", blurb: "You plant, build and mend. The valley feels safer with you in it." },
  coin:  { title: "the Company", color: "#ffd34d", blurb: "You buy, sell, gamble and hoard. Everything has a price." },
  word:  { title: "the Inquisitors", color: "#c9a0ff", blurb: "You talk to everyone, and you remember what they say." },
};
const WEIGHT = { blood: 1, soil: 1.1, coin: 1.1, word: 1.2 }; // talking is quieter than shooting

export function legendOf(deeds) {
  let best = null, bv = 8; // do nothing notable and the valley ignores you
  for (const k of Object.keys(LEGENDS)) { const v = deeds[k] * WEIGHT[k]; if (v > bv) { bv = v; best = k; } }
  return best;
}
export const legendName = (k, V) => k ? `${LEGENDS[k].title.replace("the ", "The ")} of ${V}` : `the Nobodies of ${V}`;

// Dawn of day 3: the valley decides what you are.
export function reckoning(k, api) {
  const V = api.valley;
  if (k === "blood") { api.mods.dmg *= 1.1; api.mods.zCount *= 1.1; return { title: "The Reckoning", text: `The townsfolk have started calling you the Butchers of ${V}. Children hide when you walk past. The dead have noticed too: more of them come each night, drawn to the smell of you. (+10% damage, +10% more dead)` }; }
  if (k === "soil") { api.mods.hearthRegen += 3; api.mods.grow *= 1.3; return { title: "The Reckoning", text: `People have started calling you the Wardens of ${V}. They leave bread on the Hearth and sow your fields when you're not looking. (The Hearth slowly heals, crops grow 30% faster)` }; }
  if (k === "coin") { api.mods.discount += 0.15; api.hearthMax(-150); return { title: "The Reckoning", text: `Vex has printed shares in you. The whole valley calls you the Company now, and everything is for sale, including the stones of the Hearth. (Shop prices -15%, the Hearth loses 150 max health)` }; }
  if (k === "word") { const c = api.freeClue(); api.points(1); return { title: "The Reckoning", text: `You've asked so many questions that people call you the Inquisitors of ${V}. Someone slips a note under the Hearth door: ${c ? `"${c}"` : '"You already know everything I know."'} (+1 skill point each${c ? ", new evidence" : ""})` }; }
  return { title: "The Reckoning", text: `Two nights in, and nobody in ${V} can say what you're like. You haven't killed enough, built enough, spent enough or asked enough for anyone to notice. The valley shrugs. (Nothing changes. Yet.)` };
}

// Day 4 is hijacked if you keep shooting each other.
export function trialEvent(api) {
  const worst = api.worstTeamkiller();
  if (!worst) return null;
  const n = api.fullName(worst);
  return {
    title: "The Trial",
    text: `Mayor Grubb has built a gallows out of your fence. "The valley has counted ${api.teamkills()} of you killed by your own side," he announces, "and most of them by ${n}." The crowd wants justice, or at least a show.`,
    choices: [
      { label: `Hang ${n}`, desc: "They die. Everyone else gets their gold.", deed: ["blood", 10], go: () => { const g = worst.gold; api.killPlayer(worst, "hanged by popular demand"); for (const p of api.players()) if (p !== worst) api.giveGold(p, Math.floor(g / Math.max(1, api.players().length - 1))); worst.gold = 0; api.flags.trial = "hanged"; return `${n} swings. Their gold is split among the rest of you. Their heir looks at you all very carefully.`; } },
      { label: "Pardon them", desc: "Everyone's wanted stars clear.", deed: ["word", 8], go: () => { api.flags.trial = "pardoned"; api.stars(0); return `Brother Aldous talks the crowd down. ${n} is pardoned, and all bounties are cleared. Grubb looks disappointed about his gallows.`; } },
      { label: "Blame the Mayor", desc: "Grubb gets pelted. You get a skill point.", deed: ["word", 5], go: () => { api.flags.trial = "mayor"; api.points(1); return "It was the Mayor's lax policing, you argue. The crowd agrees, a bit too eagerly. Grubb spends the afternoon in the stocks. (+1 skill point each)"; } },
    ],
  };
}

// The last day gets one extra plan, depending on what you've become.
export function legendChoice(k, api) {
  if (k === "blood") return { label: "Hunt it before it arrives", desc: "It starts wounded. Tonight is busier.", go: () => { api.flags.prep = "hunt"; api.mods.bossHp *= 0.75; api.mods.zCount *= 1.2; return "You spend the day hunting its spawn in the hills. Whatever is coming tonight is coming in angry, and already bleeding."; } };
  if (k === "soil") return { label: "Wall in the Hearth", desc: "A ring of walls goes up for free.", go: () => { api.flags.prep = "walls"; const n = api.wallHearth(); return `The whole town turns out with planks and nails. ${n} wall sections go up around the Hearth by sundown.`; } };
  if (k === "coin") return { label: "Hire Vex's mercenaries", desc: "-100g each. Two free turrets by the Hearth.", go: () => { api.flags.prep = "mercs"; api.gold(-100); api.turrets(2); return "Vex's 'mercenaries' turn out to be two turrets and a receipt. They work, though."; } };
  if (k === "word") return { label: "Rally the townsfolk", desc: "Everyone who likes you pitches in.", go: () => { api.flags.prep = "rally"; const n = api.friends(); api.hearthMax(150 * n); api.repair(); api.heal(); return n ? `${n} of the townsfolk turn up with pitchforks, buckets and opinions. The Hearth grows by ${150 * n}.` : "Nobody turns up. It turns out asking people questions isn't the same as being liked."; } };
  return null;
}

// The epilogue: what history calls you, and whether it matches what they called you at the Reckoning.
export function legendLines(win, k, early, f, V, deeds) {
  const lines = [];
  const name = legendName(k, V);
  if (!k) lines.push(`History forgets you almost entirely. A footnote mentions "some farmers".`);
  else if (win) lines.push({
    blood: `They remember you as ${name}. The songs are mostly about the smell.`,
    soil: `They remember you as ${name}. Your fields are still farmed, your walls still stand, and the Hearth still burns.`,
    coin: `They remember you as ${name}. Your portraits hang in every one of Vex's shops, priced to sell.`,
    word: `They remember you as ${name}. Every secret in the valley ended up in your journal, and a few of them are still there.`,
  }[k]);
  else lines.push({
    blood: `The last entry in the church records calls you ${name}. It is not a compliment.`,
    soil: `Weeds grow over the walls you built. Even ${name} couldn't save it.`,
    coin: `Vex sells the ruins by the square foot. ${name} had a very good quarter, right up until the end.`,
    word: `You asked everyone in the valley everything. Nobody asked the Hearth how it was doing.`,
  }[k]);
  if (early && k && early !== k) lines.push(`Funny thing: at the Reckoning they called you ${LEGENDS[early].title}. People change. Mostly for the ${k === "blood" ? "worse" : "better"}.`);
  if (f.trial === "hanged") lines.push("The gallows still stands on the green. Nobody has the heart to take it down.");
  if (deeds.tk >= 6) lines.push(`${deeds.tk} of you died by friendly fire. The Hearth-Church now teaches it as a warning.`);
  return lines;
}
