// Bug Night: holes, bugs and the Brain Bug.
import { ITEMS } from "../items.js";
import { shock } from "../market.js";
import { MECH_PARTS, BUG_HOLE_HP, BUG_HOLE_R, BRAIN_REWARD, rollPart, mechStats } from "../bugs.js";
import { hurtPiece, rectHitsCircle } from "./building.js";
import { hurtPlayer, insideWall } from "./combat.js";
import { H, HEARTH, MV, NIGHT_LEN, W, clamp, dist2, now, rand } from "./config.js";
import { near } from "./geometry.js";
import { LAKE, PLOTS, inHouse } from "./map.js";
import { addStress } from "./needs.js";
import { spawnZombie } from "./phases.js";
import { VEHICLES, addGold, addXp, collide, feed, freeGround, fullName, game, players, toast } from "./state.js";
import { hurtVehicle } from "./vehicles.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

// ---------------------------------------------------------------- Bug Night and mech suits (the data is in bugs.js)
// Bug Night: story night 3, Endless night 3 and every 6th after, and any night Comrade Posad's saucers feel like it.
// Holes open around the town and bugs pour out of them. Explosions seal a hole. The Brain Bug crawls out of its hive
// halfway through the night (or once most holes are shut), and killing it kills every bug in the valley.
// Mechs: parts drop from big things and sealed holes, go in your bag, and bolt on when you use them. P calls it down.
const BUG_FORCE = !!process.env.SLOP_BUGS; // testing only: every night is Bug Night
for (const [id, m] of Object.entries(MECH_PARTS)) ITEMS["mp_" + id] = { name: m.name, kind: "mech", icon: m.icon, desc: `Mech part (${m.slot}). ${m.desc} Use it to bolt it on.` };
const hearthC = () => ({ x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
export function isBugNight(n) {
  if (!rules().waves) return false;
  if (BUG_FORCE || game.forceBugs) { game.forceBugs = false; return true; }
  if (rules().bugNight(n)) return true;
  return game.mayor === "posad" && n >= 2 && Math.random() < 0.3; // the saucers bring them
}
function bugSpot(minD, maxD, avoid) {
  const hc = hearthC();
  for (let i = 0; i < 300; i++) {
    const a = rand(0, Math.PI * 2), d = rand(minD, maxD), c = { x: hc.x + Math.cos(a) * d, y: hc.y + Math.sin(a) * d * 0.8 };
    if (c.x < 120 || c.y < 120 || c.x > W - 120 || c.y > H - 120) continue;
    const q = { ...c }; collide(q, 50);
    if (q.x !== c.x || q.y !== c.y || !freeGround(c) || inHouse(c) || PLOTS.some((pl) => dist2(pl, c) < 80 * 80)) continue;
    if (avoid.some((h) => dist2(h, c) < 380 * 380) || (LAKE && MV.lakeAt([LAKE], c.x, c.y))) continue;
    return c;
  }
  return null;
}
export function startBugNight() {
  const np = Math.max(1, players.size), holes = [];
  for (let i = 0; i < Math.min(7, 3 + np); i++) { const c = bugSpot(600, 1150, holes); if (c) holes.push({ id: world.nextId++, x: c.x, y: c.y, hp: BUG_HOLE_HP, next: now() + rand(1, 4) }); }
  game.bugs = { holes, sealed: 0, total: holes.length, brain: 0, brainAt: now() + NIGHT_LEN * 0.5, dead: false };
  game.spawnLeft = 0; game.fog = false;
  world.events.push({ k: "banner", text: `NIGHT ${game.night}: BUG NIGHT`, sub: "Holes are opening all over the valley. Seal them with explosions: grenades, rockets, or a mech landing on top. Kill the Brain Bug and they all die." });
  world.events.push({ k: "bugs" });
  shock(game.market, "BOOM", 0.08, "Bug sightings in the valley. Arms makers soar.");
  // Haddock's mate in the Federation: anyone without a mech that walks gets the basic kit bolted on
  for (const p of players.values()) {
    const m = p.mech;
    if (mechStats(m).ready) continue;
    if (!m.core) m.core = "reactor";
    if (!m.legs) m.legs = "strider";
    if (!m.armR && !m.armL) m.armR = "cannon";
    p.invDirty = true;
    toast(p, "A Federation drop pod: Haddock's mates sent you a mech. Press P to call it down. More parts drop from big bugs and sealed holes.", "#7fdcff");
  }
}
function spawnBug(type, at) {
  const z = spawnZombie(type, at);
  z.bug = true; z.arson = false;
  if (type === "tanker") z.armHp = z.maxHp * 0.4; // a carapace you have to crack first
  return z;
}
export function bugTick(t) {
  const B = game.bugs;
  if (!B || game.phase !== "night" || B.dead) return;
  const np = Math.max(1, players.size), cap = Math.min(60, 14 + 8 * np);
  let live = 0; for (const z of world.zombies) if (z.bug) live++;
  for (const h of B.holes) {
    if (t < h.next) continue;
    h.next = t + rand(6, 9) * (h.hive ? 0.8 : 1);
    if (live >= cap) continue;
    const r = Math.random();
    if (r < 0.2) { spawnBug("spitter", h); live++; }
    else if (r < 0.27 && game.night >= 5) { spawnBug("tanker", h); live++; }
    else for (let i = 0; i < 1 + Math.ceil(np * 0.6); i++) { spawnBug("bug", h); live++; }
    world.events.push({ k: "bughole", x: Math.round(h.x), y: Math.round(h.y) });
  }
  if (!B.brain && (t > B.brainAt || B.sealed >= Math.ceil(B.total * 0.6))) brainEmerges();
}
export function brainEmerges() {
  const B = game.bugs, n = Math.max(1, players.size);
  const c = bugSpot(700, 1150, B.holes) || bugSpot(500, 1300, []) || { x: W * 0.2, y: H * 0.25 };
  const hive = { id: world.nextId++, x: c.x, y: c.y, hp: BUG_HOLE_HP, next: now() + 2, hive: true };
  B.holes.push(hive);
  const b = spawnBug("brain", hive);
  b.x = hive.x; b.y = hive.y; b.hp = b.maxHp = Math.round(b.maxHp * (0.5 + 0.5 * n)); b.special = now() + 5;
  B.brain = b.id;
  world.events.push({ k: "banner", text: "THE BRAIN BUG", sub: "It's out of its hive (the purple skull on your map). Kill it and every bug in the valley dies with it. Try not to think about it too hard." });
  world.events.push({ k: "roar", x: Math.round(b.x), y: Math.round(b.y), psy: 1 });
}
export function bugsBeaten(by) {
  const B = game.bugs;
  if (!B || B.dead) return;
  B.dead = true;
  for (const z of world.zombies) if (z.bug && z.hp > 0) z.burn = true; // they shrivel up where they stand
  for (const h of B.holes) world.events.push({ k: "boom", x: Math.round(h.x), y: Math.round(h.y), r: 80, dust: 1 });
  B.holes = [];
  for (const q of players.values()) { addGold(q, BRAIN_REWARD, "The Brain Bug is dead"); addXp(q, 120); }
  for (const q of players.values()) dropPart(q);
  shock(game.market, "*", 0.06, "The Brain Bug is dead. Markets rally.");
  world.events.push({ k: "banner", text: "BUG HUNT COMPLETE", sub: `${by ? fullName(by) : "Somebody"} killed the Brain Bug and every bug in the valley dropped dead. ${BRAIN_REWARD}g and a mech part each.` });
  feed(`${by ? fullName(by) : "Somebody"} killed the Brain Bug`, "#c080ff");
  if (game.phase === "night" && game.ends !== Infinity) game.ends = Math.min(game.ends, now() + 12); // and the sun comes up early
}
// explosions seal holes: grenades, rockets, a jump-jet landing. Bullets don't.
export function bugBlast(x, y, r, dmg, by) {
  const B = game.bugs;
  if (!B) return;
  for (const h of [...B.holes]) {
    if (h.hive) continue;
    const d = Math.max(0, Math.hypot(h.x - x, h.y - y) - BUG_HOLE_R);
    if (d >= r) continue;
    h.hp -= dmg * (1 - (d / r) * 0.6);
    if (h.hp <= 0) sealHole(h, by);
  }
}
export function sealHole(h, by) {
  const B = game.bugs;
  B.holes = B.holes.filter((q) => q !== h); B.sealed++;
  world.events.push({ k: "boom", x: Math.round(h.x), y: Math.round(h.y), r: 90, dust: 1 });
  world.events.push({ k: "sealed", x: Math.round(h.x), y: Math.round(h.y) });
  if (by) { addGold(by, 60, "Bug hole sealed"); addXp(by, 30); }
  feed(`${by ? fullName(by) : "Someone"} sealed a bug hole (${B.sealed}/${B.total})`, "#c0ff80");
  if (Math.random() < 0.4) dropPart(h);
}
export function dropPart(at, id = rollPart()) {
  const c = { x: at.x + rand(-30, 30), y: at.y + rand(-30, 30) }; collide(c, 20);
  world.crates.push({ id: world.nextId++, ...c, it: { id: "mp_" + id, n: 1, r: 3 } });
  world.events.push({ k: "part", x: Math.round(c.x), y: Math.round(c.y) });
}
// what the bugs do besides biting. 1 = stand still, -1 = back off, 0 = carry on.
export function bugAct(z, target, bd, t, alive, hc) {
  if (z.type === "spitter") { // plasma artillery: plants itself and lobs at you, or at the Hearth if nobody's about
    const aim = target || (Math.hypot(hc.x - z.x, hc.y - z.y) < 560 ? { x: hc.x, y: hc.y, z: 40, hearth: 1 } : null);
    const d = aim ? Math.hypot(aim.x - z.x, aim.y - z.y) : Infinity;
    if (aim && d < 560 && t > z.special && !(t < z.stun)) { z.special = t + rand(3.2, 4.5); lobPlasma(z, aim); }
    if (target && d < 220) return -1;
    return aim && d < 520 ? 1 : 0;
  }
  if (z.type === "tanker" && target && bd < 180 * 180 && t > z.special && Math.abs(target.z - z.z) < 90) { // acid spray in a cone
    z.special = t + 3.2; z.stun = t + 0.7;
    const a = Math.atan2(target.y - z.y, target.x - z.x);
    world.events.push({ k: "acid", x: Math.round(z.x), y: Math.round(z.y), z: Math.round(z.z || 0), a: +a.toFixed(2) });
    const inCone = (e, r) => { const d = Math.hypot(e.x - z.x, e.y - z.y) - r; let da = Math.atan2(e.y - z.y, e.x - z.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da)); return d < 200 && Math.abs(da) < 0.55; };
    for (const q of alive) if (!q.veh && inCone(q, 16) && Math.abs(q.z - z.z) < 90) hurtPlayer(q, 24, null, "dissolved by a tanker bug"); // riders: the vehicle takes it
    for (const v of world.vehicles) if (inCone(v, VEHICLES[v.kind].r) && (v.z || 0) < 80) hurtVehicle(v, 70, null);
    return 1;
  }
  if (z.type === "brain") { // sits by its hive, reads your mind, and calls its guards
    if (t > z.special) {
      z.special = t + 7;
      world.events.push({ k: "roar", x: Math.round(z.x), y: Math.round(z.y), psy: 1 });
      for (const q of alive) if (dist2(q, z) < 650 * 650) { q.frozen = t + 0.6; addStress(q, 12); q.pe.push({ k: "deaf" }); q.pe.push({ k: "psy" }); }
      let live = 0; for (const o of world.zombies) if (o.bug) live++;
      if (live < 24 + 8 * players.size) for (let i = 0; i < 2 + players.size; i++) spawnBug("bug", z);
    }
    return 1;
  }
  return 0;
}
function lobPlasma(z, aim) {
  const z0 = (z.z || 0) + z.r * 2, dx = aim.x - z.x, dy = aim.y - z.y, d = Math.hypot(dx, dy) || 1;
  const T = clamp(d / 430, 0.6, 1.5), G = MV.GRAV * 0.5;
  world.projs.push({ id: world.nextId++, kind: "plasma", owner: 0, x: z.x + dx / d * z.r, y: z.y + dy / d * z.r, z: z0, vx: dx / T, vy: dy / T, vz: ((aim.z || 0) + 20 - z0) / T + 0.5 * G * T, age: 0 });
  world.events.push({ k: "spit", x: Math.round(z.x), y: Math.round(z.y) });
}
export function plasmaTick(pr, dt) {
  pr.vz -= MV.GRAV * 0.5 * dt;
  pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
  let hit = pr.age > 3 || pr.z <= MV.floorAt(pr.x, pr.y, 2, pr.z + 4, near(pr)).h || insideWall(pr.x, pr.y, pr.z);
  for (const q of players.values()) if (!hit && !q.dead && !q.air && (q.x - pr.x) ** 2 + (q.y - pr.y) ** 2 < 24 * 24 && pr.z > q.z - 6 && pr.z < q.z + MV.HGT + 10) hit = true;
  for (const v of world.vehicles) if (!hit && (v.x - pr.x) ** 2 + (v.y - pr.y) ** 2 < VEHICLES[v.kind].r ** 2 && pr.z < (v.z || 0) + (v.kind === "mech" ? 110 : 44)) hit = true;
  if (!hit && rectHitsCircle(HEARTH, pr, 6) && pr.z < HEARTH.z1 + 10) hit = true;
  if (!hit) return;
  pr.dead = true;
  const x = pr.x, y = pr.y, z = pr.z;
  world.events.push({ k: "boom", x: Math.round(x), y: Math.round(y), z: Math.round(z), r: 70, col: 0x7dff4a, c2: "125,255,74" });
  for (const q of players.values()) if (!q.dead && !q.air && !q.veh && Math.hypot(q.x - x, q.y - y, q.z + 28 - z) < 80) hurtPlayer(q, 16, null, "melted by bug plasma"); // riders: the vehicle takes it
  for (const v of world.vehicles) if (Math.hypot(v.x - x, v.y - y) < VEHICLES[v.kind].r + 70) hurtVehicle(v, 40, null);
  for (const b of world.builds) if ((b.x + 20 - x) ** 2 + (b.y + 20 - y) ** 2 < 70 * 70) hurtPiece(b, 40);
  if (game.phase !== "over" && rectHitsCircle(HEARTH, { x, y }, 70) && z < HEARTH.z1 + 40) { game.hearth -= 14; world.events.push({ k: "hhit" }); }
}
