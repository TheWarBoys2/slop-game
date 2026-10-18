// Slop-Tech caches and office vaults: hack them open.
import { GEAR_KEYS } from "../items.js";
import { shock } from "../market.js";
import { advHacked } from "./adventure.js";
import { rectHitsCircle } from "./building.js";
import { now, pick } from "./config.js";
import { lootRarity, spawnZombie } from "./phases.js";
import { addGold, addXp, deed, feed, freeSpot, fullName, game, lootType, newWeapon, players, toast } from "./state.js";
import { world } from "./world.js";

// ---------------------------------------------------------------- Slop-Tech caches: hack them open
world.caches = [];
const HEX = ["1C", "55", "BD", "E9", "7A", "FF"];
export function spawnCaches(n) {
  for (let i = 0; i < n; i++) { const sp = freeSpot(40); world.caches.push({ id: world.nextId++, x: sp.x, y: sp.y }); }
  world.caches = [...world.caches.filter((c) => c.qid), ...world.caches.filter((c) => !c.qid).slice(-6)]; // Adventure's relays stay put
}
export function startHack(p, c) {
  const t = now();
  if (c.busy && c.busy !== p.id && players.get(c.busy)?.hack) return toast(p, "Someone's already hacking that.", "#bbb");
  const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => pick(HEX.slice(0, 5))));
  // build the target sequences from a real path through the grid, so every puzzle can be solved
  const path = []; let row = 0, col = (Math.random() * 5) | 0, used = new Set();
  for (let i = 0; i < 7; i++) {
    if (i % 2 === 0) { let c2; do c2 = (Math.random() * 5) | 0; while (used.has(row + "," + c2)); col = c2; }
    else { let r2; do r2 = (Math.random() * 5) | 0; while (used.has(r2 + "," + col)); row = r2; }
    used.add(row + "," + col); path.push(g[row][col]);
  }
  const seqs = [path.slice(0, 2), path.slice(1, 4), path.slice(2, 6)];
  if (p.hack) { const old = world.caches.find((q) => q.id === p.hack.cache) || termRt.get(p.hack.cache); if (old && old.busy === p.id) old.busy = 0; }
  c.busy = p.id;
  p.hack = { cache: c.id, g, seqs, buf: 7, until: t + 30 };
  p.pe.push({ k: "hack", g, seqs, buf: 7, time: 30 });
}
export function finishHack(p, m) {
  const h = p.hack; if (!h) return;
  p.hack = null;
  const c = world.caches.find((q) => q.id === h.cache) || termRt.get(h.cache); if (!c) return;
  c.busy = 0;
  if (m.cancel) return;
  // check the picks follow the rules: row 0 first, then alternate column / row, no cell twice
  const picks = Array.isArray(m.picks) ? m.picks.slice(0, h.buf) : [];
  let ok = true, r = 0, col = -1; const used = new Set(), codes = [];
  picks.forEach((pk, i) => {
    const [pr, pc] = Array.isArray(pk) ? pk.map((v) => v | 0) : [-1, -1];
    if (pr < 0 || pr > 4 || pc < 0 || pc > 4 || used.has(pr + "," + pc)) ok = false;
    if (i % 2 === 0 && pr !== r) ok = false;
    if (i % 2 === 1 && pc !== col) ok = false;
    used.add(pr + "," + pc); r = pr; col = pc; codes.push(h.g[pr]?.[pc]);
  });
  const late = now() > h.until + 1;
  const str = codes.join(" ");
  const solved = ok && !late ? h.seqs.filter((sq) => str.includes(sq.join(" "))).length : 0;
  if (!solved) {
    feed(`${fullName(p)} tripped a Slop-Tech alarm.`, "#ff6060");
    world.events.push({ k: "alarm", x: Math.round(c.x), y: Math.round(c.y) });
    shock(game.market, "SLOP", 0.03);
    if (game.mode !== "royale" || true) { for (let i = 0; i < 3 + players.size; i++) spawnZombie(Math.random() < 0.3 ? "runner" : "walker", c); spawnZombie("screamer", c); }
    return toast(p, late ? "Too slow. ALARM." : "Access denied. ALARM.", "#ff6060");
  }
  if (c.term) return termHacked(p, c, solved);
  world.caches = world.caches.filter((q) => q !== c);
  world.events.push({ k: "hacked", x: Math.round(c.x), y: Math.round(c.y), n: solved });
  shock(game.market, "SLOP", -0.025 * solved, solved >= 2 ? "Slop-Tech cache breached. Shareholders furious." : "");
  addXp(p, 10 * solved); deed("word", 3 * solved);
  addGold(p, 40 * solved, "Hacked a cache");
  p.gren = Math.min(9, p.gren + 1);
  if (solved >= 2) world.crates.push({ id: world.nextId++, x: c.x, y: c.y, w: newWeapon(lootType(), solved === 3 ? (Math.random() < 0.3 ? 3 : 2) : 1) });
  if (solved === 3) { p.molo = Math.min(9, p.molo + 2); feed(`${fullName(p)} cracked a Slop-Tech cache wide open.`, "#7dffb0"); }
  if (c.qid) advHacked(p, c, solved);
  toast(p, `ACCESS GRANTED (${solved}/3 daemons). ${solved >= 2 ? "Something good dropped out." : ""}`, "#7dffb0");
}
// ---------------------------------------------------------------- office vaults: hack enough of a block's terminals and its vault opens
// Each office block has a terminal on every floor above the lobby and one on the roof (town.js). Hacking OFFICE_NEED of them
// (same breach minigame as the caches) opens the steel vault in the lobby, which holds good gear. It all locks up again at dawn.
const OFFICE_NEED = 3;
export let OFFICES = [], termRt = new Map();
export function resetOffices() {
  for (const o of OFFICES) if (o.door && !world.WALLS.some((w) => w.kind === "vdoor" && w.bid === o.id)) { world.WALLS.push(o.door); world.mapVer++; world.mapDirty = true; }
  world.crates = world.crates.filter((c) => !c.vault); // whatever nobody took goes back in the safe
  OFFICES = world.WALLS.filter((w) => w.kind === "office").map((b) => ({ id: b.id, vault: b.vault, door: world.WALLS.find((w) => w.kind === "vdoor" && w.bid === b.id), terms: world.WALLS.filter((w) => w.kind === "term" && w.bid === b.id).map((w) => w.id), hacked: new Set(), open: false }));
  termRt = new Map(world.WALLS.filter((w) => w.kind === "term").map((w) => [w.id, { id: w.id, x: w.x + w.w / 2, y: w.y + w.h / 2, z: w.z0, term: w, busy: 0 }]));
}
export function nearTerm(p) {
  for (const c of termRt.values()) if (rectHitsCircle(c.term, p, 44) && Math.abs((p.z || 0) - c.z) < 30) return c;
  return null;
}
export function startTermHack(p, c) {
  const o = OFFICES.find((q) => q.id === c.term.bid);
  if (!o) return;
  if (o.open) return toast(p, "The vault downstairs is already open.", "#7dffb0");
  if (o.hacked.has(c.id)) return toast(p, `Already in. ${o.hacked.size}/${OFFICE_NEED} terminals hacked.`, "#7dffb0");
  startHack(p, c);
}
function termHacked(p, c, solved) {
  const o = OFFICES.find((q) => q.id === c.term.bid);
  if (!o || o.open) return;
  o.hacked.add(c.id);
  addXp(p, 8 * solved); deed("word", 2 * solved); addGold(p, 15 * solved, "Hacked an office terminal");
  world.events.push({ k: "hacked", x: Math.round(c.x), y: Math.round(c.y), n: solved, tz: c.z, of: [o.hacked.size, OFFICE_NEED] });
  if (o.hacked.size < OFFICE_NEED) return toast(p, `Terminal hacked: ${o.hacked.size}/${OFFICE_NEED}. The vault in the lobby opens at ${OFFICE_NEED}.`, "#7dffb0");
  o.open = true;
  if (o.door) { world.WALLS = world.WALLS.filter((w) => w !== o.door); world.mapVer++; world.mapDirty = true; }
  const v = o.vault, at = (dx, dy) => ({ id: world.nextId++, x: v.x + dx, y: v.y + dy, vault: o.id });
  world.crates.push({ ...at(-10, -6), w: newWeapon(lootType(), Math.random() < 0.25 ? 4 : 3) }); // a Legendary, sometimes a Mythic
  world.crates.push({ ...at(10, -6), w: newWeapon(lootType(), 2 + (Math.random() < 0.5 ? 1 : 0)) });
  world.crates.push({ ...at(0, 14), it: { id: pick(GEAR_KEYS), r: 3 } });
  world.events.push({ k: "vault", x: Math.round(v.x), y: Math.round(v.y) });
  shock(game.market, "SLOP", -0.04, "Office vault cracked. Insurers weep.");
  feed(`${fullName(p)} cracked an office vault. The good stuff is in the lobby.`, "#7dffb0");
  toast(p, "VAULT OPEN. Get down to the lobby.", "#7dffb0");
}
export function spawnCrates() { // town gets a trickle; the good stuff is out in the wild
  const n = 1 + Math.floor(players.size / 2);
  spawnCaches(game.mode === "royale" ? 4 : 2);
  for (let i = 0; i < n; i++) world.crates.push({ id: world.nextId++, ...freeSpot(), w: newWeapon(lootType(), lootRarity(game.night)) });
  for (let i = 0; i < 1; i++) world.crates.push({ id: world.nextId++, ...freeSpot(), it: { id: pick(game.waste && Math.random() < 0.4 ? ["gasmask", "hazmat"] : GEAR_KEYS), r: Math.min(3, lootRarity(game.night)) } });
  for (let i = 0; i < 1; i++) world.crates.push({ id: world.nextId++, ...freeSpot(), it: { id: pick(game.waste ? ["beans", "ration", "radaway", "iodine", "water"] : ["beans", "ration", "water", "cola", "bandage", "pie", "grog"]), n: 1 + (Math.random() < 0.4 ? 1 : 0) } });
}
