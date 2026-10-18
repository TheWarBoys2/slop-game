// Hurting and killing things, explosions, grenades, rockets and fire, and shooting.
import { BOSSES } from "../story.js";
import { gearSum, bagAdd } from "../items.js";
import { shock } from "../market.js";
import { WEAPONS, ZTYPES } from "../data.js";
import { advTowns } from "./adventure.js";
import { bugBlast, bugsBeaten, dropPart, plasmaTick } from "./bugnight.js";
import { hurtPiece } from "./building.js";
import { H, HEARTH, MV, UAV_LEN, UAV_STREAK, W, clamp, dist2, now, pick, rand } from "./config.js";
import { endFix } from "./disasters.js";
import { OPEN, near, nearXY, wallsAlong } from "./geometry.js";
import { BALL, PLOTS, WOODEN, boxDist, damageWall } from "./map.js";
import { addStress } from "./needs.js";
import { ARM_SOAK, WEAK_MULT } from "./phases.js";
import { PIECES, TRAIT_KEYS, VEHICLES, addGold, addXp, chat, crouched, deed, dmgMult, feed, fullName, game, lootType, magOf, maxHp, newWeapon, players, rayBox3, rayCyl, reloadTime, resetLoadout, sk, spreadOf, toast, traitOf, wName, zHeight } from "./state.js";
import { exitVehicle, hurtVehicle, vehOf } from "./vehicles.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- combat
export function hurtZombie(z, dmg, p, kind) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  if (p) { p.st.dmg += dmg; p.pe.push({ k: "dmg", x: z.x, y: z.y - z.r, z: Math.round((z.z || 0) + zHeight(z)), v: Math.round(dmg), crit: kind === "crit", hs: kind === "hs", wk: kind === "wk" ? 1 : 0, arm: kind === "arm" ? 1 : 0, kill: z.hp <= 0 ? 1 : 0, big: ZTYPES[z.type].big ? 1 : 0 }); }
  if (z.hp <= 0) {
    const def = ZTYPES[z.type];
    if (p) deed("blood", z.type === "boss" || z.type === "elite" ? 20 : 0.4);
    if (kind !== "nuke") shock(game.market, "BOOM", 0.0015); // the bomb moves the market on its own
    if (p) {
      if (!p.kt.has(z.type)) { p.kt.add(z.type); p.st.ztypes = p.kt.size; }
      p.st.kills++;
      p.streak = (p.streak || 0) + 1;
      if (p.streak % UAV_STREAK === 0 && game.mode !== "royale") { // killstreak: everyone sees every zombie for a while
        game.uav = now() + UAV_LEN;
        world.events.push({ k: "banner", text: "UAV ONLINE", sub: `${fullName(p)} is on a ${p.streak}-kill streak. Every zombie is on the map for ${UAV_LEN} seconds.` });
        feed(`${fullName(p)}: ${p.streak} kills without dying. UAV online.`, "#7fdcff");
      }
      addGold(p, Math.round(def.gold * (game.mods.nightGold || 1)));
      addXp(p, def.xp + (kind === "hs" || kind === "wk" ? 4 : 0));
      if (sk(p, "bloodlust")) p.hp = Math.min(maxHp(p), p.hp + 3 * sk(p, "bloodlust"));
    }
    if (z.type === "boomer") bile(z.x, z.y, z.z || 0, 150);
    if (Math.random() < (ZTYPES[z.type].parts || 0)) dropPart(z); // mech parts
    if (z.type === "brain") bugsBeaten(p);
    if (z.type === "tank" && Math.random() < 0.15) world.crates.push({ id: world.nextId++, x: z.x, y: z.y, w: newWeapon(lootType(), 1 + (Math.random() < 0.4 ? 1 : 0)) });
    if (z.type === "elite") {
      world.crates.push({ id: world.nextId++, x: z.x, y: z.y, w: newWeapon(lootType(), 4) });
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
export function bile(x, y, z, r) {
  world.events.push({ k: "bile", x: Math.round(x), y: Math.round(y), z: Math.round(z), r });
  for (const q of players.values()) if (!q.dead && !q.air && (q.x - x) ** 2 + (q.y - y) ** 2 < r * r && Math.abs(q.z - z) < 90) {
    if (!(q.bile > now())) toast(q, "You're covered in boomer bile. Every zombie in the valley can smell you.", "#b8e04a");
    q.bile = now() + 9; addStress(q, 10);
  }
}
export function hurtPlayer(v, dmg, attacker, cause) {
  if (v.dead || v.air || now() < v.dashUntil) return;
  if (attacker && attacker !== v) {
    if (game.mode !== "royale") { dmg *= 0.35; attacker.heat += dmg; } // friendly fire is real, but softened
    attacker.st.dmg += dmg;
    attacker.pe.push({ k: "dmg", x: v.x, y: v.y - 20, z: Math.round(v.z + MV.HGT), v: Math.round(dmg), crit: false, ff: true });
  }
  const veh = vehOf(v);
  if (veh && veh.kind === "mech" && cause !== "blown up in a vehicle") { hurtVehicle(veh, dmg * (veh.seats[1] === v.id ? 0.5 : 0.8), attacker); return; } // the cockpit's sealed: the mech takes it
  if (veh && cause !== "blown up in a vehicle") { hurtVehicle(veh, dmg * 0.7, attacker); dmg *= 0.35; if (v.dead) return; }
  if (v.armor > 0) { const soak = Math.min(v.armor, dmg * 0.5); v.armor -= soak; dmg -= soak; }
  dmg *= 1 - Math.min(0.6, gearSum(v.gear, "def")); // helmet, vest, boots
  v.hp -= dmg; v.lastHurt = now(); addStress(v, dmg * 0.12);
  v.pe.push({ k: "hurt" });
  if (v.hp <= 0) killPlayer(v, attacker, cause);
}
export function killPlayer(v, attacker, cause) {
  if (v.dead) return;
  if (v.veh) exitVehicle(v);
  for (const q of players.values()) if (q !== v && dist2(q, v) < 600 * 600) addStress(q, 10);
  v.dead = true; v.hp = 0; v.inf = null; v.streak = 0; v.stress = 0; v.going = 0; v.ads = false; v.respawnAt = now() + 5; v.st.deaths++; v.champion = false;
  if (v.dlg) { v.dlg = null; v.pe.push({ k: "dlg", close: 1 }); }
  if (v.fix) endFix(v, "You died.");
  const prim = v.weapons.find((w) => w.type !== "pistol");
  if (prim) world.crates.push({ id: world.nextId++, x: v.x, y: v.y, w: { ...prim, ammo: magOf(prim), reloadUntil: 0, hot: false, tried: false, jam: false }, grave: true });
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
      world.events.push({ k: "shame", id: attacker.id, who: fullName(attacker), vic: fullName(v), n: attacker.st.tk });
    }
  } else feed(`${fullName(v)} was ${cause || "eaten"}`, "#ff9090");
  v.heat = 0;
  v.pe.push({ k: "wasted" });
}
export function respawnHeir(p) {
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
  if (game.mode === "adventure") { const t = advTowns()[p.advTown || 0] || advTowns()[0]; if (t) { p.x = t.cx + rand(-60, 60); p.y = t.cy + rand(30, 90); } } // the heir lands in the last town you were in
  toast(p, `${old} is dead. Long live ${fullName(p)}! (Inheritance tax: ${tax}g) Steer your hellpod with WASD.`, "#ffd34d");
  feed(`${fullName(p)} inherits the farm`, "#c0a0ff");
  hellpod(p);
}
// heirs arrive from orbit: a few seconds to steer, then the pod flattens whatever is underneath
const POD_LEN = 3.2, POD_R = 110;
function hellpod(p) {
  const t = now();
  p.z = 900; p.vx = p.vy = p.vz = 0; p.gr = false; p.air = "fall"; p.pod = true; p.fallEnd = t + POD_LEN; p.fallDur = POD_LEN;
  world.events.push({ k: "podin", id: p.id });
}
export function podLand(p) {
  p.pod = false;
  world.events.push({ k: "boom", x: p.x, y: p.y, r: POD_R, col: 0xff7a20 }); world.events.push({ k: "podland", x: p.x, y: p.y });
  let n = 0;
  for (const z of world.zombies) if (z.hp > 0 && dist2(z, p) < (POD_R + z.r) ** 2) { hurtZombie(z, z.type === "boss" ? 300 : 900, p); n++; }
  for (const q of players.values()) if (q !== p && !q.dead && !q.air && dist2(q, p) < 45 * 45) hurtPlayer(q, 999, p, "landed on by a hellpod");
  if (n) toast(p, `Hellpod landing: ${n} squashed.`, "#ff9a40");
}
// ---------------------------------------------------------------- explosions, things you throw, and fire
world.projs = [];
export const fires = new Map(); // "cx,cy" -> burning ground cell
export const scorched = new Map(); // cells that burnt out recently and can't catch again yet
const FIRE_CELL = 40, FIRE_MAX = 260;
let fireAcc = 0;
export const solved = () => !!(game.flags.exposed || game.flags.blackmail || game.flags.pardoned);
// knock a player about. The owner's browser is told too, so its prediction flies with them.
export function kick(q, vx, vy, vz) {
  if (q.veh || q.air || q.dead) return;
  q.vx += vx; q.vy += vy; q.vz = Math.max(q.vz, 0) + vz; if (vz > 0) q.gr = false;
  q.pe.push({ k: "kick", vx: Math.round(vx), vy: Math.round(vy), vz: Math.round(vz) });
}
// underground: in a cellar or a tunnel, below the ground. Blasts up top don't reach you down there (and the other way round).
export const underground = (e) => (e.z || 0) < -40 && !!MV.holeAt(nearXY(e.x, e.y), e.x, e.y);
export function explode(x, y, z, r, dmg, owner, cause, selfMult = 0.3) {
  world.events.push({ k: "boom", x: Math.round(x), y: Math.round(y), z: Math.round(z), r: Math.round(r) });
  const d3 = (ex, ey, ez) => Math.sqrt((ex - x) ** 2 + (ey - y) ** 2 + (ez - z) ** 2);
  const below = underground({ x, y, z }), otherSide = (e) => underground(e) !== below;
  for (const zb of world.zombies) {
    if (zb.hp <= 0 || otherSide(zb)) continue;
    const d = Math.max(0, d3(zb.x, zb.y, (zb.z || 0) + zHeight(zb) / 2) - zb.r);
    if (d >= r) continue;
    const f = 1 - (d / r) * 0.6;
    hurtZombie(zb, dmg * f, owner, "");
    const hd = Math.hypot(zb.x - x, zb.y - y) || 1;
    if (!ZTYPES[zb.type].big) { zb.vx += (zb.x - x) / hd * 320 * f; zb.vy += (zb.y - y) / hd * 320 * f; if (zb.type !== "flyer") { zb.vz = Math.max(zb.vz, 260 * f); zb.gr = false; } }
  }
  for (const q of players.values()) {
    if (q.dead || q.air || otherSide(q)) continue;
    const cz = q.z + MV.HGT / 2, d = d3(q.x, q.y, cz);
    if (d >= r + 16) continue;
    const f = 1 - (Math.max(0, d - 16) / r) * 0.7;
    if (q === owner) hurtPlayer(q, dmg * f * selfMult, null, cause);
    else hurtPlayer(q, dmg * f * (owner && game.mode !== "royale" ? 0.4 : 0.6), owner, cause);
    // the push: mostly up, so aiming at your feet sends you flying (rocket jumping)
    const nx = (q.x - x) / (d || 1), ny = (q.y - y) / (d || 1), nz = (cz - z) / (d || 1), push = (q === owner ? 760 : 520) * f;
    kick(q, nx * push * 0.9, ny * push * 0.9, push * Math.max(0.55, nz));
  }
  for (const b of world.builds) if ((b.x + 20 - x) ** 2 + (b.y + 20 - y) ** 2 < (r + 20) ** 2) hurtPiece(b, dmg * 0.5);
  { const d = Math.hypot(BALL.x - x, BALL.y - y, BALL.z - z); if (d < r) { const f = (1 - d / r) * 900; BALL.vx += (BALL.x - x) / (d || 1) * f; BALL.vy += (BALL.y - y) / (d || 1) * f; BALL.vz += f * 0.7; } }
  { const once = new Set(); for (const w of [...world.WALLS]) if (w.hp && w.kind !== "built") { const d = boxDist(w, x, y, z), key = w.hid && w.kind === "hwall" ? w.hid : w.id; if (d < r && !once.has(key)) { once.add(key); damageWall(w, dmg * 1.4 * (1 - d / r * 0.5)); } } }
  for (const v of world.vehicles) if ((v.x - x) ** 2 + (v.y - y) ** 2 < (r + VEHICLES[v.kind].r) ** 2 && Math.abs((v.z || 0) + 20 - z) < r + 30) hurtVehicle(v, dmg * 0.5, owner);
  if (game.bugs && z < 80) bugBlast(x, y, r, dmg, owner);
}
export const insideWall = (x, y, z) => nearXY(x, y).some((w) => !MV.soft(w) && x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h && z < w.z1 - 2 && z > (w.z0 || 0) - 2);
export function throwIt(p, kind) {
  const t = now();
  if (p.dead || p.air || p.veh || t < p.throwAt || t < p.going || p.dlg) return;
  if (!["day", "night", "royale"].includes(game.phase)) return;
  const have = kind === "molo" ? p.molo : p.gren;
  if (have <= 0) return toast(p, kind === "molo" ? "No molotovs left. Haddock's armoury sells them." : "No grenades left. Haddock's armoury sells them.", "#f88");
  if (kind === "molo") p.molo--; else p.gren--;
  p.throwAt = t + 0.7;
  const pt = p.pt + 0.18, sp = 640;
  const c = Math.cos(pt);
  world.projs.push({ id: world.nextId++, kind, owner: p.id, x: p.x + Math.cos(p.a) * 18, y: p.y + Math.sin(p.a) * 18, z: p.z + MV.EYE - 4, vx: Math.cos(p.a) * c * sp + p.vx * 0.5, vy: Math.sin(p.a) * c * sp + p.vy * 0.5, vz: Math.sin(pt) * sp + Math.max(0, p.vz) * 0.5, age: 0 });
  world.events.push({ k: "throw", id: p.id });
}
export function fireRocket(p, w, mult) {
  const pt = p.pt, sp = 980;
  const a = p.a + (Math.random() - 0.5) * 0.02;
  world.projs.push({ id: world.nextId++, kind: "rocket", owner: p.id, x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, z: p.z + MV.EYE - 6, vx: Math.cos(a) * Math.cos(pt) * sp, vy: Math.sin(a) * Math.cos(pt) * sp, vz: Math.sin(pt) * sp, age: 0, dmg: WEAPONS.rocket.dmg * mult, r: WEAPONS.rocket.boom * (w.rarity === 4 ? 1.5 : 1) });
  world.events.push({ k: "tr", x1: p.x, y1: p.y, z1: Math.round(p.z + MV.EYE), x2: p.x + Math.cos(a) * 40, y2: p.y + Math.sin(a) * 40, z2: Math.round(p.z + MV.EYE), c: "rocket", m: 0 });
}
export function projTick(t, dt) {
  for (const pr of world.projs) {
    pr.age += dt;
    if (pr.kind === "plasma") { plasmaTick(pr, dt); continue; } // a spitter bug's shot
    const owner = players.get(pr.owner) || null;
    if (pr.kind === "rocket") {
      const steps = 3; let boom = false;
      for (let i = 0; i < steps && !boom; i++) {
        pr.x += pr.vx * dt / steps; pr.y += pr.vy * dt / steps; pr.z += pr.vz * dt / steps;
        if (pr.z <= MV.floorAt(pr.x, pr.y, 2, pr.z, near(pr)).h || insideWall(pr.x, pr.y, pr.z) || (!OPEN() && (pr.x < 0 || pr.y < 0 || pr.x > W || pr.y > H))) boom = true;
        for (const zb of world.zombies) if (!boom && zb.hp > 0 && (zb.x - pr.x) ** 2 + (zb.y - pr.y) ** 2 < (zb.r + 6) ** 2 && pr.z > zb.z - 6 && pr.z < zb.z + zHeight(zb) + 6) boom = true;
        for (const q of players.values()) if (!boom && q.id !== pr.owner && !q.dead && !q.air && (q.x - pr.x) ** 2 + (q.y - pr.y) ** 2 < 22 * 22 && pr.z > q.z - 6 && pr.z < q.z + MV.HGT + 6) boom = true;
        for (const v of world.vehicles) if (!boom && (v.x - pr.x) ** 2 + (v.y - pr.y) ** 2 < VEHICLES[v.kind].r ** 2 && pr.z > (v.z || 0) - 4 && pr.z < (v.z || 0) + 44 && !(owner && owner.veh === v.id)) boom = true;
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
      for (const zb of world.zombies) if (!hit && zb.hp > 0 && (zb.x - pr.x) ** 2 + (zb.y - pr.y) ** 2 < (zb.r + 6) ** 2 && pr.z > zb.z - 6 && pr.z < zb.z + zHeight(zb)) hit = true;
      if (hit) {
        pr.dead = true;
        world.events.push({ k: "glass", x: Math.round(pr.x), y: Math.round(pr.y), z: Math.round(pr.z) });
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dy) < 2 || Math.random() < 0.6) ignite(pr.x + dx * FIRE_CELL, pr.y + dy * FIRE_CELL, pr.z + 30, pr.owner, 0, true);
      }
    } else if (pr.age > 2.0) { pr.dead = true; explode(pr.x, pr.y, pr.z + 6, 150, 150, owner, "blown up by a grenade", 0.5); }
  }
  world.projs = world.projs.filter((pr) => !pr.dead);
}
// fire lives on a grid of ground cells. Every cell can light its neighbours, weaker each generation, so a molotov
// makes a proper blaze without eating the whole valley. Barricades and crops are fuel.
export function ignite(x, y, zHint, ownerId, gen, force) {
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
export function fireTick(t, dt) {
  fireAcc += dt;
  if (fireAcc < 0.25) return;
  const step = fireAcc; fireAcc = 0;
  for (const [key, f] of fires) {
    if (t > f.until) { fires.delete(key); scorched.set(key, t + 40); continue; }
    const fuel = world.builds.some((b) => PIECES[b.bk].solid && b.x < f.x + 20 && b.x + 40 > f.x - 20 && b.y < f.y + 20 && b.y + 40 > f.y - 20);
    if (t > f.next && f.gen < 6) {
      f.next = t + rand(0.8, 1.6);
      const chance = (fuel ? 0.9 : 0.45) * Math.pow(0.75, f.gen);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.random() < chance * 0.5) ignite(f.x + dx * FIRE_CELL, f.y + dy * FIRE_CELL, f.z + 20, f.owner, f.gen + (fuel ? 0 : 1));
    }
    const owner = players.get(f.owner) || null;
    const inCell = (e, r, ez) => Math.abs(e.x - f.x) < FIRE_CELL / 2 + r * 0.5 && Math.abs(e.y - f.y) < FIRE_CELL / 2 + r * 0.5 && Math.abs((ez || 0) - f.z) < 26;
    for (const zb of world.zombies) if (zb.hp > 0 && zb.type !== "flyer" && inCell(zb, zb.r, zb.z)) { zb.fireUntil = t + 3; zb.fireBy = f.owner; }
    for (const q of players.values()) if (!q.dead && !q.air && !q.veh && inCell(q, 16, q.z)) { q.fireUntil = t + 1.5; q.fireBy = q.id === f.owner ? 0 : f.owner; }
    const once = new Set();
    for (const w of [...world.WALLS]) if (w.hp && WOODEN.has(w.kind) && boxDist(w, f.x, f.y, f.z) < 26 && !once.has(w.kind === "hwall" ? w.hid : w.id) && once.add(w.kind === "hwall" ? w.hid : w.id)) {
      damageWall(w, 60 * step);
      if (Math.random() < 0.15) ignite(f.x + (w.x + w.w / 2 - f.x) * 0.2, f.y + (w.y + w.h / 2 - f.y) * 0.2, f.z + 20, f.owner, Math.max(0, f.gen - 1), true);
    }
    for (const b of world.builds) if (PIECES[b.bk].solid && b.x < f.x + 20 && b.x + 40 > f.x - 20 && b.y < f.y + 20 && b.y + 40 > f.y - 20) hurtPiece(b, 40 * step);
    for (const pl of PLOTS) if (pl.stage > 0 && Math.abs(pl.x - f.x) < 24 && Math.abs(pl.y - f.y) < 24) { pl.stage = 0; pl.prog = 0; world.events.push({ k: "trample", x: pl.x, y: pl.y, burnt: 1 }); }
    for (const v of world.vehicles) if (v.kind !== "mech" && Math.abs(v.x - f.x) < 30 && Math.abs(v.y - f.y) < 30 && (v.z || 0) < 30) hurtVehicle(v, 20 * step, owner); // mechs are fireproof (they carry flamers)
  }
  for (const [key, until] of scorched) if (until < t) scorched.delete(key);
  // burning things keep burning for a bit after they leave the flames
  for (const zb of world.zombies) if (zb.fireUntil > t && zb.hp > 0) { hurtZombie(zb, 45 * step, players.get(zb.fireBy) || null, ""); if (Math.random() < 0.5) world.events.push({ k: "burn", x: zb.x, y: zb.y }); }
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
  world.events.push({ k: "slash", id: p.id, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), a: +p.a.toFixed(2), m: w.rarity === 4 ? 1 : 0 });
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
  for (const z of world.zombies) if (z.hp > 0 && inArc(z, z.r, z.z || 0, zHeight(z))) {
    any = true;
    let dmg = def.dmg * mult * (plunge ? 1.8 : 1), tag = plunge ? "hs" : "";
    if (p.cls === "rogue" && Math.random() < 0.25 + (traitOf(p).luck ? 0.1 : 0)) { dmg *= 2; tag = tag || "crit"; }
    hurtZombie(z, dmg, p, tag);
    if (w.mode) modeHit(p, w, z, dmg);
    const d = Math.hypot(z.x - p.x, z.y - p.y) || 1; z.vx += (z.x - p.x) / d * 220; z.vy += (z.y - p.y) / d * 220;
  }
  for (const q of players.values()) if (q !== p && !q.dead && !q.veh && !q.air && inArc(q, 16, q.z, MV.HGT)) { any = true; hurtPlayer(q, def.dmg * mult * (plunge ? 1.8 : 1), p, "cut in half"); }
  if (plunge) { p.vz = 380; world.events.push({ k: "boom", x: p.x, y: p.y, z: p.z, r: 50, dust: 1 }); } // bounce off whatever you landed on
  if (any) p.st.hits++;
}
export function shoot(p, w) {
  const def = WEAPONS[w.type];
  if (def.melee) return swing(p, w);
  const t = now();
  if (def.proj) { w.nextShot = t + 1 / def.rate; w.ammo--; p.st.shots++; fireRocket(p, w, dmgMult(p, w)); return; }
  w.nextShot = t + 1 / def.rate;
  w.ammo--;
  if (def.gamble && w.ammo > 0 && !w.hot) w.ammo = Math.floor(Math.random() * (w.rarity === 4 ? 150 : 100)); // could be 97, could be 0. A perfect reload steadies it for one mag
  p.st.shots++;
  const myth = w.rarity === 4;
  const mult = dmgMult(p, w);
  const spread = spreadOf(p, w);
  w.bloom = Math.min(1.6, w.bloom + def.bloom * (1 - 0.2 * sk(p, "steady")) * (w.att && w.att.muzzle ? 0.6 : 1));
  const pellets = def.pellets + (myth && w.type === "shotgun" ? 4 : 0);
  const pierce = def.pierce || (myth && w.type === "rifle");
  const boom = def.boom ? def.boom * (myth ? 1.6 : 1) : myth && w.type === "sniper" ? 110 : 0;
  const mx = p.x + Math.cos(p.a) * 20, my = p.y + Math.sin(p.a) * 20, mz = (p.z || 0) + MV.EYE - (p.slide > 0 ? 28 : crouched(p) ? 20 : 0) - (p.ads && w.type === "sniper" ? 0 : 6); // from the eye the client draws, crouched or not, so the scope is true
  let anyHit = false;
  for (let i = 0; i < pellets; i++) {
    const a = p.a + (Math.random() - 0.5) * 2 * spread;
    const pt = p.pt + (Math.random() - 0.5) * 2 * spread * 0.7;
    const dx = Math.cos(a) * Math.cos(pt), dy = Math.sin(a) * Math.cos(pt), dz = Math.sin(pt);
    const o = [mx, my, mz], d = [dx, dy, dz];
    let wallT = def.range, wallW = null;
    { const hl = Math.hypot(dx, dy) || 1; for (const wl of wallsAlong(mx, my, dx / hl, dy / hl, def.range)) if (!MV.soft(wl)) { const tw = rayBox3(o, d, wl); if (tw < wallT) { wallT = tw; wallW = wl; } } }
    if (dz < -1e-6) { // the ground, or the lake bed if the shot goes into the water, or the floor of a cellar or tunnel
      let tg = mz > 0 ? -mz / dz : 0;
      const gx = mx + dx * tg, gy = my + dy * tg, base = mz > 0 ? MV.baseAt(nearXY(gx, gy), gx, gy) : MV.baseAt(nearXY(mx, my), mx, my);
      if (base < 0) tg = (base - mz) / dz;
      if (Math.max(0, tg) < wallT) { wallT = Math.max(0, tg); wallW = null; }
    }
    const hits = [];
    const cyl = (c, r, z0, z1) => rayCyl(o, d, c, r, z0, z1);
    for (const z of world.zombies) { const tt = cyl(z, z.r, z.z || 0, (z.z || 0) + zHeight(z)); if (tt < wallT) hits.push([tt, z, "z"]); }
    for (const q of players.values()) {
      if (q === p || q.dead || q.veh || q.air) continue;
      const tt = cyl(q, 16, q.z, q.z + (crouched(q) ? 40 : MV.HGT)); if (tt < wallT) hits.push([tt, q, "p"]);
    }
    if (game.mode === "royale") for (const v of world.vehicles) { if (v.id === p.veh) continue; const tt = cyl(v, VEHICLES[v.kind].r, v.z || 0, (v.z || 0) + 40); if (tt < wallT) hits.push([tt, v, "v"]); }
    hits.sort((a, b) => a[0] - b[0]);
    let endT = wallT;
    if (def.boom) {
      endT = hits.length ? hits[0][0] : wallT;
      const bx = mx + dx * endT, by = my + dy * endT, bz = mz + dz * endT;
      world.events.push({ k: "boom", x: bx, y: by, z: bz, r: boom });
      if (w.type === "staff") ignite(bx, by, bz + 20, p.id, 3);
      if (hits.length) anyHit = true;
      const near = (e, ez, r) => (e.x - bx) ** 2 + (e.y - by) ** 2 + (ez - bz) ** 2 < r * r;
      for (const z of world.zombies) if (near(z, (z.z || 0) + z.r, boom + z.r)) hurtZombie(z, def.dmg * mult, p);
      for (const q of players.values()) if (!q.dead && near(q, q.z + 28, boom)) hurtPlayer(q, def.dmg * mult * 0.3, q === p ? null : p, "blown up by their own fireball");
    } else {
      const vi = hits.findIndex((h) => h[2] === "v");
      if (vi >= 0) hits.length = vi + 1; // vehicles stop bullets, even piercing ones
      const list = pierce ? hits : hits.slice(0, 1);
      if (!pierce && hits.length) endT = hits[0][0];
      if (endT === wallT && wallW && wallW.kind === "target") rangeHit(p, wallW, mz + dz * endT); // Haddock's range
      for (const [, target, kind] of list) {
        anyHit = true;
        let dmg = def.dmg * mult;
        if (kind === "v") { hurtVehicle(target, dmg * 0.6, p); continue; }
        // precision: a headshot is the top fifth of the target
        let tag = "";
        const th = hits.find((h) => h[1] === target)[0], hz = mz + dz * th, tz = target.z || 0, hh = kind === "z" ? zHeight(target) : crouched(target) ? 40 : MV.HGT, head = hz > tz + hh * 0.8;
        const armoured = kind === "z" && target.armHp > 0;
        const back = armoured && target.type === "charger" && ((target.fx || 0) * dx + (target.fy || 0) * dy) > 0.3; // shot in the back
        if (armoured && (head || back)) { dmg *= WEAK_MULT + 0.25 * sk(p, "deadeye"); tag = "wk"; p.st.hs++; }
        else if (armoured) { target.armHp -= dmg; dmg *= ARM_SOAK; tag = "arm"; if (target.armHp <= 0) { target.armHp = 0; world.events.push({ k: "armbreak", x: target.x, y: target.y, z: Math.round((target.z || 0) + zHeight(target) * 0.6) }); p.pe.push({ k: "toast", text: "Armour off!", color: "#ffd34d" }); } }
        else if (head && w.type !== "shotgun") { dmg *= 1.75 + 0.25 * sk(p, "deadeye"); tag = "hs"; p.st.hs++; }
        if (p.cls === "rogue" && Math.random() < 0.25 + (traitOf(p).luck ? 0.1 : 0)) { dmg *= 2; tag = tag || "crit"; }
        if (kind === "z") {
          hurtZombie(target, dmg, p, tag);
          { const kb = (KNOCK[w.type] || 20) * Math.min(1, 20 / target.r); target.vx += dx * kb; target.vy += dy * kb; } // every hit shoves a little
          if (w.mode && (w.type !== "shotgun" || Math.random() < 0.3)) modeHit(p, w, target, dmg);
          if (myth && w.type === "shotgun") { target.vx += dx * 160; target.vy += dy * 160; }
          if (myth && w.type === "smg") p.hp = Math.min(maxHp(p), p.hp + dmg * 0.12);
        } else hurtPlayer(target, dmg, p, "shot");
      }
      if (boom) {
        const bx = mx + dx * endT, by = my + dy * endT;
        world.events.push({ k: "boom", x: bx, y: by, z: mz + dz * endT, r: boom });
        for (const z of world.zombies) if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (boom + z.r) ** 2) hurtZombie(z, 60 * mult, p);
      }
    }
    world.events.push({ k: "tr", x1: mx, y1: my, z1: Math.round(mz), x2: mx + dx * endT, y2: my + dy * endT, z2: Math.round(mz + dz * endT), c: w.type, m: myth ? 1 : 0 });
  }
  if (anyHit) p.st.hits++;
  if (w.ammo <= 0) w.hot = false;
}
// the targets on the back wall of Haddock's armoury: a ding, and a streak count for bragging
function rangeHit(p, w, hz) {
  const bull = Math.abs(hz - (w.z0 + w.z1) / 2) < 6, t = now();
  p.rangeN = t - (p.rangeT || 0) < 3 ? (p.rangeN || 0) + 1 : 1; p.rangeT = t;
  world.events.push({ k: "ding", x: w.x + w.w / 2, y: w.y + w.h / 2, z: Math.round(hz), b: bull ? 1 : 0 });
  if (p.rangeN % 10 === 0) toast(p, `${p.rangeN} on target in a row. Haddock nods.`, "#ffd34d");
}
// how hard each gun shoves what it hits (per bullet; heavier zombies move less)
const KNOCK = { pistol: 40, smg: 18, rifle: 40, ak: 34, shotgun: 30, sniper: 220, laser: 320 };
// a Legendary's firing mode going off on a zombie it just hit
function modeHit(p, w, z, dmg) {
  const t = now(), over = w.enh >= 4 ? 1.5 : 1, def = WEAPONS[w.type];
  const nearest = (from, n, r, skip) => world.zombies.filter((q) => q.hp > 0 && !skip.has(q) && dist2(q, from) < r * r).sort((a, b) => dist2(a, from) - dist2(b, from)).slice(0, n);
  const zc = (q) => Math.round((q.z || 0) + zHeight(q) * 0.6);
  if (w.mode === "ricochet") {
    const [n] = nearest(z, 1, 280, new Set([z]));
    if (!n) return;
    world.events.push({ k: "tr", x1: z.x, y1: z.y, z1: zc(z), x2: n.x, y2: n.y, z2: zc(n), c: "rico", m: 0 });
    hurtZombie(n, dmg * 0.55 * over, p, "");
  } else if (w.mode === "fire") {
    z.fireUntil = Math.max(z.fireUntil || 0, t + 1.2 * over); z.fireBy = p.id;
  } else if (w.mode === "frost") {
    z.slowUntil = t + 1.5; z.chill = (z.chill || 0) + clamp(def.dmg * 0.6, 5, 70) * over;
    if (z.chill >= 100 && z.type !== "boss") { z.chill = 0; z.frozen = t + 1.6; z.stun = Math.max(z.stun || 0, t + 1.6); z.fireUntil = 0; }
  } else if (w.mode === "storm") {
    if (t < (w.zapAt || 0)) return; // not every bullet of an SMG
    w.zapAt = t + (def.rate > 4 ? 0.3 : 0);
    const hit = new Set([z]), pts = [[Math.round(z.x), Math.round(z.y), zc(z)]];
    let cur = z;
    for (let i = 0; i < 2; i++) { const [n] = nearest(cur, 1, 230, hit); if (!n) break; hit.add(n); hurtZombie(n, dmg * 0.45 * over, p, ""); n.stun = Math.max(n.stun || 0, t + 0.25); pts.push([Math.round(n.x), Math.round(n.y), zc(n)]); cur = n; }
    if (pts.length > 1) world.events.push({ k: "zap", pts });
  } else if (w.mode === "boom") {
    const r = 55 * over;
    world.events.push({ k: "boom", x: z.x, y: z.y, z: zc(z), r, small: 1 });
    for (const q of world.zombies) if (q !== z && q.hp > 0 && dist2(q, z) < (r + q.r) ** 2) hurtZombie(q, dmg * 0.35 * over, p, "");
  }
}
// Active reloads (back by popular demand). Press R to reload, then tap R again inside the green window
// for an instant reload and an empowered mag. Miss the window and you fumble, which costs a little time.
// guns get dirty as you shoot them, and dirty guns can jam: R clears a jam
export const DIRT = { pistol: 0.15, smg: 0.11, rifle: 0.14, ak: 0.22, shotgun: 0.3, sniper: 0.4, staff: 0, rocket: 0.25, sword: 0, laser: 0 };
const RL_LO = 0.45, RL_HI = 0.62;
export function startReload(p, w) {
  const def = WEAPONS[w.type];
  if (def.melee || w.reloadUntil) return;
  const t = now();
  if (w.jam) { w.reloadStart = t; w.reloadUntil = t + 0.8; w.tried = true; w.clearing = true; return; }
  if (w.ammo >= magOf(w)) return;
  w.reloadStart = t; w.reloadUntil = t + reloadTime(p, w); w.tried = false; w.hot = false; w.clearing = false;
}
function tryActiveReload(p, w) {
  if (!w.reloadUntil || w.tried) return;
  w.tried = true;
  const t = now(), total = w.reloadUntil - w.reloadStart, k = (t - w.reloadStart) / total;
  if (k >= RL_LO && k <= RL_HI) { w.reloadUntil = 0; w.ammo = magOf(w); w.hot = true; p.st.perfect++; p.pe.push({ k: "perfect" }); }
  else { w.reloadUntil += 0.5; p.pe.push({ k: "jam", text: "Fumbled it" }); }
}
export function pressReload(p, w) { if (w.reloadUntil) tryActiveReload(p, w); else startReload(p, w); }
export function reloadTick(p, w, t) {
  if (!w.reloadUntil || t < w.reloadUntil) return;
  w.reloadUntil = 0;
  if (w.clearing) { w.clearing = false; w.jam = false; p.pe.push({ k: "toast", text: "Jam cleared.", color: "#8f8" }); return; }
  w.ammo = magOf(w);
}
export function cleanWeapon(p, m) {
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
