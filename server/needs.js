// Infection, symptoms, and bodily needs: hunger, thirst, bladder, radiation, stress.
import { ITEMS, gearSum } from "../items.js";
import { hurtZombie, insideWall, killPlayer } from "./combat.js";
import { FAST, FORCE_SYM, H, HEARTH, HEARTH_HEAL, HEARTH_HEAL_R, MV, W, clamp, dist2, now, pick } from "./config.js";
import { useItem } from "./economy.js";
import { BALL, PITCH, PLOTS } from "./map.js";
import { VEHICLES, addGold, deed, feed, fullName, game, maxHp, players, toast } from "./state.js";
import { vehOf } from "./vehicles.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

// ---------------------------------------------------------------- infection and bodily needs
// A bite can infect you. Infection cycles through symptoms until dawn, an antidote, or it wears off.
// "second": you see yourself through someone else's eyes. "keys": your controls rearrange themselves. "runs": self-explanatory.
const SYMPTOMS = {
  second: "Second person. You are no longer the main character. You are being watched.",
  keys: "Your fingers forget. Forward is P, back is INSERT, left is ALT. There is no right.",
  runs: "Your stomach makes a noise like a drain. Find somewhere private. Soon.",
};
export function infect(p) {
  if (p.inf || p.dead || now() < (p.immune || 0)) return; // a fresh antidote keeps working for a while
  p.inf = { until: now() + 40, sym: "", next: 0 };
  nextSymptom(p);
  feed(`${fullName(p)} got bitten and doesn't look well.`, "#9fdc5a");
}
export function nextSymptom(p) {
  const opts = Object.keys(SYMPTOMS).filter((k) => k !== p.inf.sym);
  p.inf.sym = SYMPTOMS[FORCE_SYM] ? FORCE_SYM : pick(opts); p.inf.next = now() + 20;
  p.pe.push({ k: "sym", sym: p.inf.sym, text: SYMPTOMS[p.inf.sym] });
}
export function cure(p, why) { if (!p.inf) return; p.inf = null; p.pe.push({ k: "sym", sym: "", text: why }); }
// stress: nights, wounds, screams and dead friends wind you up. Football is the only real cure.
export function stress(p, dt, t) {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let d = 0;
  if (game.phase === "night") d += 0.17 + (game.fog ? 0.12 : 0) + (game.dino ? 0.1 : 0);
  else if (game.phase === "royale") d += 0.25;
  else d -= 0.15;
  if (dist2(p, hc) < 260 * 260) d -= 0.3;
  // the Hearth's warmth slowly heals anyone resting close to it (not while you're being chewed on)
  p.warm = rules().hearth && dist2(p, hc) < HEARTH_HEAL_R * HEARTH_HEAL_R && p.hp < maxHp(p) && t - (p.lastHurt || 0) > 3;
  if (p.warm) p.hp = Math.min(maxHp(p), p.hp + HEARTH_HEAL * dt);
  p.stress = clamp((p.stress || 0) + d * dt * (FAST ? 4 : 1), 0, 100);
  if (p.stress >= 60 && !p.warnStress) { p.warnStress = true; toast(p, "You're getting stressed. Your aim is shaking. Go and kick a football about.", "#ff9a60"); }
  if (p.stress < 45) p.warnStress = false;
  if (p.stress >= 100 && !(t < p.meltdown)) {
    p.meltdown = t + 6; p.stress = 75;
    feed(`${fullName(p)} is having a complete meltdown.`, "#ff9a60");
    world.events.push({ k: "say", id: p.id, text: pick(["I CAN'T DO THIS ANYMORE", "WHY ARE THERE SO MANY OF THEM", "I JUST WANTED TO GROW TURNIPS", "AAAAAAAAAAAAAA"]) });
    toast(p, "MELTDOWN. Your hands are shaking too much to shoot. Play some football.", "#ff6040");
  }
}
export function addStress(p, n) { if (p && !p.dead) p.stress = clamp((p.stress || 0) + n, 0, 100); }
export function ballTick(t, dt) {
  if (!PITCH) return;
  const cx = PITCH.x + PITCH.w / 2, cy = PITCH.y + PITCH.h / 2;
  if (BALL.resetAt && t > BALL.resetAt || (!BALL.x && !BALL.y)) { Object.assign(BALL, { x: cx, y: cy, z: 40, vx: 0, vy: 0, vz: 0, resetAt: 0 }); }
  BALL.vz -= MV.GRAV * 0.8 * dt;
  const nx = BALL.x + BALL.vx * dt, ny = BALL.y + BALL.vy * dt, nz = BALL.z + BALL.vz * dt;
  if (nx < 10 || nx > W - 10 || insideWall(nx, BALL.y, nz + 8)) BALL.vx = -BALL.vx * 0.7; else BALL.x = nx;
  if (ny < 10 || ny > H - 10 || insideWall(BALL.x, ny, nz + 8)) BALL.vy = -BALL.vy * 0.7; else BALL.y = ny;
  const fl = MV.floorAt(BALL.x, BALL.y, 6, BALL.z + 4, world.WALLS).h;
  if (nz <= fl) { BALL.z = fl; BALL.vz = Math.abs(BALL.vz) > 80 ? -BALL.vz * 0.55 : 0; const f = Math.pow(0.35, dt); BALL.vx *= f; BALL.vy *= f; } else BALL.z = nz;
  for (const p of players.values()) {
    if (p.dead || p.air || p.veh || t < (p.kickAt || 0)) continue;
    const dx = BALL.x - p.x, dy = BALL.y - p.y, d = Math.hypot(dx, dy);
    if (d > 30 || BALL.z > p.z + 40 || BALL.z + 12 < p.z) continue;
    const spd = Math.max(260, Math.hypot(p.vx, p.vy) * 1.7), ux = dx / (d || 1), uy = dy / (d || 1);
    BALL.vx = ux * spd; BALL.vy = uy * spd; BALL.vz = 150 + (p.gr ? 0 : 120); BALL.last = p.id;
    p.kickAt = t + 0.25; addStress(p, -5); p.st.kicks = (p.st.kicks || 0) + 1;
    world.events.push({ k: "ballkick", x: Math.round(BALL.x), y: Math.round(BALL.y) });
  }
  // goal?
  if (!BALL.resetAt && BALL.z < 62 && Math.abs(BALL.y - cy) < 60 && (BALL.x < PITCH.x - 2 || BALL.x > PITCH.x + PITCH.w + 2) && BALL.x > PITCH.x - 60 && BALL.x < PITCH.x + PITCH.w + 60) {
    BALL.resetAt = t + 2.5;
    const sc = players.get(BALL.last);
    world.events.push({ k: "banner", text: "GOOOOAL!", sub: sc ? `${fullName(sc)} scores! Everyone on the pitch feels much calmer.` : "Nobody knows who scored. Calming, somehow." });
    world.events.push({ k: "goal", x: Math.round(BALL.x), y: Math.round(BALL.y) });
    for (const q of players.values()) if (Math.hypot(q.x - cx, q.y - cy) < 700) addStress(q, -35);
    if (sc) { sc.stress = 0; addGold(sc, 20, "Goal!"); sc.st.goals = (sc.st.goals || 0) + 1; }
  }
}
export function needs(p, dt, t) {
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
export function addRad(p, n) { if (!p.dead) p.rad = clamp(p.rad + n * (1 - Math.min(0.9, gearSum(p.gear, "rad"))), 0, 100); }
function accident(p, kind) {
  if (kind === "pee") { p.bl = 0; p.warnbl = false; p.soggy = now() + 20; feed(`${fullName(p)} wet themselves in front of everyone.`, "#e8d84a"); }
  else { p.bw = 0; p.warnbw = false; p.soggy = now() + 35; feed(`${fullName(p)} soiled themselves. The flies have found a new favourite.`, "#a0703a"); }
  world.events.push({ k: "mess", x: Math.round(p.x), y: Math.round(p.y), kind, big: 1 });
  p.pe.push({ k: "accident", kind });
}
export function relieve(p) {
  const t = now();
  const v = vehOf(p), flying = v && VEHICLES[v.kind].air && (v.z || 0) > 30;
  if (p.dead || p.air || (p.veh && !flying) || t < p.going || game.phase === "intro") return;
  const kind = p.bw >= p.bl ? "poo" : "pee";
  if (Math.max(p.bl, p.bw) < 25) return toast(p, "You don't need to go. You try anyway. Nothing.", "#bbb");
  p.going = t + (kind === "poo" ? 2.2 : 1.4); p.goKind = kind;
  setTimeout(() => {
    if (p.dead || !players.has(p.id)) return;
    if (kind === "pee") { p.bl = 0; p.warnbl = false; } else { p.bw = 0; p.warnbw = false; }
    const v2 = vehOf(p), air = v2 && VEHICLES[v2.kind].air && (v2.z || 0) > 30;
    world.events.push({ k: "mess", x: Math.round(p.x), y: Math.round(p.y), kind, ...(air ? { big: 1, drop: Math.round(v2.z) } : {}) });
    if (air) bombsAway(p, kind);
    if (fertilise(p, kind, air ? 140 : 90)) return;
    if (!air) toast(p, kind === "pee" ? "Ahh. Relief." : "Much better. Don't look behind you.", "#8f8");
  }, (p.going - t) * 1000);
}
// your business, applied to the farm: poo grows a crop a whole stage and makes it yield one extra; pee waters it
function fertilise(p, kind, r) {
  const plots = PLOTS.filter((pl) => (pl.stage === 1 || pl.stage === 2) && dist2(pl, p) < r * r);
  if (!plots.length) return false;
  for (const pl of plots) { if (kind === "poo") { pl.stage++; pl.prog = 0; pl.fert = true; } else pl.prog = Math.min(0.99, pl.prog + 0.5); }
  deed("soil", kind === "poo" ? 3 : 1);
  toast(p, kind === "poo" ? `Fertilised ${plots.length > 1 ? plots.length + " crops" : "the crop"}: a whole stage of growth, and one extra at harvest. Nature is disgusting.` : `Watered ${plots.length > 1 ? plots.length + " crops" : "the crop"}. They perk right up.`, "#7fd34d");
  return true;
}
// from a helicopter, it lands on whoever is underneath
function bombsAway(p, kind) {
  const R = 70; let zs = 0, mates = [];
  for (const z of world.zombies) if (z.hp > 0 && dist2(z, p) < (R + z.r) ** 2) { hurtZombie(z, kind === "poo" ? 40 : 15, p); z.stun = Math.max(z.stun || 0, now() + 1.5); zs++; }
  for (const q of players.values()) if (q !== p && !q.dead && !q.air && !q.veh && dist2(q, p) < R * R) { mates.push(q); toast(q, `${fullName(p)} just ${kind === "poo" ? "pooed" : "peed"} on you from a helicopter.`, "#c8a050"); addStress(q, 15); if (kind === "poo") q.bile = now() + 6; }
  if (mates.length) { p.heat += 25 * mates.length; feed(`${fullName(p)} ${kind === "poo" ? "pooed" : "peed"} on ${mates.map(fullName).join(" and ")} from a helicopter`, "#c8a050"); }
  toast(p, mates.length ? "Direct hit. The police would like a word." : zs ? `Bombs away! ${zs} zombie${zs > 1 ? "s" : ""} hit.` : "Bombs away!", "#c8a050");
}
