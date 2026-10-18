// Battle royale: the zone, the drop balloon, and how a round plays out.
import { CLASSES } from "../data.js";
import { DROP_LEN, H, W, clamp, now, rand } from "./config.js";
import { resetOffices, spawnCaches } from "./hacking.js";
import { PLOTS } from "./map.js";
import { lootRarity } from "./phases.js";
import { freeSpot, freshMods, fullName, game, lootType, newWeapon, players, resetLoadout, resetProgress } from "./state.js";
import { spawnVehicles } from "./vehicles.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- zone & drop (battle royale bits)
export function zoneInit(cx, cy, r, stages) {
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
export function zoneShrinkTo(r, secs) {
  const z = game.zone, t = now(); if (!z) return;
  z.fcx = z.cx; z.fcy = z.cy; z.fr = z.r; z.tcx = z.cx; z.tcy = z.cy; z.tr = r; z.t0 = t; z.t1 = t + secs;
}
export function zoneTick(t) {
  const z = game.zone; if (!z) return;
  if (t >= z.t0 && z.t1 > z.t0) {
    const k = clamp((t - z.t0) / (z.t1 - z.t0), 0, 1);
    z.cx = z.fcx + (z.tcx - z.fcx) * k; z.cy = z.fcy + (z.tcy - z.fcy) * k; z.r = z.fr + (z.tr - z.fr) * k;
    if (k >= 1 && z.stages.length) { z.dmg = Math.min(20, z.dmg * 1.7); zoneNext(t); }
  }
}
export function outsideZone(e) { const z = game.zone; return z && (e.x - z.cx) ** 2 + (e.y - z.cy) ** 2 > z.r * z.r; }
export function startDrop(through) {
  let a = rand(0, Math.PI * 2);
  const cx = through ? through.x : rand(700, W - 700), cy = through ? through.y : rand(500, H - 500);
  const L = 2600;
  game.drop = { x0: cx - Math.cos(a) * L, y0: cy - Math.sin(a) * L, x1: cx + Math.cos(a) * L, y1: cy + Math.sin(a) * L, t0: now(), dur: DROP_LEN };
  for (const p of players.values()) if (!p.dead) { p.air = "plane"; p.dlg = null; }
}
export function dropPos(t) {
  const d = game.drop, k = clamp((t - d.t0) / d.dur, 0, 1);
  return { x: d.x0 + (d.x1 - d.x0) * k, y: d.y0 + (d.y1 - d.y0) * k, k };
}
export function jump(p) {
  if (p.air !== "plane") return;
  const t = now(), pos = dropPos(t);
  p.x = clamp(pos.x, 40, W - 40); p.y = clamp(pos.y, 40, H - 40);
  p.air = "fall"; p.pod = false; p.fallEnd = t + 2.2; p.fallDur = 2.2;
}
// ---------------------------------------------------------------- royale
export function setupRoyale() {
  game.night = 0; game.ends = Infinity; game.result = null; game.ending = null; game.cutscene = null;
  game.flags = { valley: world.VALLEY }; game.mods = freshMods(); game.vote = null; game.story = null; game.bossId = 0;
  game.hearthMax = game.hearth = 1e9;
  game.mayor = null; game.uav = 0; game.elec = null; game.nuke = null; game.waste = false; game.hot = []; game.fog = false; game.royaleN = players.size; // nothing carries over from a story game (fallout, a ticking nuke)
  world.zombies = []; world.crates = []; world.caches = []; resetOffices();
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) { resetProgress(p); resetLoadout(p, true); p.weapons = [newWeapon("pistol")]; p.active = 0; p.gold = 0; }
  const n = 30 + 6 * players.size;
  for (let i = 0; i < n; i++) world.crates.push({ id: world.nextId++, ...freeSpot(), w: newWeapon(lootType(), lootRarity(2)) });
  spawnCaches(4);
  for (let i = 0; i < 18; i++) world.crates.push({ id: world.nextId++, ...freeSpot(), w: newWeapon("pistol", lootRarity(1)) });
  spawnVehicles(["tractor", "buggy", "buggy", "heli", ...Array(Math.floor(players.size / 2)).fill("buggy")]);
}
export function endRoyale() {
  game.phase = "over"; game.result = "royale"; game.elec = null; game.nuke = null;
  for (const z of world.zombies) z.burn = true;
  const winner = [...players.values()].find((p) => !p.out);
  if (winner) winner.place = 1;
  game.prev = winner ? `Last time, ${fullName(winner)} won the Royale in ${world.VALLEY}.` : `Last time, nobody survived the Royale in ${world.VALLEY}.`;
  for (const p of players.values()) p.ready = false;
  game.ending = [winner ? `${fullName(winner)} is the last farmer standing in ${world.VALLEY}.` : `Nobody survived ${world.VALLEY}. The fog wins.`];
  const rows = [...players.values()].map((p) => {
    const s = p.st, acc = s.shots ? s.hits / s.shots : 0, n = players.size;
    const r = clamp(10 - (p.place - 1) * (6 / Math.max(1, n - 1)) + s.pk * 0.3 + (acc - 0.35), 3, 10);
    return { name: fullName(p), cls: CLASSES[p.cls].name, color: p.color, ...s, place: p.place || n, acc: Math.round(acc * 100), lvl: p.lvl, dmg: Math.round(s.dmg), rating: Math.round(r * 10) / 10, lineage: [fullName(p)], winner: p === winner, id: p.id };
  }).sort((a, b) => a.place - b.place);
  game.stats = rows;
  world.events.push({ k: "over" });
}
