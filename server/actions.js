// What players do: use, shout, dodge, reload, buy, enhance; stamina and slide tackles; the dead finding their way inside.
import { ITEMS, GEAR, bagAdd, bagCount, bagTake, CROPS } from "../items.js";
import { shock } from "../market.js";
import { inDust } from "../dust2.js";
import { regionOf, segHitsRect } from "../town.js";
import { WEAPONS, RARITY, ENH_NAMES, ENH_COST, ENH_CHANCE, ATTACH, SKINS, SKILLS, ELEMENTS, HOES, HOE_COST, ZTYPES } from "../data.js";
import { advInteract, advNearTrader } from "./adventure.js";
import { rectHitsCircle } from "./building.js";
import { fires, hurtPlayer, hurtZombie, ignite, kick } from "./combat.js";
import { H, HEARTH, MV, W, dist2, now, own, pick, rand } from "./config.js";
import { startFix } from "./disasters.js";
import { dustUse } from "./dust.js";
import { nearFitting, openShop, openStall, sendCasino, useFitting } from "./economy.js";
import { OPEN, mapMsg } from "./geometry.js";
import { nearTerm, startHack, startTermHack } from "./hacking.js";
import { BOOSTS, LAKE, PLOTS, SHOPS, TOWN_NAV, boxDist, bunkerWall, cropPrice, hoeLimit, inHouse, nearShop, nearStall, shopIsOpen, shopWall, takeSeed } from "./map.js";
import { buyMech } from "./mechs.js";
import { enterBunker, fundDome, leaveBunker } from "./nukes.js";
import { openDlg } from "./social.js";
import { CALL_IN, GUNS, SHOP, VEHICLES, addXp, collide, deed, feed, freeGround, fullName, game, lootType, magOf, newWeapon, players, price, sk, speedOf, toast, traitOf, unlucky, wName, zHeight } from "./state.js";
import { broadcastRaw } from "./tick.js";
import { enterVehicle, exitVehicle, touchGlyph } from "./vehicles.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- actions
export function interact(p) {
  if (p.air === "bunker") return leaveBunker(p);
  if (p.air || game.phase === "lobby") return;
  if (p.veh) return exitVehicle(p);
  if (p.z < -60 && touchGlyph(p)) return;
  { const c = nearTerm(p); if (c) return startTermHack(p, c); } // office terminals are upstairs
  if (p.z > 40) return toast(p, "You'll have to come down first.", "#bbb");
  { const c = world.caches.find((q) => dist2(q, p) < 62 * 62); if (c) return startHack(p, c); }
  if (game.mode === "adventure" && advInteract(p)) return; // notice boards, signposts, the folk, signs of the beast
  if (game.disaster && game.disaster.st && dist2(game.disaster.st, p) < 85 * 85) return startFix(p);
  { const b = bunkerWall(); if (b && rectHitsCircle(b, p, 46) && game.mode !== "royale") return enterBunker(p); }
  let best = null, bd = 60 * 60;
  for (const c of world.crates) { const d = dist2(c, p); if (d < bd && (!c.vault || d < 26 * 26)) { bd = d; best = c; } } // vault loot: you have to be in the vault
  if (best && best.it) { // a crate of gear or supplies
    if (!bagAdd(p.bag, best.it.id, best.it.n || 1, best.it.r || 0)) return toast(p, "Your bag is full. Use or drop something [I].", "#f88");
    world.crates = world.crates.filter((c) => c !== best); p.invDirty = true;
    const g = GEAR[best.it.id];
    toast(p, g ? `Found ${["", "Rare ", "Epic ", "Legendary ", "Mythic "][best.it.r || 0]}${g.name}. Equip it from your bag [I].` : `Found ${best.it.n > 1 ? best.it.n + "x " : ""}${ITEMS[best.it.id].name}${ITEMS[best.it.id].kind === "mech" ? ". A mech part! Use it from your bag [I] to bolt it on." : ""}`, ["#ddd", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"][best.it.r || 0]);
    return;
  }
  if (best) {
    world.crates = world.crates.filter((c) => c !== best);
    const w = best.w;
    let up = 0;
    for (let i = 0; i < sk(p, "scavenger"); i++) if (w.rarity < 3 && !best.grave && Math.random() < 0.2) { w.rarity++; up++; }
    giveWeapon(p, w);
    toast(p, `Looted ${RARITY[w.rarity]} ${wName(w)}${w.enh ? " +" + w.enh : ""}${up ? " (scavenged an upgrade!)" : ""}`, ["#ddd", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"][w.rarity]);
    if (w.rarity >= 3) feed(`${fullName(p)} found ${w.rarity === 4 ? "the MYTHIC" : "a LEGENDARY"} ${wName(w)}`, w.rarity === 4 ? "#ff4b4b" : "#ffc030");
    if (!best.grave && Math.random() < 0.5) { if (Math.random() < 0.5) p.gren = Math.min(9, p.gren + 1); else p.molo = Math.min(9, p.molo + 1); toast(p, "There was something to throw in there too.", "#ffb070"); }
    return;
  }
  if (p.veh) return exitVehicle(p);
  for (const v of world.vehicles) if (dist2(v, p) < (VEHICLES[v.kind].r + 34) ** 2 && Math.abs((v.z || 0) - p.z) < 70 && enterVehicle(p, v)) return;
  if (game.mode !== "royale") { const n = world.NPC_POS.filter((q) => dist2(q, p) < 70 * 70).sort((a, b) => dist2(a, p) - dist2(b, p))[0]; if (n) return openDlg(p, n.id); }
  if (rectHitsCircle(HEARTH, p, 70) && bagCount(p.bag, "turnip") + bagCount(p.bag, "potato") >= 2) { // cook two vegetables into a stew
    for (let i = 0; i < 2; i++) bagTake(p.bag, bagCount(p.bag, "turnip") >= bagCount(p.bag, "potato") ? "turnip" : "potato");
    bagAdd(p.bag, "stew"); p.invDirty = true; deed("soil", 2);
    world.events.push({ k: "burn", x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
    return toast(p, "You cook your vegetables in the Hearth. Hearth stew! It's in your bag.", "#ffb070");
  }
  if (game.mode !== "royale" && nearStall(p)) return openStall(p);
  if (game.mode !== "royale") { const f = nearFitting(p); if (f) return useFitting(p, f); } // slot machines, the casino tables, the club bar
  if (game.mode !== "royale" && inDust(p) && dustUse(p)) return; // Dust II: the CT radio starts a round; a planted bomb gets defused
  { const sid = ["general", "armoury", "casino", "hearth"].filter((q) => nearShop(p, q)).sort((a, b) => boxDist(shopWall(a), p.x, p.y, 0) - boxDist(shopWall(b), p.x, p.y, 0))[0]; if (sid) return openShop(p, sid); } // the nearest counter
  if (LAKE && rectHitsCircle(LAKE, p, 40) && p.z < 20) { // fill a bottle at the water's edge
    if (!bagAdd(p.bag, "lakewater")) return toast(p, "Your bag is full.", "#f88");
    p.invDirty = true;
    return toast(p, game.waste ? "You fill a bottle with lake water. It's faintly glowing." : "You fill a bottle with lake water. There's something swimming in it.", "#9fd0ff");
  }
  let plot = null; bd = 48 * 48;
  for (const pl of PLOTS) { const d = dist2(pl, p); if (d < bd) { bd = d; plot = pl; } }
  if (!plot) return p.hoeOut ? till(p) : undefined; // only with the hoe in your hands; E is for talking otherwise
  if (plot.stage === 0) {
    const crop = takeSeed(p);
    if (!crop) return toast(p, "No seeds. Old Giles sells them at the produce stall.", "#f88");
    plot.stage = 1; plot.prog = 0; plot.fert = false; plot.crop = crop; plot.rate = (p.cls === "farmer" ? 1.85 : 1) * (1 + 0.25 * sk(p, "green")) * (1 + 0.15 * (p.hoe || 0)) * game.mods.grow; plot.owner = p.id;
    addXp(p, 2);
  } else if (plot.stage === 3) {
    const C = CROPS[plot.crop || "turnip"], n = (C.yield || 1) + (plot.fert ? 1 : 0);
    plot.fert = false;
    plot.stage = C.regrow ? 2 : 0; plot.prog = 0; p.st.crops++; deed("soil", 5);
    let lost = 0; for (let i = 0; i < n; i++) if (!bagAdd(p.bag, plot.crop || "turnip")) lost++;
    p.invDirty = true;
    toast(p, lost ? `Your bag is full, so ${lost === n ? "the" : "a"} ${C.name.toLowerCase()} goes in the bin.` : `Picked ${n > 1 ? n + " " : "a "}${C.name.toLowerCase()}${n > 1 ? "s" : ""}. Sell ${n > 1 ? "them" : "it"} to Old Giles at the stall for about ${cropPrice(p, plot.crop || "turnip") * n}g, or eat ${n > 1 ? "them" : "it"}.`, lost ? "#bbb" : "#8f8");
    shock(game.market, "FARM", 0.004 * Math.sqrt(C.sell / 25));
    addXp(p, Math.round(6 + 6 * C.t));
    if (Math.random() < 0.2) { const id = plot.crop || "turnip"; bagAdd(p.bag, "s_" + id); toast(p, `Found a ${C.name.toLowerCase()} seed in the soil`, "#8f8"); }
  } else toast(p, "Still growing...", "#bbb");
}
export function till(p) {
  if (game.mode === "royale") return toast(p, "No time for farming. Somebody's shooting at you.", "#bbb");
  if (!p.gr || p.z > 4) return toast(p, "You can only till the ground.", "#bbb");
  const mineN = PLOTS.filter((pl) => pl.tilled === p.id).length, limit = hoeLimit(p.hoe);
  if (mineN >= limit) return toast(p, `Your ${HOES[p.hoe]} can't manage more than ${limit} plots. Upgrade it at Vex's store.`, "#f88");
  const want = p.hoe >= 3 && mineN + 2 <= limit ? 2 : 1;
  const fx = Math.cos(p.a), fy = Math.sin(p.a), made = [];
  for (let i = 0; i < want; i++) {
    const side = want === 2 ? (i ? 32 : -32) : 0;
    const x = Math.round(p.x + fx * 44 - fy * side), y = Math.round(p.y + fy * 44 + fx * side), c = { x, y };
    const why = !OPEN() && (x < 60 || y < 60 || x > W - 60 || y > H - 60) ? "Too close to the edge of the valley."
      : world.WALLS.some((w) => rectHitsCircle(w, c, 34)) ? "Something's in the way."
      : PLOTS.some((pl) => dist2(pl, c) < 58 * 58) || made.some((pl) => dist2(pl, c) < 58 * 58) ? "Too close to another plot."
      : world.builds.some((b) => rectHitsCircle(b, c, 30)) ? "Not on top of your barricades."
      : null;
    if (why) { if (!made.length && i === want - 1) return toast(p, why, "#bbb"); continue; }
    made.push({ x, y, stage: 0, prog: 0, rate: 1, owner: 0, tilled: p.id });
  }
  if (!made.length || PLOTS.length + made.length > 200) return;
  PLOTS.push(...made);
  for (const pl of made) world.events.push({ k: "built", x: pl.x, y: pl.y });
  deed("soil", 2 * made.length); addXp(p, 3);
  toast(p, `Tilled ${made.length === 2 ? "two new plots" : "a new plot"} (${mineN + made.length}/${limit}). Plant it with E.`, "#8f8");
  broadcastRaw(JSON.stringify(mapMsg()));
}
export function giveWeapon(p, w) {
  const slot = w.type === "pistol" ? 0 : 1, old = p.weapons[slot];
  // the gun you were holding goes on the ground, not in the bin (a plain starter pistol isn't worth the clutter)
  if (old && old !== w && !(old.type === "pistol" && !old.rarity && !old.enh)) {
    world.crates.push({ id: world.nextId++, x: p.x + rand(-25, 25), y: p.y + 28, w: { ...old, reloadUntil: 0, tried: false, jam: false, chargeAt: 0 } });
    toast(p, `Dropped your ${wName(old)} on the ground. E to pick it back up.`, "#bbb");
  }
  p.weapons[slot] = w; p.active = slot;
}
export function buy(p, item) {
  if (game.mode === "royale") return toast(p, "No shops in the Royale. Loot it or lose it.", "#f88");
  if (p.dead) return;
  const it = own(SHOP, item); if (!it) return;
  const buyZone = (it.shop === "armoury" && inDust(p) && game.mode !== "royale") || (game.mode === "adventure" && advNearTrader(p, it.shop)); // Dust II's buy menu, and Adventure's merchants and smiths
  if (!nearShop(p, it.shop) && !buyZone) return toast(p, `You'll have to go to ${SHOPS[it.shop].name} for that.`, "#f88");
  if (!shopIsOpen(it.shop) && !buyZone) return toast(p, SHOPS[it.shop].shut || "Shut.", "#f88");
  if (item.startsWith("dome")) return fundDome(p, it.cost);
  if (item === "enhance") return enhance(p);
  if (item.startsWith("att_") || item.startsWith("skin_")) return fitMod(p, item);
  if (item === "hoe" && p.hoe >= 3) return toast(p, "Your Golden Hoe is as good as hoes get.", "#bbb");
  const cost = price(p, item === "hoe" ? HOE_COST[p.hoe] : it.cost);
  if (p.gold < cost) return toast(p, `${it.name} costs ${cost}g. You have ${p.gold}g.`, "#f88");
  if (item === "mechkit" || item === "mechpart") return buyMech(p, item, cost);
  if (item === "repair" && game.hearth >= game.hearthMax) return toast(p, "Hearth is already at full health", "#bbb");
  if (CALL_IN[item] && p.called && now() < p.called) return toast(p, "Haddock's still on the radio about your last one. Give it a moment.", "#f88");
  if ((ITEMS[item] || GEAR[item]) && !bagAdd(p.bag, item)) return toast(p, "Your bag is full. Use or drop something first [I].", "#f88");
  p.gold -= cost;
  deed("coin", cost / 25 + (item === "case" ? 4 : 0));
  shock(game.market, "VEX", 0.004);
  if (ITEMS[item] || GEAR[item]) {
    p.invDirty = true;
    return toast(p, `Bought ${it.name}. It's in your bag [I].`, "#8f8");
  }
  if (CALL_IN[item]) return callIn(p, CALL_IN[item][0]);
  if (item === "kevlar") p.armor = 60;
  else if (item === "hoe") { p.hoe++; toast(p, `${p.hoe === 1 ? "Bought" : "Upgraded to"} a ${HOES[p.hoe]}. Press F to take it out, then click open ground to till a plot (${hoeLimit(p.hoe)} max${p.hoe === 3 ? ", two at a time" : ""}).`, "#8f8"); }
  else if (item === "grenade") p.gren = Math.min(9, p.gren + 2);
  else if (item === "molotov") p.molo = Math.min(9, p.molo + 2);
  else if (item === "antidote" || item === "medkit") { if (!bagAdd(p.bag, item)) { p.gold += cost; return toast(p, "Your bag is full.", "#f88"); } p.invDirty = true; }
  else if (item === "repair") { p.st.repairs++; deed("soil", 10); game.hearth = Math.min(game.hearthMax, game.hearth + 200); feed(`${fullName(p)} repaired the Hearth`, "#8f8"); }
  else if (item === "gcase") {
    const n = Math.random() < 0.15 + (traitOf(p).luck ? 0.1 : 0) ? 3 : Math.random() < 0.45 ? 2 : 1;
    p.spins += n; p.st.cases++;
    p.pe.push({ k: "case", type: "ak", rarity: n + 1, name: `${n} WHEEL SPIN${n > 1 ? "S" : ""}`, spins: 1 });
    setTimeout(() => sendCasino(p), 3300);
  }
  else if (item === "case") {
    const r = Math.random() * 100 - (traitOf(p).luck ? 8 : 0);
    const rarity = r < 0.3 ? 4 : r < 2 ? 3 : r < 10 ? 2 : r < 40 ? 1 : 0;
    const w = newWeapon(lootType(), rarity);
    if (GUNS.has(w.type) && Math.random() < 0.3) w.skin = Math.random() < 0.08 ? "gold" : pick(["camo", "slop", "tiger", "pink"]); // cases sometimes come painted
    giveWeapon(p, w);
    p.pe.push({ k: "case", type: w.type, rarity, name: wName(w) }); p.st.cases++;
    if (rarity >= 2) setTimeout(() => feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${wName(w)}`, ["", "", "#c070ff", "#ffc030", "#ff4b4b"][rarity]), 3200);
  } else if (WEAPONS[item]) giveWeapon(p, newWeapon(item));
  if (item !== "case" && item !== "gcase" && item !== "hoe") toast(p, `Bought ${it.name}`, "#8f8");
}
// a bought vehicle drops in near the buyer. Old called-in ones nobody is using get scrapped so the town doesn't fill up
const CALLED_MAX = 6, CALL_DELAY = 5;
function callIn(p, kind) {
  p.called = now() + CALL_DELAY + 1;
  toast(p, `Haddock radios it in. Your ${VEHICLES[kind].name} lands in ${CALL_DELAY} seconds. Stand back.`, "#8f8");
  feed(`${fullName(p)} called in a ${VEHICLES[kind].name}`, "#9fd0ff");
  setTimeout(() => {
    if (!players.has(p.id) || game.phase === "lobby" || game.phase === "over") return;
    const called = world.vehicles.filter((v) => v.called);
    if (called.length >= CALLED_MAX) { const old = called.find((v) => ![...players.values()].some((q) => q.veh === v.id)); if (old) world.vehicles = world.vehicles.filter((v) => v !== old); }
    let sp = null;
    for (let i = 0; i < 60 && !sp; i++) { const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 80, c = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }; const q = { ...c }; collide(q, 40); if (q.x === c.x && q.y === c.y && freeGround(c) && !inHouse(c)) sp = c; }
    sp = sp || { x: p.x + 60, y: p.y };
    world.vehicles.push({ id: world.nextId++, kind, x: sp.x, y: sp.y, a: rand(0, Math.PI * 2), v: 0, hp: VEHICLES[kind].hp, seats: [0, 0], called: p.id });
    world.events.push({ k: "boom", x: sp.x, y: sp.y, r: 60, dust: true }); world.events.push({ k: "land", x: sp.x, y: sp.y });
    toast(p, `Your ${VEHICLES[kind].name} has landed. Press E to get in.`, "#8f8");
  }, CALL_DELAY * 1000);
}
// Haddock bolts an attachment on (or paints) the gun in your hands
function fitMod(p, item) {
  const w = p.weapons[p.active], it = SHOP[item], cost = price(p, it.cost);
  if (!w || !GUNS.has(w.type)) return toast(p, `"I can't bolt that onto a ${WEAPONS[w ? w.type : "sword"].name}, son." Hold a gun first.`, "#f88");
  const att = ATTACH[item.slice(4)], skin = SKINS[item.slice(5)];
  if (att && w.att && w.att[att.slot] === item.slice(4)) return toast(p, `Your ${wName(w)} already has ${/^[AEIOU]/.test(att.name) ? "an" : "a"} ${att.name}.`, "#bbb");
  if (skin && w.skin === item.slice(5)) return toast(p, `It's already ${skin.name}.`, "#bbb");
  if (p.gold < cost) return toast(p, `${it.name} costs ${cost}g. You have ${p.gold}g.`, "#f88");
  p.gold -= cost; deed("coin", cost / 25);
  if (att) { w.att = { ...(w.att || {}), [att.slot]: item.slice(4) }; if (att.slot === "mag") w.ammo = Math.min(w.ammo, magOf(w)); toast(p, `Haddock fits ${/^[AEIOU]/.test(att.name) ? "an" : "a"} ${att.name} to your ${wName(w)}. ${att.desc}`, "#8f8"); }
  else { w.skin = item.slice(5); toast(p, `Your ${wName(w)} comes back ${skin.name}. Looks faster.`, "#8f8"); }
  p.pe.push({ k: "fitted" });
}
function enhance(p) {
  const w = p.weapons[p.active];
  if (w.enh >= 5) return toast(p, "Already PEN. Touch grass.", "#ffc030");
  const cost = price(p, ENH_COST[w.enh]);
  if (p.gold < cost) return toast(p, `Enhancing to +${w.enh + 1} costs ${cost}g`, "#f88");
  p.gold -= cost; deed("coin", 3 + cost / 25);
  if (Math.random() < ENH_CHANCE[w.enh] + (traitOf(p).luck ? 0.1 : 0)) {
    w.enh++;
    p.pe.push({ k: "enh", ok: true, lvl: w.enh });
    if (w.enh >= 4) feed(`${fullName(p)} hit ${ENH_NAMES[w.enh]} ${wName(w)}!!`, "#ffc030");
    unlucky(p);
  } else {
    const down = w.enh >= 2;
    if (down) w.enh--;
    const slots = w.att ? Object.keys(w.att) : [];
    if (slots.length && Math.random() < 0.35) { const sl = pick(slots), lost = ATTACH[w.att[sl]].name; delete w.att[sl]; w.ammo = Math.min(w.ammo, magOf(w)); setTimeout(() => toast(p, `The failed enhance knocked your ${lost} off. It's gone.`, "#f88"), 1800); }
    p.pe.push({ k: "enh", ok: false, lvl: w.enh, down });
  }
}
export function learn(p, s) {
  const def = own(SKILLS, s);
  if (!def || p.pts <= 0 || sk(p, s) >= def.max) return;
  p.pts--; p.sk[s] = sk(p, s) + 1;
  if (s === "tough") p.hp += 20;
  unlucky(p);
}
// The Thu'um: four elements, unlocked as you level. Every kind of monster is weak to one and shrugs off another.
const ELEM_ORDER = Object.keys(ELEMENTS);
const MATCHUP = { // [weak to, resists]
  walker: ["fire", "frost"], runner: ["frost", "fire"], tank: ["storm", "force"], charger: ["frost", "force"], flyer: ["storm", "frost"],
  boomer: ["fire", "storm"], screamer: ["force", "storm"], elite: ["fire", "frost"], raptor: ["frost", "fire"], rex: ["storm", "fire"],
  bug: ["fire", "frost"], spitter: ["frost", "storm"], tanker: ["storm", "fire"], brain: ["force", "frost"],
};
const BOSS_MATCH = { leshen: ["fire", "frost"], drowned: ["storm", "fire"], golem: ["frost", "force"] };
function matchOf(z) { if (z.weak) return [z.weak, ""]; return z.type === "boss" ? BOSS_MATCH[game.bossKind] || [] : MATCHUP[z.type] || []; }
export function elemsFor(p) { return ELEM_ORDER.filter((e) => p.lvl >= ELEMENTS[e].lvl || p.gen > 1 && ELEMENTS[e].lvl <= 2); }
export function cycleElement(p) {
  const list = elemsFor(p);
  if (list.length < 2) return toast(p, "You only know one Word of Power so far. More come with levels (Fire at 2, Frost at 3, Storm at 4).", "#bfe0ff");
  p.elem = list[(list.indexOf(p.elem) + 1) % list.length];
  toast(p, `Thu'um: ${ELEMENTS[p.elem].name.toUpperCase()} (${ELEMENTS[p.elem].word})`, ELEMENTS[p.elem].color);
}
export function doShout(p) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.shoutCd) return;
  if (!elemsFor(p).includes(p.elem)) p.elem = "force";
  const el = p.elem;
  p.shoutCd = t + (el === "force" ? 15 : 18) * (1 - (traitOf(p).shout || 0)) * (1 - 0.15 * sk(p, "thuum")) * game.mods.shoutCd * p.shoutMult;
  const range = 280 * (1 + 0.15 * sk(p, "thuum")), pow = 1 + 0.2 * sk(p, "thuum");
  world.events.push({ k: "shout", x: p.x, y: p.y, z: p.z, a: p.a, id: p.id, r: range, el });
  const inCone = (e) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > range || d < 1) return 0;
    let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(da) > 0.7 ? 0 : d;
  };
  // how well the element lands on this monster, like a certain pocket monster game
  const eff = (z) => { const [weak, res] = matchOf(z); const m = weak === el ? 2 : res === el ? 0.5 : 1; if (m !== 1) p.pe.push({ k: "eff", x: Math.round(z.x), y: Math.round(z.y), z: Math.round((z.z || 0) + zHeight(z) + 20), m }); return m; };
  const mass = { boss: game.bossKind === "golem" ? 99 : 5, elite: 3, tank: 2, rex: 6, raptor: 1.2, brain: 99 };
  const massOf = (z) => mass[z.type] || (ZTYPES[z.type].big ? 4 : 1);
  if (el === "storm") {
    // chain lightning: the nearest thing in front of you, then whatever's closest to that, and on
    const hit = new Set(), pts = [[Math.round(p.x), Math.round(p.y), Math.round(p.z + 40)]];
    let cur = null, bd = Infinity;
    for (const z of world.zombies) { const d = inCone(z); if (d && d < bd) { bd = d; cur = z; } }
    let dmg = 55 * pow;
    for (let n = 0; cur && n < 6; n++) {
      hit.add(cur); const m = eff(cur);
      hurtZombie(cur, dmg * m, p, m > 1 ? "crit" : ""); cur.stun = Math.max(cur.stun, t + 0.4 * m); p.st.shoutHits++;
      pts.push([Math.round(cur.x), Math.round(cur.y), Math.round((cur.z || 0) + zHeight(cur) / 2)]);
      let next = null, nd = 220 * 220;
      for (const z of world.zombies) if (!hit.has(z) && z.hp > 0) { const d = dist2(z, cur); if (d < nd) { nd = d; next = z; } }
      cur = next; dmg *= 0.85;
    }
    if (pts.length === 1) { const a = p.a; pts.push([Math.round(p.x + Math.cos(a) * range), Math.round(p.y + Math.sin(a) * range), Math.round(p.z + 40)]); }
    world.events.push({ k: "zap", pts });
    for (const q of players.values()) if (q !== p && !q.dead && inCone(q) && inCone(q) < 120) hurtPlayer(q, 12, p, "struck by lightning");
    return;
  }
  for (const z of world.zombies) {
    const d = inCone(z); if (!d) continue;
    const m = eff(z); p.st.shoutHits++;
    if (el === "force") {
      const dx = z.x - p.x, dy = z.y - p.y;
      z.vx = (dx / d) * 700 * m / massOf(z); z.vy = (dy / d) * 700 * m / massOf(z);
      z.stun = t + 1.2 * m; hurtZombie(z, 10 * m * pow, p, m > 1 ? "crit" : "");
    } else if (el === "fire") {
      hurtZombie(z, 22 * m * pow, p, m > 1 ? "crit" : ""); z.fireUntil = t + 2.5 * m; z.fireBy = p.id;
    } else if (el === "frost") {
      hurtZombie(z, 14 * m * pow, p, m > 1 ? "crit" : ""); z.stun = Math.max(z.stun, t + 2.2 * m); z.frozen = t + 2.2 * m; z.fireUntil = 0;
    }
  }
  if (el === "fire") for (let k = 1; k <= 4; k++) ignite(p.x + Math.cos(p.a) * k * 60, p.y + Math.sin(p.a) * k * 60, p.z + 30, p.id, 3);
  if (el === "frost") for (const [key, f] of fires) if (inCone(f)) fires.delete(key); // puts out fires
  for (const q of players.values()) {
    if (q === p || q.dead) continue;
    const d = inCone(q); if (!d) continue;
    if (el === "force") kick(q, (q.x - p.x) / d * 600, (q.y - p.y) / d * 600, 120);
    else if (el === "fire") q.fireUntil = t + 1.2, q.fireBy = p.id;
    else if (el === "frost") { q.frozen = t + 1.2; q.fireUntil = 0; q.pe.push({ k: "toast", text: "You've been frozen solid by a teammate.", color: "#8fe0ff" }); }
  }
}
export function doDodge(p) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.dashCd) return;
  const w = MV.wishDir(p.keys, p.my ?? p.a);
  let dx = w.x, dy = w.y;
  if (!dx && !dy) { dx = Math.cos(p.a); dy = Math.sin(p.a); }
  const spd = Math.max(Math.hypot(p.vx, p.vy), speedOf(p) * 2.7); // works in the air too: an air dash
  p.vx = dx * spd; p.vy = dy * spd; if (!p.gr && p.vz < 0) p.vz = 0;
  p.dashUntil = t + 0.18; p.dashCd = t + (p.cls === "rogue" ? 0.8 : 1.3);
}
// ---------------------------------------------------------------- movement extras: stamina and slide tackles
// (the movement itself is in public/move.js, shared with the browser)
const STAM_DRAIN = 18, STAM_REGEN = 26;
export function moveTick(p, t, dt) {
  if (p.sprint) { p.stam = Math.max(0, p.stam - STAM_DRAIN * dt * (1 - 0.12 * sk(p, "fleet"))); p.sprintAt = t; }
  else if (t - (p.sprintAt || 0) > 0.6) p.stam = Math.min(100, p.stam + STAM_REGEN * dt);
  if (p.slide > 0 && Math.hypot(p.vx, p.vy) > 200) { // sliding into the dead takes their legs out
    for (const z of world.zombies) {
      if (z.hp <= 0 || (z.kd || 0) > t || Math.abs((z.z || 0) - p.z) > 30 || dist2(z, p) > (20 + z.r) ** 2) continue;
      const big = ZTYPES[z.type].big;
      z.stun = Math.max(z.stun || 0, t + (big ? 0.35 : 1.1)); if (!big) z.kd = t + 1.1;
      z.vx += p.vx * (big ? 0.15 : 0.6); z.vy += p.vy * (big ? 0.15 : 0.6);
      hurtZombie(z, 12, p, "");
      world.events.push({ k: "kd", x: Math.round(z.x), y: Math.round(z.y) });
    }
  }
}
// ---------------------------------------------------------------- the dead find their way inside (town.js builds the waypoints)
// A zombie heading for someone in a different part of town (upstairs, in a cellar, down the tunnels) walks
// to the nearest waypoint in its own part, then follows the route to the one nearest its target.
export function navGoal(z, target) {
  const nav = TOWN_NAV;
  if (!nav || !nav.N) return null;
  const zr = regionOf(nav, z), tr = regionOf(nav, target);
  const pick = (e, region) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < nav.N; i++) {
      const n = nav.nodes[i]; if (n.r !== region) continue;
      let d = (n.x - e.x) ** 2 + (n.y - e.y) ** 2 + ((n.z - (e.z || 0)) * 2) ** 2;
      if (region === "O" && d < bd && nav.structs.some((st) => segHitsRect(e, n, st, -4))) d *= 9; // outside, prefer a waypoint you can walk straight to
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const reached = (i) => { const n = nav.nodes[i]; return (n.x - z.x) ** 2 + (n.y - z.y) ** 2 < (z.r + 26) ** 2 && Math.abs(n.z - (z.z || 0)) < 46; };
  const to = pick(target, tr);
  if (to < 0) { z.navI = -1; return null; }
  // stick with the waypoint we're already walking to (half way up a staircase the nearest waypoint is the one at the bottom,
  // and re-picking by distance used to walk them straight back down); only re-plan when the target's waypoint changes
  let i = z.navI ?? -1;
  if (i >= 0 && z.navTo !== to) i = -1;
  if (i < 0) { if (zr === tr) return null; i = pick(z, zr); if (i < 0) return null; }
  for (let k = 0; k < 4 && reached(i) && i !== to; k++) { const nx = nav.NX[i * nav.N + to]; if (nx < 0 || nx === i) break; i = nx; }
  if (i === to && (reached(i) || zr === tr)) { z.navI = -1; return null; } // at their waypoint, or on their floor: go straight for them
  z.navI = i; z.navTo = to;
  const n = nav.nodes[i];
  return { x: n.x, y: n.y, z: n.z };
}
// speed boosters fling the dead too
export function boostZombies(t) {
  for (const b of BOOSTS) for (const z of world.zombies) if ((z.z || 0) < 10 && z.x > b.x && z.x < b.x + b.w && z.y > b.y && z.y < b.y + b.h && !((z.boosted || 0) > t)) { z.vx = Math.cos(b.a) * 800; z.vy = Math.sin(b.a) * 800; z.boosted = t + 0.6; }
}
