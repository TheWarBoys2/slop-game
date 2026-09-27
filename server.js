// SLOP VALLEY — game server. Run with `bun server.js [port]`.
// Serves the browser client and runs the whole game authoritatively.
import indexHtml from "./public/index.html" with { type: "text" };
import gameJs from "./public/game.js" with { type: "text" };
import os from "node:os";

const PORT = Number(process.argv[2] || process.env.PORT || 7777);
const TICK_RATE = 30;
const SNAP_EVERY = 2; // 15 snapshots/sec
const FAST = !!process.env.SLOP_FAST; // testing only: short phases
const DAY_LEN = FAST ? 4 : 45;
const NIGHT_LEN = FAST ? 8 : 60;
const LAST_NIGHT = 5;

// ---------------------------------------------------------------- map
const W = 2400, H = 1800;
const HEARTH = { x: 1120, y: 840, w: 160, h: 120 };
const WALLS = [
  HEARTH,
  { x: 300, y: 250, w: 220, h: 160 }, { x: 1850, y: 250, w: 240, h: 170 },
  { x: 300, y: 1350, w: 200, h: 180 }, { x: 1880, y: 1350, w: 220, h: 160 },
  { x: 1050, y: 330, w: 300, h: 90 }, { x: 1050, y: 1420, w: 300, h: 80 },
  { x: 600, y: 1100, w: 80, h: 80 }, { x: 1700, y: 520, w: 90, h: 70 },
  { x: 850, y: 1580, w: 70, h: 70 }, { x: 1520, y: 1220, w: 70, h: 70 },
  { x: 650, y: 560, w: 20, h: 160 }, { x: 1730, y: 1000, w: 20, h: 160 },
];
const PLOTS = [];
for (const baseX of [830, 1390]) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
  PLOTS.push({ x: baseX + c * 64 + 28, y: 800 + r * 64 + 28, stage: 0, prog: 0, fast: false, owner: 0 });

// ---------------------------------------------------------------- data
const WEAPONS = {
  pistol:  { name: "Pistol",     dmg: 22,  rate: 3.5, spread: 0.035, range: 700,  pellets: 1, mag: 12, reload: 1.2 },
  smg:     { name: "SMG",        dmg: 14,  rate: 11,  spread: 0.09,  range: 600,  pellets: 1, mag: 30, reload: 2.0 },
  shotgun: { name: "Shotgun",    dmg: 13,  rate: 1.1, spread: 0.26,  range: 380,  pellets: 8, mag: 6,  reload: 2.4 },
  rifle:   { name: "Rifle",      dmg: 30,  rate: 7,   spread: 0.05,  range: 900,  pellets: 1, mag: 30, reload: 2.3 },
  sniper:  { name: "Sniper",     dmg: 130, rate: 0.8, spread: 0.004, range: 1600, pellets: 1, mag: 5,  reload: 3.0, pierce: true },
  staff:   { name: "Fire Staff", dmg: 45,  rate: 1.5, spread: 0.02,  range: 700,  pellets: 1, mag: 10, reload: 2.0, boom: 90 },
};
const LOOT_TYPES = ["smg", "shotgun", "rifle", "sniper", "staff"];
const RARITY = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_MULT = [1, 1.2, 1.4, 1.7];
const ENH_NAMES = ["", "PRI", "DUO", "TRI", "TET", "PEN"];
const ENH_COST = [40, 80, 140, 220, 320];
const ENH_CHANCE = [0.9, 0.7, 0.5, 0.3, 0.15];

const CLASSES = {
  fighter: { name: "Fighter", hp: 150, speed: 1.0,  start: "smg" },
  rogue:   { name: "Rogue",   hp: 90,  speed: 1.2,  start: null },
  wizard:  { name: "Wizard",  hp: 90,  speed: 1.0,  start: "staff" },
  farmer:  { name: "Farmer",  hp: 110, speed: 1.0,  start: "shotgun" },
  gaffer:  { name: "Gaffer",  hp: 100, speed: 1.05, start: null },
};
const TRAITS = {
  Strong:   { epithet: "the Strong", hp: 25 },
  Swift:    { epithet: "the Swift", speed: 0.12 },
  Greedy:   { epithet: "the Greedy", gold: 0.25 },
  Craven:   { epithet: "the Craven", speed: 0.2, dmg: -0.15 },
  Wrathful: { epithet: "the Wrathful", dmg: 0.2, hp: -15 },
  Bald:     { epithet: "the Bald" },
  Genius:   { epithet: "the Wise", shout: 0.4 },
  Drunkard: { epithet: "the Drunk", hp: 20, spread: 0.6 },
  Inbred:   { epithet: "the Inbred", hp: -10 },
  Lucky:    { epithet: "the Lucky", luck: 1 },
};
const TRAIT_KEYS = Object.keys(TRAITS);

const ZTYPES = {
  walker: { r: 15, hp: 60,  speed: 70,  dmg: 10, gold: 10 },
  runner: { r: 12, hp: 35,  speed: 145, dmg: 7,  gold: 12 },
  tank:   { r: 26, hp: 350, speed: 50,  dmg: 25, gold: 35 },
  boss:   { r: 48, hp: 3000, speed: 58, dmg: 35, gold: 500 },
};

const SHOP = {
  seeds:   { name: "Seeds x3", cost: 15 },
  medkit:  { name: "Medkit", cost: 40 },
  kevlar:  { name: "Kevlar", cost: 60 },
  smg:     { name: "SMG", cost: 80 },
  shotgun: { name: "Shotgun", cost: 100 },
  rifle:   { name: "Rifle", cost: 150 },
  sniper:  { name: "Sniper", cost: 220 },
  case:    { name: "Mystery Case", cost: 100 },
  enhance: { name: "Enhance weapon", cost: 0 },
  repair:  { name: "Repair Hearth", cost: 75 },
};

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const ROMAN = ["", "", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const now = () => performance.now() / 1000;

function collide(e, r) {
  let hit = false;
  for (const w of WALLS) {
    const cx = clamp(e.x, w.x, w.x + w.w), cy = clamp(e.y, w.y, w.y + w.h);
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-4) { const d = Math.sqrt(d2); e.x = cx + (dx / d) * r; e.y = cy + (dy / d) * r; }
    else {
      const l = e.x - w.x, rr = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y, m = Math.min(l, rr, t, b);
      if (m === l) e.x = w.x - r; else if (m === rr) e.x = w.x + w.w + r; else if (m === t) e.y = w.y - r; else e.y = w.y + w.h + r;
    }
  }
  if (e.x < r || e.x > W - r || e.y < r || e.y > H - r) hit = true;
  e.x = clamp(e.x, r, W - r); e.y = clamp(e.y, r, H - r);
  return hit;
}
function rayRect(x, y, dx, dy, w) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[x, dx, w.x, w.x + w.w], [y, dy, w.y, w.y + w.h]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayCircle(x, y, dx, dy, c, r) {
  const fx = x - c.x, fy = y - c.y;
  const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : Infinity);
}
function freeSpot(r = 30) {
  for (let i = 0; i < 100; i++) {
    const p = { x: rand(100, W - 100), y: rand(100, H - 100) };
    if (!collide({ ...p }, r) && !PLOTS.some((pl) => dist2(pl, p) < 90 * 90)) {
      const q = { ...p }; collide(q, r); if (q.x === p.x && q.y === p.y) return p;
    }
  }
  return { x: 200, y: 200 };
}
function hearthSpawn() {
  const a = rand(0, Math.PI * 2);
  const p = { x: HEARTH.x + HEARTH.w / 2 + Math.cos(a) * 130, y: HEARTH.y + HEARTH.h / 2 + Math.sin(a) * 110 };
  collide(p, 16);
  return p;
}

// ---------------------------------------------------------------- state
let nextId = 1;
const players = new Map(); // id -> player
let zombies = [];
let crates = [];
let events = [];
const game = { phase: "lobby", night: 0, ends: 0, hearth: 1000, hearthMax: 1000, result: null, spawnLeft: 0, spawnNext: 0, bossId: 0, stats: null, contractShown: false };

function newWeapon(type, rarity = 0, enh = 0) {
  return { type, rarity, enh, ammo: WEAPONS[type].mag, reloadUntil: 0, nextShot: 0 };
}
function traitOf(p) { return TRAITS[p.trait] || {}; }
function maxHp(p) { return CLASSES[p.cls].hp + (traitOf(p).hp || 0); }
function fullName(p) { return `${p.base}${p.gen > 1 ? " " + ROMAN[Math.min(p.gen, 12)] : ""} ${traitOf(p).epithet}`; }

function makePlayer(ws, msg) {
  const cls = CLASSES[msg.cls] ? msg.cls : "fighter";
  const p = {
    id: nextId++, ws, base: String(msg.name || "Peasant").replace(/[<>]/g, "").slice(0, 16) || "Peasant",
    color: /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : "#e0b050", hat: String(msg.hat || "none").slice(0, 10),
    cls, gen: 1, trait: pick(TRAIT_KEYS), x: 0, y: 0, a: 0, keys: 0, firing: false,
    hp: 0, armor: 0, gold: 0, seeds: 0, dead: false, respawnAt: 0, weapons: [], active: 0,
    heat: 0, dashUntil: 0, dashCd: 0, dashDx: 0, dashDy: 0, shoutCd: 0, vx: 0, vy: 0,
    hitCd: 0, pe: [], lineage: [],
    st: { kills: 0, deaths: 0, dmg: 0, crops: 0, tk: 0, gold: 0, bounty: 0 },
  };
  resetLoadout(p, true);
  return p;
}
function resetLoadout(p, fresh) {
  p.hp = maxHp(p); p.armor = 0;
  p.weapons = [newWeapon("pistol")];
  if (fresh && CLASSES[p.cls].start) p.weapons.push(newWeapon(CLASSES[p.cls].start));
  p.active = p.weapons.length - 1;
  if (fresh) { p.gold = FAST ? 2000 : 50; p.seeds = p.cls === "farmer" ? 6 : 3; }
  Object.assign(p, hearthSpawn());
}

function toast(p, text, color) { p.pe.push({ k: "toast", text, color }); }
function feed(text, color) { events.push({ k: "feed", text, color }); }
function chat(from, text, color) { events.push({ k: "chat", from, text, color }); }

function gaffers() { return [...players.values()].filter((q) => q.cls === "gaffer" && !q.dead); }
function addGold(p, amt, reason) {
  amt = Math.round(amt * (1 + (traitOf(p).gold || 0)));
  p.gold += amt; p.st.gold += amt;
  for (const g of gaffers()) if (g !== p) { const fee = Math.max(1, Math.round(amt * 0.1)); g.gold += fee; g.st.gold += fee; }
  if (reason) p.pe.push({ k: "gold", amt, reason });
}
function speedOf(p) {
  let s = 210 * CLASSES[p.cls].speed * (1 + (traitOf(p).speed || 0));
  if (inAura(p)) s *= 1.1;
  if (p.weapons[p.active]?.type === "sniper") s *= 0.85;
  return s;
}
function inAura(p) { return gaffers().some((g) => g !== p && dist2(g, p) < 260 * 260); }
function dmgMult(p, w) {
  let m = RARITY_MULT[w.rarity] * (1 + 0.15 * w.enh) * (1 + (traitOf(p).dmg || 0));
  if (inAura(p)) m *= 1.2;
  return m;
}

// ---------------------------------------------------------------- combat
function hurtZombie(z, dmg, p, kind) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  if (p) { p.st.dmg += dmg; p.pe.push({ k: "dmg", x: z.x, y: z.y - z.r, v: Math.round(dmg), crit: kind === "crit" }); }
  if (z.hp <= 0) {
    if (p) {
      p.st.kills++;
      addGold(p, ZTYPES[z.type].gold);
      if (z.type === "boss") {
        feed(`${fullName(p)} slew THE SLOP LESHEN`, "#ffd34d");
        for (const q of players.values()) addGold(q, 150, "Contract reward");
      }
    }
  }
}
function hurtPlayer(v, dmg, attacker, cause) {
  if (v.dead || now() < v.dashUntil) return;
  if (attacker && attacker !== v) {
    dmg *= 0.5; // friendly fire is real, but halved
    attacker.heat += dmg;
    attacker.st.dmg += dmg;
    attacker.pe.push({ k: "dmg", x: v.x, y: v.y - 20, v: Math.round(dmg), crit: false, ff: true });
  }
  if (v.armor > 0) { const soak = Math.min(v.armor, dmg * 0.5); v.armor -= soak; dmg -= soak; }
  v.hp -= dmg;
  v.pe.push({ k: "hurt" });
  if (v.hp <= 0) killPlayer(v, attacker, cause);
}
function killPlayer(v, attacker, cause) {
  v.dead = true; v.hp = 0; v.respawnAt = now() + 5; v.st.deaths++;
  const prim = v.weapons.find((w) => w.type !== "pistol");
  if (prim) crates.push({ id: nextId++, x: v.x, y: v.y, w: { ...prim, ammo: WEAPONS[prim.type].mag }, grave: true });
  const vStars = Math.min(5, Math.floor(v.heat / 40));
  if (attacker && attacker !== v) {
    attacker.st.tk++;
    attacker.heat += 80;
    if (vStars > 0) {
      const b = 40 * vStars;
      addGold(attacker, b, "Bounty collected");
      attacker.st.bounty += b;
      feed(`${fullName(attacker)} collected a ${vStars}★ bounty on ${fullName(v)}`, "#ffcc00");
    } else feed(`${fullName(attacker)} ☠ ${fullName(v)} (TEAMKILL)`, "#ff6060");
  } else feed(`${fullName(v)} was ${cause || "eaten"}`, "#ff9090");
  v.heat = 0;
  v.pe.push({ k: "wasted" });
}
function respawnHeir(p) {
  const old = fullName(p);
  p.lineage.push(old);
  const tax = Math.floor(p.gold * 0.5);
  p.gold -= tax;
  p.gen++;
  p.trait = pick(TRAIT_KEYS);
  p.dead = false;
  resetLoadout(p, false);
  toast(p, `${old} is dead. Long live ${fullName(p)}! (Inheritance tax: ${tax}g)`, "#ffd34d");
  feed(`${fullName(p)} inherits the farm`, "#c0a0ff");
}

function shoot(p, w) {
  const def = WEAPONS[w.type];
  const t = now();
  w.nextShot = t + 1 / def.rate;
  w.ammo--;
  const mult = dmgMult(p, w);
  const spread = def.spread * (1 + (traitOf(p).spread || 0));
  const mx = p.x + Math.cos(p.a) * 20, my = p.y + Math.sin(p.a) * 20;
  for (let i = 0; i < def.pellets; i++) {
    const a = p.a + (Math.random() - 0.5) * 2 * spread;
    const dx = Math.cos(a), dy = Math.sin(a);
    let wallT = def.range;
    for (const wl of WALLS) wallT = Math.min(wallT, rayRect(mx, my, dx, dy, wl));
    const hits = [];
    for (const z of zombies) { const tt = rayCircle(mx, my, dx, dy, z, z.r); if (tt < wallT) hits.push([tt, z, "z"]); }
    for (const q of players.values()) {
      if (q === p || q.dead) continue;
      const tt = rayCircle(mx, my, dx, dy, q, 16); if (tt < wallT) hits.push([tt, q, "p"]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    let endT = wallT;
    if (def.boom) {
      endT = hits.length ? hits[0][0] : wallT;
      const bx = mx + dx * endT, by = my + dy * endT;
      events.push({ k: "boom", x: bx, y: by, r: def.boom });
      for (const z of zombies) if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (def.boom + z.r) ** 2) hurtZombie(z, def.dmg * mult, p);
      for (const q of players.values()) if (!q.dead && (q.x - bx) ** 2 + (q.y - by) ** 2 < def.boom ** 2) hurtPlayer(q, def.dmg * mult * 0.3, q === p ? null : p, "blown up by their own fireball");
    } else {
      const list = def.pierce ? hits : hits.slice(0, 1);
      if (!def.pierce && hits.length) endT = hits[0][0];
      for (const [, target, kind] of list) {
        let dmg = def.dmg * mult;
        let crit = false;
        if (p.cls === "rogue" && Math.random() < 0.25 + (traitOf(p).luck ? 0.1 : 0)) { dmg *= 2; crit = true; }
        if (kind === "z") hurtZombie(target, dmg, p, crit ? "crit" : "");
        else hurtPlayer(target, dmg, p, "shot");
      }
    }
    events.push({ k: "tr", x1: mx, y1: my, x2: mx + dx * endT, y2: my + dy * endT, c: w.type });
  }
}

// ---------------------------------------------------------------- actions
function interact(p) {
  // crates first
  let best = null, bd = 60 * 60;
  for (const c of crates) { const d = dist2(c, p); if (d < bd) { bd = d; best = c; } }
  if (best) {
    crates = crates.filter((c) => c !== best);
    const w = best.w;
    giveWeapon(p, w);
    const rn = RARITY[w.rarity];
    toast(p, `Looted ${rn} ${WEAPONS[w.type].name}${w.enh ? " +" + w.enh : ""}`, ["#ddd", "#4da6ff", "#c070ff", "#ffc030"][w.rarity]);
    if (w.rarity === 3) feed(`${fullName(p)} found a LEGENDARY ${WEAPONS[w.type].name}`, "#ffc030");
    return;
  }
  let plot = null; bd = 48 * 48;
  for (const pl of PLOTS) { const d = dist2(pl, p); if (d < bd) { bd = d; plot = pl; } }
  if (!plot) return;
  if (plot.stage === 0) {
    if (p.seeds <= 0) return toast(p, "No seeds. Buy some in the shop [B].", "#f88");
    p.seeds--; plot.stage = 1; plot.prog = 0; plot.fast = p.cls === "farmer"; plot.owner = p.id;
  } else if (plot.stage === 3) {
    plot.stage = 0; p.st.crops++;
    addGold(p, p.cls === "farmer" ? 40 : 25, "Harvest");
    if (Math.random() < 0.25) { p.seeds++; toast(p, "Found a seed in the soil", "#8f8"); }
  } else toast(p, "Still growing...", "#bbb");
}
function giveWeapon(p, w) {
  if (w.type === "pistol") { p.weapons[0] = w; p.active = 0; return; }
  p.weapons[1] = w; p.active = 1;
}
function buy(p, item) {
  if (game.phase !== "day" && game.phase !== "lobby") return toast(p, "The shop is shut at night.", "#f88");
  if (p.dead) return;
  const it = SHOP[item]; if (!it) return;
  if (item === "enhance") return enhance(p);
  if (p.gold < it.cost) return toast(p, `Need ${it.cost}g`, "#f88");
  if (item === "repair" && game.hearth >= game.hearthMax) return toast(p, "Hearth is already at full health", "#bbb");
  p.gold -= it.cost;
  if (item === "seeds") p.seeds += 3;
  else if (item === "medkit") p.hp = maxHp(p);
  else if (item === "kevlar") p.armor = 60;
  else if (item === "repair") { game.hearth = Math.min(game.hearthMax, game.hearth + 200); feed(`${fullName(p)} repaired the Hearth`, "#8f8"); }
  else if (item === "case") {
    const r = Math.random() * 100 - (traitOf(p).luck ? 8 : 0);
    const rarity = r < 4 ? 3 : r < 15 ? 2 : r < 40 ? 1 : 0;
    const w = newWeapon(pick(LOOT_TYPES), rarity);
    giveWeapon(p, w);
    p.pe.push({ k: "case", type: w.type, rarity });
    if (rarity >= 2) feed(`${fullName(p)} unboxed ${RARITY[rarity].toUpperCase()} ${WEAPONS[w.type].name}`, rarity === 3 ? "#ffc030" : "#c070ff");
  } else if (WEAPONS[item]) giveWeapon(p, newWeapon(item));
  if (item !== "case") toast(p, `Bought ${it.name}`, "#8f8");
}
function enhance(p) {
  const w = p.weapons[p.active];
  if (w.enh >= 5) return toast(p, "Already PEN. Touch grass.", "#ffc030");
  const cost = ENH_COST[w.enh];
  if (p.gold < cost) return toast(p, `Enhancing to +${w.enh + 1} costs ${cost}g`, "#f88");
  p.gold -= cost;
  if (Math.random() < ENH_CHANCE[w.enh] + (traitOf(p).luck ? 0.1 : 0)) {
    w.enh++;
    p.pe.push({ k: "enh", ok: true, lvl: w.enh });
    if (w.enh >= 4) feed(`${fullName(p)} hit ${ENH_NAMES[w.enh]} ${WEAPONS[w.type].name}!!`, "#ffc030");
  } else {
    const down = w.enh >= 2;
    if (down) w.enh--;
    p.pe.push({ k: "enh", ok: false, lvl: w.enh, down });
  }
}
function doShout(p) {
  const t = now();
  if (p.dead || t < p.shoutCd) return;
  p.shoutCd = t + 15 * (1 - (traitOf(p).shout || 0));
  events.push({ k: "shout", x: p.x, y: p.y, a: p.a, id: p.id });
  const hit = (e, mass) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > 280 || d < 1) return false;
    let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.7) return false;
    e.vx = (dx / d) * 700 / mass; e.vy = (dy / d) * 700 / mass;
    return true;
  };
  for (const z of zombies) if (hit(z, z.type === "boss" ? 5 : z.type === "tank" ? 2 : 1)) { z.stun = t + 1.2; hurtZombie(z, 10, p); }
  for (const q of players.values()) if (q !== p && !q.dead) hit(q, 1);
}
function doDodge(p) {
  const t = now();
  if (p.dead || t < p.dashCd) return;
  let dx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), dy = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
  if (!dx && !dy) { dx = Math.cos(p.a); dy = Math.sin(p.a); }
  const l = Math.hypot(dx, dy); p.dashDx = dx / l; p.dashDy = dy / l;
  p.dashUntil = t + 0.18; p.dashCd = t + (p.cls === "rogue" ? 0.8 : 1.3);
}

// ---------------------------------------------------------------- phases
function startGame() {
  game.phase = "day"; game.night = 0; game.ends = now() + (FAST ? 3 : 30); game.result = null;
  const n = Math.max(1, players.size);
  game.hearthMax = game.hearth = 800 + 250 * n;
  zombies = []; crates = [];
  for (const pl of PLOTS) { pl.stage = 0; pl.prog = 0; }
  for (const p of players.values()) {
    p.gen = 1; p.lineage = []; p.trait = pick(TRAIT_KEYS); p.dead = false; p.heat = 0;
    p.st = { kills: 0, deaths: 0, dmg: 0, crops: 0, tk: 0, gold: 0, bounty: 0 };
    resetLoadout(p, true);
  }
  spawnCrates();
  feed("The valley wakes. Plant crops, find loot. Night is coming.", "#ffe9a0");
}
function spawnCrates() {
  const n = 3 + players.size;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 100;
    const rarity = r < 6 + game.night * 2 ? 3 : r < 22 + game.night * 3 ? 2 : r < 55 ? 1 : 0;
    crates.push({ id: nextId++, ...freeSpot(), w: newWeapon(pick(LOOT_TYPES), rarity) });
  }
}
function startNight() {
  game.night++;
  game.phase = "night";
  const n = Math.max(1, [...players.values()].length);
  game.spawnLeft = Math.round((10 + 8 * game.night) * (0.6 + 0.4 * n));
  game.spawnNext = now() + 2;
  if (game.night === LAST_NIGHT) {
    game.ends = Infinity;
    const b = spawnZombie("boss");
    b.hp = b.maxHp = Math.round(ZTYPES.boss.hp * (0.5 + 0.5 * n));
    game.bossId = b.id;
    events.push({ k: "banner", text: "CONTRACT: THE SLOP LESHEN", sub: "Slay it to save the valley. Reward: 150g each." });
  } else {
    game.ends = now() + NIGHT_LEN;
    events.push({ k: "banner", text: `NIGHT ${game.night}`, sub: game.night === 1 ? "Protect the Hearth. Don't shoot your friends (much)." : "They're getting hungrier." });
  }
}
function startDay() {
  game.phase = "day"; game.ends = now() + DAY_LEN;
  for (const z of zombies) z.burn = true;
  spawnCrates();
  events.push({ k: "banner", text: `DAY ${game.night + 1}`, sub: `The sun burns the dead. ${LAST_NIGHT - game.night} night${LAST_NIGHT - game.night === 1 ? "" : "s"} left. Shop open [B].` });
}
function endGame(win) {
  game.phase = "over"; game.result = win ? "win" : "lose";
  for (const z of zombies) z.burn = true;
  const rows = [...players.values()].map((p) => {
    const s = p.st;
    const r = clamp(6 + s.kills * 0.05 + s.crops * 0.2 + s.dmg / 3000 - s.deaths * 0.35 - s.tk * 0.5 + (win ? 0.5 : 0) + s.bounty / 400, 3, 10);
    return { name: fullName(p), cls: CLASSES[p.cls].name, color: p.color, ...s, dmg: Math.round(s.dmg), rating: Math.round(r * 10) / 10, lineage: [...p.lineage, fullName(p)] };
  }).sort((a, b) => b.rating - a.rating);
  game.stats = rows;
  events.push({ k: "over" });
}
function spawnZombie(type, at) {
  const def = ZTYPES[type];
  let x, y;
  if (at) { x = at.x + rand(-40, 40); y = at.y + rand(-40, 40); }
  else {
    const side = (Math.random() * 4) | 0;
    x = side === 0 ? 20 : side === 1 ? W - 20 : rand(20, W - 20);
    y = side === 2 ? 20 : side === 3 ? H - 20 : rand(20, H - 20);
  }
  const hpScale = 1 + 0.15 * Math.max(0, game.night - 1);
  const z = { id: nextId++, type, x, y, r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale, vx: 0, vy: 0, stun: 0, atk: 0, steer: 0, burn: false, special: now() + 6, charge: 0, arson: type !== "boss" && Math.random() < 0.35 };
  zombies.push(z);
  return z;
}

// ---------------------------------------------------------------- tick
let lastT = now();
let tickN = 0;
function tick() {
  const t = now();
  const dt = Math.min(0.1, t - lastT);
  lastT = t;
  tickN++;

  // phase clock
  if (game.phase === "day" && t > game.ends) startNight();
  else if (game.phase === "night" && t > game.ends) startDay();
  if (game.phase === "night" && game.spawnLeft > 0 && t > game.spawnNext) {
    const r = Math.random();
    const type = game.night >= 3 && r < 0.12 ? "tank" : game.night >= 2 && r < 0.4 ? "runner" : "walker";
    spawnZombie(type);
    game.spawnLeft--;
    const len = game.night === LAST_NIGHT ? 50 : NIGHT_LEN * 0.8;
    game.spawnNext = t + len / Math.max(10, game.spawnLeft + 10) * 0.9;
    if (game.night === LAST_NIGHT && game.spawnLeft === 0) game.spawnLeft = 12; // endless trickle while the boss lives
  }

  // players
  for (const p of players.values()) {
    if (p.dead) { if (game.phase !== "over" && t > p.respawnAt) respawnHeir(p); continue; }
    let mx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), my = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
    if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
    const sp = speedOf(p);
    if (t < p.dashUntil) { mx = p.dashDx * 3.1; my = p.dashDy * 3.1; }
    p.x += (mx * sp + p.vx) * dt; p.y += (my * sp + p.vy) * dt;
    p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt);
    collide(p, 16);
    p.heat = Math.max(0, p.heat - 1.6 * dt);
    const w = p.weapons[p.active];
    if (w.reloadUntil && t >= w.reloadUntil) { w.reloadUntil = 0; w.ammo = WEAPONS[w.type].mag; }
    if (p.firing && !w.reloadUntil && t >= w.nextShot) {
      if (w.ammo > 0) shoot(p, w);
      else w.reloadUntil = t + WEAPONS[w.type].reload;
    }
  }

  // plots
  for (const pl of PLOTS) {
    if (pl.stage === 0 || pl.stage === 3) continue;
    pl.prog += dt / (pl.fast ? 7 : 13);
    if (pl.prog >= 1) { pl.prog = 0; pl.stage++; }
  }

  // zombies
  const live = [...players.values()].filter((p) => !p.dead);
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  for (const z of zombies) {
    const def = ZTYPES[z.type];
    if (z.burn) { z.hp -= z.maxHp * 0.35 * dt; if (Math.random() < dt * 3) events.push({ k: "burn", x: z.x, y: z.y }); continue; }
    // 'arson' zombies beeline for the Hearth and only get distracted by players right next to them
    let target = null, bd = (z.type === "boss" ? 600 : z.arson ? 110 : 420) ** 2;
    for (const p of live) { const d = dist2(p, z); if (d < bd) { bd = d; target = p; } }
    const goal = target || hc;
    let dx = goal.x - z.x, dy = goal.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (z.steer) { const c = Math.cos(z.steer), s = Math.sin(z.steer); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
    let sp = def.speed * (z.type === "runner" ? 1 : 1 + 0.03 * game.night);
    if (z.type === "boss" && t < z.charge) sp = 380;
    if (t < z.stun) sp = 0;
    const ox = z.x, oy = z.y;
    z.x += (dx * sp + z.vx) * dt; z.y += (dy * sp + z.vy) * dt;
    z.vx *= Math.pow(0.03, dt); z.vy *= Math.pow(0.03, dt);
    const touchingHearth = z.x + z.r > HEARTH.x - 4 && z.x - z.r < HEARTH.x + HEARTH.w + 4 && z.y + z.r > HEARTH.y - 4 && z.y - z.r < HEARTH.y + HEARTH.h + 4;
    if (collide(z, z.r) && !touchingHearth) {
      const moved = Math.hypot(z.x - ox, z.y - oy);
      if (moved < sp * dt * 0.4) z.steer = z.steer ? z.steer : (Math.random() < 0.5 ? 1.2 : -1.2);
    } else if (z.steer && Math.random() < dt * 0.8) z.steer = 0;
    // attack
    if (t > z.atk) {
      if (target && Math.sqrt(bd) < z.r + 20) { hurtPlayer(target, def.dmg, null, z.type === "boss" ? "folded by the Leshen" : "eaten"); z.atk = t + 0.8; }
      else if (!target && touchingHearth && game.phase !== "over") { game.hearth -= def.dmg * (z.type === "boss" ? 1.5 : 0.6); z.atk = t + 0.8; events.push({ k: "hhit" }); }
    }
    // trample crops
    for (const pl of PLOTS) if (pl.stage > 0 && (pl.x - z.x) ** 2 + (pl.y - z.y) ** 2 < 22 * 22) { pl.stage = 0; pl.prog = 0; events.push({ k: "trample", x: pl.x, y: pl.y }); }
    // boss specials
    if (z.type === "boss" && t > z.special && game.phase === "night") {
      z.special = t + 7;
      if (Math.random() < 0.5 && target) { z.charge = t + 0.7; events.push({ k: "roar", x: z.x, y: z.y }); }
      else { for (let i = 0; i < 3 + players.size; i++) spawnZombie(Math.random() < 0.3 ? "runner" : "walker", z); events.push({ k: "roar", x: z.x, y: z.y }); }
    }
  }
  // separation
  for (let i = 0; i < zombies.length; i++) for (let j = i + 1; j < zombies.length; j++) {
    const a = zombies[i], b = zombies[j];
    const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
  }
  const bossWasAlive = zombies.some((z) => z.id === game.bossId);
  zombies = zombies.filter((z) => z.hp > 0);
  if (game.phase === "night" && game.night === LAST_NIGHT && bossWasAlive && !zombies.some((z) => z.id === game.bossId)) {
    for (const z of zombies) z.burn = true;
    endGame(true);
  }
  if ((game.phase === "night" || game.phase === "day") && game.hearth <= 0) { game.hearth = 0; endGame(false); }

  if (tickN % SNAP_EVERY === 0) broadcast();
}

function snapshot() {
  const r = Math.round;
  return {
    t: "s",
    g: { ph: game.phase, n: game.night, left: game.ends === Infinity ? -1 : Math.max(0, r(game.ends - now())), hh: r(game.hearth), hm: game.hearthMax, res: game.result, boss: game.bossId },
    p: [...players.values()].map((p) => {
      const w = p.weapons[p.active];
      return {
        id: p.id, n: fullName(p), x: r(p.x), y: r(p.y), a: +p.a.toFixed(2), hp: r(p.hp), mh: maxHp(p), ar: r(p.armor),
        c: p.color, h: p.hat, cl: p.cls, d: p.dead ? 1 : 0, g: p.gold, sd: p.seeds, st: Math.min(5, Math.floor(p.heat / 40)),
        w: w.type, wr: w.rarity, we: w.enh, am: w.ammo, rl: w.reloadUntil ? 1 : 0, sec: p.weapons.length > 1 ? 1 : 0,
        sc: Math.max(0, +(p.shoutCd - now()).toFixed(1)), sp: r(speedOf(p)), tr: p.trait, gen: p.gen,
        k: p.st.kills, de: p.st.deaths, cr: p.st.crops, tk: p.st.tk,
      };
    }),
    z: zombies.map((z) => [z.id, z.type[0], r(z.x), r(z.y), r((z.hp / z.maxHp) * 100), z.burn ? 1 : 0]),
    pl: PLOTS.map((p) => p.stage),
    cr: crates.map((c) => [c.id, r(c.x), r(c.y), c.w.rarity, c.grave ? 1 : 0]),
    e: events,
    stats: game.phase === "over" ? game.stats : undefined,
  };
}
function broadcast() {
  const base = JSON.stringify(snapshot()).slice(1);
  events = [];
  for (const p of players.values()) {
    try { p.ws.send(`{"me":${p.id},"pe":${JSON.stringify(p.pe)},${base}`); } catch {}
    p.pe = [];
  }
  for (const ws of spectators) { try { ws.send(`{"me":0,"pe":[],${base}`); } catch {} }
}

// ---------------------------------------------------------------- network
const spectators = new Set();
function hostId() { return players.size ? Math.min(...players.keys()) : 0; }

function onMessage(ws, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  const p = ws.data.pid ? players.get(ws.data.pid) : null;
  if (m.t === "join" && !p) {
    const np = makePlayer(ws, m);
    ws.data.pid = np.id;
    spectators.delete(ws);
    players.set(np.id, np);
    if (game.phase === "day" || game.phase === "night") { game.hearthMax += 250; game.hearth += 250; }
    feed(`Sul sul! ${fullName(np)} the ${CLASSES[np.cls].name} joined`, "#8f8");
    return;
  }
  if (!p) return;
  switch (m.t) {
    case "in":
      p.keys = m.k | 0; p.a = +m.a || 0; p.firing = !!m.f && !p.dead;
      break;
    case "reload": { const w = p.weapons[p.active]; if (!w.reloadUntil && w.ammo < WEAPONS[w.type].mag) w.reloadUntil = now() + WEAPONS[w.type].reload; break; }
    case "swap": if (p.weapons.length > 1) { p.active = m.i === 0 || m.i === 1 ? Math.min(m.i, p.weapons.length - 1) : 1 - p.active; } break;
    case "use": if (!p.dead) interact(p); break;
    case "shout": doShout(p); break;
    case "dodge": doDodge(p); break;
    case "buy": buy(p, m.item); break;
    case "chat": { const text = String(m.text || "").slice(0, 120).trim(); if (text) chat(fullName(p), text, p.color), events.push({ k: "say", id: p.id, text }); break; }
    case "start": if (p.id === hostId() && (game.phase === "lobby" || game.phase === "over")) startGame(); break;
    case "lobby": if (p.id === hostId() && game.phase === "over") { game.phase = "lobby"; zombies = []; crates = []; } break;
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") return srv.upgrade(req, { data: { pid: 0 } }) ? undefined : new Response("Upgrade failed", { status: 400 });
    if (url.pathname === "/game.js") return new Response(gameJs, { headers: { "content-type": "application/javascript; charset=utf-8" } });
    if (url.pathname === "/") return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      spectators.add(ws);
      ws.send(JSON.stringify({ t: "hello", map: { W, H, walls: WALLS, hearth: HEARTH, plots: PLOTS.map((p) => ({ x: p.x, y: p.y })) }, shop: SHOP, enhCost: ENH_COST, enhChance: ENH_CHANCE }));
    },
    message: onMessage,
    close(ws) {
      spectators.delete(ws);
      const p = players.get(ws.data.pid);
      if (p) { players.delete(p.id); feed(`${fullName(p)} left the valley`, "#aaa"); }
      if (players.size === 0 && game.phase !== "lobby") { game.phase = "lobby"; zombies = []; crates = []; }
    },
  },
});

setInterval(tick, 1000 / TICK_RATE);

const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(`
  ==============================================
     SLOP VALLEY server running on port ${server.port}
  ==============================================
   You (host):      http://localhost:${server.port}
${lan.map((ip) => `   Same Wi-Fi/LAN:  http://${ip}:${server.port}`).join("\n")}
   Friends online:  http://<your public IP>:${server.port}
                    (forward TCP port ${server.port} on your router to this PC)
   Close this window to stop the server.
`);
fetch("https://api.ipify.org").then((r) => r.text()).then((ip) => {
  if (/^[\d.]+$/.test(ip)) console.log(`   Your public IP looks like ${ip}  ->  send friends http://${ip}:${server.port}\n`);
}).catch(() => {});
