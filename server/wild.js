// The wild past the hedge, built chunk by chunk around the players.
import { GEAR_KEYS } from "../items.js";
import { CS, makeChunk, BIOMES } from "../world.js";
import { advTownAt } from "./adventure.js";
import { insideWall } from "./combat.js";
import { H, W, dist2, pick, rand } from "./config.js";
import { CHUNKS, OPEN, TOWN, inTownXY } from "./geometry.js";
import { lootRarity, nightType, spawnZombie } from "./phases.js";
import { game, lootType, newWeapon, players, toast } from "./state.js";
import { broadcastRaw } from "./tick.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- the wild, past the hedge
export function ensureChunks() {
  if (!OPEN() || !(game.phase === "day" || game.phase === "night" || game.phase === "intro")) return;
  const fresh = [], bio = [];
  for (const p of players.values()) {
    if (p.dead) continue;
    const pcx = Math.floor(p.x / CS), pcy = Math.floor(p.y / CS);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const cx = pcx + i, cy = pcy + j, key = cx + "," + cy;
      if (CHUNKS.has(key)) continue;
      if (cx * CS >= 0 && cy * CS >= 0 && (cx + 1) * CS <= W && (cy + 1) * CS <= H) { CHUNKS.set(key, { kind: "town" }); continue; }
      const c = makeChunk(world.MAP_SEED, cx, cy, TOWN, world.ADV_KEEP);
      CHUNKS.set(key, { kind: c.kind }); bio.push([cx, cy, c.kind]); // the client paints the ground to match
      for (const w of c.walls) w.id = world.wallId++;
      world.WALLS.push(...c.walls); fresh.push(...c.walls);
      for (const l of c.loot) { // something worth walking out here for. Better the further you go.
        const up = (Math.random() < Math.min(0.75, c.far / 7000) ? 1 : 0) + l.good, roll = Math.random();
        if (roll < 0.5) world.crates.push({ id: world.nextId++, x: l.x, y: l.y, w: newWeapon(lootType(), Math.min(4, lootRarity(game.night) + up)) });
        else if (roll < 0.75) world.crates.push({ id: world.nextId++, x: l.x, y: l.y, it: { id: pick(GEAR_KEYS), r: Math.min(4, lootRarity(game.night) + up) } });
        else world.crates.push({ id: world.nextId++, x: l.x, y: l.y, it: { id: pick(["beans", "ration", "water", "cola", "bandage", "medkit", "pack", "s_pumpkin", "s_melon", "s_corn", "s_strawberry"]), n: 1 + (Math.random() < 0.5 ? 1 : 0) } });
      }
    }
    // tell people where they've wandered to
    const own = CHUNKS.get(pcx + "," + pcy), atTown = game.mode === "adventure" ? advTownAt(p) : null, where = inTownXY(p.x, p.y) ? "town" : atTown ? "adv" + atTown.i : own && own.kind;
    if (where && where !== p.where) { if (p.where && atTown && where !== "town") toast(p, `Entering ${atTown.name}.`, "#ffe9a0"); else if (p.where && where !== "town" && BIOMES[where]) toast(p, `You wander into ${BIOMES[where].name}.`, "#b8e070"); else if (p.where && where === "town") toast(p, `Back in ${world.VALLEY}.`, "#ffe9a0"); p.where = where; }
  }
  if (fresh.length || bio.length) broadcastRaw(JSON.stringify({ t: "ck", seed: world.MAP_SEED, walls: fresh, bio }));
}
// the dead roam the wild, by day as well as night, and there are more of them the further out you go
export function wildTick(t) {
  if (!OPEN() || !(game.phase === "day" || game.phase === "night")) return;
  const live = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of live) {
    if (inTownXY(p.x, p.y, 250) || world.ADV_KEEP.some((b) => p.x > b.x - 250 && p.x < b.x + b.w + 250 && p.y > b.y - 250 && p.y < b.y + b.h + 250)) continue; // towns are safe-ish
    const far = Math.hypot(p.x - W / 2, p.y - H / 2), cap = Math.min(12, 2 + Math.floor(far / 1800)) + (game.phase === "night" ? 3 : 0);
    if (world.zombies.filter((z) => dist2(z, p) < 1400 * 1400).length >= cap || Math.random() < 0.35) continue;
    const a = rand(0, Math.PI * 2), d = rand(750, 1000), at = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
    if (inTownXY(at.x, at.y, 100) || insideWall(at.x, at.y, 10) || world.ADV_KEEP.some((b) => at.x > b.x - 100 && at.x < b.x + b.w + 100 && at.y > b.y - 100 && at.y < b.y + b.h + 100)) continue;
    const z = spawnZombie(nightType(Math.max(game.night, 1 + Math.floor(far / 2500)), false), at);
    if (!z) continue;
    z.wild = 1; z.aggro = p.id; z.aggroUntil = t + 30; const k = 1 + far / 9000; z.hp *= k; z.maxHp *= k;
  }
  // the wild doesn't keep the dead nobody is near
  world.zombies = world.zombies.filter((z) => !z.wild || z.keep || z.type === "boss" || live.some((p) => dist2(p, z) < 3200 * 3200));
}
