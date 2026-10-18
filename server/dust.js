// Dust II: zombie terrorists, a bomb, two sites.
import { inDust, siteXY, routes as dustRoutes, tSpawn, ctSpawn } from "../dust2.js";
import { hurtPlayer } from "./combat.js";
import { dist2, now, rand } from "./config.js";
import { near } from "./geometry.js";
import { boxDist } from "./map.js";
import { lootRarity, spawnZombie } from "./phases.js";
import { addGold, addXp, feed, fullName, game, lootType, newWeapon, players, toast } from "./state.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- Dust II: zombie terrorists, a bomb, two sites
// Press E at the radio in CT spawn. Ten seconds to buy (B opens Haddock's stock anywhere on the map), then the terrorists
// come out of T spawn and walk the bomb to A or B. Kill the carrier and another picks it up. If it's planted, hold E on it
// for five seconds to defuse. Win: gold for everyone on the map and a good crate. Lose: a very big bang.
const DUST_BUY = 10, DUST_PLANT = 3, DUST_FUSE = 40, DUST_DEFUSE = 5, DUST_COOL = 45, DUST_PAY = 120, DUST_XP = 50;
function dustPlayers() { return [...players.values()].filter((q) => !q.dead && inDust(q, 200)); }
export function dustUse(p) {
  const D = game.dust, t = now();
  if (D && D.st === "planted" && Math.hypot(p.x - D.bx, p.y - D.by) < 70 && Math.abs((p.z || 0) - D.bz) < 60) { // defuse
    if (D.def && D.def.pid !== p.id && players.has(D.def.pid)) { toast(p, "Someone's already on the bomb. Cover them.", "#ffd34d"); return true; }
    if (!D.def) { D.def = { pid: p.id, until: t + DUST_DEFUSE }; toast(p, "Defusing... stay on it.", "#9fe0ff"); }
    return true;
  }
  const radio = near(p).find((w) => w.kind === "radio");
  if (!radio || boxDist(radio, p.x, p.y, (p.z || 0) + 20) > 60) return false;
  if (D && D.st !== "post") { toast(p, "A round's already on.", "#bbb"); return true; }
  if (D && t < D.next) { toast(p, `The radio crackles. Next round in ${Math.ceil(D.next - t)}s.`, "#bbb"); return true; }
  game.dust = { st: "buy", n: (D ? D.n : 0) + 1, wins: D ? D.wins : 0, losses: D ? D.losses : 0, site: Math.random() < 0.5 ? "A" : "B", ends: t + DUST_BUY, bx: 0, by: 0, bz: 0, carrier: 0, def: null, left: 0, plantAt: 0 };
  world.events.push({ k: "dust", say: "go", text: "ROUND START", sub: `Dust II, round ${game.dust.n}. You have ${DUST_BUY}s to buy [B]. The terrorists are bringing a bomb. Defend A and B.` });
  feed(`${fullName(p)} started a round on Dust II`, "#e0c080");
  return true;
}
function dustSpawn(D) {
  const n = Math.min(20, 6 + 3 * Math.max(1, dustPlayers().length)), site = siteXY(D.site), rts = dustRoutes(D.site);
  for (let i = 0; i < n; i++) {
    const at = tSpawn(), z = spawnZombie(Math.random() < 0.3 ? "runner" : "walker", at);
    if (!z) continue;
    z.x = at.x; z.y = at.y; z.dust = 1; z.route = [...rts[i % rts.length], site];
    if (i === 0) { z.bomb = 1; D.carrier = z.id; D.bx = z.x; D.by = z.y; }
  }
  D.left = n;
}
function dustEnd(D, ctWin, why) {
  D.st = "post"; D.next = now() + DUST_COOL; D.def = null; D.carrier = 0; D.plantAt = 0;
  world.zombies = world.zombies.filter((z) => !z.dust);
  if (ctWin) {
    D.wins++;
    for (const q of dustPlayers()) { addGold(q, DUST_PAY, "Round won"); addXp(q, DUST_XP); }
    const c = ctSpawn(); world.crates.push({ id: world.nextId++, x: c.x + rand(-40, 40), y: c.y + 30, w: newWeapon(lootType(), Math.min(4, lootRarity(game.night) + 2)) });
    world.events.push({ k: "dust", say: "ct", text: "COUNTER-TERRORISTS WIN", sub: `${why} ${DUST_PAY}g each, and there's a crate at CT spawn. ${D.wins}-${D.losses}.` });
  } else {
    D.losses++;
    world.events.push({ k: "dust", say: "t", text: "TERRORISTS WIN", sub: `${why} ${D.wins}-${D.losses}. The radio's at CT spawn when you want another go.` });
  }
}
export function dustTick(t, dt) {
  const D = game.dust; if (!D || D.st === "post") return;
  if (D.st !== "buy" && !dustPlayers().length) return dustEnd(D, false, "Everyone left the map.");
  if (D.st === "buy") { if (t >= D.ends) { D.st = "live"; dustSpawn(D); world.events.push({ k: "dust", say: "move", text: "", sub: "" }); } return; }
  const mine = world.zombies.filter((z) => z.dust && z.hp > 0); D.left = mine.length;
  if (D.st === "live") {
    if (!mine.length) return dustEnd(D, true, "Every terrorist is dead.");
    let c = mine.find((z) => z.bomb);
    if (!c) { // the carrier's down: the nearest terrorist goes to pick the bomb up
      c = mine.sort((a, b) => dist2(a, { x: D.bx, y: D.by }) - dist2(b, { x: D.bx, y: D.by }))[0];
      c.bomb = 1; c.route = [{ x: D.bx, y: D.by }, siteXY(D.site)]; D.carrier = c.id; D.plantAt = 0;
      world.events.push({ k: "feed", text: "The bomb carrier is down. Another one's going for the bomb.", color: "#e0c080" });
    }
    const site = siteXY(D.site), holding = dist2(c, { x: D.bx, y: D.by }) < 60 * 60;
    if (holding) { D.bx = c.x; D.by = c.y; D.bz = c.z || 0; }
    if (holding && dist2(c, site) < 75 * 75) { // planting: it stands still for a moment
      if (!D.plantAt) { D.plantAt = t + DUST_PLANT; c.stun = t + DUST_PLANT + 0.2; }
      if (t >= D.plantAt) {
        D.st = "planted"; D.ends = t + DUST_FUSE; c.bomb = 0; D.carrier = 0; D.plantAt = 0;
        for (const z of mine) z.route = [{ x: site.x + rand(-140, 140), y: site.y + rand(-140, 140) }]; // and now they guard it
        world.events.push({ k: "dust", say: "planted", text: `BOMB PLANTED AT ${D.site}`, sub: `${DUST_FUSE} seconds. Get to it and hold E for ${DUST_DEFUSE}s to defuse.` });
      }
    } else D.plantAt = 0;
  } else if (D.st === "planted") {
    if (D.def) {
      const q = players.get(D.def.pid);
      if (!q || q.dead || Math.hypot(q.x - D.bx, q.y - D.by) > 80) { if (q) toast(q, "You came off the bomb.", "#f88"); D.def = null; }
      else if (t >= D.def.until) return dustEnd(D, true, `${fullName(q)} defused the bomb.`);
    }
    if (t >= D.ends) {
      world.events.push({ k: "boom", x: D.bx, y: D.by, z: D.bz + 20, r: 420 });
      for (const q of players.values()) { const d = Math.hypot(q.x - D.bx, q.y - D.by); if (!q.dead && d < 520) hurtPlayer(q, 260 * (1 - d / 700), null, "blown up on Dust II"); }
      return dustEnd(D, false, `The bomb went off at ${D.site}.`);
    }
  }
}
export function dustView(t) {
  const D = game.dust; if (!D) return null;
  const left = D.st === "buy" || D.st === "planted" ? Math.max(0, +(D.ends - t).toFixed(1)) : D.st === "post" ? Math.max(0, Math.ceil((D.next || 0) - t)) : 0;
  return [D.st, D.site, Math.round(D.bx), Math.round(D.by), Math.round(D.bz), left, D.def ? +Math.min(1, 1 - (D.def.until - t) / DUST_DEFUSE).toFixed(2) : -1, D.left, D.wins, D.losses, D.plantAt ? 1 : 0, D.def ? D.def.pid : 0];
}
