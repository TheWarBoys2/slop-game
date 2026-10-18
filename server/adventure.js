// Adventure mode: towns past the hedge, notice boards, contracts, gigs, breaches and deliveries.
import { BOSSES } from "../story.js";
import { shock } from "../market.js";
import { DUST } from "../dust2.js";
import { makeTowns, rollQuest, TOWN_HALF, RENOWN_GOAL, LEGEND, legendText, cap } from "../adventure.js";
import { ZTYPES } from "../data.js";
import { rectHitsCircle } from "./building.js";
import { FAST, H, MV, W, dist2, pick, rand } from "./config.js";
import { TOWN, inTownXY, nearXY } from "./geometry.js";
import { WALL_HP } from "./map.js";
import { cure } from "./needs.js";
import { endGame, lootRarity, nightType, spawnZombie } from "./phases.js";
import { sendDlg } from "./social.js";
import { addGold, addXp, collide, feed, fullName, game, lootType, maxHp, newWeapon, players, price, toast } from "./state.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- natural disasters
// ---------------------------------------------------------------- Adventure: towns past the hedge, notice boards, contracts and travel (adventure.js)
// No Hearth to hold and no waves. Every town has a notice board of work (Witcher contracts, Cyberpunk gigs and breaches,
// deliveries between towns), a signpost for fast travel once you've been there, a merchant, a smith and an inn.
// Work is shared by the party: anyone can take it, everyone gets paid. Enough of it and the Legendary Contract goes up.
const ADV_BOARD = 3; // jobs on each board
const ADV_ACTIVE = 4; // jobs the party can have on at once
const ADV_TRAVEL = 25; // what the coach costs between signposts
export const ADV_DAY = FAST ? 6 : 240, ADV_NIGHT = FAST ? 8 : 150; // longer days: there's walking to do
world.ADV_KEEP = []; // the towns' patches, which the wild leaves alone
export const bossName = (k) => BOSSES[k].name.toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase()); // "The Drowned Mayor", not shouting it
export const advTowns = () => (game.adv ? game.adv.towns : []);
export function setupAdventure() {
  game.hearthMax = game.hearth = 1e9; game.dome = null; game.cameoDay = 0; // nothing to defend
  const home = { i: 0, name: world.VALLEY, cx: W / 2, cy: H / 2, tier: 1, home: true, folk: [], box: TOWN,
    board: { x: 1530, y: 1176, w: 90, h: 14, kind: "board", town: 0, z0: 0, z1: 70 }, sign: { x: 1650, y: 1176, w: 14, h: 14, kind: "sign", town: 0, z0: 0, z1: 96 } };
  const towns = [home, ...makeTowns(world.MAP_SEED, { x: W / 2, y: H / 2 }, [{ x: -600, y: -600, w: W + 1200, h: H + 1200 }, DUST], 5, 1)];
  const add = [home.board, home.sign];
  for (const t of towns.slice(1)) add.push(...t.walls);
  for (const w of add) { w.id = world.wallId++; const hp = WALL_HP[w.kind]; if (hp) w.hp = w.maxHp = hp; }
  for (const w of add) if (w.house) { w.hid = w.house.id; delete w.house; }
  world.WALLS.push(...add); world.mapVer++;
  world.ADV_KEEP = towns.slice(1).map((t) => t.box);
  let seq = 1;
  game.adv = { towns, quests: [], seq: () => seq++, disc: new Set([0]), renown: 0, legend: null, day: 1 };
  for (const t of towns) fillBoard(t);
  for (const p of players.values()) p.advTown = 0;
}
// open ground near a town, away from the other towns, the valley and Dust II
function advSpot(t, minD, maxD) {
  for (let i = 0; i < 80; i++) {
    const a = rand(0, Math.PI * 2), d = rand(minD, maxD), x = Math.round(t.cx + Math.cos(a) * d), y = Math.round(t.cy + Math.sin(a) * d);
    const r = { x: x - 150, y: y - 150, w: 300, h: 300 };
    const bad = (b, pad) => r.x < b.x + b.w + pad && r.x + r.w + pad > b.x && r.y < b.y + b.h + pad && r.y + r.h + pad > b.y;
    if (bad(TOWN, 300) || bad(DUST, 200) || world.ADV_KEEP.some((b) => bad(b, 300))) continue;
    return { x, y };
  }
  return { x: Math.round(t.cx + maxD), y: Math.round(t.cy) };
}
function fillBoard(t) {
  const A = game.adv, on = A.quests.filter((q) => q.state === "board" && q.town === t.i).length;
  for (let i = on; i < ADV_BOARD; i++) {
    const r = Math.random(), others = advTowns().filter((o) => o !== t);
    const kind = r < 0.36 ? "contract" : r < 0.64 ? "gig" : r < 0.84 ? "delivery" : "hack";
    const q = rollQuest(Math.random, t, kind, (a, b) => advSpot(t, a, b), pick(others), A.seq);
    q.state = "board"; A.quests.push(q);
  }
}
export const advTownAt = (e, pad = 0) => advTowns().find((t) => !t.home && Math.abs(e.x - t.cx) < TOWN_HALF + pad && Math.abs(e.y - t.cy) < TOWN_HALF + pad) || (inTownXY(e.x, e.y, pad) ? advTowns()[0] : null);
export const advActive = () => (game.adv ? game.adv.quests.filter((q) => q.state === "active") : []);
const enemiesNear = (p, r) => world.zombies.some((z) => !z.burn && dist2(z, p) < r * r);
// the folk: the map shows them like the valley's townsfolk, but they stand in their town square
export function advFolk() { return advTowns().flatMap((t) => t.folk.map((f) => ({ id: f.id, x: f.x, y: f.y, a: f.a, name: f.name, role: f.role, color: f.color, hat: f.hat, guest: 0 }))); }
function advFolkNear(p, r = 70) { for (const t of advTowns()) for (const f of t.folk) if (dist2(f, p) < r * r) return f; return null; }
export function advNearTrader(p, sid) { const job = sid === "general" ? "merchant" : sid === "armoury" ? "smith" : ""; return !!job && advTowns().some((t) => t.folk.some((f) => f.job === job && dist2(f, p) < 160 * 160)); }
function advPay(q, why) {
  for (const p of players.values()) { addGold(p, q.gold, why); addXp(p, q.xp); }
  game.adv.renown++;
  shock(game.market, "*", 0.01);
}
function advComplete(q, by, msg) {
  q.state = "done";
  advPay(q, q.kind === "contract" || q.legend ? "Contract reward" : q.kind === "delivery" ? "Delivery" : "Fixer payment");
  if (q.item) { const p = by && players.get(by); const at = p ? { x: p.x + rand(-30, 30), y: p.y + 40 } : { x: q.at.x, y: q.at.y }; collide(at, 20); world.crates.push({ id: world.nextId++, ...at, w: newWeapon(lootType(), Math.min(4, lootRarity(q.tier) + (q.tier >= 3 ? 1 : 0))) }); }
  world.events.push({ k: "banner", text: q.kind === "contract" ? "CONTRACT COMPLETE" : q.kind === "delivery" ? "DELIVERED" : q.kind === "hack" ? "BREACH COMPLETE" : "GIG COMPLETE", sub: `${q.title}. ${q.gold}g and ${q.xp} XP each. Renown ${game.adv.renown}/${RENOWN_GOAL}.` });
  if (msg) feed(msg, "#7dffb0");
  if (game.adv.renown >= RENOWN_GOAL && !game.adv.legend) advLegend();
}
// a quest's monsters: they don't wander off, don't burn at dawn, and don't get tidied away when nobody's looking
function advSpawn(q, type, at, hpMul = 1) {
  const z = spawnZombie(type, at);
  if (!z) return null;
  z.keep = 1; z.qid = q.id; z.arson = false;
  const k = (1 + 0.35 * (q.tier - 1)) * hpMul; z.hp *= k; z.maxHp *= k;
  return z;
}
function advLegend() {
  const A = game.adv, far = advTowns().slice(1).sort((a, b) => b.tier - a.tier)[0] || advTowns()[0];
  const kind = pick(Object.keys(BOSSES)), bn = bossName(kind);
  const q = { id: A.seq(), kind: "contract", legend: true, town: far.i, tier: 6, title: `${LEGEND.title}: ${bn}`, desc: legendText(bn, far.name), at: advSpot(far, 1400, 2200), r: 500, gold: LEGEND.gold, xp: LEGEND.xp, item: true, step: "hunt", found: 3, boss: kind, state: "active" };
  A.legend = q; A.quests.push(q);
  world.events.push({ k: "banner", text: "THE LEGENDARY CONTRACT", sub: `${bn} has come out of hiding near ${far.name}. Kill it to finish the adventure (💀 on your compass).` });
  feed(`Every notice board in the valley has the same poster: ${bn}, near ${far.name}.`, "#ffd34d");
}
// what the journal and the compass show for a quest: [what to do, where]
function advStep(q) {
  const T = advTowns(), home = T[q.town] || T[0], board = { x: home.board.x + 45, y: home.board.y + 7 };
  if (q.kind === "contract") {
    if (q.step === "search") return [`Search the marked area for signs of ${q.beast} (${q.found}/3 found, 🔍 when you're close)`, q.at];
    if (q.step === "hunt") return q.night && game.phase !== "night" && !q.zid ? [`You know enough. ${cap(q.beast)} only comes out at night: be at its lair after dusk`, q.at] : [`Hunt ${q.legend ? bossName(q.boss) : q.beast} at its lair`, q.at];
    return [`Collect your pay at the ${home.name} notice board`, board];
  }
  if (q.kind === "gig") return [q.step === "fight" ? `Clear ${q.place}: ${q.left.filter((id) => world.zombies.some((z) => z.id === id)).length} left` : `Go to ${q.place} and clear it out`, q.at];
  if (q.kind === "hack") return [`Breach the ${q.what} (press E at it)`, q.at];
  const c = q.carrier && players.get(q.carrier), dest = T[q.to];
  if (!c) return [`The parcel was dropped. Pick it up (📦) and take it to ${dest.name}`, q.drop || q.at];
  return [`${fullName(c)} is carrying ${q.goods} to the ${dest.name} notice board${q.day === game.night + 1 && game.phase === "day" ? " (before nightfall for a bonus)" : ""}`, { x: dest.board.x + 45, y: dest.board.y + 7 }];
}
export function advView() {
  const A = game.adv; if (!A) return null;
  const r = Math.round, pts = [];
  for (const q of advActive()) {
    if (q.kind === "contract" && q.clues) for (const c of q.clues) if (!c.found) pts.push([r(c.x), r(c.y), 0]);
    if (q.kind === "delivery" && q.drop && !q.carrier) pts.push([r(q.drop.x), r(q.drop.y), 1]);
  }
  return {
    t: A.towns.map((t) => [t.name, r(t.cx), r(t.cy), A.disc.has(t.i) ? 1 : 0, t.tier, t.home ? 1 : 0]),
    q: advActive().map((q) => { const [txt, at] = advStep(q); return [q.id, q.kind, q.title, txt, r(at.x), r(at.y), q.step === "search" || q.step === "go" ? q.r : 0, A.towns[q.town].name, q.gold, q.legend ? 1 : 0, q.night ? 1 : 0, q.desc]; }),
    ren: [A.renown, RENOWN_GOAL], pts,
    qb: world.zombies.filter((z) => z.qname).map((z) => [z.id, z.qname]),
  };
}
// quest spots are picked before the wild there is built, so once it is, shuffle anything that landed in a rock or a tree onto open ground
function advClear(pt) {
  const blocked = (x, y) => nearXY(x, y).some((w) => (w.z1 || 0) > 8 && (w.z0 || 0) < 60 && !MV.soft(w) && rectHitsCircle(w, { x, y }, 36));
  for (let r = 0; r < 400; r += 30) for (let i = 0; i < (r ? 12 : 1); i++) {
    const a = i / 12 * Math.PI * 2, x = Math.round(pt.x + Math.cos(a) * r), y = Math.round(pt.y + Math.sin(a) * r);
    if (!blocked(x, y)) { pt.x = x; pt.y = y; return pt; }
  }
  return pt;
}
// ---- the loop
export function advTick(t) {
  const A = game.adv; if (!A || !(game.phase === "day" || game.phase === "night")) return;
  const live = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of live) { // finding towns
    const tw = advTownAt(p);
    if (tw) p.advTown = tw.i;
    if (tw && !A.disc.has(tw.i)) {
      A.disc.add(tw.i); addXp(p, 25);
      world.events.push({ k: "banner", text: tw.name.toUpperCase(), sub: `New town discovered. Its signpost can take you to any town you've found, and its notice board has work.` });
      feed(`${fullName(p)} found ${tw.name}.`, "#ffe9a0");
    }
  }
  for (const q of advActive()) {
    if (!q.cleared && live.some((p) => dist2(p, q.at) < 1100 * 1100)) { // the wild round here exists now
      q.cleared = true;
      for (const c of q.clues || []) advClear(c);
      const cache = q.kind === "hack" && world.caches.find((c) => c.qid === q.id); if (cache) { advClear(cache); q.at = { x: cache.x, y: cache.y }; }
    }
    if (q.kind === "contract" && q.step === "hunt" && !q.zid) {
      const close = live.some((p) => dist2(p, q.at) < 900 * 900);
      if (close && (!q.night || game.phase === "night" || q.legend)) {
        if (q.legend) {
          game.bossKind = q.boss;
          const b = spawnZombie("boss", q.at); if (!b) continue;
          b.keep = 1; b.qid = q.id; b.x = q.at.x; b.y = q.at.y;
          b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * BOSSES[q.boss].hp * (0.6 + 0.4 * Math.max(1, players.size)));
          game.bossId = b.id; q.zid = b.id;
          world.events.push({ k: "banner", text: BOSSES[q.boss].name.toUpperCase(), sub: "The Legendary Contract. Kill it to finish the adventure." });
        } else {
          const big = ["runner", "flyer", "screamer", "boomer"].includes(q.base) ? 8 : q.base === "rex" ? 0.7 : 2.4;
          const z = advSpawn(q, q.base, q.at, big * (0.6 + 0.4 * Math.max(1, players.size)));
          if (!z) continue;
          z.x = q.at.x; z.y = q.at.y; z.qname = cap(q.beast); z.weak = q.weak; z.armHp = z.maxHp * 0.3;
          q.zid = z.id;
          for (let i = 0; i < 1 + q.tier; i++) advSpawn(q, q.tier >= 3 ? "runner" : "walker", q.at);
          world.events.push({ k: "roar", x: z.x, y: z.y });
          feed(`${cap(q.beast)} is here.`, "#ff9060");
        }
      }
    } else if (q.kind === "contract" && q.step === "hunt" && q.zid && !world.zombies.some((z) => z.id === q.zid)) {
      if (q.legend) { game.bossId = 0; q.state = "done"; advPay(q, "The Legendary Contract"); endGame(true); return; }
      q.step = "return";
      world.events.push({ k: "banner", text: `${cap(q.beast).toUpperCase()} IS DEAD`, sub: `Take the news back to ${A.towns[q.town].name} and collect your pay at the notice board.` });
    }
    if (q.kind === "gig") {
      if (q.step === "go" && live.some((p) => dist2(p, q.at) < 700 * 700)) {
        q.step = "fight"; q.left = [];
        const n = Math.round((5 + 2 * q.tier) * (0.7 + 0.3 * Math.max(1, players.size)));
        for (let i = 0; i < n; i++) { const z = advSpawn(q, nightType(1 + q.tier, false), q.at); if (z) q.left.push(z.id); }
        const lt = advSpawn(q, q.tier >= 4 ? "charger" : "tank", q.at, 1.4); if (lt) { lt.armHp = lt.maxHp * 0.3; lt.qname = "The Boss"; q.left.push(lt.id); }
        feed(`${q.place}: there they are.`, "#ff9060");
      } else if (q.step === "fight" && !q.left.some((id) => world.zombies.some((z) => z.id === id))) advComplete(q, 0, `Fixer: "${q.place} is clear. Money's sent. Nice work."`);
    }
    if (q.kind === "hack" && !q.guards && live.some((p) => dist2(p, q.at) < 650 * 650)) {
      q.guards = true;
      for (let i = 0; i < 2 + q.tier; i++) advSpawn(q, Math.random() < 0.4 ? "runner" : "walker", { x: q.at.x + rand(-200, 200), y: q.at.y + rand(-200, 200) });
      if (q.tier >= 3) advSpawn(q, "screamer", q.at);
    }
    if (q.kind === "delivery") {
      const c = q.carrier && players.get(q.carrier);
      if (q.carrier && (!c || c.dead)) { q.drop = c ? { x: c.x, y: c.y } : q.drop || { x: A.towns[q.town].cx, y: A.towns[q.town].cy }; q.carrier = 0; feed(`The parcel for ${A.towns[q.to].name} was dropped. Somebody pick it up (📦).`, "#ffb070"); }
      const dest = A.towns[q.to];
      if (c && !c.dead && rectHitsCircle(dest.board, c, 200)) {
        const early = q.day === game.night + 1 && game.phase === "day";
        if (early) q.gold = Math.round(q.gold * 1.5);
        advComplete(q, c.id, `${fullName(c)} delivered ${q.goods} to ${dest.name}${early ? " before nightfall (+50%)" : ""}.`);
      }
    }
  }
}
// E near a sign of the beast, a dropped parcel, a board, a signpost or one of the folk
export function advInteract(p) {
  const A = game.adv; if (!A) return false;
  for (const q of advActive()) {
    if (q.kind === "contract" && q.step === "search") for (const c of q.clues) if (!c.found && dist2(c, p) < 60 * 60) {
      c.found = true; q.found++; addXp(p, 10);
      world.events.push({ k: "advsign", n: q.found });
      feed(`Sign ${q.found}/3: ${q.signs[q.found - 1]}`, "#e0c0ff");
      if (q.found >= 3) { q.step = "hunt"; feed(q.night ? `That's enough to go on. ${cap(q.beast)} comes out after dark.` : `That's enough to go on. ${cap(q.beast)} is close.`, "#ffd34d"); }
      return true;
    }
    if (q.kind === "delivery" && q.drop && !q.carrier && dist2(q.drop, p) < 60 * 60) { q.carrier = p.id; q.drop = null; toast(p, `You pick up ${q.goods}. Take it to ${A.towns[q.to].name}.`, "#ffd34d"); return true; }
  }
  for (const t of A.towns) {
    if (rectHitsCircle(t.board, p, 60)) { p.dlg = { adv: "board", town: t.i, node: "start", at: { x: t.board.x + 45, y: t.board.y + 7 } }; sendDlg(p); return true; }
    if (rectHitsCircle(t.sign, p, 60)) { p.dlg = { adv: "sign", town: t.i, node: "start", at: { x: t.sign.x + 7, y: t.sign.y + 7 } }; sendDlg(p); return true; }
  }
  const f = advFolkNear(p);
  if (f) { p.talked.add(f.id); p.dlg = { adv: "folk", town: f.town, folk: f.id, node: "start", at: { x: f.x, y: f.y } }; sendDlg(p); return true; }
  return false;
}
// the board, the signpost and the folk all talk through the ordinary dialogue box
function advNode(p) {
  const A = game.adv, d = p.dlg, t = A.towns[d.town], bye = { label: "Leave.", go: null };
  if (d.adv === "board") {
    const offers = A.quests.filter((q) => q.state === "board" && q.town === t.i);
    const owed = A.quests.filter((q) => q.state === "active" && q.kind === "contract" && q.step === "return" && q.town === t.i);
    if (d.node.startsWith("q")) {
      const q = A.quests.find((x) => x.id === +d.node.slice(1));
      if (!q || q.state !== "board") return { name: `${t.name} notice board`, role: "", text: "Somebody's already torn that one down.", opts: [{ label: "Back.", go: "start" }, bye] };
      const lvl = q.tier, warn = p.lvl < lvl * 2 ? ` It looks hard for your level (${lvl * 2}+ suggested).` : "";
      return { name: q.title, role: `Level ${lvl * 2}+ · ${q.gold}g · ${q.xp} XP each${q.item ? " · a weapon" : ""}`, text: q.desc + warn,
        opts: [{ label: "Take the job.", do: () => advAccept(p, q), go: "start" }, { label: "Back.", go: "start" }, bye] };
    }
    const opts = [
      ...owed.map((q) => ({ label: `Collect your pay: ${q.title} (${q.gold}g each)`, do: () => advComplete(q, p.id, `${fullName(p)} brought word to ${t.name}: ${q.beast} is dead.`), go: "start" })),
      ...offers.map((q) => ({ label: `${q.title}  ·  Lv ${q.tier * 2}+  ·  ${q.gold}g`, go: "q" + q.id })),
      bye];
    const n = advActive().length;
    return { name: `${t.name} notice board`, role: `Work on offer. The party has ${n}/${ADV_ACTIVE} jobs on. Renown ${A.renown}/${RENOWN_GOAL}.`,
      text: offers.length ? "Notices, nailed on top of older notices. New ones go up every morning." : "Nothing new today. More goes up at dawn.", opts };
  }
  if (d.adv === "sign") {
    const dests = A.towns.filter((o) => o !== t && A.disc.has(o.i));
    const near = enemiesNear(p, 450);
    return { name: `Signpost: ${t.name}`, role: `Fast travel to any town you've found · ${ADV_TRAVEL}g`,
      text: near ? "You can't travel with the dead this close. Deal with them first." : dests.length ? "Where to? The coach leaves when you're on it." : "You haven't found any other towns yet. Go and look: they're on the map in your journal [J].",
      opts: [...(near ? [] : dests.map((o) => ({ label: `${o.name}${o.home ? " (home)" : ""}  ·  ${Math.round(Math.hypot(o.cx - t.cx, o.cy - t.cy) / 10)}m`, do: () => advTravel(p, o), go: null }))), bye] };
  }
  const f = t.folk.find((x) => x.id === d.folk);
  if (!f) return { name: "", role: "", text: "", opts: [bye] };
  const rumour = () => {
    const q = A.quests.find((x) => x.state === "board" && x.town !== t.i && x.tier >= t.tier) || A.quests.find((x) => x.state === "board" && x.town !== t.i);
    if (A.legend && A.legend.state === "active") return `Everyone's talking about ${bossName(A.legend.boss)}. Out past ${A.towns[A.legend.town].name}, they say.`;
    return q ? `Heard ${A.towns[q.town].name} is paying ${q.gold}g for "${q.title.replace(/^\w+: /, "")}". Their notice board, if you're interested.` : "Quiet, for once. Don't jinx it.";
  };
  if (d.node === "news") return { name: f.name, role: f.role, text: rumour(), opts: [{ label: "Back.", go: "start" }, bye] };
  const opts = [];
  if (f.job === "merchant") opts.push({ label: "Let's trade.", do: () => p.pe.push({ k: "shop", sid: "general", at: [Math.round(f.x), Math.round(f.y)] }), go: null });
  if (f.job === "smith") opts.push({ label: "Let's trade.", do: () => p.pe.push({ k: "shop", sid: "armoury", at: [Math.round(f.x), Math.round(f.y)] }), go: null });
  if (f.job === "keeper") opts.push({ label: "A hot meal and a bed (20g).", do: () => advRest(p), go: null });
  opts.push({ label: "Any news?", go: "news" }, bye);
  const hello = { merchant: "Tins, bandages, gifts for whoever you're courting. Coin first.", smith: "Guns, bullets, plate. I enhance too, if you're feeling lucky.", keeper: "Sit down before you fall down. You look like the road chewed you up." }[f.job];
  return { name: f.name, role: f.role, text: hello, opts };
}
export function advSend(p) {
  const n = advNode(p);
  p.dlgOpts = n.opts;
  p.pe.push({ k: "dlg", npc: p.dlg.folk || "", name: n.name, role: n.role, text: n.text, opts: n.opts.map((o) => o.label) });
}
export function advPick(p, i) {
  const o = p.dlgOpts && p.dlgOpts[i], d = p.dlg;
  if (o && o.do) o.do();
  p.dlg = o && o.go && p.dlg === d ? { ...d, node: o.go } : null;
  sendDlg(p);
}
function advAccept(p, q) {
  if (advActive().filter((x) => !x.legend).length >= ADV_ACTIVE) return toast(p, `The party already has ${ADV_ACTIVE} jobs on. Finish one first [J].`, "#f88");
  q.state = "active"; q.by = p.id; q.day = game.night + 1;
  if (q.kind === "contract") q.clues = Array.from({ length: 3 }, () => { const a = rand(0, Math.PI * 2), d = rand(60, q.r - 40); return { x: Math.round(q.at.x + Math.cos(a) * d), y: Math.round(q.at.y + Math.sin(a) * d), found: false }; });
  if (q.kind === "hack") world.caches.push({ id: world.nextId++, x: q.at.x, y: q.at.y, qid: q.id });
  if (q.kind === "delivery") { q.carrier = p.id; toast(p, `You're carrying ${q.goods}. If you die, it drops where you fall.`, "#ffd34d"); }
  feed(`${fullName(p)} took a job: ${q.title}. It's in everyone's journal [J].`, "#e0c0ff");
  fillBoard(game.adv.towns[q.town]);
}
function advTravel(p, o) {
  if (enemiesNear(p, 450)) return toast(p, "Not with the dead this close.", "#f88");
  const cost = price(p, ADV_TRAVEL);
  if (p.gold < cost) return toast(p, `The coach is ${cost}g. You have ${p.gold}g.`, "#f88");
  p.gold -= cost;
  const at = { x: o.sign.x + 7 + rand(-30, 30), y: o.sign.y + 70 };
  p.x = at.x; p.y = at.y; p.z = 0; p.vx = p.vy = p.vz = 0; collide(p, 16); p.advTown = o.i;
  p.pe.push({ k: "travel", to: o.name });
  toast(p, `The coach drops you off in ${o.name}.`, "#ffe9a0");
}
function advRest(p) {
  const cost = price(p, 20);
  if (p.gold < cost) return toast(p, `It's ${cost}g. You have ${p.gold}g.`, "#f88");
  p.gold -= cost; p.hp = maxHp(p); p.food = 100; p.water = 100; p.stress = 0; p.invDirty = true;
  cure(p, "A night's sleep sees the infection off.");
  toast(p, "Stew, ale, a lumpy bed. You feel brand new.", "#8f8");
}
// a hacked relay finishes its job; anything else hacked is just a cache
export function advHacked(p, c, solved) {
  const q = game.adv && game.adv.quests.find((x) => x.id === c.qid);
  if (!q || q.state !== "active") return;
  q.gold = Math.round(q.gold * (0.7 + 0.15 * solved));
  advComplete(q, p.id, `Fixer: "Data's coming through. ${solved}/3 daemons, ${solved === 3 ? "clean job" : "messy but it'll do"}. Money's sent."`);
}
export function advDawn() {
  const A = game.adv; if (!A) return;
  A.quests = A.quests.filter((q) => q.state !== "board" || Math.random() < 0.5); // half of yesterday's notices come down
  for (const t of A.towns) fillBoard(t);
  feed("New work is up on the notice boards.", "#e0c0ff");
}
