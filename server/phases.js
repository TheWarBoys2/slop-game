// Phases: lobby, intro, day and night, special nights, endings; what spawns each night.
import { bossKind, BOSSES, ending } from "../story.js";
import { NPCS, QUESTS, npcLines } from "../npcs.js";
import { SUSPECTS, pickCulprit, culpritOf } from "../mystery.js";
import { LEGENDS, legendOf, legendName, reckoning, legendLines } from "../legend.js";
import { SAYS } from "../romance.js";
import { STOCKS, newMarket, shock } from "../market.js";
import { CANDIDATES, ELECT_EVERY } from "../politics.js";
import { RENOWN_GOAL } from "../adventure.js";
import { CLASSES, ZTYPES } from "../data.js";
import { advActive, advDawn, advTowns, bossName, setupAdventure } from "./adventure.js";
import { isBugNight, startBugNight } from "./bugnight.js";
import { fires, scorched } from "./combat.js";
import { ENDLESS_BOSS_EVERY, FOG_NIGHT, GUESTS, H, HEARTH, LAST_NIGHT, NUKE_CHANCE, ROYALE_ZONES, UNMASK_AFTER, W, clamp, dist2, now, pick, rand } from "./config.js";
import { maybeDisaster } from "./disasters.js";
import { dividends, openElection, resolveElection } from "./economy.js";
import { mapMsg, npcRoute, placeNpcs } from "./geometry.js";
import { resetOffices, spawnCrates } from "./hacking.js";
import { BALL, BASE_PLOTS, PLOTS, generateMap } from "./map.js";
import { cure } from "./needs.js";
import { DOME_COST, DOME_PER, FIRST_NUKE, nukeWarn, radioNews } from "./nukes.js";
import { setupRoyale, startDrop, zoneInit, zoneShrinkTo } from "./royale.js";
import { openVote, resolveVote, sendDlg, storyApi, unmask } from "./social.js";
import { addGold, feed, freeSpot, freshDeeds, freshMods, fullName, game, maxHp, players, resetLoadout, resetProgress, toast } from "./state.js";
import { broadcastRaw } from "./tick.js";
import { shrineReset, spawnVehicles } from "./vehicles.js";
import { world } from "./world.js";
import { isDinoDay, rules } from "./modes.js";
import { moonDawn, moonDusk } from "./moonfall.js";

// ---------------------------------------------------------------- phases
// launched from the lobby once everyone is ready: build the world, play the opening, then drop everyone in
export function startGame() {
  PLOTS.length = BASE_PLOTS; // tilled plots belong to the last game
  BALL.x = BALL.y = 0;
  generateMap((Math.random() * 1e9) | 0);
  world.vehicles = []; world.builds = []; game.bugs = null; game.forceBugs = false; game.zone = null; game.drop = null; game.countdown = 0; game.skip = new Set(); game.pendingVote = null; game.adv = null; world.ADV_KEEP = []; game.force = false; game.moon = null;
  game.deeds = freshDeeds(); game.legend = null;
  if (rules().townsfolk) placeNpcs(); else world.NPC_POS = [];
  world.projs = []; fires.clear(); scorched.clear(); game.disaster = null; game.dino = false; game.dinoDay = false; shrineReset(); game.dust = null;
  broadcastRaw(JSON.stringify(mapMsg()));
  if (game.mode === "royale") setupRoyale(); else setupStory();
  if (game.mode === "adventure") { setupAdventure(); broadcastRaw(JSON.stringify(mapMsg())); } // the other towns, their boards and their folk
  for (const p of players.values()) { p.air = "wait"; p.ready = false; p.dlg = null; }
  game.phase = "intro"; game.introT0 = now(); game.introEnds = now() + rules().intro;
  game.cast = [...players.values()].map((p) => [fullName(p), CLASSES[p.cls].name, p.color]);
}
export function beginPlay() {
  game.phase = game.mode === "royale" ? "royale" : "day";
  for (const p of players.values()) if (p.air === "wait") p.air = null;
  if (game.mode === "royale") {
    zoneInit(W / 2, H / 2, 2300, ROYALE_ZONES.map((z) => [...z]));
    startDrop(null);
    world.events.push({ k: "banner", text: `SLOP ROYALE: ${world.VALLEY.toUpperCase()}`, sub: "Jump with SPACE. Loot up. Build [C]. Steal a ride [E]. Last farmer standing wins." });
    return;
  }
  game.ends = now() + rules().day;
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  // the closing fog ring is Royale's; in Story and Endless the night itself is the pressure
  startDrop(hc);
  world.events.push({ k: "feed", text: "Somebody has built all of Dust II out in the desert to the north-east. Follow the 💣 on your compass.", color: "#e0c080" });
  if (game.mode === "adventure") { world.events.push({ k: "banner", text: `ADVENTURE: ${world.VALLEY.toUpperCase()}`, sub: "No Hearth to hold tonight. Take work from the notice board by the Hearth [E], find the other towns, get paid." }); feed(`There are ${advTowns().length - 1} towns out past the hedge, each with its own work. Your journal [J] has the map.`, "#ffe9a0"); return; }
  if (game.mode === "endless") { world.events.push({ k: "banner", text: `ENDLESS: ${world.VALLEY.toUpperCase()}`, sub: "No story. No end. Keep the Hearth burning as long as you can. A boss comes every fifth night." }); openVote(1); openElection(); return; }
  world.events.push({ k: "banner", text: `WELCOME TO ${world.VALLEY.toUpperCase()}`, sub: "SPACE to jump. Talk to the townsfolk [E]. Build defences [C]. Night is coming." });
  if (game.cameoDay === 1) cameoArrive();
  radioNews();
  openVote(1); openElection(); // the valley picks its first mayor on day one
}
function setupStory() {
  game.aff = Object.fromEntries(Object.keys(NPCS).map((k) => [k, 0])); game.clues = new Set();
  game.night = 0; game.ends = Infinity; game.result = null; game.ending = null; game.cutscene = null;
  game.flags = { valley: world.VALLEY, culprit: SUSPECTS[process.env.SLOP_CULPRIT] ? process.env.SLOP_CULPRIT : pickCulprit(), wrong: {} }; game.mods = freshMods(); game.vote = null; game.story = null; game.bossId = 0;
  const n = Math.max(1, players.size);
  game.hearthMax = game.hearth = 1000 + 300 * n;
  world.zombies = []; world.crates = []; world.caches = []; resetOffices();
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) { resetProgress(p); resetLoadout(p, true); }
  spawnCrates();
  spawnVehicles(["tractor"], { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
  spawnVehicles(["buggy", "heli", "gunship"]);
  game.cameoDay = !rules().story ? 0 : process.env.SLOP_CAMEO ? +process.env.SLOP_CAMEO : pick([2, 4]); // never on the day of the Reckoning
  game.cameo = GUESTS.includes(process.env.SLOP_GUEST) ? process.env.SLOP_GUEST : pick(GUESTS);
  game.market = newMarket(); game.mayor = null; game.uav = 0; game.elec = null; game.nuke = null; game.waste = false; game.hot = []; game.posadAt = 0; game.tip = null;
  game.fog = false;
  game.dome = { have: 0, cost: Math.min(4500, DOME_COST + DOME_PER * (n - 1)), struck: false };
}
// a celebrity turns up for one day of the story, then leaves at nightfall
function cameoArrive() {
  const sp = freeSpot(40), hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let at = sp;
  for (let i = 0; i < 40; i++) { const c = freeSpot(40); const d = Math.hypot(c.x - hc.x, c.y - hc.y); if (d > 250 && d < 520 && !world.NPC_POS.some((n) => dist2(n, c) < 160 * 160)) { at = c; break; } }
  const G = game.cameo, N = NPCS[G];
  world.NPC_POS.push({ id: G, x: at.x, y: at.y });
  broadcastRaw(JSON.stringify(mapMsg()));
  world.events.push({ k: "banner", text: "CELEBRITY SIGHTING!", sub: N.arrive, npc: G });
  feed(N.feed, "#ff9ad0");
}
function cameoLeave() {
  const G = game.cameo, N = NPCS[G];
  if (!world.NPC_POS.some((n) => n.id === G)) return;
  world.NPC_POS = world.NPC_POS.filter((n) => n.id !== G);
  for (const p of players.values()) {
    if (p.dlg && p.dlg.npc === G) { p.dlg = null; sendDlg(p); }
    for (const [id, qs] of Object.entries(p.q)) if (QUESTS[id].npc === G && !qs.done) { delete p.q[id]; toast(p, `${N.name} has left. Your ${QUESTS[id].title} quest went with them.`, "#f88"); }
  }
  broadcastRaw(JSON.stringify(mapMsg()));
  feed(N.leave, "#ff9ad0");
}
export function lootRarity(bonus = 0) {
  const r = Math.random() * 100;
  return r < 0.15 + bonus * 0.05 ? 4 : r < 1.5 + bonus * 0.5 ? 3 : r < 8 + bonus * 1.5 ? 2 : r < 42 ? 1 : 0; // rare is rare: a Legendary should be a moment
}
function maybeNuke() {
  if (!rules().nukes || game.nuke) return;
  if (game.night < FIRST_NUKE) return; // five days of peace (of a sort) to get the dome up
  if (game.dome && !game.dome.struck) return nukeWarn(`The war has reached ${world.VALLEY}.`); // it was always coming
  if (game.mayor === "posad" && game.posadAt && game.night >= game.posadAt) { game.posadAt = 0; return nukeWarn("Comrade Posad has kept his campaign promise."); }
  if (Math.random() < NUKE_CHANCE) nukeWarn("Somebody, somewhere, has pressed the button.");
}
// What kind of night it is: the first of these that applies. Each says when it comes and how it starts.
// (The waves themselves are counted out in startNight; a kind can change how many come, or stop them with a boss.)
const plainNight = (text, sub) => { game.ends = now() + rules().night; world.events.push({ k: "banner", text, sub }); };
const NIGHTS = [
  { key: "final", // the story's last night only comes once the mystery is solved; until then the waves never stop
    when: () => rules().story && !!game.flags.finalAt && game.night >= game.flags.finalAt,
    start: (n) => {
      game.ends = Infinity;
      game.bossKind = bossKind(game.flags);
      const B = BOSSES[game.bossKind], b = spawnZombie("boss");
      b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * B.hp * game.mods.bossHp * (0.5 + 0.5 * n));
      game.bossId = b.id;
      world.events.push({ k: "banner", text: `THE LAST NIGHT: ${B.name}`, sub: `${culpritOf(game.flags).name} raised it. Slay it to save the valley.` });
    } },
  { key: "boss", // Endless: a boss every fifth night, tougher each time
    when: () => game.mode === "endless" && game.night % ENDLESS_BOSS_EVERY === 0,
    start: (n) => {
      game.ends = Infinity;
      game.bossKind = pick(Object.keys(BOSSES));
      const B = BOSSES[game.bossKind], b = spawnZombie("boss");
      b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * B.hp * (0.5 + 0.5 * n) * (1 + 0.35 * (game.night / ENDLESS_BOSS_EVERY - 1)));
      game.bossId = b.id;
      world.events.push({ k: "banner", text: `NIGHT ${game.night}: ${B.name}`, sub: "Kill it and the sun comes up. Reward: 150g each." });
    } },
  { key: "dino", // the night after Dinosaur Day: fewer of them, and only dinosaurs
    when: () => !!game.dinoDay,
    start: () => {
      game.dino = true; game.spawnLeft = Math.max(6, Math.round(game.spawnLeft * 0.55));
      plainNight(`NIGHT ${game.night}: DINOSAUR NIGHT`, "Dinosaur night. Only dinosaurs tonight, and one big one. Frost and storm work best.");
    } },
  { key: "bugs", when: () => isBugNight(game.night), start: () => { startBugNight(); game.ends = now() + rules().night; } }, // Bug Night has its own banner
  { key: "fog",
    when: () => game.night >= 2 && Math.random() < FOG_NIGHT,
    start: () => { game.fog = true; plainNight(`NIGHT ${game.night}: THE FOG`, "FOG NIGHT. You can't see a thing. Listen for the screamers."); } },
  { key: "plain", when: () => true,
    start: () => plainNight(`NIGHT ${game.night}`, game.night === 1 ? "Protect the Hearth. Don't shoot your friends (much)." : rules().story && game.night >= LAST_NIGHT ? "The dead won't stop until someone solves the mystery. Check your journal [J]." : "They're getting hungrier.") },
];
export function startNight() {
  if (game.vote) resolveVote();
  if (game.elec) resolveElection();
  shock(game.market, "BOOM", 0.04, "Night falls. Munitions orders surge.");
  cameoLeave();
  game.night++;
  game.phase = "night";
  for (const n of world.NPC_POS) npcRoute(n, true);
  if (!rules().waves) { // Adventure: no waves, the wild just gets meaner, and the night-only beasts come out
    game.spawnLeft = 0; game.fog = false; game.dino = false; game.ends = now() + rules().night;
    const owed = advActive().some((q) => q.night && q.step === "hunt" && !q.zid);
    world.events.push({ k: "banner", text: `NIGHT ${game.night}`, sub: owed ? "Night falls. The beast you've been tracking is out now." : "Night falls. The dead are bolder out in the wild. The towns are safe." });
    maybeDisaster();
    return;
  }
  const n = Math.max(1, players.size);
  game.spawnLeft = Math.round(Math.min(120, (8 + 6 * game.night) * (0.7 + 0.3 * n) * game.mods.zCount * game.mods.nightCut));
  game.mods.nightCut = 1;
  game.spawnNext = now() + 2;
  game.fog = false; game.dino = false; game.dinoRex = false; game.bugs = null;
  const kind = NIGHTS.find((k) => k.when());
  game.dinoDay = false;
  maybeDisaster();
  kind.start(n);
  game.spawnTotal = game.spawnLeft;
  maybeNuke();
  moonDusk();
}
// Rates: every morning the valley takes a tenth of anything over 1500g. Hoarding gold is the one thing it taxes.
const RATES_FREE = 1500, RATES = 0.1;
function collectRates() {
  if (!rules().rates) return;
  for (const p of players.values()) {
    const due = Math.floor((p.gold - RATES_FREE) * RATES * (game.mayor === "vex" ? 0.5 : game.mayor === "posad" ? 2 : 1));
    if (due < 1) continue;
    p.gold -= due; p.st.rates = (p.st.rates || 0) + due;
    toast(p, `Town rates: ${due}g (a tenth of everything over ${RATES_FREE}g). Spend it or lose it.`, "#ffb070");
  }
}
export function startDay() {
  resetOffices(); // the office vaults lock again at dawn
  game.bugs = null; // the holes cave in at dawn (and the sun burns whatever's left above ground)
  game.phase = "day"; game.mods.nightGold = 1; game.ends = now() + rules().day; game.fog = false; game.dino = false; game.duskWarned = false;
  game.dinoDay = isDinoDay(game.night + 1); game.dinoNext = now() + 12;
  if (game.zone) zoneShrinkTo(40000, 20); // the fog lifts off the wild
  for (const n of world.NPC_POS) npcRoute(n, false);
  for (const p of players.values()) {
    p.gifted = new Set();
    if (p.spouse && !p.dead && SAYS[p.spouse]) { p.hp = maxHp(p); p.gren = Math.min(9, p.gren + 1); addGold(p, 30, `${NPCS[p.spouse].name} looks after you`); toast(p, SAYS[p.spouse].spouse, "#ff8fc8"); }
  }
  collectRates();
  maybeDisaster();
  shock(game.market, "FARM", 0.02);
  if (game.tip) { shock(game.market, game.tip.sym, 0.3, `${STOCKS[game.tip.sym].name} soars on a mystery buyer`); game.tip = null; }
  dividends();
  const M = game.mayor && CANDIDATES[game.mayor];
  if (M && M.dawn === "grenade") for (const p of players.values()) p.gren = Math.min(9, p.gren + 1);
  if (M && M.dawn === "heal") for (const p of players.values()) if (!p.dead) p.hp = maxHp(p);
  if (M && M.dawn === "share" && players.size > 1) { const all = [...players.values()], pot = all.reduce((a, p) => a + p.gold, 0), each = Math.floor(pot / all.length); for (const p of all) p.gold = each; feed(`Comrade Posad redistributes the wealth: everyone now has ${each}g.`, "#ff6060"); }
  maybeNuke();
  radioNews();
  for (const p of players.values()) { p.talked.clear(); cure(p, "The sunrise burns the infection out of you."); }
  for (const z of world.zombies) if (!ZTYPES[z.type].sunProof && !z.keep && !z.dust) z.burn = true; // Adventure's quest monsters don't mind the sun, and a Dust II round plays out
  spawnCrates();
  if (rules().story && !game.flags.finalAt && game.night >= UNMASK_AFTER) unmask();
  if (game.mode === "adventure") advDawn();
  const sub = game.mode === "adventure" ? `New work on the notice boards. Renown ${game.adv ? game.adv.renown : 0}/${RENOWN_GOAL}.` : game.mode === "endless" ? `You survived night ${game.night}. ${ENDLESS_BOSS_EVERY - (game.night % ENDLESS_BOSS_EVERY)} until the next boss. The shops are open.`
    : game.flags.finalAt === game.night + 1 ? `Tonight is the last night: ${BOSSES[bossKind(game.flags)].name} comes for the Hearth. Get ready. The shops are open.`
    : game.clues.size >= 3 ? "You know enough to accuse someone [E]. Until somebody's caught, the dead keep coming. The shops are open."
    : "The sun burns the dead. Find out who poisoned the well [J], and they'll keep coming until you do. The shops are open.";
  if (game.dinoDay) world.events.push({ k: "banner", text: `DAY ${game.night + 1}: DINOSAUR DAY`, sub: "The well's coughing up dinosaurs. Nothing else today or tonight. Raptors hunt in threes, so stick together." });
  else world.events.push({ k: "banner", text: `DAY ${game.night + 1}`, sub });
  const day = game.night + 1;
  if (rules().story && game.night === 2) { // the Reckoning: the valley decides what you are, then the day's vote follows
    game.legend = legendOf(game.deeds);
    const r = reckoning(game.legend, storyApi);
    game.story = { title: r.title, pick: game.legend ? legendName(game.legend, world.VALLEY) : "Nobody special", text: r.text, until: now() + 20 };
    feed(`The valley has decided: you are ${legendName(game.legend, world.VALLEY)}.`, game.legend ? LEGENDS[game.legend].color : "#ccc");
    world.events.push({ k: "legend", kind: game.legend });
  }
  openVote(day);
  if ((day - 1) % ELECT_EVERY === 0) openElection(); // election day: the mayor's race joins the ballot
  if (rules().story && day === game.cameoDay) cameoArrive();
  moonDawn();
}
export function endGame(win) {
  game.phase = "over"; game.result = win ? "win" : "lose"; game.vote = null; game.elec = null; game.nuke = null;
  for (const z of world.zombies) z.burn = true;
  game.flags.clueCount = game.clues.size;
  const lg = legendOf(game.deeds);
  if (game.mode === "adventure") {
    const A = game.adv, L = A && A.legend;
    game.ending = [win && L ? `${bossName(L.boss)} is dead, and the whole valley knows who did it.` : "The road goes on without you.", `${A ? A.renown : 0} jobs done, ${A ? A.disc.size - 1 : 0} of ${A ? A.towns.length - 1 : 0} towns found, ${game.night + 1} day${game.night ? "s" : ""} on the road.`, "Every notice board in the valley has your faces on it now. Drinks are on the house. Forever (a week)."];
    game.prev = `Last time, a party from ${world.VALLEY} finished the Legendary Contract.`;
  } else if (game.mode === "endless") {
    const best = Math.max(game.night - 1, 0);
    game.ending = [`${world.VALLEY} held out for ${best} night${best === 1 ? "" : "s"}. The Hearth went out on night ${game.night}.`, best >= 15 ? "Songs will be sung. Badly, but sung." : best >= 8 ? "A respectable showing. The dead were mildly inconvenienced." : "The dead barely noticed you were there."];
    game.prev = `Last time, ${world.VALLEY} survived ${best} nights of the endless dark.`;
  } else {
    game.ending = [...ending(win, game.flags, game.night), ...legendLines(win, lg, game.legend, game.flags, world.VALLEY, game.deeds), ...(win ? npcLines(game.flags, game.aff) : [])];
    if (win) { const f = game.flags, C = culpritOf(f), how = f.exposed ? "exposed" : f.blackmail ? "blackmail" : f.pardoned ? "pardoned" : "unmasked"; game.cutscene = { valley: world.VALLEY, who: C.name, color: C.color, motive: C.motive, boss: BOSSES[bossKind(f)].name, bossLine: C.bossLine, fate: C.fate[how], night: game.night }; }
    game.prev = win ? `Last time, ${legendName(lg, world.VALLEY)} saved their valley.` : `Last time, ${world.VALLEY} fell on night ${game.night}.`;
  }
  for (const p of players.values()) p.ready = false;
  const rows = [...players.values()].map((p) => {
    const s = p.st;
    const acc = s.shots ? s.hits / s.shots : 0;
    const r = clamp(6 + s.kills * 0.04 + s.crops * 0.2 + s.dmg / 3000 - s.deaths * 0.35 - s.tk * 0.5 + (win ? 0.5 : 0) + s.bounty / 400 + (acc - 0.35) * 2 + s.hs * 0.01 + s.perfect * 0.05, 3, 10);
    return { name: fullName(p), cls: CLASSES[p.cls].name, color: p.color, ...s, acc: Math.round(acc * 100), lvl: p.lvl, dmg: Math.round(s.dmg), rating: Math.round(r * 10) / 10, lineage: [...p.lineage, fullName(p)] };
  }).sort((a, b) => b.rating - a.rating);
  game.stats = rows;
  world.events.push({ k: "over" });
}
// what crawls out of the dark tonight. New kinds join as the nights go on.
export function nightType(n, fog) {
  const w = { walker: 10, runner: n >= 2 ? 5 : 0, tank: n >= 3 ? 1.2 : 0, charger: n >= 2 ? 1.1 : 0, flyer: n >= 2 ? 1.4 : 0, boomer: n >= 2 ? 1 : 0, screamer: fog ? 1.8 : n >= 3 ? 0.5 : 0 };
  if (n >= 6) { w.tank += 0.6; w.charger += 0.6; w.flyer += 0.6; }
  if (n >= 8) { w.tank += 0.6; w.charger += 0.6; w.boomer += 0.6; w.screamer += 0.6; w.walker -= 2; } // later nights are about variety, not just bigger numbers
  if (game.dino || game.dinoDay) return "raptor"; // dinosaur day: nothing else
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return "walker";
}
// armoured specials: plates soak body shots until they're shot off, and a red glowing weak spot (the head,
// or a charger's back) takes extra. The deeper into the nights, the more of the horde turns up in plate.
function armourChance(type, n) {
  if (game.dino || game.dinoDay) return 0;
  if (type === "tank" || type === "charger") return n >= 6 ? 1 : n >= 4 ? 0.5 : 0;
  if (type === "elite" || type === "boss" || type === "rex") return n >= 6 ? 1 : 0;
  if (type === "walker") return n >= 10 ? 0.4 : n >= 8 ? 0.25 : n >= 6 ? 0.12 : 0;
  if (type === "boomer" || type === "screamer") return n >= 8 ? 0.3 : 0;
  return 0;
}
export const ARM_SOAK = 0.3, WEAK_MULT = 2.6;
export function spawnZombie(type, at) { const z = spawnZombie0(type, at); if (game.waste && z) z.glow = true; if (z && game.mode === "adventure") z.wild = 1; return z; } // no Hearth to walk to in Adventure
function spawnZombie0(type, at) {
  const def = ZTYPES[type];
  let x, y;
  if (at) { x = at.x + rand(-40, 40); y = at.y + rand(-40, 40); }
  else {
    const side = (Math.random() * 4) | 0;
    x = side === 0 ? 20 : side === 1 ? W - 20 : rand(20, W - 20);
    y = side === 2 ? 20 : side === 3 ? H - 20 : rand(20, H - 20);
  }
  const hpScale = (1 + 0.12 * Math.max(0, game.night - 1)) * game.mods.zHp;
  const z = { id: world.nextId++, type, x, y, z: 0, vz: 0, gr: true, r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale, vx: 0, vy: 0, stun: 0, atk: 0, steer: 0, burn: false, special: now() + 6, charge: 0, arson: ["walker", "runner", "tank"].includes(type) && Math.random() < 0.35 };
  if (type === "flyer") { z.z = 160; z.gr = false; }
  const ac = armourChance(type, game.night);
  if (ac && Math.random() < ac) z.armHp = z.maxHp * (type === "boss" || type === "elite" ? 0.25 : 0.4);
  world.zombies.push(z);
  return z;
}
