// The valley's layout: the Hearth, plots, houses, shops, the lake, and the procedural map.
import { valleyName } from "../story.js";
import { ITEMS, bagCount, bagTake, CROPS, CROP_KEYS, SEED_PACK } from "../items.js";
import { STOCKS } from "../market.js";
import { SH, placeBig, finishTown } from "../town.js";
import { hurtPiece, rectHitsCircle } from "./building.js";
import { H, HEARTH, W, clamp, mulberry } from "./config.js";
import { CHUNKS } from "./geometry.js";
import { lootRarity } from "./phases.js";
import { game, lootType, newWeapon, price } from "./state.js";
import { broadcastRaw } from "./tick.js";
import { world } from "./world.js";

export const PLOTS = [];
for (const baseX of [1330, 1890]) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
  PLOTS.push({ x: baseX + c * 64 + 28, y: 1200 + r * 64 + 28, stage: 0, prog: 0, rate: 1, owner: 0 });
export const BASE_PLOTS = PLOTS.length;
// the produce stall, by the right-hand field: Old Giles buys what you grow and sells seeds, daytime only
const STALL = { x: 1950, y: 1440, w: 110, h: 40, kind: "stall", sid: "produce", z0: 0, z1: 34 };
// the shops: Vex's general store and Haddock's armoury sit just south of the Hearth (open by day), the casino is out in town (always open),
// and Club Slop is out on the edge of town (open at night). They're walk-in buildings now: the footprint is a non-solid marker (ns),
// town.js builds the walls, the counter (the "till") and the insides.
const STORE = { x: 1300, y: 1560, w: 250, h: 180, kind: "shop", ns: 1, sid: "general", door: "n", z0: 0, z1: SH };
const ARMOURY = { x: 1860, y: 1560, w: 280, h: 200, kind: "shop", ns: 1, sid: "armoury", door: "n", z0: 0, z1: SH };
export const SHOPS = {
  general: { name: "Vex's General Store", keeper: "Vex", hours: "day", shut: "Vex has shut up shop for the night. Back at dawn." },
  armoury: { name: "Haddock's Armoury", keeper: "Sergeant Haddock", hours: "day", shut: "The armoury's locked. Haddock is on night watch, not on the till." },
  casino:  { name: "The Golden Slop", keeper: "Lucky Lou", hours: "always" },
  club:    { name: "Club Slop", keeper: "Big Tony", hours: "night" },
  hearth:  { name: "The Hearth", hours: "always" },
};
let CASINO = null;
export const shopWall = (sid) => sid === "hearth" ? HEARTH : world.WALLS.find((w) => w.kind === "till" && w.sid === sid); // the counter you stand at
export const shopBld = (sid) => world.WALLS.find((w) => w.kind === "shop" && w.sid === sid); // the whole building
export let SHOP_SPOTS = {}; // where each keeper stands behind their counter (town.js)
export const shopIsOpen = (sid) => game.mode !== "royale" && (SHOPS[sid].hours !== "day" || game.phase !== "night");
export const inside = (b, e) => !!b && e.x > b.x && e.x < b.x + b.w && e.y > b.y && e.y < b.y + b.h && (e.z || 0) < (b.z1 || 100) - 20;
export const nearShop = (p, sid) => { const w = shopWall(sid); return (!!w && rectHitsCircle(w, p, sid === "hearth" ? 80 : 84)) || (sid === "casino" && inside(shopBld("casino"), p)); }; // anywhere on the casino floor counts
export let KEEPERS = [{ id: "giles", sid: "produce", name: "Old Giles", role: "Produce stall. Buys crops, sells seeds.", color: "#8a6a3a", hat: "flatcap", x: STALL.x + STALL.w / 2, y: STALL.y - 22, hours: "day" }];
export const stallOpen = (k) => k.hours !== "day" || game.phase !== "night";
export const nearStall = (p) => rectHitsCircle(STALL, p, 80);
// what a crop sells for right now: the farmers' co-op share price moves the whole market
export function cropPrice(p, id) {
  const fair = STOCKS.FARM.p, k = clamp(game.market.px.FARM / fair, 0.4, 1.5);
  return Math.max(1, Math.round(CROPS[id].sell * k * (p && p.cls === "farmer" ? 1.25 : 1) * (1 + 0.08 * ((p && p.hoe) || 0))));
}
export const seedPrice = (p, id) => price(p, CROPS[id].seed * SEED_PACK);
export const seedCount = (p) => p.bag.reduce((a, b) => a + (ITEMS[b.id] && ITEMS[b.id].kind === "seed" ? b.n : 0), 0);
export function takeSeed(p) { // the packet you picked in your bag, else the cheapest you have
  let id = p.seedSel && bagCount(p.bag, "s_" + p.seedSel) ? p.seedSel : null;
  if (!id) id = CROP_KEYS.filter((c) => bagCount(p.bag, "s_" + c)).sort((a, b) => CROPS[a].seed - CROPS[b].seed)[0];
  if (!id) return null;
  bagTake(p.bag, "s_" + id); p.invDirty = true;
  return id;
}
// the hoe: till new plots anywhere on open ground. Each upgrade lets you till more, grows faster and sells for more.
export const hoeLimit = (lvl) => 3 + 3 * lvl;
export const bunkerWall = () => world.WALLS.find((w) => w.kind === "bunker");
export const WALL_HP = { house: 1100, fence: 160, crate: 180, tree: 320, rock: 800, hwall: 1, furn: 60, glass: 1 };
export const WOODEN = new Set(["house", "fence", "crate", "tree", "hwall", "furn"]);
export let PITCH = null, LAKE = null, LAKE_SOLID = [], BOOSTS = []; world.wallId = 1; world.mapVer = 0; world.mapDirty = false;
const LAKE_D = 260; // how deep the lake is
export const inHouse = (p) => world.WALLS.some((w) => (w.kind === "house" || w.kind === "office" || w.kind === "hatch" || w.kind === "shop") && p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h);
export const BALL = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, last: 0, resetAt: 0 };
export function damageWall(w, dmg) {
  if (w.kind === "built") { const b = world.builds.find((q) => q === w); if (b) hurtPiece(b, dmg * 0.5); return; }
  if (w.kind === "hwall") { const h = world.WALLS.find((o) => o.id === w.hid); if (h) damageWall(h, dmg); return; } // a house's walls share its health
  if (!w.hp || w.hp <= 0) return;
  w.hp -= dmg;
  if (w.hp > 0) return;
  if (w.kind === "glass") { // windows shatter without resending the whole map: clients drop the pane themselves
    world.WALLS = world.WALLS.filter((o) => o !== w);
    world.events.push({ k: "glass", id: w.id, x: Math.round(w.x + w.w / 2), y: Math.round(w.y + w.h / 2), z: Math.round((w.z0 + w.z1) / 2) });
    return;
  }
  world.WALLS = world.WALLS.filter((o) => { const gone = o === w || (w.kind === "house" && o.hid === w.id); if (gone) wallsGone.push(o.id); return !gone; });
  world.events.push({ k: "collapse", x: Math.round(w.x + w.w / 2), y: Math.round(w.y + w.h / 2), w: Math.round(w.w), h: Math.round(w.h), z: w.z1 || 40, kind: w.kind });
  if (w.kind === "house") { const rubble = { id: world.wallId++, x: w.x + 10, y: w.y + 10, w: w.w - 20, h: w.h - 20, kind: "rubble", roof: w.roof, z0: 0, z1: 22 }; world.WALLS.push(rubble); wallsAdded.push(rubble); }
  if (w.kind === "crate" && Math.random() < 0.15) world.crates.push({ id: world.nextId++, x: w.x + w.w / 2, y: w.y + w.h / 2, w: newWeapon(lootType(), lootRarity(game.night)) });
  world.mapVer++; // clients hear about it in the next "wd" message, not a whole-map resend
}
// walls knocked down (and rubble left behind) since the last tick: sent as one small "wd" message
let wallsGone = [], wallsAdded = [];
export function sendWallChanges() {
  if (!wallsGone.length && !wallsAdded.length) return;
  broadcastRaw(JSON.stringify({ t: "wd", ver: world.mapVer, gone: wallsGone, add: wallsAdded }));
  wallsGone = []; wallsAdded = [];
}
// the distance from a point to a box, in 3D
export function boxDist(w, x, y, z) {
  const dx = Math.max(w.x - x, 0, x - (w.x + w.w)), dy = Math.max(w.y - y, 0, y - (w.y + w.h)), dz = Math.max((w.z0 || 0) - z, 0, z - (w.z1 ?? 60));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
// the town is the same every game (only the wild is procedural), so it's worth learning. The seed only names the valley and grows the wild.
const TOWN_SEED = 20261002;
export let TOWN_NAV = null; // doors, stairs and tunnels, for the dead (town.js)
export function generateMap(seed) {
  world.MAP_SEED = seed;
  const rng = mulberry(TOWN_SEED);
  const R = (a, b) => a + rng() * (b - a);
  world.VALLEY = valleyName(mulberry(seed));
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
  const shopAt = (x, y, w, h, sid) => ({ x, y, w, h, kind: "shop", ns: 1, sid, door: y + h / 2 < H / 2 ? "s" : "n", z0: 0, z1: SH }); // doors face the middle of town
  place(1, () => { const x = Math.round(R(200, W - 560)), y = Math.round(R(200, H - 460)); return Math.hypot(x + 180 - 1700, y + 120 - 1300) > 600 ? shopAt(x, y, 360, 240, "casino") : { x: 0, y: 0, w: W, h: H }; }, 90);
  if (!walls.some((w) => w.sid === "casino")) walls.push(shopAt(2300, 1650, 360, 240, "casino"));
  // the night club: out on the edge of town, so a night out means leaving the Hearth
  place(1, () => { const x = Math.round(R(140, W - 440)), y = Math.round(R(140, H - 360)); return Math.hypot(x + 150 - 1700, y + 110 - 1300) > 850 ? shopAt(x, y, 300, 220, "club") : { x: 0, y: 0, w: W, h: H }; }, 100);
  if (!walls.some((w) => w.sid === "club")) walls.push(shopAt(300, 300, 300, 220, "club"));
  // keep the ground in front of each shop door clear while the rest of town goes down (taken away again before the town is finished)
  const apron = () => { for (const s of walls.filter((w) => w.kind === "shop" && !w.apron)) { s.apron = 1; walls.push({ x: s.x + s.w / 2 - 120, y: s.door === "n" ? s.y - 190 : s.y + s.h, w: 240, h: 190, kind: "apron", ns: 1, z0: 0, z1: 1 }); } };
  apron();
  // the big buildings: office blocks, two-storey houses with cellars, and shelters down into the tunnels (town.js)
  const big = placeBig({ walls, R, rng, overlaps, W, H });
  apron();
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
  // speed boosters on the two main roads: out from the Hearth near the middle, back in towards it further out
  for (const [d, out] of [[450, 1], [1000, 0]]) for (const [dx, dy] of [[0, -1], [0, 1]]) group([{ x: W / 2 - 30 + dx * d, y: H / 2 - 30 + dy * d, w: 60, h: 60, kind: "boost", a: Math.atan2(out ? dy : -dy, out ? dx : -dx), z0: 0, z1: 2 }], 6);
  for (const [d, out] of [[650, 1], [1300, 0]]) for (const [dx, dy] of [[-1, 0], [1, 0]]) group([{ x: W / 2 - 30 + dx * d, y: H / 2 - 30 + dy * d, w: 60, h: 60, kind: "boost", a: Math.atan2(out ? dy : -dy, out ? dx : -dx), z0: 0, z1: 2 }], 6);
  for (let i = 0, tries = 0; i < 3 + ((rng() * 3) | 0) && tries < 400; tries++) { // pairs of towers with a catwalk between them
    const top = Math.round(R(170, 230)), tw = 76, gap = Math.round(R(220, 420)), horiz = rng() < 0.5;
    const ax = R(100, W - 700), ay = R(100, H - 600);
    const a = { x: ax, y: ay, w: tw, h: tw, kind: "tower", z0: 0, z1: top };
    const b = horiz ? { ...a, x: ax + tw + gap } : { ...a, y: ay + tw + gap };
    const br = horiz ? { x: ax + tw, y: ay + tw / 2 - 22, w: gap, h: 44, kind: "bridge", z0: top - 14, z1: top } : { x: ax + tw / 2 - 22, y: ay + tw, w: 44, h: gap, kind: "bridge", z0: top - 14, z1: top };
    const st = stairs(a.x, a.y, tw, tw, top, horiz ? 1 : 3);
    if (group([a, b, br, ...st], 60)) i++;
  }
  place(12 + ((rng() * 5) | 0), () => ({ x: R(80, W - 320), y: R(80, H - 260), w: R(170, 280), h: R(120, 180), kind: "house", roof: (rng() * 4) | 0, z0: 0, z1: Math.round(R(96, 136)) }), 90);
  // some houses get an outside staircase to the roof
  for (const h of walls.filter((w) => w.kind === "house" && !w.fl)) {
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
  for (const h of walls.filter((w) => w.kind === "house" && !w.fl)) {
    const T = 10, dw = 48, cx = h.x + h.w / 2, top = h.z1 - 10, north = h.st === 2; // the door goes on the side without stairs
    h.z0 = top; h.door = north ? "n" : "s";
    const wall = (x, y, w, hh, z0 = 0, z1 = top) => walls.push({ x, y, w, h: hh, kind: "hwall", house: h, roof: h.roof, z0, z1 });
    const front = (y) => { wall(h.x, y, (h.w - dw) / 2, T); wall(cx + dw / 2, y, (h.w - dw) / 2, T); wall(cx - dw / 2, y, dw, T, 66, top); };
    if (north) { front(h.y); wall(h.x, h.y + h.h - T, h.w, T); } else { wall(h.x, h.y, h.w, T); front(h.y + h.h - T); }
    wall(h.x, h.y + T, T, h.h - 2 * T); wall(h.x + h.w - T, h.y + T, T, h.h - 2 * T);
    // the inside of a cottage: a bed, a table, a sofa by the wall, a kitchen counter and a dresser
    const back = north ? h.y + h.h - T : h.y + T, bk = north ? -1 : 1;
    const fn = (f, x, y, w2, h2, z1) => walls.push({ x, y, w: w2, h: h2, kind: "furn", f, house: h, z0: 0, z1 });
    fn("bed", h.x + T + 6, north ? h.y + h.h - T - 84 : h.y + T + 4, 52, 80, 18);
    fn("table", h.x + h.w - T - 58, h.y + h.h / 2 - 18, 48, 36, 28);
    fn("counter", h.x + T + 6, back + (bk > 0 ? 4 : -48), 60, 44, 32);
    if (h.w > 210) fn("sofa", h.x + h.w / 2 - 15, north ? h.y + T + 6 : h.y + h.h - T - 72, 30, 66, 24);
    if (h.h > 150) fn("shelf", h.x + h.w - T - 24, h.y + h.h / 2 + 30, 22, 60, 60);
  }
  for (let i = walls.length - 1; i >= 0; i--) if (walls[i].kind === "apron") walls.splice(i, 1); else if (walls[i].kind === "shop") delete walls[i].apron;
  big.shops = walls.filter((w) => w.kind === "shop");
  const town = finishTown(big, { walls, W, H, lake: LAKE }); // their insides, the shops, the tunnels, and the waypoints
  TOWN_NAV = town.nav; SHOP_SPOTS = town.spots;
  // most things can be blown up (or burnt down)
  walls.forEach((w, i) => { w.id = i + 1; const hp = WALL_HP[w.kind]; if (hp && !w.shop) w.hp = w.maxHp = hp; }); // shop fittings are bolted down
  for (const w of walls) { if (w.house) { w.hid = w.house.id; delete w.house; } if (w.bld) { w.bid = w.bld.id; delete w.bld; } }
  world.wallId = walls.length + 1;
  world.WALLS = walls; world.mapVer++; CHUNKS.clear(); BOOSTS = walls.filter((w) => w.kind === "boost");
  CASINO = walls.find((w) => w.sid === "casino");
  KEEPERS = [KEEPERS[0], { id: "lou", sid: "casino", name: "Lucky Lou", role: "The cashier. Cases and spins. The tables and slots are yours to walk up to.", color: "#c03050", hat: "tophat", x: SHOP_SPOTS.casino.x, y: SHOP_SPOTS.casino.y, fa: SHOP_SPOTS.casino.fa, hours: "always" },
    { id: "tony", sid: "club", name: "Big Tony", role: "Club Slop's bouncer. Nobody wanted gets in.", color: "#2a2a30", hat: "hood", x: SHOP_SPOTS.bouncer.x, y: SHOP_SPOTS.bouncer.y, fa: SHOP_SPOTS.bouncer.fa, hours: "night" },
    { id: "lola", sid: "club", name: "Lola", role: "Behind the bar. Drinks are 15g.", color: "#e04080", hat: "flower", x: SHOP_SPOTS.club.x, y: SHOP_SPOTS.club.y, fa: 0, hours: "night" },
    { id: "dee", sid: "club", name: "DJ Dee", role: "Spinning till dawn.", color: "#c040ff", hat: "party", x: SHOP_SPOTS.dj.x, y: SHOP_SPOTS.dj.y, fa: SHOP_SPOTS.dj.fa, hours: "night" }];
}
