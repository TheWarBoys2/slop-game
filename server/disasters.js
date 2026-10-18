// Natural disasters and the control-station minigames that stop them.
import { shock } from "../market.js";
import { ZTYPES } from "../data.js";
import { hurtPiece } from "./building.js";
import { explode, fires, hurtPlayer, ignite, insideWall, kick } from "./combat.js";
import { DISASTER, DISASTER_CHANCE, H, HEARTH, MV, W, clamp, dist2, now, pick, rand } from "./config.js";
import { near } from "./geometry.js";
import { BALL, PLOTS, boxDist, damageWall } from "./map.js";
import { addStress } from "./needs.js";
import { addGold, addXp, deed, feed, freeSpot, fullName, game, players, toast } from "./state.js";
import { world } from "./world.js";

const DISASTERS = {
  meteor: { name: "METEOR SHOWER", sub: "Get out of the red circles. Or get to the defence console and shoot them down [E].", len: 36, station: "orbital defence console", game: "Orbital Defence" },
  flood:  { name: "FLASH FLOOD", sub: "Get to high ground, or get to the sluice gates and drain it [E]. Crops won't survive it.", len: 45, station: "sluice gates", game: "Sluice Gates" },
  tornado: { name: "TORNADO", sub: "It picks up anything that isn't nailed down. The cloud-seeding rocket can break it up [E].", len: 40, station: "cloud-seeding rocket", game: "Cloud Seeding" },
  quake:  { name: "EARTHQUAKE", sub: "Stay out of the houses. The aftershocks keep coming until someone works the seismic damper [E].", len: 32, station: "seismic damper", game: "Seismic Damper" },
};
// Every disaster can be stopped: a control station appears near town, and whoever works its minigame ends it early.
const FIX_TIME = { meteor: 40, flood: 50, tornado: 30, quake: 35 }, FIX_MIN = { meteor: 10, flood: 3, tornado: 4, quake: 10 };
function placeStation() {
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  for (let i = 0; i < 80; i++) { const c = freeSpot(40), d = Math.hypot(c.x - hc.x, c.y - hc.y); if (d > 280 && d < 650 && !insideWall(c.x, c.y, 10)) return c; }
  return { x: hc.x + 300, y: hc.y + 120 };
}
// the sluice puzzle: a grid of pipes, every one turned the wrong way. Turn them so water flows from the left inlet to the right outlet.
const PIPE = [5, 3, 7]; // straight (N+S), elbow (N+E), tee (N+E+S); N=1 E=2 S=4 W=8
const rotMask = (m, k) => { for (let i = 0; i < (k & 3); i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dRow, dCol, opposite bit
function makeSluice() {
  const R = 4, C = 6, r0 = (Math.random() * R) | 0, r1 = (Math.random() * R) | 0;
  const seen = new Set(), path = [];
  const dfs = (r, c) => {
    seen.add(r * C + c); path.push([r, c]);
    if (r === r1 && c === C - 1) return true;
    const nb = DIRS.map(([, dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < R && b >= 0 && b < C && !seen.has(a * C + b)).sort(() => Math.random() - 0.5);
    for (const [a, b] of nb) if (dfs(a, b)) return true;
    path.pop(); return false;
  };
  dfs(r0, 0);
  const need = new Map();
  path.forEach(([r, c], i) => {
    let m = 0;
    const prev = i ? path[i - 1] : [r, -1], next = i < path.length - 1 ? path[i + 1] : [r, C];
    for (const [pr, pc] of [prev, next]) for (const [bit, dr, dc] of DIRS) if (pr === r + dr && pc === c + dc) m |= bit;
    need.set(r * C + c, m);
  });
  const g = [], sol = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const m = need.get(r * C + c);
    let type = Math.random() < 0.15 ? 2 : (Math.random() * 2) | 0, k = 0;
    if (m !== undefined) { type = [0, 1].find((ty) => [0, 1, 2, 3].some((q) => rotMask(PIPE[ty], q) === m)); k = [0, 1, 2, 3].find((q) => rotMask(PIPE[type], q) === m); }
    g.push([type, (Math.random() * 4) | 0]); sol.push(k);
  }
  return { R, C, r0, r1, g, sol };
}
function sluiceFlows(S, rots) {
  const { R, C, r0, r1, g } = S, mask = (i) => rotMask(PIPE[g[i][0]], rots[i] | 0);
  if (!(mask(r0 * C) & 8)) return false;
  const seen = new Set([r0 * C]), q = [r0 * C];
  while (q.length) {
    const i = q.shift(), r = Math.floor(i / C), c = i % C, m = mask(i);
    if (r === r1 && c === C - 1 && (m & 2)) return true;
    for (const [bit, dr, dc, opp] of DIRS) {
      const a = r + dr, b = c + dc, j = a * C + b;
      if (!(m & bit) || a < 0 || a >= R || b < 0 || b >= C || seen.has(j) || !(mask(j) & opp)) continue;
      seen.add(j); q.push(j);
    }
  }
  return false;
}
export function startFix(p) {
  const D = game.disaster, t = now();
  if (!D || !D.st || p.fix) return;
  if (D.st.busy && D.st.busy !== p.id && players.get(D.st.busy)?.fix) return toast(p, "Someone's already working it. Cover them.", "#bbb");
  if (t < (p.fixCool || 0)) return toast(p, `The ${DISASTERS[D.kind].station} is resetting. Try again in ${Math.ceil(p.fixCool - t)}s.`, "#bbb");
  D.st.busy = p.id;
  p.fix = { kind: D.kind, t0: t, until: t + FIX_TIME[D.kind] };
  const msg = { k: "fix", kind: D.kind, time: FIX_TIME[D.kind], title: DISASTERS[D.kind].game };
  if (D.kind === "flood") { const S = p.fix.sluice = makeSluice(); Object.assign(msg, { R: S.R, C: S.C, r0: S.r0, r1: S.r1, g: S.g }); }
  p.pe.push(msg);
}
export function endFix(p, why) { if (!p.fix) return; p.fix = null; if (game.disaster && game.disaster.st && game.disaster.st.busy === p.id) game.disaster.st.busy = 0; p.pe.push({ k: "fix", close: 1, why }); }
export function finishFix(p, m) {
  const F = p.fix, D = game.disaster, t = now(); if (!F) return;
  if (m.cancel) return endFix(p);
  if (!D || D.kind !== F.kind) return endFix(p, "It's already over.");
  const quick = t - F.t0 < FIX_MIN[F.kind], late = t > F.until + 2;
  const ok = !quick && !late && (F.kind === "flood" ? Array.isArray(m.rots) && sluiceFlows(F.sluice, m.rots) : !!m.ok);
  if (!ok) { p.fixCool = t + 8; endFix(p); return toast(p, late ? "Too slow. The station resets." : "That didn't work. The station needs a few seconds to reset.", "#ff8060"); }
  endFix(p);
  const D0 = DISASTERS[D.kind];
  if (D.kind === "flood") D.until = Math.min(D.until, t + 8); // the water drains away
  else D.until = t;
  D.st = null; D.stopped = true;
  addGold(p, 80, `Stopped the ${D0.name.toLowerCase()}`); addXp(p, 40); p.st.saves = (p.st.saves || 0) + 1;
  for (const q of players.values()) if (q !== p) addGold(q, 20);
  deed("soil", 6);
  feed(`${fullName(p)} stopped the ${D0.name.toLowerCase()} at the ${D0.station}! (+80g, everyone else +20g)`, "#9fe0ff");
  world.events.push({ k: "banner", text: `${D0.name} STOPPED`, sub: `${fullName(p)} worked the ${D0.station}. Drinks are on them.` });
  shock(game.market, "FARM", 0.05, "Disaster averted. Farm shares rally.");
}
export function maybeDisaster() {
  if (game.mode === "royale" || game.disaster) return;
  const forced = DISASTER && DISASTERS[DISASTER] ? DISASTER : DISASTER === "any" ? pick(Object.keys(DISASTERS)) : "";
  if (!forced && (game.night < 2 || Math.random() > DISASTER_CHANCE)) return;
  const kind = forced || pick(Object.keys(DISASTERS)), t = now(), D = DISASTERS[kind];
  game.disaster = { kind, t0: t, until: t + D.len, next: t + 1, meteors: [], water: 0, drowned: false, st: { ...placeStation(), busy: 0 } };
  if (kind === "tornado") { const sp = freeSpot(40); Object.assign(game.disaster, { x: sp.x, y: sp.y, vx: 0, vy: 0 }); }
  world.events.push({ k: "banner", text: D.name, sub: D.sub });
  world.events.push({ k: "disaster", kind });
  feed(`${D.name}!`, "#ff9a40");
  shock(game.market, "FARM", -0.12, `${D.name} batters the valley's farms`); shock(game.market, "GRUB", -0.04);
}
export function disasterTick(t, dt) {
  const D = game.disaster; if (!D) return;
  if (t > D.until && !(D.kind === "flood" && D.water > 0) && !D.meteors.length) {
    game.disaster = null;
    for (const p of players.values()) if (p.fix) endFix(p, "The disaster has passed.");
    if (!D.stopped) world.events.push({ k: "feed", text: "The disaster has passed.", color: "#9fe0ff" });
    return;
  }
  if (D.st && D.st.busy && !players.get(D.st.busy)?.fix) D.st.busy = 0;
  const live = [...players.values()].filter((p) => !p.dead && !p.air);
  if (D.kind === "meteor") {
    if (t < D.until && t > D.next) {
      D.next = t + rand(0.5, 1.1);
      const near = live.length && Math.random() < 0.7 ? pick(live) : null;
      const x = clamp(near ? near.x + rand(-420, 420) : rand(100, W - 100), 40, W - 40), y = clamp(near ? near.y + rand(-420, 420) : rand(100, H - 100), 40, H - 40);
      D.meteors.push({ x, y, at: t + 1.8 });
    }
    for (const m of D.meteors) if (t >= m.at) {
      m.done = true;
      const z = MV.floorAt(m.x, m.y, 4, 2000, near(m)).h;
      explode(m.x, m.y, z + 10, 150, 90, null, "flattened by a meteor", 1);
      for (let i = 0; i < 3; i++) ignite(m.x + rand(-60, 60), m.y + rand(-60, 60), z + 30, 0, 2, true);
      world.events.push({ k: "meteor", x: Math.round(m.x), y: Math.round(m.y), z: Math.round(z) });
    }
    D.meteors = D.meteors.filter((m) => !m.done);
  } else if (D.kind === "flood") {
    const rise = 8, peak = 30, k = t < D.t0 + rise ? (t - D.t0) / rise : t < D.until - rise ? 1 : Math.max(0, (D.until - t) / rise);
    D.water = peak * k;
    if (D.water > 12 && !D.drowned) { D.drowned = true; let n = 0; for (const pl of PLOTS) if (pl.stage > 0) { pl.stage = 0; pl.prog = 0; n++; } if (n) feed(`The flood drowned ${n} crop${n > 1 ? "s" : ""}.`, "#6ab0e0"); }
    for (const [key, f] of fires) if (f.z < D.water) fires.delete(key);
    for (const p of players.values()) if (p.z < D.water - 4) p.fireUntil = 0;
  } else if (D.kind === "tornado") {
    // it wanders towards people, and throws everything it touches
    const tgt = live.length ? live.reduce((a, b) => (dist2(a, D) < dist2(b, D) ? a : b)) : null;
    if (tgt) { const d = Math.hypot(tgt.x - D.x, tgt.y - D.y) || 1; D.vx += ((tgt.x - D.x) / d * 110 - D.vx) * dt * 0.5; D.vy += ((tgt.y - D.y) / d * 110 - D.vy) * dt * 0.5; }
    D.vx += rand(-60, 60) * dt; D.vy += rand(-60, 60) * dt;
    D.x = clamp(D.x + D.vx * dt, 60, W - 60); D.y = clamp(D.y + D.vy * dt, 60, H - 60);
    const pull = (e, isP) => {
      const dx = D.x - e.x, dy = D.y - e.y, d = Math.hypot(dx, dy);
      if (d > 280 || d < 1) return;
      const k = 1 - d / 280, tx = -dy / d, ty = dx / d; // swirl + suck in
      if (isP) {
        if (e.veh || e.air || e.dead || e.fix) return; // working the station anchors you
        e.vx += (dx / d * 500 + tx * 700) * k * dt; e.vy += (dy / d * 500 + ty * 700) * k * dt;
        if (d < 90 && e.gr) { kick(e, tx * 300, ty * 300, 650); hurtPlayer(e, 8, null, "carried off by a tornado"); }
      } else {
        e.vx += (dx / d * 400 + tx * 600) * k * dt; e.vy += (dy / d * 400 + ty * 600) * k * dt;
        if (d < 90 && e.gr && !(ZTYPES[e.type] && ZTYPES[e.type].big)) { e.vz = 600; e.gr = false; e.hp -= 6; }
      }
    };
    for (const p of players.values()) pull(p, true);
    for (const z of world.zombies) if (z.type !== "flyer") pull(z, false);
    for (const b of world.builds) if (Math.hypot(b.x + 20 - D.x, b.y + 20 - D.y) < 90) hurtPiece(b, 400 * dt);
    for (const w of [...world.WALLS]) if (w.hp && (w.kind === "fence" || w.kind === "crate" || w.kind === "tree") && boxDist(w, D.x, D.y, 0) < 70) damageWall(w, 250 * dt);
    { const d = Math.hypot(BALL.x - D.x, BALL.y - D.y); if (d < 280) { BALL.vx += (-(BALL.y - D.y) / (d || 1)) * 900 * dt; BALL.vy += ((BALL.x - D.x) / (d || 1)) * 900 * dt; if (d < 90) BALL.vz = 500; } }
  } else if (D.kind === "quake") {
    if (t > D.next) {
      D.next = t + 0.5;
      const houses = world.WALLS.filter((w) => w.hp && (w.kind === "house" || w.kind === "rock"));
      if (houses.length && Math.random() < 0.12) damageWall(pick(houses), 600);
      for (const z of world.zombies) if (z.gr && Math.random() < 0.3) z.stun = Math.max(z.stun, t + 0.6);
      for (const p of live) if (p.gr && !p.fix) { addStress(p, 1); if (Math.random() < 0.2) kick(p, rand(-120, 120), rand(-120, 120), 120); }
      world.events.push({ k: "quake" });
    }
  }
}
