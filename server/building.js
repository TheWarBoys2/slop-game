// Base building: walls, spikes, turrets, lamps.
import { hurtPlayer, hurtZombie } from "./combat.js";
import { H, TEST_DMG, W, clamp, dist2, own } from "./config.js";
import { OPEN, WELL } from "./geometry.js";
import { PLOTS } from "./map.js";
import { GRID, PIECES, VEHICLES, deed, game, players, price, rayRect, toast } from "./state.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- base building
export function rectHitsCircle(b, c, r) { const cx = clamp(c.x, b.x, b.x + b.w), cy = clamp(c.y, b.y, b.y + b.h); return (c.x - cx) ** 2 + (c.y - cy) ** 2 < r * r; }
export function placePiece(p, kind, x, y, free) {
  const def = own(PIECES, kind);
  if (!def) return false;
  const fail = (msg) => { if (p) toast(p, msg, "#f88"); return false; };
  x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID;
  const b = { id: world.nextId++, kind: "built", bk: kind, x, y, w: GRID, h: GRID, z0: 0, z1: def.z1 || 10, hp: def.hp, maxHp: def.hp, owner: p ? p.id : 0, uses: def.uses || 0, nextShot: 0, a: 0 };
  const mid = { x: x + GRID / 2, y: y + GRID / 2 };
  if (!OPEN() && (x < 40 || y < 40 || x + GRID > W - 40 || y + GRID > H - 40)) return fail("Can't build at the edge of the world.");
  if (p && !free) {
    if (world.builds.filter((q) => q.owner === p.id).length >= 25) return fail("You've built enough. 25 pieces max.");
    if (dist2(mid, p) > 280 * 280) return fail("Too far away to build there.");
    if (p.gold < price(p, def.cost)) return fail(`${def.name} costs ${price(p, def.cost)}g`);
  }
  const hit = (o) => x < o.x + o.w && x + GRID > o.x && y < o.y + o.h && y + GRID > o.y;
  if (world.WALLS.some(hit) || world.builds.some(hit)) return fail("Something's already there.");
  if (PLOTS.some((pl) => rectHitsCircle(b, pl, 30))) return fail("Not on the crops!");
  if (game.mode === "story" && world.NPC_POS.some((n) => rectHitsCircle(b, n, 22))) return fail("Somebody is standing there.");
  if (rectHitsCircle(b, WELL, 30)) return fail("Not on the well.");
  if (def.solid) {
    if ([...players.values()].some((q) => !q.dead && !q.air && rectHitsCircle(b, q, 16))) return fail("Someone's in the way.");
    if (world.zombies.some((z) => rectHitsCircle(b, z, z.r)) || world.vehicles.some((v) => rectHitsCircle(b, v, VEHICLES[v.kind].r))) return fail("Something's in the way.");
  }
  if (p && !free) { const cost = price(p, def.cost); p.gold -= cost; deed("soil", 3); deed("coin", cost / 50); }
  world.builds.push(b);
  if (def.solid) world.WALLS.push(b);
  if (p) { p.st.built = (p.st.built || 0) + 1; world.events.push({ k: "built", x: mid.x, y: mid.y }); }
  return true;
}
function breakPiece(b) {
  world.builds = world.builds.filter((q) => q !== b);
  world.WALLS = world.WALLS.filter((q) => q !== b);
  world.events.push({ k: "land", x: b.x + GRID / 2, y: b.y + GRID / 2 });
}
export function hurtPiece(b, dmg) { b.hp -= dmg; world.events.push({ k: "bhit", id: b.id }); if (b.hp <= 0) breakPiece(b); }
export function buildTick(t) {
  for (const b of [...world.builds]) {
    const mid = { x: b.x + GRID / 2, y: b.y + GRID / 2 }, owner = players.get(b.owner) || null;
    if (b.bk === "spikes") {
      for (const z of world.zombies) if (z.hp > 0 && !z.burn && (z.spiked || 0) < t && rectHitsCircle(b, z, z.r * 0.8)) { z.spiked = t + 0.6; z.stun = Math.max(z.stun, t + 0.25); hurtZombie(z, 30 * game.mods.dmg, owner); b.uses--; }
      if (game.mode === "royale") for (const q of players.values()) if (q !== owner && !q.dead && !q.air && !q.veh && (q.spiked || 0) < t && rectHitsCircle(b, q, 12)) { q.spiked = t + 0.8; hurtPlayer(q, 15, owner, "spiked"); b.uses--; }
      if (b.uses <= 0) breakPiece(b);
    } else if (b.bk === "turret" && t >= b.nextShot) {
      const def = PIECES.turret;
      let best = null, bd = def.range * def.range;
      const blocked = (e) => { const dx = e.x - mid.x, dy = e.y - mid.y, d = Math.hypot(dx, dy) || 1; for (const w of world.WALLS) if (w !== b && (w.z1 ?? 60) > 30 && rayRect(mid.x, mid.y, dx / d, dy / d, w) < d - 20) return true; return false; };
      for (const z of world.zombies) { const d = dist2(z, mid); if (z.hp > 0 && !z.burn && d < bd && !blocked(z)) { bd = d; best = z; } }
      if (game.mode === "royale") for (const q of players.values()) { const d = dist2(q, mid); if (q !== owner && !q.dead && !q.air && d < bd && !blocked(q)) { bd = d; best = q; } }
      if (best) {
        b.a = Math.atan2(best.y - mid.y, best.x - mid.x); b.nextShot = t + 1 / def.rate;
        const sx = mid.x + Math.cos(b.a) * 22, sy = mid.y + Math.sin(b.a) * 22;
        world.events.push({ k: "tr", x1: sx, y1: sy, x2: best.x, y2: best.y, c: "smg", m: 0 });
        if (best.type) hurtZombie(best, def.dmg * game.mods.dmg * TEST_DMG, owner); else hurtPlayer(best, def.dmg * 0.6, owner, "shot by a turret");
      }
    }
  }
}
