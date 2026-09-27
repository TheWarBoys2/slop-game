// SLOP VALLEY — game server. Run with `bun server.js [port]`.
// Serves the browser client and runs the whole game authoritatively.
import indexHtml from "./public/index.html" with { type: "text" };
import gameJs from "./public/game.js" with { type: "text" };
import os from "node:os";
import { storyEvent, bossKind, BOSSES, ending, valleyName } from "./story.js";
import { NPCS, QUESTS, CLUES, npcLines } from "./npcs.js";
import { LEGENDS, legendOf, legendName, reckoning, legendLines } from "./legend.js";

const PORT = Number(process.argv[2] || process.env.PORT || 7777);
const TICK_RATE = 30;
const SNAP_EVERY = 2; // 15 snapshots/sec
const FAST = !!process.env.SLOP_FAST; // testing only: short phases
const DAY_LEN = FAST ? 6 : 50;
const NIGHT_LEN = FAST ? 8 : 60;
const VOTE_LEN = FAST ? 3 : 25;
const LAST_NIGHT = 5;
const DROP_LEN = FAST ? 4 : 12; // seconds the balloon takes to cross the valley
const ROYALE_ZONES = [ // [wait, shrink, radius]
  [60, 40, 1000], [40, 30, 650], [30, 25, 380], [25, 20, 180], [20, 20, 0],
].map(([w, s, r]) => [FAST ? w / 6 : w, FAST ? s / 4 : s, r]);
const STORY_ZONE_R = [1700, 1350, 1100, 920, 800, 680];
const TEST_DMG = Number(process.env.SLOP_DMG || 1); // testing only
const INTRO_LEN = { story: FAST ? 3 : 25, royale: FAST ? 2 : 10 };
const COUNTDOWN = FAST ? 1 : 4;

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const ROMAN = ["", "", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const now = () => performance.now() / 1000;
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- map (procedural)
const W = 2400, H = 1800;
const HEARTH = { x: 1120, y: 840, w: 160, h: 120, kind: "hearth" };
let WALLS = [HEARTH];
let MAP_SEED = 1;
let VALLEY = "Slopholm";
const PLOTS = [];
for (const baseX of [830, 1390]) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
  PLOTS.push({ x: baseX + c * 64 + 28, y: 800 + r * 64 + 28, stage: 0, prog: 0, rate: 1, owner: 0 });

function generateMap(seed) {
  MAP_SEED = seed;
  const rng = mulberry(seed);
  const R = (a, b) => a + rng() * (b - a);
  VALLEY = valleyName(rng);
  const walls = [HEARTH];
  const clear = { x: 760, y: 700, w: 880, h: 400 }; // farm + hearth stay open
  const overlaps = (r, pad) => {
    if (r.x < 60 || r.y < 60 || r.x + r.w > W - 60 || r.y + r.h > H - 60) return true;
    const hit = (o) => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y;
    return hit(clear) || walls.some(hit);
  };
  const place = (n, mk, pad) => { for (let i = 0, tries = 0; i < n && tries < 400; tries++) { const r = mk(); if (!overlaps(r, pad)) { walls.push(r); i++; } } };
  place(4 + ((rng() * 4) | 0), () => ({ x: R(80, W - 320), y: R(80, H - 260), w: R(170, 280), h: R(120, 180), kind: "house", roof: (rng() * 4) | 0 }), 90);
  place(5 + ((rng() * 5) | 0), () => { const s = R(55, 95); return { x: R(80, W - 160), y: R(80, H - 160), w: s, h: s * R(0.7, 1.1), kind: "rock" }; }, 70);
  place(8 + ((rng() * 8) | 0), () => { const s = R(40, 56); return { x: R(80, W - 120), y: R(80, H - 120), w: s, h: s, kind: "tree" }; }, 50);
  place(3 + ((rng() * 4) | 0), () => rng() < 0.5 ? { x: R(80, W - 260), y: R(80, H - 80), w: R(120, 220), h: 18, kind: "fence" } : { x: R(80, W - 80), y: R(80, H - 260), w: 18, h: R(120, 220), kind: "fence" }, 70);
  WALLS = walls;
}
generateMap((Math.random() * 1e9) | 0);
let NPC_POS = [];
function placeNpcs() {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  NPC_POS = [{ id: "grubb", x: hc.x - 40, y: HEARTH.y - 40 }, { id: "haddock", x: hc.x + 40, y: HEARTH.y + HEARTH.h + 40 }];
  for (const id of ["aldous", "vex", "pell", "morwen"]) {
    let best = null;
    for (let i = 0; i < 60; i++) {
      const sp = freeSpot(26);
      const d = Math.hypot(sp.x - hc.x, sp.y - hc.y);
      const want = id === "morwen" ? d > 800 : d > 350 && d < 750;
      if (want && !NPC_POS.some((n) => Math.hypot(n.x - sp.x, n.y - sp.y) < 200)) { best = sp; break; }
      if (!best) best = sp;
    }
    NPC_POS.push({ id, ...best });
  }
}
placeNpcs();
function npcList() { return game.mode === "royale" ? [] : NPC_POS.map((n) => ({ ...n, name: NPCS[n.id].name, role: NPCS[n.id].role, color: NPCS[n.id].color, hat: NPCS[n.id].hat })); }
const WELL = { x: 1275, y: 745 };
function mapMsg() { return { t: "map", map: { W, H, walls: WALLS.filter((w) => w.kind !== "built"), hearth: HEARTH, well: WELL, plots: PLOTS.map((p) => ({ x: p.x, y: p.y })), seed: MAP_SEED, valley: VALLEY, npcs: npcList() } }; }

// ---------------------------------------------------------------- data
const WEAPONS = {
  pistol:  { name: "Pistol",     dmg: 22,  rate: 3.5, spread: 0.05,  range: 700,  pellets: 1, mag: 12, reload: 1.2, bloom: 0.35 },
  smg:     { name: "SMG",        dmg: 14,  rate: 11,  spread: 0.10,  range: 600,  pellets: 1, mag: 30, reload: 2.0, bloom: 0.12 },
  shotgun: { name: "Shotgun",    dmg: 13,  rate: 1.1, spread: 0.22,  range: 380,  pellets: 8, mag: 6,  reload: 2.4, bloom: 0.2 },
  rifle:   { name: "Rifle",      dmg: 30,  rate: 7,   spread: 0.08,  range: 900,  pellets: 1, mag: 30, reload: 2.3, bloom: 0.2 },
  sniper:  { name: "Sniper",     dmg: 130, rate: 0.8, spread: 0.01,  range: 1600, pellets: 1, mag: 5,  reload: 3.0, bloom: 0, pierce: true },
  staff:   { name: "Fire Staff", dmg: 45,  rate: 1.5, spread: 0.03,  range: 700,  pellets: 1, mag: 10, reload: 2.0, bloom: 0.3, boom: 90 },
};
const MYTHIC = {
  smg: "The Hive", shotgun: "Farmer's Wrath", rifle: "Kingmaker", sniper: "The Last Word", staff: "Morwen's Spite", pistol: "Grubb's Gavel",
};
const LOOT_TYPES = ["smg", "shotgun", "rifle", "sniper", "staff"];
const RARITY = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
const RARITY_MULT = [1, 1.2, 1.4, 1.7, 2.0];
const ENH_NAMES = ["", "PRI", "DUO", "TRI", "TET", "PEN"];
const ENH_COST = [40, 80, 140, 220, 320];
const ENH_CHANCE = [0.9, 0.7, 0.5, 0.3, 0.15];

const CLASSES = {
  fighter: { name: "Fighter", hp: 150, speed: 1.0,  start: "smg" },
  rogue:   { name: "Rogue",   hp: 90,  speed: 1.2,  start: null },
  wizard:  { name: "Wizard",  hp: 90,  speed: 1.0,  start: "staff" },
  farmer:  { name: "Farmer",  hp: 110, speed: 1.0,  start: "shotgun" },
  gaffer:  { name: "Gaffer",  hp: 100, speed: 1.05, start: null },
};
const BACKGROUNDS = {
  soldier:   { name: "Soldier",   sk: { steady: 1 } },
  farmhand:  { name: "Farmhand",  sk: { green: 1 } },
  noble:     { name: "Noble",     gold: 100 },
  outlander: { name: "Outlander", sk: { fleet: 1 } },
  acolyte:   { name: "Acolyte",   sk: { thuum: 1 } },
  urchin:    { name: "Urchin",    sk: { scavenger: 1 } },
};
const TRAITS = {
  Strong:   { epithet: "the Strong", hp: 25 },
  Swift:    { epithet: "the Swift", speed: 0.12 },
  Greedy:   { epithet: "the Greedy", gold: 0.25 },
  Craven:   { epithet: "the Craven", speed: 0.2, dmg: -0.15 },
  Wrathful: { epithet: "the Wrathful", dmg: 0.2, hp: -15 },
  Bald:     { epithet: "the Bald" },
  Genius:   { epithet: "the Wise", shout: 0.4 },
  Drunkard: { epithet: "the Drunk", hp: 20, spread: 0.6 },
  Inbred:   { epithet: "the Inbred", hp: -10 },
  Lucky:    { epithet: "the Lucky", luck: 1 },
};
const TRAIT_KEYS = Object.keys(TRAITS);
const SKILLS = {
  deadeye:    { tree: 0, max: 3 }, steady:  { tree: 0, max: 3 }, quick:   { tree: 0, max: 3 },
  tough:      { tree: 1, max: 3 }, wind:    { tree: 1, max: 3 }, fleet:   { tree: 1, max: 3 },
  green:      { tree: 2, max: 3 }, haggler: { tree: 2, max: 3 }, scavenger: { tree: 2, max: 3 },
  thuum:      { tree: 3, max: 3 }, rally:   { tree: 3, max: 3 }, bloodlust: { tree: 3, max: 3 },
};

const ZTYPES = {
  walker: { r: 15, hp: 60,  speed: 70,  dmg: 10, gold: 10, xp: 8 },
  runner: { r: 12, hp: 35,  speed: 145, dmg: 7,  gold: 12, xp: 10 },
  tank:   { r: 26, hp: 350, speed: 50,  dmg: 25, gold: 35, xp: 25 },
  elite:  { r: 34, hp: 1400, speed: 75, dmg: 30, gold: 150, xp: 80 },
  boss:   { r: 48, hp: 3000, speed: 58, dmg: 35, gold: 500, xp: 200 },
};

const SHOP = {
  seeds:   { name: "Seeds x3", cost: 15 },
  medkit:  { name: "Medkit", cost: 40 },
  kevlar:  { name: "Kevlar", cost: 60 },
  smg:     { name: "SMG", cost: 80 },
  shotgun: { name: "Shotgun", cost: 100 },
  rifle:   { name: "Rifle", cost: 150 },
  sniper:  { name: "Sniper", cost: 220 },
  case:    { name: "Mystery Case", cost: 100 },
  enhance: { name: "Enhance weapon", cost: 0 },
  repair:  { name: "Repair Hearth", cost: 75 },
};

const VEHICLES = {
  tractor: { name: "Tractor",    r: 28, max: 260, acc: 240, turn: 2.2, hp: 700, ram: 1.6 },
  buggy:   { name: "Slop Buggy", r: 24, max: 480, acc: 430, turn: 3.0, hp: 300, ram: 1.0 },
};
const PIECES = {
  wall:   { name: "Wall",   cost: 25,  hp: 300, solid: true,  desc: "Blocks the dead (and bullets). They will chew through it." },
  spikes: { name: "Spikes", cost: 35,  hp: 1,   solid: false, uses: 15, desc: "Hurts whatever walks over it. 15 uses." },
  turret: { name: "Turret", cost: 140, hp: 300, solid: true,  range: 380, rate: 2.2, dmg: 16, desc: "Shoots the nearest threat. Never needs reloading." },
  lamp:   { name: "Lamp",   cost: 20,  hp: 80,  solid: false, desc: "Lights up the night around it." },
};
const GRID = 40;

// ---------------------------------------------------------------- geometry
function collide(e, r) {
  let hit = false;
  for (const w of WALLS) {
    const cx = clamp(e.x, w.x, w.x + w.w), cy = clamp(e.y, w.y, w.y + w.h);
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-4) { const d = Math.sqrt(d2); e.x = cx + (dx / d) * r; e.y = cy + (dy / d) * r; }
    else {
      const l = e.x - w.x, rr = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y, m = Math.min(l, rr, t, b);
      if (m === l) e.x = w.x - r; else if (m === rr) e.x = w.x + w.w + r; else if (m === t) e.y = w.y - r; else e.y = w.y + w.h + r;
    }
  }
  if (e.x < r || e.x > W - r || e.y < r || e.y > H - r) hit = true;
  e.x = clamp(e.x, r, W - r); e.y = clamp(e.y, r, H - r);
  return hit;
}
function rayRect(x, y, dx, dy, w) {
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
function freeSpot(r = 30) {
  for (let i = 0; i < 100; i++) {
    const p = { x: rand(100, W - 100), y: rand(100, H - 100) };
    if (PLOTS.some((pl) => dist2(pl, p) < 90 * 90)) continue;
    const q = { ...p }; collide(q, r); if (q.x === p.x && q.y === p.y) return p;
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
let nextId = 1;
const players = new Map(); // id -> player
let zombies = [];
let crates = [];
let events = [];
let vehicles = [];
let builds = [];
const freshMods = () => ({ hearthRegen: 0, zHp: 1, zCount: 1, dmg: 1, shoutCd: 1, speed: 1, hpBonus: 0, taxFree: false, nightCut: 1, bossHp: 1, discount: 0, grow: 1 });
const freshDeeds = () => ({ blood: 0, soil: 0, coin: 0, word: 0 });
const game = { mode: "story", countdown: 0, skip: new Set(), deeds: freshDeeds(), legend: null, prev: null, pendingVote: null, zone: null, drop: null, aff: {}, clues: new Set(), phase: "lobby", night: 0, ends: 0, hearth: 1000, hearthMax: 1000, result: null, spawnLeft: 0, spawnNext: 0, bossId: 0, bossKind: "leshen", stats: null, flags: { valley: VALLEY }, mods: freshMods(), vote: null, story: null, ending: null };

function newWeapon(type, rarity = 0, enh = 0) {
  return { type, rarity, enh, ammo: WEAPONS[type].mag, reloadUntil: 0, reloadStart: 0, nextShot: 0, bloom: 0, hot: false, tried: false };
}
function wName(w) { return w.rarity === 4 ? MYTHIC[w.type] : WEAPONS[w.type].name; }
function traitOf(p) { return TRAITS[p.trait] || {}; }
function sk(p, s) { return p.sk[s] || 0; }
function maxHp(p) { return CLASSES[p.cls].hp + (traitOf(p).hp || 0) + 20 * sk(p, "tough") + game.mods.hpBonus + (p.champion ? 50 : 0) + p.bonusHp; }
function fullName(p) { return `${p.base}${p.gen > 1 ? " " + ROMAN[Math.min(p.gen, 12)] : ""} ${traitOf(p).epithet}`; }
function xpNeed(lvl) { return 50 + 30 * (lvl - 1); }

function makePlayer(ws, msg) {
  const cls = CLASSES[msg.cls] ? msg.cls : "fighter";
  const bg = BACKGROUNDS[msg.bg] ? msg.bg : "soldier";
  const chosen = TRAITS[msg.trait] ? msg.trait : null;
  const p = {
    id: nextId++, ws, base: String(msg.name || "Peasant").replace(/[<>]/g, "").slice(0, 16) || "Peasant",
    color: /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : "#e0b050", hat: String(msg.hat || "none").slice(0, 10),
    eyes: String(msg.eyes || "dot").slice(0, 10), bg, chosenTrait: chosen,
    cls, gen: 1, trait: chosen || pick(TRAIT_KEYS), x: 0, y: 0, a: 0, keys: 0, firing: false,
    hp: 0, armor: 0, gold: 0, seeds: 0, dead: false, respawnAt: 0, weapons: [], active: 0,
    heat: 0, dashUntil: 0, dashCd: 0, dashDx: 0, dashDy: 0, shoutCd: 0, vx: 0, vy: 0, lastHurt: 0,
    pe: [], lineage: [], champion: false,
  };
  resetProgress(p);
  resetLoadout(p, true);
  return p;
}
function resetProgress(p) {
  p.lvl = 1; p.xp = 0; p.pts = 0; p.sk = { ...(BACKGROUNDS[p.bg].sk || {}) };
  p.gen = 1; p.lineage = []; p.trait = p.chosenTrait || pick(TRAIT_KEYS); p.champion = false; p.heat = 0; p.dead = false;
  p.st = { kills: 0, deaths: 0, dmg: 0, crops: 0, tk: 0, gold: 0, bounty: 0, shots: 0, hits: 0, hs: 0, perfect: 0, cases: 0, shoutHits: 0, repairs: 0, pk: 0 };
  p.q = {}; p.flags = {}; p.bonusHp = 0; p.shoutMult = 1; p.discount = 0; p.dlg = null; p.talked = new Set(); p.out = false; p.place = 0; p.air = null; p.veh = 0;
}
function resetLoadout(p, fresh) {
  p.hp = maxHp(p); p.armor = 0;
  p.weapons = [newWeapon("pistol")];
  if (fresh && CLASSES[p.cls].start) p.weapons.push(newWeapon(CLASSES[p.cls].start));
  p.active = p.weapons.length - 1;
  if (fresh) { p.gold = (FAST ? 2000 : 50) + (BACKGROUNDS[p.bg].gold || 0); p.seeds = p.cls === "farmer" ? 6 : 3; }
  Object.assign(p, hearthSpawn());
}

function deed(k, n) { if (game.mode === "story") game.deeds[k] += n; }
function toast(p, text, color) { p.pe.push({ k: "toast", text, color }); }
function feed(text, color) { events.push({ k: "feed", text, color }); }
function chat(from, text, color) { events.push({ k: "chat", from, text, color }); }

function addXp(p, amt) {
  p.xp += amt;
  while (p.xp >= xpNeed(p.lvl)) {
    p.xp -= xpNeed(p.lvl); p.lvl++; p.pts++;
    p.pe.push({ k: "lvl", lvl: p.lvl });
    if (p.lvl % 5 === 0) feed(`${fullName(p)} reached level ${p.lvl}`, "#9fe0ff");
  }
}
function gaffers() { return [...players.values()].filter((q) => q.cls === "gaffer" && !q.dead); }
function addGold(p, amt, reason) {
  amt = Math.round(amt * (1 + (traitOf(p).gold || 0)));
  p.gold += amt; p.st.gold += amt;
  for (const g of gaffers()) if (g !== p) { const fee = Math.max(1, Math.round(amt * 0.1)); g.gold += fee; g.st.gold += fee; }
  if (reason) p.pe.push({ k: "gold", amt, reason });
}
function speedOf(p) {
  let s = 210 * CLASSES[p.cls].speed * (1 + (traitOf(p).speed || 0)) * (1 + 0.06 * sk(p, "fleet")) * game.mods.speed;
  if (inAura(p)) s *= 1.1;
  if (p.weapons[p.active]?.type === "sniper") s *= 0.85;
  return s;
}
function inAura(p) { return gaffers().some((g) => g !== p && dist2(g, p) < 260 * 260); }
function dmgMult(p, w) {
  let m = RARITY_MULT[w.rarity] * (1 + 0.15 * w.enh) * (1 + (traitOf(p).dmg || 0)) * game.mods.dmg;
  if (inAura(p)) m *= 1.2;
  if (p.champion) m *= 1.3;
  if (w.hot) m *= 1.2;
  return m * TEST_DMG;
}
function price(p, cost) { return Math.round(cost * Math.max(0.2, 1 - 0.1 * sk(p, "haggler") - p.discount - game.mods.discount)); }
function reloadTime(p, w) { return WEAPONS[w.type].reload * (1 - 0.15 * sk(p, "quick")); }
// current cone half-angle: tight first shot, blooms while spraying, worse while moving
function spreadOf(p, w) {
  const def = WEAPONS[w.type];
  const moving = p.keys & 15;
  let s = def.spread * (0.3 + w.bloom) * (1 + (traitOf(p).spread || 0));
  if (moving) s *= w.type === "sniper" ? 8 : 1.7;
  if (w.type === "shotgun") s = def.spread * (moving ? 1.15 : 1);
  return s;
}

// ---------------------------------------------------------------- combat
function hurtZombie(z, dmg, p, kind) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  if (p) { p.st.dmg += dmg; p.pe.push({ k: "dmg", x: z.x, y: z.y - z.r, v: Math.round(dmg), crit: kind === "crit", hs: kind === "hs" }); }
  if (z.hp <= 0) {
    const def = ZTYPES[z.type];
    if (p) deed("blood", z.type === "boss" || z.type === "elite" ? 20 : 0.4);
    if (p) {
      p.st.kills++;
      addGold(p, def.gold);
      addXp(p, def.xp + (kind === "hs" ? 4 : 0));
      if (sk(p, "bloodlust")) p.hp = Math.min(maxHp(p), p.hp + 3 * sk(p, "bloodlust"));
    }
    if (z.type === "tank" && Math.random() < 0.15) crates.push({ id: nextId++, x: z.x, y: z.y, w: newWeapon(pick(LOOT_TYPES), 1 + (Math.random() < 0.4 ? 1 : 0)) });
    if (z.type === "elite") {
      crates.push({ id: nextId++, x: z.x, y: z.y, w: newWeapon(pick(LOOT_TYPES), 4) });
      feed(`The Drowned Mayor is dead. He dropped something MYTHIC.`, "#ff4b4b");
    }
    if (z.type === "boss") {
      feed(`${p ? fullName(p) : "Someone"} slew ${BOSSES[game.bossKind].name}`, "#ffd34d");
      for (const q of players.values()) { addGold(q, 150, "Contract reward"); addXp(q, 100); }
    }
  }
}
function hurtPlayer(v, dmg, attacker, cause) {
  if (v.dead || v.air || now() < v.dashUntil) return;
  if (attacker && attacker !== v) {
    if (game.mode !== "royale") { dmg *= 0.5; attacker.heat += dmg; } // friendly fire is real, but halved
    attacker.st.dmg += dmg;
    attacker.pe.push({ k: "dmg", x: v.x, y: v.y - 20, v: Math.round(dmg), crit: false, ff: true });
  }
  const veh = vehOf(v);
  if (veh && cause !== "blown up in a vehicle") { hurtVehicle(veh, dmg * 0.7, attacker); dmg *= 0.35; if (v.dead) return; }
  if (v.armor > 0) { const soak = Math.min(v.armor, dmg * 0.5); v.armor -= soak; dmg -= soak; }
  v.hp -= dmg; v.lastHurt = now();
  v.pe.push({ k: "hurt" });
  if (v.hp <= 0) killPlayer(v, attacker, cause);
}
function killPlayer(v, attacker, cause) {
  if (v.dead) return;
  if (v.veh) exitVehicle(v);
  v.dead = true; v.hp = 0; v.respawnAt = now() + 5; v.st.deaths++; v.champion = false; v.dlg = null;
  const prim = v.weapons.find((w) => w.type !== "pistol");
  if (prim) crates.push({ id: nextId++, x: v.x, y: v.y, w: { ...prim, ammo: WEAPONS[prim.type].mag, reloadUntil: 0, hot: false }, grave: true });
  const vStars = Math.min(5, Math.floor(v.heat / 40));
  if (game.mode === "royale") {
    v.out = true;
    v.place = [...players.values()].filter((q) => !q.out).length + 1;
    if (attacker && attacker !== v) { attacker.st.pk++; addGold(attacker, 50, "Elimination"); addXp(attacker, 30); feed(`${fullName(attacker)} eliminated ${fullName(v)} (#${v.place})`, "#ff9090"); }
    else feed(`${fullName(v)} was ${cause || "eaten"} (#${v.place})`, "#ff9090");
    v.pe.push({ k: "wasted", place: v.place });
    return;
  }
  if (attacker && attacker !== v) {
    attacker.st.tk++; game.deeds.tk++; deed("blood", 12);
    attacker.heat += 80;
    if (vStars > 0) {
      const b = 40 * vStars;
      addGold(attacker, b, "Bounty collected");
      attacker.st.bounty += b;
      feed(`${fullName(attacker)} collected a ${vStars}★ bounty on ${fullName(v)}`, "#ffcc00");
    } else feed(`${fullName(attacker)} ☠ ${fullName(v)} (TEAMKILL)`, "#ff6060");
  } else feed(`${fullName(v)} was ${cause || "eaten"}`, "#ff9090");
  v.heat = 0;
  v.pe.push({ k: "wasted" });
}
function respawnHeir(p) {
  const old = fullName(p);
  p.lineage.push(old);
  const tax = game.mods.taxFree ? 0 : Math.floor(p.gold * 0.5);
  p.gold -= tax;
  p.gen++;
  p.trait = pick(TRAIT_KEYS);
  p.dead = false;
  p.champion = game.flags.champion === p.id;
  resetLoadout(p, false);
  toast(p, `${old} is dead. Long live ${fullName(p)}! (Inheritance tax: ${tax}g)`, "#ffd34d");
  feed(`${fullName(p)} inherits the farm`, "#c0a0ff");
}

function shoot(p, w) {
  const def = WEAPONS[w.type];
  const t = now();
  w.nextShot = t + 1 / def.rate;
  w.ammo--;
  p.st.shots++;
  const myth = w.rarity === 4;
  const mult = dmgMult(p, w);
  const spread = spreadOf(p, w);
  w.bloom = Math.min(1.6, w.bloom + def.bloom * (1 - 0.2 * sk(p, "steady")));
  const pellets = def.pellets + (myth && w.type === "shotgun" ? 4 : 0);
  const pierce = def.pierce || (myth && w.type === "rifle");
  const boom = def.boom ? def.boom * (myth ? 1.6 : 1) : myth && w.type === "sniper" ? 110 : 0;
  const mx = p.x + Math.cos(p.a) * 20, my = p.y + Math.sin(p.a) * 20;
  let anyHit = false;
  for (let i = 0; i < pellets; i++) {
    const a = p.a + (Math.random() - 0.5) * 2 * spread;
    const dx = Math.cos(a), dy = Math.sin(a);
    let wallT = def.range;
    for (const wl of WALLS) wallT = Math.min(wallT, rayRect(mx, my, dx, dy, wl));
    const hits = [];
    for (const z of zombies) { const tt = rayCircle(mx, my, dx, dy, z, z.r); if (tt < wallT) hits.push([tt, z, "z"]); }
    for (const q of players.values()) {
      if (q === p || q.dead || q.veh || q.air) continue;
      const tt = rayCircle(mx, my, dx, dy, q, 16); if (tt < wallT) hits.push([tt, q, "p"]);
    }
    if (game.mode === "royale") for (const v of vehicles) { if (v.id === p.veh) continue; const tt = rayCircle(mx, my, dx, dy, v, VEHICLES[v.kind].r); if (tt < wallT) hits.push([tt, v, "v"]); }
    hits.sort((a, b) => a[0] - b[0]);
    let endT = wallT;
    if (def.boom) {
      endT = hits.length ? hits[0][0] : wallT;
      const bx = mx + dx * endT, by = my + dy * endT;
      events.push({ k: "boom", x: bx, y: by, r: boom });
      if (hits.length) anyHit = true;
      for (const z of zombies) if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (boom + z.r) ** 2) hurtZombie(z, def.dmg * mult, p);
      for (const q of players.values()) if (!q.dead && (q.x - bx) ** 2 + (q.y - by) ** 2 < boom ** 2) hurtPlayer(q, def.dmg * mult * 0.3, q === p ? null : p, "blown up by their own fireball");
    } else {
      const vi = hits.findIndex((h) => h[2] === "v");
      if (vi >= 0) hits.length = vi + 1; // vehicles stop bullets, even piercing ones
      const list = pierce ? hits : hits.slice(0, 1);
      if (!pierce && hits.length) endT = hits[0][0];
      for (const [, target, kind] of list) {
        anyHit = true;
        let dmg = def.dmg * mult;
        if (kind === "v") { hurtVehicle(target, dmg * 0.6, p); continue; }
        // precision: a shot through the middle of the target is a headshot
        const perp = Math.abs((target.x - mx) * dy - (target.y - my) * dx);
        const r = kind === "z" ? target.r : 16;
        let tag = "";
        if (perp < r * 0.38 && w.type !== "shotgun") { dmg *= 1.75 + 0.25 * sk(p, "deadeye"); tag = "hs"; p.st.hs++; }
        if (p.cls === "rogue" && Math.random() < 0.25 + (traitOf(p).luck ? 0.1 : 0)) { dmg *= 2; tag = tag || "crit"; }
        if (kind === "z") {
          hurtZombie(target, dmg, p, tag);
          if (myth && w.type === "shotgun") { target.vx += dx * 160; target.vy += dy * 160; }
          if (myth && w.type === "smg") p.hp = Math.min(maxHp(p), p.hp + dmg * 0.12);
        } else hurtPlayer(target, dmg, p, "shot");
      }
      if (boom) {
        const bx = mx + dx * endT, by = my + dy * endT;
        events.push({ k: "boom", x: bx, y: by, r: boom });
        for (const z of zombies) if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (boom + z.r) ** 2) hurtZombie(z, 60 * mult, p);
      }
    }
    events.push({ k: "tr", x1: mx, y1: my, x2: mx + dx * endT, y2: my + dy * endT, c: w.type, m: myth ? 1 : 0 });
  }
  if (anyHit) p.st.hits++;
  if (w.ammo <= 0) w.hot = false;
}
function startReload(p, w) {
  if (w.reloadUntil || w.ammo >= WEAPONS[w.type].mag) return;
  const t = now();
  w.reloadStart = t; w.reloadUntil = t + reloadTime(p, w); w.tried = false; w.hot = false;
}
// active reload: press R again inside the sweet spot for an instant, empowered reload
function tryActiveReload(p, w) {
  if (!w.reloadUntil || w.tried) return;
  w.tried = true;
  const t = now(), total = w.reloadUntil - w.reloadStart, k = (t - w.reloadStart) / total;
  if (k >= 0.45 && k <= 0.62) {
    w.reloadUntil = 0; w.ammo = WEAPONS[w.type].mag; w.hot = true; p.st.perfect++;
    p.pe.push({ k: "perfect" });
  } else {
    w.reloadUntil += 0.6;
    p.pe.push({ k: "jam" });
  }
}

// ---------------------------------------------------------------- actions
function interact(p) {
  if (p.air) return;
  if (p.veh) return exitVehicle(p);
  let best = null, bd = 60 * 60;
  for (const c of crates) { const d = dist2(c, p); if (d < bd) { bd = d; best = c; } }
  if (best) {
    crates = crates.filter((c) => c !== best);
    const w = best.w;
    let up = 0;
    for (let i = 0; i < sk(p, "scavenger"); i++) if (w.rarity < 3 && !best.grave && Math.random() < 0.2) { w.rarity++; up++; }
    giveWeapon(p, w);
    toast(p, `Looted ${RARITY[w.rarity]} ${wName(w)}${w.enh ? " +" + w.enh : ""}${up ? " (scavenged an upgrade!)" : ""}`, ["#ddd", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"][w.rarity]);
    if (w.rarity >= 3) feed(`${fullName(p)} found ${w.rarity === 4 ? "the MYTHIC" : "a LEGENDARY"} ${wName(w)}`, w.rarity === 4 ? "#ff4b4b" : "#ffc030");
    return;
  }
  if (p.veh) return exitVehicle(p);
  for (const v of vehicles) if (dist2(v, p) < (VEHICLES[v.kind].r + 34) ** 2 && enterVehicle(p, v)) return;
  if (game.mode !== "royale") { const n = NPC_POS.filter((q) => dist2(q, p) < 70 * 70).sort((a, b) => dist2(a, p) - dist2(b, p))[0]; if (n) return openDlg(p, n.id); }
  let plot = null; bd = 48 * 48;
  for (const pl of PLOTS) { const d = dist2(pl, p); if (d < bd) { bd = d; plot = pl; } }
  if (!plot) return;
  if (plot.stage === 0) {
    if (p.seeds <= 0) return toast(p, "No seeds. Buy some in the shop [B].", "#f88");
    p.seeds--; plot.stage = 1; plot.prog = 0; plot.rate = (p.cls === "farmer" ? 1.85 : 1) * (1 + 0.25 * sk(p, "green")) * game.mods.grow; plot.owner = p.id;
    addXp(p, 2);
  } else if (plot.stage === 3) {
    plot.stage = 0; p.st.crops++; deed("soil", 5);
    addGold(p, p.cls === "farmer" ? 40 : 25, "Harvest");
    addXp(p, 12);
    if (Math.random() < 0.25) { p.seeds++; toast(p, "Found a seed in the soil", "#8f8"); }
  } else toast(p, "Still growing...", "#bbb");
}
function giveWeapon(p, w) {
  if (w.type === "pistol") { p.weapons[0] = w; p.active = 0; return; }
  p.weapons[1] = w; p.active = 1;
}
function buy(p, item) {
  if (game.mode === "royale" && game.phase !== "lobby") return toast(p, "No shops in the Royale. Loot it or lose it.", "#f88");
  if (game.phase !== "day" && game.phase !== "lobby") return toast(p, "The shop is shut at night.", "#f88");
  if (p.dead) return;
  const it = SHOP[item]; if (!it) return;
  if (item === "enhance") return enhance(p);
  const cost = price(p, it.cost);
  if (p.gold < cost) return toast(p, `Need ${cost}g`, "#f88");
  if (item === "repair" && game.hearth >= game.hearthMax) return toast(p, "Hearth is already at full health", "#bbb");
  p.gold -= cost;
  deed("coin", cost / 25 + (item === "case" ? 4 : 0));
  if (item === "seeds") p.seeds += 3;
  else if (item === "medkit") p.hp = maxHp(p);
  else if (item === "kevlar") p.armor = 60;
  else if (item === "repair") { p.st.repairs++; deed("soil", 10); game.hearth = Math.min(game.hearthMax, game.hearth + 200); feed(`${fullName(p)} repaired the Hearth`, "#8f8"); }
  else if (item === "case") {
    const r = Math.random() * 100 - (traitOf(p).luck ? 8 : 0);
    const rarity = r < 0.8 ? 4 : r < 4 ? 3 : r < 15 ? 2 : r < 40 ? 1 : 0;
    const w = newWeapon(pick(LOOT_TYPES), rarity);
    giveWeapon(p, w);
    p.pe.push({ k: "case", type: w.type, rarity, name: wName(w) }); p.st.cases++;
    if (rarity >= 2) setTimeout(() => feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${wName(w)}`, ["", "", "#c070ff", "#ffc030", "#ff4b4b"][rarity]), 3200);
  } else if (WEAPONS[item]) giveWeapon(p, newWeapon(item));
  if (item !== "case") toast(p, `Bought ${it.name}`, "#8f8");
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
  } else {
    const down = w.enh >= 2;
    if (down) w.enh--;
    p.pe.push({ k: "enh", ok: false, lvl: w.enh, down });
  }
}
function learn(p, s) {
  const def = SKILLS[s];
  if (!def || p.pts <= 0 || sk(p, s) >= def.max) return;
  p.pts--; p.sk[s] = sk(p, s) + 1;
  if (s === "tough") p.hp += 20;
}
function doShout(p) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.shoutCd) return;
  p.shoutCd = t + 15 * (1 - (traitOf(p).shout || 0)) * (1 - 0.15 * sk(p, "thuum")) * game.mods.shoutCd * p.shoutMult;
  const range = 280 * (1 + 0.15 * sk(p, "thuum"));
  events.push({ k: "shout", x: p.x, y: p.y, a: p.a, id: p.id, r: range });
  const hit = (e, mass) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > range || d < 1) return false;
    let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.7) return false;
    e.vx = (dx / d) * 700 / mass; e.vy = (dy / d) * 700 / mass;
    return true;
  };
  const mass = { boss: game.bossKind === "golem" ? 99 : 5, elite: 3, tank: 2 };
  for (const z of zombies) if (hit(z, mass[z.type] || 1)) { z.stun = t + 1.2; hurtZombie(z, 10, p); p.st.shoutHits++; }
  for (const q of players.values()) if (q !== p && !q.dead) hit(q, 1);
}
function doDodge(p) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.dashCd) return;
  let dx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), dy = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
  if (!dx && !dy) { dx = Math.cos(p.a); dy = Math.sin(p.a); }
  const l = Math.hypot(dx, dy); p.dashDx = dx / l; p.dashDy = dy / l;
  p.dashUntil = t + 0.18; p.dashCd = t + (p.cls === "rogue" ? 0.8 : 1.3);
}

// ---------------------------------------------------------------- story
const storyApi = {
  players: () => [...players.values()],
  get mods() { return game.mods; },
  get flags() { return game.flags; },
  fullName,
  crate: (rarity, near) => { const at = near ? { x: near.x + rand(-40, 40), y: near.y + rand(-40, 40) } : freeSpot(); collide(at, 20); crates.push({ id: nextId++, ...at, w: newWeapon(pick(LOOT_TYPES), rarity) }); },
  hearthMax: (n) => { game.hearthMax += n; game.hearth += n; },
  repair: () => { game.hearth = game.hearthMax; },
  heal: () => { for (const p of players.values()) if (!p.dead) p.hp = maxHp(p); },
  gold: (n) => { for (const p of players.values()) if (n > 0) addGold(p, n); else p.gold = Math.max(0, p.gold + n); },
  stars: (n) => { for (const p of players.values()) p.heat = n * 40 + 20; if (!n) for (const p of players.values()) p.heat = 0; },
  points: (n) => { for (const p of players.values()) p.pts += n; },
  killPlayer: (p, cause) => killPlayer(p, null, cause),
  eliteNow: () => { const z = spawnZombie("elite"); z.hp = z.maxHp = ZTYPES.elite.hp * (0.5 + 0.5 * players.size); z.arson = false; },
  get valley() { return VALLEY; },
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
  turrets: (k) => { for (const [dx, dy] of [[-2, 0.3], [HEARTH.w / GRID + 1, 0.3]].slice(0, k)) placePiece(null, "turret", Math.round((HEARTH.x + dx * GRID) / GRID) * GRID, Math.round((HEARTH.y + dy * GRID) / GRID) * GRID, true); },
  friends: () => Object.values(game.aff).filter((a) => a >= 1).length,
  freeClue: () => { const id = Object.keys(CLUES).find((c) => !game.clues.has(c)); if (!id) return null; npcApi.clue(id); return CLUES[id]; },
};
function openVote(day) {
  if (!players.size) return;
  const ev = storyEvent(day, storyApi);
  if (!ev) return;
  game.vote = { day, ev, votes: new Map(), ends: now() + VOTE_LEN };
  events.push({ k: "vote" });
}
function resolveVote() {
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
const npcApi = {
  progress: (p, id) => p.st[QUESTS[id].stat] - p.q[id].base,
  accept: (p, id) => { p.q[id] = { base: p.st[QUESTS[id].stat], done: false, told: false }; toast(p, `New quest: ${QUESTS[id].title}. ${QUESTS[id].desc} [J]`, "#e0c0ff"); },
  gold: (p, n) => { if (n > 0) addGold(p, n); else p.gold = Math.max(0, p.gold + n); },
  goldAll: (n) => { for (const q of players.values()) addGold(q, n); },
  pointsAll: (n) => { for (const q of players.values()) q.pts += n; },
  clue: (id) => {
    if (game.clues.has(id)) return;
    game.clues.add(id); deed("word", 12);
    feed(`CLUE ${game.clues.size}/5: ${CLUES[id]}`, "#e0c0ff");
    events.push({ k: "clue", n: game.clues.size });
    if (game.clues.size === 4) feed("You know enough. Somebody should have a word with the Mayor.", "#ffd34d");
  },
  story: (title, text) => { game.story = { title, pick: "", text, until: now() + 14 }; events.push({ k: "vote" }); },
  mods: () => game.mods,
  name: fullName,
  deed: (k, n) => deed(k, n),
  healAll: () => { for (const q of players.values()) if (!q.dead) q.hp = maxHp(q); },
  hearth: (n) => { game.hearthMax += n; game.hearth = Math.min(game.hearthMax, game.hearth + n); },
  raw: (p) => {
    const n = NPC_POS.find((q) => q.id === "chef"); if (!n) return;
    const a = Math.atan2(p.y - n.y, p.x - n.x);
    events.push({ k: "shout", x: n.x, y: n.y, a, id: 0, r: 260, text: "IT'S RAAAW!" });
    p.vx = Math.cos(a) * 1100; p.vy = Math.sin(a) * 1100; p.dlg = null;
    hurtPlayer(p, 10, null, "shouted at by a celebrity");
  },
  crate: (p, rarity, type) => { const at = { x: p.x + rand(-30, 30), y: p.y + 40 }; collide(at, 20); crates.push({ id: nextId++, ...at, w: newWeapon(type || pick(LOOT_TYPES), rarity) }); },
  blackCase: (p) => {
    const r = Math.random() * 100 - (traitOf(p).luck ? 8 : 0);
    const rarity = r < 8 ? 4 : r < 30 ? 3 : r < 65 ? 2 : 1;
    const w = newWeapon(pick(LOOT_TYPES), rarity);
    giveWeapon(p, w); p.st.cases++;
    p.pe.push({ k: "case", type: w.type, rarity, name: wName(w) });
    if (rarity >= 3) setTimeout(() => feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${wName(w)} from Vex's coat`, rarity === 4 ? "#ff4b4b" : "#ffc030"), 3200);
  },
};
function dlgCtx(p) { return { p, f: game.flags, aff: game.aff, clues: game.clues, q: p.q, api: npcApi }; }
function openDlg(p, npc) {
  p.dlg = { npc, node: "start" };
  if (!p.talked.has(npc)) deed("word", 1.5);
  p.talked.add(npc);
  addXp(p, 1);
  sendDlg(p);
}
function sendDlg(p) {
  if (!p.dlg) { p.pe.push({ k: "dlg", close: 1 }); return; }
  const N = NPCS[p.dlg.npc], node = N.nodes[p.dlg.node], c = dlgCtx(p);
  p.dlgOpts = node.opts.filter((o) => !o.if || o.if(c));
  p.pe.push({ k: "dlg", npc: p.dlg.npc, name: N.name, role: N.role, text: node.text(c), opts: p.dlgOpts.map((o) => o.label) });
}
function pickDlg(p, i) {
  if (!p.dlg) return;
  const o = p.dlgOpts && p.dlgOpts[i];
  if (!o) { p.dlg = null; sendDlg(p); return; }
  const c = dlgCtx(p);
  const doneBefore = Object.values(p.q).filter((x) => x.done).length;
  const msg = o.do ? o.do(c) : undefined;
  deed("word", 10 * (Object.values(p.q).filter((x) => x.done).length - doneBefore));
  if (msg) toast(p, msg, "#e0c0ff");
  p.dlg = o.to ? { npc: p.dlg.npc, node: o.to } : null;
  sendDlg(p);
}
function questReady(p) {
  const out = [];
  for (const [id, st] of Object.entries(p.q)) if (!st.done && npcApi.progress(p, id) >= QUESTS[id].goal) out.push(QUESTS[id].npc);
  return out;
}

// ---------------------------------------------------------------- zone & drop (battle royale bits)
function zoneInit(cx, cy, r, stages) {
  game.zone = { cx, cy, r, fcx: cx, fcy: cy, fr: r, tcx: cx, tcy: cy, tr: r, t0: 0, t1: 0, stages: stages || [], dmg: 3 };
  if (stages && stages.length) zoneNext(now());
}
function zoneNext(t) {
  const z = game.zone, [wait, shrink, r] = z.stages.shift();
  const slack = Math.max(0, z.r - r);
  const a = rand(0, Math.PI * 2), d = rand(0, slack * 0.8);
  z.fcx = z.cx; z.fcy = z.cy; z.fr = z.r;
  z.tcx = clamp(z.cx + Math.cos(a) * d, 200, W - 200); z.tcy = clamp(z.cy + Math.sin(a) * d, 200, H - 200); z.tr = r;
  z.t0 = t + wait; z.t1 = z.t0 + shrink;
}
function zoneShrinkTo(r, secs) { // story mode: the fog closes in around the Hearth each night
  const z = game.zone, t = now();
  z.fcx = z.cx; z.fcy = z.cy; z.fr = z.r; z.tcx = z.cx; z.tcy = z.cy; z.tr = r; z.t0 = t; z.t1 = t + secs;
}
function zoneTick(t) {
  const z = game.zone; if (!z) return;
  if (t >= z.t0 && z.t1 > z.t0) {
    const k = clamp((t - z.t0) / (z.t1 - z.t0), 0, 1);
    z.cx = z.fcx + (z.tcx - z.fcx) * k; z.cy = z.fcy + (z.tcy - z.fcy) * k; z.r = z.fr + (z.tr - z.fr) * k;
    if (k >= 1 && z.stages.length) { z.dmg = Math.min(20, z.dmg * 1.7); zoneNext(t); }
  }
}
function outsideZone(e) { const z = game.zone; return z && (e.x - z.cx) ** 2 + (e.y - z.cy) ** 2 > z.r * z.r; }
function startDrop(through) {
  let a = rand(0, Math.PI * 2);
  const cx = through ? through.x : rand(700, W - 700), cy = through ? through.y : rand(500, H - 500);
  const L = 1900;
  game.drop = { x0: cx - Math.cos(a) * L, y0: cy - Math.sin(a) * L, x1: cx + Math.cos(a) * L, y1: cy + Math.sin(a) * L, t0: now(), dur: DROP_LEN };
  for (const p of players.values()) if (!p.dead) { p.air = "plane"; p.dlg = null; }
}
function dropPos(t) {
  const d = game.drop, k = clamp((t - d.t0) / d.dur, 0, 1);
  return { x: d.x0 + (d.x1 - d.x0) * k, y: d.y0 + (d.y1 - d.y0) * k, k };
}
function jump(p) {
  if (p.air !== "plane") return;
  const t = now(), pos = dropPos(t);
  p.x = clamp(pos.x, 40, W - 40); p.y = clamp(pos.y, 40, H - 40);
  p.air = "fall"; p.fallEnd = t + 2.2;
}

// ---------------------------------------------------------------- vehicles
function spawnVehicles(kinds, near) {
  for (const kind of kinds) {
    let sp = freeSpot(40);
    if (near) for (let i = 0; i < 80; i++) { const c = freeSpot(40), d = Math.hypot(c.x - near.x, c.y - near.y); if (d > 200 && d < 420) { sp = c; break; } }
    vehicles.push({ id: nextId++, kind, x: sp.x, y: sp.y, a: rand(0, Math.PI * 2), v: 0, hp: VEHICLES[kind].hp, seats: [0, 0] });
  }
}
function vehOf(p) { return p.veh ? vehicles.find((v) => v.id === p.veh) : null; }
function enterVehicle(p, v) {
  const seat = v.seats[0] ? v.seats[1] ? -1 : 1 : 0;
  if (seat < 0) return false;
  v.seats[seat] = p.id; p.veh = v.id; p.dlg = null;
  toast(p, seat === 0 ? `Driving the ${VEHICLES[v.kind].name}. WASD to drive, E to get out.` : `Riding shotgun. You can shoot. E to get out.`, "#9fe0ff");
  return true;
}
function exitVehicle(p) {
  const v = vehOf(p); p.veh = 0;
  if (!v) return;
  v.seats = v.seats.map((id) => (id === p.id ? 0 : id));
  const side = v.a + Math.PI / 2;
  p.x = v.x + Math.cos(side) * (VEHICLES[v.kind].r + 22); p.y = v.y + Math.sin(side) * (VEHICLES[v.kind].r + 22);
  collide(p, 16);
}
function wreck(v, by) {
  vehicles = vehicles.filter((q) => q !== v);
  events.push({ k: "boom", x: v.x, y: v.y, r: 130 });
  for (const z of zombies) if (dist2(z, v) < 140 * 140) hurtZombie(z, 150, by);
  for (const id of v.seats) { const p = players.get(id); if (p) { exitVehicle(p); hurtPlayer(p, 40, null, "blown up in a vehicle"); } }
  for (const p of players.values()) if (!p.dead && !p.veh && dist2(p, v) < 110 * 110) hurtPlayer(p, 35, by && by !== p ? by : null, "caught in a vehicle explosion");
  feed(`The ${VEHICLES[v.kind].name} exploded`, "#ff9d2e");
}
function hurtVehicle(v, dmg, by) { v.hp -= dmg; if (v.hp <= 0) wreck(v, by); }
function vehicleTick(t, dt) {
  for (const v of [...vehicles]) {
    const def = VEHICLES[v.kind], driver = players.get(v.seats[0]);
    if (driver && (driver.dead || driver.veh !== v.id)) v.seats[0] = 0;
    const k = driver && !driver.dead ? driver.keys : 0;
    const thr = ((k & 1) ? 1 : 0) - ((k & 4) ? 1 : 0), steer = ((k & 8) ? 1 : 0) - ((k & 2) ? 1 : 0);
    if (thr) v.v += thr * def.acc * dt * (Math.sign(thr) !== Math.sign(v.v) && Math.abs(v.v) > 20 ? 2 : 1);
    else v.v *= Math.pow(0.25, dt);
    v.v = clamp(v.v, -def.max * 0.4, def.max * (outsideZone(v) ? 0.8 : 1));
    v.a += steer * def.turn * dt * clamp(v.v / 140, -1, 1);
    const ox = v.x, oy = v.y;
    v.x += Math.cos(v.a) * v.v * dt; v.y += Math.sin(v.a) * v.v * dt;
    if (collide(v, def.r)) {
      const hitSpeed = Math.abs(v.v);
      if (hitSpeed > 90) { hurtVehicle(v, hitSpeed * 0.12, null); events.push({ k: "land", x: v.x, y: v.y }); }
      if (Math.hypot(v.x - ox, v.y - oy) < Math.abs(v.v) * dt * 0.5) v.v *= -0.25;
      if (!vehicles.includes(v)) continue;
    }
    const speed = Math.abs(v.v);
    if (speed > 80) {
      for (const z of zombies) {
        if (z.hp <= 0 || (z.rammed || 0) > t || dist2(z, v) > (def.r + z.r) ** 2) continue;
        z.rammed = t + 0.35; z.stun = t + 0.5;
        z.vx += Math.cos(v.a) * speed * 0.9; z.vy += Math.sin(v.a) * speed * 0.9;
        hurtZombie(z, speed * 0.3 * def.ram * game.mods.dmg * TEST_DMG, driver || null, "");
        if (z.type === "tank" || z.type === "elite" || z.type === "boss") { v.v *= 0.4; hurtVehicle(v, 25, null); if (!vehicles.includes(v)) break; }
      }
    }
    if (speed > 140 && vehicles.includes(v)) for (const q of players.values()) {
      if (q.dead || q.veh || q.air || (q.rammed || 0) > t || dist2(q, v) > (def.r + 16) ** 2) continue;
      q.rammed = t + 0.6; q.vx += Math.cos(v.a) * speed; q.vy += Math.sin(v.a) * speed;
      hurtPlayer(q, speed * 0.1, driver && driver !== q ? driver : null, "run over");
    }
    for (const id of v.seats) { const p = players.get(id); if (p && p.veh === v.id) { p.x = v.x; p.y = v.y; } }
  }
}

// ---------------------------------------------------------------- base building
function rectHitsCircle(b, c, r) { const cx = clamp(c.x, b.x, b.x + b.w), cy = clamp(c.y, b.y, b.y + b.h); return (c.x - cx) ** 2 + (c.y - cy) ** 2 < r * r; }
function placePiece(p, kind, x, y, free) {
  const def = PIECES[kind];
  if (!def) return false;
  const fail = (msg) => { if (p) toast(p, msg, "#f88"); return false; };
  x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID;
  const b = { id: nextId++, kind: "built", bk: kind, x, y, w: GRID, h: GRID, hp: def.hp, maxHp: def.hp, owner: p ? p.id : 0, uses: def.uses || 0, nextShot: 0, a: 0 };
  const mid = { x: x + GRID / 2, y: y + GRID / 2 };
  if (x < 40 || y < 40 || x + GRID > W - 40 || y + GRID > H - 40) return fail("Can't build at the edge of the world.");
  if (p && !free) {
    if (builds.filter((q) => q.owner === p.id).length >= 25) return fail("You've built enough. 25 pieces max.");
    if (dist2(mid, p) > 280 * 280) return fail("Too far away to build there.");
    if (p.gold < price(p, def.cost)) return fail(`${def.name} costs ${price(p, def.cost)}g`);
  }
  const hit = (o) => x < o.x + o.w && x + GRID > o.x && y < o.y + o.h && y + GRID > o.y;
  if (WALLS.some(hit) || builds.some(hit)) return fail("Something's already there.");
  if (PLOTS.some((pl) => rectHitsCircle(b, pl, 30))) return fail("Not on the crops!");
  if (game.mode === "story" && NPC_POS.some((n) => rectHitsCircle(b, n, 22))) return fail("Somebody is standing there.");
  if (rectHitsCircle(b, WELL, 30)) return fail("Not on the well.");
  if (def.solid) {
    if ([...players.values()].some((q) => !q.dead && !q.air && rectHitsCircle(b, q, 16))) return fail("Someone's in the way.");
    if (zombies.some((z) => rectHitsCircle(b, z, z.r)) || vehicles.some((v) => rectHitsCircle(b, v, VEHICLES[v.kind].r))) return fail("Something's in the way.");
  }
  if (p && !free) { const cost = price(p, def.cost); p.gold -= cost; deed("soil", 3); deed("coin", cost / 50); }
  builds.push(b);
  if (def.solid) WALLS.push(b);
  if (p) { p.st.built = (p.st.built || 0) + 1; events.push({ k: "built", x: mid.x, y: mid.y }); }
  return true;
}
function breakPiece(b) {
  builds = builds.filter((q) => q !== b);
  WALLS = WALLS.filter((q) => q !== b);
  events.push({ k: "land", x: b.x + GRID / 2, y: b.y + GRID / 2 });
}
function hurtPiece(b, dmg) { b.hp -= dmg; events.push({ k: "bhit", id: b.id }); if (b.hp <= 0) breakPiece(b); }
function buildTick(t) {
  for (const b of [...builds]) {
    const mid = { x: b.x + GRID / 2, y: b.y + GRID / 2 }, owner = players.get(b.owner) || null;
    if (b.bk === "spikes") {
      for (const z of zombies) if (z.hp > 0 && !z.burn && (z.spiked || 0) < t && rectHitsCircle(b, z, z.r * 0.8)) { z.spiked = t + 0.6; z.stun = Math.max(z.stun, t + 0.25); hurtZombie(z, 30 * game.mods.dmg, owner); b.uses--; }
      if (game.mode === "royale") for (const q of players.values()) if (q !== owner && !q.dead && !q.air && !q.veh && (q.spiked || 0) < t && rectHitsCircle(b, q, 12)) { q.spiked = t + 0.8; hurtPlayer(q, 15, owner, "spiked"); b.uses--; }
      if (b.uses <= 0) breakPiece(b);
    } else if (b.bk === "turret" && t >= b.nextShot) {
      const def = PIECES.turret;
      let best = null, bd = def.range * def.range;
      const blocked = (e) => { const dx = e.x - mid.x, dy = e.y - mid.y, d = Math.hypot(dx, dy) || 1; for (const w of WALLS) if (w !== b && rayRect(mid.x, mid.y, dx / d, dy / d, w) < d - 20) return true; return false; };
      for (const z of zombies) { const d = dist2(z, mid); if (z.hp > 0 && !z.burn && d < bd && !blocked(z)) { bd = d; best = z; } }
      if (game.mode === "royale") for (const q of players.values()) { const d = dist2(q, mid); if (q !== owner && !q.dead && !q.air && d < bd && !blocked(q)) { bd = d; best = q; } }
      if (best) {
        b.a = Math.atan2(best.y - mid.y, best.x - mid.x); b.nextShot = t + 1 / def.rate;
        const sx = mid.x + Math.cos(b.a) * 22, sy = mid.y + Math.sin(b.a) * 22;
        events.push({ k: "tr", x1: sx, y1: sy, x2: best.x, y2: best.y, c: "smg", m: 0 });
        if (best.type) hurtZombie(best, def.dmg * game.mods.dmg * TEST_DMG, owner); else hurtPlayer(best, def.dmg * 0.6, owner, "shot by a turret");
      }
    }
  }
}

// ---------------------------------------------------------------- royale
function setupRoyale() {
  game.night = 0; game.ends = Infinity; game.result = null; game.ending = null;
  game.flags = { valley: VALLEY }; game.mods = freshMods(); game.vote = null; game.story = null; game.bossId = 0;
  game.hearthMax = game.hearth = 1e9;
  zombies = []; crates = [];
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) { resetProgress(p); resetLoadout(p, true); p.weapons = [newWeapon("pistol")]; p.active = 0; p.gold = 0; }
  const n = 18 + 5 * players.size;
  for (let i = 0; i < n; i++) crates.push({ id: nextId++, ...freeSpot(), w: newWeapon(pick(LOOT_TYPES), lootRarity(2)) });
  for (let i = 0; i < 12; i++) crates.push({ id: nextId++, ...freeSpot(), w: newWeapon("pistol", lootRarity(1)) });
  spawnVehicles(["tractor", "buggy", "buggy", ...Array(Math.floor(players.size / 2)).fill("buggy")]);
}
function endRoyale() {
  game.phase = "over"; game.result = "royale";
  for (const z of zombies) z.burn = true;
  const winner = [...players.values()].find((p) => !p.out);
  if (winner) winner.place = 1;
  game.prev = winner ? `Last time, ${fullName(winner)} won the Royale in ${VALLEY}.` : `Last time, nobody survived the Royale in ${VALLEY}.`;
  for (const p of players.values()) p.ready = false;
  game.ending = [winner ? `${fullName(winner)} is the last farmer standing in ${VALLEY}.` : `Nobody survived ${VALLEY}. The fog wins.`];
  const rows = [...players.values()].map((p) => {
    const s = p.st, acc = s.shots ? s.hits / s.shots : 0, n = players.size;
    const r = clamp(10 - (p.place - 1) * (6 / Math.max(1, n - 1)) + s.pk * 0.3 + (acc - 0.35), 3, 10);
    return { name: fullName(p), cls: CLASSES[p.cls].name, color: p.color, ...s, place: p.place || n, acc: Math.round(acc * 100), lvl: p.lvl, dmg: Math.round(s.dmg), rating: Math.round(r * 10) / 10, lineage: [fullName(p)], winner: p === winner, id: p.id };
  }).sort((a, b) => a.place - b.place);
  game.stats = rows;
  events.push({ k: "over" });
}

// ---------------------------------------------------------------- phases
// launched from the lobby once everyone is ready: build the world, play the opening, then drop everyone in
function startGame() {
  generateMap((Math.random() * 1e9) | 0);
  vehicles = []; builds = []; game.zone = null; game.drop = null; game.countdown = 0; game.skip = new Set(); game.pendingVote = null;
  game.deeds = freshDeeds(); game.legend = null;
  if (game.mode === "story") placeNpcs();
  broadcastRaw(JSON.stringify(mapMsg()));
  if (game.mode === "royale") setupRoyale(); else setupStory();
  for (const p of players.values()) { p.air = "wait"; p.ready = false; p.dlg = null; }
  game.phase = "intro"; game.introT0 = now(); game.introEnds = now() + INTRO_LEN[game.mode];
  game.cast = [...players.values()].map((p) => [fullName(p), CLASSES[p.cls].name, p.color]);
}
function beginPlay() {
  game.phase = game.mode === "royale" ? "royale" : "day";
  for (const p of players.values()) if (p.air === "wait") p.air = null;
  if (game.mode === "royale") {
    zoneInit(W / 2, H / 2, 1700, ROYALE_ZONES.map((z) => [...z]));
    startDrop(null);
    events.push({ k: "banner", text: `SLOP ROYALE: ${VALLEY.toUpperCase()}`, sub: "Jump with SPACE. Loot up. Build [C]. Steal a ride [E]. Last farmer standing wins." });
    return;
  }
  game.ends = now() + DAY_LEN;
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  zoneInit(hc.x, hc.y, STORY_ZONE_R[0]);
  startDrop(hc);
  events.push({ k: "banner", text: `WELCOME TO ${VALLEY.toUpperCase()}`, sub: "SPACE to jump. Talk to the townsfolk [E]. Build defences [C]. Night is coming." });
  if (game.cameoDay === 1) cameoArrive();
  openVote(1);
}
function setupStory() {
  game.aff = Object.fromEntries(Object.keys(NPCS).map((k) => [k, 0])); game.clues = new Set();
  game.night = 0; game.ends = Infinity; game.result = null; game.ending = null;
  game.flags = { valley: VALLEY }; game.mods = freshMods(); game.vote = null; game.story = null; game.bossId = 0;
  const n = Math.max(1, players.size);
  game.hearthMax = game.hearth = 800 + 250 * n;
  zombies = []; crates = [];
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) { resetProgress(p); resetLoadout(p, true); }
  spawnCrates();
  spawnVehicles(["tractor"], { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
  spawnVehicles(["buggy"]);
  game.cameoDay = process.env.SLOP_CAMEO ? +process.env.SLOP_CAMEO : pick([2, 4]); // never on the day of the Reckoning
}
// a celebrity turns up for one day of the story, then leaves at nightfall
function cameoArrive() {
  const sp = freeSpot(40), hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let at = sp;
  for (let i = 0; i < 40; i++) { const c = freeSpot(40); const d = Math.hypot(c.x - hc.x, c.y - hc.y); if (d > 250 && d < 520 && !NPC_POS.some((n) => dist2(n, c) < 160 * 160)) { at = c; break; } }
  NPC_POS.push({ id: "chef", x: at.x, y: at.y });
  broadcastRaw(JSON.stringify(mapMsg()));
  events.push({ k: "banner", text: "CELEBRITY SIGHTING!", sub: "A famous chef has rolled into the valley in a pink limo. He's only here until nightfall [E]." });
  feed("Gordon Rampage is filming in the valley today. Nobody invited him.", "#ff9ad0");
}
function cameoLeave() {
  if (!NPC_POS.some((n) => n.id === "chef")) return;
  NPC_POS = NPC_POS.filter((n) => n.id !== "chef");
  for (const p of players.values()) { if (p.dlg && p.dlg.npc === "chef") { p.dlg = null; sendDlg(p); } if (p.q.chef_raw && !p.q.chef_raw.done) { delete p.q.chef_raw; toast(p, "Gordon Rampage has left. Your Kitchen Nightmare quest went with him.", "#f88"); } }
  broadcastRaw(JSON.stringify(mapMsg()));
  feed("Gordon Rampage's limo roars off into the night. \"You've all been SHUT DOWN!\"", "#ff9ad0");
}
function lootRarity(bonus = 0) {
  const r = Math.random() * 100;
  return r < 0.5 + bonus * 0.3 ? 4 : r < 6 + bonus * 2 ? 3 : r < 22 + bonus * 3 ? 2 : r < 55 ? 1 : 0;
}
function spawnCrates() {
  const n = 3 + players.size;
  for (let i = 0; i < n; i++) crates.push({ id: nextId++, ...freeSpot(), w: newWeapon(pick(LOOT_TYPES), lootRarity(game.night)) });
}
function startNight() {
  if (game.vote) resolveVote();
  cameoLeave();
  game.night++;
  game.phase = "night";
  const n = Math.max(1, players.size);
  game.spawnLeft = Math.round((10 + 8 * game.night) * (0.6 + 0.4 * n) * game.mods.zCount * game.mods.nightCut);
  game.mods.nightCut = 1;
  game.spawnNext = now() + 2;
  zoneShrinkTo(STORY_ZONE_R[game.night], 25);
  events.push({ k: "feed", text: "The slop fog is closing in. Stay near the Hearth.", color: "#c080ff" });
  if (game.night === LAST_NIGHT) {
    game.ends = Infinity;
    game.bossKind = bossKind(game.flags);
    const B = BOSSES[game.bossKind];
    const b = spawnZombie("boss");
    b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * B.hp * game.mods.bossHp * (0.5 + 0.5 * n));
    game.bossId = b.id;
    events.push({ k: "banner", text: `CONTRACT: ${B.name}`, sub: "Slay it to save the valley. Reward: 150g each." });
  } else {
    game.ends = now() + NIGHT_LEN;
    events.push({ k: "banner", text: `NIGHT ${game.night}`, sub: game.night === 1 ? "Protect the Hearth. Don't shoot your friends (much)." : "They're getting hungrier." });
  }
}
function startDay() {
  game.phase = "day"; game.ends = now() + DAY_LEN;
  for (const p of players.values()) p.talked.clear();
  for (const z of zombies) if (z.type !== "elite") z.burn = true;
  spawnCrates();
  events.push({ k: "banner", text: `DAY ${game.night + 1}`, sub: `The sun burns the dead. ${LAST_NIGHT - game.night} night${LAST_NIGHT - game.night === 1 ? "" : "s"} left. Shop open [B].` });
  if (game.mode === "story" && game.night + 1 === game.cameoDay) cameoArrive();
  if (game.night === 2) { // the Reckoning: the valley decides what you are, then the day's vote follows
    game.legend = legendOf(game.deeds);
    const r = reckoning(game.legend, storyApi);
    game.story = { title: r.title, pick: game.legend ? legendName(game.legend, VALLEY) : "Nobody special", text: r.text, until: now() + 12 };
    feed(`The valley has decided: you are ${legendName(game.legend, VALLEY)}.`, game.legend ? LEGENDS[game.legend].color : "#ccc");
    events.push({ k: "legend", kind: game.legend });
    game.pendingVote = { day: 3, at: now() + 12 };
  } else openVote(game.night + 1);
}
function endGame(win) {
  game.phase = "over"; game.result = win ? "win" : "lose"; game.vote = null;
  for (const z of zombies) z.burn = true;
  game.flags.clueCount = game.clues.size;
  const lg = legendOf(game.deeds);
  game.ending = [...ending(win, game.flags, game.night), ...legendLines(win, lg, game.legend, game.flags, VALLEY, game.deeds), ...(win ? npcLines(game.flags, game.aff) : [])];
  game.prev = win ? `Last time, ${legendName(lg, VALLEY)} saved their valley.` : `Last time, ${VALLEY} fell on night ${game.night}.`;
  for (const p of players.values()) p.ready = false;
  const rows = [...players.values()].map((p) => {
    const s = p.st;
    const acc = s.shots ? s.hits / s.shots : 0;
    const r = clamp(6 + s.kills * 0.04 + s.crops * 0.2 + s.dmg / 3000 - s.deaths * 0.35 - s.tk * 0.5 + (win ? 0.5 : 0) + s.bounty / 400 + (acc - 0.35) * 2 + s.hs * 0.01 + s.perfect * 0.05, 3, 10);
    return { name: fullName(p), cls: CLASSES[p.cls].name, color: p.color, ...s, acc: Math.round(acc * 100), lvl: p.lvl, dmg: Math.round(s.dmg), rating: Math.round(r * 10) / 10, lineage: [...p.lineage, fullName(p)] };
  }).sort((a, b) => b.rating - a.rating);
  game.stats = rows;
  events.push({ k: "over" });
}
function spawnZombie(type, at) {
  const def = ZTYPES[type];
  let x, y;
  if (at) { x = at.x + rand(-40, 40); y = at.y + rand(-40, 40); }
  else {
    const side = (Math.random() * 4) | 0;
    x = side === 0 ? 20 : side === 1 ? W - 20 : rand(20, W - 20);
    y = side === 2 ? 20 : side === 3 ? H - 20 : rand(20, H - 20);
  }
  const hpScale = (1 + 0.15 * Math.max(0, game.night - 1)) * game.mods.zHp;
  const z = { id: nextId++, type, x, y, r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale, vx: 0, vy: 0, stun: 0, atk: 0, steer: 0, burn: false, special: now() + 6, charge: 0, arson: type !== "boss" && type !== "elite" && Math.random() < 0.35 };
  zombies.push(z);
  return z;
}

// ---------------------------------------------------------------- tick
let lastT = now();
let tickN = 0;
function tick() {
  const t = now();
  const dt = Math.min(0.1, t - lastT);
  lastT = t;
  tickN++;

  // lobby: the game starts once everyone is ready
  if (game.phase === "lobby" || game.phase === "over") {
    const all = players.size > 0 && [...players.values()].every((p) => p.ready);
    if (!all) game.countdown = 0;
    else if (!game.countdown) { game.countdown = t + COUNTDOWN; events.push({ k: "cd" }); }
    else if (t >= game.countdown) startGame();
  }
  if (game.phase === "intro" && (t >= game.introEnds || (players.size && [...players.keys()].every((id) => game.skip.has(id))))) beginPlay();
  if (game.pendingVote && t >= game.pendingVote.at) { const d = game.pendingVote.day; game.pendingVote = null; if (game.phase === "day") openVote(d); }
  // phase clock + votes
  if (game.phase === "day" && t > game.ends) startNight();
  else if (game.phase === "night" && t > game.ends) startDay();
  if (game.vote && (t > game.vote.ends || (players.size && [...players.keys()].every((id) => game.vote.votes.has(id))))) resolveVote();
  if (game.story && t > game.story.until) game.story = null;
  zoneTick(t);
  if (game.phase === "royale") {
    const target = 10 + 3 * players.size;
    if (zombies.length < target && Math.random() < dt * 1.5) {
      const z = spawnZombie(Math.random() < 0.1 ? "tank" : Math.random() < 0.35 ? "runner" : "walker");
      const sp = freeSpot(30); z.x = sp.x; z.y = sp.y; z.arson = false;
      if ([...players.values()].some((p) => !p.dead && dist2(p, z) < 500 * 500)) z.hp = 0;
    }
    const left = [...players.values()].filter((p) => !p.out);
    if ((players.size > 1 && left.length <= 1) || left.length === 0) endRoyale();
  }
  if (tickN % 30 === 0) for (const p of players.values()) for (const [id, qs] of Object.entries(p.q)) {
    if (!qs.done && !qs.told && npcApi.progress(p, id) >= QUESTS[id].goal) { qs.told = true; toast(p, `Quest complete: ${QUESTS[id].title}. Go and see ${NPCS[QUESTS[id].npc].name}.`, "#e0c0ff"); }
  }
  if (game.phase === "night" && game.spawnLeft > 0 && t > game.spawnNext) {
    const r = Math.random();
    const type = game.night >= 3 && r < 0.12 ? "tank" : game.night >= 2 && r < 0.4 ? "runner" : "walker";
    spawnZombie(type);
    game.spawnLeft--;
    const len = game.night === LAST_NIGHT ? 50 : NIGHT_LEN * 0.8;
    game.spawnNext = t + len / Math.max(10, game.spawnLeft + 10) * 0.9;
    if (game.night === LAST_NIGHT && game.spawnLeft === 0) game.spawnLeft = 12; // endless trickle while the boss lives
  }
  if ((game.phase === "day" || game.phase === "night") && game.mods.hearthRegen) game.hearth = Math.min(game.hearthMax, game.hearth + game.mods.hearthRegen * dt);

  const playing = game.phase === "day" || game.phase === "night" || game.phase === "royale";
  if (playing) { vehicleTick(t, dt); buildTick(t); }

  // players
  const alive = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of players.values()) {
    if (p.dead) { if (game.phase !== "over" && game.phase !== "intro" && !p.out && game.mode !== "royale" && t > p.respawnAt) respawnHeir(p); continue; }
    if (p.air === "wait") continue;
    if (p.air === "plane") {
      const pos = dropPos(t); p.x = pos.x; p.y = pos.y;
      if (pos.k >= 0.97) jump(p);
      continue;
    }
    if (p.air === "fall") {
      let fx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), fy = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
      if (fx && fy) { fx *= Math.SQRT1_2; fy *= Math.SQRT1_2; }
      p.x = clamp(p.x + fx * 420 * dt, 30, W - 30); p.y = clamp(p.y + fy * 420 * dt, 30, H - 30);
      if (t > p.fallEnd) { p.air = null; collide(p, 16); events.push({ k: "land", x: p.x, y: p.y }); }
      continue;
    }
    if (outsideZone(p) && (game.phase === "night" || game.phase === "royale" || game.phase === "day")) {
      p.hp -= (game.mode === "royale" ? game.zone.dmg : 6) * dt; p.lastHurt = t;
      if (tickN % 15 === 0) p.pe.push({ k: "fog" });
      if (p.hp <= 0) killPlayer(p, null, "lost in the slop fog");
      if (p.dead) continue;
    }
    if (p.dlg) { const n = NPC_POS.find((q) => q.id === p.dlg.npc); if (!n || dist2(n, p) > 150 * 150) { p.dlg = null; sendDlg(p); } }
    const veh = vehOf(p);
    if (p.veh && !veh) p.veh = 0;
    if (!veh) {
      let mx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), my = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
      if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
      const sp = speedOf(p);
      if (t < p.dashUntil) { mx = p.dashDx * 3.1; my = p.dashDy * 3.1; }
      p.x += (mx * sp + p.vx) * dt; p.y += (my * sp + p.vy) * dt;
      p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt);
      collide(p, 16);
    }
    p.heat = Math.max(0, p.heat - 1.6 * dt);
    const mh = maxHp(p);
    if (sk(p, "wind") && t - p.lastHurt > 3) p.hp = Math.min(mh, p.hp + 1.5 * sk(p, "wind") * dt);
    if (sk(p, "rally")) for (const q of alive) if (q !== p && dist2(q, p) < 220 * 220) q.hp = Math.min(maxHp(q), q.hp + 0.8 * sk(p, "rally") * dt);
    if (p.hp > mh) p.hp = mh;
    const w = p.weapons[p.active];
    w.bloom = Math.max(0, w.bloom - dt * 2.2);
    if (w.reloadUntil && t >= w.reloadUntil) { w.reloadUntil = 0; w.ammo = WEAPONS[w.type].mag; }
    if (p.firing && !p.dlg && !(veh && veh.seats[0] === p.id) && (playing || game.phase === "lobby") && !w.reloadUntil && t >= w.nextShot) {
      if (w.ammo > 0) shoot(p, w);
      else startReload(p, w);
    }
  }

  // plots
  for (const pl of PLOTS) {
    if (pl.stage === 0 || pl.stage === 3) continue;
    pl.prog += dt * pl.rate / 13;
    if (pl.prog >= 1) { pl.prog = 0; pl.stage++; }
  }

  // zombies
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  const B = BOSSES[game.bossKind];
  for (const z of zombies) {
    const def = ZTYPES[z.type];
    if (z.burn) { z.hp -= z.maxHp * 0.35 * dt; if (Math.random() < dt * 3) events.push({ k: "burn", x: z.x, y: z.y }); continue; }
    // 'arson' zombies beeline for the Hearth and only get distracted by players right next to them
    let target = null, bd = (z.type === "boss" || z.type === "elite" ? 700 : z.arson ? 110 : 420) ** 2;
    for (const p of alive) { const d = dist2(p, z); if (d < bd) { bd = d; target = p; } }
    if (!target && game.mode === "royale") { if (!z.wander || dist2(z, z.wander) < 900 || Math.random() < dt * 0.1) z.wander = freeSpot(20); }
    const goal = target || (game.mode === "royale" ? z.wander : hc);
    let dx = goal.x - z.x, dy = goal.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (z.steer) { const c = Math.cos(z.steer), s = Math.sin(z.steer); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
    let sp = (z.type === "boss" ? B.speed : def.speed) * (z.type === "runner" ? 1 : 1 + 0.03 * game.night);
    if ((z.type === "boss" || z.type === "elite") && t < z.charge) sp = 380;
    if (t < z.stun) sp = 0;
    const ox = z.x, oy = z.y;
    z.x += (dx * sp + z.vx) * dt; z.y += (dy * sp + z.vy) * dt;
    z.vx *= Math.pow(0.03, dt); z.vy *= Math.pow(0.03, dt);
    const touchingHearth = game.mode !== "royale" && z.x + z.r > HEARTH.x - 4 && z.x - z.r < HEARTH.x + HEARTH.w + 4 && z.y + z.r > HEARTH.y - 4 && z.y - z.r < HEARTH.y + HEARTH.h + 4;
    if (collide(z, z.r) && !touchingHearth) {
      const moved = Math.hypot(z.x - ox, z.y - oy);
      if (moved < sp * dt * 0.4) z.steer = z.steer ? z.steer : (Math.random() < 0.5 ? 1.2 : -1.2);
    } else if (z.steer && Math.random() < dt * 0.8) z.steer = 0;
    if (t > z.atk && builds.length && !(target && Math.sqrt(bd) < z.r + 20)) {
      const piece = builds.find((b) => PIECES[b.bk].solid && rectHitsCircle(b, z, z.r + 6));
      if (piece) { hurtPiece(piece, def.dmg * (z.type === "boss" ? 3 : 1)); z.atk = t + 0.8; }
    }
    if (t > z.atk) {
      if (target && Math.sqrt(bd) < z.r + 20) { hurtPlayer(target, def.dmg, null, z.type === "boss" ? `folded by ${B.name.toLowerCase().replace("the ", "the ")}` : "eaten"); z.atk = t + 0.8; }
      else if (!target && touchingHearth && game.phase !== "over") { game.hearth -= def.dmg * (z.type === "boss" ? 1.5 : 0.6); z.atk = t + 0.8; events.push({ k: "hhit" }); }
    }
    for (const pl of PLOTS) if (pl.stage > 0 && (pl.x - z.x) ** 2 + (pl.y - z.y) ** 2 < 22 * 22) { pl.stage = 0; pl.prog = 0; events.push({ k: "trample", x: pl.x, y: pl.y }); }
    if ((z.type === "boss" || z.type === "elite") && t > z.special && game.phase !== "over") {
      z.special = t + (z.type === "elite" ? 5 : B.summon);
      const charge = game.bossKind === "golem" && z.type === "boss" ? Math.random() < 0.75 : Math.random() < 0.5;
      if (charge && target) { z.charge = t + 0.7; events.push({ k: "roar", x: z.x, y: z.y }); }
      else {
        const kind = z.type === "elite" || game.bossKind === "drowned" ? "runner" : Math.random() < 0.3 ? "runner" : "walker";
        for (let i = 0; i < 3 + players.size; i++) spawnZombie(kind, z);
        events.push({ k: "roar", x: z.x, y: z.y });
      }
    }
  }
  // separation
  for (let i = 0; i < zombies.length; i++) for (let j = i + 1; j < zombies.length; j++) {
    const a = zombies[i], b = zombies[j];
    const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
  }
  const bossWasAlive = zombies.some((z) => z.id === game.bossId);
  zombies = zombies.filter((z) => z.hp > 0);
  if (game.phase === "night" && game.night === LAST_NIGHT && bossWasAlive && !zombies.some((z) => z.id === game.bossId)) endGame(true);
  if ((game.phase === "night" || game.phase === "day") && game.hearth <= 0) { game.hearth = 0; endGame(false); }

  if (tickN % SNAP_EVERY === 0) broadcast();
}

function snapshot() {
  const r = Math.round, t = now();
  const v = game.vote;
  return {
    t: "s",
    g: { mode: game.mode, cd: game.countdown ? Math.max(0, +(game.countdown - t).toFixed(1)) : -1, prev: game.prev,
      intro: game.phase === "intro" ? { at: +(t - game.introT0).toFixed(2), len: INTRO_LEN[game.mode], skip: game.skip.size, cast: game.cast } : null,
      deeds: game.mode === "story" ? Object.fromEntries(Object.keys(LEGENDS).map((k) => [k, Math.round(game.deeds[k])])) : null, legend: game.legend, now: game.mode === "story" ? legendOf(game.deeds) : null,
      alive: [...players.values()].filter((p) => !p.out && !p.dead).length,
      zone: game.zone ? [r(game.zone.cx), r(game.zone.cy), r(game.zone.r), r(game.zone.tcx), r(game.zone.tcy), r(game.zone.tr), game.zone.t0 > t ? r(game.zone.t0 - t) : -1] : null,
      drop: game.drop && t - game.drop.t0 < game.drop.dur + 3 ? [r(game.drop.x0), r(game.drop.y0), r(game.drop.x1), r(game.drop.y1), +dropPos(t).k.toFixed(3)] : null,
      clues: [...game.clues].map((c) => CLUES[c]),
      ph: game.phase, n: game.night, left: game.ends === Infinity ? -1 : Math.max(0, r(game.ends - t)), hh: r(game.hearth), hm: game.hearthMax, res: game.result, boss: game.bossId, bk: game.bossKind, valley: VALLEY },
    vote: v ? { title: v.ev.title, text: v.ev.text, ch: v.ev.choices.map((c) => [c.label, c.desc]), votes: Object.fromEntries(v.votes), left: Math.max(0, r(v.ends - t)) } : null,
    story: game.story ? { title: game.story.title, pick: game.story.pick, text: game.story.text } : null,
    p: [...players.values()].map((p) => {
      const w = p.weapons[p.active];
      return {
        id: p.id, n: fullName(p), x: r(p.x), y: r(p.y), a: +p.a.toFixed(2), hp: r(p.hp), mh: maxHp(p), ar: r(p.armor),
        c: p.color, h: p.hat, ey: p.eyes, cl: p.cls, bg: p.bg, d: p.dead ? 1 : 0, g: p.gold, sd: p.seeds, st: Math.min(5, Math.floor(p.heat / 40)),
        w: w.type, wn: wName(w), wr: w.rarity, we: w.enh, am: w.ammo, hot: w.hot ? 1 : 0, sec: p.weapons.length > 1 ? 1 : 0,
        rl: w.reloadUntil ? +(w.reloadUntil - t).toFixed(2) : 0, rt: w.reloadUntil ? +(w.reloadUntil - w.reloadStart).toFixed(2) : 0, rtr: w.tried ? 1 : 0,
        spr: +spreadOf(p, w).toFixed(3), sc: Math.max(0, +(p.shoutCd - t).toFixed(1)), sp: r(speedOf(p)), tr: p.trait, gen: p.gen,
        lv: p.lvl, xp: p.xp, xn: xpNeed(p.lvl), pts: p.pts, sk: p.sk, ch: p.champion ? 1 : 0,
        air: p.air === "plane" || p.air === "wait" ? 1 : p.air === "fall" ? 2 : 0, rd: p.ready ? 1 : 0, vh: p.veh || 0, out: p.out ? 1 : 0, pk: p.st.pk,
        nt: [...p.talked], qr: questReady(p), q: Object.entries(p.q).map(([id, qs]) => [QUESTS[id].title, QUESTS[id].desc, Math.min(QUESTS[id].goal, npcApi.progress(p, id)), QUESTS[id].goal, qs.done ? 1 : 0, NPCS[QUESTS[id].npc].name]),
        k: p.st.kills, de: p.st.deaths, cr: p.st.crops, tk: p.st.tk, hs: p.st.hs, acc: p.st.shots ? Math.round(p.st.hits / p.st.shots * 100) : 0,
      };
    }),
    z: zombies.map((z) => [z.id, z.type[0], r(z.x), r(z.y), r((z.hp / z.maxHp) * 100), z.burn ? 1 : 0]),
    pl: PLOTS.map((p) => p.stage),
    cr: crates.map((c) => [c.id, r(c.x), r(c.y), c.w.rarity, c.grave ? 1 : 0]),
    vh: vehicles.map((v) => [v.id, v.kind, r(v.x), r(v.y), +v.a.toFixed(2), r((v.hp / VEHICLES[v.kind].hp) * 100), v.seats[0], v.seats[1], r(v.v)]),
    b: builds.map((b) => [b.id, b.bk, b.x, b.y, r((b.hp / b.maxHp) * 100), +b.a.toFixed(2), b.owner]),
    e: events,
    stats: game.phase === "over" ? game.stats : undefined,
    ending: game.phase === "over" ? game.ending : undefined,
  };
}
function broadcastRaw(s) {
  for (const p of players.values()) { try { p.ws.send(s); } catch {} }
  for (const ws of spectators) { try { ws.send(s); } catch {} }
}
function broadcast() {
  const base = JSON.stringify(snapshot()).slice(1);
  events = [];
  for (const p of players.values()) {
    try { p.ws.send(`{"me":${p.id},"pe":${JSON.stringify(p.pe)},${base}`); } catch {}
    p.pe = [];
  }
  for (const ws of spectators) { try { ws.send(`{"me":0,"pe":[],${base}`); } catch {} }
}

// ---------------------------------------------------------------- network
const spectators = new Set();
function hostId() { return players.size ? Math.min(...players.keys()) : 0; }

function onMessage(ws, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  const p = ws.data.pid ? players.get(ws.data.pid) : null;
  if (m.t === "join" && !p) {
    const np = makePlayer(ws, m);
    ws.data.pid = np.id;
    spectators.delete(ws);
    players.set(np.id, np);
    if (game.phase === "day" || game.phase === "night") { game.hearthMax += 250; game.hearth += 250; }
    if (game.phase === "royale") { np.dead = true; np.out = true; np.place = 99; toast(np, "A Royale is in progress. You're spectating until the next round.", "#ffd34d"); }
    if (game.phase === "intro") np.air = "wait";
    feed(`Sul sul! ${fullName(np)} the ${BACKGROUNDS[np.bg].name} ${CLASSES[np.cls].name} joined`, "#8f8");
    return;
  }
  if (!p) return;
  switch (m.t) {
    case "in":
      p.keys = m.k | 0; p.a = +m.a || 0; p.firing = !!m.f && !p.dead;
      break;
    case "reload": { const w = p.weapons[p.active]; if (w.reloadUntil) tryActiveReload(p, w); else startReload(p, w); break; }
    case "swap": if (p.weapons.length > 1) { p.active = m.i === 0 || m.i === 1 ? Math.min(m.i, p.weapons.length - 1) : 1 - p.active; } break;
    case "use": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else if (!p.dead) interact(p); break;
    case "skip": if (game.phase === "intro") game.skip.add(p.id); break;
    case "ready": if (game.phase === "lobby" || game.phase === "over") { p.ready = m.v === undefined ? !p.ready : !!m.v; feed(`${fullName(p)} is ${p.ready ? "ready" : "not ready"}`, p.ready ? "#8f8" : "#aaa"); } break;
    case "build": if (["day", "night", "royale"].includes(game.phase) && !p.dead && !p.air && !p.veh) placePiece(p, String(m.kind), +m.x || 0, +m.y || 0, false); break;
    case "dlg": pickDlg(p, m.i | 0); break;
    case "mode": if (p.id === hostId() && game.phase !== "day" && game.phase !== "night" && game.phase !== "royale" && (m.m === "story" || m.m === "royale")) { game.mode = m.m; broadcastRaw(JSON.stringify(mapMsg())); } break;
    case "shout": doShout(p); break;
    case "dodge": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else doDodge(p); break;
    case "buy": buy(p, m.item); break;
    case "learn": learn(p, String(m.s)); break;
    case "vote": if (game.vote && Number.isInteger(m.i) && m.i >= 0 && m.i < game.vote.ev.choices.length) game.vote.votes.set(p.id, m.i); break;
    case "chat": { const text = String(m.text || "").slice(0, 120).trim(); if (text) chat(fullName(p), text, p.color), events.push({ k: "say", id: p.id, text }); break; }
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") return srv.upgrade(req, { data: { pid: 0 } }) ? undefined : new Response("Upgrade failed", { status: 400 });
    if (url.pathname === "/game.js") return new Response(gameJs, { headers: { "content-type": "application/javascript; charset=utf-8" } });
    if (url.pathname === "/") return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      spectators.add(ws);
      ws.send(JSON.stringify({ t: "hello", shop: SHOP, enhCost: ENH_COST, enhChance: ENH_CHANCE, pieces: PIECES, vehicles: VEHICLES, legends: LEGENDS }));
      ws.send(JSON.stringify(mapMsg()));
    },
    message: onMessage,
    close(ws) {
      spectators.delete(ws);
      const p = players.get(ws.data.pid);
      if (p) { if (p.veh) exitVehicle(p); players.delete(p.id); feed(`${fullName(p)} left the valley`, "#aaa"); if (game.vote) game.vote.votes.delete(p.id); }
      if (players.size === 0 && game.phase !== "lobby") { game.phase = "lobby"; zombies = []; crates = []; vehicles = []; builds = []; WALLS = WALLS.filter((w) => w.kind !== "built"); game.vote = null; game.zone = null; game.drop = null; game.pendingVote = null; }
    },
  },
});

setInterval(tick, 1000 / TICK_RATE);

const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(`
  ==============================================
     SLOP VALLEY server running on port ${server.port}
  ==============================================
   You (host):      http://localhost:${server.port}
${lan.map((ip) => `   Same Wi-Fi/LAN:  http://${ip}:${server.port}`).join("\n")}
   Friends online:  http://<your public IP>:${server.port}
                    (forward TCP port ${server.port} on your router to this PC)
   Close this window to stop the server.
`);
fetch("https://api.ipify.org").then((r) => r.text()).then((ip) => {
  if (/^[\d.]+$/.test(ip)) console.log(`   Your public IP looks like ${ip}  ->  send friends http://${ip}:${server.port}\n`);
}).catch(() => {});
