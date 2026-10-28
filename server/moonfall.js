// Moonfall: some mornings a grinning moon turns up in the sky, and it's coming down. Three days and two nights
// to wake the four Giants sleeping at shrines out in the wild (north, east, south and west of town), or the
// valley is flattened at the end of the final night. A nod to The Legend of Zelda: Majora's Mask.
// Each Giant wakes when someone plays the Oath to Order at its shrine [E] and the party holds the stone circle
// while the moon's dead come for them. All four awake and they hold the moon up: big money, a Legendary each.
import { shock } from "../market.js";
import { explode, ignite } from "./combat.js";
import { FAST, H, HEARTH, MV, W, now, pick, rand } from "./config.js";
import { near } from "./geometry.js";
import { clearPatch } from "./map.js";
import { addStress } from "./needs.js";
import { endGame, nightType, spawnZombie } from "./phases.js";
import { addGold, addXp, deed, feed, fullName, game, lootType, newWeapon, players, toast } from "./state.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

const FORCE = !!process.env.SLOP_MOON;          // testing: the moon comes on the first dawn it can
const CHANCE = 0.15;                             // each dawn from the mode's moonFrom day, once a game
const HOLD = FAST ? 8 : 45;                      // seconds of holding the circle to wake a Giant
const RING = 190;                                // the stone circle's radius
const OUT = 1500;                                // how far past the edge of town each shrine is
const GIANTS = [
  { name: "Moor Giant", dir: "north", x: W / 2, y: -OUT, col: "#c08aff" },
  { name: "Orchard Giant", dir: "east", x: W + OUT, y: H / 2, col: "#ffd34d" },
  { name: "Bog Giant", dir: "south", x: W / 2, y: H + OUT, col: "#7dffb0" },
  { name: "Stone Giant", dir: "west", x: -OUT, y: H / 2, col: "#9fe0ff" },
];
// the Majora's Mask title cards: one for every dawn and dusk the moon is up
export const MOON_CARDS = ["Dawn of the First Day", "Night of the First Day", "Dawn of the Second Day", "Night of the Second Day", "Dawn of the Final Day", "Night of the Final Day"];
const GOSSIP = [
  "Old Giles: \"That moon's got a face on it. And it's looking at me.\"",
  "Father Aldous: \"Repent! Or at least get indoors. Not that indoors will help.\"",
  "Vex: \"Moon insurance, anyone? Very reasonable rates. Payable in advance.\"",
  "Haddock: \"Can't shoot a moon. I've checked. Twice.\"",
  "Morwen: \"The old songs say four Giants sleep at the edges of the valley. Wake them.\"",
];

const hc = () => ({ x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 });
const live = () => [...players.values()].filter((p) => !p.dead && !p.air);
const active = () => game.moon && !game.moon.fell && !game.moon.saved;

// how long until it lands, in Majora hours: 72 at the first dawn, 0 when it hits
function hoursLeft(t) {
  const M = game.moon, R = rules();
  let frac = 1;
  if (M.stage === 5) frac = Math.max(0, (M.impactAt - t) / R.night);
  else if (game.ends !== Infinity) frac = Math.max(0, Math.min(1, (game.ends - t) / (game.phase === "night" ? R.night : R.day)));
  else frac = 0.5; // a boss night has no clock; the moon waits for it
  return (5 - M.stage) * 12 + 12 * frac;
}

function startMoon() {
  const t = now();
  game.moon = { stage: 0, rocks: [], nextRock: t + 20, nextQuake: t, impactAt: 0, saved: 0, fell: false, shrines: [] };
  for (const [i, G] of GIANTS.entries()) {
    const box = { x: G.x - 260, y: G.y - 260, w: 520, h: 520 };
    world.ADV_KEEP.push(box); // the wild won't grow on it from now on
    clearPatch(box);          // and whatever's grown there already goes
    game.moon.shrines.push({ i, name: G.name, dir: G.dir, x: G.x, y: G.y, prog: 0, on: false, awake: false, next: 0, by: new Set() });
  }
  world.events.push({ k: "moon", say: "start" });
  world.events.push({ k: "banner", text: "THE MOON IS FALLING", sub: "Three days. Wake the four Giants at the shrines past the edge of the valley (🗿 on your map) before it lands." });
  feed(pick(GOSSIP), "#ffb070");
  feed("Four Giants sleep north, east, south and west of town. Play the Oath to Order at each shrine [E] and hold the circle.", "#c08aff");
  shock(game.market, "FARM", -0.15, "Moon spotted. Futures, generally, in doubt.");
}

// called at the end of every dawn (startDay)
export function moonDawn() {
  const M = game.moon;
  if (M && M.stage === 5 && active()) return impact(); // the fourth dawn never comes
  if (M && active()) { M.stage++; return card(M.stage); }
  const from = rules().moonFrom, day = game.night + 1;
  if (M || !from || !rules().waves || game.dinoDay) return; // once a game, and not on top of Dinosaur Day
  if (FORCE ? day >= 2 : day >= from && Math.random() < CHANCE) { startMoon(); card(0); }
}
// called at the end of every nightfall (startNight)
export function moonDusk() {
  const M = game.moon;
  if (!active()) return;
  M.stage++;
  if (M.stage === 5) M.impactAt = now() + rules().night;
  card(M.stage);
}
function card(stage) {
  world.events.push({ k: "moon", say: "card", text: MOON_CARDS[stage], hrs: (6 - stage) * 12 });
  if (stage === 4) feed(pick(GOSSIP), "#ffb070");
  if (stage === 5) world.events.push({ k: "banner", text: "THE FINAL NIGHT", sub: "Twelve hours remain. Wake the Giants, or say your goodbyes." });
}

// E at a shrine: play the Oath to Order and start holding the circle
export function moonUse(p) {
  const M = game.moon;
  if (!active()) return false;
  const s = M.shrines.find((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 150 * 150);
  if (!s) return false;
  if (s.awake) { toast(p, `The ${s.name} is awake, and waiting for its brothers.`, "#c08aff"); return true; }
  if (s.on) { toast(p, "Hold the circle! Stay inside the stones until the Giant wakes.", "#c08aff"); return true; }
  s.on = true; s.next = now() + 2;
  world.events.push({ k: "moon", say: "oath", x: Math.round(s.x), y: Math.round(s.y) });
  feed(`${fullName(p)} played the Oath to Order at the ${s.name}'s shrine. Hold the circle!`, "#c08aff");
  return true;
}

function wake(s, t) {
  const M = game.moon;
  s.awake = true; s.on = false; s.prog = 1;
  for (const z of world.zombies) if (z.moonOf === s.i + 1) z.burn = true; // the moon's dead crumble when a Giant stands up
  for (const p of players.values()) {
    if (s.by.has(p.id)) { addGold(p, 120, `Woke the ${s.name}`); addXp(p, 60); } else addGold(p, 30);
  }
  deed("soil", 15);
  const left = M.shrines.filter((q) => !q.awake).length;
  world.events.push({ k: "moon", say: "giant", x: Math.round(s.x), y: Math.round(s.y), left });
  world.events.push({ k: "banner", text: `THE ${s.name.toUpperCase()} AWAKENS`, sub: left ? `${left} more to wake.` : "All four are awake." });
  if (!left) saved(t);
}
function saved(t) {
  const M = game.moon;
  M.saved = t; M.rocks = [];
  const h = hc();
  for (const p of players.values()) {
    addGold(p, 300, "The Giants held up the moon"); addXp(p, 150);
    world.crates.push({ id: world.nextId++, x: h.x + rand(-160, 160), y: h.y + HEARTH.h / 2 + rand(70, 160), w: newWeapon(lootType(), 3) });
  }
  world.events.push({ k: "moon", say: "saved" });
  world.events.push({ k: "banner", text: "THE GIANTS HOLD UP THE MOON", sub: "They push it back where it belongs. There's a Legendary for each of you by the Hearth." });
  feed("The moon goes back up. Somewhere, a kid in a mask is very disappointed.", "#c08aff");
  shock(game.market, "FARM", 0.25, "Moon crisis over. Farmers plan for next week, cautiously.");
}
function impact() {
  const M = game.moon, h = hc();
  M.fell = true; M.rocks = [];
  world.events.push({ k: "moon", say: "fall" });
  world.events.push({ k: "nuke", x: Math.round(h.x), y: Math.round(h.y) }); // the white-out and the bang
  game.hearth = 0;
  endGame(false);
  game.ending = [`The moon fell on ${world.VALLEY}. ${M.shrines.filter((s) => s.awake).length} of the four Giants were awake to see it.`, ...game.ending];
  game.prev = `Last time, the moon fell on ${world.VALLEY}.`;
}

// every tick while the moon is up
export function moonTick(t, dt) {
  const M = game.moon;
  if (!M || !(game.phase === "day" || game.phase === "night")) return;
  if (M.saved) { if (t - M.saved > 30) game.moon = { ...M, shrines: [], gone: true }; return; } // the moon's back in the sky; keep the flag so it can't come again
  if (M.fell || M.gone) return;
  if (M.stage === 5 && t >= M.impactAt) return impact();
  const L = live();
  for (const s of M.shrines) {
    if (!s.on) continue;
    const inside = L.filter((p) => (p.x - s.x) ** 2 + (p.y - s.y) ** 2 < RING * RING && Math.abs(p.z) < 120);
    for (const p of inside) s.by.add(p.id);
    if (inside.length) s.prog += dt / HOLD * (1 + 0.15 * (inside.length - 1));
    else if ((s.prog -= dt / (HOLD * 2)) <= 0) { s.prog = 0; s.on = false; feed(`The ${s.name} has fallen back asleep. Play the Oath again [E].`, "#c08aff"); continue; }
    if (s.prog >= 1) { wake(s, t); continue; }
    // the moon sends its dead to stop you
    if (t > s.next) {
      s.next = t + rand(1.6, 3) / Math.max(1, Math.sqrt(inside.length || 1));
      const mine = world.zombies.filter((z) => z.moonOf === s.i + 1).length;
      if (mine < 5 + 2 * L.length) {
        const a = rand(0, Math.PI * 2), z = spawnZombie(nightType(Math.max(game.night, 3) + M.stage, false), { x: s.x + Math.cos(a) * 620, y: s.y + Math.sin(a) * 620 });
        if (z) { const tgt = inside[0] || L[0]; z.wild = 1; z.moonOf = s.i + 1; if (tgt) { z.aggro = tgt.id; z.aggroUntil = t + 60; } }
      }
    }
  }
  // pieces of the moon come down, more of them the closer it gets
  if (M.stage >= 2 && t > M.nextRock) {
    M.nextRock = t + (M.stage >= 5 ? rand(1.2, 2.6) : M.stage >= 4 ? rand(3, 6) : rand(7, 13));
    const p = L.length && Math.random() < 0.7 ? pick(L) : null, h = hc();
    const x = p ? p.x + rand(-450, 450) : h.x + rand(-1400, 1400), y = p ? p.y + rand(-450, 450) : h.y + rand(-1100, 1100);
    M.rocks.push({ x, y, at: t + 2.2 });
  }
  for (const m of M.rocks) if (t >= m.at) {
    m.done = true;
    const z = MV.floorAt(m.x, m.y, 4, 2000, near(m)).h;
    explode(m.x, m.y, z + 10, 130, 60, null, "hit by a piece of the moon", 1);
    for (let i = 0; i < 2; i++) ignite(m.x + rand(-50, 50), m.y + rand(-50, 50), z + 30, 0, 2, true);
    world.events.push({ k: "meteor", x: Math.round(m.x), y: Math.round(m.y), z: Math.round(z) });
  }
  M.rocks = M.rocks.filter((m) => !m.done);
  // the final night: the ground shakes and nobody sleeps
  if (M.stage === 5 && t > M.nextQuake) {
    M.nextQuake = t + rand(4, 7);
    world.events.push({ k: "quake" });
    for (const p of L) addStress(p, 2);
  }
}

export function moonView(t) {
  const M = game.moon, r = Math.round;
  if (!M || M.gone) return null;
  return {
    s: M.stage, h: M.fell ? 0 : M.saved ? -1 : +hoursLeft(t).toFixed(2), sv: M.saved ? +(t - M.saved).toFixed(1) : -1, f: M.fell ? 1 : 0,
    sh: M.shrines.map((s) => [r(s.x), r(s.y), r(s.prog * 100), s.awake ? 1 : 0, s.on ? 1 : 0]),
    r: M.rocks.map((m) => [r(m.x), r(m.y), +(m.at - t).toFixed(2)]),
  };
}

// testing only (SLOP_TP): "now" brings the moon up, "wake" wakes every Giant but one, "fall" drops it
export function moonTest(p, what) {
  const t = now();
  if (what === "now" && !game.moon) { startMoon(); card(0); }
  if (!active()) return;
  if (what === "wake") for (const s of game.moon.shrines.slice(1)) if (!s.awake) { s.by.add(p.id); wake(s, t); }
  if (what === "fall") impact();
  if (what === "night") { game.moon.stage = 5; game.moon.impactAt = t + 5; }
}
