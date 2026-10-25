// The shop, players, the game object, and the zombie/weapon/player constructors.
import { ITEMS, GEAR, GEAR_KEYS, gearSum, bagAdd } from "../items.js";
import { FEE, newMarket } from "../market.js";
import { WEAPONS, MYTHIC, LOOT_TYPES, GUN_TYPES, RARITY_MULT, MODES, ATTACH, SKINS, CLASSES, BACKGROUNDS, TRAITS, ZTYPES } from "../data.js";
import { STARTER } from "../cards.js";
import { FAST, H, HEARTH, MV, ROMAN, TEST_DMG, UNLUCKY, W, dist2, now, own, pick, rand } from "./config.js";
import { endFix } from "./disasters.js";
import { BH, BW, near } from "./geometry.js";
import { PLOTS, inHouse } from "./map.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

// ---------------------------------------------------------------- data (the tables themselves are in data.js)
export const lootType = () => (Math.random() < 0.03 ? "laser" : pick(LOOT_TYPES)); // the Spartan Laser is a rare find
export const GUNS = new Set(GUN_TYPES);
const MODE_KEYS = Object.keys(MODES);
export function magOf(w) { const m = WEAPONS[w.type].mag; return w.att && w.att.mag ? Math.ceil(m * 1.5) : m; }
export function attList(w) { return w.att ? Object.values(w.att).join(",") : ""; }
export const TRAIT_KEYS = Object.keys(TRAITS);
export const zCode = (z) => ZTYPES[z.type].code;
export const SHOP = {
  medkit:  { name: "Medkit (goes in your bag)", cost: 40 },
  kevlar:  { name: "Armour plates (soak 60 damage)", cost: 60 },
  smg:     { name: "SMG", cost: 80 },
  shotgun: { name: "Shotgun", cost: 100 },
  rifle:   { name: "Rifle", cost: 150 },
  sniper:  { name: "Sniper", cost: 220 },
  sword:   { name: "Slop Sword", cost: 90 },
  rocket:  { name: "Rocket Launcher", cost: 160 },
  grenade: { name: "Grenades x2", cost: 30 },
  molotov: { name: "Molotovs x2", cost: 30 },
  case:    { name: "Mystery Case", cost: 100 },
  gcase:   { name: "Golden Case (wheel spins!)", cost: 150 },
  hoe:     { name: "Hoe (F to hold it, click to till new plots)", cost: 40 },
  enhance: { name: "Enhance weapon", cost: 0 },
  repair:  { name: "Repair Hearth", cost: 75 },
  antidote: { name: "Antidote (goes in your bag)", cost: 40 },
};
for (const [id, it] of Object.entries(SHOP)) it.cat = ["seeds", "hoe", "repair", "enhance", "case", "gcase"].includes(id) ? "farm" : ["medkit", "antidote"].includes(id) ? "food" : "arms";
for (const id of ["bread", "beans", "ration", "pie", "water", "cola", "grog", "bandage", "iodine", "radaway", "flowers", "trinket", "pack"]) SHOP[id] = { name: ITEMS[id].name, cost: ITEMS[id].cost, cat: id === "pack" ? "farm" : "food", desc: ITEMS[id].desc };
for (const id of GEAR_KEYS) SHOP[id] = { name: GEAR[id].name, cost: GEAR[id].cost, cat: "gear", desc: GEAR[id].desc || "" };
SHOP.repair.cat = "dome";
SHOP.flowers.cat = SHOP.trinket.cat = "gift"; // their own tab, so people can find them
SHOP.dome50 = { name: "Put 50g towards the Hearth Dome", cost: 50, cat: "dome" };
SHOP.dome250 = { name: "Put 250g towards the Hearth Dome", cost: 250, cat: "dome" };
// call one in: Haddock radios it through and it lands near you a few seconds later
export const CALL_IN = { call_tractor: ["tractor", 200, "Tractor"], call_buggy: ["buggy", 350, "Slop Buggy"], call_heli: ["heli", 800, "Crop Chopper"], call_gunship: ["gunship", 1800, "Slop Gunship"] };
for (const [id, [, cost, name]] of Object.entries(CALL_IN)) SHOP[id] = { name: `Call in a ${name} (lands near you)`, cost, cat: "veh" };
for (const [id, a] of Object.entries(ATTACH)) SHOP["att_" + id] = { name: a.name, cost: a.cost, cat: "mods", desc: a.desc + " Fits the gun in your hands." };
for (const [id, k] of Object.entries(SKINS)) SHOP["skin_" + id] = { name: `${k.name} skin`, cost: k.cost, cat: "mods", desc: "Paints the gun in your hands. Purely for looking good." };
// which counter sells what
SHOP.mechkit = { name: "Federation mech kit (core, legs, autocannon arm)", cost: 1200, cat: "veh", desc: "Everything a mech needs to walk. Goes in your bag: use each part to bolt it on, then press P." };
SHOP.mechpart = { name: "Mech part crate (a random part)", cost: 400, cat: "veh", desc: "One random mech part, straight into your bag." };
for (const [id, it] of Object.entries(SHOP)) it.shop = ["repair", "dome50", "dome250"].includes(id) ? "hearth" : ["case", "gcase"].includes(id) ? "casino" : it.cat === "arms" || it.cat === "gear" || it.cat === "veh" || it.cat === "mods" || id === "enhance" ? "armoury" : "general";
export const VEHICLES = {
  tractor: { name: "Tractor",    r: 28, max: 260, acc: 240, turn: 2.2, hp: 700, ram: 1.6 },
  buggy:   { name: "Slop Buggy", r: 24, max: 480, acc: 430, turn: 3.0, hp: 300, ram: 1.0 },
  heli:    { name: "Crop Chopper", r: 34, max: 520, acc: 0, turn: 1.7, hp: 650, ram: 0, air: true },
  gunship: { name: "Slop Gunship", r: 40, max: 430, acc: 0, turn: 1.4, hp: 1200, ram: 0, air: true, gun: true },
  mech:    { name: "Mech", r: 30, max: 230, acc: 0, turn: 3.2, hp: 2200, ram: 0, mech: true }, // yours: built from parts (bugs.js), called down with P
};
export const PIECES = {
  wall:   { name: "Wall",   cost: 25,  hp: 300, solid: true, z1: 70,  desc: "Blocks the dead (and bullets). They will chew through it." },
  spikes: { name: "Spikes", cost: 35,  hp: 1,   solid: false, uses: 15, desc: "Hurts whatever walks over it. 15 uses." },
  turret: { name: "Turret", cost: 140, hp: 300, solid: true, z1: 50,  range: 380, rate: 2.2, dmg: 16, desc: "Shoots the nearest threat. Never needs reloading." },
  lamp:   { name: "Lamp",   cost: 20,  hp: 80,  solid: false, desc: "Lights up the night around it." },
};
export const GRID = 40;
export function collide(e, r) { return !!MV.pushOut(e, r, near(e), BW(), BH()); } // at the entity's own height (ground level if it has none)
// 3D slab test against a box; returns the distance along the (unit) ray or Infinity
export function rayBox3(o, d, b) {
  let tmin = 0, tmax = Infinity;
  const lo = [b.x, b.y, b.z0], hi = [b.x + b.w, b.y + b.h, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return Infinity; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
// a standing thing is a vertical cylinder
export function rayCyl(o, d, c, r, z0, z1) {
  const hl = Math.hypot(d[0], d[1]);
  let best = Infinity;
  if (hl > 1e-6) {
    const th = rayCircle(o[0], o[1], d[0] / hl, d[1] / hl, c, r);
    if (th < Infinity) { const t = th / hl, z = o[2] + d[2] * t; if (z >= z0 && z <= z1) best = t; }
  }
  if (Math.abs(d[2]) > 1e-6) for (const zc of [z0, z1]) {
    const t = (zc - o[2]) / d[2];
    if (t > 0 && t < best) { const px = o[0] + d[0] * t - c.x, py = o[1] + d[1] * t - c.y; if (px * px + py * py < r * r) best = t; }
  }
  return best;
}
export const zHeight = (z) => z.r * ZTYPES[z.type].h; // bugs are low and wide
export function freeGround(p) { return MV.floorAt(p.x, p.y, 20, 0, near(p)).h === 0 && !near(p).some((w) => w.kind === "pad" && MV.touches(w, p.x, p.y, 40)); }
export function rayRect(x, y, dx, dy, w) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[x, dx, w.x, w.x + w.w], [y, dy, w.y, w.y + w.h]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayCircle(x, y, dx, dy, c, r) {
  const fx = x - c.x, fy = y - c.y;
  const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : Infinity);
}
export function freeSpot(r = 30) {
  for (let i = 0; i < 100; i++) {
    const p = { x: rand(100, W - 100), y: rand(100, H - 100) };
    if (PLOTS.some((pl) => dist2(pl, p) < 90 * 90) || inHouse(p)) continue;
    const q = { ...p }; collide(q, r); if (q.x === p.x && q.y === p.y && freeGround(p)) return p;
  }
  return { x: 200, y: 200 };
}
function hearthSpawn() {
  const a = rand(0, Math.PI * 2);
  const p = { x: HEARTH.x + HEARTH.w / 2 + Math.cos(a) * 130, y: HEARTH.y + HEARTH.h / 2 + Math.sin(a) * 110 };
  collide(p, 16);
  return p;
}
// ---------------------------------------------------------------- state
world.nextId = 1;
export const players = new Map(); // id -> player
world.zombies = [];
world.crates = [];
world.events = [];
world.vehicles = [];
world.builds = [];
export const freshMods = () => ({ hearthRegen: 0, zHp: 1, zCount: 1, dmg: 1, shoutCd: 1, speed: 1, hpBonus: 0, taxFree: false, nightCut: 1, nightGold: 1, bossHp: 1, discount: 0, grow: 1, hunger: 1, fee: FEE });
export const freshDeeds = () => ({ blood: 0, soil: 0, coin: 0, word: 0, tk: 0 });
export const game = { mode: "story", countdown: 0, skip: new Set(), deeds: freshDeeds(), legend: null, prev: null, pendingVote: null, zone: null, drop: null, aff: {}, clues: new Set(), phase: "lobby", night: 0, ends: 0, hearth: 1000, hearthMax: 1000, result: null, spawnLeft: 0, spawnNext: 0, bossId: 0, bossKind: "leshen", stats: null, flags: { valley: world.VALLEY }, mods: freshMods(), vote: null, story: null, ending: null,
  market: newMarket(), mayor: null, elec: null, nuke: null, waste: false, hot: [], posadAt: 0, tip: null, cameo: "chef" };
export function newWeapon(type, rarity = 0, enh = 0) {
  const w = { type, rarity, enh, ammo: WEAPONS[type].mag, reloadUntil: 0, reloadStart: 0, nextShot: 0, bloom: 0, hot: false, tried: false };
  if (rarity >= 3 && (GUNS.has(type) || type === "sword")) w.mode = pick(type === "sword" ? ["fire", "frost", "storm"] : MODE_KEYS);
  return w;
}
export function wName(w) { return w.rarity === 4 ? MYTHIC[w.type] : (w.mode ? MODES[w.mode].name + " " : "") + WEAPONS[w.type].name; }
export function traitOf(p) { return TRAITS[p.trait] || {}; }
export function sk(p, s) { return p.sk[s] || 0; }
export function maxHp(p) { return CLASSES[p.cls].hp + (traitOf(p).hp || 0) + 20 * sk(p, "tough") + game.mods.hpBonus + (p.champion ? 50 : 0) + p.bonusHp; }
export function fullName(p) { return `${p.base}${p.gen > 1 ? " " + ROMAN[Math.min(p.gen, 12)] : ""} ${traitOf(p).epithet}`; }
export function xpNeed(lvl) { return 50 + 30 * (lvl - 1); }
export function makePlayer(ws, msg) {
  const cls = own(CLASSES, msg.cls) ? msg.cls : "fighter";
  const bg = own(BACKGROUNDS, msg.bg) ? msg.bg : "soldier";
  const chosen = own(TRAITS, msg.trait) ? msg.trait : null;
  const p = {
    id: world.nextId++, ws, base: String(msg.name || "Peasant").replace(/[<>]/g, "").slice(0, 16) || "Peasant",
    color: /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : "#e0b050", hat: String(msg.hat || "none").slice(0, 10),
    eyes: String(msg.eyes || "dot").slice(0, 10), bg, chosenTrait: chosen,
    cls, gen: 1, trait: chosen || pick(TRAIT_KEYS), x: 0, y: 0, a: 0, keys: 0, firing: false,
    hp: 0, armor: 0, gold: 0, seeds: 0, dead: false, respawnAt: 0, weapons: [], active: 0,
    heat: 0, dashUntil: 0, dashCd: 0, dashDx: 0, dashDy: 0, z: 0, vz: 0, gr: true, pt: 0, shoutCd: 0, vx: 0, vy: 0, lastHurt: 0,
    pe: [], lineage: [], champion: false, cos: new Set(), trail: "", title: "", spunTotal: 0,
    cards: STARTER.reduce((a, id) => { a[id] = (a[id] || 0) + 1; return a; }, {}), deck: [], // your Slop Snap collection stays with you between games
  };
  resetProgress(p);
  if (game.phase === "lobby") p.rolled = p.trait; // a random trait is rolled once, when you join, so the name in the lobby is the name you play as
  resetLoadout(p, true);
  return p;
}
export function resetProgress(p) {
  p.lvl = 1; p.xp = 0; p.pts = 0; p.sk = { ...(BACKGROUNDS[p.bg].sk || {}) };
  p.gen = 1; p.lineage = []; p.trait = p.chosenTrait || p.rolled || pick(TRAIT_KEYS); p.rolled = null; p.champion = false; p.heat = 0; p.dead = false;
  p.st = { kills: 0, deaths: 0, dmg: 0, crops: 0, tk: 0, gold: 0, bounty: 0, shots: 0, hits: 0, hs: 0, perfect: 0, cases: 0, shoutHits: 0, repairs: 0, pk: 0 };
  p.q = {}; p.flags = {}; p.bonusHp = 0; p.hearthBonus = false; p.shoutMult = 1; p.discount = 0; p.dlg = null; p.talked = new Set(); p.out = false; p.place = 0; p.air = null; p.pod = false; p.veh = 0; p.spins = 0; p.casino = null; p.spinning = false;
  p.bl = 0; p.bw = 0; p.going = 0; p.goKind = ""; p.inf = null; p.immune = 0; p.streak = 0; p.stam = 100; p.soggy = 0; p.ads = false;
  p.hoe = p.cls === "farmer" ? 1 : 0; p.stress = 0; p.meltdown = 0; p.elem = "force";
  p.love = {}; p.dating = null; p.spouse = null; p.gifted = new Set(); p.breath = 15;
  p.bag = [{ id: "bread", n: 2 }, { id: "water", n: 2 }, { id: "bandage", n: 1 }]; p.gear = {};
  p.food = 85; p.water = 85; p.rad = 0; p.drunk = 0; p.fizz = 0; p.iodine = 0; p.shares = {}; p.basis = {}; if (p.cg) p.pe.push({ k: "cg", close: 1 }); p.cg = null; p.kt = new Set();
  if (p.fix) endFix(p, "reset"); p.hack = null;
  p.mech = {}; p.mechCd = 0; p.mechWreck = false; p.mechDrop = 0; // mech parts bolted on (bugs.js); they pass down to your heir
  p.st.ateGrown = 0; p.st.ztypes = 0; p.st.sharesBought = 0; p.st.cardWins = 0; p.invDirty = true;
}
export function resetLoadout(p, fresh) {
  p.hp = maxHp(p); p.armor = 0;
  p.weapons = [newWeapon("pistol")];
  if (fresh && CLASSES[p.cls].start) p.weapons.push(newWeapon(CLASSES[p.cls].start));
  p.active = p.weapons.length - 1;
  if (fresh) { p.gold = (FAST ? 2000 : 50) + (BACKGROUNDS[p.bg].gold || 0); bagAdd(p.bag, "s_turnip", p.cls === "farmer" ? 6 : 3); if (p.cls === "farmer") bagAdd(p.bag, "s_potato", 3); p.invDirty = true; }
  p.gren = Math.max(p.gren || 0, fresh ? 2 : 1); p.molo = Math.max(p.molo || 0, fresh ? 1 : 0); p.bile = 0; p.throwAt = 0;
  Object.assign(p, hearthSpawn(), { z: 0, vx: 0, vy: 0, vz: 0, gr: true });
}
export function deed(k, n) { if (rules().story) game.deeds[k] += n; }
export function toast(p, text, color) { p.pe.push({ k: "toast", text, color }); }
export function feed(text, color) { world.events.push({ k: "feed", text, color }); }
export function chat(from, text, color) { world.events.push({ k: "chat", from, text, color }); }
const earning = () => game.phase !== "lobby" && game.phase !== "over"; // nothing is earned in the lobby
export function addXp(p, amt) {
  if (!earning()) return;
  p.xp += amt;
  while (p.xp >= xpNeed(p.lvl)) {
    p.xp -= xpNeed(p.lvl); p.lvl++; p.pts++;
    p.pe.push({ k: "lvl", lvl: p.lvl });
    if (p.lvl % 5 === 0) feed(`${fullName(p)} reached level ${p.lvl}`, "#9fe0ff");
    if (unlucky(p)) break;
  }
}
// the 0.004%: every level-up and upgrade rolls it. Almost nobody will ever see this.
export function unlucky(p) {
  if (Math.random() >= UNLUCKY) return false;
  const lv = p.lvl;
  p.lvl = 1; p.xp = 0; p.pts = 0; p.sk = { ...(BACKGROUNDS[p.bg].sk || {}) };
  for (const w of p.weapons) w.enh = 0;
  p.hp = Math.min(p.hp, maxHp(p));
  feed(`The 0.004% happened to ${fullName(p)}. Level ${lv}, every skill and every upgrade: gone.`, "#ff4b4b");
  p.pe.push({ k: "unlucky", lv });
  return true;
}
function gaffers() { return [...players.values()].filter((q) => q.cls === "gaffer" && !q.dead); }
export function addGold(p, amt, reason) {
  if (!earning()) return;
  amt = Math.round(amt * (1 + (traitOf(p).gold || 0)));
  p.gold += amt; p.st.gold += amt;
  for (const g of gaffers()) if (g !== p) { const fee = Math.max(1, Math.round(amt * 0.1)); g.gold += fee; g.st.gold += fee; }
  if (reason) p.pe.push({ k: "gold", amt, reason });
}
export const wading = (e) => game.disaster && game.disaster.kind === "flood" && (e.z || 0) < game.disaster.water - 6;
export const crouched = (p) => !!(p.keys & 64) && p.gr && !p.swim && !p.veh && !p.dead; // CTRL on land
export function speedOf(p) {
  let s = 210 * CLASSES[p.cls].speed * (1 + (traitOf(p).speed || 0)) * (1 + 0.06 * sk(p, "fleet")) * game.mods.speed;
  if (inAura(p)) s *= 1.1;
  if (now() < (p.groove || 0)) s *= 1.08; // danced at Club Slop
  if (p.weapons[p.active]?.type === "sniper") s *= 0.85;
  if (p.ads) s *= 0.6;
  // (crouching halves it inside MV.step, so prediction and the server agree)
  if (now() < p.soggy) s *= 0.8;
  if (wading(p)) s *= 0.55;
  if (p.swim) s *= 1 + gearSum(p.gear, "swim"); else s *= Math.max(0.5, 1 + gearSum(p.gear, "speed"));
  if (now() < p.fizz) s *= 1.2;
  if (p.water <= 0 || p.food <= 0) s *= 0.85;
  return s;
}
function inAura(p) { return gaffers().some((g) => g !== p && dist2(g, p) < 260 * 260); }
export function dmgMult(p, w) {
  let m = RARITY_MULT[w.rarity] * (1 + 0.15 * w.enh) * (1 + (traitOf(p).dmg || 0)) * game.mods.dmg;
  if (inAura(p)) m *= 1.2;
  if (p.champion) m *= 1.3;
  if (w.hot) m *= 1.2;
  return m * TEST_DMG * (w.mult || 1); // w.mult: a mech's autocannon
}
export function price(p, cost) { return Math.round(cost * Math.max(0.2, 1 - 0.1 * sk(p, "haggler") - p.discount - game.mods.discount)); }
export function reloadTime(p, w) { return WEAPONS[w.type].reload * (w.att && w.att.mag ? 1.15 : 1) * (1 - 0.15 * sk(p, "quick")) * (1 - Math.min(0.5, gearSum(p.gear, "reload"))); }
// current cone half-angle: tight first shot, blooms while spraying, worse while moving
export function spreadOf(p, w) {
  const def = WEAPONS[w.type];
  const moving = p.keys & 15;
  let s = def.spread * (0.3 + w.bloom) * (1 + (traitOf(p).spread || 0));
  if (moving) s *= w.type === "sniper" ? 8 : 1.7;
  if (w.type === "shotgun") s = def.spread * (moving ? 1.15 : 1);
  if (p.ads) s *= w.type === "shotgun" ? 0.75 : 0.4;
  if (p.ads && w.att && w.att.sight) s *= 0.6; // red dot
  if (crouched(p)) s *= 0.6; // a steadier aim, crouched
  if (p.stress > 60) s *= 1 + (p.stress - 60) / 50; // shaky hands
  if (p.drunk > 0) s *= 1 + p.drunk / 45; // grog
  s *= 1 - Math.min(0.5, gearSum(p.gear, "spread"));
  return s;
}
