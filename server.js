// SLOP VALLEY — game server. Run with `bun server.js [port]`.
// Serves the browser client and runs the whole game authoritatively.
import indexHtml from "./public/index.html" with { type: "text" };
import gameSrc from "./public/game.js" with { type: "text" };
import moveJs from "./public/move.js" with { type: "text" };
import r3dJs from "./public/r3d.js" with { type: "text" };
import threeJs from "./public/vendor/three.module.min.js" with { type: "text" };
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { storyEvent, townMeeting, bossKind, BOSSES, ending, valleyName } from "./story.js";
import { NPCS, QUESTS, CLUES, npcLines } from "./npcs.js";
import { COSMETICS, FREE_HATS, rollCosmetic, WHEEL, spinWheel, deck, bjValue, pokerScore, handName, compareHands, dealerHolds } from "./casino.js";
import { LEGENDS, legendOf, legendName, reckoning, legendLines } from "./legend.js";
import { GIFTS, TASTE, SAYS, RING } from "./romance.js";
import { ITEMS, GEAR, SLOTS, GEAR_KEYS, BAG_SIZE, gearSum, bagAdd, bagCount, bagTake, itemName, CROPS, CROP_KEYS, SEED_PACK } from "./items.js";
import { STOCKS, SYMS, FEE, newMarket, shock, marketTick } from "./market.js";
import { CANDIDATES, ELECT_EVERY, ballot } from "./politics.js";
import { CS, makeChunk, BIOMES } from "./world.js";
import { CARDS, LOCS, STARTER, OPPONENTS, DECK_SIZE, newMatch, stage as cgStage, resolveTurn as cgResolve, aiPlays, view as cgView, deckFor, packCard } from "./cards.js";

const MV = new Function(moveJs + "\nreturn MV;")(); // the same movement code the browser predicts with
const gameJs = moveJs + "\n" + r3dJs + "\n" + gameSrc;
const PORT = Number(process.argv[2] || process.env.PORT || 7777);
const TICK_RATE = 30;
const SNAP_EVERY = 2; // 15 snapshots/sec
const FAST = !!process.env.SLOP_FAST; // testing only: short phases
const DAY_LEN = Number(process.env.SLOP_DAY) || (FAST ? 6 : 85);
const NIGHT_LEN = FAST ? 8 : 100;
const LAST_NIGHT = 5; // the earliest the final night can come. In the story it waits until the mystery is solved.
const ENDLESS_BOSS_EVERY = 5;
const FOG_NIGHT = process.env.SLOP_FOGNIGHT ? 1 : 0.3; // chance a night (from night 2) is a fog night
const DINO_FORCE = !!process.env.SLOP_DINO; // every day is Dinosaur Day (for testing)
// Dinosaurs only come on DINOSAUR DAY: day 4 of the story, and in endless day 4 and every 7th day after.
// That day (and its night) nothing but dinosaurs crawls out of the well, and fewer of them than a normal night.
function isDinoDay(day) { if (game.mode === "royale") return false; if (DINO_FORCE) return day >= 2; return game.mode === "story" ? day === 4 : day >= 4 && (day - 4) % 7 === 0; }
const DISASTER = process.env.SLOP_DISASTER || ""; // testing only: force a disaster every phase
const DISASTER_CHANCE = 0.18;
const DROP_LEN = FAST ? 4 : 12; // seconds the balloon takes to cross the valley
const ROYALE_ZONES = [ // [wait, shrink, radius]
  [60, 45, 1400], [40, 35, 900], [30, 25, 520], [25, 20, 240], [20, 20, 0],
].map(([w, s, r]) => [FAST ? w / 6 : w, FAST ? s / 4 : s, r]);
const STORY_ZONE_R = [2300, 1850, 1450, 1180, 980, 820];
const TEST_DMG = Number(process.env.SLOP_DMG || 1); // testing only
const TEST_TP = !!process.env.SLOP_TP; // testing only: lets a test script move players about
const NUKE_CHANCE = process.env.SLOP_NUKE ? 1 : 0.04; // chance, each dawn and dusk from night 5 (after the first, certain strike), that somebody presses the button
const NUKE_WARN = FAST ? 12 : 20; // seconds to get to the bunker
const GUESTS = ["chef", "bear", "boulder", "david", "warren"]; // one celebrity visits each story run
const UNLUCKY = process.env.SLOP_UNLUCKY ? 1 : 0.00004; // 0.004% per level-up or upgrade. As requested.
const INFECT = process.env.SLOP_INFECT ? 1 : 0.03; // chance a bite infects you
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
const W = 3400, H = 2600; // the Hearth sits in the middle, the farm either side of it
const HEARTH = { x: 1620, y: 1240, w: 160, h: 120, kind: "hearth", z0: 0, z1: 90 };
let WALLS = [HEARTH];
let MAP_SEED = 1;
let VALLEY = "Slopholm";
const PLOTS = [];
for (const baseX of [1330, 1890]) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
  PLOTS.push({ x: baseX + c * 64 + 28, y: 1200 + r * 64 + 28, stage: 0, prog: 0, rate: 1, owner: 0 });
const BASE_PLOTS = PLOTS.length;
// the produce stall, by the right-hand field: Old Giles buys what you grow and sells seeds, daytime only
const STALL = { x: 1950, y: 1440, w: 110, h: 40, kind: "stall", sid: "produce", z0: 0, z1: 34 };
// the shops: Vex's general store and Haddock's armoury sit just south of the Hearth (open by day), the casino is out in town (always open)
const STORE = { x: 1300, y: 1440, w: 150, h: 46, kind: "shop", sid: "general", z0: 0, z1: 64 };
const ARMOURY = { x: 1625, y: 1545, w: 150, h: 46, kind: "shop", sid: "armoury", z0: 0, z1: 64 };
const SHOPS = {
  general: { name: "Vex's General Store", keeper: "Vex", hours: "day", shut: "Vex has shut up shop for the night. Back at dawn." },
  armoury: { name: "Haddock's Armoury", keeper: "Sergeant Haddock", hours: "day", shut: "The armoury's locked. Haddock is on night watch, not on the till." },
  casino:  { name: "The Golden Slop", keeper: "Lucky Lou", hours: "always" },
  hearth:  { name: "The Hearth", hours: "always" },
};
let CASINO = null;
const shopWall = (sid) => sid === "hearth" ? HEARTH : WALLS.find((w) => w.kind === "shop" && w.sid === sid);
const shopIsOpen = (sid) => game.mode !== "royale" && (SHOPS[sid].hours !== "day" || game.phase !== "night");
const nearShop = (p, sid) => { const w = shopWall(sid); return !!w && rectHitsCircle(w, p, sid === "hearth" ? 80 : 84); };
let KEEPERS = [{ id: "giles", sid: "produce", name: "Old Giles", role: "Produce stall. Buys crops, sells seeds.", color: "#8a6a3a", hat: "flatcap", x: STALL.x + STALL.w / 2, y: STALL.y - 22, hours: "day" }];
const stallOpen = (k) => k.hours !== "day" || game.phase !== "night";
const nearStall = (p) => rectHitsCircle(STALL, p, 80);
// what a crop sells for right now: the farmers' co-op share price moves the whole market
function cropPrice(p, id) {
  const fair = STOCKS.FARM.p, k = clamp(game.market.px.FARM / fair, 0.4, 1.5);
  return Math.max(1, Math.round(CROPS[id].sell * k * (p && p.cls === "farmer" ? 1.25 : 1) * (1 + 0.08 * ((p && p.hoe) || 0))));
}
const seedPrice = (p, id) => price(p, CROPS[id].seed * SEED_PACK);
const seedCount = (p) => p.bag.reduce((a, b) => a + (ITEMS[b.id] && ITEMS[b.id].kind === "seed" ? b.n : 0), 0);
function takeSeed(p) { // the packet you picked in your bag, else the cheapest you have
  let id = p.seedSel && bagCount(p.bag, "s_" + p.seedSel) ? p.seedSel : null;
  if (!id) id = CROP_KEYS.filter((c) => bagCount(p.bag, "s_" + c)).sort((a, b) => CROPS[a].seed - CROPS[b].seed)[0];
  if (!id) return null;
  bagTake(p.bag, "s_" + id); p.invDirty = true;
  return id;
}
// the hoe: till new plots anywhere on open ground. Each upgrade lets you till more, grows faster and sells for more.
const HOES = ["", "Hoe", "Steel Hoe", "Golden Hoe"];
const HOE_COST = [40, 90, 160];
const hoeLimit = (lvl) => 3 + 3 * lvl;

const bunkerWall = () => WALLS.find((w) => w.kind === "bunker");
const WALL_HP = { house: 1100, fence: 160, crate: 180, tree: 320, rock: 800, hwall: 1, furn: 60 };
const WOODEN = new Set(["house", "fence", "crate", "tree", "hwall", "furn"]);
let wallId = 1, mapVer = 0, mapDirty = false, PITCH = null, LAKE = null, LAKE_SOLID = [];
const LAKE_D = 260; // how deep the lake is
const inHouse = (p) => WALLS.some((w) => w.kind === "house" && p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h);
const BALL = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, last: 0, resetAt: 0 };
function damageWall(w, dmg) {
  if (w.kind === "built") { const b = builds.find((q) => q === w); if (b) hurtPiece(b, dmg * 0.5); return; }
  if (w.kind === "hwall") { const h = WALLS.find((o) => o.id === w.hid); if (h) damageWall(h, dmg); return; } // a house's walls share its health
  if (!w.hp || w.hp <= 0) return;
  w.hp -= dmg;
  if (w.hp > 0) return;
  WALLS = WALLS.filter((o) => o !== w && !(w.kind === "house" && o.hid === w.id));
  events.push({ k: "collapse", x: Math.round(w.x + w.w / 2), y: Math.round(w.y + w.h / 2), w: Math.round(w.w), h: Math.round(w.h), z: w.z1 || 40, kind: w.kind });
  if (w.kind === "house") WALLS.push({ id: wallId++, x: w.x + 10, y: w.y + 10, w: w.w - 20, h: w.h - 20, kind: "rubble", roof: w.roof, z0: 0, z1: 22 });
  if (w.kind === "crate" && Math.random() < 0.15) crates.push({ id: nextId++, x: w.x + w.w / 2, y: w.y + w.h / 2, w: newWeapon(pick(LOOT_TYPES), lootRarity(game.night)) });
  mapVer++; mapDirty = true;
}
// the distance from a point to a box, in 3D
function boxDist(w, x, y, z) {
  const dx = Math.max(w.x - x, 0, x - (w.x + w.w)), dy = Math.max(w.y - y, 0, y - (w.y + w.h)), dz = Math.max((w.z0 || 0) - z, 0, z - (w.z1 || 60));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function generateMap(seed) {
  MAP_SEED = seed;
  const rng = mulberry(seed);
  const R = (a, b) => a + rng() * (b - a);
  VALLEY = valleyName(rng);
  const walls = [HEARTH, { ...STALL }, { ...STORE }, { ...ARMOURY }];
  const clear = { x: 1260, y: 1100, w: 880, h: 400 }; // farm + hearth stay open
  const overlaps = (r, pad) => {
    if (r.x < 60 || r.y < 60 || r.x + r.w > W - 60 || r.y + r.h > H - 60) return true;
    const hit = (o) => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y;
    return hit(clear) || (pitch && hit(pitch)) || walls.some(hit);
  };
  let pitch = null;
  const place = (n, mk, pad) => { for (let i = 0, tries = 0; i < n && tries < 400; tries++) { const r = mk(); if (!overlaps(r, pad)) { walls.push(r); i++; } } };
  // a football pitch, for stress relief. Goals at each end.
  for (let tries = 0; tries < 200 && !pitch; tries++) {
    const pw = 640, ph = 360, r = { x: Math.round(R(120, W - pw - 120)), y: Math.round(R(120, H - ph - 120)), w: pw, h: ph };
    if (overlaps(r, 80)) continue;
    pitch = r;
    const cy = r.y + ph / 2;
    for (const gx of [r.x - 12, r.x + pw + 2]) walls.push({ x: gx, y: cy - 70, w: 10, h: 10, kind: "post", z0: 0, z1: 70 }, { x: gx, y: cy + 60, w: 10, h: 10, kind: "post", z0: 0, z1: 70 }, { x: gx, y: cy - 70, w: 10, h: 140, kind: "post", z0: 62, z1: 70 });
  }
  PITCH = pitch;
  // a deep lake, with a sunken shrine at the bottom
  let lake = null;
  for (let tries = 0; tries < 300 && !lake; tries++) {
    const lw = Math.round(R(560, 700)), lh = Math.round(R(420, 520)), r = { x: Math.round(R(140, W - lw - 140)), y: Math.round(R(140, H - lh - 140)), w: lw, h: lh };
    if (overlaps(r, 110)) continue;
    lake = r;
  }
  LAKE = null; LAKE_SOLID = [];
  if (lake) {
    const bed = -LAKE_D, B = 24, cx = lake.x + lake.w / 2, cy = lake.y + lake.h / 2;
    LAKE = { ...lake, kind: "lake", z0: bed, z1: 0 };
    LAKE_SOLID = [{ x: lake.x, y: lake.y, w: lake.w, h: lake.h, z0: -9999, z1: 9999 }];
    walls.push(LAKE,
      { x: lake.x - B, y: lake.y - B, w: lake.w + 2 * B, h: B, kind: "bank", z0: bed - 40, z1: 0 }, { x: lake.x - B, y: lake.y + lake.h, w: lake.w + 2 * B, h: B, kind: "bank", z0: bed - 40, z1: 0 },
      { x: lake.x - B, y: lake.y, w: B, h: lake.h, kind: "bank", z0: bed - 40, z1: 0 }, { x: lake.x + lake.w, y: lake.y, w: B, h: lake.h, kind: "bank", z0: bed - 40, z1: 0 });
    walls.push({ x: cx - 80, y: cy - 50, w: 160, h: 100, kind: "shrine", z0: bed, z1: bed + 90 });
    const gx = [lake.x + 70, lake.x + lake.w - 100], gy = [lake.y + 70, lake.y + lake.h - 100];
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([i, j], g) => walls.push({ x: gx[i], y: gy[j], w: 30, h: 30, kind: "glyph", g, z0: bed, z1: bed + 80 }));
    walls.push({ x: cx - 200, y: cy - 20, w: 40, h: 40, kind: "vent", z0: bed, z1: bed + 4 }, { x: cx + 160, y: cy - 20, w: 40, h: 40, kind: "vent", z0: bed, z1: bed + 4 });
    for (let i = 0; i < 7; i++) { const s2 = R(40, 80); walls.push({ x: R(lake.x + 30, lake.x + lake.w - 110), y: R(lake.y + 30, lake.y + lake.h - 110), w: s2, h: s2 * R(0.7, 1.1), kind: "rock", z0: bed, z1: bed + Math.round(R(30, 70)) }); }
  }
  // a concrete fallout bunker. Nobody has been inside it for years.
  place(1, () => ({ x: Math.round(R(300, W - 420)), y: Math.round(R(260, H - 360)), w: 120, h: 90, kind: "bunker", z0: 0, z1: 30 }), 70);
  if (!walls.some((w) => w.kind === "bunker")) walls.push({ x: 1900, y: 1600, w: 120, h: 90, kind: "bunker", z0: 0, z1: 30 });
  // the casino: a big gaudy box with a neon sign, somewhere in town
  place(1, () => { const x = Math.round(R(200, W - 460)), y = Math.round(R(200, H - 380)); return Math.hypot(x + 130 - 1700, y + 80 - 1300) > 600 ? { x, y, w: 260, h: 160, kind: "shop", sid: "casino", z0: 0, z1: 120 } : { x: 0, y: 0, w: W, h: H }; }, 90);
  if (!walls.some((w) => w.sid === "casino")) walls.push({ x: 2300, y: 1650, w: 260, h: 160, kind: "shop", sid: "casino", z0: 0, z1: 120 });
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
  for (let i = 0, tries = 0; i < 3 + ((rng() * 3) | 0) && tries < 400; tries++) { // pairs of towers with a catwalk between them
    const top = Math.round(R(170, 230)), tw = 76, gap = Math.round(R(220, 420)), horiz = rng() < 0.5;
    const ax = R(100, W - 700), ay = R(100, H - 600);
    const a = { x: ax, y: ay, w: tw, h: tw, kind: "tower", z0: 0, z1: top };
    const b = horiz ? { ...a, x: ax + tw + gap } : { ...a, y: ay + tw + gap };
    const br = horiz ? { x: ax + tw, y: ay + tw / 2 - 22, w: gap, h: 44, kind: "bridge", z0: top - 14, z1: top } : { x: ax + tw / 2 - 22, y: ay + tw, w: 44, h: gap, kind: "bridge", z0: top - 14, z1: top };
    const st = stairs(a.x, a.y, tw, tw, top, horiz ? 1 : 3);
    if (group([a, b, br, ...st], 60)) i++;
  }
  place(8 + ((rng() * 6) | 0), () => ({ x: R(80, W - 320), y: R(80, H - 260), w: R(170, 280), h: R(120, 180), kind: "house", roof: (rng() * 4) | 0, z0: 0, z1: Math.round(R(96, 136)) }), 90);
  // some houses get an outside staircase to the roof
  for (const h of walls.filter((w) => w.kind === "house")) {
    if (rng() < 0.35) continue;
    const dir = (rng() * 4) | 0, st = stairs(h.x, h.y, h.w, h.h, h.z1, dir);
    walls.splice(walls.indexOf(h), 1);
    if (group(st, 40)) h.st = dir;
    walls.push(h);
  }
  // floating ledges, each with a jump pad beside it
  for (let i = 0, tries = 0; i < 5 && tries < 300; tries++) {
    const x = R(120, W - 320), y = R(120, H - 320), z0 = Math.round(R(130, 170));
    const ledge = { x, y, w: 120, h: 120, kind: "ledge", z0, z1: z0 + 16 };
    const pad = { x: x + 140, y: y + 40, w: 40, h: 40, kind: "pad", z0: 0, z1: 4 };
    if (!overlaps({ x: x - 10, y: y - 10, w: 200, h: 140 }, 50)) { walls.push(ledge, pad); i++; }
  }
  place(10 + ((rng() * 8) | 0), () => { const s = R(55, 95); return { x: R(80, W - 160), y: R(80, H - 160), w: s, h: s * R(0.7, 1.1), kind: "rock", z0: 0, z1: Math.round(R(30, 64)) }; }, 70);
  place(18 + ((rng() * 14) | 0), () => { const s = R(40, 56); return { x: R(80, W - 120), y: R(80, H - 120), w: s, h: s, kind: "tree", z0: 0, z1: 260 }; }, 50);
  place(6 + ((rng() * 6) | 0), () => rng() < 0.5 ? { x: R(80, W - 260), y: R(80, H - 80), w: R(120, 220), h: 18, kind: "fence", z0: 0, z1: 34 } : { x: R(80, W - 80), y: R(80, H - 260), w: 18, h: R(120, 220), kind: "fence", z0: 0, z1: 34 }, 70);
  place(5 + ((rng() * 4) | 0), () => ({ x: R(80, W - 140), y: R(80, H - 140), w: 44, h: 44, kind: "pad", z0: 0, z1: 4 }), 60); // jump pads out in the open
  place(8 + ((rng() * 6) | 0), () => ({ x: R(80, W - 140), y: R(80, H - 140), w: 50, h: 50, kind: "crate", z0: 0, z1: 50 }), 50); // hay bales to hop on
  // houses are hollow: four walls and a door, a roof you can still stand on, a bed and a table inside
  for (const h of walls.filter((w) => w.kind === "house")) {
    const T = 10, dw = 48, cx = h.x + h.w / 2, top = h.z1 - 10, north = h.st === 2; // the door goes on the side without stairs
    h.z0 = top; h.door = north ? "n" : "s";
    const wall = (x, y, w, hh, z0 = 0, z1 = top) => walls.push({ x, y, w, h: hh, kind: "hwall", house: h, roof: h.roof, z0, z1 });
    const front = (y) => { wall(h.x, y, (h.w - dw) / 2, T); wall(cx + dw / 2, y, (h.w - dw) / 2, T); wall(cx - dw / 2, y, dw, T, 66, top); };
    if (north) { front(h.y); wall(h.x, h.y + h.h - T, h.w, T); } else { wall(h.x, h.y, h.w, T); front(h.y + h.h - T); }
    wall(h.x, h.y + T, T, h.h - 2 * T); wall(h.x + h.w - T, h.y + T, T, h.h - 2 * T);
    walls.push({ x: h.x + T + 6, y: north ? h.y + h.h - T - 84 : h.y + T + 4, w: 52, h: 80, kind: "furn", f: "bed", house: h, z0: 0, z1: 18 });
    walls.push({ x: h.x + h.w - T - 58, y: h.y + h.h / 2 - 18, w: 48, h: 36, kind: "furn", f: "table", house: h, z0: 0, z1: 28 });
  }
  // most things can be blown up (or burnt down)
  walls.forEach((w, i) => { w.id = i + 1; const hp = WALL_HP[w.kind]; if (hp) w.hp = w.maxHp = hp; });
  for (const w of walls) if (w.house) { w.hid = w.house.id; delete w.house; }
  wallId = walls.length + 1;
  WALLS = walls; mapVer++; CHUNKS.clear();
  CASINO = walls.find((w) => w.sid === "casino");
  KEEPERS = [KEEPERS[0], { id: "lou", sid: "casino", name: "Lucky Lou", role: "The Golden Slop. Cases, the wheel, the tables.", color: "#c03050", hat: "tophat", x: CASINO.x + CASINO.w / 2 + 50, y: CASINO.y + CASINO.h + 22, hours: "always" }];
}
// ---------------------------------------------------------------- geometry
// Story and Endless are played in an endless world: the town, and the wild past its hedge. Royale keeps its fence.
let gameReady = false; // the map is built before `game` exists
const OPEN = () => !gameReady || game.mode !== "royale";
const BW = () => (OPEN() ? Infinity : W), BH = () => (OPEN() ? Infinity : H);
const TOWN = { x: 0, y: 0, w: W, h: H };
const inTownXY = (x, y, pad = 0) => x > -pad && y > -pad && x < W + pad && y < H + pad;
// a coarse grid over the walls, so nothing has to check every tree in the wild
const GC = 500, GPAD = 160;
let gridSrc = null, gridLen = -1, gridVer = -1, WGRID = new Map();
function gridFor() {
  if (gridSrc === WALLS && gridLen === WALLS.length && gridVer === mapVer) return WGRID;
  WGRID = new Map(); gridSrc = WALLS; gridLen = WALLS.length; gridVer = mapVer;
  for (const w of WALLS) {
    const i0 = Math.floor((w.x - GPAD) / GC), i1 = Math.floor((w.x + w.w + GPAD) / GC), j0 = Math.floor((w.y - GPAD) / GC), j1 = Math.floor((w.y + w.h + GPAD) / GC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 100003 + j; let c = WGRID.get(k); if (!c) WGRID.set(k, (c = [])); c.push(w); }
  }
  return WGRID;
}
const EMPTY = [];
function nearXY(x, y) { return gridFor().get(Math.floor(x / GC) * 100003 + Math.floor(y / GC)) || EMPTY; }
const near = (e) => nearXY(e.x, e.y);
function wallsAlong(x, y, dx, dy, len) { // every wall in the cells a ray passes through
  const g = gridFor(), seen = new Set(), out = [];
  const n = Math.ceil(len / (GC / 2)) + 1;
  for (let i = 0; i <= n; i++) { const t = Math.min(len, i * GC / 2), c = g.get(Math.floor((x + dx * t) / GC) * 100003 + Math.floor((y + dy * t) / GC)); if (c) for (const w of c) if (!seen.has(w)) { seen.add(w); out.push(w); } }
  return out;
}
const CHUNKS = new Map(); // "cx,cy" -> { kind }
generateMap((Math.random() * 1e9) | 0);
let NPC_POS = [];
function placeNpcs() {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  NPC_POS = [{ id: "grubb", x: hc.x - 40, y: HEARTH.y - 40 }, { id: "haddock", x: ARMOURY.x + ARMOURY.w / 2, y: ARMOURY.y - 22 }, { id: "vex", x: STORE.x + STORE.w / 2, y: STORE.y - 22 }]; // shopkeepers stand behind their counters
  for (const id of ["aldous", "pell", "morwen"]) {
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
  // everyone gets a house to run home to at night
  const houses = WALLS.filter((w) => w.kind === "house"), hc2 = (h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });
  for (const n of NPC_POS) {
    n.hx = n.x; n.hy = n.y; n.a = Math.PI / 2; n.path = []; n.atHome = false;
    const h = houses.filter((q) => !NPC_POS.some((o) => o.home === q.id)).sort((a, b) => dist2(hc2(a), n) - dist2(hc2(b), n))[0];
    n.home = h ? h.id : 0;
  }
}
placeNpcs();
function houseDoor(h) {
  const cx = h.x + h.w / 2, south = h.door !== "n";
  return { out: { x: cx, y: south ? h.y + h.h + 36 : h.y - 36 }, inn: { x: cx, y: south ? h.y + h.h - 34 : h.y + 34 }, mid: { x: cx, y: h.y + h.h / 2 + (south ? -6 : 6) } };
}
// night: the townsfolk run home and shut the door. Morning: back out to their usual spots.
function npcRoute(n, home) {
  const h = n.home && WALLS.find((w) => w.id === n.home && w.kind === "house");
  n.wait = now() + rand(0, 3);
  if (!h) { n.path = [{ x: n.hx, y: n.hy }]; n.atHome = false; return; }
  const d = houseDoor(h), south = h.door !== "n", spot = { x: n.hx, y: n.hy };
  const behind = south ? spot.y < h.y + h.h / 2 : spot.y > h.y + h.h / 2; // go round the house, not through it
  const corner = { x: spot.x < h.x + h.w / 2 ? h.x - 40 : h.x + h.w + 40, y: d.out.y };
  const outside = behind ? [corner, d.out] : [d.out];
  if (home && !n.atHome) n.path = [...outside, d.inn, d.mid];
  else if (!home && n.atHome) n.path = [d.inn, ...outside.reverse(), spot];
  else n.path = home ? [] : [spot];
  n.atHome = home;
}
function npcTick(t, dt) {
  for (const n of NPC_POS) {
    if (!n.path || !n.path.length || t < (n.wait || 0)) continue;
    if ([...players.values()].some((p) => p.dlg && p.dlg.npc === n.id)) continue; // politely waits while you're talking
    const g = n.path[0], dx = g.x - n.x, dy = g.y - n.y, d = Math.hypot(dx, dy), sp = (game.phase === "night" ? 160 : 85) * dt;
    if (d > 0.5) n.a = Math.atan2(dy, dx);
    if (d <= sp) { n.x = g.x; n.y = g.y; n.path.shift(); if (!n.path.length && n.atHome) n.a = Math.PI / 2; }
    else { n.x += dx / d * sp; n.y += dy / d * sp; }
  }
}
function npcList() { return game.mode !== "story" ? [] : NPC_POS.map((n) => ({ ...n, name: NPCS[n.id].name, role: NPCS[n.id].role, color: NPCS[n.id].color, hat: NPCS[n.id].hat, guest: NPCS[n.id].guest ? 1 : 0, quips: NPCS[n.id].quips || null, ride: NPCS[n.id].ride || null })); }
const WELL = { x: 1775, y: 1145 };
function mapMsg() { return { t: "map", map: { W, H, ver: mapVer, walls: WALLS.filter((w) => w.kind !== "built" && !w.ck), hearth: HEARTH, well: WELL, pitch: PITCH, plots: PLOTS.map((p) => ({ x: p.x, y: p.y })), seed: MAP_SEED, valley: VALLEY, npcs: npcList(), keepers: game.mode === "royale" ? [] : KEEPERS } }; }

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
  raptor:   { r: 16, hp: 90, speed: 172, dmg: 10, gold: 22, xp: 16, code: "d" }, // hunts in packs and pounces
  rex:      { r: 40, hp: 1100, speed: 78, dmg: 32, gold: 160, xp: 90, code: "y" }, // roars, stomps through fences
};
const zCode = (z) => ZTYPES[z.type].code || z.type[0];

const SHOP = {
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
// which counter sells what
for (const [id, it] of Object.entries(SHOP)) it.shop = ["repair", "dome50", "dome250"].includes(id) ? "hearth" : ["case", "gcase"].includes(id) ? "casino" : it.cat === "arms" || it.cat === "gear" || id === "enhance" ? "armoury" : "general";

const VEHICLES = {
  tractor: { name: "Tractor",    r: 28, max: 260, acc: 240, turn: 2.2, hp: 700, ram: 1.6 },
  buggy:   { name: "Slop Buggy", r: 24, max: 480, acc: 430, turn: 3.0, hp: 300, ram: 1.0 },
  heli:    { name: "Crop Chopper", r: 34, max: 520, acc: 0, turn: 1.7, hp: 650, ram: 0, air: true },
  gunship: { name: "Slop Gunship", r: 40, max: 430, acc: 0, turn: 1.4, hp: 1200, ram: 0, air: true, gun: true },
};
const PIECES = {
  wall:   { name: "Wall",   cost: 25,  hp: 300, solid: true, z1: 70,  desc: "Blocks the dead (and bullets). They will chew through it." },
  spikes: { name: "Spikes", cost: 35,  hp: 1,   solid: false, uses: 15, desc: "Hurts whatever walks over it. 15 uses." },
  turret: { name: "Turret", cost: 140, hp: 300, solid: true, z1: 50,  range: 380, rate: 2.2, dmg: 16, desc: "Shoots the nearest threat. Never needs reloading." },
  lamp:   { name: "Lamp",   cost: 20,  hp: 80,  solid: false, desc: "Lights up the night around it." },
};
const GRID = 40;

function collide(e, r) { return !!MV.pushOut(e, r, near(e), BW(), BH()); } // at the entity's own height (ground level if it has none)
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
function freeGround(p) { return MV.floorAt(p.x, p.y, 20, 0, near(p)).h === 0 && !near(p).some((w) => w.kind === "pad" && MV.touches(w, p.x, p.y, 40)); }
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
let nextId = 1;
const players = new Map(); // id -> player
let zombies = [];
let crates = [];
let events = [];
let vehicles = [];
let builds = [];
const freshMods = () => ({ hearthRegen: 0, zHp: 1, zCount: 1, dmg: 1, shoutCd: 1, speed: 1, hpBonus: 0, taxFree: false, nightCut: 1, bossHp: 1, discount: 0, grow: 1, hunger: 1, fee: FEE });
const freshDeeds = () => ({ blood: 0, soil: 0, coin: 0, word: 0 });
const game = { mode: "story", countdown: 0, skip: new Set(), deeds: freshDeeds(), legend: null, prev: null, pendingVote: null, zone: null, drop: null, aff: {}, clues: new Set(), phase: "lobby", night: 0, ends: 0, hearth: 1000, hearthMax: 1000, result: null, spawnLeft: 0, spawnNext: 0, bossId: 0, bossKind: "leshen", stats: null, flags: { valley: VALLEY }, mods: freshMods(), vote: null, story: null, ending: null,
  market: newMarket(), mayor: null, elec: null, nuke: null, waste: false, hot: [], posadAt: 0, tip: null, cameo: "chef" };
gameReady = true;

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
    cards: STARTER.reduce((a, id) => { a[id] = (a[id] || 0) + 1; return a; }, {}), deck: [], // your Slop Snap collection stays with you between games
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
  p.hoe = p.cls === "farmer" ? 1 : 0; p.stress = 0; p.meltdown = 0; p.elem = "force";
  p.love = {}; p.dating = null; p.spouse = null; p.gifted = new Set(); p.breath = 15;
  p.bag = [{ id: "bread", n: 2 }, { id: "water", n: 2 }, { id: "bandage", n: 1 }]; p.gear = {};
  p.food = 85; p.water = 85; p.rad = 0; p.drunk = 0; p.fizz = 0; p.iodine = 0; p.shares = {}; p.basis = {}; p.cg = null; p.kt = new Set();
  p.st.ateGrown = 0; p.st.ztypes = 0; p.st.sharesBought = 0; p.st.cardWins = 0; p.invDirty = true;
}
function resetLoadout(p, fresh) {
  p.hp = maxHp(p); p.armor = 0;
  p.weapons = [newWeapon("pistol")];
  if (fresh && CLASSES[p.cls].start) p.weapons.push(newWeapon(CLASSES[p.cls].start));
  p.active = p.weapons.length - 1;
  if (fresh) { p.gold = (FAST ? 2000 : 50) + (BACKGROUNDS[p.bg].gold || 0); bagAdd(p.bag, "s_turnip", p.cls === "farmer" ? 6 : 3); if (p.cls === "farmer") bagAdd(p.bag, "s_potato", 3); p.invDirty = true; }
  p.gren = Math.max(p.gren || 0, fresh ? 2 : 1); p.molo = Math.max(p.molo || 0, fresh ? 1 : 0); p.bile = 0; p.throwAt = 0;
  Object.assign(p, hearthSpawn(), { z: 0, vx: 0, vy: 0, vz: 0, gr: true });
}

function deed(k, n) { if (game.mode === "story") game.deeds[k] += n; }
function toast(p, text, color) { p.pe.push({ k: "toast", text, color }); }
function feed(text, color) { events.push({ k: "feed", text, color }); }
function chat(from, text, color) { events.push({ k: "chat", from, text, color }); }

const earning = () => game.phase !== "lobby" && game.phase !== "over"; // nothing is earned in the lobby
function addXp(p, amt) {
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
  if (!earning()) return;
  amt = Math.round(amt * (1 + (traitOf(p).gold || 0)));
  p.gold += amt; p.st.gold += amt;
  for (const g of gaffers()) if (g !== p) { const fee = Math.max(1, Math.round(amt * 0.1)); g.gold += fee; g.st.gold += fee; }
  if (reason) p.pe.push({ k: "gold", amt, reason });
}
const wading = (e) => game.disaster && game.disaster.kind === "flood" && (e.z || 0) < game.disaster.water - 6;
const crouched = (p) => !!(p.keys & 64) && p.gr && !p.swim && !p.veh && !p.dead; // CTRL on land
function speedOf(p) {
  let s = 210 * CLASSES[p.cls].speed * (1 + (traitOf(p).speed || 0)) * (1 + 0.06 * sk(p, "fleet")) * game.mods.speed;
  if (inAura(p)) s *= 1.1;
  if (p.weapons[p.active]?.type === "sniper") s *= 0.85;
  if (p.ads) s *= 0.6;
  if (crouched(p)) s *= 0.5;
  if (now() < p.soggy) s *= 0.8;
  if (wading(p)) s *= 0.55;
  if (p.swim) s *= 1 + gearSum(p.gear, "swim"); else s *= Math.max(0.5, 1 + gearSum(p.gear, "speed"));
  if (now() < p.fizz) s *= 1.2;
  if (p.water <= 0 || p.food <= 0) s *= 0.85;
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
function reloadTime(p, w) { return WEAPONS[w.type].reload * (1 - 0.15 * sk(p, "quick")) * (1 - Math.min(0.5, gearSum(p.gear, "reload"))); }
// current cone half-angle: tight first shot, blooms while spraying, worse while moving
function spreadOf(p, w) {
  const def = WEAPONS[w.type];
  const moving = p.keys & 15;
  let s = def.spread * (0.3 + w.bloom) * (1 + (traitOf(p).spread || 0));
  if (moving) s *= w.type === "sniper" ? 8 : 1.7;
  if (w.type === "shotgun") s = def.spread * (moving ? 1.15 : 1);
  if (p.ads) s *= w.type === "shotgun" ? 0.75 : 0.4;
  if (crouched(p)) s *= 0.6; // a steadier aim, crouched
  if (p.stress > 60) s *= 1 + (p.stress - 60) / 50; // shaky hands
  if (p.drunk > 0) s *= 1 + p.drunk / 45; // grog
  s *= 1 - Math.min(0.5, gearSum(p.gear, "spread"));
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
  p.inf = { until: now() + 40, sym: "", next: 0 };
  nextSymptom(p);
  feed(`${fullName(p)} got bitten and doesn't look well.`, "#9fdc5a");
}
function nextSymptom(p) {
  const opts = Object.keys(SYMPTOMS).filter((k) => k !== p.inf.sym);
  p.inf.sym = SYMPTOMS[FORCE_SYM] ? FORCE_SYM : pick(opts); p.inf.next = now() + 20;
  p.pe.push({ k: "sym", sym: p.inf.sym, text: SYMPTOMS[p.inf.sym] });
}
function cure(p, why) { if (!p.inf) return; p.inf = null; p.pe.push({ k: "sym", sym: "", text: why }); }
// stress: nights, wounds, screams and dead friends wind you up. Football is the only real cure.
function stress(p, dt, t) {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let d = 0;
  if (game.phase === "night") d += 0.17 + (game.fog ? 0.12 : 0) + (game.dino ? 0.1 : 0);
  else if (game.phase === "royale") d += 0.25;
  else d -= 0.15;
  if (dist2(p, hc) < 260 * 260) d -= 0.3;
  p.stress = clamp((p.stress || 0) + d * dt * (FAST ? 4 : 1), 0, 100);
  if (p.stress >= 60 && !p.warnStress) { p.warnStress = true; toast(p, "You're getting stressed. Your aim is shaking. Go and kick a football about.", "#ff9a60"); }
  if (p.stress < 45) p.warnStress = false;
  if (p.stress >= 100 && !(t < p.meltdown)) {
    p.meltdown = t + 6; p.stress = 75;
    feed(`${fullName(p)} is having a complete meltdown.`, "#ff9a60");
    events.push({ k: "say", id: p.id, text: pick(["I CAN'T DO THIS ANYMORE", "WHY ARE THERE SO MANY OF THEM", "I JUST WANTED TO GROW TURNIPS", "AAAAAAAAAAAAAA"]) });
    toast(p, "MELTDOWN. Your hands are shaking too much to shoot. Play some football.", "#ff6040");
  }
}
function addStress(p, n) { if (p && !p.dead) p.stress = clamp((p.stress || 0) + n, 0, 100); }
function ballTick(t, dt) {
  if (!PITCH) return;
  const cx = PITCH.x + PITCH.w / 2, cy = PITCH.y + PITCH.h / 2;
  if (BALL.resetAt && t > BALL.resetAt || (!BALL.x && !BALL.y)) { Object.assign(BALL, { x: cx, y: cy, z: 40, vx: 0, vy: 0, vz: 0, resetAt: 0 }); }
  BALL.vz -= MV.GRAV * 0.8 * dt;
  const nx = BALL.x + BALL.vx * dt, ny = BALL.y + BALL.vy * dt, nz = BALL.z + BALL.vz * dt;
  if (nx < 10 || nx > W - 10 || insideWall(nx, BALL.y, nz + 8)) BALL.vx = -BALL.vx * 0.7; else BALL.x = nx;
  if (ny < 10 || ny > H - 10 || insideWall(BALL.x, ny, nz + 8)) BALL.vy = -BALL.vy * 0.7; else BALL.y = ny;
  const fl = MV.floorAt(BALL.x, BALL.y, 6, BALL.z + 4, WALLS).h;
  if (nz <= fl) { BALL.z = fl; BALL.vz = Math.abs(BALL.vz) > 80 ? -BALL.vz * 0.55 : 0; const f = Math.pow(0.35, dt); BALL.vx *= f; BALL.vy *= f; } else BALL.z = nz;
  for (const p of players.values()) {
    if (p.dead || p.air || p.veh || t < (p.kickAt || 0)) continue;
    const dx = BALL.x - p.x, dy = BALL.y - p.y, d = Math.hypot(dx, dy);
    if (d > 30 || BALL.z > p.z + 40 || BALL.z + 12 < p.z) continue;
    const spd = Math.max(260, Math.hypot(p.vx, p.vy) * 1.7), ux = dx / (d || 1), uy = dy / (d || 1);
    BALL.vx = ux * spd; BALL.vy = uy * spd; BALL.vz = 150 + (p.gr ? 0 : 120); BALL.last = p.id;
    p.kickAt = t + 0.25; addStress(p, -5); p.st.kicks = (p.st.kicks || 0) + 1;
    events.push({ k: "ballkick", x: Math.round(BALL.x), y: Math.round(BALL.y) });
  }
  // goal?
  if (!BALL.resetAt && BALL.z < 62 && Math.abs(BALL.y - cy) < 60 && (BALL.x < PITCH.x - 2 || BALL.x > PITCH.x + PITCH.w + 2) && BALL.x > PITCH.x - 60 && BALL.x < PITCH.x + PITCH.w + 60) {
    BALL.resetAt = t + 2.5;
    const sc = players.get(BALL.last);
    events.push({ k: "banner", text: "GOOOOAL!", sub: sc ? `${fullName(sc)} scores! Everyone on the pitch feels much calmer.` : "Nobody knows who scored. Calming, somehow." });
    events.push({ k: "goal", x: Math.round(BALL.x), y: Math.round(BALL.y) });
    for (const q of players.values()) if (Math.hypot(q.x - cx, q.y - cy) < 700) addStress(q, -35);
    if (sc) { sc.stress = 0; addGold(sc, 20, "Goal!"); sc.st.goals = (sc.st.goals || 0) + 1; }
  }
}
function needs(p, dt, t) {
  // hunger and thirst: full to empty in about 12 and 10 minutes
  const hk = (FAST ? 5 : 1) * game.mods.hunger;
  p.food = Math.max(0, p.food - dt * hk * 100 / 720);
  p.water = Math.max(0, p.water - dt * hk * 100 / 600);
  // nearly empty and there's something suitable in the bag: eat or drink it without being asked
  if ((p.food < 15 || p.water < 15) && t > (p.autoEat || 0)) {
    p.autoEat = t + 3;
    const want = p.water < 15 ? "drink" : "food", pref = want === "drink" ? ["water", "cola", "lakewater", "grog"] : null;
    let i = -1;
    if (pref) { for (const id of pref) { i = p.bag.findIndex((b) => b.id === id); if (i >= 0) break; } }
    else i = p.bag.findIndex((b) => !b.gear && ITEMS[b.id] && ITEMS[b.id].kind === "food");
    if (i >= 0) useItem(p, i);
  }
  p.drunk = Math.max(0, p.drunk - dt * 1.2);
  for (const [k, msg] of [["food", "You're starving. Eat something [I or H]."], ["water", "You're parched. Drink something [I or H]."]]) {
    if (p[k] < 25 && !p["warn" + k]) { p["warn" + k] = true; toast(p, msg, "#ffc030"); }
    if (p[k] > 40) p["warn" + k] = false;
  }
  if (p.food < 25 || p.water < 25) p.stress = clamp((p.stress || 0) + dt * 0.2, 0, 100); // hungry people are anxious people
  if (p.food <= 0 || p.water <= 0) {
    p.hp -= ((p.food <= 0 ? 1 : 0) + (p.water <= 0 ? 1.5 : 0)) * dt; p.lastHurt = t;
    if (p.hp <= 0) return killPlayer(p, null, p.water <= 0 ? "died of thirst" : "starved to death");
  } else if (p.food > 60 && p.water > 60 && t - p.lastHurt > 6) p.hp = Math.min(maxHp(p), p.hp + 0.6 * dt); // well fed: slow healing
  radTick(p, t, dt);
  if (p.dead || t < p.going) return;
  const k = FAST ? 5 : 1; // bladder fills in ~6 min, bowels ~9 min (the runs: about a minute)
  p.bl = Math.min(100, p.bl + dt * k * 100 / 360);
  p.bw = Math.min(100, p.bw + dt * k * 100 / 540 * (p.inf && p.inf.sym === "runs" ? 8 : 1));
  for (const [k, name] of [["bl", "bladder"], ["bw", "bowels"]]) {
    const v = p[k];
    if (v >= 80 && !p["warn" + k]) { p["warn" + k] = true; toast(p, `Your ${name} is at ${Math.round(v)}%. Tap X to go.`, "#ffc030"); }
    if (v >= 100) accident(p, k === "bl" ? "pee" : "poo");
  }
}
// radiation: hot spots after a nuke, the irradiated lake, glowing zombies
function radTick(p, t, dt) {
  let g = 0;
  for (const h of game.hot) { const d = Math.hypot(p.x - h.x, p.y - h.y); if (d < h.r && (!h.lake || p.swim)) g += h.s * (1 - d / h.r * 0.7); }
  g *= 1 - Math.min(0.9, gearSum(p.gear, "rad") + (t < p.iodine ? 0.5 : 0));
  const was = p.rad;
  p.rad = clamp(p.rad + (g > 0 ? g : -0.12) * dt, 0, 100);
  for (const [lvl, msg] of [[25, "Your Geiger counter is clicking. Get out of the hot zone."], [50, "Radiation sickness. You're losing health. Rad-Away is in the shop."], [80, "You are glowing. This is bad."]]) if (was < lvl && p.rad >= lvl) toast(p, msg, "#9fff60");
  if (p.rad > 50) { p.hp -= (p.rad - 50) / 12 * dt; p.lastHurt = t; if (p.hp <= 0) killPlayer(p, null, "died of radiation poisoning"); }
}
function addRad(p, n) { if (!p.dead) p.rad = clamp(p.rad + n * (1 - Math.min(0.9, gearSum(p.gear, "rad"))), 0, 100); }
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
    shock(game.market, "BOOM", 0.0015);
    if (p) {
      if (!p.kt.has(z.type)) { p.kt.add(z.type); p.st.ztypes = p.kt.size; }
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
      for (const q of players.values()) { addGold(q, 150, "Contract reward"); addXp(q, 100); if (bagAdd(q.bag, "pack")) { q.invDirty = true; toast(q, "The beast dropped a Slop Snap card pack. It's in your bag [I].", "#ffd34d"); } }
      shock(game.market, "*", 0.08, "The beast is slain. Markets rally.");
    }
  }
}
// boomer bile: anyone splashed smells like dinner, and the whole horde comes for them
function bile(x, y, z, r) {
  events.push({ k: "bile", x: Math.round(x), y: Math.round(y), z: Math.round(z), r });
  for (const q of players.values()) if (!q.dead && !q.air && (q.x - x) ** 2 + (q.y - y) ** 2 < r * r && Math.abs(q.z - z) < 90) {
    if (!(q.bile > now())) toast(q, "You're covered in boomer bile. Every zombie in the valley can smell you.", "#b8e04a");
    q.bile = now() + 9; addStress(q, 10);
  }
}
function hurtPlayer(v, dmg, attacker, cause) {
  if (v.dead || v.air || now() < v.dashUntil) return;
  if (attacker && attacker !== v) {
    if (game.mode !== "royale") { dmg *= 0.35; attacker.heat += dmg; } // friendly fire is real, but softened
    attacker.st.dmg += dmg;
    attacker.pe.push({ k: "dmg", x: v.x, y: v.y - 20, z: Math.round(v.z + MV.HGT), v: Math.round(dmg), crit: false, ff: true });
  }
  const veh = vehOf(v);
  if (veh && cause !== "blown up in a vehicle") { hurtVehicle(veh, dmg * 0.7, attacker); dmg *= 0.35; if (v.dead) return; }
  if (v.armor > 0) { const soak = Math.min(v.armor, dmg * 0.5); v.armor -= soak; dmg -= soak; }
  dmg *= 1 - Math.min(0.6, gearSum(v.gear, "def")); // helmet, vest, boots
  v.hp -= dmg; v.lastHurt = now(); addStress(v, dmg * 0.12);
  v.pe.push({ k: "hurt" });
  if (v.hp <= 0) killPlayer(v, attacker, cause);
}
function killPlayer(v, attacker, cause) {
  if (v.dead) return;
  if (v.veh) exitVehicle(v);
  for (const q of players.values()) if (q !== v && dist2(q, v) < 600 * 600) addStress(q, 10);
  v.dead = true; v.hp = 0; v.inf = null; v.stress = 0; v.going = 0; v.ads = false; v.respawnAt = now() + 5; v.st.deaths++; v.champion = false;
  if (v.dlg) { v.dlg = null; v.pe.push({ k: "dlg", close: 1 }); }
  if (v.fix) endFix(v, "You died.");
  const prim = v.weapons.find((w) => w.type !== "pistol");
  if (prim) crates.push({ id: nextId++, x: v.x, y: v.y, w: { ...prim, ammo: WEAPONS[prim.type].mag, reloadUntil: 0, hot: false, tried: false, jam: false }, grave: true });
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
  const tax = game.mods.taxFree ? 0 : Math.floor(p.gold * 0.25);
  p.gold -= tax;
  p.gen++;
  p.trait = pick(TRAIT_KEYS);
  p.dead = false;
  p.champion = game.flags.champion === p.id;
  resetLoadout(p, false);
  p.food = Math.max(p.food, 70); p.water = Math.max(p.water, 70); p.rad = 0; p.drunk = 0; p.invDirty = true; // the heir keeps the bag, the gear and the shares
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
    if (zb.type !== "boss" && zb.type !== "elite" && zb.type !== "rex") { zb.vx += (zb.x - x) / hd * 320 * f; zb.vy += (zb.y - y) / hd * 320 * f; if (zb.type !== "flyer") { zb.vz = Math.max(zb.vz, 260 * f); zb.gr = false; } }
  }
  for (const q of players.values()) {
    if (q.dead || q.air) continue;
    const cz = q.z + MV.HGT / 2, d = d3(q.x, q.y, cz);
    if (d >= r + 16) continue;
    const f = 1 - (Math.max(0, d - 16) / r) * 0.7;
    if (q === owner) hurtPlayer(q, dmg * f * selfMult, null, cause);
    else hurtPlayer(q, dmg * f * (owner && game.mode !== "royale" ? 0.4 : 0.6), owner, cause);
    // the push: mostly up, so aiming at your feet sends you flying (rocket jumping)
    const nx = (q.x - x) / (d || 1), ny = (q.y - y) / (d || 1), nz = (cz - z) / (d || 1), push = (q === owner ? 760 : 520) * f;
    kick(q, nx * push * 0.9, ny * push * 0.9, push * Math.max(0.55, nz));
  }
  for (const b of builds) if ((b.x + 20 - x) ** 2 + (b.y + 20 - y) ** 2 < (r + 20) ** 2) hurtPiece(b, dmg * 0.5);
  { const d = Math.hypot(BALL.x - x, BALL.y - y, BALL.z - z); if (d < r) { const f = (1 - d / r) * 900; BALL.vx += (BALL.x - x) / (d || 1) * f; BALL.vy += (BALL.y - y) / (d || 1) * f; BALL.vz += f * 0.7; } }
  { const once = new Set(); for (const w of [...WALLS]) if (w.hp && w.kind !== "built") { const d = boxDist(w, x, y, z), key = w.hid && w.kind === "hwall" ? w.hid : w.id; if (d < r && !once.has(key)) { once.add(key); damageWall(w, dmg * 1.4 * (1 - d / r * 0.5)); } } }
  for (const v of vehicles) if ((v.x - x) ** 2 + (v.y - y) ** 2 < (r + VEHICLES[v.kind].r) ** 2 && Math.abs((v.z || 0) + 20 - z) < r + 30) hurtVehicle(v, dmg * 0.5, owner);
}
const insideWall = (x, y, z) => nearXY(x, y).some((w) => w.kind !== "lake" && x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h && z < w.z1 - 2 && z > (w.z0 || 0) - 2);
function throwIt(p, kind) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.throwAt || t < p.going || p.dlg) return;
  if (!["day", "night", "royale"].includes(game.phase)) return;
  const have = kind === "molo" ? p.molo : p.gren;
  if (have <= 0) return toast(p, kind === "molo" ? "No molotovs left. Haddock's armoury sells them." : "No grenades left. Haddock's armoury sells them.", "#f88");
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
        if (pr.z <= MV.floorAt(pr.x, pr.y, 2, pr.z, near(pr)).h || insideWall(pr.x, pr.y, pr.z) || (!OPEN() && (pr.x < 0 || pr.y < 0 || pr.x > W || pr.y > H))) boom = true;
        for (const zb of zombies) if (!boom && zb.hp > 0 && (zb.x - pr.x) ** 2 + (zb.y - pr.y) ** 2 < (zb.r + 6) ** 2 && (pr.flat || (pr.z > zb.z - 6 && pr.z < zb.z + zHeight(zb) + 6))) boom = true;
        for (const q of players.values()) if (!boom && q.id !== pr.owner && !q.dead && !q.air && (q.x - pr.x) ** 2 + (q.y - pr.y) ** 2 < 22 * 22 && (pr.flat || (pr.z > q.z - 6 && pr.z < q.z + MV.HGT + 6))) boom = true;
        for (const v of vehicles) if (!boom && (v.x - pr.x) ** 2 + (v.y - pr.y) ** 2 < VEHICLES[v.kind].r ** 2 && pr.z > (v.z || 0) - 4 && pr.z < (v.z || 0) + 44 && !(owner && owner.veh === v.id)) boom = true;
      }
      if (boom || pr.age > 2.2) { pr.dead = true; explode(pr.x, pr.y, pr.z, pr.r, pr.dmg, owner, "blown up by a rocket", 0.22); }
      continue;
    }
    // grenades and molotovs: arcs that bounce off things
    pr.vz -= MV.GRAV * 0.75 * dt;
    const nx = OPEN() ? pr.x + pr.vx * dt : clamp(pr.x + pr.vx * dt, 4, W - 4), ny = OPEN() ? pr.y + pr.vy * dt : clamp(pr.y + pr.vy * dt, 4, H - 4), nz = pr.z + pr.vz * dt;
    let bumped = false;
    if (insideWall(nx, pr.y, nz)) { pr.vx = -pr.vx * 0.45; bumped = true; } else pr.x = nx;
    if (insideWall(pr.x, ny, nz)) { pr.vy = -pr.vy * 0.45; bumped = true; } else pr.y = ny;
    const fl = MV.floorAt(pr.x, pr.y, 3, pr.z + 2, near(pr)).h;
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
  const z = MV.floorAt(mx, my, 4, zHint, nearXY(mx, my)).h;
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
      const chance = (fuel ? 0.9 : 0.45) * Math.pow(0.75, f.gen);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.random() < chance * 0.5) ignite(f.x + dx * FIRE_CELL, f.y + dy * FIRE_CELL, f.z + 20, f.owner, f.gen + (fuel ? 0 : 1));
    }
    const owner = players.get(f.owner) || null;
    const inCell = (e, r, ez) => Math.abs(e.x - f.x) < FIRE_CELL / 2 + r * 0.5 && Math.abs(e.y - f.y) < FIRE_CELL / 2 + r * 0.5 && Math.abs((ez || 0) - f.z) < 26;
    for (const zb of zombies) if (zb.hp > 0 && zb.type !== "flyer" && inCell(zb, zb.r, zb.z)) { zb.fireUntil = t + 3; zb.fireBy = f.owner; }
    for (const q of players.values()) if (!q.dead && !q.air && !q.veh && inCell(q, 16, q.z)) { q.fireUntil = t + 1.5; q.fireBy = q.id === f.owner ? 0 : f.owner; }
    const once = new Set();
    for (const w of [...WALLS]) if (w.hp && WOODEN.has(w.kind) && boxDist(w, f.x, f.y, f.z) < 26 && !once.has(w.kind === "hwall" ? w.hid : w.id) && once.add(w.kind === "hwall" ? w.hid : w.id)) {
      damageWall(w, 60 * step);
      if (Math.random() < 0.15) ignite(f.x + (w.x + w.w / 2 - f.x) * 0.2, f.y + (w.y + w.h / 2 - f.y) * 0.2, f.z + 20, f.owner, Math.max(0, f.gen - 1), true);
    }
    for (const b of builds) if (PIECES[b.bk].solid && b.x < f.x + 20 && b.x + 40 > f.x - 20 && b.y < f.y + 20 && b.y + 40 > f.y - 20) hurtPiece(b, 40 * step);
    for (const pl of PLOTS) if (pl.stage > 0 && Math.abs(pl.x - f.x) < 24 && Math.abs(pl.y - f.y) < 24) { pl.stage = 0; pl.prog = 0; events.push({ k: "trample", x: pl.x, y: pl.y, burnt: 1 }); }
    for (const v of vehicles) if (Math.abs(v.x - f.x) < 30 && Math.abs(v.y - f.y) < 30 && (v.z || 0) < 30) hurtVehicle(v, 20 * step, owner);
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
    { const hl = Math.hypot(dx, dy) || 1; for (const wl of wallsAlong(mx, my, dx / hl, dy / hl, def.range)) if (wl.kind !== "lake") wallT = Math.min(wallT, rayBox3(o, d, wl)); }
    if (dz < -1e-6) { // the ground, or the lake bed if the shot goes into the water
      let tg = mz > 0 ? -mz / dz : 0;
      const lk = LAKE && MV.lakeAt([LAKE], mx + dx * tg, my + dy * tg);
      if (lk) tg = (lk.z0 - mz) / dz;
      wallT = Math.min(wallT, Math.max(0, tg));
    }
    const hits = [];
    const cyl = (c, r, z0, z1) => flat ? (() => { const hl = Math.hypot(dx, dy) || 1, th = rayCircle(mx, my, dx / hl, dy / hl, c, r); return th / hl; })() : rayCyl(o, d, c, r, z0, z1);
    for (const z of zombies) { const tt = cyl(z, z.r, z.z || 0, (z.z || 0) + zHeight(z)); if (tt < wallT) hits.push([tt, z, "z"]); }
    for (const q of players.values()) {
      if (q === p || q.dead || q.veh || q.air) continue;
      const tt = cyl(q, 16, q.z, q.z + (crouched(q) ? 40 : MV.HGT)); if (tt < wallT) hits.push([tt, q, "p"]);
    }
    if (game.mode === "royale") for (const v of vehicles) { if (v.id === p.veh) continue; const tt = cyl(v, VEHICLES[v.kind].r, v.z || 0, (v.z || 0) + 40); if (tt < wallT) hits.push([tt, v, "v"]); }
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
        else { const th = hits.find((h) => h[1] === target)[0], hz = mz + dz * th, tz = target.z || 0, hh = kind === "z" ? zHeight(target) : crouched(target) ? 40 : MV.HGT; head = hz > tz + hh * 0.8; }
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
// Active reloads (back by popular demand). Press R to reload, then tap R again inside the green window
// for an instant reload and an empowered mag. Miss the window and you fumble, which costs a little time.
// guns get dirty as you shoot them, and dirty guns can jam: R clears a jam
const DIRT = { pistol: 0.15, smg: 0.11, rifle: 0.14, ak: 0.22, shotgun: 0.3, sniper: 0.4, staff: 0, rocket: 0.25, sword: 0 };
const RL_LO = 0.45, RL_HI = 0.62;
function startReload(p, w) {
  const def = WEAPONS[w.type];
  if (def.melee || w.reloadUntil) return;
  const t = now();
  if (w.jam) { w.reloadStart = t; w.reloadUntil = t + 0.8; w.tried = true; w.clearing = true; return; }
  if (w.ammo >= def.mag) return;
  w.reloadStart = t; w.reloadUntil = t + reloadTime(p, w); w.tried = false; w.hot = false; w.clearing = false;
}
function tryActiveReload(p, w) {
  if (!w.reloadUntil || w.tried) return;
  w.tried = true;
  const t = now(), total = w.reloadUntil - w.reloadStart, k = (t - w.reloadStart) / total;
  if (k >= RL_LO && k <= RL_HI) { w.reloadUntil = 0; w.ammo = WEAPONS[w.type].mag; w.hot = true; p.st.perfect++; p.pe.push({ k: "perfect" }); }
  else { w.reloadUntil += 0.5; p.pe.push({ k: "jam", text: "Fumbled it" }); }
}
function pressReload(p, w) { if (w.reloadUntil) tryActiveReload(p, w); else startReload(p, w); }
function reloadTick(p, w, t) {
  if (!w.reloadUntil || t < w.reloadUntil) return;
  w.reloadUntil = 0;
  if (w.clearing) { w.clearing = false; w.jam = false; p.pe.push({ k: "toast", text: "Jam cleared.", color: "#8f8" }); return; }
  w.ammo = WEAPONS[w.type].mag;
}
function cleanWeapon(p, m) {
  const w = p.weapons[p.active], t = now();
  if (m.start) { p.cleaning = t; return; }
  if (!p.cleaning) return;
  const took = t - p.cleaning; p.cleaning = 0;
  if (m.cancel || took < 2) return;
  const mistakes = clamp(m.mistakes | 0, 0, 20);
  w.jam = false;
  if (mistakes >= 3) { w.dirt = 55; toast(p, `You put your ${wName(w)} back together with a spring left over. It'll probably be fine.`, "#ffb070"); }
  else { w.dirt = mistakes * 12; toast(p, mistakes ? `Cleaned, mostly. (${mistakes} mistake${mistakes > 1 ? "s" : ""})` : `Stripped, cleaned and reassembled perfectly. Your ${wName(w)} is spotless.`, "#8f8"); if (!mistakes) addXp(p, 5); }
}

// ---------------------------------------------------------------- actions
function interact(p) {
  if (p.air === "bunker") return leaveBunker(p);
  if (p.air || game.phase === "lobby") return;
  if (p.veh) return exitVehicle(p);
  if (p.z < -60 && touchGlyph(p)) return;
  if (p.z > 40) return toast(p, "You'll have to come down first.", "#bbb");
  { const c = caches.find((q) => dist2(q, p) < 62 * 62); if (c) return startHack(p, c); }
  if (game.disaster && game.disaster.st && dist2(game.disaster.st, p) < 85 * 85) return startFix(p);
  { const b = bunkerWall(); if (b && rectHitsCircle(b, p, 46) && game.mode !== "royale") return enterBunker(p); }
  let best = null, bd = 60 * 60;
  for (const c of crates) { const d = dist2(c, p); if (d < bd) { bd = d; best = c; } }
  if (best && best.it) { // a crate of gear or supplies
    if (!bagAdd(p.bag, best.it.id, best.it.n || 1, best.it.r || 0)) return toast(p, "Your bag is full. Use or drop something [I].", "#f88");
    crates = crates.filter((c) => c !== best); p.invDirty = true;
    const g = GEAR[best.it.id];
    toast(p, g ? `Found ${["", "Rare ", "Epic ", "Legendary ", "Mythic "][best.it.r || 0]}${g.name}. Equip it from your bag [I].` : `Found ${best.it.n > 1 ? best.it.n + "x " : ""}${ITEMS[best.it.id].name}`, ["#ddd", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"][best.it.r || 0]);
    return;
  }
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
  for (const v of vehicles) if (dist2(v, p) < (VEHICLES[v.kind].r + 34) ** 2 && Math.abs((v.z || 0) - p.z) < 70 && enterVehicle(p, v)) return;
  if (game.mode !== "royale") { const n = NPC_POS.filter((q) => dist2(q, p) < 70 * 70).sort((a, b) => dist2(a, p) - dist2(b, p))[0]; if (n) return openDlg(p, n.id); }
  if (rectHitsCircle(HEARTH, p, 70) && bagCount(p.bag, "turnip") + bagCount(p.bag, "potato") >= 2) { // cook two vegetables into a stew
    for (let i = 0; i < 2; i++) bagTake(p.bag, bagCount(p.bag, "turnip") >= bagCount(p.bag, "potato") ? "turnip" : "potato");
    bagAdd(p.bag, "stew"); p.invDirty = true; deed("soil", 2);
    events.push({ k: "burn", x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
    return toast(p, "You cook your vegetables in the Hearth. Hearth stew! It's in your bag.", "#ffb070");
  }
  if (game.mode !== "royale" && nearStall(p)) return openStall(p);
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
    plot.stage = 1; plot.prog = 0; plot.crop = crop; plot.rate = (p.cls === "farmer" ? 1.85 : 1) * (1 + 0.25 * sk(p, "green")) * (1 + 0.15 * (p.hoe || 0)) * game.mods.grow; plot.owner = p.id;
    addXp(p, 2);
  } else if (plot.stage === 3) {
    const C = CROPS[plot.crop || "turnip"], n = C.yield || 1;
    plot.stage = C.regrow ? 2 : 0; plot.prog = 0; p.st.crops++; deed("soil", 5);
    let lost = 0; for (let i = 0; i < n; i++) if (!bagAdd(p.bag, plot.crop || "turnip")) lost++;
    p.invDirty = true;
    toast(p, lost ? `Your bag is full, so ${lost === n ? "the" : "a"} ${C.name.toLowerCase()} goes in the bin.` : `Picked ${n > 1 ? n + " " : "a "}${C.name.toLowerCase()}${n > 1 ? "s" : ""}. Sell ${n > 1 ? "them" : "it"} to Old Giles at the stall for about ${cropPrice(p, plot.crop || "turnip") * n}g, or eat ${n > 1 ? "them" : "it"}.`, lost ? "#bbb" : "#8f8");
    shock(game.market, "FARM", 0.004 * Math.sqrt(C.sell / 25));
    addXp(p, Math.round(6 + 6 * C.t));
    if (Math.random() < 0.2) { const id = plot.crop || "turnip"; bagAdd(p.bag, "s_" + id); toast(p, `Found a ${C.name.toLowerCase()} seed in the soil`, "#8f8"); }
  } else toast(p, "Still growing...", "#bbb");
}
function till(p) {
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
      : WALLS.some((w) => rectHitsCircle(w, c, 34)) ? "Something's in the way."
      : PLOTS.some((pl) => dist2(pl, c) < 58 * 58) || made.some((pl) => dist2(pl, c) < 58 * 58) ? "Too close to another plot."
      : builds.some((b) => rectHitsCircle(b, c, 30)) ? "Not on top of your barricades."
      : null;
    if (why) { if (!made.length && i === want - 1) return toast(p, why, "#bbb"); continue; }
    made.push({ x, y, stage: 0, prog: 0, rate: 1, owner: 0, tilled: p.id });
  }
  if (!made.length || PLOTS.length + made.length > 200) return;
  PLOTS.push(...made);
  for (const pl of made) events.push({ k: "built", x: pl.x, y: pl.y });
  deed("soil", 2 * made.length); addXp(p, 3);
  toast(p, `Tilled ${made.length === 2 ? "two new plots" : "a new plot"} (${mineN + made.length}/${limit}). Plant it with E.`, "#8f8");
  broadcastRaw(JSON.stringify(mapMsg()));
}
function giveWeapon(p, w) {
  if (w.type === "pistol") { p.weapons[0] = w; p.active = 0; return; }
  p.weapons[1] = w; p.active = 1;
}
function buy(p, item) {
  if (game.mode === "royale") return toast(p, "No shops in the Royale. Loot it or lose it.", "#f88");
  if (p.dead) return;
  const it = SHOP[item]; if (!it) return;
  if (!nearShop(p, it.shop)) return toast(p, `You'll have to go to ${SHOPS[it.shop].name} for that.`, "#f88");
  if (!shopIsOpen(it.shop)) return toast(p, SHOPS[it.shop].shut || "Shut.", "#f88");
  if (item.startsWith("dome")) return fundDome(p, it.cost);
  if (item === "enhance") return enhance(p);
  if (item === "hoe" && p.hoe >= 3) return toast(p, "Your Golden Hoe is as good as hoes get.", "#bbb");
  const cost = price(p, item === "hoe" ? HOE_COST[p.hoe] : it.cost);
  if (p.gold < cost) return toast(p, `Need ${cost}g`, "#f88");
  if (item === "repair" && game.hearth >= game.hearthMax) return toast(p, "Hearth is already at full health", "#bbb");
  p.gold -= cost;
  deed("coin", cost / 25 + (item === "case" ? 4 : 0));
  shock(game.market, "VEX", 0.004);
  if (ITEMS[item] || GEAR[item]) {
    if (!bagAdd(p.bag, item)) { p.gold += cost; return toast(p, "Your bag is full. Use or drop something first [I].", "#f88"); }
    p.invDirty = true;
    return toast(p, `Bought ${it.name}. It's in your bag [I].`, "#8f8");
  }
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
    const w = newWeapon(pick(LOOT_TYPES), rarity);
    giveWeapon(p, w);
    p.pe.push({ k: "case", type: w.type, rarity, name: wName(w) }); p.st.cases++;
    if (rarity >= 2) setTimeout(() => feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${wName(w)}`, ["", "", "#c070ff", "#ffc030", "#ff4b4b"][rarity]), 3200);
  } else if (WEAPONS[item]) giveWeapon(p, newWeapon(item));
  if (item !== "case" && item !== "gcase" && item !== "hoe") toast(p, `Bought ${it.name}`, "#8f8");
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
// The Thu'um: four elements, unlocked as you level. Every kind of monster is weak to one and shrugs off another.
const ELEMENTS = {
  force: { name: "Force", word: "FUS RO DAH", lvl: 1, color: "#c8e6ff" },
  fire:  { name: "Fire",  word: "YOL TOOR SHUL", lvl: 2, color: "#ff8a2a" },
  frost: { name: "Frost", word: "FO KRAH DIIN", lvl: 3, color: "#8fe0ff" },
  storm: { name: "Storm", word: "STRUN BAH QO", lvl: 4, color: "#e0d0ff" },
};
const ELEM_ORDER = Object.keys(ELEMENTS);
const MATCHUP = { // [weak to, resists]
  walker: ["fire", "frost"], runner: ["frost", "fire"], tank: ["storm", "force"], charger: ["frost", "force"], flyer: ["storm", "frost"],
  boomer: ["fire", "storm"], screamer: ["force", "storm"], elite: ["fire", "frost"], raptor: ["frost", "fire"], rex: ["storm", "fire"],
};
const BOSS_MATCH = { leshen: ["fire", "frost"], drowned: ["storm", "fire"], golem: ["frost", "force"] };
function matchOf(z) { return z.type === "boss" ? BOSS_MATCH[game.bossKind] || [] : MATCHUP[z.type] || []; }
function elemsFor(p) { return ELEM_ORDER.filter((e) => p.lvl >= ELEMENTS[e].lvl || p.gen > 1 && ELEMENTS[e].lvl <= 2); }
function cycleElement(p) {
  const list = elemsFor(p);
  if (list.length < 2) return toast(p, "You only know one Word of Power so far. More come with levels (Fire at 2, Frost at 3, Storm at 4).", "#bfe0ff");
  p.elem = list[(list.indexOf(p.elem) + 1) % list.length];
  toast(p, `Thu'um: ${ELEMENTS[p.elem].name.toUpperCase()} (${ELEMENTS[p.elem].word})`, ELEMENTS[p.elem].color);
}
function doShout(p) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.shoutCd) return;
  if (!elemsFor(p).includes(p.elem)) p.elem = "force";
  const el = p.elem;
  p.shoutCd = t + (el === "force" ? 15 : 18) * (1 - (traitOf(p).shout || 0)) * (1 - 0.15 * sk(p, "thuum")) * game.mods.shoutCd * p.shoutMult;
  const range = 280 * (1 + 0.15 * sk(p, "thuum")), pow = 1 + 0.2 * sk(p, "thuum");
  events.push({ k: "shout", x: p.x, y: p.y, z: p.z, a: p.a, id: p.id, r: range, el });
  const inCone = (e) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > range || d < 1) return 0;
    let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(da) > 0.7 ? 0 : d;
  };
  // how well the element lands on this monster, like a certain pocket monster game
  const eff = (z) => { const [weak, res] = matchOf(z); const m = weak === el ? 2 : res === el ? 0.5 : 1; if (m !== 1) p.pe.push({ k: "eff", x: Math.round(z.x), y: Math.round(z.y), z: Math.round((z.z || 0) + zHeight(z) + 20), m }); return m; };
  const mass = { boss: game.bossKind === "golem" ? 99 : 5, elite: 3, tank: 2, rex: 6, raptor: 1.2 };
  if (el === "storm") {
    // chain lightning: the nearest thing in front of you, then whatever's closest to that, and on
    const hit = new Set(), pts = [[Math.round(p.x), Math.round(p.y), Math.round(p.z + 40)]];
    let cur = null, bd = Infinity;
    for (const z of zombies) { const d = inCone(z); if (d && d < bd) { bd = d; cur = z; } }
    let dmg = 55 * pow;
    for (let n = 0; cur && n < 6; n++) {
      hit.add(cur); const m = eff(cur);
      hurtZombie(cur, dmg * m, p, m > 1 ? "crit" : ""); cur.stun = Math.max(cur.stun, t + 0.4 * m); p.st.shoutHits++;
      pts.push([Math.round(cur.x), Math.round(cur.y), Math.round((cur.z || 0) + zHeight(cur) / 2)]);
      let next = null, nd = 220 * 220;
      for (const z of zombies) if (!hit.has(z) && z.hp > 0) { const d = dist2(z, cur); if (d < nd) { nd = d; next = z; } }
      cur = next; dmg *= 0.85;
    }
    if (pts.length === 1) { const a = p.a; pts.push([Math.round(p.x + Math.cos(a) * range), Math.round(p.y + Math.sin(a) * range), Math.round(p.z + 40)]); }
    events.push({ k: "zap", pts });
    for (const q of players.values()) if (q !== p && !q.dead && inCone(q) && inCone(q) < 120) hurtPlayer(q, 12, p, "struck by lightning");
    return;
  }
  for (const z of zombies) {
    const d = inCone(z); if (!d) continue;
    const m = eff(z); p.st.shoutHits++;
    if (el === "force") {
      const dx = z.x - p.x, dy = z.y - p.y;
      z.vx = (dx / d) * 700 * m / (mass[z.type] || 1); z.vy = (dy / d) * 700 * m / (mass[z.type] || 1);
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
  shock(game.market, "VEX", 0.005);
  if (p.spinning || p.spins <= 0 || p.casino) return;
  if (!nearShop(p, "casino")) return toast(p, "The wheel's at the Golden Slop.", "#f88");
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
  dome: () => (game.dome ? [game.dome.have, game.dome.cost] : [0, 1]),
  fundDome: (each) => { let got = 0; for (const p of players.values()) { const g = Math.min(each, p.gold); p.gold -= g; got += g; } if (game.dome) game.dome.have = Math.min(game.dome.cost, game.dome.have + got); return got; },
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
  feast: () => { for (const p of players.values()) if (!p.dead) { p.hp = maxHp(p); p.food = 100; p.water = 100; } },
  turrets: (k) => { for (const [dx, dy] of [[-2, 0.3], [HEARTH.w / GRID + 1, 0.3]].slice(0, k)) placePiece(null, "turret", Math.round((HEARTH.x + dx * GRID) / GRID) * GRID, Math.round((HEARTH.y + dy * GRID) / GRID) * GRID, true); },
  friends: () => Object.values(game.aff).filter((a) => a >= 1).length,
  freeClue: () => { const id = Object.keys(CLUES).find((c) => !game.clues.has(c)); if (!id) return null; npcApi.clue(id); return CLUES[id]; },
};
// The town votes once a day. The ballot opens at dawn, stays open all day (change your mind as often as you like)
// and is counted at dusk. Story days have their story question; other days get an ordinary town meeting.
function openVote(day) {
  if (!players.size || game.mode === "royale") return;
  const ev = (game.mode === "story" && storyEvent(day, storyApi)) || townMeeting(day, storyApi);
  if (!ev) return;
  game.vote = { day, ev, votes: new Map(), ends: game.ends };
  events.push({ k: "vote" });
  events.push({ k: "feed", text: `The town meeting is open until dusk: ${ev.title}. Press N to vote.`, color: "#e0c0ff" });
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
function dlgCtx(p) { return { p, f: game.flags, aff: game.aff, clues: game.clues, q: p.q, api: npcApi, g: guestApi }; }
function openDlg(p, npc) {
  p.dlg = { npc, node: "start" };
  if (!p.talked.has(npc)) { deed("word", 1.5); addLove(p, npc, 2); }
  p.talked.add(npc);
  addXp(p, 1);
  sendDlg(p);
}
function sendDlg(p) {
  if (!p.dlg) { p.pe.push({ k: "dlg", close: 1 }); return; }
  const npc = p.dlg.npc, N = NPCS[npc], node = p.dlg.node === "~snap" ? snapNode(p, npc) : p.dlg.node[0] === "~" ? romanceNode(p, npc, p.dlg.node) : N.nodes[p.dlg.node], c = dlgCtx(p);
  p.dlgOpts = node.opts.filter((o) => !o.if || o.if(c));
  if (p.dlg.node === "start" && TASTE[npc]) p.dlgOpts.splice(Math.max(0, p.dlgOpts.length - 1), 0, ...romanceOpts(p, npc)); // before "Goodbye"
  if (p.dlg.node === "start" && OPPONENTS[npc] && game.phase !== "night") p.dlgOpts.splice(Math.max(0, p.dlgOpts.length - 1), 0, { label: "Fancy a game of Slop Snap?", to: "~snap" });
  p.pe.push({ k: "dlg", npc, name: N.name, role: N.role, text: node.text(c), opts: p.dlgOpts.map((o) => o.label), love: loveOf(p, npc), rel: p.spouse === npc ? "spouse" : p.dating === npc ? "dating" : "" });
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
  events.push({ k: "banner", text: "A WEDDING!", sub: `${fullName(p)} married ${NPCS[npc].name}. Every morning from now on, ${NPCS[npc].name} looks after them.` });
  events.push({ k: "wedding", npc, id: p.id });
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
function sendCards(p) {
  if (!p.cg) return p.pe.push({ k: "cg", close: 1 });
  p.pe.push({ k: "cg", npc: p.cg.npc, name: NPCS[p.cg.npc].name, stake: p.cg.stake, v: cgView(p.cg.M, 0) });
}
function cardAct(p, m) {
  const G = p.cg;
  if (m.a === "deck") { p.deck = (Array.isArray(m.ids) ? m.ids : []).filter((id) => CARDS[id]).slice(0, DECK_SIZE); p.invDirty = true; return; }
  if (!G) return;
  if (m.a === "quit" || G.M.over) { if (!G.M.over) { toast(p, `You fold. ${NPCS[G.npc].name} keeps the ${G.stake}g.`, "#bbb"); } p.cg = null; return sendCards(p); }
  if (m.a !== "play") return;
  const plays = (Array.isArray(m.plays) ? m.plays : []).slice(0, 8).map((x) => [x[0] | 0, x[1] | 0]);
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
function openPack(p, n = 4) {
  const got = []; for (let i = 0; i < n; i++) { const id = packCard(); got.push(id); p.cards[id] = (p.cards[id] || 0) + 1; }
  p.invDirty = true; p.pe.push({ k: "pack", cards: got });
  const best = got.reduce((a, b) => (CARDS[b].r > CARDS[a].r ? b : a));
  if (CARDS[best].r >= 4) feed(`${fullName(p)} pulled ${CARDS[best].name} from a Slop Snap pack!`, "#ff4b4b");
}

// ---------------------------------------------------------------- the produce stall
function openShop(p, sid) {
  if (game.mode === "royale") return toast(p, "Boarded up for the Royale.", "#bbb");
  if (!shopIsOpen(sid)) return toast(p, SHOPS[sid].shut, "#bbb");
  p.pe.push({ k: "shop", sid });
}
function openStall(p) {
  const k = KEEPERS.find((q) => q.sid === "produce");
  if (!stallOpen(k)) return toast(p, `The stall's shut. ${k.name} has gone home for the night. Back at dawn.`, "#bbb");
  p.pe.push({ k: "stall", sid: "produce" });
}
function stallAct(p, m) {
  if (game.mode === "royale" || p.dead || !nearStall(p)) return;
  const k = KEEPERS.find((q) => q.sid === "produce");
  if (!stallOpen(k)) return toast(p, "The stall's shut for the night.", "#bbb");
  if (m.a === "buy") {
    const id = String(m.id); if (!CROPS[id]) return;
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
      if (!CROPS[id]) continue;
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
function invMsg(p) {
  return { k: "inv", sel: p.seedSel || "", bag: p.bag, gear: p.gear, food: Math.round(p.food), water: Math.round(p.water), rad: Math.round(p.rad), shares: p.shares, basis: p.basis, cards: p.cards, deck: p.deck, size: BAG_SIZE };
}
function useItem(p, i) {
  const it = p.bag[i]; if (!it || p.dead || p.air) return;
  if (it.gear) return equipGear(p, i);
  const d = ITEMS[it.id]; if (!d) return;
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
  if (d.cure) cure(p, "The antidote tastes like pennies. The infection is gone.");
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
function itemAct(p, m) {
  if (m.a === "use") return useItem(p, m.i | 0);
  if (m.a === "unequip") { const g = p.gear[m.slot]; if (!g) return; if (!bagAdd(p.bag, g.id, 1, g.r)) return toast(p, "Your bag is full.", "#f88"); delete p.gear[m.slot]; p.invDirty = true; return; }
  if (m.a === "drop") { // leave it on the ground in a crate, for anyone to pick up
    const it = p.bag[m.i | 0]; if (!it || p.dead || p.air) return;
    p.bag.splice(m.i | 0, 1); p.invDirty = true;
    crates.push({ id: nextId++, x: p.x + rand(-20, 20), y: p.y + 30, it: { id: it.id, n: it.n || 1, r: it.r || 0 } });
    return toast(p, `Dropped ${itemName(it)}.`, "#bbb");
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

// ---------------------------------------------------------------- the bunker and the bomb
function enterBunker(p) {
  if (p.veh) exitVehicle(p);
  p.air = "bunker"; p.vx = p.vy = p.vz = 0; p.firing = false;
  const b = bunkerWall(); p.x = b.x + b.w / 2; p.y = b.y + b.h / 2; p.z = b.z1;
  toast(p, game.nuke ? "You climb down into the bunker and pull the hatch shut. Wait for the all-clear." : "You climb down into the bunker. It smells of tinned peaches. E to climb out.", "#c8d0a0");
  events.push({ k: "hatch", x: Math.round(p.x), y: Math.round(p.y) });
}
function leaveBunker(p) {
  if (game.nuke) return toast(p, "The bomb hasn't dropped yet. Stay put.", "#ff8060");
  const b = bunkerWall(); p.air = null; p.x = b.x + b.w / 2; p.y = b.y + b.h + 24; p.z = 0; p.gr = true;
  collide(p, 16);
  toast(p, game.waste ? "You climb out into a ruined, glowing valley." : "You climb back out into the daylight.", "#c8d0a0");
}
// ---------------------------------------------------------------- the Hearth Dome
// Haddock's wireless: every dawn the news from beyond the hills gets a little worse
const RADIO = [
  "📻 Haddock's wireless: \"...troops massing on both sides of the border. The government urges calm...\" Grubb wants the old Hearth Dome rebuilt, just in case. Pay into it at the Hearth [E].",
  "📻 \"...a second 'test' lit up the sky over the mountains last night. Officials insist it was a weather balloon...\"",
  "📻 \"...all embassies closed. Civil defence asks every town with a Hearth to raise its Dome...\"",
  "📻 \"...launch is considered imminent. Seek shelter. Do not look at the...\" Static. Haddock turns it off and doesn't say anything for a while.",
  "📻 Nothing but the long tone. Haddock says that means tonight. Is the Dome up?",
];
function radioNews() {
  if (game.mode === "royale" || !game.dome || game.dome.struck) return;
  const d = game.dome, line = RADIO[Math.min(game.night, RADIO.length - 1)];
  setTimeout(() => {
    feed(line, "#9fe0ff");
    if (d.have < d.cost) feed(`The Hearth Dome: ${d.have}/${d.cost}g. ${Math.max(0, FIRST_NUKE - game.night)} day${FIRST_NUKE - game.night === 1 ? "" : "s"} until the bombs can fall.`, "#9fe0ff");
  }, 6000);
}
// The war is coming. Everyone chips in at the Hearth; once it's paid for, the dome stops a nuke flattening the town.
const DOME_COST = 1200, DOME_PER = 400, DOME_R = 1000, FIRST_NUKE = 5; // nothing falls before night 5
const domeK = () => (game.dome ? clamp(game.dome.have / game.dome.cost, 0, 1) : 0);
const inDome = (e) => Math.hypot(e.x - (HEARTH.x + HEARTH.w / 2), e.y - (HEARTH.y + HEARTH.h / 2)) < DOME_R;
const DOME_STAGES = ["", "The first pylon hums into life beside the Hearth.", "Two pylons up. The air round the Hearth tastes of pennies.", "Three pylons. Grubb says it's \"nearly a dome\". It's a triangle.", ""];
function fundDome(p, amt) {
  const d = game.dome; if (!d) return;
  if (d.have >= d.cost) return toast(p, "The Dome is fully charged. Save your gold.", "#bbb");
  amt = Math.min(amt, d.cost - d.have);
  if (p.gold < amt) return toast(p, `That's ${amt}g. You've got ${p.gold}g.`, "#f88");
  const before = Math.floor(domeK() * 4);
  p.gold -= amt; d.have += amt; p.st.dome = (p.st.dome || 0) + amt; deed("soil", amt / 40);
  shock(game.market, "BNKR", -0.02);
  const after = Math.floor(domeK() * 4);
  toast(p, `+${amt}g to the Dome (${d.have}/${d.cost}g)`, "#9fe0ff");
  if (d.have >= d.cost) {
    events.push({ k: "banner", text: "THE HEARTH DOME IS UP", sub: "Stand inside it when the siren goes and the town survives a nuke. Each hit drains it by half." });
    events.push({ k: "dome", up: 1 }); feed(`${fullName(p)} paid the last of the Hearth Dome. It hums.`, "#9fe0ff");
  } else if (after > before) { feed(DOME_STAGES[after], "#9fe0ff"); events.push({ k: "dome", stage: after }); }
  else feed(`${fullName(p)} put ${amt}g towards the Hearth Dome`, "#9fe0ff");
}
function nukeWarn(why) {
  if (game.nuke || game.mode === "royale" || !players.size) return;
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let gz = freeSpot(40);
  for (let i = 0; i < 40; i++) { const c = freeSpot(40); if (Math.hypot(c.x - hc.x, c.y - hc.y) > 900) { gz = c; break; } }
  game.nuke = { at: now() + NUKE_WARN, x: gz.x, y: gz.y }; if (game.dome) game.dome.struck = true;
  events.push({ k: "banner", text: "☢ NUCLEAR LAUNCH DETECTED ☢", sub: `${why} Get to the bunker [E] or dive deep into the lake. ${NUKE_WARN} seconds.` });
  events.push({ k: "siren" });
  feed(domeK() >= 1 ? "☢ Missile inbound. The Dome is up: get inside it, near the Hearth. Or the bunker, or deep underwater." : "☢ Missile inbound and the Hearth Dome isn't finished. Pay into it at the Hearth NOW, then get to the bunker or deep underwater.", "#9fff60");
  shock(game.market, "*", -0.15, "Missile warning: markets panic"); shock(game.market, "BNKR", 0.9, "Bunkr & Sons flooded with enquiries");
}
function nukeBlast() {
  const N = game.nuke; game.nuke = null; game.waste = true;
  const k = domeK(), held = k >= 1, safe = (e) => held && inDome(e);
  events.push({ k: "nuke", x: Math.round(N.x), y: Math.round(N.y), dome: held ? 1 : 0 });
  for (const p of players.values()) {
    if (p.dead || p.air === "bunker") continue;
    if (safe(p)) { toast(p, "The sky goes white. The dome flickers... and holds.", "#9fe0ff"); addRad(p, 15); continue; }
    if (p.swim && p.z < -120) { toast(p, "The world above turns white. Down here, you're fine. Mostly.", "#9fff60"); addRad(p, 30); continue; }
    killPlayer(p, null, "vaporised by a nuclear bomb");
  }
  for (const z of zombies) if (z.type === "boss" || z.type === "elite") z.hp *= 0.5; else z.hp = 0;
  zombies = zombies.filter((z) => z.hp > 0);
  for (const w of [...WALLS]) if (WOODEN.has(w.kind) && w.kind !== "hwall" && !safe({ x: w.x + w.w / 2, y: w.y + w.h / 2 })) damageWall(w, w.kind === "house" ? 500 : 9999);
  for (const v of [...vehicles]) hurtVehicle(v, VEHICLES[v.kind].hp * 0.6, null);
  for (const pl of PLOTS) if (!safe(pl)) { pl.stage = 0; pl.prog = 0; }
  fires.clear();
  if (held) {
    game.dome.have = Math.floor(game.dome.cost / 2); game.flags.domeHeld = 1;
    events.push({ k: "banner", text: "THE DOME HELD", sub: `The Hearth survived. The dome is drained to half: top it up at the Hearth (${game.dome.cost - game.dome.have}g) before the next one.` });
    feed("The dome took the blast. Everything inside it is still standing.", "#9fe0ff");
  } else {
    // a half-built dome soaks some of it; no dome at all and the Hearth goes out
    game.hearth -= game.hearthMax * (1 - k) * 1.05 + (k > 0 ? 0 : game.hearth);
    if (game.dome) game.dome.have = 0;
    if (game.hearth <= 0) { game.flags.nuked = 1; events.push({ k: "banner", text: "THE HEARTH IS GONE", sub: "Nobody finished the dome." }); }
    else { game.hearth = Math.max(1, game.hearth); events.push({ k: "banner", text: "THE HALF-BUILT DOME BURNT OUT", sub: `It saved the Hearth, barely (${Math.round(game.hearth)} left). Rebuild it before the next one.` }); }
  }
  game.hot = [{ x: N.x, y: N.y, r: 460, s: 10 }];
  for (let i = 0, n = 0; i < 40 && n < 7; i++) { const c = freeSpot(40); if (safe(c)) continue; n++; game.hot.push({ x: c.x, y: c.y, r: rand(110, 220), s: rand(3, 7) }); }
  if (LAKE) game.hot.push({ x: LAKE.x + LAKE.w / 2, y: LAKE.y + LAKE.h / 2, r: Math.max(LAKE.w, LAKE.h) * 0.75, s: 3, lake: true });
  shock(game.market, "*", -0.45, "NUCLEAR DETONATION. Markets in freefall."); shock(game.market, "BNKR", 1.2, "Bunkr & Sons: 'We did tell you.'");
  if (game.hearth > 0) setTimeout(() => events.push({ k: "banner", text: "THE VALLEY IS A WASTELAND", sub: "Green means radiation. Gas masks and hazmat suits at the armoury, iodine and Rad-Away at Vex's. Tinned food is safe." }), 5000);
  if (game.mayor === "posad") { for (const q of players.values()) addGold(q, 150, "The saucers have landed"); feed("Comrade Posad was right: the saucers came. They mostly brought gold.", "#ff6060"); }
  mapDirty = true;
}

// ---------------------------------------------------------------- the stock exchange
function trade(p, sym, n) {
  if (!STOCKS[sym] || !n || game.mode === "royale" || p.dead) return;
  n = Math.trunc(clamp(n, -1000, 1000));
  const px = game.market.px[sym], fee = game.mods.fee;
  if (n > 0) {
    const cost = Math.ceil(px * n * (1 + fee));
    if (p.gold < cost) return toast(p, `${n} ${sym} would cost ${cost}g.`, "#f88");
    p.gold -= cost; p.shares[sym] = (p.shares[sym] || 0) + n; p.basis[sym] = (p.basis[sym] || 0) + cost; p.st.sharesBought += n;
    shock(game.market, sym, 0.0015 * n / 10);
    toast(p, `Bought ${n} ${sym} for ${cost}g`, "#8f8");
  } else {
    const have = p.shares[sym] || 0; n = Math.min(-n, have); if (!n) return;
    const got = Math.floor(px * n * (1 - fee));
    p.basis[sym] = (p.basis[sym] || 0) * (1 - n / have);
    p.shares[sym] = have - n; if (!p.shares[sym]) { delete p.shares[sym]; delete p.basis[sym]; }
    p.gold += got; shock(game.market, sym, -0.0015 * n / 10);
    toast(p, `Sold ${n} ${sym} for ${got}g`, got >= 0 ? "#ffd34d" : "#f88");
  }
  p.invDirty = true;
}
function dividends() {
  for (const p of players.values()) {
    let pay = 0; for (const [s, n] of Object.entries(p.shares)) pay += n * game.market.px[s] * 0.015;
    if (pay >= 1) addGold(p, Math.floor(pay), "Dividends");
  }
}

// ---------------------------------------------------------------- elections
function openElection() {
  if (game.mode === "royale" || !players.size || game.elec) return;
  game.elec = { cands: ballot(game.mayor), votes: new Map(), ends: game.ends };
  events.push({ k: "feed", text: "It's election day too: the mayor's race is on today's ballot [N].", color: "#9fc0ff" });
}
function resolveElection() {
  const E = game.elec; game.elec = null;
  const counts = E.cands.map(() => 0);
  for (const [pid, i] of E.votes) if (players.has(pid)) counts[i]++;
  const top = Math.max(...counts), win = pick(E.cands.filter((c, i) => counts[i] === top));
  for (const p of players.values()) if (E.votes.has(p.id)) addXp(p, 10);
  electMayor(win, counts.every((c) => c === 0));
}
function applyMayor(id, sign) {
  for (const [k, v] of Object.entries(CANDIDATES[id].mods || {})) {
    if (k === "fee") game.mods.fee = sign > 0 ? v : FEE;
    else if (k === "discount" || k === "hearthRegen") game.mods[k] += sign * v;
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
  events.push({ k: "banner", text: `MAYOR ${C.name.toUpperCase()}`, sub: `${apathy ? "Nobody voted, so it was drawn from a hat. " : ""}${C.desc}` });
  feed(`${C.name} is the new mayor: "${C.slogan}"`, C.posadist ? "#ff6060" : "#ffd34d");
}
// ---------------------------------------------------------------- the celebrity's special requests
const guestApi = {
  gear: (p, id, r) => { if (!bagAdd(p.bag, id, 1, r)) { crates.push({ id: nextId++, x: p.x, y: p.y + 40, it: { id, r } }); toast(p, "Your bag's full, so it's on the ground.", "#bbb"); } p.invDirty = true; },
  card: (p, id) => { p.cards[id] = (p.cards[id] || 0) + 1; p.invDirty = true; p.pe.push({ k: "pack", cards: [id] }); },
  pack: (p) => openPack(p),
  bottlePee: (p) => { if (p.bl < 30) return "You don't need to go. Bear looks disappointed."; if (!bagAdd(p.bag, "pee")) return "Your bag is full."; p.bl = 0; p.invDirty = true; return "You fill a bottle. Bear Gritts gives you a solemn thumbs up."; },
  wrestle: (p) => {
    if (Math.random() < 0.35 + 0.05 * sk(p, "tough")) { addGold(p, 60, "Beat The Boulder at arm wrestling"); feed(`${fullName(p)} beat The Boulder at arm wrestling!`, "#ffd34d"); return "His arm hits the table. The crowd goes silent. +60g"; }
    const n = NPC_POS.find((q) => q.id === "boulder"); if (n) { const a = Math.atan2(p.y - n.y, p.x - n.x); p.vx = Math.cos(a) * 900; p.vy = Math.sin(a) * 900; p.vz = 300; p.gr = false; p.pe.push({ k: "kick", vx: p.vx, vy: p.vy, vz: 300 }); }
    p.dlg = null; return "He wins, then throws you across the valley. \"Know your role.\"";
  },
  calm: (p) => { p.stress = 0; return "A soothing voice describes you as 'a magnificent, if anxious, specimen'. All your stress melts away."; },
  tip: (p) => {
    if (!game.tip) { const sym = pick(SYMS.filter((s) => s !== "BNKR")); game.tip = { sym }; }
    return `He leans in. "${STOCKS[game.tip.sym].name}. ${game.tip.sym}. Buy before the sun comes up. You didn't hear it from me."`;
  },
  fiver: (p) => { addGold(p, 5, "Warren's spare change"); return "He hands you exactly five gold, then writes it down."; },
};
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
function zoneShrinkTo(r, secs) {
  const z = game.zone, t = now(); if (!z) return;
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
  const L = 2600;
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
// breath: underwater it runs out in about 15 seconds. Surface, or find a bubble vent on the lake bed.
function breathe(p, t, dt) {
  const under = p.swim && p.z < -44;
  const vent = under && WALLS.some((w) => w.kind === "vent" && MV.touches(w, p.x, p.y, 30) && p.z < w.z1 + 70);
  p.breath = clamp((p.breath ?? 15) + (under ? (vent ? 5 : -1) : 4) * dt, 0, 15);
  if (under && p.breath <= 0) { p.hp -= 14 * dt; p.lastHurt = t; if (tickN % 10 === 0) p.pe.push({ k: "hurt" }); if (p.hp <= 0) killPlayer(p, null, "drowned"); }
  if (p.swim && !p.wasSwim) events.push({ k: "splash", x: Math.round(p.x), y: Math.round(p.y) });
  p.wasSwim = p.swim;
}
// the Sunken Shrine: touch the four glyphs in the order carved on the shrine and it opens
const GLYPHS = 4;
function shrineReset() { game.shrine = { order: [0, 1, 2, 3].sort(() => Math.random() - 0.5), step: 0, open: false }; }
function touchGlyph(p) {
  const g = WALLS.find((w) => w.kind === "glyph" && MV.touches(w, p.x, p.y, 50) && p.z < w.z1 + 30);
  if (!g) return false;
  const S2 = game.shrine || (shrineReset(), game.shrine);
  if (S2.open) { toast(p, "The shrine is already open. Its treasure's gone.", "#9fe0ff"); return true; }
  if (S2.order[S2.step] === g.g) {
    S2.step++;
    events.push({ k: "glyph", g: g.g, x: Math.round(g.x + 15), y: Math.round(g.y + 15), z: Math.round(g.z1) });
    if (S2.step < GLYPHS) { toast(p, `The glyph lights up. (${S2.step}/${GLYPHS})`, "#7dd8ff"); return true; }
    S2.open = true;
    const w = newWeapon(pick(LOOT_TYPES), Math.random() < 0.25 ? 4 : 3);
    giveWeapon(p, w); addGold(p, 300, "The Sunken Shrine");
    for (const q of players.values()) if (q !== p) addGold(q, 100, "Someone opened the Sunken Shrine");
    addXp(p, 60); deed("word", 6);
    events.push({ k: "banner", text: "THE SUNKEN SHRINE OPENS", sub: `${fullName(p)} found ${wName(w)} at the bottom of the lake.` });
    return true;
  }
  S2.step = 0;
  events.push({ k: "glyph", g: -1, x: Math.round(g.x + 15), y: Math.round(g.y + 15), z: Math.round(g.z1) });
  toast(p, "Wrong glyph. The shrine groans, the glyphs go dark, and something stirs in the silt.", "#ff8080");
  for (let i = 0; i < 2; i++) { const z = spawnZombie("walker", { x: g.x + 15, y: g.y + 15 }); if (z) { z.z = g.z0 + 2; z.gr = true; } }
  return true;
}
function vehOf(p) { return p.veh ? vehicles.find((v) => v.id === p.veh) : null; }
function enterVehicle(p, v) {
  const seat = v.seats[0] ? v.seats[1] ? -1 : 1 : 0;
  if (seat < 0) return false;
  v.seats[seat] = p.id; p.veh = v.id; p.dlg = null;
  const air = VEHICLES[v.kind].air;
  toast(p, seat === 0 ? (air ? `Flying the ${VEHICLES[v.kind].name}. W/S pitch, A/D strafe, the nose follows your mouse, SPACE climbs, C or CTRL descends.${VEHICLES[v.kind].gun ? " Click: chain gun. Right-click: rockets." : ""} A flight stick or gamepad works too (Options). E to get out.` : `Driving the ${VEHICLES[v.kind].name}. WASD to drive, E to get out.`)
    : air ? "Door gunner. Shoot anything that moves. E to jump out (careful)." : `Riding shotgun. You can shoot. E to get out.`, "#9fe0ff");
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
// Helicopters. Keyboard: W/S pitch, A/D strafe, SPACE up, C down, and the nose turns to follow your view.
// With a flight stick or gamepad the client sends [pitch, roll, yaw, collective] straight from the axes.
function flyTick(v, def, driver, t, dt) {
  v.z = v.z || 0; v.vz = v.vz || 0; v.vx = v.vx || 0; v.vy = v.vy || 0;
  const on = !!(driver && !driver.dead);
  let pitch = 0, roll = 0, yaw = 0, lift = 0;
  if (on && driver.fly) [pitch, roll, yaw, lift] = driver.fly;
  else if (on) {
    const k = driver.keys;
    pitch = ((k & 1) ? 1 : 0) - ((k & 4) ? 1 : 0); roll = ((k & 8) ? 1 : 0) - ((k & 2) ? 1 : 0); lift = ((k & 16) ? 1 : 0) - ((k & 32) ? 1 : 0);
    let d = driver.a - v.a; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw = clamp(d * 2.2, -1, 1);
  }
  const air = v.z > 3;
  v.a += yaw * def.turn * dt * (air ? 1 : 0.5);
  const c = Math.cos(v.a), sn = Math.sin(v.a), ka = Math.min(1, dt * 1.1);
  const tvx = air ? (c * pitch - sn * roll * 0.7) * def.max : 0, tvy = air ? (sn * pitch + c * roll * 0.7) * def.max : 0;
  v.vx += (tvx - v.vx) * ka; v.vy += (tvy - v.vy) * ka;
  v.vz += ((on ? lift * (lift > 0 ? 260 : 230) : -170) - v.vz) * Math.min(1, dt * 2.5); // full down is a hard landing but not a crash; nobody at the controls: it comes down
  v.x += v.vx * dt; v.y += v.vy * dt;
  const hit = MV.pushOut(v, def.r, near(v), BW(), BH(), v.z, 40);
  if (hit) {
    const sp = Math.hypot(v.vx, v.vy);
    if (hit !== "edge" && sp > 150) { hurtVehicle(v, sp * 0.18, null); events.push({ k: "land", x: v.x, y: v.y }); if (!vehicles.includes(v)) return; }
    v.vx *= -0.3; v.vy *= -0.3;
  }
  v.z += v.vz * dt;
  const fl = MV.floorAt(v.x, v.y, def.r * 0.5, v.z + 20, near(v)).h;
  if (v.z <= fl) {
    if (v.vz < -280) { hurtVehicle(v, (-v.vz - 280) * 0.9, null); events.push({ k: "land", x: v.x, y: v.y }); if (!vehicles.includes(v)) return; }
    v.z = fl; v.vz = Math.max(0, v.vz); const f = Math.pow(0.02, dt); v.vx *= f; v.vy *= f;
  }
  if (v.z > 1100) { v.z = 1100; v.vz = Math.min(0, v.vz); }
  v.v = Math.hypot(v.vx, v.vy);
  // low and fast, the rotor wash shoves the dead about
  if (v.z < 90 && v.z > 8) for (const z of zombies) if (z.type !== "flyer" && dist2(z, v) < 110 * 110 && Math.random() < dt * 3) { const d = Math.sqrt(dist2(z, v)) || 1; z.vx += (z.x - v.x) / d * 260; z.vy += (z.y - v.y) / d * 260; }
  v.seats.forEach((id, i) => { const p = players.get(id); if (p && p.veh === v.id) { p.x = v.x; p.y = v.y; p.z = v.z + (i ? 8 : 4); } });
  if (!def.gun || !on) return;
  // the gunship: chain gun on the left mouse button (or trigger), rockets on the right (or the second button)
  if (driver.firing && t > (v.gunAt || 0)) {
    v.gunAt = t + 0.075;
    v.gun = v.gun || newWeapon("ak", 2); v.gun.ammo = 99; v.gun.bloom = 0.15; v.gun.reloadUntil = 0;
    shoot(driver, v.gun);
  }
  if (driver.ads && t > (v.rocketAt || 0)) { v.rocketAt = t + 1.2; fireRocket(driver, { rarity: 1 }, 1.2); }
}
function vehicleTick(t, dt) {
  for (const v of [...vehicles]) {
    const def = VEHICLES[v.kind], driver = players.get(v.seats[0]);
    if (driver && (driver.dead || driver.veh !== v.id)) v.seats[0] = 0;
    if (def.air) { flyTick(v, def, players.get(v.seats[0]), t, dt); continue; }
    const k = driver && !driver.dead ? driver.keys : 0;
    const thr = ((k & 1) ? 1 : 0) - ((k & 4) ? 1 : 0), steer = ((k & 8) ? 1 : 0) - ((k & 2) ? 1 : 0);
    if (thr) v.v += thr * def.acc * dt * (Math.sign(thr) !== Math.sign(v.v) && Math.abs(v.v) > 20 ? 2 : 1);
    else v.v *= Math.pow(0.25, dt);
    v.v = clamp(v.v, -def.max * 0.4, def.max * (outsideZone(v) ? 0.8 : 1));
    v.a += steer * def.turn * dt * clamp(v.v / 140, -1, 1);
    const ox = v.x, oy = v.y;
    v.x += Math.cos(v.a) * v.v * dt; v.y += Math.sin(v.a) * v.v * dt;
    if (collide(v, def.r) || MV.pushOut(v, def.r, LAKE_SOLID, BW(), BH(), 0, 40)) {
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
  if (!OPEN() && (x < 40 || y < 40 || x + GRID > W - 40 || y + GRID > H - 40)) return fail("Can't build at the edge of the world.");
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
      const blocked = (e) => { const dx = e.x - mid.x, dy = e.y - mid.y, d = Math.hypot(dx, dy) || 1; for (const w of WALLS) if (w !== b && (w.z1 ?? 60) > 30 && rayRect(mid.x, mid.y, dx / d, dy / d, w) < d - 20) return true; return false; };
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
  zombies = []; crates = []; caches = [];
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) { resetProgress(p); resetLoadout(p, true); p.weapons = [newWeapon("pistol")]; p.active = 0; p.gold = 0; }
  const n = 30 + 6 * players.size;
  for (let i = 0; i < n; i++) crates.push({ id: nextId++, ...freeSpot(), w: newWeapon(pick(LOOT_TYPES), lootRarity(2)) });
  spawnCaches(4);
  for (let i = 0; i < 18; i++) crates.push({ id: nextId++, ...freeSpot(), w: newWeapon("pistol", lootRarity(1)) });
  spawnVehicles(["tractor", "buggy", "buggy", "heli", ...Array(Math.floor(players.size / 2)).fill("buggy")]);
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
  PLOTS.length = BASE_PLOTS; // tilled plots belong to the last game
  BALL.x = BALL.y = 0;
  generateMap((Math.random() * 1e9) | 0);
  vehicles = []; builds = []; game.zone = null; game.drop = null; game.countdown = 0; game.skip = new Set(); game.pendingVote = null;
  game.deeds = freshDeeds(); game.legend = null;
  if (game.mode === "story") placeNpcs(); else NPC_POS = [];
  projs = []; fires.clear(); scorched.clear(); game.disaster = null; game.dino = false; game.dinoDay = false; shrineReset();
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
    zoneInit(W / 2, H / 2, 2300, ROYALE_ZONES.map((z) => [...z]));
    startDrop(null);
    events.push({ k: "banner", text: `SLOP ROYALE: ${VALLEY.toUpperCase()}`, sub: "Jump with SPACE. Loot up. Build [C]. Steal a ride [E]. Last farmer standing wins." });
    return;
  }
  game.ends = now() + DAY_LEN;
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  // the closing fog ring is Royale's; in Story and Endless the night itself is the pressure
  startDrop(hc);
  if (game.mode === "endless") { events.push({ k: "banner", text: `ENDLESS: ${VALLEY.toUpperCase()}`, sub: "No story. No end. Keep the Hearth burning as long as you can. A boss comes every fifth night." }); openVote(1); openElection(); return; }
  events.push({ k: "banner", text: `WELCOME TO ${VALLEY.toUpperCase()}`, sub: "SPACE to jump. Talk to the townsfolk [E]. Build defences [C]. Night is coming." });
  if (game.cameoDay === 1) cameoArrive();
  radioNews();
  openVote(1); openElection(); // the valley picks its first mayor on day one
}
function setupStory() {
  game.aff = Object.fromEntries(Object.keys(NPCS).map((k) => [k, 0])); game.clues = new Set();
  game.night = 0; game.ends = Infinity; game.result = null; game.ending = null;
  game.flags = { valley: VALLEY }; game.mods = freshMods(); game.vote = null; game.story = null; game.bossId = 0;
  const n = Math.max(1, players.size);
  game.hearthMax = game.hearth = 1000 + 300 * n;
  zombies = []; crates = []; caches = [];
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) { resetProgress(p); resetLoadout(p, true); }
  spawnCrates();
  spawnVehicles(["tractor"], { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
  spawnVehicles(["buggy", "heli", "gunship"]);
  game.cameoDay = game.mode !== "story" ? 0 : process.env.SLOP_CAMEO ? +process.env.SLOP_CAMEO : pick([2, 4]); // never on the day of the Reckoning
  game.cameo = GUESTS.includes(process.env.SLOP_GUEST) ? process.env.SLOP_GUEST : pick(GUESTS);
  game.market = newMarket(); game.mayor = null; game.elec = null; game.nuke = null; game.waste = false; game.hot = []; game.posadAt = 0; game.tip = null;
  game.fog = false;
  game.dome = { have: 0, cost: Math.min(4500, DOME_COST + DOME_PER * (n - 1)), struck: false };
}
// a celebrity turns up for one day of the story, then leaves at nightfall
function cameoArrive() {
  const sp = freeSpot(40), hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let at = sp;
  for (let i = 0; i < 40; i++) { const c = freeSpot(40); const d = Math.hypot(c.x - hc.x, c.y - hc.y); if (d > 250 && d < 520 && !NPC_POS.some((n) => dist2(n, c) < 160 * 160)) { at = c; break; } }
  const G = game.cameo, N = NPCS[G];
  NPC_POS.push({ id: G, x: at.x, y: at.y });
  broadcastRaw(JSON.stringify(mapMsg()));
  events.push({ k: "banner", text: "CELEBRITY SIGHTING!", sub: N.arrive, npc: G });
  feed(N.feed, "#ff9ad0");
}
function cameoLeave() {
  const G = game.cameo, N = NPCS[G];
  if (!NPC_POS.some((n) => n.id === G)) return;
  NPC_POS = NPC_POS.filter((n) => n.id !== G);
  for (const p of players.values()) {
    if (p.dlg && p.dlg.npc === G) { p.dlg = null; sendDlg(p); }
    for (const [id, qs] of Object.entries(p.q)) if (QUESTS[id].npc === G && !qs.done) { delete p.q[id]; toast(p, `${N.name} has left. Your ${QUESTS[id].title} quest went with them.`, "#f88"); }
  }
  broadcastRaw(JSON.stringify(mapMsg()));
  feed(N.leave, "#ff9ad0");
}
function lootRarity(bonus = 0) {
  const r = Math.random() * 100;
  return r < 0.15 + bonus * 0.05 ? 4 : r < 1.5 + bonus * 0.5 ? 3 : r < 8 + bonus * 1.5 ? 2 : r < 42 ? 1 : 0; // rare is rare: a Legendary should be a moment
}
// ---------------------------------------------------------------- Slop-Tech caches: hack them open
let caches = [];
const HEX = ["1C", "55", "BD", "E9", "7A", "FF"];
function spawnCaches(n) {
  for (let i = 0; i < n; i++) { const sp = freeSpot(40); caches.push({ id: nextId++, x: sp.x, y: sp.y }); }
  caches = caches.slice(-6);
}
function startHack(p, c) {
  const t = now();
  if (c.busy && c.busy !== p.id && players.get(c.busy)?.hack) return toast(p, "Someone's already hacking that.", "#bbb");
  const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => pick(HEX.slice(0, 5))));
  // build the target sequences from a real path through the grid, so every puzzle can be solved
  const path = []; let row = 0, col = (Math.random() * 5) | 0, used = new Set();
  for (let i = 0; i < 7; i++) {
    if (i % 2 === 0) { let c2; do c2 = (Math.random() * 5) | 0; while (used.has(row + "," + c2)); col = c2; }
    else { let r2; do r2 = (Math.random() * 5) | 0; while (used.has(r2 + "," + col)); row = r2; }
    used.add(row + "," + col); path.push(g[row][col]);
  }
  const seqs = [path.slice(0, 2), path.slice(1, 4), path.slice(2, 6)];
  c.busy = p.id;
  p.hack = { cache: c.id, g, seqs, buf: 7, until: t + 30 };
  p.pe.push({ k: "hack", g, seqs, buf: 7, time: 30 });
}
function finishHack(p, m) {
  const h = p.hack; if (!h) return;
  p.hack = null;
  const c = caches.find((q) => q.id === h.cache); if (!c) return;
  c.busy = 0;
  if (m.cancel) return;
  // check the picks follow the rules: row 0 first, then alternate column / row, no cell twice
  const picks = Array.isArray(m.picks) ? m.picks.slice(0, h.buf) : [];
  let ok = true, r = 0, col = -1; const used = new Set(), codes = [];
  picks.forEach((pk, i) => {
    const [pr, pc] = Array.isArray(pk) ? pk.map((v) => v | 0) : [-1, -1];
    if (pr < 0 || pr > 4 || pc < 0 || pc > 4 || used.has(pr + "," + pc)) ok = false;
    if (i % 2 === 0 && pr !== r) ok = false;
    if (i % 2 === 1 && pc !== col) ok = false;
    used.add(pr + "," + pc); r = pr; col = pc; codes.push(h.g[pr]?.[pc]);
  });
  const late = now() > h.until + 1;
  const str = codes.join(" ");
  const solved = ok && !late ? h.seqs.filter((sq) => str.includes(sq.join(" "))).length : 0;
  if (!solved) {
    feed(`${fullName(p)} tripped a Slop-Tech alarm.`, "#ff6060");
    events.push({ k: "alarm", x: Math.round(c.x), y: Math.round(c.y) });
    shock(game.market, "SLOP", 0.03);
    if (game.mode !== "royale" || true) { for (let i = 0; i < 3 + players.size; i++) spawnZombie(Math.random() < 0.3 ? "runner" : "walker", c); spawnZombie("screamer", c); }
    return toast(p, late ? "Too slow. ALARM." : "Access denied. ALARM.", "#ff6060");
  }
  caches = caches.filter((q) => q !== c);
  events.push({ k: "hacked", x: Math.round(c.x), y: Math.round(c.y), n: solved });
  shock(game.market, "SLOP", -0.025 * solved, solved >= 2 ? "Slop-Tech cache breached. Shareholders furious." : "");
  addXp(p, 10 * solved); deed("word", 3 * solved);
  addGold(p, 40 * solved, "Hacked a cache");
  p.gren = Math.min(9, p.gren + 1);
  if (solved >= 2) crates.push({ id: nextId++, x: c.x, y: c.y, w: newWeapon(pick(LOOT_TYPES), solved === 3 ? (Math.random() < 0.3 ? 3 : 2) : 1) });
  if (solved === 3) { p.molo = Math.min(9, p.molo + 2); feed(`${fullName(p)} cracked a Slop-Tech cache wide open.`, "#7dffb0"); }
  toast(p, `ACCESS GRANTED (${solved}/3 daemons). ${solved >= 2 ? "Something good dropped out." : ""}`, "#7dffb0");
}
function spawnCrates() { // town gets a trickle; the good stuff is out in the wild
  const n = 1 + Math.floor(players.size / 2);
  spawnCaches(game.mode === "royale" ? 4 : 2);
  for (let i = 0; i < n; i++) crates.push({ id: nextId++, ...freeSpot(), w: newWeapon(pick(LOOT_TYPES), lootRarity(game.night)) });
  for (let i = 0; i < 1; i++) crates.push({ id: nextId++, ...freeSpot(), it: { id: pick(game.waste && Math.random() < 0.4 ? ["gasmask", "hazmat"] : GEAR_KEYS), r: Math.min(3, lootRarity(game.night)) } });
  for (let i = 0; i < 1; i++) crates.push({ id: nextId++, ...freeSpot(), it: { id: pick(game.waste ? ["beans", "ration", "radaway", "iodine", "water"] : ["beans", "ration", "water", "cola", "bandage", "pie", "grog"]), n: 1 + (Math.random() < 0.4 ? 1 : 0) } });
}
// ---------------------------------------------------------------- the wild, past the hedge
function ensureChunks() {
  if (!OPEN() || !(game.phase === "day" || game.phase === "night" || game.phase === "intro")) return;
  const fresh = [];
  for (const p of players.values()) {
    if (p.dead) continue;
    const pcx = Math.floor(p.x / CS), pcy = Math.floor(p.y / CS);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const cx = pcx + i, cy = pcy + j, key = cx + "," + cy;
      if (CHUNKS.has(key)) continue;
      if (cx * CS >= 0 && cy * CS >= 0 && (cx + 1) * CS <= W && (cy + 1) * CS <= H) { CHUNKS.set(key, { kind: "town" }); continue; }
      const c = makeChunk(MAP_SEED, cx, cy, TOWN);
      CHUNKS.set(key, { kind: c.kind });
      for (const w of c.walls) w.id = wallId++;
      WALLS.push(...c.walls); fresh.push(...c.walls);
      for (const l of c.loot) { // something worth walking out here for. Better the further you go.
        const up = (Math.random() < Math.min(0.75, c.far / 7000) ? 1 : 0) + l.good, roll = Math.random();
        if (roll < 0.5) crates.push({ id: nextId++, x: l.x, y: l.y, w: newWeapon(pick(LOOT_TYPES), Math.min(4, lootRarity(game.night) + up)) });
        else if (roll < 0.75) crates.push({ id: nextId++, x: l.x, y: l.y, it: { id: pick(GEAR_KEYS), r: Math.min(4, lootRarity(game.night) + up) } });
        else crates.push({ id: nextId++, x: l.x, y: l.y, it: { id: pick(["beans", "ration", "water", "cola", "bandage", "medkit", "pack", "s_pumpkin", "s_melon", "s_corn", "s_strawberry"]), n: 1 + (Math.random() < 0.5 ? 1 : 0) } });
      }
    }
    // tell people where they've wandered to
    const own = CHUNKS.get(pcx + "," + pcy), where = inTownXY(p.x, p.y) ? "town" : own && own.kind;
    if (where && where !== p.where) { if (p.where && where !== "town" && BIOMES[where]) toast(p, `You wander into ${BIOMES[where].name}.`, "#b8e070"); else if (p.where && where === "town") toast(p, `Back in ${VALLEY}.`, "#ffe9a0"); p.where = where; }
  }
  if (fresh.length) broadcastRaw(JSON.stringify({ t: "ck", seed: MAP_SEED, walls: fresh }));
}
// the dead roam the wild, by day as well as night, and there are more of them the further out you go
function wildTick(t) {
  if (!OPEN() || !(game.phase === "day" || game.phase === "night")) return;
  const live = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of live) {
    if (inTownXY(p.x, p.y, 250)) continue;
    const far = Math.hypot(p.x - W / 2, p.y - H / 2), cap = Math.min(12, 2 + Math.floor(far / 1800)) + (game.phase === "night" ? 3 : 0);
    if (zombies.filter((z) => dist2(z, p) < 1400 * 1400).length >= cap || Math.random() < 0.35) continue;
    const a = rand(0, Math.PI * 2), d = rand(750, 1000), at = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
    if (inTownXY(at.x, at.y, 100) || insideWall(at.x, at.y, 10)) continue;
    const z = spawnZombie(nightType(Math.max(game.night, 1 + Math.floor(far / 2500)), false), at);
    if (!z) continue;
    z.wild = 1; z.aggro = p.id; z.aggroUntil = t + 30; const k = 1 + far / 9000; z.hp *= k; z.maxHp *= k;
  }
  // the wild doesn't keep the dead nobody is near
  zombies = zombies.filter((z) => !z.wild || z.type === "boss" || live.some((p) => dist2(p, z) < 3200 * 3200));
}
// ---------------------------------------------------------------- natural disasters
const DISASTERS = {
  meteor: { name: "METEOR SHOWER", sub: "Get out of the red circles. Or get to the defence console and shoot them down [E].", len: 36, station: "orbital defence console", game: "Orbital Defence" },
  flood:  { name: "FLASH FLOOD", sub: "Get to high ground, or get to the sluice gates and drain it [E]. Crops won't survive it.", len: 45, station: "sluice gates", game: "Sluice Gates" },
  tornado: { name: "TORNADO", sub: "It picks up anything that isn't nailed down. The cloud-seeding rocket can break it up [E].", len: 40, station: "cloud-seeding rocket", game: "Cloud Seeding" },
  quake:  { name: "EARTHQUAKE", sub: "Stay out of the houses. The aftershocks keep coming until someone works the seismic damper [E].", len: 32, station: "seismic damper", game: "Seismic Damper" },
};
// Every disaster can be stopped: a control station appears near town, and whoever works its minigame ends it early.
const FIX_TIME = { meteor: 40, flood: 50, tornado: 30, quake: 35 }, FIX_MIN = { meteor: 10, flood: 3, tornado: 4, quake: 10 };
function placeStation() {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  for (let i = 0; i < 80; i++) { const c = freeSpot(40), d = Math.hypot(c.x - hc.x, c.y - hc.y); if (d > 280 && d < 650 && !insideWall(c.x, c.y, 10)) return c; }
  return { x: hc.x + 300, y: hc.y + 120 };
}
// the sluice puzzle: a grid of pipes, every one turned the wrong way. Turn them so water flows from the left inlet to the right outlet.
const PIPE = [5, 3, 7]; // straight (N+S), elbow (N+E), tee (N+E+S); N=1 E=2 S=4 W=8
const rotMask = (m, k) => { for (let i = 0; i < (k & 3); i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dRow, dCol, opposite bit
function makeSluice() {
  const R = 4, C = 6, r0 = (Math.random() * R) | 0, r1 = (Math.random() * R) | 0;
  const seen = new Set(), path = [];
  const dfs = (r, c) => {
    seen.add(r * C + c); path.push([r, c]);
    if (r === r1 && c === C - 1) return true;
    const nb = DIRS.map(([, dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < R && b >= 0 && b < C && !seen.has(a * C + b)).sort(() => Math.random() - 0.5);
    for (const [a, b] of nb) if (dfs(a, b)) return true;
    path.pop(); return false;
  };
  dfs(r0, 0);
  const need = new Map();
  path.forEach(([r, c], i) => {
    let m = 0;
    const prev = i ? path[i - 1] : [r, -1], next = i < path.length - 1 ? path[i + 1] : [r, C];
    for (const [pr, pc] of [prev, next]) for (const [bit, dr, dc] of DIRS) if (pr === r + dr && pc === c + dc) m |= bit;
    need.set(r * C + c, m);
  });
  const g = [], sol = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const m = need.get(r * C + c);
    let type = Math.random() < 0.15 ? 2 : (Math.random() * 2) | 0, k = 0;
    if (m !== undefined) { type = [0, 1].find((ty) => [0, 1, 2, 3].some((q) => rotMask(PIPE[ty], q) === m)); k = [0, 1, 2, 3].find((q) => rotMask(PIPE[type], q) === m); }
    g.push([type, (Math.random() * 4) | 0]); sol.push(k);
  }
  return { R, C, r0, r1, g, sol };
}
function sluiceFlows(S, rots) {
  const { R, C, r0, r1, g } = S, mask = (i) => rotMask(PIPE[g[i][0]], rots[i] | 0);
  if (!(mask(r0 * C) & 8)) return false;
  const seen = new Set([r0 * C]), q = [r0 * C];
  while (q.length) {
    const i = q.shift(), r = Math.floor(i / C), c = i % C, m = mask(i);
    if (r === r1 && c === C - 1 && (m & 2)) return true;
    for (const [bit, dr, dc, opp] of DIRS) {
      const a = r + dr, b = c + dc, j = a * C + b;
      if (!(m & bit) || a < 0 || a >= R || b < 0 || b >= C || seen.has(j) || !(mask(j) & opp)) continue;
      seen.add(j); q.push(j);
    }
  }
  return false;
}
function startFix(p) {
  const D = game.disaster, t = now();
  if (!D || !D.st || p.fix) return;
  if (D.st.busy && D.st.busy !== p.id && players.get(D.st.busy)?.fix) return toast(p, "Someone's already working it. Cover them.", "#bbb");
  if (t < (p.fixCool || 0)) return toast(p, `The ${DISASTERS[D.kind].station} is resetting. Try again in ${Math.ceil(p.fixCool - t)}s.`, "#bbb");
  D.st.busy = p.id;
  p.fix = { kind: D.kind, t0: t, until: t + FIX_TIME[D.kind] };
  const msg = { k: "fix", kind: D.kind, time: FIX_TIME[D.kind], title: DISASTERS[D.kind].game };
  if (D.kind === "flood") { const S = p.fix.sluice = makeSluice(); Object.assign(msg, { R: S.R, C: S.C, r0: S.r0, r1: S.r1, g: S.g }); }
  p.pe.push(msg);
}
function endFix(p, why) { if (!p.fix) return; p.fix = null; if (game.disaster && game.disaster.st && game.disaster.st.busy === p.id) game.disaster.st.busy = 0; p.pe.push({ k: "fix", close: 1, why }); }
function finishFix(p, m) {
  const F = p.fix, D = game.disaster, t = now(); if (!F) return;
  if (m.cancel) return endFix(p);
  if (!D || D.kind !== F.kind) return endFix(p, "It's already over.");
  const quick = t - F.t0 < FIX_MIN[F.kind], late = t > F.until + 2;
  const ok = !quick && !late && (F.kind === "flood" ? Array.isArray(m.rots) && sluiceFlows(F.sluice, m.rots) : !!m.ok);
  if (!ok) { p.fixCool = t + 8; endFix(p); return toast(p, late ? "Too slow. The station resets." : "That didn't work. The station needs a few seconds to reset.", "#ff8060"); }
  endFix(p);
  const D0 = DISASTERS[D.kind];
  if (D.kind === "flood") D.until = Math.min(D.until, t + 8); // the water drains away
  else D.until = t;
  D.st = null; D.stopped = true;
  addGold(p, 80, `Stopped the ${D0.name.toLowerCase()}`); addXp(p, 40); p.st.saves = (p.st.saves || 0) + 1;
  for (const q of players.values()) if (q !== p) addGold(q, 20);
  deed("soil", 6);
  feed(`${fullName(p)} stopped the ${D0.name.toLowerCase()} at the ${D0.station}! (+80g, everyone else +20g)`, "#9fe0ff");
  events.push({ k: "banner", text: `${D0.name} STOPPED`, sub: `${fullName(p)} worked the ${D0.station}. Drinks are on them.` });
  shock(game.market, "FARM", 0.05, "Disaster averted. Farm shares rally.");
}
function maybeDisaster() {
  if (game.mode === "royale" || game.disaster) return;
  const forced = DISASTER && DISASTERS[DISASTER] ? DISASTER : DISASTER === "any" ? pick(Object.keys(DISASTERS)) : "";
  if (!forced && (game.night < 2 || Math.random() > DISASTER_CHANCE)) return;
  const kind = forced || pick(Object.keys(DISASTERS)), t = now(), D = DISASTERS[kind];
  game.disaster = { kind, t0: t, until: t + D.len, next: t + 1, meteors: [], water: 0, drowned: false, st: { ...placeStation(), busy: 0 } };
  if (kind === "tornado") { const sp = freeSpot(40); Object.assign(game.disaster, { x: sp.x, y: sp.y, vx: 0, vy: 0 }); }
  events.push({ k: "banner", text: D.name, sub: D.sub });
  events.push({ k: "disaster", kind });
  feed(`${D.name}!`, "#ff9a40");
  shock(game.market, "FARM", -0.12, `${D.name} batters the valley's farms`); shock(game.market, "GRUB", -0.04);
}
function disasterTick(t, dt) {
  const D = game.disaster; if (!D) return;
  if (t > D.until && !(D.kind === "flood" && D.water > 0) && !D.meteors.length) {
    game.disaster = null;
    for (const p of players.values()) if (p.fix) endFix(p, "The disaster has passed.");
    if (!D.stopped) events.push({ k: "feed", text: "The disaster has passed.", color: "#9fe0ff" });
    return;
  }
  if (D.st && D.st.busy && !players.get(D.st.busy)?.fix) D.st.busy = 0;
  const live = [...players.values()].filter((p) => !p.dead && !p.air);
  if (D.kind === "meteor") {
    if (t < D.until && t > D.next) {
      D.next = t + rand(0.5, 1.1);
      const near = live.length && Math.random() < 0.7 ? pick(live) : null;
      const x = clamp(near ? near.x + rand(-420, 420) : rand(100, W - 100), 40, W - 40), y = clamp(near ? near.y + rand(-420, 420) : rand(100, H - 100), 40, H - 40);
      D.meteors.push({ x, y, at: t + 1.8 });
    }
    for (const m of D.meteors) if (t >= m.at) {
      m.done = true;
      const z = MV.floorAt(m.x, m.y, 4, 2000, near(m)).h;
      explode(m.x, m.y, z + 10, 150, 90, null, "flattened by a meteor", 1);
      for (let i = 0; i < 3; i++) ignite(m.x + rand(-60, 60), m.y + rand(-60, 60), z + 30, 0, 2, true);
      events.push({ k: "meteor", x: Math.round(m.x), y: Math.round(m.y), z: Math.round(z) });
    }
    D.meteors = D.meteors.filter((m) => !m.done);
  } else if (D.kind === "flood") {
    const rise = 8, peak = 30, k = t < D.t0 + rise ? (t - D.t0) / rise : t < D.until - rise ? 1 : Math.max(0, (D.until - t) / rise);
    D.water = peak * k;
    if (D.water > 12 && !D.drowned) { D.drowned = true; let n = 0; for (const pl of PLOTS) if (pl.stage > 0) { pl.stage = 0; pl.prog = 0; n++; } if (n) feed(`The flood drowned ${n} crop${n > 1 ? "s" : ""}.`, "#6ab0e0"); }
    for (const [key, f] of fires) if (f.z < D.water) fires.delete(key);
    for (const p of players.values()) if (p.z < D.water - 4) p.fireUntil = 0;
  } else if (D.kind === "tornado") {
    // it wanders towards people, and throws everything it touches
    const tgt = live.length ? live.reduce((a, b) => (dist2(a, D) < dist2(b, D) ? a : b)) : null;
    if (tgt) { const d = Math.hypot(tgt.x - D.x, tgt.y - D.y) || 1; D.vx += ((tgt.x - D.x) / d * 110 - D.vx) * dt * 0.5; D.vy += ((tgt.y - D.y) / d * 110 - D.vy) * dt * 0.5; }
    D.vx += rand(-60, 60) * dt; D.vy += rand(-60, 60) * dt;
    D.x = clamp(D.x + D.vx * dt, 60, W - 60); D.y = clamp(D.y + D.vy * dt, 60, H - 60);
    const pull = (e, isP) => {
      const dx = D.x - e.x, dy = D.y - e.y, d = Math.hypot(dx, dy);
      if (d > 280 || d < 1) return;
      const k = 1 - d / 280, tx = -dy / d, ty = dx / d; // swirl + suck in
      if (isP) {
        if (e.veh || e.air || e.dead || e.fix) return; // working the station anchors you
        e.vx += (dx / d * 500 + tx * 700) * k * dt; e.vy += (dy / d * 500 + ty * 700) * k * dt;
        if (d < 90 && e.gr) { kick(e, tx * 300, ty * 300, 650); hurtPlayer(e, 8, null, "carried off by a tornado"); }
      } else {
        e.vx += (dx / d * 400 + tx * 600) * k * dt; e.vy += (dy / d * 400 + ty * 600) * k * dt;
        if (d < 90 && e.gr && e.type !== "boss" && e.type !== "rex") { e.vz = 600; e.gr = false; e.hp -= 6; }
      }
    };
    for (const p of players.values()) pull(p, true);
    for (const z of zombies) if (z.type !== "flyer") pull(z, false);
    for (const b of builds) if (Math.hypot(b.x + 20 - D.x, b.y + 20 - D.y) < 90) hurtPiece(b, 400 * dt);
    for (const w of [...WALLS]) if (w.hp && (w.kind === "fence" || w.kind === "crate" || w.kind === "tree") && boxDist(w, D.x, D.y, 0) < 70) damageWall(w, 250 * dt);
    { const d = Math.hypot(BALL.x - D.x, BALL.y - D.y); if (d < 280) { BALL.vx += (-(BALL.y - D.y) / (d || 1)) * 900 * dt; BALL.vy += ((BALL.x - D.x) / (d || 1)) * 900 * dt; if (d < 90) BALL.vz = 500; } }
  } else if (D.kind === "quake") {
    if (t > D.next) {
      D.next = t + 0.5;
      const houses = WALLS.filter((w) => w.hp && (w.kind === "house" || w.kind === "rock"));
      if (houses.length && Math.random() < 0.12) damageWall(pick(houses), 600);
      for (const z of zombies) if (z.gr && Math.random() < 0.3) z.stun = Math.max(z.stun, t + 0.6);
      for (const p of live) if (p.gr && !p.fix) { addStress(p, 1); if (Math.random() < 0.2) kick(p, rand(-120, 120), rand(-120, 120), 120); }
      events.push({ k: "quake" });
    }
  }
}
function maybeNuke() {
  if (game.mode === "royale" || game.nuke) return;
  if (game.night < FIRST_NUKE) return; // five days of peace (of a sort) to get the dome up
  if (game.dome && !game.dome.struck) return nukeWarn(`The war has reached ${VALLEY}.`); // it was always coming
  if (game.mayor === "posad" && game.posadAt && game.night >= game.posadAt) { game.posadAt = 0; return nukeWarn("Comrade Posad has kept his campaign promise."); }
  if (Math.random() < NUKE_CHANCE) nukeWarn("Somebody, somewhere, has pressed the button.");
}
function startNight() {
  if (game.vote) resolveVote();
  if (game.elec) resolveElection();
  shock(game.market, "BOOM", 0.04, "Night falls. Munitions orders surge.");
  cameoLeave();
  game.night++;
  game.phase = "night";
  for (const n of NPC_POS) npcRoute(n, true);
  const n = Math.max(1, players.size);
  game.spawnLeft = Math.round(Math.min(120, (8 + 6 * game.night) * (0.7 + 0.3 * n) * game.mods.zCount * game.mods.nightCut));
  game.mods.nightCut = 1;
  game.spawnNext = now() + 2;
  // the story's last night only comes once the mystery is solved; until then the waves never stop
  const final = game.mode === "story" && game.night >= LAST_NIGHT && solved();
  const endlessBoss = game.mode === "endless" && game.night % ENDLESS_BOSS_EVERY === 0;
  game.fog = !final && !endlessBoss && game.night >= 2 && Math.random() < FOG_NIGHT;
  game.dino = !final && !endlessBoss && !!game.dinoDay; game.dinoRex = false; game.dinoDay = false;
  if (game.dino) { game.fog = false; game.spawnLeft = Math.max(6, Math.round(game.spawnLeft * 0.55)); }
  game.spawnTotal = game.spawnLeft;
  maybeDisaster();
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
    const sub = game.dino ? "Dinosaur night. Only dinosaurs tonight, and one big one. Frost and storm work best." : game.fog ? "FOG NIGHT. You can't see a thing. Listen for the screamers." : game.night === 1 ? "Protect the Hearth. Don't shoot your friends (much)." : game.mode === "story" && game.night >= LAST_NIGHT ? "The dead won't stop until someone solves the mystery. Check your journal [J]." : "They're getting hungrier.";
    events.push({ k: "banner", text: game.dino ? `NIGHT ${game.night}: DINOSAUR NIGHT` : game.fog ? `NIGHT ${game.night}: THE FOG` : `NIGHT ${game.night}`, sub });
  }
  maybeNuke();
}
// Rates: every morning the valley takes a tenth of anything over 1500g. Hoarding gold is the one thing it taxes.
const RATES_FREE = 1500, RATES = 0.1;
function collectRates() {
  if (game.mode === "royale") return;
  for (const p of players.values()) {
    const due = Math.floor((p.gold - RATES_FREE) * RATES * (game.mayor === "vex" ? 0.5 : game.mayor === "posad" ? 2 : 1));
    if (due < 1) continue;
    p.gold -= due; p.st.rates = (p.st.rates || 0) + due;
    toast(p, `Town rates: ${due}g (a tenth of everything over ${RATES_FREE}g). Spend it or lose it.`, "#ffb070");
  }
}
function startDay() {
  game.phase = "day"; game.ends = now() + DAY_LEN; game.fog = false; game.dino = false; game.duskWarned = false;
  game.dinoDay = isDinoDay(game.night + 1); game.dinoNext = now() + 12;
  if (game.zone) zoneShrinkTo(40000, 20); // the fog lifts off the wild
  for (const n of NPC_POS) npcRoute(n, false);
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
  for (const z of zombies) if (z.type !== "elite") z.burn = true;
  spawnCrates();
  const left = LAST_NIGHT - game.night;
  const sub = game.mode === "endless" ? `You survived night ${game.night}. ${ENDLESS_BOSS_EVERY - (game.night % ENDLESS_BOSS_EVERY)} until the next boss. The shops are open.`
    : solved() ? (left <= 1 ? "The mystery is solved. Tonight is the final night. The shops are open." : `The sun burns the dead. ${left} nights left. The shops are open.`)
    : left <= 1 ? "The sun burns the dead, but they'll keep coming until the mystery is solved [J]. The shops are open." : `The sun burns the dead. Solve the mystery [J] and survive ${left} more nights. The shops are open.`;
  if (game.dinoDay) events.push({ k: "banner", text: `DAY ${game.night + 1}: DINOSAUR DAY`, sub: "The well's coughing up dinosaurs. Nothing else today or tonight. Raptors hunt in threes, so stick together." });
  else events.push({ k: "banner", text: `DAY ${game.night + 1}`, sub });
  const day = game.night + 1;
  if (game.mode === "story" && game.night === 2) { // the Reckoning: the valley decides what you are, then the day's vote follows
    game.legend = legendOf(game.deeds);
    const r = reckoning(game.legend, storyApi);
    game.story = { title: r.title, pick: game.legend ? legendName(game.legend, VALLEY) : "Nobody special", text: r.text, until: now() + 20 };
    feed(`The valley has decided: you are ${legendName(game.legend, VALLEY)}.`, game.legend ? LEGENDS[game.legend].color : "#ccc");
    events.push({ k: "legend", kind: game.legend });
  }
  openVote(day);
  if ((day - 1) % ELECT_EVERY === 0) openElection(); // election day: the mayor's race joins the ballot
  if (game.mode === "story" && day === game.cameoDay) cameoArrive();
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
  if (game.dino || game.dinoDay) return "raptor"; // dinosaur day: nothing else
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return "walker";
}
function spawnRaptors(at) { for (let i = 0; i < 3; i++) spawnZombie("raptor", at); }
function spawnZombie(type, at) { const z = spawnZombie0(type, at); if (game.waste && z) z.glow = true; return z; }
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
  // phase clock + votes
  if (game.phase === "day" && t > game.ends) startNight();
  else if (game.phase === "night" && t > game.ends) startDay();
  if (game.vote && t > game.vote.ends + 1) resolveVote(); // normally counted at dusk (startNight)
  if (game.elec && t > game.elec.ends + 1) resolveElection();
  if (game.nuke && t >= game.nuke.at) nukeBlast();
  if (tickN % TICK_RATE === 0 && game.phase !== "royale") marketTick(game.market);
  if (game.story && t > game.story.until) game.story = null;
  zoneTick(t);
  if (tickN % 10 === 0) ensureChunks();
  if (tickN % 45 === 0) wildTick(t);
  if (OPEN() && game.phase === "day" && !game.duskWarned && game.ends - t < 25 && game.zone) { // the fog comes for the wild at night
    game.duskWarned = true;
    const R = STORY_ZONE_R[Math.min(game.night + 1, STORY_ZONE_R.length - 1)];
    for (const p of players.values()) if (!p.dead && (p.x - game.zone.cx) ** 2 + (p.y - game.zone.cy) ** 2 > R * R) { toast(p, "Night is coming. The slop fog will swallow the wild. Get back to town!", "#c080ff"); p.pe.push({ k: "dusk" }); }
  }
  if (game.phase === "royale") {
    const target = 16 + 4 * players.size;
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
    const kind = nightType(game.night, game.fog);
    if (kind === "raptor") { const z = spawnZombie("raptor"); spawnZombie("raptor", z); if (game.spawnLeft > 1) { spawnZombie("raptor", z); game.spawnLeft--; } game.spawnLeft--; } // packs
    else spawnZombie(kind);
    if (game.dino && !game.dinoRex && game.spawnLeft < game.spawnTotal * 0.5) { game.dinoRex = true; const rx = spawnZombie("rex"); const k = (0.6 + 0.4 * players.size) / 2.2; rx.hp *= k; rx.maxHp *= k; events.push({ k: "banner", text: "T. REX", sub: "It's coming for the Hearth. Storm is super effective." }); }
    game.spawnLeft--;
    const len = game.ends === Infinity ? 50 : NIGHT_LEN * 0.8;
    game.spawnNext = t + len / Math.max(10, game.spawnLeft + 10) * 0.9;
    if (game.ends === Infinity && game.spawnLeft === 0) game.spawnLeft = 12; // endless trickle while the boss lives
  }
  if (game.phase === "day" && game.dinoDay && t > game.dinoNext) { // dinosaur day: packs roam the valley in daylight (the sun doesn't bother them)
    game.dinoNext = t + (FAST ? 4 : 22);
    const cap = Math.min(15, 3 + 3 * players.size), live = zombies.filter((z) => z.type === "raptor" && !z.wild).length;
    if (live + 3 <= cap) { const z = spawnZombie("raptor"); spawnZombie("raptor", z); spawnZombie("raptor", z); }
  }
  if ((game.phase === "day" || game.phase === "night") && game.mods.hearthRegen) game.hearth = Math.min(game.hearthMax, game.hearth + game.mods.hearthRegen * dt);

  const playing = game.phase === "day" || game.phase === "night" || game.phase === "royale";
  if (playing) ballTick(t, dt);
  if (playing) { vehicleTick(t, dt); buildTick(t); projTick(t, dt); fireTick(t, dt); disasterTick(t, dt); }
  if (playing && NPC_POS.length) npcTick(t, dt);

  // players
  const alive = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of players.values()) {
    if (p.dead) { if (game.phase !== "over" && game.phase !== "intro" && !p.out && game.mode !== "royale" && t > p.respawnAt) respawnHeir(p); continue; }
    if (p.air === "wait") continue;
    if (p.air === "bunker") { p.food = Math.max(10, p.food - dt * 0.05); continue; } // safe, and bored
    if (p.air === "plane") {
      const pos = dropPos(t); p.x = pos.x; p.y = pos.y; p.z = 700;
      if (pos.k >= 0.97) jump(p);
      continue;
    }
    if (p.air === "fall") {
      let fx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), fy = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
      if (fx && fy) { fx *= Math.SQRT1_2; fy *= Math.SQRT1_2; }
      if (OPEN()) { p.x += fx * 420 * dt; p.y += fy * 420 * dt; } else { p.x = clamp(p.x + fx * 420 * dt, 30, W - 30); p.y = clamp(p.y + fy * 420 * dt, 30, H - 30); }
      p.z = Math.max(0, 700 * clamp((p.fallEnd - t) / 2.2, 0, 1));
      if (t > p.fallEnd) { p.air = null; collide(p, 16); p.z = MV.floorAt(p.x, p.y, 10, 2000, near(p)).h; p.vz = 0; p.vx = p.vy = 0; p.gr = true; events.push({ k: "land", x: p.x, y: p.y }); }
      continue;
    }
    if (outsideZone(p) && (game.phase === "night" || game.phase === "royale")) {
      p.hp -= (game.mode === "royale" ? game.zone.dmg : 6) * dt; p.lastHurt = t;
      if (tickN % 15 === 0) p.pe.push({ k: "fog" });
      if (p.hp <= 0) killPlayer(p, null, "lost in the slop fog");
      if (p.dead) continue;
    }
    if (p.dlg) { const n = NPC_POS.find((q) => q.id === p.dlg.npc); if (!n || dist2(n, p) > 150 * 150) { p.dlg = null; sendDlg(p); } }
    if (p.cg && !NPC_POS.some((q) => q.id === p.cg.npc)) { toast(p, "Your opponent has left. The game's off; you get your stake back.", "#bbb"); p.gold += p.cg.stake; p.cg = null; sendCards(p); }
    if (playing) {
      needs(p, dt, t); stress(p, dt, t);
      if (p.inf) { if (t > p.inf.until) cure(p, "The infection passes. You feel almost normal."); else if (t > p.inf.next) nextSymptom(p); }
    }
    const veh = vehOf(p);
    if (p.veh && !veh) p.veh = 0;
    if (!veh) {
      const ev = MV.step(p, { keys: p.keys, yaw: p.a, rel: p.rel }, dt, { sp: speedOf(p), boxes: near(p), W: BW(), H: BH(), frozen: t < p.going || !!p.dlg || !!p.cg || t < p.frozen || game.phase === "lobby" });
      if (ev === "pad") events.push({ k: "pad", x: Math.round(p.x), y: Math.round(p.y) });
      breathe(p, t, dt);
      if (p.z > 1400) p.z = 1400;
    } else { p.z = (veh.z || 0) + (veh.seats[1] === p.id ? 8 : VEHICLES[veh.kind].air ? 4 : 0); p.vz = 0; p.vx = 0; p.vy = 0; p.gr = !VEHICLES[veh.kind].air || !veh.z; }
    p.heat = Math.max(0, p.heat - 1.6 * dt);
    const mh = maxHp(p);
    if (sk(p, "wind") && t - p.lastHurt > 3) p.hp = Math.min(mh, p.hp + 1.5 * sk(p, "wind") * dt);
    if (sk(p, "rally")) for (const q of alive) if (q !== p && dist2(q, p) < 220 * 220) q.hp = Math.min(maxHp(q), q.hp + 0.8 * sk(p, "rally") * dt);
    if (p.hp > mh) p.hp = mh;
    const w = p.weapons[p.active];
    w.bloom = Math.max(0, w.bloom - dt * 2.2);
    reloadTick(p, w, t);
    if (p.hoeOut && (!p.hoe || p.veh || p.swim)) p.hoeOut = false;
    if (p.firing && p.hoeOut && !p.dlg && t >= (p.tillAt || 0)) { p.tillAt = t + 0.5; till(p); } // the hoe's out: clicking digs, it doesn't shoot
    else if (p.firing && !p.dlg && !p.cg && !p.cleaning && !(t < p.going) && !(t < p.meltdown) && !(veh && veh.seats[0] === p.id) && playing && t >= w.nextShot) {
      if (w.reloadUntil) { /* busy reloading */ }
      else if (w.jam) { w.nextShot = t + 0.4; p.pe.push({ k: "click" }); }
      else if (w.ammo > 0) {
        shoot(p, w);
        w.dirt = Math.min(100, (w.dirt || 0) + (DIRT[w.type] || 0) * (game.phase === "lobby" ? 0 : 1) * (1 - Math.min(0.8, gearSum(p.gear, "dirt"))));
        const jam = w.dirt < 40 ? 0 : Math.min(0.1, ((w.dirt - 40) / 60) ** 2 * 0.1);
        if (w.ammo > 0 && Math.random() < jam) { w.jam = true; p.pe.push({ k: "jammed" }); }
      }
      else { startReload(p, w); p.pe.push({ k: "click" }); }
    }
  }

  // plots
  for (const pl of PLOTS) {
    if (pl.stage === 0 || pl.stage === 3) continue;
    pl.prog += dt * pl.rate / (13 * (CROPS[pl.crop || "turnip"].t));
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
    if (!target && z.wild) { if (!z.wander || dist2(z, z.wander) < 900 || Math.random() < dt * 0.1) z.wander = { x: z.x + rand(-400, 400), y: z.y + rand(-400, 400) }; } // shambling about in the wild
    const goal = target || (game.mode === "royale" || z.wild ? z.wander : hc);
    let dx = goal.x - z.x, dy = goal.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (z.steer) { const c = Math.cos(z.steer), s = Math.sin(z.steer); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
    let sp = (z.type === "boss" ? B.speed : def.speed) * (z.type === "runner" ? 1 : 1 + 0.03 * Math.min(game.night, 12));
    if (z.type !== "flyer" && wading(z)) sp *= 0.6;
    if ((z.type === "boss" || z.type === "elite") && t < z.charge) sp = 380;
    if (z.type === "charger") {
      // wind up, then a straight-line charge that sends people flying. Hitting a wall stuns it.
      if (!z.wind && !(t < z.charge) && target && bd < 420 * 420 && t > z.special && Math.abs(target.z - z.z) < 80) { z.wind = t + 0.7; events.push({ k: "roar", x: z.x, y: z.y, small: 1 }); }
      if (z.wind && t < z.wind) { sp = 0; if (target) z.chDir = Math.atan2(target.y - z.y, target.x - z.x); }
      else if (z.wind) { z.wind = 0; z.charge = t + 1.1; z.special = t + 6; }
      if (t < z.charge) { dx = Math.cos(z.chDir); dy = Math.sin(z.chDir); sp = 560; }
    }
    if (z.type === "screamer" && target && bd < 280 * 280) { dx = -dx; dy = -dy; sp *= 0.8; } // keeps its distance
    if (z.type === "raptor" && target && z.gr && t > z.special && bd < 190 * 190 && bd > 50 * 50 && !(t < z.stun)) {
      // pounce
      z.special = t + rand(2.5, 3.5); z.pounce = t + 1;
      const d = Math.sqrt(bd); z.vx = (target.x - z.x) / d * 480; z.vy = (target.y - z.y) / d * 480; z.vz = 360; z.gr = false;
      events.push({ k: "roar", x: z.x, y: z.y, small: 1 });
    }
    if (z.type === "raptor" && t < z.pounce) sp *= 0.3;
    if (z.type === "rex" && target && t > z.special && bd < 320 * 320) {
      // ROAR: everyone nearby freezes up for a moment
      z.special = t + 9; z.stun = t + 0.9;
      events.push({ k: "roar", x: z.x, y: z.y, rex: 1 });
      for (const q of alive) if (dist2(q, z) < 340 * 340) { q.frozen = t + 0.8; addStress(q, 12); q.pe.push({ k: "deaf" }); }
    }
    if (t < z.stun) sp = 0;
    if (t < z.frozen) { z.atk = Math.max(z.atk, z.frozen); }
    const ox = z.x, oy = z.y;
    z.x += (dx * sp + z.vx) * dt; z.y += (dy * sp + z.vy) * dt;
    z.vx *= Math.pow(0.03, dt); z.vy *= Math.pow(0.03, dt);
    const touchingHearth = game.mode !== "royale" && z.z < HEARTH.z1 && z.x + z.r > HEARTH.x - 4 && z.x - z.r < HEARTH.x + HEARTH.w + 4 && z.y + z.r > HEARTH.y - 4 && z.y - z.r < HEARTH.y + HEARTH.h + 4;
    // the dead climb: walls, roofs, towers. Not trees, not the Hearth, not your barricades (those they chew).
    const hit = MV.pushOut(z, z.r, near(z), BW(), BH(), z.z, zHeight(z));
    if (z.type !== "flyer" && (z.z || 0) > -8 && LAKE_SOLID.length) MV.pushOut(z, z.r, LAKE_SOLID, BW(), BH(), 0, 10); // the dead don't swim
    if ((z.z || 0) < -60 && z.type !== "boss") z.hp -= z.maxHp * 0.04 * dt; // ...but they do drown, slowly
    if ((z.type === "charger" || z.type === "boss" || z.type === "rex") && t < z.charge && hit && hit !== "edge") damageWall(hit, z.type === "charger" ? 90 : 220);
    if (z.type === "charger" && t < z.charge && hit && hit !== "edge") { z.charge = 0; z.stun = t + 1.6; events.push({ k: "boom", x: z.x, y: z.y, z: z.z, r: 40, dust: 1 }); }
    if (z.type === "flyer") {
      // flyers circle high, then dive on whoever they're after
      const hd = target ? Math.hypot(target.x - z.x, target.y - z.y) : Infinity;
      const floor = MV.floorAt(z.x, z.y, z.r, 2000, near(z)).h;
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
      MV.vertical(z, dt, near(z), z.r * 0.8, zHeight(z));
    }
    if (t > z.atk && builds.length && !(target && Math.sqrt(bd) < z.r + 20 && Math.abs(target.z - z.z) < 60)) {
      const piece = builds.find((b) => PIECES[b.bk].solid && rectHitsCircle(b, z, z.r + 6));
      if (piece) { hurtPiece(piece, def.dmg * (z.type === "boss" ? 3 : 1)); z.atk = t + 0.8; }
    }
    if (z.type === "rex" && hit && hit !== "edge") damageWall(hit, 350 * dt); // it walks through things
    if (z.type === "raptor" && t < z.pounce && !z.gr) for (const q of alive) if (dist2(q, z) < (z.r + 22) ** 2 && Math.abs(q.z - z.z) < 60) {
      hurtPlayer(q, 14, null, "eaten by a velociraptor"); q.frozen = t + 0.3; z.pounce = 0; z.atk = t + 0.8;
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
      z.special = t + 16;
      events.push({ k: "scream", x: Math.round(z.x), y: Math.round(z.y), z: Math.round(z.z) });
      for (const o of zombies) if (o !== z && dist2(o, z) < 700 * 700) { o.aggro = target.id; o.aggroUntil = t + 8; }
      if (zombies.length < 120) for (let i = 0; i < Math.ceil(players.size / 2); i++) spawnZombie("runner", z);
      for (const q of alive) if (dist2(q, z) < 380 * 380) { q.pe.push({ k: "deaf" }); addStress(q, 8); }
    }
    if (t > z.atk) {
      if (target && Math.sqrt(bd) < z.r + 20 && Math.abs(target.z - z.z) < 60) {
        if (z.glow) addRad(target, 5);
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

  if (mapDirty && tickN % 6 === 0) { mapDirty = false; broadcastRaw(JSON.stringify(mapMsg())); }
  if (tickN % SNAP_EVERY === 0) broadcast();
}

function snapshot() {
  const r = Math.round, t = now();
  const v = game.vote;
  return {
    t: "s",
    g: { pp: CROP_KEYS.map((id) => cropPrice(null, id)), disc: game.mods.discount, mode: game.mode, cd: game.countdown ? Math.max(0, +(game.countdown - t).toFixed(1)) : -1, prev: game.prev,
      intro: game.phase === "intro" ? { at: +(t - game.introT0).toFixed(2), len: INTRO_LEN[game.mode], skip: game.skip.size, cast: game.cast } : null,
      deeds: game.mode === "story" ? Object.fromEntries(Object.keys(LEGENDS).map((k) => [k, Math.round(game.deeds[k])])) : null, legend: game.legend, now: game.mode === "story" ? legendOf(game.deeds) : null,
      alive: [...players.values()].filter((p) => !p.out && !p.dead).length,
      zone: game.zone && (!OPEN() || game.phase === "night") ? [r(game.zone.cx), r(game.zone.cy), r(game.zone.r), r(game.zone.tcx), r(game.zone.tcy), r(game.zone.tr), game.zone.t0 > t ? r(game.zone.t0 - t) : -1] : null,
      drop: game.drop && t - game.drop.t0 < game.drop.dur + 3 ? [r(game.drop.x0), r(game.drop.y0), r(game.drop.x1), r(game.drop.y1), +dropPos(t).k.toFixed(3)] : null,
      clues: [...game.clues].map((c) => CLUES[c]),
      ph: game.phase, n: game.night, left: game.ends === Infinity ? -1 : Math.max(0, r(game.ends - t)), hh: r(game.hearth), hm: game.hearthMax, res: game.result, boss: game.bossId, bk: game.bossKind, valley: VALLEY, fog: game.fog ? 1 : 0, solved: solved() ? 1 : 0, dino: game.dino ? 1 : 0, dd: game.dinoDay ? 1 : 0,
      mk: SYMS.map((s) => +game.market.px[s].toFixed(2)), news: game.market.news.map((n) => [n.text, n.up ? 1 : 0]),
      mayor: game.mayor, nuke: game.nuke ? [r(game.nuke.x), r(game.nuke.y), Math.max(0, +(game.nuke.at - t).toFixed(1))] : null, dome: game.dome && game.mode !== "royale" ? [game.dome.have, game.dome.cost] : null, waste: game.waste ? 1 : 0, hot: game.hot.map((h) => [r(h.x), r(h.y), r(h.r), h.lake ? 1 : 0]),
      elec: game.elec ? { c: game.elec.cands, v: Object.fromEntries(game.elec.votes), left: Math.max(0, r(game.elec.ends - t)) } : null,
      dis: game.disaster ? { k: game.disaster.kind, w: +game.disaster.water.toFixed(1), x: r(game.disaster.x || 0), y: r(game.disaster.y || 0), m: game.disaster.meteors.map((m) => [r(m.x), r(m.y), +(m.at - t).toFixed(2)]), left: r(game.disaster.until - t), st: game.disaster.st ? [r(game.disaster.st.x), r(game.disaster.st.y), game.disaster.st.busy ? 1 : 0] : null } : null },
    vote: v ? { title: v.ev.title, text: v.ev.text, ch: v.ev.choices.map((c) => [c.label, c.desc]), votes: Object.fromEntries(v.votes), left: Math.max(0, r(v.ends - t)) } : null,
    story: game.story ? { title: game.story.title, pick: game.story.pick, text: game.story.text } : null,
    p: [...players.values()].map((p) => {
      const w = p.weapons[p.active];
      return {
        id: p.id, n: fullName(p), x: r(p.x), y: r(p.y), z: r(p.z), mv: [r(p.vx), r(p.vy), r(p.vz), p.gr ? 1 : 0], pt: p.pt == null ? 0 : +p.pt.toFixed(2), a: +p.a.toFixed(2), hp: r(p.hp), mh: maxHp(p), ar: r(p.armor),
        c: p.color, h: p.hat, ey: p.eyes, cl: p.cls, bg: p.bg, d: p.dead ? 1 : 0, g: p.gold, sd: seedCount(p), st: Math.min(5, Math.floor(p.heat / 40)),
        w: w.type, wn: wName(w), wr: w.rarity, we: w.enh, am: w.ammo, hot: w.hot ? 1 : 0, sec: p.weapons.length > 1 ? 1 : 0,
        rl: w.reloadUntil ? +(w.reloadUntil - t).toFixed(2) : 0, rt: w.reloadUntil ? +(w.reloadUntil - w.reloadStart).toFixed(2) : 0, rtr: w.tried ? 1 : 0,
        jam: w.jam ? 1 : 0, dirt: Math.round(w.dirt || 0), cln: p.cleaning ? 1 : 0,
        spr: +spreadOf(p, w).toFixed(3), sc: Math.max(0, +(p.shoutCd - t).toFixed(1)), sp: r(speedOf(p)), tr: p.trait, gen: p.gen,
        lv: p.lvl, xp: p.xp, xn: xpNeed(p.lvl), pts: p.pts, sk: p.sk, ch: p.champion ? 1 : 0,
        air: p.air === "plane" || p.air === "wait" ? 1 : p.air === "fall" ? 2 : p.air === "bunker" ? 3 : 0, gr: SLOTS.map((k) => (p.gear[k] ? p.gear[k].id : "")), fd: Math.round(p.food), wt: Math.round(p.water), rad: Math.round(p.rad), dr: p.drunk > 5 ? 1 : 0, cg: p.cg ? 1 : 0, rd: p.ready ? 1 : 0, vh: p.veh || 0, trl: p.trail, ttl: p.title ? COSMETICS[p.title].name : "", spn: p.spins, bl: r(p.bl), bw: r(p.bw), inf: p.inf ? p.inf.sym : "", il: p.inf ? r(p.inf.until - t) : 0, go: t < p.going ? p.goKind : "", ads: p.ads ? 1 : 0, cro: crouched(p) ? 1 : 0, out: p.out ? 1 : 0, pk: p.st.pk, ss: r(p.stress || 0), br: Math.ceil(p.breath ?? 15), sw: p.swim ? 1 : 0, lo: p.love, ro: [p.dating || "", p.spouse || ""], el: p.elem || "force", els: elemsFor(p).join(","), fz: p.frozen > t ? 1 : 0, dl: p.dlg ? 1 : 0, md: p.meltdown > t ? 1 : 0, hoe: p.hoe || 0, ho: p.hoeOut ? 1 : 0, gn: p.gren, mo: p.molo, bi: p.bile > t ? 1 : 0, sh: p.shame > t ? 1 : 0, fr: p.fireUntil > t ? 1 : 0,
        nt: [...p.talked], qr: questReady(p), q: Object.entries(p.q).map(([id, qs]) => [QUESTS[id].title, QUESTS[id].desc, Math.min(QUESTS[id].goal, npcApi.progress(p, id)), QUESTS[id].goal, qs.done ? 1 : 0, NPCS[QUESTS[id].npc].name]),
        k: p.st.kills, de: p.st.deaths, cr: p.st.crops, tk: p.st.tk, hs: p.st.hs, acc: p.st.shots ? Math.round(p.st.hits / p.st.shots * 100) : 0,
      };
    }),
    z: zombies.map((z) => [z.id, zCode(z), r(z.x), r(z.y), r((z.hp / z.maxHp) * 100), z.burn || z.fireUntil > t ? 1 : 0, r(z.z), z.wind > t || z.charge > t ? 1 : 0, z.frozen > t ? 1 : 0, z.glow ? 1 : 0]),
    ball: PITCH && (BALL.x || BALL.y) ? [r(BALL.x), r(BALL.y), r(BALL.z)] : null,
    pr: projs.map((q) => [q.id, q.kind, r(q.x), r(q.y), r(q.z)]),
    fi: [...fires.values()].map((f) => [f.cx, f.cy, r(f.z)]),
    pl: PLOTS.map((q) => q.stage + 4 * Math.max(0, CROP_KEYS.indexOf(q.crop || "turnip"))),
    ca: caches.map((c) => [c.id, r(c.x), r(c.y), c.busy ? 1 : 0]),
    np: NPC_POS.map((n) => [n.id, r(n.x), r(n.y), +(n.a || 0).toFixed(2)]),
    sh: game.shrine ? [...game.shrine.order, game.shrine.step, game.shrine.open ? 1 : 0] : null,
    cr: crates.map((c) => [c.id, r(c.x), r(c.y), c.w ? c.w.rarity : c.it.r || 0, c.grave ? 1 : 0, c.it ? (GEAR[c.it.id] ? 1 : 2) : 0]),
    vh: vehicles.map((v) => [v.id, v.kind, r(v.x), r(v.y), +v.a.toFixed(2), r((v.hp / VEHICLES[v.kind].hp) * 100), v.seats[0], v.seats[1], r(v.v), r(v.z || 0)]),
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
    if (p.invDirty || tickN % 30 === 0) { p.invDirty = false; p.pe.push(invMsg(p)); } // the bag, gear, needs and shares
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
      p.fly = Array.isArray(m.fly) && m.fly.length === 4 ? m.fly.map((x) => clamp(+x || 0, -1, 1)) : null;
      break;
    case "tp": if (TEST_TP) { // testing only
      if (typeof m.x === "number") { p.x = m.x; p.y = m.y; p.z = m.z || 0; p.vx = p.vy = p.vz = 0; }
      if (m.gold) p.gold = m.gold;
      if (m.love) p.love[m.love[0]] = m.love[1];
      if (m.breath !== undefined) p.breath = m.breath;
      if (m.food !== undefined) { p.food = m.food; p.water = m.water ?? m.food; p.invDirty = true; }
      if (m.rad !== undefined) p.rad = m.rad;
      if (m.nuke) nukeWarn("Test.");
      if (m.elect) openElection();
    } break;
    case "item": itemAct(p, m); break;
    case "trade": trade(p, String(m.sym), +m.n || 0); break;
    case "mkh": p.pe.push({ k: "mkh", hist: game.market.hist }); break;
    case "elect": if (game.elec && Number.isInteger(m.i) && m.i >= 0 && m.i < game.elec.cands.length) game.elec.votes.set(p.id, m.i); break;
    case "cg": cardAct(p, m); break;
    case "stall": stallAct(p, m); break;
    case "reload": pressReload(p, p.weapons[p.active]); break;
    case "clean": cleanWeapon(p, m); break;
    case "hack": finishHack(p, m); break;
    case "hoe": if (!p.hoe) toast(p, "You haven't got a hoe. Vex's store sells them.", "#bbb"); else { p.hoeOut = !p.hoeOut; toast(p, p.hoeOut ? `${HOES[p.hoe]} out. Click to till a plot. F or 1/2 puts it away.` : "Hoe away.", "#c8e0a0"); } break;
    case "swap": p.hoeOut = false; if (p.weapons.length > 1) { p.active = m.i === 0 || m.i === 1 ? Math.min(m.i, p.weapons.length - 1) : 1 - p.active; } break;
    case "use": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else if (!p.dead) interact(p); break;
    case "skip": if (game.phase === "intro") game.skip.add(p.id); break;
    case "ready": if (game.phase === "lobby" || game.phase === "over") { p.ready = m.v === undefined ? !p.ready : !!m.v; feed(`${fullName(p)} is ${p.ready ? "ready" : "not ready"}`, p.ready ? "#8f8" : "#aaa"); } break;
    case "build": if (["day", "night", "royale"].includes(game.phase) && !p.dead && !p.air && !p.veh) placePiece(p, String(m.kind), +m.x || 0, +m.y || 0, false); break;
    case "dlg": pickDlg(p, m.i | 0); break;
    case "mode": if (p.id === hostId() && game.phase !== "day" && game.phase !== "night" && game.phase !== "royale" && (m.m === "story" || m.m === "royale" || m.m === "endless")) { game.mode = m.m; broadcastRaw(JSON.stringify(mapMsg())); } break;
    case "shout": doShout(p); break;
    case "elem": cycleElement(p); break;
    case "go": relieve(p); break;
    case "throw": throwIt(p, m.k === "molo" ? "molo" : "gren"); break;
    case "dodge": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else doDodge(p); break;
    case "buy": buy(p, m.item); break;
    case "spin": doSpin(p); break;
    case "casino": casinoAct(p, m); break;
    case "equip": equip(p, String(m.slot), String(m.id)); break;
    case "learn": learn(p, String(m.s)); break;
    case "vote": if (game.vote && Number.isInteger(m.i) && m.i >= 0 && m.i < game.vote.ev.choices.length) game.vote.votes.set(p.id, m.i); break;
    case "bug": fileBug(p, m); break;
    case "fix": finishFix(p, m); break;
    case "chat": { const text = String(m.text || "").slice(0, 120).trim(); if (text) chat(fullName(p), text, p.color), events.push({ k: "say", id: p.id, text }); break; }
  }
}

// ---------------------------------------------------------------- bug reports
// Players press F8 (or the bug button) and write what went wrong. It's appended to bug-reports.txt next to the exe,
// with where they were and what the game was doing, so it can be uploaded as is.
const COMPILED = /^(B:[\\/]~BUN|\/\$bunfs)/i.test(Bun.main || "");
const HOME_DIR = COMPILED ? path.dirname(process.execPath) : process.cwd();
const BUG_FILE = path.join(HOME_DIR, "bug-reports.txt");
const BUILD = (() => { try { return fs.readFileSync(path.join(HOME_DIR, "version.txt"), "utf8").trim() || "dev"; } catch { return "dev"; } })();
function bugLog(text) {
  try { fs.appendFileSync(BUG_FILE, `==== ${new Date().toISOString()} · ${BUILD}\n${text}\n\n`); return true; } catch (err) { console.error("Couldn't write the bug report:", err.message); return false; }
}
function fileBug(p, m) {
  const t = now();
  if (t < (p.bugAt || 0)) return toast(p, "Easy. One report every few seconds.", "#bbb");
  p.bugAt = t + 5;
  const text = String(m.text || "").replace(/\r/g, "").slice(0, 2000).trim();
  if (!text) return toast(p, "Write something first.", "#bbb");
  const errs = Array.isArray(m.errors) ? m.errors.slice(-5).map((e) => "  " + String(e).slice(0, 400)).join("\n") : "";
  const w = p.weapons[p.active];
  const info = [
    `From: ${fullName(p)} (${CLASSES[p.cls].name}, level ${p.lvl})`,
    `Game: ${game.mode} · ${game.phase} · night ${game.night}${game.disaster ? ` · ${game.disaster.kind}` : ""}${game.dinoDay || game.dino ? " · dinosaurs" : ""} · ${players.size} player${players.size === 1 ? "" : "s"} · ${zombies.length} zombies`,
    `Where: x ${Math.round(p.x)}, y ${Math.round(p.y)}, z ${Math.round(p.z)}${p.dead ? " (dead)" : ""}${p.veh ? " (in a vehicle)" : ""}${p.dlg ? ` (talking to ${p.dlg.npc})` : ""} · hp ${Math.round(p.hp)} · ${w ? w.type : "?"} ${w ? w.ammo : ""} · ${p.gold}g`,
    `Browser: ${String(m.ua || "").slice(0, 160)}`,
  ].join("\n");
  const kind = m.kind === "Idea" ? "IDEA" : "BUG";
  const ok = bugLog(`[${kind}] ${info}\n\n${text}${errs ? `\n\nRecent browser errors:\n${errs}` : ""}`);
  toast(p, ok ? (kind === "IDEA" ? "Idea saved. Thanks!" : "Bug report saved. Thanks!") : "Couldn't save the report on the host's PC. Tell them in chat.", ok ? "#8f8" : "#f88");
  if (ok) console.log(`  Bug report from ${fullName(p)} saved to ${BUG_FILE}`);
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
      ws.send(JSON.stringify({ t: "hello", wheel: WHEEL, cosmetics: COSMETICS, freeHats: FREE_HATS, shop: SHOP, shops: SHOPS, domeR: DOME_R, enhCost: ENH_COST, enhChance: ENH_CHANCE, pieces: PIECES, vehicles: VEHICLES, legends: LEGENDS, items: ITEMS, crops: CROPS, seedPack: SEED_PACK, gear: GEAR, cards: CARDS, locs: LOCS, stocks: STOCKS, cands: CANDIDATES }));
      ws.send(JSON.stringify(mapMsg()));
      ws.send(JSON.stringify({ t: "ck", reset: 1, seed: MAP_SEED, walls: WALLS.filter((w) => w.ck) }));
    },
    message: onMessage,
    close(ws) {
      spectators.delete(ws);
      const p = players.get(ws.data.pid);
      if (p) { if (p.veh) exitVehicle(p); players.delete(p.id); feed(`${fullName(p)} left the valley`, "#aaa"); if (game.vote) game.vote.votes.delete(p.id); }
      if (players.size === 0 && game.phase !== "lobby") { game.phase = "lobby"; zombies = []; projs = []; caches = []; fires.clear(); crates = []; vehicles = []; builds = []; WALLS = WALLS.filter((w) => w.kind !== "built"); game.vote = null; game.zone = null; game.drop = null; game.pendingVote = null; }
    },
  },
});

// a crash in one tick shouldn't take the whole valley down: log it to the bug file and carry on
let tickErrs = 0, tickErrAt = 0;
setInterval(() => {
  try { tick(); } catch (err) {
    lastT = now(); console.error(err);
    if (now() - tickErrAt > 30) { tickErrs = 0; tickErrAt = now(); }
    if (tickErrs++ < 3) bugLog(`SERVER ERROR\n${err && err.stack || err}`);
  }
}, 1000 / TICK_RATE);

const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(`
  ==============================================
     SLOP VALLEY server running on port ${server.port}
  ==============================================
   You (host):      http://localhost:${server.port}
${lan.map((ip) => `   Same Wi-Fi/LAN:  http://${ip}:${server.port}`).join("\n")}
   Friends online:  http://<your public IP>:${server.port}
                    (forward TCP port ${server.port} on your router to this PC)
   Bug reports are saved to: ${BUG_FILE}
   Close this window to stop the server.
`);
fetch("https://api.ipify.org").then((r) => r.text()).then((ip) => {
  if (/^[\d.]+$/.test(ip)) console.log(`   Your public IP looks like ${ip}  ->  send friends http://${ip}:${server.port}\n`);
}).catch(() => {});
