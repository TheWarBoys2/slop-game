// The story, townsfolk and dialogue, the mystery, gifts and romance, and Slop Snap.
import { storyEvent, townMeeting } from "../story.js";
import { NPCS, QUESTS, CLUES } from "../npcs.js";
import { SUSPECTS, SLOTS as CLUE_FROM, culpritOf, WRONG } from "../mystery.js";
import { legendOf } from "../legend.js";
import { GIFTS, TASTE, SAYS, RING } from "../romance.js";
import { ITEMS, bagAdd, bagTake, CROPS } from "../items.js";
import { CANDIDATES } from "../politics.js";
import { RARITY, ZTYPES } from "../data.js";
import { CARDS, OPPONENTS, DECK_SIZE, newMatch, stage as cgStage, resolveTurn as cgResolve, aiPlays, view as cgView, deckFor, packCard } from "../cards.js";
import { giveWeapon } from "./actions.js";
import { advSend } from "./adventure.js";
import { placePiece } from "./building.js";
import { hurtPlayer, killPlayer, solved } from "./combat.js";
import { HEARTH, clamp, now, own, pick, rand } from "./config.js";
import { applyMayor, guestApi } from "./economy.js";
import { seedCount, takeSeed } from "./map.js";
import { spawnZombie } from "./phases.js";
import { GRID, GUNS, addGold, addXp, collide, deed, feed, freeSpot, fullName, game, lootType, maxHp, newWeapon, players, toast, traitOf, wName } from "./state.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

// ---------------------------------------------------------------- story
export const storyApi = {
  players: () => [...players.values()],
  dome: () => (game.dome ? [game.dome.have, game.dome.cost] : [0, 1]),
  fundDome: (each) => { let got = 0; for (const p of players.values()) { const g = Math.min(each, p.gold); p.gold -= g; got += g; } if (game.dome) game.dome.have = Math.min(game.dome.cost, game.dome.have + got); return got; },
  get mods() { return game.mods; },
  get flags() { return game.flags; },
  fullName: (p) => fullName(p),
  crate: (rarity, near) => { const at = near ? { x: near.x + rand(-40, 40), y: near.y + rand(-40, 40) } : freeSpot(); collide(at, 20); world.crates.push({ id: world.nextId++, ...at, w: newWeapon(lootType(), rarity) }); },
  hearthMax: (n) => { game.hearthMax += n; game.hearth += n; },
  repair: () => { game.hearth = game.hearthMax; },
  heal: () => { for (const p of players.values()) if (!p.dead) p.hp = maxHp(p); },
  gold: (n) => { for (const p of players.values()) if (n > 0) addGold(p, n); else p.gold = Math.max(0, p.gold + n); },
  stars: (n) => { for (const p of players.values()) p.heat = n * 40 + 20; if (!n) for (const p of players.values()) p.heat = 0; },
  points: (n) => { for (const p of players.values()) p.pts += n; },
  killPlayer: (p, cause) => killPlayer(p, null, cause),
  eliteNow: () => { const z = spawnZombie("elite"); z.hp = z.maxHp = ZTYPES.elite.hp * (0.5 + 0.5 * players.size); z.arson = false; },
  get valley() { return world.VALLEY; },
  legend: () => legendOf(game.deeds),
  teamkills: () => game.deeds.tk,
  worstTeamkiller: () => [...players.values()].sort((a, b) => b.st.tk - a.st.tk).find((p) => p.st.tk > 0),
  giveGold: (p, n) => addGold(p, n, "Blood money"),
  wallHearth: () => {
    let n = 0; const x0 = HEARTH.x - 2 * GRID, x1 = HEARTH.x + HEARTH.w + GRID, y0 = HEARTH.y - 2 * GRID, y1 = HEARTH.y + HEARTH.h + GRID;
    const midX = HEARTH.x + HEARTH.w / 2, midY = HEARTH.y + HEARTH.h / 2;
    for (let x = x0; x <= x1; x += GRID) for (let y = y0; y <= y1; y += GRID) {
      if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
      if (Math.abs(x + GRID / 2 - midX) < GRID * 1.5 || Math.abs(y + GRID / 2 - midY) < GRID) continue; // leave a gate on every side
      if (placePiece(null, "wall", x, y, true)) n++;
    }
    return n;
  },
  feast: () => { for (const p of players.values()) if (!p.dead) { p.hp = maxHp(p); p.food = 100; p.water = 100; } },
  turrets: (k) => { for (const [dx, dy] of [[-2, 0.3], [HEARTH.w / GRID + 1, 0.3]].slice(0, k)) placePiece(null, "turret", Math.round((HEARTH.x + dx * GRID) / GRID) * GRID, Math.round((HEARTH.y + dy * GRID) / GRID) * GRID, true); },
  friends: () => Object.values(game.aff).filter((a) => a >= 1).length,
  // what's going on in town, for meetings that react to it
  state: () => {
    const ps = [...players.values()], avg = ps.reduce((a, q) => a + q.gold, 0) / Math.max(1, ps.length);
    const rich = ps.slice().sort((a, b) => b.gold - a.gold)[0];
    const wanted = ps.filter((q) => !q.dead && q.heat >= 80), richP = rich && ps.length > 1 && rich.gold > Math.max(600, avg * 2) ? rich : null;
    return { hearth: game.hearth / game.hearthMax, wanted, wantedNames: wanted.map(fullName).join(" and "), richName: richP ? fullName(richP) : "", rich: rich && ps.length > 1 && rich.gold > Math.max(600, avg * 2) ? rich : null, mayor: game.mayor ? CANDIDATES[game.mayor].name : "", night: game.night, stressed: ps.filter((q) => (q.stress || 0) >= 50).length };
  },
  pardon: (ps) => { for (const q of ps) q.heat = 0; },
  bounty: (ps) => { for (const q of ps) q.heat = Math.min(200, q.heat + 80); },
  taxRich: (rich) => { const cut = Math.floor(rich.gold * 0.25), others = [...players.values()].filter((q) => q !== rich); rich.gold -= cut; for (const q of others) addGold(q, Math.floor(cut / others.length), "Wealth tax"); return cut; },
  impeach: () => { if (!game.mayor) return ""; const name = CANDIDATES[game.mayor].name; applyMayor(game.mayor, -1); game.mayor = null; return name; },
  calm: () => { for (const q of players.values()) q.stress = 0; },
  seeds: () => { for (const q of players.values()) { const id = pick(Object.keys(CROPS)); for (let i = 0; i < 3; i++) bagAdd(q.bag, "s_" + id); q.invDirty = true; } },
  freeClue: () => { if (!rules().story) return null; const id = Object.keys(CLUES).find((c) => !game.clues.has(c)); if (!id) return null; npcApi.clue(id); return clueText(id); },
};
// The town votes once a day. The ballot opens at dawn, stays open all day (change your mind as often as you like)
// and is counted at dusk. Story days have their story question; other days get an ordinary town meeting.
export function openVote(day) {
  if (!players.size || !rules().politics) return;
  const ev = (rules().story && storyEvent(day, storyApi)) || townMeeting(day, storyApi);
  if (!ev) return;
  game.vote = { day, ev, votes: new Map(), ends: game.ends };
  world.events.push({ k: "vote" });
  world.events.push({ k: "feed", text: `The town meeting is open until dusk: ${ev.title}. Press N to vote.`, color: "#e0c0ff" });
}
export function resolveVote() {
  const v = game.vote; game.vote = null;
  const counts = v.ev.choices.map(() => 0);
  for (const [pid, i] of v.votes) if (players.has(pid)) counts[i]++;
  const top = Math.max(...counts);
  const winners = counts.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0);
  const choice = pick(winners);
  const text = v.ev.choices[choice].go();
  if (v.ev.choices[choice].deed) deed(...v.ev.choices[choice].deed);
  for (const p of players.values()) if (v.votes.has(p.id)) addXp(p, 10);
  game.story = { title: v.ev.title, pick: v.ev.choices[choice].label, text, until: now() + 14 };
  feed(`${v.ev.title}: "${v.ev.choices[choice].label}"${winners.length > 1 && top > 0 ? " (tie broken by fate)" : ""}`, "#e0c0ff");
}
// ---------------------------------------------------------------- npcs & dialogue
export const npcApi = {
  dome: () => (game.dome ? [game.dome.have, game.dome.cost] : [0, 1]),
  night: () => game.night,
  progress: (p, id) => p.st[QUESTS[id].stat] - p.q[id].base,
  accept: (p, id) => { p.q[id] = { base: p.st[QUESTS[id].stat], done: false, told: false }; toast(p, `New quest: ${QUESTS[id].title}. ${QUESTS[id].desc} [J]`, "#e0c0ff"); },
  gold: (p, n) => { if (n > 0) addGold(p, n); else p.gold = Math.max(0, p.gold + n); },
  goldAll: (n) => { for (const q of players.values()) addGold(q, n); },
  pointsAll: (n) => { for (const q of players.values()) q.pts += n; },
  clue: (id) => {
    if (game.clues.has(id)) return;
    game.clues.add(id); deed("word", 12);
    feed(`CLUE ${game.clues.size}/5: ${clueText(id)}`, "#e0c0ff");
    world.events.push({ k: "clue", n: game.clues.size });
    if (game.clues.size === 3 && !solved()) feed("You know enough to accuse someone. Talk to whoever you suspect [E]. Get it wrong and the real culprit gets bolder.", "#ffd34d");
  },
  story: (title, text) => { game.story = { title, pick: "", text, until: now() + 14 }; world.events.push({ k: "vote" }); },
  said: (slot) => culpritOf(game.flags).said[slot],
  label: (slot) => culpritOf(game.flags).label[slot],
  mods: () => game.mods,
  name: (p) => fullName(p),
  deed: (k, n) => deed(k, n),
  healAll: () => { for (const q of players.values()) if (!q.dead) q.hp = maxHp(q); },
  hearth: (n) => { game.hearthMax += n; game.hearth = Math.min(game.hearthMax, game.hearth + n); },
  raw: (p) => {
    const n = world.NPC_POS.find((q) => q.id === "chef"); if (!n) return;
    const a = Math.atan2(p.y - n.y, p.x - n.x);
    world.events.push({ k: "shout", x: n.x, y: n.y, a, id: 0, r: 260, text: "IT'S RAAAW!" });
    p.vx = Math.cos(a) * 1100; p.vy = Math.sin(a) * 1100; p.dlg = null;
    hurtPlayer(p, 10, null, "shouted at by a celebrity");
  },
  crate: (p, rarity, type) => { const at = { x: p.x + rand(-30, 30), y: p.y + 40 }; collide(at, 20); world.crates.push({ id: world.nextId++, ...at, w: newWeapon(type || lootType(), rarity) }); },
  blackCase: (p) => {
    const r = Math.random() * 100 - (traitOf(p).luck ? 8 : 0);
    const rarity = r < 8 ? 4 : r < 30 ? 3 : r < 65 ? 2 : 1;
    const w = newWeapon(lootType(), rarity);
    if (GUNS.has(w.type) && Math.random() < 0.3) w.skin = Math.random() < 0.08 ? "gold" : pick(["camo", "slop", "tiger", "pink"]); // cases sometimes come painted
    giveWeapon(p, w); p.st.cases++;
    p.pe.push({ k: "case", type: w.type, rarity, name: wName(w) });
    if (rarity >= 3) setTimeout(() => feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${wName(w)} from Vex's coat`, rarity === 4 ? "#ff4b4b" : "#ffc030"), 3200);
  },
};
export function dlgCtx(p) { return { p, f: game.flags, aff: game.aff, clues: game.clues, q: p.q, api: npcApi, g: guestApi }; }
export function openDlg(p, npc) {
  p.dlg = { npc, node: "start" };
  if (!p.talked.has(npc)) { deed("word", 1.5); addLove(p, npc, 2); }
  p.talked.add(npc);
  addXp(p, 1);
  sendDlg(p);
}
// ---------------------------------------------------------------- the mystery: accuse whoever poisoned the well
export const clueText = (id) => culpritOf(game.flags).clue[id];
const canAccuse = (npc) => rules().story && SUSPECTS[npc] && game.clues.size >= 3 && !solved() && !game.flags.wrong[npc];
function wrongAccuse(p, npc) {
  game.flags.wrong[npc] = true; game.aff[npc] = (game.aff[npc] || 0) - 2; addLove(p, npc, -15);
  game.mods.zCount *= 1.15;
  feed(`${fullName(p)} accused ${SUSPECTS[npc].name} of poisoning the well. They didn't do it. Somewhere, the real culprit is laughing (more of the dead tonight).`, "#ff9090");
}
function solveMystery(p, how) {
  const f = game.flags, C = culpritOf(f);
  f[how] = true; f.finalAt = game.night + 1; // whatever they raised comes for the Hearth on the very next night
  if (how === "exposed") { game.mods.bossHp *= 0.65; game.mods.dmg *= 1.05; }
  if (how === "blackmail") for (const q of players.values()) addGold(q, 200, "Hush money");
  if (how === "pardoned") for (const q of players.values()) q.pts += 1;
  const title = { exposed: `${C.name} is Exposed`, blackmail: "A Quiet Arrangement", pardoned: "Mercy" }[how];
  const what = { exposed: `${fullName(p)} dragged ${C.name} to the Hearth and read out the evidence. Without them feeding it, the final horror will be weaker.`, blackmail: `${fullName(p)} had a quiet word with ${C.name}. Everyone is 200g richer, and nobody knows why.`, pardoned: `${fullName(p)} forgave ${C.name}, who paid for everyone's training. (+1 skill point each)` }[how];
  game.story = { title, pick: "", text: `${what} ${C.bossLine} It comes ${game.phase === "night" ? "tomorrow night" : "tonight"}.`, until: now() + 20 };
  world.events.push({ k: "vote" }); world.events.push({ k: "banner", text: "MYSTERY SOLVED", sub: `${C.name} poisoned the well. What they raised comes ${game.phase === "night" ? "tomorrow night" : "tonight"}.` });
  deed("word", 15);
  if (game.phase === "day") { const day = game.night + 1; game.vote = { day, ev: storyEvent(day, storyApi), votes: new Map(), ends: game.ends }; feed(`Today's town meeting is now: ${game.vote.ev.title}. Press N to vote.`, "#e0c0ff"); }
}
// nobody solved it in time: the culprit cracks on their own, and the last night comes anyway
export function unmask() {
  const f = game.flags, C = culpritOf(f);
  f.unmasked = true; f.finalAt = game.night + 1;
  world.events.push({ k: "banner", text: "THE CULPRIT CRACKS", sub: `${C.name} confessed at the Hearth: they poisoned the well. ${C.bossLine}` });
  feed(`${C.name} poisoned the well. Nobody caught them; they just couldn't live with it. Tonight is the last night.`, "#ffd34d");
}
function accuseNode(p, npc, node) {
  const C = SUSPECTS[npc], bye = [{ label: "Goodbye.", to: null }];
  if (node === "~accused") return { text: () => p.dlgSay || "...", opts: bye };
  if (npc !== game.flags.culprit) return { text: () => WRONG[npc], opts: [{ label: "Back.", to: "start" }, ...bye] };
  const done = (how, say) => ({ to: "~accused", do: () => { if (solved()) return; solveMystery(p, how); p.dlgSay = say; } });
  return {
    text: () => `You lay it out: ${game.clues.size} pieces of evidence. ${C.motive}`,
    opts: [
      { label: "Expose them to the whole valley.", ...done("exposed", `The crowd turns on ${C.name}. They're pelted with turnips all the way to the stocks. Out in the dark, something feels weaker.`) },
      { label: "Blackmail them. 200g each or we talk.", ...done("blackmail", `${C.name} counts out the coins with shaking hands. "This never happened. None of it."`) },
      { label: "Forgive them. Everyone makes mistakes.", ...done("pardoned", `${C.name} weeps. "I'll make it right. I'll pay for training. I'll pay for everything."`) },
    ],
  };
}
// the main quest's next step, for the orange "?" and the compass
export function mainQuest() {
  if (!rules().story || game.phase === "lobby" || game.phase === "over" || game.flags.finalAt) return [];
  if (game.clues.size >= 3) return Object.keys(SUSPECTS).filter((id) => !game.flags.wrong[id]);
  const next = Object.keys(CLUE_FROM).find((id) => !game.clues.has(id));
  return next ? [CLUE_FROM[next]] : [];
}
export function sendDlg(p) {
  if (!p.dlg) { p.pe.push({ k: "dlg", close: 1 }); return; }
  if (p.dlg.adv) return advSend(p);
  const npc = p.dlg.npc, N = NPCS[npc], node = p.dlg.node === "~snap" ? snapNode(p, npc) : p.dlg.node.startsWith("~acc") ? accuseNode(p, npc, p.dlg.node) : p.dlg.node[0] === "~" ? romanceNode(p, npc, p.dlg.node) : N.nodes[p.dlg.node], c = dlgCtx(p);
  p.dlgOpts = node.opts.filter((o) => !o.if || o.if(c));
  if (p.dlg.node === "start" && canAccuse(npc)) p.dlgOpts.splice(Math.max(0, p.dlgOpts.length - 1), 0, { label: `"I know it was you, ${SUSPECTS[npc].name}."`, to: "~accuse", do: () => { if (npc !== game.flags.culprit) wrongAccuse(p, npc); } });
  if (p.dlg.node === "start" && TASTE[npc]) p.dlgOpts.splice(Math.max(0, p.dlgOpts.length - 1), 0, ...romanceOpts(p, npc)); // before "Goodbye"
  if (p.dlg.node === "start" && OPPONENTS[npc] && game.phase !== "night") p.dlgOpts.splice(Math.max(0, p.dlgOpts.length - 1), 0, { label: "Fancy a game of Slop Snap?", to: "~snap" });
  p.pe.push({ k: "dlg", npc, name: N.name, role: N.role, text: node.text(c), opts: p.dlgOpts.map((o) => typeof o.label === "function" ? o.label(c) : o.label), love: loveOf(p, npc), rel: p.spouse === npc ? "spouse" : p.dating === npc ? "dating" : "" });
}
// ---------------------------------------------------------------- gifts and romance
const loveOf = (p, npc) => (p.love && p.love[npc]) || 0;
function addLove(p, npc, n) { if (!p.love) p.love = {}; p.love[npc] = clamp(loveOf(p, npc) + n, -50, 100); }
const spouseOf = (npc) => [...players.values()].find((q) => q.spouse === npc);
function romanceOpts(p, npc) {
  const out = [{ label: "Give a gift...", to: "~gift" }], L = loveOf(p, npc);
  if (!p.spouse && p.dating !== npc && L >= 40) out.push({ label: p.dating ? `Ask them out (you're already seeing ${NPCS[p.dating].name}...)` : "Ask them out", to: "~said", do: () => { askOut(p, npc); } });
  if (p.dating === npc && !p.spouse && L >= 100) out.push({ label: `Propose (a ring costs ${RING}g)`, to: "~said", do: () => { propose(p, npc); } });
  if (p.dating === npc && !p.spouse) out.push({ label: "Break it off", to: "~said", do: () => { dumpThem(p, npc); } });
  return out;
}
function romanceNode(p, npc, node) {
  const back = [{ label: "Back.", to: "start" }, { label: "Goodbye.", to: null }];
  if (node === "~gift") {
    if (p.gifted.has(npc)) return { text: () => "\"You've already given me something today. Don't overdo it.\"", opts: back };
    const opts = Object.entries(GIFTS).filter(([, g]) => !g.kills || p.st.kills >= g.kills).map(([id, g]) => ({ label: g.cost ? `${g.name} (${g.cost}g)` : g.name, to: "~said", do: () => { giveGift(p, npc, id); } }));
    // anything giftable in your bag goes first, and costs nothing now
    const mine = [...new Set(p.bag.filter((b) => ITEMS[b.id] && (ITEMS[b.id].gift || ITEMS[b.id].kind === "food")).map((b) => b.id))];
    opts.unshift(...mine.map((id) => ({ label: `From your bag: ${ITEMS[id].name}`, to: "~said", do: () => { giveBagGift(p, npc, id); } })));
    return { text: () => `What will you give ${NPCS[npc].name}?`, opts: [...opts, { label: "Never mind.", to: "start" }] };
  }
  return { text: () => p.dlgSay || "...", opts: back };
}
function giveGift(p, npc, id) {
  const g = GIFTS[id], taste = TASTE[npc] || {};
  if (g.cost && p.gold < g.cost) { p.dlgSay = `You can't afford that. It's ${g.cost}g.`; return; }
  if (g.seeds && seedCount(p) < g.seeds) { p.dlgSay = "You're out of seeds."; return; }
  if (g.cost) p.gold -= g.cost;
  if (g.seeds) takeSeed(p);
  p.gifted.add(npc);
  const kind = taste.love === id ? "love" : taste.like === id ? "like" : taste.hate === id ? "hate" : "meh";
  addLove(p, npc, { love: 25, like: 12, meh: 5, hate: -15 }[kind]);
  p.dlgSay = SAYS[npc][kind];
  p.pe.push({ k: "love", npc, v: loveOf(p, npc), d: kind });
}
function giveBagGift(p, npc, id) {
  if (!bagTake(p.bag, id)) { p.dlgSay = "You rummage in your bag. It's gone."; return; }
  p.invDirty = true;
  const g = ITEMS[id].gift;
  if (g) { p.gold += GIFTS[g].cost || 0; return giveGift(p, npc, g); } // giveGift charges for it; it's already paid for
  p.gifted.add(npc);
  const kind = id === "stew" ? "like" : "meh"; // home cooking goes down well with everyone
  addLove(p, npc, kind === "like" ? 12 : 5);
  p.dlgSay = SAYS[npc][kind];
  p.pe.push({ k: "love", npc, v: loveOf(p, npc), d: kind });
}
function askOut(p, npc) {
  if (p.dating && p.dating !== npc) { addLove(p, p.dating, -30); feed(`${fullName(p)} dumped ${NPCS[p.dating].name} for ${NPCS[npc].name}. Scandal.`, "#ff8fc8"); }
  p.dating = npc; addLove(p, npc, 10);
  feed(`${fullName(p)} is courting ${NPCS[npc].name} ♥`, "#ff8fc8");
  p.dlgSay = SAYS[npc].date;
}
function propose(p, npc) {
  const other = spouseOf(npc);
  if (other) { p.dlgSay = `"I'm already married. To ${fullName(other)}. This is awkward."`; return; }
  if (p.gold < RING) { p.dlgSay = `You pat your pockets. A ring costs ${RING}g, and you haven't got it.`; return; }
  p.gold -= RING; p.spouse = npc; addXp(p, 50); deed("word", 5);
  world.events.push({ k: "banner", text: "A WEDDING!", sub: `${fullName(p)} married ${NPCS[npc].name}. Every morning from now on, ${NPCS[npc].name} looks after them.` });
  world.events.push({ k: "wedding", npc, id: p.id });
  p.dlgSay = SAYS[npc].wed;
}
function dumpThem(p, npc) {
  p.dating = null; addLove(p, npc, -30);
  feed(`${fullName(p)} broke up with ${NPCS[npc].name}.`, "#c08ab0");
  p.dlgSay = SAYS[npc].dump;
}
// ---------------------------------------------------------------- Slop Snap (cards)
function snapNode(p, npc) {
  const N = NPCS[npc], back = { label: "Maybe later.", to: "start" };
  const bet = (n) => ({ label: n ? `Bet ${n}g on it` : "Just for fun", to: null, do: () => { startCards(p, npc, n); } });
  return { text: () => `${N.name} shuffles a battered deck. "Three lanes, six turns, win two lanes. Your cards go on the bottom, mine on top. Win and I'll give you one of mine."`, opts: [bet(0), bet(25), bet(100), back] };
}
function startCards(p, npc, stake) {
  if (p.cg) return toast(p, "You're already in a game.", "#bbb");
  if (stake && p.gold < stake) return toast(p, `You haven't got ${stake}g.`, "#f88");
  p.gold -= stake;
  p.cg = { npc, stake, M: newMatch(deckFor(p.cards, p.deck), OPPONENTS[npc].deck) };
  sendCards(p);
}
export function sendCards(p) {
  if (!p.cg) return p.pe.push({ k: "cg", close: 1 });
  p.pe.push({ k: "cg", npc: p.cg.npc, name: NPCS[p.cg.npc].name, stake: p.cg.stake, v: cgView(p.cg.M, 0) });
}
export function cardAct(p, m) {
  const G = p.cg;
  if (m.a === "deck") { p.deck = (Array.isArray(m.ids) ? m.ids : []).filter((id) => own(CARDS, id)).slice(0, DECK_SIZE); p.invDirty = true; return; }
  if (!G) { if (m.a === "quit") sendCards(p); return; } // tells a stale card screen to close
  if (m.a === "quit" || G.M.over) { if (!G.M.over) { toast(p, `You fold. ${NPCS[G.npc].name} keeps the ${G.stake}g.`, "#bbb"); } p.cg = null; return sendCards(p); }
  if (m.a !== "play") return;
  const plays = (Array.isArray(m.plays) ? m.plays : []).slice(0, 8).map((x) => (Array.isArray(x) ? [x[0] | 0, x[1] | 0] : [-1, -1]));
  const err = cgStage(G.M, 0, plays);
  if (err) { toast(p, err, "#f88"); return sendCards(p); }
  cgStage(G.M, 1, aiPlays(G.M, 1));
  cgResolve(G.M);
  if (G.M.over) finishCards(p);
  sendCards(p);
}
function finishCards(p) {
  const G = p.cg, N = NPCS[G.npc], res = G.M.result;
  if (res === 0) {
    p.gold += G.stake * 2; p.st.cardWins++; if (TASTE[G.npc]) addLove(p, G.npc, 6);
    const want = OPPONENTS[G.npc].prize.filter((id) => !p.cards[id]);
    const id = want.length ? pick(want) : Math.random() < 0.5 ? pick(OPPONENTS[G.npc].prize) : packCard(0.1);
    p.cards[id] = (p.cards[id] || 0) + 1; p.invDirty = true;
    G.prize = id; deed("word", 2);
    toast(p, `You beat ${N.name}! ${G.stake ? `+${G.stake * 2}g. ` : ""}New card: ${CARDS[id].name}`, "#ffd34d");
    if (CARDS[id].r >= 3) feed(`${fullName(p)} won ${CARDS[id].name} off ${N.name} at Slop Snap`, "#ffd34d");
  } else if (res === -1) { p.gold += G.stake; toast(p, `A draw with ${N.name}. You get your stake back.`, "#ddd"); }
  else { if (TASTE[G.npc]) addLove(p, G.npc, 1); toast(p, `${N.name} wins${G.stake ? ` and pockets your ${G.stake}g` : ""}. "Good game, though."`, "#f8a"); }
}
export function openPack(p, n = 4) {
  const got = []; for (let i = 0; i < n; i++) { const id = packCard(); got.push(id); p.cards[id] = (p.cards[id] || 0) + 1; }
  p.invDirty = true; p.pe.push({ k: "pack", cards: got });
  const best = got.reduce((a, b) => (CARDS[b].r > CARDS[a].r ? b : a));
  if (CARDS[best].r >= 4) feed(`${fullName(p)} pulled ${CARDS[best].name} from a Slop Snap pack!`, "#ff4b4b");
}
