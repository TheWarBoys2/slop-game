// The network: snapshots, messages from players, serving the client, and bug reports.
import indexHtml from "../public/index.html" with { type: "text" };
import client1 from "../public/client/01-core.js" with { type: "text" };
import client2 from "../public/client/02-effects.js" with { type: "text" };
import client3 from "../public/client/03-input.js" with { type: "text" };
import client4 from "../public/client/04-menus.js" with { type: "text" };
import client5 from "../public/client/05-audio.js" with { type: "text" };
import client6 from "../public/client/06-ui.js" with { type: "text" };
import client7 from "../public/client/07-movement.js" with { type: "text" };
import client8 from "../public/client/08-cutscene.js" with { type: "text" };
import client9 from "../public/client/09-view.js" with { type: "text" };
import client10 from "../public/client/10-render.js" with { type: "text" };
import client11 from "../public/client/11-screens.js" with { type: "text" };
import client12 from "../public/client/12-music.js" with { type: "text" };
const gameSrc = [client1, client2, client3, client4, client5, client6, client7, client8, client9, client10, client11, client12].join("\n"); // the browser client, one file per part, joined in order
import moveJs from "../public/move.js" with { type: "text" };
import snapJs from "../public/snap.js" with { type: "text" };
import r3dJs from "../public/r3d.js" with { type: "text" };
import threeJs from "../public/vendor/three.module.min.js" with { type: "text" };
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { townMeeting, BOSSES } from "../story.js";
import { COSMETICS, FREE_HATS, WHEEL } from "../casino.js";
import { LEGENDS } from "../legend.js";
import { ITEMS, GEAR, GEAR_RAR, bagAdd, CROPS, SEED_PACK } from "../items.js";
import { STOCKS } from "../market.js";
import { CANDIDATES } from "../politics.js";
import { DUST, inDust } from "../dust2.js";
import { MECH_PARTS } from "../bugs.js";
import * as DATA from "../data.js";
import { ENH_COST, ENH_CHANCE, CLASSES, BACKGROUNDS, HOES } from "../data.js";
import { CARDS, LOCS } from "../cards.js";
import { buy, cycleElement, doDodge, doShout, giveWeapon, interact, learn } from "./actions.js";
import { brainEmerges, sealHole } from "./bugnight.js";
import { placePiece } from "./building.js";
import { cleanWeapon, fires, hurtZombie, killPlayer, pressReload, throwIt } from "./combat.js";
import { PORT, TEST_TP, TICK_RATE, clamp, dist2, now, own } from "./config.js";
import { endFix, finishFix } from "./disasters.js";
import { casinoAct, doSpin, equip, itemAct, openElection, pickDlg, stallAct, trade } from "./economy.js";
import { CHUNKS, mapMsg } from "./geometry.js";
import { finishHack } from "./hacking.js";
import { PLOTS, SHOPS } from "./map.js";
import { deployMech } from "./mechs.js";
import { infect, relieve } from "./needs.js";
import { DOME_R, nukeWarn } from "./nukes.js";
import { spawnZombie } from "./phases.js";
import { jump } from "./royale.js";
import { cardAct, storyApi } from "./social.js";
import { PIECES, SHOP, VEHICLES, chat, feed, fullName, game, makePlayer, newWeapon, players, toast } from "./state.js";
import { broadcastRaw, tick } from "./tick.js";
import { exitVehicle } from "./vehicles.js";
import { world } from "./world.js";
import { MODE_RULES, rules } from "./modes.js";

// the browser gets the same tables the server plays by (data.js), plus a few names from the other data modules
const CLIENT_DATA = { ...DATA, GEAR_RAR, BOSS_NAMES: Object.fromEntries(Object.entries(BOSSES).map(([k, b]) => [k, b.name])) };
const gameJs = "var DATA = " + JSON.stringify(CLIENT_DATA) + ";\n" + moveJs + "\n" + snapJs + "\n" + r3dJs + "\n" + gameSrc;
// ---------------------------------------------------------------- network
export const spectators = new Set();
let msgErrs = 0, msgErrAt = 0;
function hostId() { return players.size ? Math.min(...players.keys()) : 0; }
function onMessage(ws, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== "object") return;
  const p = ws.data.pid ? players.get(ws.data.pid) : null;
  if (m.t === "join" && !p) {
    const np = makePlayer(ws, m);
    ws.data.pid = np.id;
    spectators.delete(ws);
    players.set(np.id, np);
    if (game.phase === "day" || game.phase === "night") { game.hearthMax += 250; game.hearth += 250; np.hearthBonus = true; }
    if (game.phase === "royale") { np.dead = true; np.out = true; np.place = 99; toast(np, "A Royale is in progress. You're spectating until the next round.", "#ffd34d"); }
    if (game.phase === "intro") np.air = "wait";
    feed(`Sul sul! ${fullName(np)} the ${BACKGROUNDS[np.bg].name} ${CLASSES[np.cls].name} joined`, "#8f8");
    return;
  }
  if (!p) return;
  switch (m.t) {
    case "in":
      p.keys = m.k | 0; p.a = Number.isFinite(+m.a) ? +m.a : 0; p.firing = !!m.f && !p.dead; p.ads = !!m.ads && !p.dead;
      p.pt = typeof m.pt === "number" && isFinite(m.pt) ? clamp(m.pt, -1.5, 1.5) : 0;
      p.my = typeof m.my === "number" && isFinite(m.my) ? m.my : null; // the camera's yaw: what WASD walks by in 3D, so the server moves you the way your own prediction did
      p.fly = Array.isArray(m.fly) && m.fly.length === 4 ? m.fly.map((x) => clamp(+x || 0, -1, 1)) : null;
      break;
    case "tp": if (TEST_TP) { // testing only
      if (typeof m.x === "number") { p.x = m.x; p.y = m.y; p.z = m.z || 0; p.vx = p.vy = p.vz = 0; }
      if (m.gold) p.gold = m.gold;
      if (m.love) p.love[m.love[0]] = m.love[1];
      if (m.breath !== undefined) p.breath = m.breath;
      if (m.food !== undefined) { p.food = m.food; p.water = m.water ?? m.food; p.invDirty = true; }
      if (m.rad !== undefined) p.rad = m.rad;
      if (m.nuke) nukeWarn("Test.");
      if (m.elect) openElection();
      if (m.clues) for (let i = 0; i < m.clues; i++) storyApi.freeClue();
      if (m.dusk) game.ends = now() + 0.5;
      if (m.killQ) for (const z of world.zombies) if (z.qid && z.type !== "boss") hurtZombie(z, z.hp + 1, p); // Adventure's quest monsters
      if (m.killBoss) { const b = world.zombies.find((z) => z.id === game.bossId); if (b) hurtZombie(b, b.hp + 1, p); }
      if (m.weapon) giveWeapon(p, newWeapon(m.weapon, m.rarity || 0));
      if (m.mechParts) for (const id of Object.keys(MECH_PARTS)) bagAdd(p.bag, "mp_" + id), p.invDirty = true; // Bug Night and mechs
      if (m.mechSet && typeof m.mechSet === "object") { for (const k of ["core", "legs", "armR", "armL", "head"]) p.mech[k] = own(MECH_PARTS, m.mechSet[k]) ? m.mechSet[k] : null; p.invDirty = true; }
      if (m.bugs) game.forceBugs = true;
      if (m.killBrain && game.bugs) { const b = world.zombies.find((z) => z.id === game.bugs.brain); if (b) hurtZombie(b, b.hp + 1, p); }
      if (m.brainNow && game.bugs && !game.bugs.brain) brainEmerges();
      if (m.sealAll && game.bugs) for (const h of [...game.bugs.holes]) if (!h.hive) sealHole(h, p);
      if (m.mode !== undefined) p.weapons[p.active].mode = m.mode || undefined;
      if (m.enh !== undefined) p.weapons[p.active].enh = m.enh;
      if (m.zinfo) p.pe.push({ k: "test", v: world.zombies.map((z) => [z.type, Math.round(z.hp), z.frozen > now() ? 1 : 0, (z.fireUntil || 0) > now() ? 1 : 0, (z.slowUntil || 0) > now() ? 1 : 0, Math.round(z.x)]) });
      if (m.ammo !== undefined) p.weapons[p.active].ammo = m.ammo;
      if (m.night) game.night = m.night;
      if (m.spawn) { const z = spawnZombie(m.spawn, { x: p.x + 120, y: p.y }); if (z) { z.x = p.x + 120; z.y = p.y; z.stun = now() + 30; } }
      if (m.zat) { const z = spawnZombie(m.zat[2] || "walker", { x: m.zat[0], y: m.zat[1] }); if (z) { z.x = m.zat[0]; z.y = m.zat[1]; z.z = 0; z.arson = false; } } // testing only: a zombie right there, awake
      if (m.die) killPlayer(p, null, "testing");
      if (m.clearZ) world.zombies = [];
      if (m.infect) infect(p);
      if (m.item) { bagAdd(p.bag, m.item, m.n || 1); p.invDirty = true; }
      if (m.hp) p.hp = m.hp;
      if (m.heat !== undefined) p.heat = m.heat;
      if (m.streak !== undefined) p.streak = m.streak;
      if (m.hearth !== undefined) game.hearth = m.hearth;
      if (m.meet) p.pe.push({ k: "test", v: townMeeting(game.night + 1, storyApi).choices.map((c) => c.label + " | " + c.desc) });
      if (m.bw !== undefined) { p.bw = m.bw; p.bl = m.bl || 0; }
      if (m.plot) { let best = null, bd = Infinity; for (const pl of PLOTS) { const d = dist2(pl, p); if (d < bd) { bd = d; best = pl; } } if (best) { best.stage = 1; best.prog = 0; best.crop = "turnip"; best.rate = 1; p.x = best.x; p.y = best.y + 10; } }
      if (m.heli) { const v = world.vehicles.find((q) => VEHICLES[q.kind].air); if (v) { v.x = p.x; v.y = p.y; v.z = 150; v.seats[0] = p.id; p.veh = v.id; } }
    } break;
    case "item": itemAct(p, m); break;
    case "trade": trade(p, String(m.sym), +m.n || 0); break;
    case "mkh": p.pe.push({ k: "mkh", hist: game.market.hist }); break;
    case "elect": if (game.elec && Number.isInteger(m.i) && m.i >= 0 && m.i < game.elec.cands.length) game.elec.votes.set(p.id, m.i); break;
    case "cg": cardAct(p, m); break;
    case "stall": stallAct(p, m); break;
    case "buyzone": if (inDust(p) && rules().town && !p.dead) p.pe.push({ k: "shop", sid: "armoury" }); break; // B on Dust II
    case "reload": pressReload(p, p.weapons[p.active]); break;
    case "clean": cleanWeapon(p, m); break;
    case "hack": finishHack(p, m); break;
    case "hoe": if (!p.hoe) toast(p, "You haven't got a hoe. Vex's store sells them.", "#bbb"); else { p.hoeOut = !p.hoeOut; toast(p, p.hoeOut ? `${HOES[p.hoe]} out. Click to till a plot. F or 1/2 puts it away.` : "Hoe away.", "#c8e0a0"); } break;
    case "swap": p.hoeOut = false; if (p.weapons.length > 1) { p.active = m.i === 0 || m.i === 1 ? Math.min(m.i, p.weapons.length - 1) : 1 - p.active; } break;
    case "use": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else if (!p.dead) interact(p); break;
    case "skip": if (game.phase === "intro") game.skip.add(p.id); break;
    case "ready": if (game.phase === "lobby" || game.phase === "over") { p.ready = m.v === undefined ? !p.ready : !!m.v; feed(`${fullName(p)} is ${p.ready ? "ready" : "not ready"}`, p.ready ? "#8f8" : "#aaa"); } break;
    case "build": if (["day", "night", "royale"].includes(game.phase) && !p.dead && !p.air && !p.veh) placePiece(p, String(m.kind), +m.x || 0, +m.y || 0, false); break;
    case "dlg": pickDlg(p, m.i | 0); break;
    // the host's lobby buttons: start now, ready or not, and show someone the door
    case "force": if (p.id === hostId() && (game.phase === "lobby" || game.phase === "over") && !game.force) { game.force = true; feed(`${fullName(p)} (host) is starting the game`, "#ffd34d"); } break;
    case "kick": { const q = players.get(+m.id); if (p.id === hostId() && q && q !== p) { feed(`${fullName(q)} was kicked by the host`, "#f88"); try { q.ws.send(JSON.stringify({ t: "kicked" })); q.ws.close(); } catch {} } } break;
    case "mode": if (p.id === hostId() && (game.phase === "lobby" || game.phase === "over") && own(MODE_RULES, m.m)) { game.mode = m.m; broadcastRaw(JSON.stringify(mapMsg())); } break;
    case "shout": doShout(p); break;
    case "elem": cycleElement(p); break;
    case "go": relieve(p); break;
    case "throw": throwIt(p, m.k === "molo" ? "molo" : "gren"); break;
    case "mech": deployMech(p); break;
    case "dodge": if (game.phase === "intro") game.skip.add(p.id); else if (p.air === "plane") jump(p); else doDodge(p); break;
    case "buy": buy(p, m.item); break;
    case "spin": doSpin(p); break;
    case "casino": casinoAct(p, m); break;
    case "equip": equip(p, String(m.slot), String(m.id)); break;
    case "learn": learn(p, String(m.s)); break;
    case "vote": if (game.vote && Number.isInteger(m.i) && m.i >= 0 && m.i < game.vote.ev.choices.length) game.vote.votes.set(p.id, m.i); break;
    case "bug": fileBug(p, m); break;
    case "fix": finishFix(p, m); break;
    case "chat": { const text = String(m.text || "").slice(0, 120).trim(); if (text) chat(fullName(p), text, p.color), world.events.push({ k: "say", id: p.id, text }); break; }
  }
}
// ---------------------------------------------------------------- bug reports
// Players press F8 (or the bug button) and write what went wrong. It's appended to bug-reports.txt next to the exe,
// with where they were and what the game was doing, so it can be uploaded as is.
const COMPILED = /^(B:[\\/]~BUN|\/\$bunfs)/i.test(Bun.main || "");
const HOME_DIR = COMPILED ? path.dirname(process.execPath) : process.cwd();
const BUG_FILE = path.join(HOME_DIR, "bug-reports.txt");
const BUILD = (() => { try { return fs.readFileSync(path.join(HOME_DIR, "version.txt"), "utf8").trim() || "dev"; } catch { return "dev"; } })();
function bugLog(text) {
  try { fs.appendFileSync(BUG_FILE, `==== ${new Date().toISOString()} · ${BUILD}\n${text}\n\n`); return true; } catch (err) { console.error("Couldn't write the bug report:", err.message); return false; }
}
function fileBug(p, m) {
  const t = now();
  if (t < (p.bugAt || 0)) return toast(p, "Easy. One report every few seconds.", "#bbb");
  p.bugAt = t + 5;
  const text = String(m.text || "").replace(/\r/g, "").slice(0, 2000).trim();
  if (!text) return toast(p, "Write something first.", "#bbb");
  const errs = Array.isArray(m.errors) ? m.errors.slice(-5).map((e) => "  " + String(e).slice(0, 400)).join("\n") : "";
  const w = p.weapons[p.active];
  const info = [
    `From: ${fullName(p)} (${CLASSES[p.cls].name}, level ${p.lvl})`,
    `Game: ${game.mode} · ${game.phase} · night ${game.night}${game.disaster ? ` · ${game.disaster.kind}` : ""}${game.dinoDay || game.dino ? " · dinosaurs" : ""} · ${players.size} player${players.size === 1 ? "" : "s"} · ${world.zombies.length} zombies`,
    `Where: x ${Math.round(p.x)}, y ${Math.round(p.y)}, z ${Math.round(p.z)}${p.dead ? " (dead)" : ""}${p.veh ? " (in a vehicle)" : ""}${p.dlg ? ` (talking to ${p.dlg.npc})` : ""} · hp ${Math.round(p.hp)} · ${w ? w.type : "?"} ${w ? w.ammo : ""} · ${p.gold}g`,
    `Browser: ${String(m.ua || "").slice(0, 160)}`,
  ].join("\n");
  const kind = m.kind === "Idea" ? "IDEA" : "BUG";
  const ok = bugLog(`[${kind}] ${info}\n\n${text}${errs ? `\n\nRecent browser errors:\n${errs}` : ""}`);
  toast(p, ok ? (kind === "IDEA" ? "Idea saved. Thanks!" : "Bug report saved. Thanks!") : "Couldn't save the report on the host's PC. Tell them in chat.", ok ? "#8f8" : "#f88");
  if (ok) console.log(`  Bug report from ${fullName(p)} saved to ${BUG_FILE}`);
}
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") return srv.upgrade(req, { data: { pid: 0 } }) ? undefined : new Response("Upgrade failed", { status: 400 });
    if (url.pathname === "/three.js") return new Response(threeJs, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "max-age=86400" } });
    if (url.pathname === "/game.js") return new Response(gameJs, { headers: { "content-type": "application/javascript; charset=utf-8" } });
    if (url.pathname === "/") return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    perMessageDeflate: true, // with send(..., true): snapshots shrink about 3x on the wire, map messages about 7x
    open(ws) {
      ws.data.fresh = true; // its first snapshot is a full one; deltas after that
      spectators.add(ws);
      ws.send(JSON.stringify({ t: "hello", wheel: WHEEL, cosmetics: COSMETICS, freeHats: FREE_HATS, shop: SHOP, shops: SHOPS, domeR: DOME_R, enhCost: ENH_COST, enhChance: ENH_CHANCE, pieces: PIECES, legends: LEGENDS, items: ITEMS, crops: CROPS, seedPack: SEED_PACK, gear: GEAR, cards: CARDS, locs: LOCS, stocks: STOCKS, cands: CANDIDATES, dust: DUST }), true);
      ws.send(JSON.stringify(mapMsg()), true);
      ws.send(JSON.stringify({ t: "ck", reset: 1, seed: world.MAP_SEED, walls: world.WALLS.filter((w) => w.ck), bio: [...CHUNKS].filter(([, c]) => c.kind !== "town").map(([k, c]) => [...k.split(",").map(Number), c.kind]) }), true);
    },
    // one bad message (a stale client, a typo'd field) used to throw out of here and stop the whole server
    message(ws, raw) { try { onMessage(ws, raw); } catch (err) { console.error(err); if (now() - msgErrAt > 30) { msgErrs = 0; msgErrAt = now(); } if (msgErrs++ < 3) bugLog(`SERVER ERROR (message)\n${String(raw).slice(0, 200)}\n${err && err.stack || err}`); } },
    close(ws) {
      spectators.delete(ws);
      const p = players.get(ws.data.pid);
      if (p) { if (p.veh) exitVehicle(p);
        if (p.hearthBonus && (game.phase === "day" || game.phase === "night")) { game.hearthMax -= 250; game.hearth = Math.max(1, Math.min(game.hearthMax, game.hearth - 250)); } // rejoining doesn't heal the Hearth
        if (p.fix) endFix(p, "left"); players.delete(p.id); feed(`${fullName(p)} left the valley`, "#aaa"); if (game.vote) game.vote.votes.delete(p.id); }
      if (players.size === 0 && game.phase !== "lobby") { game.phase = "lobby"; world.zombies = []; world.projs = []; world.caches = []; fires.clear(); world.crates = []; world.vehicles = []; world.builds = []; world.WALLS = world.WALLS.filter((w) => w.kind !== "built"); game.vote = null; game.zone = null; game.drop = null; game.pendingVote = null; }
    },
  },
});
// a crash in one tick shouldn't take the whole valley down: log it to the bug file and carry on
let tickErrs = 0, tickErrAt = 0;
setInterval(() => {
  try { tick(); } catch (err) {
    world.lastT = now(); console.error(err);
    if (now() - tickErrAt > 30) { tickErrs = 0; tickErrAt = now(); }
    if (tickErrs++ < 3) bugLog(`SERVER ERROR\n${err && err.stack || err}`);
  }
}, 1000 / TICK_RATE);
const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(`
  ==============================================
     SLOP VALLEY server running on port ${server.port}
  ==============================================
   You (host):      http://localhost:${server.port}
${lan.map((ip) => `   Same Wi-Fi/LAN:  http://${ip}:${server.port}`).join("\n")}
   Friends online:  http://<your public IP>:${server.port}
                    (forward TCP port ${server.port} on your router to this PC)
   Bug reports are saved to: ${BUG_FILE}
   Close this window to stop the server.
`);
fetch("https://api.ipify.org").then((r) => r.text()).then((ip) => {
  if (/^[\d.]+$/.test(ip)) console.log(`   Your public IP looks like ${ip}  ->  send friends http://${ip}:${server.port}\n`);
}).catch(() => {});
