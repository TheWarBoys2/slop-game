// The bunker, the bomb and the Hearth Dome.
import { shock } from "../market.js";
import { ZTYPES } from "../data.js";
import { fires, killPlayer, underground } from "./combat.js";
import { HEARTH, NUKE_WARN, clamp, now, rand } from "./config.js";
import { LAKE, PLOTS, WOODEN, bunkerWall, damageWall } from "./map.js";
import { addRad } from "./needs.js";
import { VEHICLES, addGold, collide, deed, feed, freeSpot, fullName, game, players, toast } from "./state.js";
import { exitVehicle, hurtVehicle } from "./vehicles.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- the bunker and the bomb
export function enterBunker(p) {
  if (p.veh) exitVehicle(p);
  p.air = "bunker"; p.vx = p.vy = p.vz = 0; p.firing = false;
  const b = bunkerWall(); p.x = b.x + b.w / 2; p.y = b.y + b.h / 2; p.z = b.z1;
  toast(p, game.nuke ? "You climb down into the bunker and pull the hatch shut. Wait for the all-clear." : "You climb down into the bunker. It smells of tinned peaches. E to climb out.", "#c8d0a0");
  world.events.push({ k: "hatch", x: Math.round(p.x), y: Math.round(p.y) });
}
export function leaveBunker(p) {
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
export function radioNews() {
  if (game.mode === "adventure") return;
  if (game.mode === "royale" || !game.dome || game.dome.struck) return;
  const d = game.dome, line = RADIO[Math.min(game.night, RADIO.length - 1)];
  setTimeout(() => {
    feed(line, "#9fe0ff");
    if (d.have < d.cost) feed(`The Hearth Dome: ${d.have}/${d.cost}g. ${Math.max(0, FIRST_NUKE - game.night)} day${FIRST_NUKE - game.night === 1 ? "" : "s"} until the bombs can fall.`, "#9fe0ff");
  }, 6000);
}
// The war is coming. Everyone chips in at the Hearth; once it's paid for, the dome stops a nuke flattening the town.
export const DOME_COST = 1200, DOME_PER = 400, DOME_R = 1000, FIRST_NUKE = 5; // nothing falls before night 5
const domeK = () => (game.dome ? clamp(game.dome.have / game.dome.cost, 0, 1) : 0);
const inDome = (e) => Math.hypot(e.x - (HEARTH.x + HEARTH.w / 2), e.y - (HEARTH.y + HEARTH.h / 2)) < DOME_R;
const DOME_STAGES = ["", "The first pylon hums into life beside the Hearth.", "Two pylons up. The air round the Hearth tastes of pennies.", "Three pylons. Grubb says it's \"nearly a dome\". It's a triangle.", ""];
export function fundDome(p, amt) {
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
    world.events.push({ k: "banner", text: "THE HEARTH DOME IS UP", sub: "Stand inside it when the siren goes and the town survives a nuke. Each hit drains it by half." });
    world.events.push({ k: "dome", up: 1 }); feed(`${fullName(p)} paid the last of the Hearth Dome. It hums.`, "#9fe0ff");
  } else if (after > before) { feed(DOME_STAGES[after], "#9fe0ff"); world.events.push({ k: "dome", stage: after }); }
  else feed(`${fullName(p)} put ${amt}g towards the Hearth Dome`, "#9fe0ff");
}
export function nukeWarn(why) {
  if (game.nuke || game.mode === "royale" || !players.size) return;
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  let gz = freeSpot(40);
  for (let i = 0; i < 40; i++) { const c = freeSpot(40); if (Math.hypot(c.x - hc.x, c.y - hc.y) > 900) { gz = c; break; } }
  game.nuke = { at: now() + NUKE_WARN, x: gz.x, y: gz.y }; if (game.dome) game.dome.struck = true;
  world.events.push({ k: "banner", text: "☢ NUCLEAR LAUNCH DETECTED ☢", sub: `${why} Get to the bunker [E], down a cellar or a shelter into the tunnels, or deep into the lake. ${NUKE_WARN} seconds.` });
  world.events.push({ k: "siren" });
  feed(domeK() >= 1 ? "☢ Missile inbound. The Dome is up: get inside it, near the Hearth. Or the bunker, or deep underwater." : "☢ Missile inbound and the Hearth Dome isn't finished. Pay into it at the Hearth NOW, then get to the bunker or deep underwater.", "#9fff60");
  shock(game.market, "*", -0.15, "Missile warning: markets panic"); shock(game.market, "BNKR", 0.9, "Bunkr & Sons flooded with enquiries");
}
export function nukeBlast() {
  const N = game.nuke; game.nuke = null; game.waste = true;
  const k = domeK(), held = k >= 1, safe = (e) => held && inDome(e);
  world.events.push({ k: "nuke", x: Math.round(N.x), y: Math.round(N.y), dome: held ? 1 : 0 });
  for (const p of players.values()) {
    if (p.dead || p.air === "bunker") continue;
    if (safe(p)) { toast(p, "The sky goes white. The dome flickers... and holds.", "#9fe0ff"); addRad(p, 15); continue; }
    if (p.swim && p.z < -120) { toast(p, "The world above turns white. Down here, you're fine. Mostly.", "#9fff60"); addRad(p, 30); continue; }
    if (underground(p)) { toast(p, "The ground shakes and dust pours from the ceiling. The tunnels hold.", "#c8b48c"); addRad(p, 20); continue; }
    killPlayer(p, null, "vaporised by a nuclear bomb");
  }
  for (const z of world.zombies) if (underground(z)) continue; else if (ZTYPES[z.type].nukeProof) z.hp *= 0.5; else z.hp = 0;
  world.zombies = world.zombies.filter((z) => z.hp > 0);
  for (const w of [...world.WALLS]) if (WOODEN.has(w.kind) && w.kind !== "hwall" && !safe({ x: w.x + w.w / 2, y: w.y + w.h / 2 })) damageWall(w, w.kind === "house" ? 500 : 9999);
  for (const v of [...world.vehicles]) hurtVehicle(v, VEHICLES[v.kind].hp * 0.6, null);
  for (const pl of PLOTS) if (!safe(pl)) { pl.stage = 0; pl.prog = 0; }
  fires.clear();
  if (held) {
    game.dome.have = Math.floor(game.dome.cost / 2); game.flags.domeHeld = 1;
    world.events.push({ k: "banner", text: "THE DOME HELD", sub: `The Hearth survived. The dome is drained to half: top it up at the Hearth (${game.dome.cost - game.dome.have}g) before the next one.` });
    feed("The dome took the blast. Everything inside it is still standing.", "#9fe0ff");
  } else {
    // a half-built dome soaks some of it; no dome at all and the Hearth goes out
    game.hearth -= game.hearthMax * (1 - k) * 1.05 + (k > 0 ? 0 : game.hearth);
    if (game.dome) game.dome.have = 0;
    if (game.hearth <= 0) { game.flags.nuked = 1; world.events.push({ k: "banner", text: "THE HEARTH IS GONE", sub: "Nobody finished the dome." }); }
    else { game.hearth = Math.max(1, game.hearth); world.events.push({ k: "banner", text: "THE HALF-BUILT DOME BURNT OUT", sub: `It saved the Hearth, barely (${Math.round(game.hearth)} left). Rebuild it before the next one.` }); }
  }
  game.hot = [{ x: N.x, y: N.y, r: 460, s: 10 }];
  for (let i = 0, n = 0; i < 40 && n < 7; i++) { const c = freeSpot(40); if (safe(c)) continue; n++; game.hot.push({ x: c.x, y: c.y, r: rand(110, 220), s: rand(3, 7) }); }
  if (LAKE) game.hot.push({ x: LAKE.x + LAKE.w / 2, y: LAKE.y + LAKE.h / 2, r: Math.max(LAKE.w, LAKE.h) * 0.75, s: 3, lake: true });
  shock(game.market, "*", -0.45, "NUCLEAR DETONATION. Markets in freefall."); shock(game.market, "BNKR", 1.2, "Bunkr & Sons: 'We did tell you.'");
  if (game.hearth > 0) setTimeout(() => world.events.push({ k: "banner", text: "THE VALLEY IS A WASTELAND", sub: "Green means radiation. Gas masks and hazmat suits at the armoury, iodine and Rad-Away at Vex's. Tinned food is safe." }), 5000);
  if (game.mayor === "posad") { for (const q of players.values()) addGold(q, 150, "The saucers have landed"); feed("Comrade Posad was right: the saucers came. They mostly brought gold.", "#ff6060"); }
  world.mapDirty = true;
}
