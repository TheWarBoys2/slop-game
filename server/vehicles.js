// Vehicles, helicopters and call-ins.
import { ZTYPES } from "../data.js";
import { giveWeapon } from "./actions.js";
import { fireRocket, hurtPlayer, hurtZombie, killPlayer, shoot } from "./combat.js";
import { MV, TEST_DMG, clamp, dist2, rand } from "./config.js";
import { BH, BW, near } from "./geometry.js";
import { LAKE_SOLID } from "./map.js";
import { enterMech, mechTick, mechWrecked } from "./mechs.js";
import { spawnZombie } from "./phases.js";
import { outsideZone } from "./royale.js";
import { VEHICLES, addGold, addXp, collide, deed, feed, freeSpot, fullName, game, lootType, newWeapon, players, toast, wName } from "./state.js";
import { tickN } from "./tick.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- vehicles
export function spawnVehicles(kinds, near) {
  for (const kind of kinds) {
    let sp = freeSpot(40);
    if (near) for (let i = 0; i < 80; i++) { const c = freeSpot(40), d = Math.hypot(c.x - near.x, c.y - near.y); if (d > 200 && d < 420) { sp = c; break; } }
    world.vehicles.push({ id: world.nextId++, kind, x: sp.x, y: sp.y, a: rand(0, Math.PI * 2), v: 0, hp: VEHICLES[kind].hp, seats: [0, 0] });
  }
}
// breath: underwater it runs out in about 15 seconds. Surface, or find a bubble vent on the lake bed.
export function breathe(p, t, dt) {
  const under = p.swim && p.z < -44;
  const vent = under && world.WALLS.some((w) => w.kind === "vent" && MV.touches(w, p.x, p.y, 30) && p.z < w.z1 + 70);
  p.breath = clamp((p.breath ?? 15) + (under ? (vent ? 5 : -1) : 4) * dt, 0, 15);
  if (under && p.breath <= 0) { p.hp -= 14 * dt; p.lastHurt = t; if (tickN % 10 === 0) p.pe.push({ k: "hurt" }); if (p.hp <= 0) killPlayer(p, null, "drowned"); }
  if (p.swim && !p.wasSwim) world.events.push({ k: "splash", x: Math.round(p.x), y: Math.round(p.y) });
  p.wasSwim = p.swim;
}
// the Sunken Shrine: touch the four glyphs in the order carved on the shrine and it opens
const GLYPHS = 4;
export function shrineReset() { game.shrine = { order: [0, 1, 2, 3].sort(() => Math.random() - 0.5), step: 0, open: false }; }
export function touchGlyph(p) {
  const g = world.WALLS.find((w) => w.kind === "glyph" && MV.touches(w, p.x, p.y, 50) && p.z < w.z1 + 30);
  if (!g) return false;
  const S2 = game.shrine || (shrineReset(), game.shrine);
  if (S2.open) { toast(p, "The shrine is already open. Its treasure's gone.", "#9fe0ff"); return true; }
  if (S2.order[S2.step] === g.g) {
    S2.step++;
    world.events.push({ k: "glyph", g: g.g, x: Math.round(g.x + 15), y: Math.round(g.y + 15), z: Math.round(g.z1) });
    if (S2.step < GLYPHS) { toast(p, `The glyph lights up. (${S2.step}/${GLYPHS})`, "#7dd8ff"); return true; }
    S2.open = true;
    const w = newWeapon(lootType(), Math.random() < 0.25 ? 4 : 3);
    giveWeapon(p, w); addGold(p, 300, "The Sunken Shrine");
    for (const q of players.values()) if (q !== p) addGold(q, 100, "Someone opened the Sunken Shrine");
    addXp(p, 60); deed("word", 6);
    world.events.push({ k: "banner", text: "THE SUNKEN SHRINE OPENS", sub: `${fullName(p)} found ${wName(w)} at the bottom of the lake.` });
    return true;
  }
  S2.step = 0;
  world.events.push({ k: "glyph", g: -1, x: Math.round(g.x + 15), y: Math.round(g.y + 15), z: Math.round(g.z1) });
  toast(p, "Wrong glyph. The shrine groans, the glyphs go dark, and something stirs in the silt.", "#ff8080");
  for (let i = 0; i < 2; i++) { const z = spawnZombie("walker", { x: g.x + 15, y: g.y + 15 }); if (z) { z.z = g.z0 + 2; z.gr = true; } }
  return true;
}
export function vehOf(p) { return p.veh ? world.vehicles.find((v) => v.id === p.veh) : null; }
export function enterVehicle(p, v) {
  if (v.kind === "mech") return enterMech(p, v);
  const seat = v.seats[0] ? v.seats[1] ? -1 : 1 : 0;
  if (seat < 0) return false;
  v.seats[seat] = p.id; p.veh = v.id; p.dlg = null;
  const air = VEHICLES[v.kind].air;
  toast(p, seat === 0 ? (air ? `Flying the ${VEHICLES[v.kind].name}. W/S pitch, A/D strafe, the nose follows your mouse, SPACE climbs, C or CTRL descends.${VEHICLES[v.kind].gun ? " Click: chain gun. Right-click: rockets." : ""} A flight stick or gamepad works too (Options). E to get out.` : `Driving the ${VEHICLES[v.kind].name}. WASD to drive, E to get out.`)
    : air ? "Door gunner. Shoot anything that moves. E to jump out (careful)." : `Riding shotgun. You can shoot. E to get out.`, "#9fe0ff");
  return true;
}
export function exitVehicle(p) {
  const v = vehOf(p); p.veh = 0;
  if (!v) return;
  v.seats = v.seats.map((id) => (id === p.id ? 0 : id));
  const side = v.a + Math.PI / 2;
  p.x = v.x + Math.cos(side) * (VEHICLES[v.kind].r + 22); p.y = v.y + Math.sin(side) * (VEHICLES[v.kind].r + 22);
  collide(p, 16);
}
function wreck(v, by) {
  world.vehicles = world.vehicles.filter((q) => q !== v);
  if (v.kind === "mech") mechWrecked(v);
  world.events.push({ k: "boom", x: v.x, y: v.y, r: 130 });
  for (const z of world.zombies) if (dist2(z, v) < 140 * 140) hurtZombie(z, 150, by);
  for (const id of v.seats) { const p = players.get(id); if (p) { exitVehicle(p); hurtPlayer(p, 40, null, "blown up in a vehicle"); } }
  for (const p of players.values()) if (!p.dead && !p.veh && dist2(p, v) < 110 * 110) hurtPlayer(p, 35, by && by !== p ? by : null, "caught in a vehicle explosion");
  feed(`The ${VEHICLES[v.kind].name} exploded`, "#ff9d2e");
}
export function hurtVehicle(v, dmg, by) { v.hp -= dmg; if (v.hp <= 0) wreck(v, by); }
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
    if (hit !== "edge" && sp > 150) { hurtVehicle(v, sp * 0.18, null); world.events.push({ k: "land", x: v.x, y: v.y }); if (!world.vehicles.includes(v)) return; }
    v.vx *= -0.3; v.vy *= -0.3;
  }
  v.z += v.vz * dt;
  const fl = MV.floorAt(v.x, v.y, def.r * 0.5, v.z + 20, near(v)).h;
  if (v.z <= fl) {
    if (v.vz < -280) { hurtVehicle(v, (-v.vz - 280) * 0.9, null); world.events.push({ k: "land", x: v.x, y: v.y }); if (!world.vehicles.includes(v)) return; }
    v.z = fl; v.vz = Math.max(0, v.vz); const f = Math.pow(0.02, dt); v.vx *= f; v.vy *= f;
  }
  if (v.z > 1100) { v.z = 1100; v.vz = Math.min(0, v.vz); }
  v.v = Math.hypot(v.vx, v.vy);
  // low and fast, the rotor wash shoves the dead about
  if (v.z < 90 && v.z > 8) for (const z of world.zombies) if (z.type !== "flyer" && dist2(z, v) < 110 * 110 && Math.random() < dt * 3) { const d = Math.sqrt(dist2(z, v)) || 1; z.vx += (z.x - v.x) / d * 260; z.vy += (z.y - v.y) / d * 260; }
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
export function vehicleTick(t, dt) {
  for (const v of [...world.vehicles]) {
    const def = VEHICLES[v.kind], driver = players.get(v.seats[0]);
    if (driver && (driver.dead || driver.veh !== v.id)) v.seats[0] = 0;
    if (def.air) { flyTick(v, def, players.get(v.seats[0]), t, dt); continue; }
    if (def.mech) { mechTick(v, def, players.get(v.seats[0]), t, dt); continue; }
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
      if (hitSpeed > 90) { hurtVehicle(v, hitSpeed * 0.12, null); world.events.push({ k: "land", x: v.x, y: v.y }); }
      if (Math.hypot(v.x - ox, v.y - oy) < Math.abs(v.v) * dt * 0.5) v.v *= -0.25;
      if (!world.vehicles.includes(v)) continue;
    }
    const speed = Math.abs(v.v);
    if (speed > 80) {
      for (const z of world.zombies) {
        if (z.hp <= 0 || (z.rammed || 0) > t || dist2(z, v) > (def.r + z.r) ** 2) continue;
        z.rammed = t + 0.35; z.stun = t + 0.5;
        z.vx += Math.cos(v.a) * speed * 0.9; z.vy += Math.sin(v.a) * speed * 0.9;
        hurtZombie(z, speed * 0.3 * def.ram * game.mods.dmg * TEST_DMG, driver || null, "");
        if (ZTYPES[z.type].big) { v.v *= 0.4; hurtVehicle(v, 25, null); if (!world.vehicles.includes(v)) break; }
      }
    }
    if (speed > 140 && world.vehicles.includes(v)) for (const q of players.values()) {
      if (q.dead || q.veh || q.air || (q.rammed || 0) > t || dist2(q, v) > (def.r + 16) ** 2) continue;
      q.rammed = t + 0.6; q.vx += Math.cos(v.a) * speed; q.vy += Math.sin(v.a) * speed;
      hurtPlayer(q, speed * 0.1, driver && driver !== q ? driver : null, "run over");
    }
    for (const id of v.seats) { const p = players.get(id); if (p && p.veh === v.id) { p.x = v.x; p.y = v.y; p.z = 0; } }
  }
}
