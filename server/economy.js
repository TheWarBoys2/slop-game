// Vex's Casino, the produce stall, the bag, the shops' slot machines, the stock exchange, elections and the celebrity's requests.
import { QUESTS } from "../npcs.js";
import { COSMETICS, FREE_HATS, rollCosmetic, WHEEL, spinWheel, deck, bjValue, pokerScore, handName, compareHands, dealerHolds } from "../casino.js";
import { ITEMS, GEAR, BAG_SIZE, bagAdd, bagCount, bagTake, itemName, CROPS, CROP_KEYS, SEED_PACK } from "../items.js";
import { STOCKS, SYMS, FEE, shock } from "../market.js";
import { CANDIDATES, ballot } from "../politics.js";
import { giveWeapon } from "./actions.js";
import { advPick } from "./adventure.js";
import { rectHitsCircle } from "./building.js";
import { ANTIDOTE_IMMUNE, clamp, dist2, now, own, pick, rand } from "./config.js";
import { near } from "./geometry.js";
import { KEEPERS, SHOPS, boxDist, cropPrice, inside, nearShop, nearStall, seedPrice, shopBld, shopIsOpen, stallOpen } from "./map.js";
import { mechInstall } from "./mechs.js";
import { addRad, addStress, cure } from "./needs.js";
import { FIRST_NUKE } from "./nukes.js";
import { spawnZombie } from "./phases.js";
import { dlgCtx, npcApi, openPack, sendDlg } from "./social.js";
import { addGold, addXp, deed, feed, fullName, game, lootType, maxHp, newWeapon, players, sk, toast, wName } from "./state.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- Vex's Casino (in-game gold only)
export function sendCasino(p) {
  const c = p.casino;
  p.pe.push({ k: "casino", spins: p.spins, game: c ? { ...c, deck: undefined, d: c.k === "bj" && c.hide ? [c.d[0], "??"] : c.k === "pk" && c.stage === "hold" ? null : c.d } : null });
}
function giveCosmetic(p, id, why) {
  if (!id) { addGold(p, 30, "You own everything in that pool. Refund"); return; }
  const had = p.cos.has(id);
  p.cos.add(id);
  p.pe.push({ k: "cos", list: [...p.cos] });
  const c = COSMETICS[id];
  toast(p, had ? `Duplicate ${c.name}. Vex gives you 30g for it.` : `New ${c.bad ? "(terrible) " : ""}cosmetic: ${c.name}! Press V to wear it.`, ["#ddd", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"][c.rarity]);
  if (had) addGold(p, 30);
  else if (c.rarity >= 3) feed(`${fullName(p)} won the ${["", "", "", "LEGENDARY", "MYTHIC"][c.rarity]} ${c.name}${why ? " " + why : ""}`, c.rarity === 4 ? "#ff4b4b" : "#ffc030");
}
function casinoCrate(p, rarity, type) { giveWeapon(p, newWeapon(type || lootType(), rarity)); p.pe.push({ k: "case", type: p.weapons[p.active].type, rarity, name: wName(p.weapons[p.active]) }); }
export function doSpin(p) {
  if (p.spinning || p.spins <= 0 || p.casino) return;
  if (!nearShop(p, "casino")) return toast(p, "The wheel's at the Golden Slop.", "#f88");
  shock(game.market, "VEX", 0.005);
  p.spins--; p.spinning = true; p.spunTotal++;
  const i = process.env.SLOP_WHEEL ? WHEEL.findIndex((w) => w.id === process.env.SLOP_WHEEL) : spinWheel(), seg = WHEEL[i]; // SLOP_WHEEL: testing only
  p.pe.push({ k: "wheel", seg: i });
  if (p.spunTotal === 10) { feed(`${fullName(p)} has spun the wheel 10 times. Brother Aldous is organising an intervention.`, "#e0c0ff"); giveCosmetic(p, "degen"); }
  setTimeout(() => {
    p.spinning = false;
    if (!players.has(p.id)) return;
    if (seg.id === "jackpot") { addGold(p, 1000, "JACKPOT"); feed(`🎰 ${fullName(p)} HIT THE JACKPOT (1000g)`, "#ffd34d"); if (!p.cos.has("roller")) giveCosmetic(p, "roller", "for hitting the jackpot"); }
    else if (seg.id === "g150") addGold(p, 150, "Wheel");
    else if (seg.id === "g50") addGold(p, 50, "Wheel");
    else if (seg.id === "lose") toast(p, "Nothing. The wheel doesn't care about you.", "#aaa");
    else if (seg.id === "bankrupt") { const lost = Math.floor(p.gold * 0.25); p.gold -= lost; toast(p, `BANKRUPT! Vex takes ${lost}g. "Better luck next spin!"`, "#ff5050"); }
    else if (seg.id === "cos") giveCosmetic(p, rollCosmetic(p.cos));
    else if (seg.id === "crate") casinoCrate(p, 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0));
    else if (seg.id === "ak") { casinoCrate(p, Math.random() < 0.1 ? 4 : 3, "ak"); feed(`${fullName(p)} won an AK-Maybe on the wheel. Nobody knows how many bullets it has. Neither does it.`, "#ff9d2e"); }
    else if (seg.id === "again") { p.spins += 2; toast(p, "Two more spins!", "#ff9d2e"); }
    else if (seg.id === "skill") { p.pts++; toast(p, "+1 skill point. Press K.", "#9fe0ff"); }
    else if (seg.id === "bj") { p.casino = { k: "bj", deck: deck(), p: [], d: [], w: 0, l: 0, hide: true, msg: "Blackjack! Win 2 hands out of 3." }; dealBj(p); }
    else if (seg.id === "poker") { const dk = deck(); p.casino = { k: "pk", deck: dk, p: dk.splice(0, 5), d: dk.splice(0, 5), stage: "hold", msg: "Five-card draw. Click the cards you want to KEEP, then Draw." }; }
    sendCasino(p);
  }, 4200);
}
function dealBj(p) {
  const c = p.casino;
  if (c.deck.length < 15) c.deck = deck();
  c.p = [c.deck.pop(), c.deck.pop()]; c.d = [c.deck.pop(), c.deck.pop()]; c.hide = true; c.over = false;
  if (bjValue(c.p) === 21) finishBjHand(p);
}
function finishBjHand(p) {
  const c = p.casino; c.hide = false;
  const pv = bjValue(c.p);
  if (pv <= 21) while (bjValue(c.d) < 17) c.d.push(c.deck.pop());
  const dv = bjValue(c.d);
  const res = pv > 21 ? -1 : dv > 21 ? 1 : Math.sign(pv - dv);
  if (res > 0) c.w++; else if (res < 0) c.l++;
  c.msg = `${res > 0 ? "You win the hand" : res < 0 ? "Dealer wins the hand" : "Push"} (${pv > 21 ? "bust" : pv} vs ${dv > 21 ? "bust" : dv}). Score ${c.w}-${c.l}.`;
  if (c.w >= 2 || c.l >= 2) {
    c.over = true;
    if (c.w >= 2) { c.msg += " YOU BEAT THE HOUSE! 250g and a Legendary crate."; addGold(p, 250, "Blackjack"); casinoCrate(p, 3); if (!p.cos.has("bandit")) giveCosmetic(p, "bandit"); feed(`${fullName(p)} beat Vex at blackjack`, "#3fbf6f"); }
    else { c.msg += " The house wins. It always does."; if (Math.random() < 0.5) giveCosmetic(p, rollCosmetic(p.cos, { bad: true })); }
  } else c.next = true;
}
export function casinoAct(p, m) {
  const c = p.casino; if (!c) return;
  if (m.a === "leave") { if (c.over || c.k === "pk" && c.stage === "done" || (c.k === "bj" && c.w === 0 && c.l === 0 && !c.p.length)) p.casino = null; else toast(p, "Finish the game first. Vex is watching.", "#f88"); return sendCasino(p); }
  if (c.k === "bj" && !c.over) {
    if (c.next && m.a === "deal") { c.next = false; dealBj(p); }
    else if (!c.next && m.a === "hit") { c.p.push(c.deck.pop()); if (bjValue(c.p) >= 21) finishBjHand(p); }
    else if (!c.next && m.a === "stand") finishBjHand(p);
  } else if (c.k === "pk" && c.stage === "hold" && m.a === "draw" && Array.isArray(m.hold)) {
    c.p = c.p.map((card, i) => (m.hold[i] ? card : c.deck.pop()));
    const dh = dealerHolds(c.d); c.d = c.d.map((card, i) => (dh[i] ? card : c.deck.pop()));
    c.stage = "done";
    const res = compareHands(c.p, c.d), cat = pokerScore(c.p)[0];
    c.msg = `You: ${handName(c.p)}. Vex: ${handName(c.d)}. `;
    if (res > 0) {
      c.msg += "YOU WIN!";
      if (cat >= 5) { casinoCrate(p, 4); c.msg += " A MYTHIC crate!"; } else if (cat >= 3) { casinoCrate(p, 3); addGold(p, 250); c.msg += " Legendary crate and 250g."; } else if (cat === 2) { casinoCrate(p, 2); addGold(p, 200); c.msg += " Epic crate and 200g."; } else { addGold(p, 120); c.msg += " 120g."; }
      if (cat >= 3 && !p.cos.has("shark")) giveCosmetic(p, "shark");
      feed(`${fullName(p)} won at poker with ${handName(c.p)}`, "#4da6ff");
    } else { c.msg += res < 0 ? "Vex wins. He always seems to." : "A tie. Vex keeps the pot anyway, on a technicality."; if (Math.random() < 0.35) giveCosmetic(p, rollCosmetic(p.cos, { bad: true })); }
  }
  sendCasino(p);
}
export function equip(p, slot, id) {
  if (slot === "hat" && (FREE_HATS.includes(id) || (own(COSMETICS, id)?.slot === "hat" && p.cos.has(id)))) p.hat = id;
  else if ((slot === "trail" || slot === "title") && (id === "" || (own(COSMETICS, id)?.slot === slot && p.cos.has(id)))) p[slot] = id;
}
// ---------------------------------------------------------------- the produce stall
export function openShop(p, sid) {
  if (game.mode === "royale") return toast(p, "Boarded up for the Royale.", "#bbb");
  if (!shopIsOpen(sid)) return toast(p, SHOPS[sid].shut, "#bbb");
  p.pe.push({ k: "shop", sid });
}
export function openStall(p) {
  const k = KEEPERS.find((q) => q.sid === "produce");
  if (!stallOpen(k)) return toast(p, `The stall's shut. ${k.name} has gone home for the night. Back at dawn.`, "#bbb");
  p.pe.push({ k: "stall", sid: "produce" });
}
export function stallAct(p, m) {
  if (game.mode === "royale" || p.dead || !nearStall(p)) return;
  const k = KEEPERS.find((q) => q.sid === "produce");
  if (!stallOpen(k)) return toast(p, "The stall's shut for the night.", "#bbb");
  if (m.a === "buy") {
    const id = String(m.id); if (!own(CROPS, id)) return;
    const cost = seedPrice(p, id);
    if (p.gold < cost) return toast(p, `That's ${cost}g. You've got ${p.gold}g.`, "#f88");
    if (!bagAdd(p.bag, "s_" + id, SEED_PACK)) return toast(p, "Your bag is full.", "#f88");
    p.gold -= cost; p.seedSel = id; p.invDirty = true;
    return toast(p, `${SEED_PACK} ${CROPS[id].name.toLowerCase()} seeds. "Mind the crows."`, "#8f8");
  }
  if (m.a === "sell") {
    const ids = m.id === "*" ? CROP_KEYS : [String(m.id)];
    let got = 0, n = 0;
    for (const id of ids) {
      if (!own(CROPS, id)) continue;
      const have = bagCount(p.bag, id), take = m.id === "*" ? have : Math.min(have, Math.max(1, m.n | 0));
      if (!take) continue;
      const each = cropPrice(p, id);
      bagTake(p.bag, id, take); got += each * take; n += take;
      shock(game.market, "FARM", -0.004 * take * Math.sqrt(CROPS[id].sell / 25)); // flood the market and prices drop
    }
    if (!n) return toast(p, "You've nothing he wants. He buys anything you've grown.", "#bbb");
    p.invDirty = true; p.st.sold = (p.st.sold || 0) + n;
    addGold(p, got, "Sold produce"); addXp(p, Math.min(40, n * 2)); deed("soil", Math.min(5, n));
    return toast(p, `Sold ${n} for ${got}g. ${pick(["\"Lovely.\"", "\"I've seen worse.\"", "\"Fresh as you like.\"", "\"Don't tell Vex what I paid.\""])}`, "#ffd34d");
  }
}
// ---------------------------------------------------------------- the bag
export function invMsg(p) {
  return { k: "inv", sel: p.seedSel || "", bag: p.bag, gear: p.gear, food: Math.round(p.food), water: Math.round(p.water), rad: Math.round(p.rad), shares: p.shares, basis: p.basis, cards: p.cards, deck: p.deck, size: BAG_SIZE };
}
export function useItem(p, i) {
  const it = p.bag[i]; if (!it || p.dead || p.air) return;
  if (it.gear) return equipGear(p, i);
  const d = ITEMS[it.id]; if (!d) return;
  if (d.kind === "mech") return mechInstall(p, it.id.slice(3));
  if (d.kind === "gift") return toast(p, "That's a gift. Talk to someone [E] and give it to them.", "#ff8fc8");
  if (d.kind === "pack") { bagTake(p.bag, it.id); return openPack(p); }
  if (d.kind === "seed") { p.seedSel = d.crop; p.invDirty = true; return toast(p, `You'll plant ${CROPS[d.crop].name.toLowerCase()} next. Press E at an empty plot.`, "#8f8"); }
  if (d.cure && !p.inf) return toast(p, "You're not infected.", "#bbb");
  if (d.kind === "med" && d.hp && p.hp >= maxHp(p)) return toast(p, "You're already at full health.", "#bbb");
  if (d.rad && p.rad <= 0) return toast(p, "You're not irradiated.", "#bbb");
  bagTake(p.bag, it.id); p.invDirty = true;
  if (d.f) p.food = Math.min(100, p.food + d.f);
  if (d.d) p.water = Math.min(100, p.water + d.d);
  if (d.hp) p.hp = Math.min(maxHp(p), p.hp + d.hp);
  if (d.bw) p.bw = Math.min(99, p.bw + d.bw);
  if (d.bl) p.bl = Math.min(99, p.bl + d.bl);
  if (d.stress) addStress(p, d.stress);
  if (d.drunk) p.drunk = Math.min(90, p.drunk + d.drunk);
  if (d.fizz) p.fizz = now() + d.fizz;
  if (d.cure) { cure(p, `The antidote tastes like pennies. The infection is gone, and you're immune for ${ANTIDOTE_IMMUNE}s.`); p.immune = now() + ANTIDOTE_IMMUNE; }
  if (d.radRes) p.iodine = now() + d.radRes;
  if (d.rad) p.rad = Math.max(0, p.rad + d.rad);
  if (d.grown) p.st.ateGrown++;
  if (game.waste && d.kind === "food" && !d.tinned) addRad(p, 4); // everything that isn't in a tin is a bit glowy now
  if (d.sick && Math.random() < d.sick) { p.bw = Math.min(99, p.bw + 50); toast(p, "Your stomach makes a noise like a drain.", "#a0703a"); }
  else toast(p, d.kind === "drink" ? `You drink the ${d.name.toLowerCase()}.` : d.kind === "med" ? `You use the ${d.name.toLowerCase()}.` : `You eat the ${d.name.toLowerCase()}.`, "#8f8");
}
function equipGear(p, i) {
  const it = p.bag[i], d = GEAR[it.id]; if (!d) return;
  const old = p.gear[d.slot];
  p.gear[d.slot] = { id: it.id, r: it.r || 0 };
  if (old) p.bag[i] = { id: old.id, r: old.r, gear: 1 }; else p.bag.splice(i, 1);
  p.invDirty = true;
  toast(p, `You put on the ${d.name}.`, "#8f8");
}
export function itemAct(p, m) {
  if (m.a === "use") return useItem(p, m.i | 0);
  if (m.a === "unequip") { const g = own(p.gear, m.slot); if (!g) return; if (!bagAdd(p.bag, g.id, 1, g.r)) return toast(p, "Your bag is full.", "#f88"); delete p.gear[m.slot]; p.invDirty = true; return; }
  if (m.a === "drop") { // leave it on the ground in a crate, for anyone to pick up
    const it = p.bag[m.i | 0]; if (!it || p.dead || p.air) return;
    p.bag.splice(m.i | 0, 1); p.invDirty = true;
    world.crates.push({ id: world.nextId++, x: p.x + rand(-20, 20), y: p.y + 30, it: { id: it.id, n: it.n || 1, r: it.r || 0 } });
    return toast(p, `Dropped ${itemName(it)}.`, "#bbb");
  }
  if (m.a === "give" || m.a === "gold") { // hand something to the nearest mate standing next to you
    if (p.dead || p.air) return;
    let mate = null, bd = 150 * 150;
    for (const q of players.values()) if (q !== p && !q.dead && !q.air && !q.out) { const d = dist2(q, p); if (d < bd) { bd = d; mate = q; } }
    if (!mate) return toast(p, "Nobody's close enough to hand it to. Stand next to a mate.", "#f88");
    if (m.a === "gold") {
      const n = Math.min(p.gold, Math.max(0, m.n | 0)); if (!n) return toast(p, "You've no gold to give.", "#f88");
      p.gold -= n; mate.gold += n;
      toast(p, `Gave ${n}g to ${fullName(mate)}.`, "#ffd34d"); toast(mate, `${fullName(p)} gave you ${n}g.`, "#ffd34d");
      return;
    }
    const i = m.i | 0, it = p.bag[i]; if (!it) return;
    if (!bagAdd(mate.bag, it.id, it.n || 1, it.r || 0)) return toast(p, `${fullName(mate)}'s bag is full.`, "#f88");
    p.bag.splice(i, 1); p.invDirty = mate.invDirty = true;
    toast(p, `Gave ${itemName(it)} to ${fullName(mate)}.`, "#8f8"); toast(mate, `${fullName(p)} gave you ${itemName(it)}. It's in your bag [I].`, "#8f8");
    return;
  }
  if (m.a === "inject") { // H while infected: the client runs a quick timing check; a miss just fumbles, the antidote isn't wasted
    const i = p.bag.findIndex((b) => b.id === "antidote");
    if (i < 0 || !p.inf) return;
    if (m.ok) return useItem(p, i);
    return toast(p, "Missed the vein. Try again.", "#ff9a60");
  }
  if (m.a === "quick" && p.hp < maxHp(p) * 0.7) { // H when hurt: the best healing you're carrying
    for (const id of ["medkit", "bandage"]) { const i = p.bag.findIndex((b) => b.id === id); if (i >= 0) return useItem(p, i); }
  }
  if (m.a === "quick") { // H: eat or drink whatever you need most
    const want = p.water <= p.food ? "drink" : "food";
    const order = want === "drink" ? ["water", "lakewater", "cola", "strawberry", "tomato", "lettuce", "melon", "grog", "pee"] : ["lettuce", "tomato", "turnip", "bread", "corn", "potato", "beans", "pie", "ration", "stew"];
    for (const id of order) { const i = p.bag.findIndex((b) => b.id === id); if (i >= 0) return useItem(p, i); }
    const any = p.bag.findIndex((b) => ITEMS[b.id] && (ITEMS[b.id].kind === "food" || ITEMS[b.id].kind === "drink"));
    if (any >= 0) return useItem(p, any);
    return toast(p, "You've got nothing to eat or drink. Vex's store sells both.", "#f88");
  }
}
// ---------------------------------------------------------------- inside the shops: slot machines, the casino tables, the shooting range, Club Slop
const FITTINGS = new Set(["slot", "ctable"]);
export function nearFitting(p) {
  let best = null, bd = 46;
  for (const w of near(p)) {
    if (!(FITTINGS.has(w.kind) || (w.kind === "till" && w.sid === "club"))) continue;
    const d = boxDist(w, p.x, p.y, (p.z || 0) + 20);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}
// the one-armed bandits: 10g a pull. Three of a kind pays, a pair pays a little, and three zombies lets one out.
const REELS = ["🍒", "🍋", "🔔", "💎", "7", "🧟"], SLOT_PAY = { "7": 250, "💎": 100, "🔔": 50, "🍒": 30, "🍋": 20 }, SLOT_COST = 10, SLOT_PAIR = 12;
function pullSlot(p, m) {
  const t = now(); if (t < (p.slotAt || 0)) return; p.slotAt = t + 1.4;
  if (p.gold < SLOT_COST) return toast(p, `The slots take ${SLOT_COST}g a pull.`, "#f88");
  p.gold -= SLOT_COST; p.invDirty = true;
  const r = [0, 0, 0].map(() => (Math.random() * REELS.length) | 0), sy = r.map((i) => REELS[i]);
  let win = 0, msg;
  if (sy[0] === sy[1] && sy[1] === sy[2]) {
    if (sy[0] === "🧟") { msg = "Three zombies. Something climbs out of the machine."; { const z = spawnZombie("walker", { x: m.x + m.w + 50, y: m.y + m.h / 2 }); if (z) { z.x = m.x + m.w + 50; z.y = m.y + m.h / 2; } } }
    else { win = SLOT_PAY[sy[0]]; msg = sy[0] === "7" ? "JACKPOT!" : "Three of a kind!"; if (win >= 100) feed(`${fullName(p)} hit ${sy.join(" ")} on the slots for ${win}g`, "#ffd34d"); }
  } else if (sy[0] === sy[1] || sy[1] === sy[2] || sy[0] === sy[2]) { const pr = sy[0] === sy[1] || sy[0] === sy[2] ? sy[0] : sy[1]; if (pr !== "🧟") { win = SLOT_PAIR; msg = "A pair."; } else msg = "Two zombies. The machine growls."; }
  else msg = "Nothing.";
  if (win) addGold(p, win);
  p.pe.push({ k: "slots", r, win, msg });
}
export function useFitting(p, f) {
  if (f.kind === "slot") return pullSlot(p, f);
  if (f.kind === "ctable") { if (!p.spins && !p.casino) toast(p, "The tables run on wheel spins. Buy a case from Lou at the cashier and you get spins with it.", "#ffd34d"); sendCasino(p); p.pe[p.pe.length - 1].open = 1; return; }
  if (f.kind === "till" && f.sid === "club") { // Lola's bar
    if (game.phase !== "night") return toast(p, "Club Slop opens at dusk.", "#bbb");
    if (p.gold < 15) return toast(p, "Drinks are 15g.", "#f88");
    p.gold -= 15; p.drunk = Math.min(90, (p.drunk || 0) + 25); p.stress = Math.max(0, (p.stress || 0) - 20); p.hp = Math.min(maxHp(p), p.hp + 10); p.invDirty = true;
    return toast(p, pick(["A Slop Sunrise. Your worries feel further away. So does your aim.", "Lola slides you a Hearth Fireball. Warming.", "A pint of something green. You feel brave.", "\"On the house... no, it's 15g.\" Still, it helps."]), "#ff9ad0");
  }
}
// Club Slop at night: dancing melts stress and puts you in the groove; Big Tony keeps wanted players out
let CLUB = null, CLUB_FLOOR = null, CLUB_VER = -1;
export function clubTick(p, t, dt) {
  if (game.mode === "royale" || p.dead || game.phase !== "night") { p.danceT = 0; return; }
  if (CLUB_VER !== world.mapVer) { CLUB = shopBld("club"); CLUB_FLOOR = world.WALLS.find((w) => w.kind === "dance"); CLUB_VER = world.mapVer; }
  if (!CLUB || !inside(CLUB, p)) { p.danceT = 0; return; }
  if (p.heat >= 80) { // wanted: back out the door you go
    const d = CLUB.door === "n" ? -1 : 1, y = d < 0 ? CLUB.y - 50 : CLUB.y + CLUB.h + 50;
    p.x = CLUB.x + CLUB.w / 2; p.y = y; p.vx = 0; p.vy = 0;
    if (t > (p.tonyAt || 0)) { p.tonyAt = t + 4; toast(p, "Big Tony: \"Not tonight. You're wanted.\" Lose the heat first.", "#f88"); }
    return;
  }
  if (!CLUB_FLOOR || !rectHitsCircle(CLUB_FLOOR, p, 1) || (p.z || 0) > 30) { p.danceT = 0; return; }
  p.danceT = (p.danceT || 0) + dt;
  p.stress = Math.max(0, (p.stress || 0) - 7 * dt);
  if (p.danceT > 6 && t > (p.groove || 0) - 60) { // topped up while you keep dancing
    if (t > (p.groove || 0)) toast(p, "You're in the groove: 8% faster for a while.", "#c070ff");
    p.groove = t + 90;
  }
}
// ---------------------------------------------------------------- the stock exchange
const IMPACT = 0.00015, SPREAD = 0.01; // 1000 shares move the price 15%
export function trade(p, sym, n) {
  if (!own(STOCKS, sym) || !n || game.mode === "royale" || p.dead) return;
  n = Math.trunc(clamp(n, -1000, 1000));
  // your own order moves the price as it fills: you pay the average of the climb (or take the average of the fall), and the price
  // lands at the end of it straight away, so a big buy can't be sold back into its own rise. Plus a 1% spread each way, even under Vex.
  const px = game.market.px[sym], fee = game.mods.fee + SPREAD, imp = IMPACT * Math.abs(n);
  if (n > 0) {
    const cost = Math.ceil(px * (1 + imp / 2) * n * (1 + fee));
    if (p.gold < cost) return toast(p, `${n} ${sym} would cost ${cost}g.`, "#f88");
    p.gold -= cost; p.shares[sym] = (p.shares[sym] || 0) + n; p.basis[sym] = (p.basis[sym] || 0) + cost; p.st.sharesBought += n;
    game.market.px[sym] = px * (1 + imp);
    toast(p, `Bought ${n} ${sym} for ${cost}g`, "#8f8");
  } else {
    const have = p.shares[sym] || 0; n = Math.min(-n, have); if (!n) return;
    const imp2 = Math.min(0.9, IMPACT * n), got = Math.floor(px * (1 - imp2 / 2) * n * (1 - fee));
    p.basis[sym] = (p.basis[sym] || 0) * (1 - n / have);
    p.shares[sym] = have - n; if (!p.shares[sym]) { delete p.shares[sym]; delete p.basis[sym]; }
    p.gold += got; game.market.px[sym] = Math.max(0.5, px * (1 - imp2));
    toast(p, `Sold ${n} ${sym} for ${got}g`, got >= 0 ? "#ffd34d" : "#f88");
  }
  p.invDirty = true;
}
export function dividends() {
  for (const p of players.values()) {
    let pay = 0; for (const [s, n] of Object.entries(p.shares)) pay += n * game.market.px[s] * 0.015;
    if (pay >= 1) addGold(p, Math.floor(pay), "Dividends");
  }
}
// ---------------------------------------------------------------- elections
export function openElection() {
  if (game.mode === "royale" || game.mode === "adventure" || !players.size || game.elec) return; // Adventure has no mayor: the towns run themselves
  game.elec = { cands: ballot(game.mayor), votes: new Map(), ends: game.ends };
  world.events.push({ k: "feed", text: "It's election day too: the mayor's race is on today's ballot [N].", color: "#9fc0ff" });
}
export function resolveElection() {
  const E = game.elec; game.elec = null;
  const counts = E.cands.map(() => 0);
  for (const [pid, i] of E.votes) if (players.has(pid)) counts[i]++;
  const top = Math.max(...counts), win = pick(E.cands.filter((c, i) => counts[i] === top));
  for (const p of players.values()) if (E.votes.has(p.id)) addXp(p, 10);
  electMayor(win, counts.every((c) => c === 0));
}
export function applyMayor(id, sign) {
  for (const [k, v] of Object.entries(CANDIDATES[id].mods || {})) {
    if (k === "fee") game.mods.fee = sign > 0 ? v : FEE;
    else if (k === "discount" || k === "hearthRegen") game.mods[k] = Math.max(0, game.mods[k] + sign * v); // a story choice may have zeroed it since; never drain the Hearth
    else game.mods[k] = sign > 0 ? game.mods[k] * v : game.mods[k] / v;
  }
}
function electMayor(id, apathy) {
  if (game.mayor) applyMayor(game.mayor, -1);
  game.mayor = id; applyMayor(id, 1);
  const C = CANDIDATES[id];
  let first = true;
  for (const [s, v] of Object.entries(C.stock)) { shock(game.market, s, v, first ? `${C.name} wins the election` : ""); first = false; }
  if (C.posadist) game.posadAt = Math.max(game.night + 2, FIRST_NUKE + 1);
  world.events.push({ k: "banner", text: `MAYOR ${C.name.toUpperCase()}`, sub: `${apathy ? "Nobody voted, so it was drawn from a hat. " : ""}${C.desc}` });
  feed(`${C.name} is the new mayor: "${C.slogan}"`, C.posadist ? "#ff6060" : "#ffd34d");
}
// ---------------------------------------------------------------- the celebrity's special requests
export const guestApi = {
  gear: (p, id, r) => { if (!bagAdd(p.bag, id, 1, r)) { world.crates.push({ id: world.nextId++, x: p.x, y: p.y + 40, it: { id, r } }); toast(p, "Your bag's full, so it's on the ground.", "#bbb"); } p.invDirty = true; },
  card: (p, id) => { p.cards[id] = (p.cards[id] || 0) + 1; p.invDirty = true; p.pe.push({ k: "pack", cards: [id] }); },
  pack: (p) => openPack(p),
  bottlePee: (p) => { if (p.bl < 30) return "You don't need to go. Bear looks disappointed."; if (!bagAdd(p.bag, "pee")) return "Your bag is full."; p.bl = 0; p.invDirty = true; return "You fill a bottle. Bear Gritts gives you a solemn thumbs up."; },
  wrestle: (p) => {
    if (Math.random() < 0.35 + 0.05 * sk(p, "tough")) { addGold(p, 60, "Beat The Boulder at arm wrestling"); feed(`${fullName(p)} beat The Boulder at arm wrestling!`, "#ffd34d"); return "His arm hits the table. The crowd goes silent. +60g"; }
    const n = world.NPC_POS.find((q) => q.id === "boulder"); if (n) { const a = Math.atan2(p.y - n.y, p.x - n.x); p.vx = Math.cos(a) * 900; p.vy = Math.sin(a) * 900; p.vz = 300; p.gr = false; p.pe.push({ k: "kick", vx: p.vx, vy: p.vy, vz: 300 }); }
    p.dlg = null; return "He wins, then throws you across the valley. \"Know your role.\"";
  },
  calm: (p) => { p.stress = 0; return "A soothing voice describes you as 'a magnificent, if anxious, specimen'. All your stress melts away."; },
  tip: (p) => {
    if (!game.tip) { const sym = pick(SYMS.filter((s) => s !== "BNKR")); game.tip = { sym }; }
    return `He leans in. "${STOCKS[game.tip.sym].name}. ${game.tip.sym}. Buy before the sun comes up. You didn't hear it from me."`;
  },
  fiver: (p) => { addGold(p, 5, "Warren's spare change"); return "He hands you exactly five gold, then writes it down."; },
};
export function pickDlg(p, i) {
  if (!p.dlg) return;
  if (p.dlg.adv) return advPick(p, i);
  const o = p.dlgOpts && p.dlgOpts[i];
  if (!o) { p.dlg = null; sendDlg(p); return; }
  const c = dlgCtx(p), npc = p.dlg.npc;
  const doneBefore = Object.values(p.q).filter((x) => x.done).length;
  const msg = o.do ? o.do(c) : undefined;
  deed("word", 10 * (Object.values(p.q).filter((x) => x.done).length - doneBefore));
  if (msg) toast(p, msg, "#e0c0ff");
  p.dlg = o.to && p.dlg ? { npc, node: o.to } : null; // an option can end the talk itself (losing the arm-wrestle)
  sendDlg(p);
}
export function questReady(p) {
  const out = [];
  for (const [id, st] of Object.entries(p.q)) if (!st.done && npcApi.progress(p, id) >= QUESTS[id].goal) out.push(QUESTS[id].npc);
  return out;
}
