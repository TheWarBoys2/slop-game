// SLOP VALLEY — game server. Run with `bun server.js [port]`.
// Serves the browser client and runs the whole game authoritatively.
import indexHtml from "./public/index.html" with { type: "text" };
import gameSrc from "./public/game.js" with { type: "text" };
import moveJs from "./public/move.js" with { type: "text" };
import r3dJs from "./public/r3d.js" with { type: "text" };
import threeJs from "./public/vendor/three.module.min.js" with { type: "text" };
import os from "node:os";
import { storyEvent, bossKind, BOSSES, ending, valleyName } from "./story.js";
import { NPCS, QUESTS, CLUES, npcLines } from "./npcs.js";
import { COSMETICS, FREE_HATS, rollCosmetic, WHEEL, spinWheel, deck, bjValue, pokerScore, handName, compareHands, dealerHolds } from "./casino.js";
import { LEGENDS, legendOf, legendName, reckoning, legendLines } from "./legend.js";

const MV = new Function(moveJs + "\nreturn MV;")(); // the same movement code the browser predicts with
const gameJs = moveJs + "\n" + r3dJs + "\n" + gameSrc;
const PORT = Number(process.argv[2] || process.env.PORT || 7777);
const TICK_RATE = 30;
const SNAP_EVERY = 2; // 15 snapshots/sec
const FAST = !!process.env.SLOP_FAST; // testing only: short phases
const DAY_LEN = FAST ? 6 : 85;
const NIGHT_LEN = FAST ? 8 : 100;
const VOTE_LEN = FAST ? 3 : 25;
const LAST_NIGHT = 5; // the earliest the final night can come. In the story it waits until the mystery is solved.
const ENDLESS_BOSS_EVERY = 5;
const FOG_NIGHT = process.env.SLOP_FOGNIGHT ? 1 : 0.3; // chance a night (from night 2) is a fog night
const DROP_LEN = FAST ? 4 : 12; // seconds the balloon takes to cross the valley
const ROYALE_ZONES = [ // [wait, shrink, radius]
  [60, 40, 1000], [40, 30, 650], [30, 25, 380], [25, 20, 180], [20, 20, 0],
].map(([w, s, r]) => [FAST ? w / 6 : w, FAST ? s / 4 : s, r]);
const STORY_ZONE_R = [1700, 1350, 1100, 920, 800, 680];
const TEST_DMG = Number(process.env.SLOP_DMG || 1); // testing only
const UNLUCKY = process.env.SLOP_UNLUCKY ? 1 : 0.00004; // 0.004% per level-up or upgrade. As requested.
const INFECT = process.env.SLOP_INFECT ? 1 : 0.08; // chance a bite infects you
const FORCE_SYM = process.env.SLOP_SYM || ""; // testing only
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
const HEARTH = { x: 1120, y: 840, w: 160, h: 120, kind: "hearth", z0: 0, z1: 90 };
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
  // verticality first, so the big stuff gets room: watchtowers joined by catwalks, each with a staircase
  const stairs = (tx, ty, tw, th, top, dir) => { // a solid staircase climbing towards one face of a box
    const n = Math.ceil(top / 20), d = 30, wd = 44, out = [];
    for (let i = 0; i < n; i++) {
      const k = n - i; // distance from the face, in steps
      const z1 = Math.round(top * (i + 1) / n);
      if (dir === 0) out.push({ x: tx + tw + (k - 1) * d, y: ty + th / 2 - wd / 2, w: d, h: wd, kind: "step", z0: 0, z1 });
      else if (dir === 1) out.push({ x: tx - k * d, y: ty + th / 2 - wd / 2, w: d, h: wd, kind: "step", z0: 0, z1 });
      else if (dir === 2) out.push({ x: tx + tw / 2 - wd / 2, y: ty + th + (k - 1) * d, w: wd, h: d, kind: "step", z0: 0, z1 });
      else out.push({ x: tx + tw / 2 - wd / 2, y: ty - k * d, w: wd, h: d, kind: "step", z0: 0, z1 });
    }
    return out;
  };
  const group = (list, pad) => { if (list.every((r) => !overlaps(r, pad))) { walls.push(...list); return true; } return false; };
  for (let i = 0, tries = 0; i < 2 + ((rng() * 2) | 0) && tries < 300; tries++) { // pairs of towers with a catwalk between them
    const top = Math.round(R(170, 230)), tw = 76, gap = Math.round(R(220, 420)), horiz = rng() < 0.5;
    const ax = R(100, W - 700), ay = R(100, H - 600);
    const a = { x: ax, y: ay, w: tw, h: tw, kind: "tower", z0: 0, z1: top };
    const b = horiz ? { ...a, x: ax + tw + gap } : { ...a, y: ay + tw + gap };
    const br = horiz ? { x: ax + tw, y: ay + tw / 2 - 22, w: gap, h: 44, kind: "bridge", z0: top - 14, z1: top } : { x: ax + tw / 2 - 22, y: ay + tw, w: 44, h: gap, kind: "bridge", z0: top - 14, z1: top };
    const st = stairs(a.x, a.y, tw, tw, top, horiz ? 1 : 3);
    if (group([a, b, br, ...st], 60)) i++;
  }
  place(4 + ((rng() * 4) | 0), () => ({ x: R(80, W - 320), y: R(80, H - 260), w: R(170, 280), h: R(120, 180), kind: "house", roof: (rng() * 4) | 0, z0: 0, z1: Math.round(R(96, 136)) }), 90);
  // some houses get an outside staircase to the roof
  for (const h of walls.filter((w) => w.kind === "house")) {
    if (rng() < 0.35) continue;
    const dir = (rng() * 4) | 0, st = stairs(h.x, h.y, h.w, h.h, h.z1, dir);
    walls.splice(walls.indexOf(h), 1);
    if (!group(st, 40)) { /* no room on that side */ }
    walls.push(h);
  }
  // floating ledges, each with a jump pad beside it
  for (let i = 0, tries = 0; i < 3 && tries < 200; tries++) {
    const x = R(120, W - 320), y = R(120, H - 320), z0 = Math.round(R(130, 170));
    const ledge = { x, y, w: 120, h: 120, kind: "ledge", z0, z1: z0 + 16 };
    const pad = { x: x + 140, y: y + 40, w: 40, h: 40, kind: "pad", z0: 0, z1: 4 };
    if (!overlaps({ x: x - 10, y: y - 10, w: 200, h: 140 }, 50)) { walls.push(ledge, pad); i++; }
  }
  place(5 + ((rng() * 5) | 0), () => { const s = R(55, 95); return { x: R(80, W - 160), y: R(80, H - 160), w: s, h: s * R(0.7, 1.1), kind: "rock", z0: 0, z1: Math.round(R(30, 64)) }; }, 70);
  place(8 + ((rng() * 8) | 0), () => { const s = R(40, 56); return { x: R(80, W - 120), y: R(80, H - 120), w: s, h: s, kind: "tree", z0: 0, z1: 260 }; }, 50);
  place(3 + ((rng() * 4) | 0), () => rng() < 0.5 ? { x: R(80, W - 260), y: R(80, H - 80), w: R(120, 220), h: 18, kind: "fence", z0: 0, z1: 34 } : { x: R(80, W - 80), y: R(80, H - 260), w: 18, h: R(120, 220), kind: "fence", z0: 0, z1: 34 }, 70);
  place(3 + ((rng() * 3) | 0), () => ({ x: R(80, W - 140), y: R(80, H - 140), w: 44, h: 44, kind: "pad", z0: 0, z1: 4 }), 60); // jump pads out in the open
  place(4 + ((rng() * 4) | 0), () => ({ x: R(80, W - 140), y: R(80, H - 140), w: 50, h: 50, kind: "crate", z0: 0, z1: 50 }), 50); // hay bales to hop on
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
function npcList() { return game.mode !== "story" ? [] : NPC_POS.map((n) => ({ ...n, name: NPCS[n.id].name, role: NPCS[n.id].role, color: NPCS[n.id].color, hat: NPCS[n.id].hat })); }
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
  ak:      { name: "AK-Maybe",   dmg: 26,  rate: 9,   spread: 0.09,  range: 820,  pellets: 1, mag: 30, reload: 2.2, bloom: 0.18, gamble: true }, // every shot re-rolls the ammo count
  sword:   { name: "Slop Sword", dmg: 70,  rate: 1.8, spread: 0,     range: 92,   pellets: 1, mag: 1,  reload: 0,   bloom: 0, melee: true, arc: 1.1 }, // no ammo, lunges, hits harder falling
  rocket:  { name: "Rocket Launcher", dmg: 120, rate: 1.1, spread: 0.01, range: 1600, pellets: 1, mag: 1, reload: 1.3, bloom: 0, proj: "rocket", boom: 125 }, // aim at your feet and jump
};
const MYTHIC = {
  smg: "The Hive", shotgun: "Farmer's Wrath", rifle: "Kingmaker", sniper: "The Last Word", staff: "Morwen's Spite", pistol: "Grubb's Gavel", ak: "Lady Luck", sword: "Excalibutt", rocket: "The Moon Unit",
};
const LOOT_TYPES = ["smg", "shotgun", "rifle", "sniper", "staff", "smg", "shotgun", "rifle", "sniper", "staff", "ak", "sword", "rocket"]; // the AK is rarer
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
  charger:  { r: 20, hp: 170, speed: 80,  dmg: 26, gold: 25, xp: 18, code: "c" }, // winds up, then charges in a straight line
  flyer:    { r: 13, hp: 40,  speed: 150, dmg: 8,  gold: 14, xp: 12, code: "f" }, // circles overhead and dives
  boomer:   { r: 24, hp: 80,  speed: 55,  dmg: 6,  gold: 18, xp: 14, code: "x" }, // pops in a cloud of bile that makes the horde hunt you
  screamer: { r: 14, hp: 65,  speed: 105, dmg: 5,  gold: 20, xp: 16, code: "s" }, // keeps its distance and screams for help
};
const zCode = (z) => ZTYPES[z.type].code || z.type[0];

const SHOP = {
  seeds:   { name: "Seeds x3", cost: 15 },
  medkit:  { name: "Medkit", cost: 40 },
  kevlar:  { name: "Kevlar", cost: 60 },
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
  enhance: { name: "Enhance weapon", cost: 0 },
  repair:  { name: "Repair Hearth", cost: 75 },
  antidote: { name: "Antidote", cost: 40 },
};

const VEHICLES = {
  tractor: { name: "Tractor",    r: 28, max: 260, acc: 240, turn: 2.2, hp: 700, ram: 1.6 },
  buggy:   { name: "Slop Buggy", r: 24, max: 480, acc: 430, turn: 3.0, hp: 300, ram: 1.0 },
};
const PIECES = {
  wall:   { name: "Wall",   cost: 25,  hp: 300, solid: true, z1: 70,  desc: "Blocks the dead (and bullets). They will chew through it." },
  spikes: { name: "Spikes", cost: 35,  hp: 1,   solid: false, uses: 15, desc: "Hurts whatever walks over it. 15 uses." },
  turret: { name: "Turret", cost: 140, hp: 300, solid: true, z1: 50,  range: 380, rate: 2.2, dmg: 16, desc: "Shoots the nearest threat. Never needs reloading." },
  lamp:   { name: "Lamp",   cost: 20,  hp: 80,  solid: false, desc: "Lights up the night around it." },
};
const GRID = 40;

// ---------------------------------------------------------------- geometry
function collide(e, r) { return !!MV.pushOut(e, r, WALLS, W, H); } // at the entity's own height (ground level if it has none)
// 3D slab test against a box; returns the distance along the (unit) ray or Infinity
function rayBox3(o, d, b) {
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
function rayCyl(o, d, c, r, z0, z1) {
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
const zHeight = (z) => z.r * 3.7;
function freeGround(p) { return MV.floorAt(p.x, p.y, 20, 0, WALLS).h === 0 && !WALLS.some((w) => w.kind === "pad" && MV.touches(w, p.x, p.y, 40)); }
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
    heat: 0, dashUntil: 0, dashCd: 0, dashDx: 0, dashDy: 0, z: 0, vz: 0, gr: true, pt: null, rel: false, shoutCd: 0, vx: 0, vy: 0, lastHurt: 0,
    pe: [], lineage: [], champion: false, cos: new Set(), trail: "", title: "", spunTotal: 0,
  };
  resetProgress(p);
  resetLoadout(p, true);
  return p;
}
function resetProgress(p) {
  p.lvl = 1; p.xp = 0; p.pts = 0; p.sk = { ...(BACKGROUNDS[p.bg].sk || {}) };
  p.gen = 1; p.lineage = []; p.trait = p.chosenTrait || pick(TRAIT_KEYS); p.champion = false; p.heat = 0; p.dead = false;
  p.st = { kills: 0, deaths: 0, dmg: 0, crops: 0, tk: 0, gold: 0, bounty: 0, shots: 0, hits: 0, hs: 0, perfect: 0, cases: 0, shoutHits: 0, repairs: 0, pk: 0 };
  p.q = {}; p.flags = {}; p.bonusHp = 0; p.shoutMult = 1; p.discount = 0; p.dlg = null; p.talked = new Set(); p.out = false; p.place = 0; p.air = null; p.veh = 0; p.spins = 0; p.casino = null; p.spinning = false;
  p.bl = 0; p.bw = 0; p.going = 0; p.goKind = ""; p.inf = null; p.soggy = 0; p.ads = false;
}
function resetLoadout(p, fresh) {
  p.hp = maxHp(p); p.armor = 0;
  p.weapons = [newWeapon("pistol")];
  if (fresh && CLASSES[p.cls].start) p.weapons.push(newWeapon(CLASSES[p.cls].start));
  p.active = p.weapons.length - 1;
  if (fresh) { p.gold = (FAST ? 2000 : 50) + (BACKGROUNDS[p.bg].gold || 0); p.seeds = p.cls === "farmer" ? 6 : 3; }
  p.gren = Math.max(p.gren || 0, fresh ? 2 : 1); p.molo = Math.max(p.molo || 0, fresh ? 1 : 0); p.bile = 0; p.throwAt = 0;
  Object.assign(p, hearthSpawn(), { z: 0, vx: 0, vy: 0, vz: 0, gr: true });
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
    if (unlucky(p)) break;
  }
}
// the 0.004%: every level-up and upgrade rolls it. Almost nobody will ever see this.
function unlucky(p) {
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
  if (p.ads) s *= 0.6;
  if (now() < p.soggy) s *= 0.8;
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
  if (p.ads) s *= w.type === "shotgun" ? 0.75 : 0.4;
  return s;
}

// ---------------------------------------------------------------- infection and bodily needs
// A bite can infect you. Infection cycles through symptoms until dawn, an antidote, or it wears off.
// "second": you see yourself through someone else's eyes. "keys": your controls rearrange themselves. "runs": self-explanatory.
const SYMPTOMS = {
  second: "Second person. You are no longer the main character. You are being watched.",
  keys: "Your fingers forget. Forward is P, back is INSERT, left is ALT. There is no right.",
  runs: "Your stomach makes a noise like a drain. Find somewhere private. Soon.",
};
function infect(p) {
  if (p.inf || p.dead) return;
  p.inf = { until: now() + 70, sym: "", next: 0 };
  nextSymptom(p);
  feed(`${fullName(p)} got bitten and doesn't look well.`, "#9fdc5a");
}
function nextSymptom(p) {
  const opts = Object.keys(SYMPTOMS).filter((k) => k !== p.inf.sym);
  p.inf.sym = SYMPTOMS[FORCE_SYM] ? FORCE_SYM : pick(opts); p.inf.next = now() + 20;
  p.pe.push({ k: "sym", sym: p.inf.sym, text: SYMPTOMS[p.inf.sym] });
}
function cure(p, why) { if (!p.inf) return; p.inf = null; p.pe.push({ k: "sym", sym: "", text: why }); }
function needs(p, dt, t) {
  if (t < p.going) return;
  const k = FAST ? 5 : 1; // bladder fills in ~3.5 min, bowels ~6 min (the runs: under a minute)
  p.bl = Math.min(100, p.bl + dt * k * 100 / 210);
  p.bw = Math.min(100, p.bw + dt * k * 100 / 340 * (p.inf && p.inf.sym === "runs" ? 8 : 1));
  for (const [k, name] of [["bl", "bladder"], ["bw", "bowels"]]) {
    const v = p[k];
    if (v >= 80 && !p["warn" + k]) { p["warn" + k] = true; toast(p, `Your ${name} is at ${Math.round(v)}%. Press X to go.`, "#ffc030"); }
    if (v >= 100) accident(p, k === "bl" ? "pee" : "poo");
  }
}
function accident(p, kind) {
  if (kind === "pee") { p.bl = 0; p.warnbl = false; p.soggy = now() + 20; feed(`${fullName(p)} wet themselves in front of everyone.`, "#e8d84a"); }
  else { p.bw = 0; p.warnbw = false; p.soggy = now() + 35; feed(`${fullName(p)} soiled themselves. The flies have found a new favourite.`, "#a0703a"); }
  events.push({ k: "mess", x: Math.round(p.x), y: Math.round(p.y), kind, big: 1 });
  p.pe.push({ k: "accident", kind });
}
function relieve(p) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.going || game.phase === "intro") return;
  const kind = p.bw >= p.bl ? "poo" : "pee";
  if (Math.max(p.bl, p.bw) < 25) return toast(p, "You don't need to go. You try anyway. Nothing.", "#bbb");
  p.going = t + (kind === "poo" ? 2.2 : 1.4); p.goKind = kind;
  setTimeout(() => {
    if (p.dead || !players.has(p.id)) return;
    if (kind === "pee") { p.bl = 0; p.warnbl = false; } else { p.bw = 0; p.warnbw = false; }
    events.push({ k: "mess", x: Math.round(p.x), y: Math.round(p.y), kind });
    const plot = PLOTS.find((pl) => (pl.stage === 1 || pl.stage === 2) && dist2(pl, p) < 60 * 60);
    if (plot && kind === "poo") { plot.stage++; plot.prog = 0; deed("soil", 3); toast(p, "Fertilised. The crop grows a whole stage. Nature is disgusting.", "#7fd34d"); }
    else toast(p, kind === "pee" ? "Ahh. Relief." : "Much better. Don't look behind you.", "#8f8");
  }, (p.going - t) * 1000);
}

// ---------------------------------------------------------------- combat
function hurtZombie(z, dmg, p, kind) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  if (p) { p.st.dmg += dmg; p.pe.push({ k: "dmg", x: z.x, y: z.y - z.r, z: Math.round((z.z || 0) + zHeight(z)), v: Math.round(dmg), crit: kind === "crit", hs: kind === "hs" }); }
  if (z.hp <= 0) {
    const def = ZTYPES[z.type];
    if (p) deed("blood", z.type === "boss" || z.type === "elite" ? 20 : 0.4);
    if (p) {
      p.st.kills++;
      addGold(p, def.gold);
      addXp(p, def.xp + (kind === "hs" ? 4 : 0));
      if (sk(p, "bloodlust")) p.hp = Math.min(maxHp(p), p.hp + 3 * sk(p, "bloodlust"));
    }
    if (z.type === "boomer") bile(z.x, z.y, z.z || 0, 150);
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
// boomer bile: anyone splashed smells like dinner, and the whole horde comes for them
function bile(x, y, z, r) {
  events.push({ k: "bile", x: Math.round(x), y: Math.round(y), z: Math.round(z), r });
  for (const q of players.values()) if (!q.dead && !q.air && (q.x - x) ** 2 + (q.y - y) ** 2 < r * r && Math.abs(q.z - z) < 90) {
    if (!(q.bile > now())) toast(q, "You're covered in boomer bile. Every zombie in the valley can smell you.", "#b8e04a");
    q.bile = now() + 9;
  }
}
function hurtPlayer(v, dmg, attacker, cause) {
  if (v.dead || v.air || now() < v.dashUntil) return;
  if (attacker && attacker !== v) {
    if (game.mode !== "royale") { dmg *= 0.5; attacker.heat += dmg; } // friendly fire is real, but halved
    attacker.st.dmg += dmg;
    attacker.pe.push({ k: "dmg", x: v.x, y: v.y - 20, z: Math.round(v.z + MV.HGT), v: Math.round(dmg), crit: false, ff: true });
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
  v.dead = true; v.hp = 0; v.inf = null; v.going = 0; v.ads = false; v.respawnAt = now() + 5; v.st.deaths++; v.champion = false; v.dlg = null;
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
    } else {
      // a teamkill. Everybody hears about it.
      attacker.shame = now() + 60;
      feed(`${fullName(attacker)} ☠ ${fullName(v)} (TEAMKILL)`, "#ff6060");
      chat("The Valley", `SHAME. SHAME. SHAME. ${fullName(attacker)} just killed ${fullName(v)}. Their own teammate.`, "#ff4040");
      events.push({ k: "shame", id: attacker.id, who: fullName(attacker), vic: fullName(v), n: attacker.st.tk });
    }
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

// ---------------------------------------------------------------- explosions, things you throw, and fire
let projs = [];
const fires = new Map(); // "cx,cy" -> burning ground cell
const scorched = new Map(); // cells that burnt out recently and can't catch again yet
const FIRE_CELL = 40, FIRE_MAX = 260;
let fireAcc = 0;
const solved = () => !!(game.flags.exposed || game.flags.blackmail || game.flags.pardoned);
// knock a player about. The owner's browser is told too, so its prediction flies with them.
function kick(q, vx, vy, vz) {
  if (q.veh || q.air || q.dead) return;
  q.vx += vx; q.vy += vy; q.vz = Math.max(q.vz, 0) + vz; if (vz > 0) q.gr = false;
  q.pe.push({ k: "kick", vx: Math.round(vx), vy: Math.round(vy), vz: Math.round(vz) });
}
function explode(x, y, z, r, dmg, owner, cause, selfMult = 0.3) {
  events.push({ k: "boom", x: Math.round(x), y: Math.round(y), z: Math.round(z), r: Math.round(r) });
  const d3 = (ex, ey, ez) => Math.sqrt((ex - x) ** 2 + (ey - y) ** 2 + (ez - z) ** 2);
  for (const zb of zombies) {
    if (zb.hp <= 0) continue;
    const d = Math.max(0, d3(zb.x, zb.y, (zb.z || 0) + zHeight(zb) / 2) - zb.r);
    if (d >= r) continue;
    const f = 1 - (d / r) * 0.6;
    hurtZombie(zb, dmg * f, owner, "");
    const hd = Math.hypot(zb.x - x, zb.y - y) || 1;
    if (zb.type !== "boss" && zb.type !== "elite") { zb.vx += (zb.x - x) / hd * 320 * f; zb.vy += (zb.y - y) / hd * 320 * f; if (zb.type !== "flyer") { zb.vz = Math.max(zb.vz, 260 * f); zb.gr = false; } }
  }
  for (const q of players.values()) {
    if (q.dead || q.air) continue;
    const cz = q.z + MV.HGT / 2, d = d3(q.x, q.y, cz);
    if (d >= r + 16) continue;
    const f = 1 - (Math.max(0, d - 16) / r) * 0.7;
    if (q === owner) hurtPlayer(q, dmg * f * selfMult, null, cause);
    else hurtPlayer(q, dmg * f * 0.6, owner, cause);
    // the push: mostly up, so aiming at your feet sends you flying (rocket jumping)
    const nx = (q.x - x) / (d || 1), ny = (q.y - y) / (d || 1), nz = (cz - z) / (d || 1), push = (q === owner ? 760 : 520) * f;
    kick(q, nx * push * 0.9, ny * push * 0.9, push * Math.max(0.55, nz));
  }
  for (const b of builds) if ((b.x + 20 - x) ** 2 + (b.y + 20 - y) ** 2 < (r + 20) ** 2) hurtPiece(b, dmg * 0.5);
  for (const v of vehicles) if ((v.x - x) ** 2 + (v.y - y) ** 2 < (r + VEHICLES[v.kind].r) ** 2) hurtVehicle(v, dmg * 0.5, owner);
}
const insideWall = (x, y, z) => WALLS.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h && z < w.z1 - 2 && z > (w.z0 || 0) - 2);
function throwIt(p, kind) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.throwAt || t < p.going || p.dlg) return;
  if (!["day", "night", "royale", "lobby"].includes(game.phase)) return;
  const have = kind === "molo" ? p.molo : p.gren;
  if (have <= 0) return toast(p, kind === "molo" ? "No molotovs left. The shop sells them [B]." : "No grenades left. The shop sells them [B].", "#f88");
  if (kind === "molo") p.molo--; else p.gren--;
  p.throwAt = t + 0.7;
  const pt = (p.pt == null ? 0.35 : p.pt) + 0.18, sp = 640;
  const c = Math.cos(pt);
  projs.push({ id: nextId++, kind, owner: p.id, x: p.x + Math.cos(p.a) * 18, y: p.y + Math.sin(p.a) * 18, z: p.z + MV.EYE - 4, vx: Math.cos(p.a) * c * sp + p.vx * 0.5, vy: Math.sin(p.a) * c * sp + p.vy * 0.5, vz: Math.sin(pt) * sp + Math.max(0, p.vz) * 0.5, age: 0 });
  events.push({ k: "throw", id: p.id });
}
function fireRocket(p, w, mult) {
  const pt = p.pt == null ? 0 : p.pt, sp = 980;
  const a = p.a + (Math.random() - 0.5) * 0.02;
  projs.push({ id: nextId++, kind: "rocket", owner: p.id, x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, z: p.z + MV.EYE - 6, vx: Math.cos(a) * Math.cos(pt) * sp, vy: Math.sin(a) * Math.cos(pt) * sp, vz: Math.sin(pt) * sp, age: 0, dmg: WEAPONS.rocket.dmg * mult, r: WEAPONS.rocket.boom * (w.rarity === 4 ? 1.5 : 1), flat: p.pt == null });
  events.push({ k: "tr", x1: p.x, y1: p.y, z1: Math.round(p.z + MV.EYE), x2: p.x + Math.cos(a) * 40, y2: p.y + Math.sin(a) * 40, z2: Math.round(p.z + MV.EYE), c: "rocket", m: 0 });
}
function projTick(t, dt) {
  for (const pr of projs) {
    pr.age += dt;
    const owner = players.get(pr.owner) || null;
    if (pr.kind === "rocket") {
      const steps = 3; let boom = false;
      for (let i = 0; i < steps && !boom; i++) {
        pr.x += pr.vx * dt / steps; pr.y += pr.vy * dt / steps; pr.z += pr.vz * dt / steps;
        if (pr.flat) pr.z = Math.max(pr.z, 30); // top-down players fire level rockets
        if (pr.z <= MV.floorAt(pr.x, pr.y, 2, pr.z, WALLS).h || insideWall(pr.x, pr.y, pr.z) || pr.x < 0 || pr.y < 0 || pr.x > W || pr.y > H) boom = true;
        for (const zb of zombies) if (!boom && zb.hp > 0 && (zb.x - pr.x) ** 2 + (zb.y - pr.y) ** 2 < (zb.r + 6) ** 2 && (pr.flat || (pr.z > zb.z - 6 && pr.z < zb.z + zHeight(zb) + 6))) boom = true;
        for (const q of players.values()) if (!boom && q.id !== pr.owner && !q.dead && !q.air && (q.x - pr.x) ** 2 + (q.y - pr.y) ** 2 < 22 * 22 && (pr.flat || (pr.z > q.z - 6 && pr.z < q.z + MV.HGT + 6))) boom = true;
        for (const v of vehicles) if (!boom && (v.x - pr.x) ** 2 + (v.y - pr.y) ** 2 < VEHICLES[v.kind].r ** 2 && pr.z < 44 && !(owner && owner.veh === v.id)) boom = true;
      }
      if (boom || pr.age > 2.2) { pr.dead = true; explode(pr.x, pr.y, pr.z, pr.r, pr.dmg, owner, "blown up by a rocket", 0.22); }
      continue;
    }
    // grenades and molotovs: arcs that bounce off things
    pr.vz -= MV.GRAV * 0.75 * dt;
    const nx = clamp(pr.x + pr.vx * dt, 4, W - 4), ny = clamp(pr.y + pr.vy * dt, 4, H - 4), nz = pr.z + pr.vz * dt;
    let bumped = false;
    if (insideWall(nx, pr.y, nz)) { pr.vx = -pr.vx * 0.45; bumped = true; } else pr.x = nx;
    if (insideWall(pr.x, ny, nz)) { pr.vy = -pr.vy * 0.45; bumped = true; } else pr.y = ny;
    const fl = MV.floorAt(pr.x, pr.y, 3, pr.z + 2, WALLS).h;
    let landed = false;
    if (nz <= fl) { pr.z = fl; if (pr.vz < -60) landed = true; pr.vz = -pr.vz * 0.4; pr.vx *= 0.65; pr.vy *= 0.65; } else pr.z = nz;
    if (pr.kind === "molo") {
      let hit = bumped || landed || pr.age > 3;
      for (const zb of zombies) if (!hit && zb.hp > 0 && (zb.x - pr.x) ** 2 + (zb.y - pr.y) ** 2 < (zb.r + 6) ** 2 && pr.z > zb.z - 6 && pr.z < zb.z + zHeight(zb)) hit = true;
      if (hit) {
        pr.dead = true;
        events.push({ k: "glass", x: Math.round(pr.x), y: Math.round(pr.y), z: Math.round(pr.z) });
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dy) < 2 || Math.random() < 0.6) ignite(pr.x + dx * FIRE_CELL, pr.y + dy * FIRE_CELL, pr.z + 30, pr.owner, 0, true);
      }
    } else if (pr.age > 2.0) { pr.dead = true; explode(pr.x, pr.y, pr.z + 6, 150, 150, owner, "blown up by a grenade", 0.5); }
  }
  projs = projs.filter((pr) => !pr.dead);
}
// fire lives on a grid of ground cells. Every cell can light its neighbours, weaker each generation, so a molotov
// makes a proper blaze without eating the whole valley. Barricades and crops are fuel.
function ignite(x, y, zHint, ownerId, gen, force) {
  if (x < 0 || y < 0 || x > W || y > H) return;
  const cx = Math.floor(x / FIRE_CELL), cy = Math.floor(y / FIRE_CELL), key = cx + "," + cy, t = now();
  const mx = (cx + 0.5) * FIRE_CELL, my = (cy + 0.5) * FIRE_CELL;
  const z = MV.floorAt(mx, my, 4, zHint, WALLS).h;
  if (insideWall(mx, my, z + 4)) return;
  if (HEARTH.x < mx && mx < HEARTH.x + HEARTH.w && HEARTH.y < my && my < HEARTH.y + HEARTH.h) return;
  const f = fires.get(key);
  if (f) { f.until = Math.max(f.until, t + 4); return; }
  if (!force && (scorched.get(key) || 0) > t) return;
  if (fires.size >= FIRE_MAX) return;
  fires.set(key, { key, cx, cy, x: mx, y: my, z, owner: ownerId, gen, until: t + rand(6, 10), next: t + rand(0.6, 1.4) });
}
function fireTick(t, dt) {
  fireAcc += dt;
  if (fireAcc < 0.25) return;
  const step = fireAcc; fireAcc = 0;
  for (const [key, f] of fires) {
    if (t > f.until) { fires.delete(key); scorched.set(key, t + 40); continue; }
    const fuel = builds.some((b) => PIECES[b.bk].solid && b.x < f.x + 20 && b.x + 40 > f.x - 20 && b.y < f.y + 20 && b.y + 40 > f.y - 20);
    if (t > f.next && f.gen < 6) {
      f.next = t + rand(0.8, 1.6);
      const chance = (fuel ? 0.9 : 0.55) * Math.pow(0.78, f.gen);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.random() < chance * 0.5) ignite(f.x + dx * FIRE_CELL, f.y + dy * FIRE_CELL, f.z + 20, f.owner, f.gen + (fuel ? 0 : 1));
    }
    const owner = players.get(f.owner) || null;
    const inCell = (e, r, ez) => Math.abs(e.x - f.x) < FIRE_CELL / 2 + r * 0.5 && Math.abs(e.y - f.y) < FIRE_CELL / 2 + r * 0.5 && Math.abs((ez || 0) - f.z) < 26;
    for (const zb of zombies) if (zb.hp > 0 && zb.type !== "flyer" && inCell(zb, zb.r, zb.z)) { zb.fireUntil = t + 3; zb.fireBy = f.owner; }
    for (const q of players.values()) if (!q.dead && !q.air && !q.veh && inCell(q, 16, q.z)) { q.fireUntil = t + 1.5; q.fireBy = q.id === f.owner ? 0 : f.owner; }
    for (const b of builds) if (PIECES[b.bk].solid && b.x < f.x + 20 && b.x + 40 > f.x - 20 && b.y < f.y + 20 && b.y + 40 > f.y - 20) hurtPiece(b, 40 * step);
    for (const pl of PLOTS) if (pl.stage > 0 && Math.abs(pl.x - f.x) < 24 && Math.abs(pl.y - f.y) < 24) { pl.stage = 0; pl.prog = 0; events.push({ k: "trample", x: pl.x, y: pl.y, burnt: 1 }); }
    for (const v of vehicles) if (Math.abs(v.x - f.x) < 30 && Math.abs(v.y - f.y) < 30) hurtVehicle(v, 20 * step, owner);
  }
  for (const [key, until] of scorched) if (until < t) scorched.delete(key);
  // burning things keep burning for a bit after they leave the flames
  for (const zb of zombies) if (zb.fireUntil > t && zb.hp > 0) { hurtZombie(zb, 45 * step, players.get(zb.fireBy) || null, ""); if (Math.random() < 0.5) events.push({ k: "burn", x: zb.x, y: zb.y }); }
  for (const q of players.values()) if (q.fireUntil > t && !q.dead) { hurtPlayer(q, 22 * step, q.fireBy ? players.get(q.fireBy) || null : null, "burned alive"); }
}

// the sword: a wide swing in front of you with a lunge. Falling onto something doubles as a plunge attack.
function swing(p, w) {
  const def = WEAPONS[w.type], t = now();
  w.nextShot = t + 1 / def.rate;
  p.st.shots++;
  const mult = dmgMult(p, w) * (w.rarity === 4 ? 1.5 : 1);
  const plunge = !p.gr && p.vz < -250;
  const lunge = plunge ? 0 : 230;
  p.vx += Math.cos(p.a) * lunge; p.vy += Math.sin(p.a) * lunge;
  events.push({ k: "slash", id: p.id, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), a: +p.a.toFixed(2), m: w.rarity === 4 ? 1 : 0 });
  const reach = def.range + (plunge ? 30 : 0);
  const inArc = (e, r, ez, eh) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) - r;
    if (d > reach) return false;
    if (ez + eh < p.z - 20 - (plunge ? 60 : 0) || ez > p.z + MV.HGT + 20) return false;
    if (d < 10) return true;
    let da = Math.atan2(dy, dx) - p.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) < (plunge ? Math.PI : def.arc);
  };
  let any = false;
  for (const z of zombies) if (z.hp > 0 && inArc(z, z.r, z.z || 0, zHeight(z))) {
    any = true;
    let dmg = def.dmg * mult * (plunge ? 1.8 : 1), tag = plunge ? "hs" : "";
    if (p.cls === "rogue" && Math.random() < 0.25 + (traitOf(p).luck ? 0.1 : 0)) { dmg *= 2; tag = tag || "crit"; }
    hurtZombie(z, dmg, p, tag);
    const d = Math.hypot(z.x - p.x, z.y - p.y) || 1; z.vx += (z.x - p.x) / d * 220; z.vy += (z.y - p.y) / d * 220;
  }
  for (const q of players.values()) if (q !== p && !q.dead && !q.veh && !q.air && inArc(q, 16, q.z, MV.HGT)) { any = true; hurtPlayer(q, def.dmg * mult * (plunge ? 1.8 : 1), p, "cut in half"); }
  if (plunge) { p.vz = 380; events.push({ k: "boom", x: p.x, y: p.y, z: p.z, r: 50, dust: 1 }); } // bounce off whatever you landed on
  if (any) p.st.hits++;
}
function shoot(p, w) {
  const def = WEAPONS[w.type];
  if (def.melee) return swing(p, w);
  const t = now();
  if (def.proj) { w.nextShot = t + 1 / def.rate; w.ammo--; p.st.shots++; fireRocket(p, w, dmgMult(p, w)); return; }
  w.nextShot = t + 1 / def.rate;
  w.ammo--;
  if (def.gamble && w.ammo > 0) w.ammo = Math.floor(Math.random() * (w.rarity === 4 ? 150 : 100)); // could be 97, could be 0
  p.st.shots++;
  const myth = w.rarity === 4;
  const mult = dmgMult(p, w);
  const spread = spreadOf(p, w);
  w.bloom = Math.min(1.6, w.bloom + def.bloom * (1 - 0.2 * sk(p, "steady")));
  const pellets = def.pellets + (myth && w.type === "shotgun" ? 4 : 0);
  const pierce = def.pierce || (myth && w.type === "rifle");
  const boom = def.boom ? def.boom * (myth ? 1.6 : 1) : myth && w.type === "sniper" ? 110 : 0;
  // aim: yaw + pitch in the 3D views. The classic top-down view (and bots) send no pitch, and then height is ignored for targets.
  const flat = p.pt == null;
  const mx = p.x + Math.cos(p.a) * 20, my = p.y + Math.sin(p.a) * 20, mz = (p.z || 0) + MV.EYE - 6;
  const inZ = (tz, z0, z1) => flat || (tz >= z0 && tz <= z1);
  let anyHit = false;
  for (let i = 0; i < pellets; i++) {
    const a = p.a + (Math.random() - 0.5) * 2 * spread;
    const pt = flat ? 0 : p.pt + (Math.random() - 0.5) * 2 * spread * 0.7;
    const dx = Math.cos(a) * Math.cos(pt), dy = Math.sin(a) * Math.cos(pt), dz = Math.sin(pt);
    const o = [mx, my, mz], d = [dx, dy, dz];
    let wallT = def.range;
    for (const wl of WALLS) wallT = Math.min(wallT, rayBox3(o, d, wl));
    if (dz < -1e-6) wallT = Math.min(wallT, -mz / dz); // the ground
    const hits = [];
    const cyl = (c, r, z0, z1) => flat ? (() => { const hl = Math.hypot(dx, dy) || 1, th = rayCircle(mx, my, dx / hl, dy / hl, c, r); return th / hl; })() : rayCyl(o, d, c, r, z0, z1);
    for (const z of zombies) { const tt = cyl(z, z.r, z.z || 0, (z.z || 0) + zHeight(z)); if (tt < wallT) hits.push([tt, z, "z"]); }
    for (const q of players.values()) {
      if (q === p || q.dead || q.veh || q.air) continue;
      const tt = cyl(q, 16, q.z, q.z + MV.HGT); if (tt < wallT) hits.push([tt, q, "p"]);
    }
    if (game.mode === "royale") for (const v of vehicles) { if (v.id === p.veh) continue; const tt = cyl(v, VEHICLES[v.kind].r, 0, 40); if (tt < wallT) hits.push([tt, v, "v"]); }
    hits.sort((a, b) => a[0] - b[0]);
    let endT = wallT;
    if (def.boom) {
      endT = hits.length ? hits[0][0] : wallT;
      const bx = mx + dx * endT, by = my + dy * endT, bz = mz + dz * endT;
      events.push({ k: "boom", x: bx, y: by, z: bz, r: boom });
      if (w.type === "staff") ignite(bx, by, bz + 20, p.id, 3);
      if (hits.length) anyHit = true;
      const near = (e, ez, r) => (e.x - bx) ** 2 + (e.y - by) ** 2 + (flat ? 0 : (ez - bz) ** 2) < r * r;
      for (const z of zombies) if (near(z, (z.z || 0) + z.r, boom + z.r)) hurtZombie(z, def.dmg * mult, p);
      for (const q of players.values()) if (!q.dead && near(q, q.z + 28, boom)) hurtPlayer(q, def.dmg * mult * 0.3, q === p ? null : p, "blown up by their own fireball");
    } else {
      const vi = hits.findIndex((h) => h[2] === "v");
      if (vi >= 0) hits.length = vi + 1; // vehicles stop bullets, even piercing ones
      const list = pierce ? hits : hits.slice(0, 1);
      if (!pierce && hits.length) endT = hits[0][0];
      for (const [, target, kind] of list) {
        anyHit = true;
        let dmg = def.dmg * mult;
        if (kind === "v") { hurtVehicle(target, dmg * 0.6, p); continue; }
        // precision: in 3D a headshot is the top fifth of the target; top-down, it's a shot through the middle
        let tag = "", head;
        if (flat) { const hl = Math.hypot(dx, dy) || 1; head = Math.abs((target.x - mx) * dy / hl - (target.y - my) * dx / hl) < (kind === "z" ? target.r : 16) * 0.38; }
        else { const th = hits.find((h) => h[1] === target)[0], hz = mz + dz * th, tz = target.z || 0, hh = kind === "z" ? zHeight(target) : MV.HGT; head = hz > tz + hh * 0.8; }
        if (head && w.type !== "shotgun") { dmg *= 1.75 + 0.25 * sk(p, "deadeye"); tag = "hs"; p.st.hs++; }
        if (p.cls === "rogue" && Math.random() < 0.25 + (traitOf(p).luck ? 0.1 : 0)) { dmg *= 2; tag = tag || "crit"; }
        if (kind === "z") {
          hurtZombie(target, dmg, p, tag);
          if (myth && w.type === "shotgun") { target.vx += dx * 160; target.vy += dy * 160; }
          if (myth && w.type === "smg") p.hp = Math.min(maxHp(p), p.hp + dmg * 0.12);
        } else hurtPlayer(target, dmg, p, "shot");
      }
      if (boom) {
        const bx = mx + dx * endT, by = my + dy * endT;
        events.push({ k: "boom", x: bx, y: by, z: mz + dz * endT, r: boom });
        for (const z of zombies) if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (boom + z.r) ** 2) hurtZombie(z, 60 * mult, p);
      }
    }
    events.push({ k: "tr", x1: mx, y1: my, z1: Math.round(mz), x2: mx + dx * endT, y2: my + dy * endT, z2: Math.round(mz + dz * endT), c: w.type, m: myth ? 1 : 0 });
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
  if (p.z > 40) return toast(p, "You'll have to come down first.", "#bbb");
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
    if (!best.grave && Math.random() < 0.5) { if (Math.random() < 0.5) p.gren = Math.min(9, p.gren + 1); else p.molo = Math.min(9, p.molo + 1); toast(p, "There was something to throw in there too.", "#ffb070"); }
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
  else if (item === "grenade") p.gren = Math.min(9, p.gren + 2);
  else if (item === "molotov") p.molo = Math.min(9, p.molo + 2);
  else if (item === "antidote") { if (p.inf) cure(p, "The antidote tastes like pennies. The infection is gone."); else toast(p, "Bought an antidote. You drink it anyway. Nothing happens.", "#bbb"); }
  else if (item === "repair") { p.st.repairs++; deed("soil", 10); game.hearth = Math.min(game.hearthMax, game.hearth + 200); feed(`${fullName(p)} repaired the Hearth`, "#8f8"); }
  else if (item === "gcase") {
    const n = Math.random() < 0.15 + (traitOf(p).luck ? 0.1 : 0) ? 3 : Math.random() < 0.45 ? 2 : 1;
    p.spins += n; p.st.cases++;
    p.pe.push({ k: "case", type: "ak", rarity: n + 1, name: `${n} WHEEL SPIN${n > 1 ? "S" : ""}`, spins: 1 });
    setTimeout(() => sendCasino(p), 3300);
  }
  else if (item === "case") {
    const r = Math.random() * 100 - (traitOf(p).luck ? 8 : 0);
    const rarity = r < 0.8 ? 4 : r < 4 ? 3 : r < 15 ? 2 : r < 40 ? 1 : 0;
    const w = newWeapon(pick(LOOT_TYPES), rarity);
    giveWeapon(p, w);
    p.pe.push({ k: "case", type: w.type, rarity, name: wName(w) }); p.st.cases++;
    if (rarity >= 2) setTimeout(() => feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${wName(w)}`, ["", "", "#c070ff", "#ffc030", "#ff4b4b"][rarity]), 3200);
  } else if (WEAPONS[item]) giveWeapon(p, newWeapon(item));
  if (item !== "case" && item !== "gcase" && item !== "antidote") toast(p, `Bought ${it.name}`, "#8f8");
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
    p.pe.push({ k: "enh", ok: false, lvl: w.enh, down });
  }
}
function learn(p, s) {
  const def = SKILLS[s];
  if (!def || p.pts <= 0 || sk(p, s) >= def.max) return;
  p.pts--; p.sk[s] = sk(p, s) + 1;
  if (s === "tough") p.hp += 20;
  unlucky(p);
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
  const w = MV.wishDir(p.keys, p.a, p.rel);
  let dx = w.x, dy = w.y;
  if (!dx && !dy) { dx = Math.cos(p.a); dy = Math.sin(p.a); }
  const spd = Math.max(Math.hypot(p.vx, p.vy), speedOf(p) * 2.7); // works in the air too: an air dash
  p.vx = dx * spd; p.vy = dy * spd; if (!p.gr && p.vz < 0) p.vz = 0;
  p.dashUntil = t + 0.18; p.dashCd = t + (p.cls === "rogue" ? 0.8 : 1.3);
}

// ---------------------------------------------------------------- Vex's Casino (in-game gold only)
function sendCasino(p) {
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
function casinoCrate(p, rarity, type) { giveWeapon(p, newWeapon(type || pick(LOOT_TYPES), rarity)); p.pe.push({ k: "case", type: p.weapons[p.active].type, rarity, name: wName(p.weapons[p.active]) }); }
function doSpin(p) {
  if (p.spinning || p.spins <= 0 || p.casino) return;
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
function casinoAct(p, m) {
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
function equip(p, slot, id) {
  if (slot === "hat" && (FREE_HATS.includes(id) || (COSMETICS[id]?.slot === "hat" && p.cos.has(id)))) p.hat = id;
  else if ((slot === "trail" || slot === "title") && (id === "" || (COSMETICS[id]?.slot === slot && p.cos.has(id)))) p[slot] = id;
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
    for (const id of v.seats) { const p = players.get(id); if (p && p.veh === v.id) { p.x = v.x; p.y = v.y; p.z = 0; } }
  }
}

// ---------------------------------------------------------------- base building
function rectHitsCircle(b, c, r) { const cx = clamp(c.x, b.x, b.x + b.w), cy = clamp(c.y, b.y, b.y + b.h); return (c.x - cx) ** 2 + (c.y - cy) ** 2 < r * r; }
function placePiece(p, kind, x, y, free) {
  const def = PIECES[kind];
  if (!def) return false;
  const fail = (msg) => { if (p) toast(p, msg, "#f88"); return false; };
  x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID;
  const b = { id: nextId++, kind: "built", bk: kind, x, y, w: GRID, h: GRID, z0: 0, z1: def.z1 || 10, hp: def.hp, maxHp: def.hp, owner: p ? p.id : 0, uses: def.uses || 0, nextShot: 0, a: 0 };
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
  if (game.mode === "story") placeNpcs(); else NPC_POS = [];
  projs = []; fires.clear(); scorched.clear();
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
  if (game.mode === "endless") { events.push({ k: "banner", text: `ENDLESS: ${VALLEY.toUpperCase()}`, sub: "No story. No end. Keep the Hearth burning as long as you can. A boss comes every fifth night." }); return; }
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
  game.cameoDay = game.mode !== "story" ? 0 : process.env.SLOP_CAMEO ? +process.env.SLOP_CAMEO : pick([2, 4]); // never on the day of the Reckoning
  game.fog = false;
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
  game.spawnLeft = Math.round(Math.min(150, (12 + 9 * game.night) * (0.6 + 0.4 * n) * game.mods.zCount * game.mods.nightCut));
  game.mods.nightCut = 1;
  game.spawnNext = now() + 2;
  zoneShrinkTo(STORY_ZONE_R[Math.min(game.night, STORY_ZONE_R.length - 1)], 25);
  events.push({ k: "feed", text: "The slop fog is closing in. Stay near the Hearth.", color: "#c080ff" });
  // the story's last night only comes once the mystery is solved; until then the waves never stop
  const final = game.mode === "story" && game.night >= LAST_NIGHT && solved();
  const endlessBoss = game.mode === "endless" && game.night % ENDLESS_BOSS_EVERY === 0;
  game.fog = !final && !endlessBoss && game.night >= 2 && Math.random() < FOG_NIGHT;
  if (endlessBoss) {
    game.ends = Infinity;
    game.bossKind = pick(Object.keys(BOSSES));
    const B = BOSSES[game.bossKind], b = spawnZombie("boss");
    b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * B.hp * (0.5 + 0.5 * n) * (1 + 0.35 * (game.night / ENDLESS_BOSS_EVERY - 1)));
    game.bossId = b.id;
    events.push({ k: "banner", text: `NIGHT ${game.night}: ${B.name}`, sub: "Kill it and the sun comes up. Reward: 150g each." });
  } else if (final) {
    game.ends = Infinity;
    game.bossKind = bossKind(game.flags);
    const B = BOSSES[game.bossKind];
    const b = spawnZombie("boss");
    b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * B.hp * game.mods.bossHp * (0.5 + 0.5 * n));
    game.bossId = b.id;
    events.push({ k: "banner", text: `CONTRACT: ${B.name}`, sub: "Slay it to save the valley. Reward: 150g each." });
  } else {
    game.ends = now() + NIGHT_LEN;
    const sub = game.fog ? "FOG NIGHT. You can't see a thing. Listen for the screamers." : game.night === 1 ? "Protect the Hearth. Don't shoot your friends (much)." : game.mode === "story" && game.night >= LAST_NIGHT ? "The dead won't stop until someone solves the mystery. Check your journal [J]." : "They're getting hungrier.";
    events.push({ k: "banner", text: game.fog ? `NIGHT ${game.night}: THE FOG` : `NIGHT ${game.night}`, sub });
  }
}
function startDay() {
  game.phase = "day"; game.ends = now() + DAY_LEN; game.fog = false;
  for (const p of players.values()) { p.talked.clear(); cure(p, "The sunrise burns the infection out of you."); }
  for (const z of zombies) if (z.type !== "elite") z.burn = true;
  spawnCrates();
  const left = LAST_NIGHT - game.night;
  const sub = game.mode === "endless" ? `You survived night ${game.night}. ${ENDLESS_BOSS_EVERY - (game.night % ENDLESS_BOSS_EVERY)} until the next boss. Shop open [B].`
    : solved() ? (left <= 1 ? "The mystery is solved. Tonight is the final night. Shop open [B]." : `The sun burns the dead. ${left} nights left. Shop open [B].`)
    : left <= 1 ? "The sun burns the dead, but they'll keep coming until the mystery is solved [J]. Shop open [B]." : `The sun burns the dead. Solve the mystery [J] and survive ${left} more nights. Shop open [B].`;
  events.push({ k: "banner", text: `DAY ${game.night + 1}`, sub });
  if (game.mode !== "story") return;
  if (game.night + 1 === game.cameoDay) cameoArrive();
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
  if (game.mode === "endless") {
    const best = Math.max(game.night - 1, 0);
    game.ending = [`${VALLEY} held out for ${best} night${best === 1 ? "" : "s"}. The Hearth went out on night ${game.night}.`, best >= 15 ? "Songs will be sung. Badly, but sung." : best >= 8 ? "A respectable showing. The dead were mildly inconvenienced." : "The dead barely noticed you were there."];
    game.prev = `Last time, ${VALLEY} survived ${best} nights of the endless dark.`;
  } else {
    game.ending = [...ending(win, game.flags, game.night), ...legendLines(win, lg, game.legend, game.flags, VALLEY, game.deeds), ...(win ? npcLines(game.flags, game.aff) : [])];
    game.prev = win ? `Last time, ${legendName(lg, VALLEY)} saved their valley.` : `Last time, ${VALLEY} fell on night ${game.night}.`;
  }
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
// what crawls out of the dark tonight. New kinds join as the nights go on.
function nightType(n, fog) {
  const w = { walker: 10, runner: n >= 2 ? 5 : 0, tank: n >= 3 ? 1.2 : 0, charger: n >= 2 ? 1.1 : 0, flyer: n >= 2 ? 1.4 : 0, boomer: n >= 2 ? 1 : 0, screamer: fog ? 1.8 : n >= 3 ? 0.5 : 0 };
  if (n >= 6) { w.tank += 0.6; w.charger += 0.6; w.flyer += 0.6; }
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return "walker";
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
  const z = { id: nextId++, type, x, y, z: 0, vz: 0, gr: true, r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale, vx: 0, vy: 0, stun: 0, atk: 0, steer: 0, burn: false, special: now() + 6, charge: 0, arson: ["walker", "runner", "tank"].includes(type) && Math.random() < 0.35 };
  if (type === "flyer") { z.z = 160; z.gr = false; }
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
      const r = Math.random();
      const z = spawnZombie(r < 0.08 ? "tank" : r < 0.14 ? "charger" : r < 0.2 ? "flyer" : r < 0.25 ? "boomer" : r < 0.5 ? "runner" : "walker");
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
    spawnZombie(nightType(game.night, game.fog));
    game.spawnLeft--;
    const len = game.ends === Infinity ? 50 : NIGHT_LEN * 0.8;
    game.spawnNext = t + len / Math.max(10, game.spawnLeft + 10) * 0.9;
    if (game.ends === Infinity && game.spawnLeft === 0) game.spawnLeft = 12; // endless trickle while the boss lives
  }
  if ((game.phase === "day" || game.phase === "night") && game.mods.hearthRegen) game.hearth = Math.min(game.hearthMax, game.hearth + game.mods.hearthRegen * dt);

  const playing = game.phase === "day" || game.phase === "night" || game.phase === "royale";
  if (playing) { vehicleTick(t, dt); buildTick(t); projTick(t, dt); fireTick(t, dt); }

  // players
  const alive = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of players.values()) {
    if (p.dead) { if (game.phase !== "over" && game.phase !== "intro" && !p.out && game.mode !== "royale" && t > p.respawnAt) respawnHeir(p); continue; }
    if (p.air === "wait") continue;
    if (p.air === "plane") {
      const pos = dropPos(t); p.x = pos.x; p.y = pos.y; p.z = 700;
      if (pos.k >= 0.97) jump(p);
      continue;
    }
    if (p.air === "fall") {
      let fx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), fy = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
      if (fx && fy) { fx *= Math.SQRT1_2; fy *= Math.SQRT1_2; }
      p.x = clamp(p.x + fx * 420 * dt, 30, W - 30); p.y = clamp(p.y + fy * 420 * dt, 30, H - 30);
      p.z = Math.max(0, 700 * clamp((p.fallEnd - t) / 2.2, 0, 1));
      if (t > p.fallEnd) { p.air = null; collide(p, 16); p.z = MV.floorAt(p.x, p.y, 10, 2000, WALLS).h; p.vz = 0; p.vx = p.vy = 0; p.gr = true; events.push({ k: "land", x: p.x, y: p.y }); }
      continue;
    }
    if (outsideZone(p) && (game.phase === "night" || game.phase === "royale" || game.phase === "day")) {
      p.hp -= (game.mode === "royale" ? game.zone.dmg : 6) * dt; p.lastHurt = t;
      if (tickN % 15 === 0) p.pe.push({ k: "fog" });
      if (p.hp <= 0) killPlayer(p, null, "lost in the slop fog");
      if (p.dead) continue;
    }
    if (p.dlg) { const n = NPC_POS.find((q) => q.id === p.dlg.npc); if (!n || dist2(n, p) > 150 * 150) { p.dlg = null; sendDlg(p); } }
    if (playing) {
      needs(p, dt, t);
      if (p.inf) { if (t > p.inf.until) cure(p, "The infection passes. You feel almost normal."); else if (t > p.inf.next) nextSymptom(p); }
    }
    const veh = vehOf(p);
    if (p.veh && !veh) p.veh = 0;
    if (!veh) {
      const ev = MV.step(p, { keys: p.keys, yaw: p.a, rel: p.rel }, dt, { sp: speedOf(p), boxes: WALLS, W, H, frozen: t < p.going || !!p.dlg });
      if (ev === "pad") events.push({ k: "pad", x: Math.round(p.x), y: Math.round(p.y) });
      if (p.z > 1400) p.z = 1400;
    } else { p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; p.gr = true; }
    p.heat = Math.max(0, p.heat - 1.6 * dt);
    const mh = maxHp(p);
    if (sk(p, "wind") && t - p.lastHurt > 3) p.hp = Math.min(mh, p.hp + 1.5 * sk(p, "wind") * dt);
    if (sk(p, "rally")) for (const q of alive) if (q !== p && dist2(q, p) < 220 * 220) q.hp = Math.min(maxHp(q), q.hp + 0.8 * sk(p, "rally") * dt);
    if (p.hp > mh) p.hp = mh;
    const w = p.weapons[p.active];
    w.bloom = Math.max(0, w.bloom - dt * 2.2);
    if (w.reloadUntil && t >= w.reloadUntil) { w.reloadUntil = 0; w.ammo = WEAPONS[w.type].mag; }
    if (p.firing && !p.dlg && !(t < p.going) && !(veh && veh.seats[0] === p.id) && (playing || game.phase === "lobby") && !w.reloadUntil && t >= w.nextShot) {
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
    let target = null, bd = (z.type === "boss" || z.type === "elite" || z.type === "flyer" ? 700 : z.arson ? 110 : 420) ** 2;
    // bile and screams make you the only thing worth eating
    for (const p of alive) { let d = dist2(p, z); if (p.bile > t || (z.aggro === p.id && t < z.aggroUntil)) d /= 25; if (d < bd) { bd = d; target = p; } }
    if (target) bd = dist2(target, z);
    if (!target && game.mode === "royale") { if (!z.wander || dist2(z, z.wander) < 900 || Math.random() < dt * 0.1) z.wander = freeSpot(20); }
    const goal = target || (game.mode === "royale" ? z.wander : hc);
    let dx = goal.x - z.x, dy = goal.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (z.steer) { const c = Math.cos(z.steer), s = Math.sin(z.steer); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
    let sp = (z.type === "boss" ? B.speed : def.speed) * (z.type === "runner" ? 1 : 1 + 0.03 * game.night);
    if ((z.type === "boss" || z.type === "elite") && t < z.charge) sp = 380;
    if (z.type === "charger") {
      // wind up, then a straight-line charge that sends people flying. Hitting a wall stuns it.
      if (!z.wind && !(t < z.charge) && target && bd < 420 * 420 && t > z.special && Math.abs(target.z - z.z) < 80) { z.wind = t + 0.7; events.push({ k: "roar", x: z.x, y: z.y, small: 1 }); }
      if (z.wind && t < z.wind) { sp = 0; if (target) z.chDir = Math.atan2(target.y - z.y, target.x - z.x); }
      else if (z.wind) { z.wind = 0; z.charge = t + 1.1; z.special = t + 6; }
      if (t < z.charge) { dx = Math.cos(z.chDir); dy = Math.sin(z.chDir); sp = 560; }
    }
    if (z.type === "screamer" && target && bd < 280 * 280) { dx = -dx; dy = -dy; sp *= 0.8; } // keeps its distance
    if (t < z.stun) sp = 0;
    const ox = z.x, oy = z.y;
    z.x += (dx * sp + z.vx) * dt; z.y += (dy * sp + z.vy) * dt;
    z.vx *= Math.pow(0.03, dt); z.vy *= Math.pow(0.03, dt);
    const touchingHearth = game.mode !== "royale" && z.z < HEARTH.z1 && z.x + z.r > HEARTH.x - 4 && z.x - z.r < HEARTH.x + HEARTH.w + 4 && z.y + z.r > HEARTH.y - 4 && z.y - z.r < HEARTH.y + HEARTH.h + 4;
    // the dead climb: walls, roofs, towers. Not trees, not the Hearth, not your barricades (those they chew).
    const hit = MV.pushOut(z, z.r, WALLS, W, H, z.z, zHeight(z));
    if (z.type === "charger" && t < z.charge && hit && hit !== "edge") { z.charge = 0; z.stun = t + 1.6; events.push({ k: "boom", x: z.x, y: z.y, z: z.z, r: 40, dust: 1 }); }
    if (z.type === "flyer") {
      // flyers circle high, then dive on whoever they're after
      const hd = target ? Math.hypot(target.x - z.x, target.y - z.y) : Infinity;
      const floor = MV.floorAt(z.x, z.y, z.r, 2000, WALLS).h;
      const want = target ? (hd < 180 ? target.z + 16 : Math.max(floor + 110, target.z + 110)) : touchingHearth || Math.hypot(hc.x - z.x, hc.y - z.y) < 120 ? 50 : floor + 140;
      z.z += clamp(want - z.z, -300 * dt, 220 * dt); z.z = Math.max(z.z, floor);
      z.vz = 0; z.gr = false;
    } else {
      const climbable = hit && hit !== "edge" && hit.kind !== "tree" && hit.kind !== "hearth" && hit.kind !== "built";
      if (climbable && (!target || target.z > z.z + 10 || Math.random() < 0.6)) z.vz = Math.max(z.vz, z.type === "runner" ? 220 : z.type === "walker" || z.type === "screamer" ? 130 : 80);
      else if (hit && !touchingHearth) {
        const moved = Math.hypot(z.x - ox, z.y - oy);
        if (moved < sp * dt * 0.4) z.steer = z.steer ? z.steer : (Math.random() < 0.5 ? 1.2 : -1.2);
      } else if (z.steer && Math.random() < dt * 0.8) z.steer = 0;
      MV.vertical(z, dt, WALLS, z.r * 0.8, zHeight(z));
    }
    if (t > z.atk && builds.length && !(target && Math.sqrt(bd) < z.r + 20 && Math.abs(target.z - z.z) < 60)) {
      const piece = builds.find((b) => PIECES[b.bk].solid && rectHitsCircle(b, z, z.r + 6));
      if (piece) { hurtPiece(piece, def.dmg * (z.type === "boss" ? 3 : 1)); z.atk = t + 0.8; }
    }
    if (z.type === "charger" && t < z.charge) {
      for (const q of alive) if (dist2(q, z) < (z.r + 22) ** 2 && Math.abs(q.z - z.z) < 60) {
        hurtPlayer(q, def.dmg * 1.3, null, "flattened by a charger");
        kick(q, Math.cos(z.chDir) * 620, Math.sin(z.chDir) * 620, 330);
        z.charge = 0; z.stun = t + 0.9; z.atk = t + 1;
      }
    }
    if (z.type === "boomer" && target && t > z.special && bd < 110 * 110 && Math.abs(target.z - z.z) < 60) { z.special = t + 7; bile(target.x, target.y, target.z, 60); z.atk = t + 1; }
    if (z.type === "screamer" && t > z.special && target && bd < 700 * 700) {
      // SCREAM: help arrives, and everything nearby goes for whoever it saw
      z.special = t + 10;
      events.push({ k: "scream", x: Math.round(z.x), y: Math.round(z.y), z: Math.round(z.z) });
      for (const o of zombies) if (o !== z && dist2(o, z) < 700 * 700) { o.aggro = target.id; o.aggroUntil = t + 8; }
      if (zombies.length < 160) for (let i = 0; i < 1 + Math.ceil(players.size / 2); i++) spawnZombie("runner", z);
      for (const q of alive) if (dist2(q, z) < 380 * 380) q.pe.push({ k: "deaf" });
    }
    if (t > z.atk) {
      if (target && Math.sqrt(bd) < z.r + 20 && Math.abs(target.z - z.z) < 60) {
        hurtPlayer(target, def.dmg, null, z.type === "boss" ? `folded by ${B.name.toLowerCase().replace("the ", "the ")}` : z.type === "tank" ? "smashed by a tank" : "eaten");
        z.atk = t + 0.8;
        if (z.type === "tank") { const d = Math.sqrt(bd) || 1; kick(target, (target.x - z.x) / d * 420, (target.y - z.y) / d * 420, 240); }
        if (target.id && Math.random() < INFECT) infect(target);
      }
      else if (!target && touchingHearth && game.phase !== "over") { game.hearth -= def.dmg * (z.type === "boss" ? 1.5 : 0.6); z.atk = t + 0.8; events.push({ k: "hhit" }); }
    }
    for (const pl of PLOTS) if (pl.stage > 0 && z.z < 10 && (pl.x - z.x) ** 2 + (pl.y - z.y) ** 2 < 22 * 22) { pl.stage = 0; pl.prog = 0; events.push({ k: "trample", x: pl.x, y: pl.y }); }
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
  if (game.phase === "night" && bossWasAlive && !zombies.some((z) => z.id === game.bossId)) {
    if (game.mode === "story") endGame(true);
    else { game.bossId = 0; game.ends = t + 8; events.push({ k: "banner", text: "BOSS DOWN", sub: "The sun is coming up. Enjoy it while it lasts." }); }
  }
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
      ph: game.phase, n: game.night, left: game.ends === Infinity ? -1 : Math.max(0, r(game.ends - t)), hh: r(game.hearth), hm: game.hearthMax, res: game.result, boss: game.bossId, bk: game.bossKind, valley: VALLEY, fog: game.fog ? 1 : 0, solved: solved() ? 1 : 0 },
    vote: v ? { title: v.ev.title, text: v.ev.text, ch: v.ev.choices.map((c) => [c.label, c.desc]), votes: Object.fromEntries(v.votes), left: Math.max(0, r(v.ends - t)) } : null,
    story: game.story ? { title: game.story.title, pick: game.story.pick, text: game.story.text } : null,
    p: [...players.values()].map((p) => {
      const w = p.weapons[p.active];
      return {
        id: p.id, n: fullName(p), x: r(p.x), y: r(p.y), z: r(p.z), mv: [r(p.vx), r(p.vy), r(p.vz), p.gr ? 1 : 0], pt: p.pt == null ? 0 : +p.pt.toFixed(2), a: +p.a.toFixed(2), hp: r(p.hp), mh: maxHp(p), ar: r(p.armor),
        c: p.color, h: p.hat, ey: p.eyes, cl: p.cls, bg: p.bg, d: p.dead ? 1 : 0, g: p.gold, sd: p.seeds, st: Math.min(5, Math.floor(p.heat / 40)),
        w: w.type, wn: wName(w), wr: w.rarity, we: w.enh, am: w.ammo, hot: w.hot ? 1 : 0, sec: p.weapons.length > 1 ? 1 : 0,
        rl: w.reloadUntil ? +(w.reloadUntil - t).toFixed(2) : 0, rt: w.reloadUntil ? +(w.reloadUntil - w.reloadStart).toFixed(2) : 0, rtr: w.tried ? 1 : 0,
        spr: +spreadOf(p, w).toFixed(3), sc: Math.max(0, +(p.shoutCd - t).toFixed(1)), sp: r(speedOf(p)), tr: p.trait, gen: p.gen,
        lv: p.lvl, xp: p.xp, xn: xpNeed(p.lvl), pts: p.pts, sk: p.sk, ch: p.champion ? 1 : 0,
        air: p.air === "plane" || p.air === "wait" ? 1 : p.air === "fall" ? 2 : 0, rd: p.ready ? 1 : 0, vh: p.veh || 0, trl: p.trail, ttl: p.title ? COSMETICS[p.title].name : "", spn: p.spins, bl: r(p.bl), bw: r(p.bw), inf: p.inf ? p.inf.sym : "", il: p.inf ? r(p.inf.until - t) : 0, go: t < p.going ? p.goKind : "", ads: p.ads ? 1 : 0, out: p.out ? 1 : 0, pk: p.st.pk, gn: p.gren, mo: p.molo, bi: p.bile > t ? 1 : 0, sh: p.shame > t ? 1 : 0, fr: p.fireUntil > t ? 1 : 0,
        nt: [...p.talked], qr: questReady(p), q: Object.entries(p.q).map(([id, qs]) => [QUESTS[id].title, QUESTS[id].desc, Math.min(QUESTS[id].goal, npcApi.progress(p, id)), QUESTS[id].goal, qs.done ? 1 : 0, NPCS[QUESTS[id].npc].name]),
        k: p.st.kills, de: p.st.deaths, cr: p.st.crops, tk: p.st.tk, hs: p.st.hs, acc: p.st.shots ? Math.round(p.st.hits / p.st.shots * 100) : 0,
      };
    }),
    z: zombies.map((z) => [z.id, zCode(z), r(z.x), r(z.y), r((z.hp / z.maxHp) * 100), z.burn || z.fireUntil > t ? 1 : 0, r(z.z), z.wind > t || z.charge > t ? 1 : 0]),
    pr: projs.map((q) => [q.id, q.kind, r(q.x), r(q.y), r(q.z)]),
    fi: [...fires.values()].map((f) => [f.cx, f.cy, r(f.z)]),
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
      p.keys = m.k | 0; p.a = +m.a || 0; p.firing = !!m.f && !p.dead; p.ads = !!m.ads && !p.dead;
      p.pt = typeof m.pt === "number" && isFinite(m.pt) ? clamp(m.pt, -1.5, 1.5) : null; p.rel = !!m.rel;
      break;
    case "reload": { const w = p.weapons[p.active]; if (w.reloadUntil) tryActiveReload(p, w); else startReload(p, w); break; }
    case "swap": if (p.weapons.length > 1) { p.active = m.i === 0 || m.i === 1 ? Math.min(m.i, p.weapons.length - 1) : 1 - p.active; } break;
    case "use": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else if (!p.dead) interact(p); break;
    case "skip": if (game.phase === "intro") game.skip.add(p.id); break;
    case "ready": if (game.phase === "lobby" || game.phase === "over") { p.ready = m.v === undefined ? !p.ready : !!m.v; feed(`${fullName(p)} is ${p.ready ? "ready" : "not ready"}`, p.ready ? "#8f8" : "#aaa"); } break;
    case "build": if (["day", "night", "royale"].includes(game.phase) && !p.dead && !p.air && !p.veh) placePiece(p, String(m.kind), +m.x || 0, +m.y || 0, false); break;
    case "dlg": pickDlg(p, m.i | 0); break;
    case "mode": if (p.id === hostId() && game.phase !== "day" && game.phase !== "night" && game.phase !== "royale" && (m.m === "story" || m.m === "royale" || m.m === "endless")) { game.mode = m.m; broadcastRaw(JSON.stringify(mapMsg())); } break;
    case "shout": doShout(p); break;
    case "go": relieve(p); break;
    case "throw": throwIt(p, m.k === "molo" ? "molo" : "gren"); break;
    case "dodge": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else doDodge(p); break;
    case "buy": buy(p, m.item); break;
    case "spin": doSpin(p); break;
    case "casino": casinoAct(p, m); break;
    case "equip": equip(p, String(m.slot), String(m.id)); break;
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
    if (url.pathname === "/three.js") return new Response(threeJs, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "max-age=86400" } });
    if (url.pathname === "/game.js") return new Response(gameJs, { headers: { "content-type": "application/javascript; charset=utf-8" } });
    if (url.pathname === "/") return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      spectators.add(ws);
      ws.send(JSON.stringify({ t: "hello", wheel: WHEEL, cosmetics: COSMETICS, freeHats: FREE_HATS, shop: SHOP, enhCost: ENH_COST, enhChance: ENH_CHANCE, pieces: PIECES, vehicles: VEHICLES, legends: LEGENDS }));
      ws.send(JSON.stringify(mapMsg()));
    },
    message: onMessage,
    close(ws) {
      spectators.delete(ws);
      const p = players.get(ws.data.pid);
      if (p) { if (p.veh) exitVehicle(p); players.delete(p.id); feed(`${fullName(p)} left the valley`, "#aaa"); if (game.vote) game.vote.votes.delete(p.id); }
      if (players.size === 0 && game.phase !== "lobby") { game.phase = "lobby"; zombies = []; projs = []; fires.clear(); crates = []; vehicles = []; builds = []; WALLS = WALLS.filter((w) => w.kind !== "built"); game.vote = null; game.zone = null; game.drop = null; game.pendingVote = null; }
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
