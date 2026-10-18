// Collision and line-of-sight against the map, the wild's chunks, and where the townsfolk stand.
import { NPCS } from "../npcs.js";
import { advFolk } from "./adventure.js";
import { H, HEARTH, W, dist2, now, rand } from "./config.js";
import { KEEPERS, PITCH, PLOTS, SHOP_SPOTS, shopBld } from "./map.js";
import { freeSpot, game, players } from "./state.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- geometry
// Story and Endless are played in an endless world: the town, and the wild past its hedge. Royale keeps its fence.
world.gameReady = false; // the map is built before `game` exists
export const OPEN = () => !world.gameReady || game.mode !== "royale";
export const BW = () => (OPEN() ? Infinity : W), BH = () => (OPEN() ? Infinity : H);
export const TOWN = { x: 0, y: 0, w: W, h: H };
export const inTownXY = (x, y, pad = 0) => x > -pad && y > -pad && x < W + pad && y < H + pad;
// a coarse grid over the walls, so nothing has to check every tree in the wild
const GC = 500, GPAD = 160;
let gridSrc = null, gridLen = -1, gridVer = -1, WGRID = new Map();
function gridFor() {
  if (gridSrc === world.WALLS && gridLen === world.WALLS.length && gridVer === world.mapVer) return WGRID;
  WGRID = new Map(); gridSrc = world.WALLS; gridLen = world.WALLS.length; gridVer = world.mapVer;
  for (const w of world.WALLS) {
    const i0 = Math.floor((w.x - GPAD) / GC), i1 = Math.floor((w.x + w.w + GPAD) / GC), j0 = Math.floor((w.y - GPAD) / GC), j1 = Math.floor((w.y + w.h + GPAD) / GC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 100003 + j; let c = WGRID.get(k); if (!c) WGRID.set(k, (c = [])); c.push(w); }
  }
  return WGRID;
}
const EMPTY = [];
export function nearXY(x, y) { return gridFor().get(Math.floor(x / GC) * 100003 + Math.floor(y / GC)) || EMPTY; }
export const near = (e) => nearXY(e.x, e.y);
export function wallsAlong(x, y, dx, dy, len) { // every wall in the cells a ray passes through
  const g = gridFor(), seen = new Set(), out = [];
  const n = Math.ceil(len / (GC / 2)) + 1;
  for (let i = 0; i <= n; i++) { const t = Math.min(len, i * GC / 2), c = g.get(Math.floor((x + dx * t) / GC) * 100003 + Math.floor((y + dy * t) / GC)); if (c) for (const w of c) if (!seen.has(w)) { seen.add(w); out.push(w); } }
  return out;
}
export const CHUNKS = new Map(); // "cx,cy" -> { kind }
world.NPC_POS = [];
export function placeNpcs() {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  const viaShop = (sid) => { const b = shopBld(sid); return b && b.din ? [b.din, b.dout] : []; }; // the way out of the shop, so they don't walk through the walls
  world.NPC_POS = [{ id: "grubb", x: hc.x - 40, y: HEARTH.y - 40 }, { id: "haddock", ...SHOP_SPOTS.armoury, via: viaShop("armoury") }, { id: "vex", ...SHOP_SPOTS.general, via: viaShop("general") }]; // shopkeepers stand behind their counters
  for (const id of ["aldous", "pell", "morwen"]) {
    let best = null;
    for (let i = 0; i < 60; i++) {
      const sp = freeSpot(26);
      const d = Math.hypot(sp.x - hc.x, sp.y - hc.y);
      const want = id === "morwen" ? d > 800 : d > 350 && d < 750;
      if (want && !world.NPC_POS.some((n) => Math.hypot(n.x - sp.x, n.y - sp.y) < 200)) { best = sp; break; }
      if (!best) best = sp;
    }
    world.NPC_POS.push({ id, ...best });
  }
  // everyone gets a house to run home to at night
  const houses = world.WALLS.filter((w) => w.kind === "house"), hc2 = (h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });
  for (const n of world.NPC_POS) {
    n.hx = n.x; n.hy = n.y; n.a = Math.PI / 2; n.path = []; n.atHome = false;
    const h = houses.filter((q) => !world.NPC_POS.some((o) => o.home === q.id)).sort((a, b) => dist2(hc2(a), n) - dist2(hc2(b), n))[0];
    n.home = h ? h.id : 0;
  }
}
function houseDoor(h) {
  const cx = h.x + h.w / 2, south = h.door !== "n";
  return { out: { x: cx, y: south ? h.y + h.h + 36 : h.y - 36 }, inn: { x: cx, y: south ? h.y + h.h - 34 : h.y + 34 }, mid: { x: cx, y: h.y + h.h / 2 + (south ? -6 : 6) } };
}
// night: the townsfolk run home and shut the door. Morning: back out to their usual spots.
export function npcRoute(n, home) {
  const h = n.home && world.WALLS.find((w) => w.id === n.home && w.kind === "house");
  n.wait = now() + rand(0, 3);
  const via = n.via || [];
  if (!h) { n.path = [...[...via].reverse(), { x: n.hx, y: n.hy }]; n.atHome = false; return; }
  const d = houseDoor(h), south = h.door !== "n", spot = { x: n.hx, y: n.hy };
  const behind = south ? spot.y < h.y + h.h / 2 : spot.y > h.y + h.h / 2; // go round the house, not through it
  const corner = { x: spot.x < h.x + h.w / 2 ? h.x - 40 : h.x + h.w + 40, y: d.out.y };
  const outside = behind ? [corner, d.out] : [d.out];
  if (home && !n.atHome) n.path = [...via, ...outside, d.inn, d.mid];
  else if (!home && n.atHome) n.path = [d.inn, ...outside.reverse(), ...[...via].reverse(), spot];
  else n.path = home ? [] : [spot];
  n.atHome = home;
}
export function npcTick(t, dt) {
  for (const n of world.NPC_POS) {
    if (!n.path || !n.path.length || t < (n.wait || 0)) continue;
    if ([...players.values()].some((p) => p.dlg && p.dlg.npc === n.id)) continue; // politely waits while you're talking
    const g = n.path[0], dx = g.x - n.x, dy = g.y - n.y, d = Math.hypot(dx, dy), sp = (game.phase === "night" ? 160 : 85) * dt;
    if (d > 0.5) n.a = Math.atan2(dy, dx);
    if (d <= sp) { n.x = g.x; n.y = g.y; n.path.shift(); if (!n.path.length && n.atHome) n.a = Math.PI / 2; }
    else { n.x += dx / d * sp; n.y += dy / d * sp; }
  }
}
function npcList() { if (game.mode === "adventure") return advFolk(); return game.mode !== "story" ? [] : world.NPC_POS.map((n) => ({ ...n, name: NPCS[n.id].name, role: NPCS[n.id].role, color: NPCS[n.id].color, hat: NPCS[n.id].hat, guest: NPCS[n.id].guest ? 1 : 0, quips: NPCS[n.id].quips || null, ride: NPCS[n.id].ride || null })); }
export const WELL = { x: 1775, y: 1145 };
export function mapMsg() { return { t: "map", map: { W, H, ver: world.mapVer, walls: world.WALLS.filter((w) => w.kind !== "built" && !w.ck), hearth: HEARTH, well: WELL, pitch: PITCH, plots: PLOTS.map((p) => ({ x: p.x, y: p.y })), seed: world.MAP_SEED, valley: world.VALLEY, npcs: npcList(), keepers: game.mode === "royale" ? [] : KEEPERS } }; }
