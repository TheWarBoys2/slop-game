// The story of the valley. Each morning the survivors vote on what to do next.
// Choices set flags that shape later mornings, the final night and the ending.
// `api` is provided by the server: { players, mods, flags, crate, hearthMax, heal, gold, stars, points, killPlayer, eliteNow, fullName, legend, teamkills, ... }
// A choice's `deed` feeds the legend (see legend.js), so how you vote shapes what the valley thinks of you too.
import { trialEvent, legendChoice } from "./legend.js";

const CAST = {
  mayor: "Mayor Grubb",
  priest: "Brother Aldous",
  witch: "Morwen of the Reeds",
  vex: "Vex the merchant",
};

export function valleyName(rng) {
  const a = ["Mud", "Grim", "Slop", "Rot", "Bog", "Gloom", "Turnip", "Ashen", "Wither", "Moss"];
  const b = ["bottom", "wick", "dale", "mire", "hollow", "ford", "stead", "worth", "combe", "hithe"];
  return a[(rng() * a.length) | 0] + b[(rng() * b.length) | 0];
}

export function storyEvent(day, api) {
  const f = api.flags;
  const V = f.valley;
  if (day === 1) return {
    title: "The Well",
    text: `Three weeks ago, black slop began bubbling up from the old well in the middle of ${V}. Since then, the dead won't stay buried. ${CAST.mayor} has called a town meeting, and everyone is looking at you. (In the corner, Sergeant Haddock's wireless mutters about a war nobody here asked for.)`,
    choices: [
      { label: "Seal the well with stone", desc: "The Hearth grows stronger.", deed: ["soil", 10], go: () => { f.path = "seal"; api.hearthMax(300); return "You pour stone into the well until it stops gurgling. Somewhere far below, something groans. The Hearth burns brighter."; } },
      { label: "Drink from it", desc: "You get tougher. So do they.", deed: ["blood", 10], go: () => { f.path = "drink"; api.mods.hpBonus += 25; api.mods.zHp *= 1.1; api.heal(); return "It tastes like pennies and regret. You feel... sturdier. Out in the dark, something feels you too."; } },
      { label: `Bottle it and sell it to Vex`, desc: "Quick money. No questions.", deed: ["coin", 15], go: () => { f.path = "sell"; api.gold(120); return `${CAST.vex} pays in shiny coin and doesn't ask what it's for. Neither do you. (+120g each)`; } },
    ],
  };
  if (day === 2) {
    if (f.path === "seal") return {
      title: "Stone and Smoke",
      text: `${CAST.priest} of the Hearth-Church says the seal will crack without prayer. ${CAST.witch} laughs from the reeds: "Prayer is for people who don't own fire."`,
      choices: [
        { label: "Side with the Church", desc: "The Hearth slowly heals itself.", deed: ["word", 8], go: () => { f.ally = "church"; api.mods.hearthRegen += 4; return "The bells ring. Aldous blesses the Hearth, and the stones knit themselves back together overnight."; } },
        { label: "Side with the Witch", desc: "Louder shouts, harder hits.", deed: ["blood", 6], go: () => { f.ally = "witch"; api.mods.shoutCd *= 0.7; api.mods.dmg *= 1.1; return "Morwen paints ash on your foreheads. Your voices carry further now. The priest is not pleased."; } },
      ],
    };
    if (f.path === "drink") return {
      title: "The Same Dream",
      text: "Everyone who drank dreams the same dream: a drowned man in a chain of office, pointing at the northern treeline.",
      choices: [
        { label: "Follow the dream", desc: "Something is buried up north.", deed: ["word", 6], go: () => { f.dream = "follow"; for (let i = 0; i < 3; i++) api.crate(2, { x: 400 + i * 800, y: 120 }); return "You dig where he pointed and find three rotten chests. Epic loot waits along the northern edge of the valley."; } },
        { label: "Drink deeper", desc: "More power. More of them.", deed: ["blood", 8], go: () => { f.dream = "deeper"; api.mods.dmg *= 1.15; api.mods.zCount *= 1.15; return "You drink until the dream goes quiet. Your aim is steadier, your hands hit harder, and the dead are coming in greater numbers."; } },
      ],
    };
    return {
      title: "Vex Returns",
      text: `${CAST.vex} rolls back into ${V} with an empty cart and a full smile, and opens his General Store by the Hearth before anyone can stop him. He wants more slop, and he's brought a crate of 'surplus' guns to trade. "Business is booming," he says. "Everyone's buying tins. Something about bombs."`,
      choices: [
        { label: "Trade fairly", desc: "A good gun for everyone.", deed: ["coin", 6], go: () => { f.vex = "trade"; for (const p of api.players()) api.crate(2 + (Math.random() < 0.3 ? 1 : 0), p); return "Vex shakes every hand twice. Fresh crates appear at everyone's feet."; } },
        { label: "Rob him blind", desc: "Rich, wanted, and he'll remember.", deed: ["coin", 12], go: () => { f.vex = "robbed"; api.gold(200); api.stars(3); return "You take the guns, the gold and his hat. Vex swears revenge. Vex is very good at revenge. (+200g each, and you're all wanted)"; } },
      ],
    };
  }
  if (day === 3) {
    const ps = api.players();
    return {
      title: "The Mayor's Census",
      text: `${CAST.mayor} wants a Champion of ${V} to lead the defence: someone to put on the posters and blame afterwards. Vote for one of you. ${api.dome()[0] >= api.dome()[1] ? "He also unveils the finished Hearth Dome, and takes the credit." : `He adds, quietly, that the Hearth Dome fund stands at ${api.dome()[0]} of ${api.dome()[1]} gold, and the radio is getting worse.`}`,
      choices: [
        ...ps.map((p) => ({ label: api.fullName(p), desc: "Crown them Champion.", go: () => { f.champion = p.id; f.championName = api.fullName(p); p.champion = true; api.heal(); return `${api.fullName(p)} is crowned Champion of ${V}: +50 max HP and +30% damage. Grubb has already ordered the statue.`; } })),
        { label: "Nobody. We're a collective.", desc: "Everyone gets a little stronger.", go: () => { f.champion = 0; api.mods.dmg *= 1.1; return "Grubb sighs and cancels the statue. Everyone fights a little harder for the collective. (+10% damage)"; } },
      ],
    };
  }
  if (day === 4) {
    if (api.teamkills() >= 3 && !f.trial) { const trial = trialEvent(api); if (trial) return trial; }
    if (f.ally === "church") return {
      title: "The Tithe",
      text: `${CAST.priest} says the blessing has a price: fifty gold each, for the roof. Morwen watches from the reeds, grinning.`,
      choices: [
        { label: "Pay the tithe", desc: "-50g each. The Hearth grows mighty.", deed: ["soil", 6], go: () => { f.tithe = "paid"; api.gold(-50); api.hearthMax(250); api.repair(); return "The coins clink into the plate. The Hearth roars back to full strength and grows larger still."; } },
        { label: "Steal the collection plate", desc: "+80g each. No more healing.", deed: ["coin", 10], go: () => { f.tithe = "stolen"; api.gold(80); api.mods.hearthRegen = 0; return "You run with the plate. The blessing stops working, but the gold keeps working just fine."; } },
      ],
    };
    if (f.ally === "witch") return {
      title: "Morwen's Price",
      text: `${CAST.witch} can bind the dead so tonight's horde is thin. Her price: "One heir. I'm not fussy which."`,
      choices: [
        { label: "Give her an heir", desc: "Someone dies. Tonight is much quieter.", deed: ["blood", 12], go: () => { f.price = "paid"; const ps = api.players(); const v = ps.find((p) => p.id === f.champion) || ps[(Math.random() * ps.length) | 0]; if (v) api.killPlayer(v, "given to the witch"); api.mods.nightCut = 0.5; return `${v ? api.fullName(v) : "Someone"} walks into the reeds and does not come back. The dead will be scarce tonight.`; } },
        { label: "Refuse", desc: "She leaves. You learn from her anyway.", deed: ["word", 5], go: () => { f.price = "refused"; api.mods.shoutCd = Math.min(1, api.mods.shoutCd / 0.7); api.points(1); return "Morwen shrugs and drifts off into the mist. Her tricks fade, but you've picked up a thing or two. (+1 skill point each)"; } },
      ],
    };
    if (f.path === "drink") return {
      title: "The Drowned Mayor",
      text: `The man from your dreams walks out of the woods, dripping. It's the old mayor, ${CAST.mayor}'s grandfather, dead forty years. "Let me back into my well," he gurgles, "and I'll keep the others quiet."`,
      choices: [
        { label: "Let him in", desc: "He'll be waiting on the last night. You'll be faster.", deed: ["word", 5], go: () => { f.drowned = "let"; api.mods.speed *= 1.15; return "He climbs into the well and sinks without a ripple. Your legs feel light. You have a feeling you'll see him again."; } },
        { label: "Put him down now", desc: "Fight him in daylight for a Mythic reward.", deed: ["blood", 8], go: () => { f.drowned = "killed"; api.eliteNow(); return "He screams, and the scream is a drain unclogging. KILL HIM before nightfall. He carries something Mythic."; } },
      ],
    };
    if (f.vex === "trade") return {
      title: "Insurance",
      text: `${CAST.vex} has a new product: Heir Insurance. "Sixty gold, and when you die, your kids inherit everything. Tax-free. Very legal."`,
      choices: [
        { label: "Buy insurance", desc: "-60g each. No more inheritance tax.", deed: ["coin", 8], go: () => { f.insured = true; api.gold(-60); api.mods.taxFree = true; return "Vex hands out very official-looking paper. Your heirs will inherit every coin."; } },
        { label: "Decline politely", desc: "Keep the money. Vex sulks.", deed: ["soil", 4], go: () => { f.insured = false; api.points(1); return "Vex mutters about 'poor planning'. You spend the afternoon training instead. (+1 skill point each)"; } },
      ],
    };
    return {
      title: "Vex's Revenge",
      text: `A letter nailed to the Hearth: "I have hired the dead. They work for cheap. Pay me back, 150 each, or tonight gets expensive. — V."`,
      choices: [
        { label: "Pay him back", desc: "-150g each. Stars cleared.", deed: ["coin", 5], go: () => { f.revenge = "paid"; api.gold(-150); api.stars(0); return "You leave the gold in a sack by the road. By morning it's gone, and so are your bounties."; } },
        { label: "Tell him to get lost", desc: "Tonight is 30% busier. He's building something.", deed: ["blood", 6], go: () => { f.revenge = "defied"; api.mods.zCount *= 1.3; api.mods.bossHp *= 1.3; return "You write something rude on the back of the letter and nail it to a zombie. Out in the hills, a furnace starts glowing."; } },
      ],
    };
  }
  if (day === 5) {
    const boss = bossKind(f);
    const who = { leshen: "THE SLOP LESHEN, the rotten god under the well", drowned: "THE DROWNED MAYOR, risen with his whole council", golem: "VEX'S BRASS GOLEM, steam pouring from its joints" }[boss];
    return {
      title: "The Last Day",
      text: `The birds have gone quiet. Tonight ${who} is coming for the Hearth. Haddock's wireless plays nothing but a long, flat tone, which he says means the bombs come tonight too. ${api.dome()[0] >= api.dome()[1] ? "At least the Dome is up." : `The Dome stands at ${api.dome()[0]} of ${api.dome()[1]} gold.`} You have one day to prepare. What's the plan?`,
      choices: [
        { label: "Fortify the Hearth", desc: "+400 Hearth health.", deed: ["soil", 8], go: () => { f.prep = "fort"; api.hearthMax(400); api.repair(); return "Everyone hauls stone until sundown. The Hearth has never looked so smug."; } },
        { label: "Arm up", desc: "A Legendary crate for everyone.", deed: ["blood", 5], go: () => { f.prep = "arms"; for (const p of api.players()) api.crate(3, p); return "You empty the town armoury. Legendary crates for everyone."; } },
        ...(api.dome()[0] < api.dome()[1] ? [{ label: "Finish the Dome", desc: "Everyone empties their pockets into it (up to 250g each).", deed: ["soil", 8], go: () => { f.prep = "dome"; const got = api.fundDome(250); const [h, c] = api.dome(); return h >= c ? `Every coin in ${V} goes into the Dome (${got}g). The pylons sing, and a pale blue bubble closes over the Hearth. Just in time.` : `You raise ${got}g between you. The Dome stands at ${h} of ${c}. It's not enough yet. Find the rest before dark.`; } }] : []),
        { label: "Throw a feast", desc: "Full heal, +1 skill point, +10% damage.", deed: ["soil", 5], go: () => { f.prep = "feast"; api.heal(); api.points(1); api.mods.dmg *= 1.1; return "Turnip stew for everyone. Somebody sings. For one evening, it's a nice place to live."; } },
        ...[legendChoice(api.legend(), api)].filter(Boolean),
      ],
    };
  }
  return null;
}

export function bossKind(f) {
  if (f.path === "drink" && f.drowned === "let") return "drowned";
  if (f.path === "sell") return "golem";
  return "leshen";
}

export const BOSSES = {
  leshen: { name: "THE SLOP LESHEN", hp: 1, speed: 58, summon: 7, color: "leshen" },
  drowned: { name: "THE DROWNED MAYOR", hp: 0.8, speed: 82, summon: 5, color: "drowned" },
  golem: { name: "VEX'S BRASS GOLEM", hp: 1.35, speed: 46, summon: 9, color: "golem" },
};

export function ending(win, f, night) {
  const V = f.valley;
  const lines = [];
  if (!win) {
    if (f.nuked) { lines.push(`The bomb fell on ${V} on night ${night}. Nobody had finished the Dome. The Hearth went out in a flash brighter than it ever burned.`); lines.push("Somewhere, a general calls it 'a regrettable success'."); return lines; }
    lines.push(`${V} fell on night ${night}. The slop took the Hearth, and then it took everything else.`);
    if (f.path === "sell") lines.push("Vex still sells postcards of the ruins.");
    else if (f.path === "drink") lines.push("On quiet nights the well hums a tune only the drinkers remember.");
    else lines.push("The sealed well cracked open at dawn. It sounded pleased.");
    return lines;
  }
  if (f.path === "seal" && f.ally === "church") lines.push(f.tithe === "stolen" ? "Brother Aldous preaches a sermon about thieves every Sunday. Nobody says anything. The Hearth burns on." : "The Hearth-Church rings its bells for a week. Brother Aldous takes full credit. The well stays sealed, for now.");
  else if (f.path === "seal") lines.push(f.price === "paid" ? "Morwen moves into the mayor's house. Nobody objects. Nobody dares. Sometimes you see the heir you gave her, waving from the reeds." : "Morwen was never seen again, but every spring the reeds grow in the shape of a rude gesture.");
  else if (f.path === "drink") lines.push(f.drowned === "let" ? "The drowned mayor sinks back into his well for good. The water tastes wonderful now. Nobody asks why." : "You burned the old mayor and salted the well. You still dream of him, but now he's just waving.");
  else lines.push(f.vex === "robbed" ? (f.revenge === "defied" ? "The golem lies in pieces. You sell the pieces. To Vex. He pays double, out of respect." : "Vex calls it even and opens a shop in the next valley. He still has your picture behind the counter.") : `Vex opens a chain of General Stores across the kingdom with your faces on the sign. You get no royalties.${f.insured ? " The insurance was fake, obviously." : ""}`);
  if (f.champion) lines.push(`${f.championName} is remembered as the Champion of ${V}. The statue's nose falls off within a year.`);
  else if (f.champion === 0) lines.push(`${V} never crowns a champion. The collective gets a very long plaque instead.`);
  if (f.domeHeld) lines.push("The Dome held when the bombs came. Grubb charges a shilling to see the scorch marks, and calls it the Heritage Centre.");
  if (f.prep === "feast") lines.push("Every year after, the valley holds a turnip feast on the anniversary. Attendance is mandatory.");
  return lines;
}
