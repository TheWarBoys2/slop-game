// Mech suits: parts, building them, calling them in, piloting.
import { BAG_SIZE, bagAdd, bagTake } from "../items.js";
import { MECH_PARTS, MECH_REPAIR, MECH_COOL, BUG_HOLE_HP, rollPart, mechStats, mechCode } from "../bugs.js";
import { bugBlast, sealHole } from "./bugnight.js";
import { rectHitsCircle } from "./building.js";
import { fireRocket, hurtZombie, ignite, shoot } from "./combat.js";
import { HEARTH, MV, TEST_DMG, clamp, dist2, now, rand } from "./config.js";
import { BH, BW, near, nearXY } from "./geometry.js";
import { LAKE_SOLID, boxDist, damageWall, inHouse } from "./map.js";
import { collide, freeGround, fullName, game, newWeapon, players, price, toast, wading } from "./state.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

// ---- mech suits
export function buyMech(p, item, cost) {
  const ids = item === "mechkit" ? ["reactor", "strider", "cannon"] : [rollPart()];
  const room = BAG_SIZE - p.bag.length - ids.filter((id) => !p.bag.some((b) => b.id === "mp_" + id)).length;
  if (room < 0) return toast(p, "Your bag is full. Use or drop something first [I].", "#f88");
  p.gold -= cost;
  for (const id of ids) bagAdd(p.bag, "mp_" + id);
  p.invDirty = true;
  toast(p, `Bought ${ids.map((id) => MECH_PARTS[id].name).join(", ")}. It's in your bag [I]: use a part to bolt it on, then P calls your mech.`, "#8f8");
}
function mechMissing(m) {
  const need = [];
  if (!m.core) need.push("a core"); if (!m.legs) need.push("legs"); if (!m.armR && !m.armL) need.push("an arm");
  return need.join(", ");
}
function mechOf(p) { return world.vehicles.find((v) => v.kind === "mech" && v.owner === p.id) || null; }
export function mechInstall(p, id) {
  const part = MECH_PARTS[id];
  if (!part || !bagTake(p.bag, "mp_" + id)) return;
  const m = p.mech;
  let slot = part.slot, out = null;
  if (slot === "arm") {
    if (!m.armR) slot = "armR"; else if (!m.armL) slot = "armL";
    else { out = m.armL; m.armL = m.armR; m.armR = null; slot = "armR"; } // the right arm moves to the left, the old left one comes off
  } else out = m[slot] || null;
  m[slot] = id;
  if (out && !bagAdd(p.bag, "mp_" + out)) world.crates.push({ id: world.nextId++, x: p.x + rand(-20, 20), y: p.y + 30, it: { id: "mp_" + out, n: 1, r: 3 } });
  p.invDirty = true;
  const v = mechOf(p);
  if (v) { const st = mechStats(m); v.parts = { ...m }; v.hp = Math.min(st.hp, v.hp * st.hp / (v.maxHp || st.hp)); v.maxHp = st.hp; }
  const st = mechStats(m);
  toast(p, `Bolted on the ${part.name}${out ? ` (the ${MECH_PARTS[out].name} went back in your bag)` : ""}. ${st.ready ? (v ? "Your mech's already updated." : "Press P to call your mech down.") : `It still needs ${mechMissing(m)}.`}`, "#7fdcff");
  p.pe.push({ k: "fitted" });
}
export function deployMech(p) {
  if (!rules().mechs) return toast(p, "No mechs in the Royale. It wouldn't be fair. It would be hilarious, but it wouldn't be fair.", "#bbb");
  if (!["day", "night"].includes(game.phase) || p.dead || p.air) return;
  const st = mechStats(p.mech), t = now();
  if (!st.ready) return toast(p, `Your mech needs ${mechMissing(p.mech)} before it can walk. Parts drop from big monsters, bug holes and Haddock's armoury.`, "#f88");
  if (p.veh) return toast(p, "Get out of that first [E].", "#bbb");
  if (p.z < -20 || inHouse(p)) return toast(p, "Your mech can't land in here. Get outside.", "#f88");
  if (t < (p.mechCd || 0)) return toast(p, `Your mech's still being welded back together. ${Math.ceil(p.mechCd - t)}s.`, "#f88");
  if (t < (p.mechDrop || 0)) return;
  const old = mechOf(p);
  if (old && old.seats.some(Boolean)) return toast(p, "Somebody's in your mech.", "#f88");
  let cost = 0;
  if (!old && p.mechWreck) {
    cost = price(p, MECH_REPAIR);
    if (p.gold < cost) return toast(p, `Rebuilding your wrecked mech costs ${cost}g. You have ${p.gold}g.`, "#f88");
    p.gold -= cost; p.mechWreck = false;
  }
  if (old) world.vehicles = world.vehicles.filter((v) => v !== old);
  const hp = old ? old.hp : st.hp;
  p.mechDrop = t + 4;
  toast(p, cost ? `Paid ${cost}g to rebuild it. Mech inbound in 4 seconds: stand clear.` : old ? "Your mech is being dropped back to you. 4 seconds." : "Mech inbound. It lands in 4 seconds: stand clear.", "#7fdcff");
  world.events.push({ k: "mechcall", x: Math.round(p.x), y: Math.round(p.y) });
  setTimeout(() => {
    if (!players.has(p.id) || !["day", "night"].includes(game.phase)) return;
    let sp = null;
    for (let i = 0; i < 60 && !sp; i++) { const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 80, c = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }; const q = { ...c }; collide(q, 44); if (q.x === c.x && q.y === c.y && freeGround(c) && !inHouse(c)) sp = c; }
    sp = sp || { x: p.x + 70, y: p.y };
    world.vehicles.push({ id: world.nextId++, kind: "mech", x: sp.x, y: sp.y, z: 0, vz: 0, vx: 0, vy: 0, a: p.a, v: 0, hp, maxHp: st.hp, seats: [0, 0], owner: p.id, parts: { ...p.mech }, gr: true });
    world.events.push({ k: "mechland", x: Math.round(sp.x), y: Math.round(sp.y) });
    for (const z of world.zombies) if (dist2(z, sp) < 100 * 100) hurtZombie(z, 250, p, ""); // squish
    toast(p, "Your mech has landed. E to climb in.", "#7fdcff");
  }, 4000);
}
export function enterMech(p, v) {
  const seat = !v.seats[0] && v.owner === p.id ? 0 : !v.seats[1] ? 1 : -1;
  if (seat < 0) return false;
  v.seats[seat] = p.id; p.veh = v.id; p.dlg = null;
  const st = mechStats(v.parts);
  if (seat === 1) toast(p, `Riding on ${players.get(v.owner) ? fullName(players.get(v.owner)) + "'s" : "the"} mech's shoulder. Shoot anything. E to hop off.`, "#9fe0ff");
  else toast(p, `You're in your mech.${st.jet ? " SPACE fires the jets: land on a bug hole to seal it." : ""} It repairs itself by the Hearth.`, "#9fe0ff");
  return true;
}
export function mechWrecked(v) {
  const p = players.get(v.owner);
  if (!p) return;
  p.mechWreck = true; p.mechCd = now() + MECH_COOL;
  toast(p, `Your mech is scrap. Haddock can rebuild it for ${price(p, MECH_REPAIR)}g: press P again in ${MECH_COOL}s.`, "#ff9d2e");
}
export function mechTick(v, def, driver, t, dt) {
  const st = mechStats(v.parts), on = !!(driver && !driver.dead);
  v.vx = v.vx || 0; v.vy = v.vy || 0; v.z = v.z || 0; v.vz = v.vz || 0;
  let mx = 0, my = 0;
  if (on) {
    const k = driver.keys, f = ((k & 1) ? 1 : 0) - ((k & 4) ? 1 : 0), s = ((k & 8) ? 1 : 0) - ((k & 2) ? 1 : 0);
    const yaw = driver.my ?? driver.a;
    mx = Math.cos(yaw) * f - Math.sin(yaw) * s; my = Math.sin(yaw) * f + Math.cos(yaw) * s;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    let d = driver.a - v.a; d = Math.atan2(Math.sin(d), Math.cos(d));
    v.a += clamp(d, -def.turn * dt, def.turn * dt); // the torso turns to the crosshair
  }
  const sp = st.speed * (wading(v) ? 0.6 : 1), k = Math.min(1, dt * (v.gr ? 6 : 1.2));
  v.vx += (mx * sp - v.vx) * k; v.vy += (my * sp - v.vy) * k;
  v.x += v.vx * dt; v.y += v.vy * dt;
  const hit = MV.pushOut(v, def.r, near(v), BW(), BH(), v.z, 100);
  if (hit && hit !== "edge" && hit.hp && ["fence", "crate", "tree", "furn", "glass"].includes(hit.kind)) damageWall(hit, 500 * dt); // it walks through the small stuff
  if (v.z > -8) MV.pushOut(v, def.r, LAKE_SOLID, BW(), BH(), 0, 40);
  if (on && st.jet && (driver.keys & 16) && v.gr && t > (v.jetAt || 0)) { v.vz = 600; v.gr = false; v.jetAt = t + 1.1; v.jetting = t + 0.5; world.events.push({ k: "jet", id: v.id, x: Math.round(v.x), y: Math.round(v.y) }); }
  v.vz -= MV.GRAV * 0.8 * dt; v.z += v.vz * dt;
  const fl = MV.floorAt(v.x, v.y, def.r * 0.5, v.z + 24, near(v)).h;
  if (v.z <= fl) { if (!v.gr && v.vz < -380) mechSlam(v, driver, st); v.z = fl; v.vz = 0; v.gr = true; }
  else v.gr = v.z - fl < 2;
  if (v.z > 900) { v.z = 900; v.vz = Math.min(0, v.vz); }
  v.v = Math.hypot(v.vx, v.vy);
  // stomping: small things underfoot get squashed, bigger things get shoved
  for (const z of world.zombies) {
    if (z.hp <= 0 || dist2(z, v) > (def.r + z.r) ** 2 || Math.abs((z.z || 0) - v.z) > 90) continue;
    const d = Math.sqrt(dist2(z, v)) || 1, nx = (z.x - v.x) / d, ny = (z.y - v.y) / d;
    if (z.r <= 22 && v.v > 50 && !((z.rammed || 0) > t)) { z.rammed = t + 0.4; hurtZombie(z, 45 * st.stomp * st.dmg * game.mods.dmg * TEST_DMG, driver || null, ""); }
    if (z.r < 40) { z.x = v.x + nx * (def.r + z.r); z.y = v.y + ny * (def.r + z.r); }
  }
  if (on) { mechArm(v, "armR", driver.firing, driver, st, t); mechArm(v, "armL", driver.ads, driver, st, t); }
  if (rectHitsCircle(HEARTH, v, 210) && v.hp < v.maxHp) v.hp = Math.min(v.maxHp, v.hp + 60 * dt); // the Hearth patches it up
  v.seats.forEach((id, i) => { const p = players.get(id); if (p && p.veh === v.id) { p.x = v.x; p.y = v.y; p.z = v.z + (i ? 72 : 0); } });
}
function mechSlam(v, driver, st) { // coming down off the jets: everything underneath has a very bad time
  world.events.push({ k: "boom", x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z), r: 130, dust: 1 });
  world.events.push({ k: "slam", x: Math.round(v.x), y: Math.round(v.y) });
  for (const z of world.zombies) {
    if (z.hp <= 0 || dist2(z, v) > 150 * 150 || Math.abs((z.z || 0) - v.z) > 120) continue;
    hurtZombie(z, 160 * st.dmg * st.stomp * game.mods.dmg * TEST_DMG, driver || null, "");
    if (z.r < 40) { const d = Math.sqrt(dist2(z, v)) || 1; z.vx += (z.x - v.x) / d * 420; z.vy += (z.y - v.y) / d * 420; if (z.type !== "flyer") { z.vz = 300; z.gr = false; } }
  }
  bugBlast(v.x, v.y, 110, 220, driver || null);
  for (const w of [...nearXY(v.x, v.y)]) if (w.hp && ["fence", "crate", "furn", "glass"].includes(w.kind) && boxDist(w, v.x, v.y, v.z) < 90) damageWall(w, 400);
}
function mechArm(v, slot, pressed, p, st, t) {
  const kind = v.parts[slot];
  if (!kind || !pressed || t < (v[slot + "At"] || 0)) return;
  const fx = Math.cos(p.a), fy = Math.sin(p.a);
  if (kind === "cannon") {
    v[slot + "At"] = t + 0.13;
    const g = v[slot + "Gun"] || (v[slot + "Gun"] = newWeapon("rifle", 3));
    g.ammo = 99; g.bloom = 0.12; g.reloadUntil = 0; g.jam = false; g.dirt = 0; g.mult = 0.8 * st.dmg;
    shoot(p, g);
  } else if (kind === "rockets") {
    v[slot + "At"] = t + 0.9;
    fireRocket(p, { rarity: 1 }, 1.25 * st.dmg * game.mods.dmg);
  } else if (kind === "flamer") {
    v[slot + "At"] = t + 0.1;
    const ox = v.x + fx * 30, oy = v.y + fy * 30;
    world.events.push({ k: "flame", x: Math.round(ox), y: Math.round(oy), z: Math.round(v.z + 60), a: +p.a.toFixed(2) });
    for (const z of world.zombies) {
      if (z.hp <= 0) continue;
      const dx = z.x - ox, dy = z.y - oy, d = Math.hypot(dx, dy) - z.r;
      if (d > 210 || Math.abs((z.z || 0) - v.z) > 120) continue;
      let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 0.5 && d > 10) continue;
      hurtZombie(z, 9 * st.dmg * game.mods.dmg * TEST_DMG, p, ""); z.fireUntil = t + 2.5; z.fireBy = p.id;
    }
    if (t > (v.igniteAt || 0)) { v.igniteAt = t + 0.35; const d = rand(90, 190); ignite(ox + fx * d, oy + fy * d, v.z + 30, p.id, 3, true); }
  } else if (kind === "sword") {
    v[slot + "At"] = t + 0.65;
    world.events.push({ k: "slash", id: p.id, x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z + 40), a: +p.a.toFixed(2), m: 0, big: 1 });
    for (const z of world.zombies) {
      if (z.hp <= 0) continue;
      const dx = z.x - v.x, dy = z.y - v.y, d = Math.hypot(dx, dy) - z.r;
      if (d > 150 || Math.abs((z.z || 0) - v.z) > 130) continue;
      let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 1.2 && d > 10) continue;
      hurtZombie(z, 170 * st.dmg * game.mods.dmg * TEST_DMG, p, "");
      if (z.r < 40) { const n = Math.hypot(dx, dy) || 1; z.vx += dx / n * 480; z.vy += dy / n * 480; }
    }
    if (game.bugs) for (const h of [...game.bugs.holes]) if (!h.hive && Math.hypot(h.x - v.x, h.y - v.y) < 170) { h.hp -= 60; if (h.hp <= 0) sealHole(h, p); }
  }
}
export function mechView(p) { // [parts, cooldown, wrecked, deployed mech's hp %]
  const v = mechOf(p);
  return [mechCode(p.mech), Math.max(0, Math.ceil((p.mechCd || 0) - now())), p.mechWreck ? 1 : 0, v ? Math.round(100 * v.hp / v.maxHp) : -1];
}
export function bugView() {
  const B = game.bugs;
  if (!B) return null;
  return { h: B.holes.map((h) => [h.id, Math.round(h.x), Math.round(h.y), h.hive ? -1 : Math.max(0, Math.round(100 * h.hp / BUG_HOLE_HP))]), b: B.brain, s: B.sealed, n: B.total, d: B.dead ? 1 : 0 };
}
