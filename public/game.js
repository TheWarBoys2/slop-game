// SLOP VALLEY — browser client
(() => {
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
const $ = (id) => document.getElementById(id);
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = window.devicePixelRatio || 1;
  VW = innerWidth; VH = innerHeight;
  cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + "px"; cv.style.height = VH + "px";
}
addEventListener("resize", resize); resize();

// ---------------------------------------------------------------- constants
const RARITY_COL = ["#d8d8d8", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"];
const RARITY = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
const ENH = ["", "PRI", "DUO", "TRI", "TET", "PEN"];
const WNAME = { pistol: "Pistol", smg: "SMG", shotgun: "Shotgun", rifle: "Rifle", sniper: "Sniper", staff: "Fire Staff", ak: "AK-Maybe", sword: "Slop Sword", rocket: "Rocket Launcher" };
const TRACER = { pistol: "#ffe9a0", smg: "#ffe9a0", shotgun: "#ffcf70", rifle: "#fff3b0", sniper: "#ffffff", staff: "#ff7a2a", ak: "#ffb0ff", rocket: "#ffb040" };
// ---------------------------------------------------------------- view: first person, third person, or the classic top-down map
const VIEWS = ["fp", "tp", "top"], VIEW_NAME = { fp: "First person", tp: "Third person", top: "Classic top-down" };
let viewMode = (() => { try { return localStorage.getItem("slop-view") || "fp"; } catch { return "fp"; } })();
if (!VIEWS.includes(viewMode)) viewMode = "fp";
const has3d = typeof R3D !== "undefined" && R3D.init();
let yaw = 0, pitch = 0, yawInit = false, aimYaw = 0, aimPitch = 0, use3d = false, camNow = null, lastShotT = -9, viewT = -9;
const slashT = new Map();
const COLORS = ["#e0b050", "#e05050", "#50a0e0", "#60c060", "#c070e0", "#f08040", "#f0f0f0", "#40d0c0"];
const HATS = [["none", "None"], ["crown", "Crown"], ["cowboy", "Cowboy"], ["wizard", "Wizard"], ["horns", "Iron Helmet"], ["flower", "Flower"]];
const CLASSES = [
  ["fighter", "Fighter", "150 HP. Starts with an SMG. Hits things until they stop moving."],
  ["rogue", "Rogue", "Fast and fragile. 25% crit chance for double damage. Quicker dodge."],
  ["wizard", "Wizard", "Fire Staff: explosive bolts. Also explodes friends (30%)."],
  ["farmer", "Farmer", "Shotgun, 6 seeds, crops grow twice as fast and sell for more."],
  ["gaffer", "Gaffer", "The Manager. Teammates near you deal +20% dmg and move faster. You take a 10% agent fee on everyone's earnings."],
];
const BACKGROUNDS = [
  ["soldier", "Soldier", "Starts with a rank of Steady Hands."], ["farmhand", "Farmhand", "Starts with a rank of Green Thumb."],
  ["noble", "Noble", "Starts with +100 gold. Insufferable."], ["outlander", "Outlander", "Starts with a rank of Fleet."],
  ["acolyte", "Acolyte", "Starts with a rank of Thu'um."], ["urchin", "Urchin", "Starts with a rank of Scavenger."],
];
const EYES = [["dot", "Dots"], ["angry", "Angry"], ["sleepy", "Sleepy"], ["googly", "Googly"], ["shades", "Shades"]];
const TREES = ["Marksman", "Survivor", "Homesteader", "Voice"];
const SKILL_INFO = {
  deadeye: ["Deadeye", 0, "Headshots deal +25% more damage per rank."], steady: ["Steady Hands", 0, "Spray bloom -20% per rank."], quick: ["Quick Hands", 0, "Reload 15% faster per rank."],
  tough: ["Tough as Boots", 1, "+20 max HP per rank."], wind: ["Second Wind", 1, "Regenerate 1.5 HP/s per rank after 3s unhurt."], fleet: ["Fleet", 1, "+6% move speed per rank."],
  green: ["Green Thumb", 2, "Crops you plant grow 25% faster per rank."], haggler: ["Haggler", 2, "Shop prices -10% per rank."], scavenger: ["Scavenger", 2, "20% chance per rank to upgrade crate loot a tier."],
  thuum: ["Thu'um", 3, "Shout recharges 15% faster and reaches 15% further per rank."], rally: ["Rally", 3, "Allies near you regenerate 0.8 HP/s per rank."], bloodlust: ["Bloodlust", 3, "Heal 3 HP per rank on every kill."],
};
const BOSS_NAME = { leshen: "THE SLOP LESHEN", drowned: "THE DROWNED MAYOR", golem: "VEX'S BRASS GOLEM" };
const TRAIT_DESC = {
  Strong: "+25 max HP", Swift: "+12% speed", Greedy: "+25% gold", Craven: "+20% speed, -15% damage", Wrathful: "+20% damage, -15 HP",
  Bald: "No effect. Just bald.", Genius: "Shout recharges 40% faster", Drunkard: "+20 HP, terrible aim", Inbred: "-10 HP", Lucky: "Better crits, cases & enhancing",
};

// ---------------------------------------------------------------- join form
const saved = (() => { try { return JSON.parse(localStorage.getItem("slop-profile") || "{}"); } catch { return {}; } })();
let choice = { name: saved.name || "", color: saved.color || COLORS[(Math.random() * COLORS.length) | 0], hat: saved.hat || "none", cls: saved.cls || "fighter", bg: saved.bg || "soldier", trait: saved.trait || "random", eyes: saved.eyes || "dot" };
$("name").value = choice.name;
function buildOpts(el, items, key, render) {
  el.innerHTML = "";
  for (const it of items) {
    const d = render(it);
    d.onclick = () => { choice[key] = d.dataset.v; for (const c of el.children) c.classList.toggle("sel", c === d); };
    d.classList.toggle("sel", d.dataset.v === choice[key]);
    el.appendChild(d);
  }
}
buildOpts($("colors"), COLORS, "color", (c) => { const d = document.createElement("div"); d.className = "sw"; d.style.background = c; d.dataset.v = c; return d; });
buildOpts($("hats"), HATS, "hat", ([v, n]) => { const d = document.createElement("div"); d.className = "opt"; d.textContent = n; d.dataset.v = v; return d; });
buildOpts($("eyes"), EYES, "eyes", ([v, n]) => { const d = document.createElement("div"); d.className = "opt"; d.textContent = n; d.dataset.v = v; return d; });
buildOpts($("bgs"), BACKGROUNDS, "bg", ([v, n, desc]) => { const d = document.createElement("div"); d.className = "cls"; d.innerHTML = `<b>${n}</b><small>${desc}</small>`; d.dataset.v = v; return d; });
buildOpts($("traits"), [["random", "Random"], ...Object.keys(TRAIT_DESC).map((k) => [k, k])], "trait", ([v, n]) => { const d = document.createElement("div"); d.className = "opt"; d.textContent = n; d.title = TRAIT_DESC[v] || "Let fate decide"; d.dataset.v = v; return d; });
buildOpts($("classes"), CLASSES, "cls", ([v, n, desc]) => { const d = document.createElement("div"); d.className = "cls"; d.innerHTML = `<b>${n}</b><small>${desc}</small>`; d.dataset.v = v; return d; });
$("go").onclick = () => {
  choice.name = $("name").value.trim() || "Peasant";
  try { localStorage.setItem("slop-profile", JSON.stringify(choice)); } catch {}
  send({ t: "join", ...choice });
  joined = true;
  $("go").blur();
  $("join").classList.add("hidden");
};
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("go").click(); });

// ---------------------------------------------------------------- network
let WHEEL = [], COSM = {}, FREE_HATS = [], myCos = [];
let ws, MAP = null, SHOP = null, ENH_COST = [], ENH_CHANCE = [], PIECES = {}, VEH = {}, LEGENDS = {};
let S = null; // latest snapshot
let me = 0, joined = false;
const disp = new Map(); // smoothed positions by key
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "hello") { WHEEL = m.wheel || []; COSM = m.cosmetics || {}; FREE_HATS = m.freeHats || []; SHOP = m.shop; ENH_COST = m.enhCost; ENH_CHANCE = m.enhChance; PIECES = m.pieces || {}; VEH = m.vehicles || {}; LEGENDS = m.legends || {}; renderBuildBar(); if (joined) send({ t: "join", ...choice }); return; }
    if (m.t === "map") { const fresh = !MAP || MAP.seed !== m.map.seed; MAP = m.map; if (fresh) { buildDecor(); disp.clear(); } return; }
    if (m.t === "s") onSnap(m);
  };
  ws.onclose = () => { setTimeout(connect, 1500); };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
connect();

// ---------------------------------------------------------------- effects
const fx = []; // {kind, t0, dur, ...}
const toasts = [];
const feed = [];
const chatLog = [];
const bubbles = new Map();
let banner = null, wasted = 0, caseAnim = null, enhAnim = null, shake = 0, hurtFlash = 0;
const T = () => performance.now() / 1000;

function onSnap(m) {
  const prevPhase = S?.g.ph;
  S = m; me = m.me;
  if (MAP && MAP.npcs && m.np) for (const [id, x, y, a] of m.np) { const n = MAP.npcs.find((q) => q.id === id); if (n) { n.x = x; n.y = y; n.a = a; } }
  for (const e of m.e) handleEvent(e);
  for (const e of m.pe) handlePersonal(e);
  if (m.g.ph === "over" && prevPhase !== "over") showOver();
  if (m.g.ph !== "over") $("over").classList.add("hidden");
  if (m.g.ph === "night" && shopOpen) toggleShop(false);
  renderStory();
  const mr = m.p.find((p) => p.id === me);
  if (mr && mr.rl > 0) { const end = T() + mr.rl; if (!rel.end || Math.abs(end - rel.end) > 0.15) rel.end = end; rel.total = mr.rt; rel.tried = !!mr.rtr; } else rel.end = 0;
  const hostId = m.p.length ? Math.min(...m.p.map((p) => p.id)) : 0;
  if (m.g.ph !== "day" && m.g.ph !== "night" && m.g.ph !== "lobby" && dlgOpen) showDlg({ close: 1 });
  const canMode = joined && hostId === me && (m.g.ph === "lobby" || m.g.ph === "over");
  for (const el of document.querySelectorAll(".modeBtns")) el.classList.toggle("hidden", !canMode);
  for (const b of document.querySelectorAll(".modeBtns button")) b.classList.toggle("sel", b.dataset.m === m.g.mode);
  renderLobby(m, hostId);
  if (m.g.intro) { const start = T() - m.g.intro.at; if (!intro || m.g.ph !== prevPhase || Math.abs(start - intro.start) > 0.4) intro = { start, len: m.g.intro.len, mode: m.g.mode, cast: m.g.intro.cast, prev: m.g.prev, shot: -1 }; intro.skip = m.g.intro.skip; }
  else intro = null;
  if (building && !["day", "night", "royale"].includes(m.g.ph)) toggleBuild(false);
  const mine = m.p.find((p) => p.id === me);
  if (mine && pred.init === false) { pred.x = mine.x; pred.y = mine.y; pred.z = mine.z || 0; pred.init = true; }
  if (mine) {
    const mv = mine.mv || [0, 0, 0, 1];
    pred.srv = { x: mine.x, y: mine.y, z: mine.z || 0, vx: mv[0], vy: mv[1], vz: mv[2], gr: !!mv[3] };
    if (mine.d) { pred.x = mine.x; pred.y = mine.y; pred.z = mine.z || 0; }
    if (!yawInit && !mine.d) { yaw = mine.a; yawInit = true; }
  }
}
function handleEvent(e) {
  const t = T();
  if (e.k === "tr") { fx.push({ kind: "tr", t0: t, dur: e.c === "sniper" ? 0.25 : use3d ? 0.12 : 0.08, col: parseInt((TRACER[e.c] || "#ffffff").slice(1), 16), ...e }); if (Math.hypot(e.x1 - pred.x - Math.cos(aimYaw) * 20, e.y1 - pred.y - Math.sin(aimYaw) * 20) < 4) lastShotT = t; const d = Math.hypot(e.x1 - pred.x, e.y1 - pred.y); if (d < 700) sfx("shot", 1 - d / 700, e.c); }
  else if (e.k === "boom") { fx.push({ kind: "boom", t0: t, dur: 0.4, ...e }); nearShake(e, 8); sfx("boom"); }
  else if (e.k === "shout") { const el = ELEMS[e.el] || ELEMS.force; fx.push({ kind: "shout", t0: t, dur: 0.7, ...e, text: e.text || el.word + "!", col: el.hex, c2: el.rgb }); nearShake(e, 10); sfx("shout", 1, e.el); }
  else if (e.k === "burn") fx.push({ kind: "burn", t0: t, dur: 0.8, x: e.x + (Math.random() - 0.5) * 20, y: e.y });
  else if (e.k === "trample") fx.push({ kind: "text", t0: t, dur: 1, x: e.x, y: e.y, text: e.burnt ? "burnt!" : "trampled!", color: e.burnt ? "#f84" : "#c96" });
  else if (e.k === "roar") { fx.push({ kind: "shout", t0: t, dur: 0.8, x: e.x, y: e.y, a: 0, full: true, ...(e.rex ? { col: 0xc8a040, c2: "200,160,64" } : {}) }); shake = Math.max(shake, e.rex ? 18 : 12); if (e.rex && Math.hypot(e.x - pred.x, e.y - pred.y) < 1100) sfx("rex"); }
  else if (e.k === "hhit") { hearthHitT = t; }
  else if (e.k === "feed") pushLim(feed, { text: e.text, color: e.color, t }, 6);
  else if (e.k === "chat") pushLim(chatLog, { from: e.from, text: e.text, color: e.color, t }, 8);
  else if (e.k === "say") bubbles.set(e.id, { text: e.text, t });
  else if (e.k === "banner") { banner = { text: e.text, sub: e.sub, t }; sfx("banner"); }
  else if (e.k === "vote") sfx("banner");
  else if (e.k === "clue") { sfx("lvl"); clueT = t; }
  else if (e.k === "land") fx.push({ kind: "boom", t0: t, dur: 0.35, x: e.x, y: e.y, r: 30, dust: true });
  else if (e.k === "built") { fx.push({ kind: "boom", t0: t, dur: 0.3, x: e.x, y: e.y, r: 24, dust: true }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 500) sfx("hit"); }
  else if (e.k === "bhit") pieceHit.set(e.id, t);
  else if (e.k === "cd") sfx("lvl");
  else if (e.k === "legend") { legendT = t; legendKind = e.kind; sfx("banner"); }
  else if (e.k === "mess") pushLim(messes, { ...e, t }, 60);
  else if (e.k === "slash") { slashT.set(e.id, t); fx.push({ kind: "slash", t0: t, dur: 0.22, ...e }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 600) sfx("shout", 0.25); }
  else if (e.k === "shame") { shameT = t; shameWho = e; sfx("shame"); shake = Math.max(shake, 10); sayShame(e.who); }
  else if (e.k === "bile") { fx.push({ kind: "boom", t0: t, dur: 0.7, x: e.x, y: e.y, z: e.z, r: e.r * 0.7, col: 0x9fd040, c2: "159,208,64" }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 600) sfx("bile"); }
  else if (e.k === "scream") { fx.push({ kind: "shout", t0: t, dur: 1.2, x: e.x, y: e.y, z: e.z, a: 0, full: true, col: 0xff4040 }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 900) sfx("scream"); }
  else if (e.k === "glass") { fx.push({ kind: "boom", t0: t, dur: 0.35, x: e.x, y: e.y, z: e.z, r: 50, col: 0xffa030, c2: "255,160,48" }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 700) sfx("glass"); }
  else if (e.k === "throw") { if (Math.hypot((S?.p.find((p) => p.id === e.id)?.x ?? 1e9) - pred.x, (S?.p.find((p) => p.id === e.id)?.y ?? 1e9) - pred.y) < 600) sfx("throw"); }
  else if (e.k === "pad") { if (Math.hypot(e.x - pred.x, e.y - pred.y) < 600) sfx("perfect", 0.6); }
  else if (e.k === "splash") { fx.push({ kind: "boom", t0: t, dur: 0.6, x: e.x, y: e.y, z: -12, r: 40, dust: true, col: 0xbfe8ff, c2: "190,230,255" }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 600) sfx("splash"); }
  else if (e.k === "glyph") { fx.push({ kind: "shout", t0: t, dur: 0.9, x: e.x, y: e.y, z: e.z, a: 0, full: true, col: e.g < 0 ? 0xff4040 : 0x60e0ff, c2: e.g < 0 ? "255,64,64" : "96,224,255" }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 700) sfx(e.g < 0 ? "jam" : "perfect"); }
  else if (e.k === "wedding") { sfx("goal"); for (let i = 0; i < 18; i++) fx.push({ kind: "text", t0: t + i * 0.05, dur: 2, x: pred.x + (Math.random() - 0.5) * 300, y: pred.y + (Math.random() - 0.5) * 200, z: 60 + Math.random() * 60, text: "♥", color: ["#ff8fc8", "#ff5fa0", "#fff"][i % 3], big: true }); }
  else if (e.k === "collapse") { fx.push({ kind: "boom", t0: t, dur: 0.9, x: e.x, y: e.y, z: 10, r: Math.max(e.w, e.h) * 0.6, dust: true }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 700) { sfx("boom", 0.6); shake = Math.max(shake, 6); } }
  else if (e.k === "zap") { fx.push({ kind: "zap", t0: t, dur: 0.35, pts: e.pts }); if (Math.hypot(e.pts[0][0] - pred.x, e.pts[0][1] - pred.y) < 900) sfx("zap"); }
  else if (e.k === "meteor") { fx.push({ kind: "boom", t0: t, dur: 0.8, x: e.x, y: e.y, z: e.z, r: 170 }); fx.push({ kind: "boom", t0: t, dur: 1.4, x: e.x, y: e.y, z: e.z, r: 120, dust: true }); const d = Math.hypot(e.x - pred.x, e.y - pred.y); if (d < 1200) { sfx("boom", 1 - d / 1400); shake = Math.max(shake, 16 * (1 - d / 1200)); } }
  else if (e.k === "quake") shake = Math.max(shake, 14);
  else if (e.k === "ballkick") { if (Math.hypot(e.x - pred.x, e.y - pred.y) < 600) sfx("kick"); }
  else if (e.k === "goal") { sfx("goal"); fx.push({ kind: "text", t0: t, dur: 2, x: e.x, y: e.y, z: 80, text: "GOAL!", color: "#ffd34d", big: true }); }
  else if (e.k === "alarm") { fx.push({ kind: "shout", t0: t, dur: 1.5, x: e.x, y: e.y, a: 0, full: true, col: 0xff3030, c2: "255,48,48" }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 1000) sfx("alarm"); }
  else if (e.k === "hacked") { fx.push({ kind: "text", t0: t, dur: 1.6, x: e.x, y: e.y, z: 60, text: `ACCESS GRANTED ${e.n}/3`, color: "#7dffb0", big: true }); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 700) sfx("perfect"); }
}
function handlePersonal(e) {
  const t = T();
  if (e.k === "toast") pushLim(toasts, { text: e.text, color: e.color, t }, 4);
  else if (e.k === "dmg") {
    fx.push({ kind: "text", t0: t, dur: 0.7, x: e.x + (Math.random() - 0.5) * 16, y: e.y, z: e.z, text: e.hs ? `${e.v}!` : String(e.v), color: e.ff ? "#ff5050" : e.hs ? "#ff9d2e" : e.crit ? "#ffd34d" : "#fff", big: e.crit || e.hs });
    if (e.hs) { hsT = t; sfx("hs"); } else sfx("hit");
  }
  else if (e.k === "lvl") { pushLim(toasts, { text: `LEVEL ${e.lvl}!  Press K to spend your skill point`, color: "#9fe0ff", t }, 4); sfx("lvl"); }
  else if (e.k === "perfect") { pushLim(toasts, { text: "SMOOTH RELOAD  +20% damage this mag", color: "#7dffb0", t }, 4); sfx("perfect"); }
  else if (e.k === "jam") { pushLim(toasts, { text: "Fumbled the reload!", color: "#ff8080", t }, 4); sfx("jam"); }
  else if (e.k === "gold") pushLim(toasts, { text: `+${e.amt}g  ${e.reason}`, color: "#ffd34d", t }, 4);
  else if (e.k === "hurt") { hurtFlash = t; shake = Math.max(shake, 5); sfx("hurt"); }
  else if (e.k === "eff") fx.push({ kind: "text", t0: t, dur: 1, x: e.x, y: e.y, z: e.z, text: e.m > 1 ? "SUPER EFFECTIVE!" : "not very effective...", color: e.m > 1 ? "#ffd34d" : "#9aa", big: e.m > 1 });
  else if (e.k === "click") sfx("click");
  else if (e.k === "jammed") { pushLim(toasts, { text: "JAMMED! Press R to clear it. Press L to strip and clean your gun.", color: "#ff8060", t }, 4); sfx("jam"); }
  else if (e.k === "hack") openHack(e);
  else if (e.k === "love") { const n = MAP.npcs && MAP.npcs.find((q) => q.id === e.npc); pushLim(toasts, { text: `${n ? n.name : ""}  ${hearts(e.v)}`, color: e.d === "hate" ? "#ff8080" : "#ff8fc8", t }, 4); sfx(e.d === "hate" ? "jam" : "perfect"); }
  else if (e.k === "kick") { pred.vx += e.vx; pred.vy += e.vy; pred.vz = Math.max(pred.vz, 0) + e.vz; if (e.vz > 0) pred.gr = false; }
  else if (e.k === "deaf") { deafT = t; shake = Math.max(shake, 8); }
  else if (e.k === "wasted") { wasted = t; wastedPlace = e.place || 0; }
  else if (e.k === "dlg") showDlg(e);
  else if (e.k === "wheel") { wheelAnim = { t0: t, from: wheelAngle, seg: e.seg }; sfx("banner"); toggleCasino(true); }
  else if (e.k === "casino") { casinoState = e; if (e.game || (e.spins && wantCasino)) { wantCasino = false; toggleCasino(true); } renderCasino(); }
  else if (e.k === "cos") { myCos = e.list; if (wardOpen) renderWardrobe(); }
  else if (e.k === "fog") fogT = t;
  else if (e.k === "case" && e.spins) { wantCasino = true; caseAnim = { t0: t, type: e.type, rarity: e.rarity, name: e.name, reel: makeReel(e.type, e.rarity, e.name) }; }
  else if (e.k === "case") caseAnim = { t0: t, type: e.type, rarity: e.rarity, name: e.name, reel: makeReel(e.type, e.rarity, e.name) };
  else if (e.k === "enh") { enhAnim = { t0: t, ...e }; sfx(e.ok ? "lvl" : "jam"); }
  else if (e.k === "sym") { symT = t; pushLim(toasts, { text: e.text, color: e.sym ? "#9fdc5a" : "#8f8", t }, 4); if (e.sym) { sfx("hurt"); keys.clear(); } }
  else if (e.k === "accident") { shake = Math.max(shake, 6); sfx("jam"); }
  else if (e.k === "unlucky") { banner = { text: "THE 0.004%", sub: `Level ${e.lv}, every skill point and every upgrade: gone. It was always going to be someone.`, t }; sfx("banner"); shake = 14; }
}
const messes = [];
let symT = -9, adsDown = false, adsZoom = 1, watcher = null;
const view = { cx: 0, cy: 0, z: 1, sx: 0, sy: 0 };
const toScr = (x, y) => ({ x: (x - view.cx) * view.z + VW / 2 + view.sx, y: (y - view.cy) * view.z + VH / 2 + view.sy });
function myScr() { return !use3d && S && S.p.some((p) => p.id === me) ? toScr(pred.x, pred.y) : { x: VW / 2, y: VH / 2 }; }
function pushLim(arr, v, n) { arr.push(v); while (arr.length > n) arr.shift(); }
function nearShake(e, amt) { if (Math.hypot(e.x - pred.x, e.y - pred.y) < 500) shake = Math.max(shake, amt); }
let shameT = -99, shameWho = null, deafT = -99, cleanOpen = false, hackOpen = false;
let hearthHitT = 0, hsT = -9, localReloadTry = 0, wastedPlace = 0, fogT = -9, clueT = -9, legendT = -99, legendKind = null, intro = null;
const pieceHit = new Map();
const rel = { end: 0, total: 1, tried: false };
function makeReel(type, rarity, name) {
  const types = Object.keys(WNAME).filter((k) => k !== "pistol");
  const reel = [];
  for (let i = 0; i < 40; i++) { const r = Math.random() * 100; reel.push({ type: types[(Math.random() * types.length) | 0], rarity: r < 4 ? 3 : r < 15 ? 2 : r < 40 ? 1 : 0 }); }
  reel[34] = { type, rarity, name };
  return reel;
}

// ---------------------------------------------------------------- input
const keys = new Set();
let mouseX = 0, mouseY = 0, mouseDown = false, chatting = false, shopOpen = false, showScores = false;
addEventListener("keydown", (e) => {
  if (!joined) return;
  if (chatting) {
    if (e.key === "Enter") { const v = $("chatin").value.trim(); if (v) send({ t: "chat", text: v }); closeChat(); }
    else if (e.key === "Escape") closeChat();
    return;
  }
  if (cleanOpen || hackOpen) { if (e.key === "Escape") { if (cleanOpen) closeClean(true); else closeHack(true); } return; }
  const k = e.key.toLowerCase();
  if (k === "tab") { e.preventDefault(); showScores = true; return; }
  if (k === "enter") { openChat(); e.preventDefault(); return; }
  if (k === "b") { toggleSkills(false); toggleBuild(false); toggleShop(); return; }
  if (k === "f" && S && (S.g.ph === "lobby" || S.g.ph === "over")) { send({ t: "ready" }); return; }
  if (k === "c" && !pred.swim && !flying()) { toggleBuild(); return; }
  if (building && /^[1-4]$/.test(k)) { buildKind = Object.keys(PIECES)[Number(k) - 1] || buildKind; renderBuildBar(); return; }
  if (building && k === "escape") { toggleBuild(false); return; }
  if (dlgOpen && /^[1-9]$/.test(k)) { send({ t: "dlg", i: Number(k) - 1 }); return; }
  if (k === "escape" && dlgOpen) { send({ t: "dlg", i: -1 }); return; }
  if (k === "k") { toggleSkills(); return; }
  if (k === "j") { toggleJournal(); return; }
  if (k === "g") { toggleCasino(); return; }
  if (k === "v") { toggleWardrobe(); return; }
  if (k === "o") { toggleOptions(); return; }
  if (k === "escape" && optsOpen) { toggleOptions(false); return; }
  if (k === "escape" && (casinoOpen || wardOpen)) { toggleCasino(false); toggleWardrobe(false); return; }
  if (k === "escape") { toggleShop(false); toggleSkills(false); toggleJournal(false); return; }
  if (shopOpen && /^[0-9]$/.test(k)) { const items = Object.keys(SHOP); const i = (Number(k) + 9) % 10; if (items[i]) send({ t: "buy", item: items[i] }); return; }
  if (k === "alt" || k === "insert") e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if (k === "x") send({ t: "go" });
  if (k === "r") { const mine = S?.p.find((p) => p.id === me); if (mine && mine.rl && !mine.rtr) localReloadTry = T(); send({ t: "reload" }); }
  if (k === "e") send({ t: "use" });
  if (k === "q") send({ t: "shout" });
  if (k === " ") { e.preventDefault(); const mine = S?.p.find((p) => p.id === me); if ((mine && mine.air === 1) || (S && S.g.ph === "intro")) send({ t: "dodge" }); } // jump (held); also bails out of the balloon
  if (k === "shift") { send({ t: "dodge" }); localDodge(); }
  if (k === "t") { viewMode = VIEWS[(VIEWS.indexOf(viewMode) + 1) % VIEWS.length]; try { localStorage.setItem("slop-view", viewMode); } catch {} viewT = T(); if (viewMode === "top") document.exitPointerLock?.(); }
  if (k === "1") send({ t: "swap", i: 0 });
  if (k === "2") send({ t: "swap", i: 1 });
  if (k === "3") send({ t: "throw", k: "gren" });
  if (k === "4") send({ t: "throw", k: "molo" });
  if (k === "z") send({ t: "elem" });
  if (k === "l") openClean();
});
addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); keys.delete(k); if (k === "alt") e.preventDefault(); if (k === "tab") showScores = false; });
addEventListener("blur", () => { keys.clear(); mouseDown = false; adsDown = false; showScores = false; });
cv.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === cv) { const sens = 0.0024 * OPTS.sens * (adsZoom > 1.05 ? 0.55 : 1); yaw += e.movementX * sens; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * sens * (OPTS.invert ? -1 : 1))); return; }
  mouseX = e.clientX; mouseY = e.clientY;
});
const menusOpen = () => cleanOpen || hackOpen || optsOpen || chatting || shopOpen || skillsOpen || casinoOpen || wardOpen || journalOpen || (S && S.g.ph === "over");
cv.addEventListener("mousedown", (e) => {
  if (use3d && document.pointerLockElement !== cv) { if (e.button === 0 && !menusOpen()) cv.requestPointerLock?.(); return; }
  if (building) { if (e.button === 0) { const g = ghostCell(); send({ t: "build", kind: buildKind, x: g.x, y: g.y }); } else toggleBuild(false); return; }
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) adsDown = true;
});
addEventListener("mouseup", (e) => { if (e.button === 2) adsDown = false; else mouseDown = false; });
cv.addEventListener("wheel", () => send({ t: "swap" }), { passive: true });
cv.addEventListener("contextmenu", (e) => e.preventDefault());
$("readyBtn").onclick = (e) => { e.target.blur(); send({ t: "ready" }); };
$("overReady").onclick = (e) => { e.target.blur(); send({ t: "ready" }); };
for (const b of document.querySelectorAll(".modeBtns button")) b.onclick = (e) => { e.target.blur(); send({ t: "mode", m: b.dataset.m }); };
// ---------------------------------------------------------------- lobby
let lobbySig = "";
function renderLobby(m, hostId) {
  const inLobby = joined && m.g.ph === "lobby";
  $("lobbyPanel").classList.toggle("hidden", !inLobby);
  const mine = m.p.find((p) => p.id === me);
  const ready = m.p.filter((p) => p.rd).length;
  const cd = m.g.cd >= 0 ? `Starting in ${Math.ceil(m.g.cd)}...` : ready ? `${ready}/${m.p.length} ready` : "";
  const sig = JSON.stringify([inLobby, m.g.ph, m.g.mode, m.p.map((p) => [p.id, p.n, p.rd, p.cl]), cd, hostId]);
  if (sig === lobbySig) return;
  lobbySig = sig;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  $("lpTitle").textContent = `${MAP ? MAP.valley : "Lobby"} · ${m.g.mode === "royale" ? "Royale" : m.g.mode === "endless" ? "Endless" : "Story"}`;
  $("lpList").innerHTML = m.p.map((p) => `<div class="lp-row"><span style="color:${p.c}">${p.id === hostId ? "♛ " : ""}${esc(p.n)}</span><span class="${p.rd ? "ok" : "no"}">${p.rd ? "READY" : "not ready"}</span></div>`).join("");
  $("lpMode").textContent = hostId === me ? "You're the host: pick the mode." : "The host picks the mode.";
  for (const b of [$("readyBtn"), $("overReady")]) { b.classList.toggle("on", !!(mine && mine.rd)); b.textContent = mine && mine.rd ? "Ready! (click to cancel)" : b.id === "readyBtn" ? "Ready" : "Ready for another round"; }
  $("lpCd").textContent = cd;
  $("overReadyInfo").textContent = m.g.ph === "over" ? (m.g.cd >= 0 ? `Everyone's ready. Starting in ${Math.ceil(m.g.cd)}...` : `${ready}/${m.p.length} ready. The next round starts when everyone is.`) : "";
}


// ---------------------------------------------------------------- Vex's Casino
let casinoOpen = false, casinoState = { spins: 0, game: null }, wheelAnim = null, wheelAngle = 0, wantCasino = false, pkHold = [false, false, false, false, false];
const esc2 = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function toggleCasino(force) {
  casinoOpen = force === undefined ? !casinoOpen : force;
  $("casino").classList.toggle("hidden", !casinoOpen);
  if (casinoOpen) { toggleShop(false); toggleSkills(false); keys.clear(); mouseDown = false; renderCasino(); }
}
$("casino").addEventListener("click", (e) => { if (e.target === $("casino")) toggleCasino(false); });
$("cSpin").onclick = (e) => { e.target.blur(); send({ t: "spin" }); };
const cardHtml = (c, i, pick) => { if (c === "??") return `<div class="card back"></div>`; const suit = { S: "♠", H: "♥", D: "♦", C: "♣" }[c[1]], r = c[0] === "T" ? "10" : c[0]; return `<div class="card${"HD".includes(c[1]) ? " red" : ""}${pick ? " pick" : ""}${pick && pkHold[i] ? " held" : ""}" data-i="${i}">${r}${suit}</div>`; };
function bjVal(cards) { let v = 0, a = 0; for (const c of cards) { if (c === "??") continue; if (c[0] === "A") { v += 11; a++; } else v += "TJQK".includes(c[0]) ? 10 : +c[0]; } while (v > 21 && a) { v -= 10; a--; } return v; }
function renderCasino() {
  if (!casinoOpen) return;
  const st = casinoState, g = st.game, spinning = !!wheelAnim;
  $("cSpins").textContent = `You have ${st.spins} spin${st.spins === 1 ? "" : "s"}.`;
  $("cSpin").disabled = !st.spins || spinning || !!g;
  let h = "";
  if (g && g.k === "bj") {
    h = `<h3 style="color:#3fbf6f;margin:10px 0 0">Blackjack · ${g.w} - ${g.l}</h3><div class="tag">Vex (${g.hide ? "?" : bjVal(g.d)})</div><div class="cards">${g.d.map((c, i) => cardHtml(c, i)).join("")}</div><div class="tag">You (${bjVal(g.p)})</div><div class="cards">${g.p.map((c, i) => cardHtml(c, i)).join("")}</div><div class="cmsg">${esc2(g.msg)}</div>` +
      (g.over ? `<button class="cbtn" data-a="leave">Leave the table</button>` : g.next ? `<button class="cbtn" data-a="deal">Next hand</button>` : `<button class="cbtn" data-a="hit">Hit</button><button class="cbtn alt" data-a="stand">Stand</button>`);
  } else if (g && g.k === "pk") {
    const hold = g.stage === "hold";
    h = `<h3 style="color:#4da6ff;margin:10px 0 0">Poker · five-card draw</h3><div class="tag">Vex</div><div class="cards">${(g.d || ["??", "??", "??", "??", "??"]).map((c, i) => cardHtml(c, i)).join("")}</div><div class="tag">You</div><div class="cards" id="pkCards">${g.p.map((c, i) => cardHtml(c, i, hold)).join("")}</div><div class="cmsg">${esc2(g.msg)}</div>` +
      (hold ? `<button class="cbtn" data-a="draw">Draw</button>` : `<button class="cbtn" data-a="leave">Leave the table</button>`);
  } else pkHold = [false, false, false, false, false];
  $("cGame").innerHTML = h;
  for (const b of $("cGame").querySelectorAll("button[data-a]")) b.onclick = () => { const a = b.dataset.a; send(a === "draw" ? { t: "casino", a, hold: pkHold } : { t: "casino", a }); if (a === "draw" || a === "leave") pkHold = [false, false, false, false, false]; };
  for (const c of $("cGame").querySelectorAll("#pkCards .card.pick")) c.onclick = () => { pkHold[+c.dataset.i] = !pkHold[+c.dataset.i]; renderCasino(); };
}
function wheelSlices() { const total = WHEEL.reduce((a, s) => a + s.w, 0); let a0 = 0; return WHEEL.map((s) => { const a = (s.w / total) * Math.PI * 2, r = { ...s, a0, a1: a0 + a }; a0 += a; return r; }); }
function drawWheel(t) {
  if (!casinoOpen || !WHEEL.length) return;
  const cvw = $("wheelCv"), w = cvw.getContext("2d"), R = 320, cx = 340, cy = 340, sl = wheelSlices();
  if (wheelAnim) {
    const k = Math.min(1, (t - wheelAnim.t0) / 4), s = sl[wheelAnim.seg];
    const target = -Math.PI / 2 - (s.a0 + s.a1) / 2, base = wheelAnim.from - (wheelAnim.from % (Math.PI * 2));
    const end = base + Math.PI * 2 * 6 + ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    wheelAngle = wheelAnim.from + (end - wheelAnim.from) * (1 - Math.pow(1 - k, 4));
    const tick = Math.floor(wheelAngle / 0.35); if (tick !== wheelAnim.tick) { wheelAnim.tick = tick; if (k < 0.97) sfx("hit"); }
    if (k >= 1) { wheelAnim = null; sfx(s.id === "jackpot" ? "lvl" : s.id === "bankrupt" || s.id === "lose" ? "jam" : "perfect"); pushLim(toasts, { text: `The wheel says: ${s.label}`, color: s.color === "#444" ? "#bbb" : s.color, t }, 4); renderCasino(); }
  }
  w.clearRect(0, 0, 680, 680);
  w.save(); w.translate(cx, cy); w.rotate(wheelAngle);
  for (const s of sl) {
    w.fillStyle = s.color; w.beginPath(); w.moveTo(0, 0); w.arc(0, 0, R, s.a0, s.a1); w.closePath(); w.fill();
    w.strokeStyle = "#1a1410"; w.lineWidth = 4; w.stroke();
    w.save(); w.rotate((s.a0 + s.a1) / 2); w.fillStyle = s.id === "jackpot" ? "#3a2400" : "#fff"; w.font = "bold 26px Trebuchet MS"; w.textAlign = "right"; w.textBaseline = "middle"; w.fillText(s.label, R - 16, 0); w.restore();
  }
  w.restore();
  w.fillStyle = "#1a1410"; w.beginPath(); w.arc(cx, cy, 44, 0, 7); w.fill(); w.fillStyle = "#ffd34d"; w.font = "bold 24px Trebuchet MS"; w.textAlign = "center"; w.textBaseline = "middle"; w.fillText("VEX", cx, cy);
  w.strokeStyle = "#ffd34d"; w.lineWidth = 10; w.beginPath(); w.arc(cx, cy, R + 4, 0, 7); w.stroke();
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; w.fillStyle = (Math.floor(t * 6) + i) % 2 ? "#fff6c0" : "#8a6a20"; w.beginPath(); w.arc(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4), 6, 0, 7); w.fill(); }
  w.fillStyle = "#fff"; w.beginPath(); w.moveTo(cx - 20, 4); w.lineTo(cx + 20, 4); w.lineTo(cx, 50); w.closePath(); w.fill(); w.strokeStyle = "#000"; w.lineWidth = 2; w.stroke();
}

// ---------------------------------------------------------------- wardrobe
let wardOpen = false;
function toggleWardrobe(force) {
  wardOpen = force === undefined ? !wardOpen : force;
  $("wardrobe").classList.toggle("hidden", !wardOpen);
  if (wardOpen) { toggleShop(false); toggleSkills(false); keys.clear(); mouseDown = false; renderWardrobe(); }
}
$("wardrobe").addEventListener("click", (e) => { if (e.target === $("wardrobe")) toggleWardrobe(false); });
function renderWardrobe() {
  const mine = S?.p.find((p) => p.id === me); if (!mine) return;
  const col = ["#d8d8d8", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"];
  const cur = { hat: mine.h, trail: mine.trl, title: Object.keys(COSM).find((k) => COSM[k].name === mine.ttl) || "" };
  const HAT_NAME = Object.fromEntries(HATS);
  const slot = (sl, label, items) => `<h3 style="color:#cfe0b8;margin:10px 0 4px">${label}</h3><div class="wslot">` + items.map(([id, name, rar, owned, bad]) => `<div class="wi${cur[sl] === id ? " sel" : ""}${owned ? "" : " lock"}" data-s="${sl}" data-id="${id}" style="color:${owned ? col[rar] : "#888"}" title="${owned ? "" : "Win it on the wheel"}">${owned ? esc2(name) : "???"}${bad && owned ? " 🤢" : ""}</div>`).join("") + `</div>`;
  const list = (sl) => Object.entries(COSM).filter(([, c]) => c.slot === sl).map(([id, c]) => [id, c.name, c.rarity, myCos.includes(id), c.bad]);
  $("wardBody").innerHTML = slot("hat", "Hats", [...FREE_HATS.map((h) => [h, HAT_NAME[h] || h, 0, true]), ...list("hat")]) + slot("trail", "Trails", [["", "No trail", 0, true], ...list("trail")]) + slot("title", "Titles", [["", "No title", 0, true], ...list("title")]) + `<div class="tag">${myCos.length}/${Object.keys(COSM).length} collected.</div>`;
  for (const el of $("wardBody").querySelectorAll(".wi:not(.lock)")) el.onclick = () => { send({ t: "equip", slot: el.dataset.s, id: el.dataset.id }); setTimeout(renderWardrobe, 150); };
}

// ---------------------------------------------------------------- building
let building = false, buildKind = "wall";
function toggleBuild(force) {
  const want = force === undefined ? !building : force;
  if (want && (!S || !["day", "night", "royale"].includes(S.g.ph))) { building = false; $("buildBar").classList.add("hidden"); return; }
  building = want;
  if (building) { toggleShop(false); toggleSkills(false); mouseDown = false; }
  $("buildBar").classList.toggle("hidden", !building);
  renderBuildBar();
}
function renderBuildBar() {
  const mine = S?.p.find((p) => p.id === me);
  $("buildBar").innerHTML = Object.entries(PIECES).map(([id, pc], i) => `<div class="pc${id === buildKind ? " sel" : ""}" data-k="${id}"><b>${i + 1}. ${pc.name}</b> ${pc.cost}g<small>${pc.desc}</small></div>`).join("") + `<div class="pc"><b>Click</b> to place<small>C / Esc / right-click to stop building${mine ? ` · you have ${mine.g}g` : ""}</small></div>`;
  for (const el of $("buildBar").querySelectorAll(".pc[data-k]")) el.onclick = () => { buildKind = el.dataset.k; renderBuildBar(); };
}
setInterval(() => { if (building) renderBuildBar(); }, 500);
function ghostCell() {
  if (use3d) return ghost3d || { x: Math.round((pred.x - 20) / 40) * 40, y: Math.round((pred.y - 20) / 40) * 40 };
  const wx = (mouseX - VW / 2 - view.sx) / view.z + view.cx, wy = (mouseY - VH / 2 - view.sy) / view.z + view.cy;
  return { x: Math.round((wx - 20) / 40) * 40, y: Math.round((wy - 20) / 40) * 40 };
}

function openChat() { chatting = true; keys.clear(); mouseDown = false; $("chatbox").classList.remove("hidden"); $("chatin").value = ""; $("chatin").focus(); }
function closeChat() { chatting = false; $("chatbox").classList.add("hidden"); $("chatin").blur(); cv.focus(); }
function toggleShop(force) {
  shopOpen = force === undefined ? !shopOpen : force;
  if (shopOpen && S && S.g.ph === "night") { shopOpen = false; pushLim(toasts, { text: "The shop is shut at night.", color: "#f88", t: T() }, 4); }
  $("shop").classList.toggle("hidden", !shopOpen);
  if (shopOpen) { if (casinoOpen) toggleCasino(false); if (wardOpen) toggleWardrobe(false); keys.clear(); mouseDown = false; renderShop(); }
}
function renderShop() {
  if (!SHOP) return;
  const mine = S?.p.find((p) => p.id === me);
  $("shopgold").textContent = mine ? `You have ${mine.g}g and ${mine.sd} seeds` : "";
  $("shopitems").innerHTML = "";
  Object.entries(SHOP).forEach(([id, it], i) => {
    const disc = 1 - 0.1 * ((mine && mine.sk.haggler) || 0);
    let label = it.name, cost = Math.round(it.cost * disc) + "g";
    if (id === "enhance" && mine) {
      const lvl = mine.we;
      if (lvl >= 5) { label = `Enhance ${mine.wn} (maxed)`; cost = "PEN"; }
      else { label = `Enhance ${mine.wn} to ${ENH[lvl + 1]} (+${lvl + 1}) — ${Math.round(ENH_CHANCE[lvl] * 100)}%${lvl >= 2 ? ", fail = downgrade" : ""}`; cost = Math.round(ENH_COST[lvl] * disc) + "g"; }
    }
    if (id === "hoe" && mine) {
      const h = mine.hoe || 0;
      if (h >= 3) { label = "Golden Hoe (maxed): till 12 plots, two at a time"; cost = "MAX"; }
      else { label = h ? `Upgrade to ${["", "Hoe", "Steel Hoe", "Golden Hoe"][h + 1]}: ${3 + 3 * (h + 1)} plots, faster crops, better harvests` : "Hoe: press E on open ground to till new plots"; cost = Math.round([40, 90, 160][h] * disc) + "g"; }
    }
    const d = document.createElement("div");
    d.className = "item";
    d.innerHTML = `<span><span class="k">${i < 10 ? (i + 1) % 10 : ""}</span>${label}</span><span>${cost}</span>`;
    d.onclick = () => send({ t: "buy", item: id });
    $("shopitems").appendChild(d);
  });
}
$("shop").addEventListener("click", (e) => { if (e.target === $("shop")) toggleShop(false); });

// ---------------------------------------------------------------- skills
let skillsOpen = false;
function toggleSkills(force) {
  skillsOpen = force === undefined ? !skillsOpen : force;
  if (skillsOpen) toggleShop(false);
  $("skills").classList.toggle("hidden", !skillsOpen);
  if (skillsOpen) { keys.clear(); mouseDown = false; renderSkills(); }
}
let skillSig = "";
function renderSkills() {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine) return;
  const sig = JSON.stringify([mine.sk, mine.pts, mine.lv]);
  if (sig === skillSig) return;
  skillSig = sig;
  $("skillpts").textContent = `Level ${mine.lv} · ${mine.pts} skill point${mine.pts === 1 ? "" : "s"} to spend. Your heirs keep everything you learn.`;
  $("skilltrees").innerHTML = TREES.map((tn, ti) => `<div class="tree"><h3>${tn}</h3>` + Object.entries(SKILL_INFO).filter(([, v]) => v[1] === ti).map(([id, [name, , desc]]) => {
    const r = mine.sk[id] || 0, can = mine.pts > 0 && r < 3;
    return `<div class="skill${can ? " can" : ""}${r ? " has" : ""}" data-s="${id}"><b>${name}</b> <span class="pips">${"●".repeat(r)}${"○".repeat(3 - r)}</span><small>${desc}</small></div>`;
  }).join("") + "</div>").join("");
  for (const el of $("skilltrees").querySelectorAll(".skill")) el.onclick = () => send({ t: "learn", s: el.dataset.s });
}
setInterval(() => { if (skillsOpen) renderSkills(); }, 200);
$("skills").addEventListener("click", (e) => { if (e.target === $("skills")) toggleSkills(false); });

// ---------------------------------------------------------------- story votes
let storySig = "";
function renderStory() {
  const box = $("story");
  const v = S?.vote, st = S?.story;
  if (!v && !st) { if (storySig) { box.classList.add("hidden"); storySig = ""; } return; }
  const sig = JSON.stringify(v ? [v.title, v.votes, v.left] : [st.title, st.pick]);
  if (sig === storySig) return;
  storySig = sig;
  box.classList.remove("hidden");
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (v) {
    const counts = v.ch.map(() => 0); let mineV = -1;
    for (const [pid, i] of Object.entries(v.votes)) { counts[i]++; if (Number(pid) === me) mineV = i; }
    box.innerHTML = `<div class="st-h">${esc(v.title)} <span>${v.left}s</span></div><div class="st-t">${esc(v.text)}</div>` +
      v.ch.map(([label, desc], i) => `<div class="st-c${mineV === i ? " mine" : ""}" data-i="${i}"><b>${esc(label)}</b><small>${esc(desc)}</small><span class="st-n">${"●".repeat(counts[i])}</span></div>`).join("") +
      `<div class="st-f">${use3d ? "Press Esc to free your mouse, then click" : "Click"} to vote. Majority decides.</div>`;
    for (const el of box.querySelectorAll(".st-c")) el.onclick = () => send({ t: "vote", i: Number(el.dataset.i) });
  } else box.innerHTML = `<div class="st-h">${esc(st.title)}</div><div class="st-p">You chose: ${esc(st.pick)}</div><div class="st-t">${esc(st.text)}</div>`;
}

// ---------------------------------------------------------------- sound
let actx = null;
addEventListener("pointerdown", () => { if (!actx) try { actx = new AudioContext(); } catch {} }, { once: false });
let lastShotSfx = 0;
function sfx(kind, vol = 1, sub) {
  if (!actx) return;
  const t = actx.currentTime;
  if (kind === "shot") { if (t - lastShotSfx < 0.03) return; lastShotSfx = t; }
  const g = actx.createGain(); g.connect(actx.destination);
  const tone = (type, f0, f1, dur, v) => {
    const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gg = actx.createGain(); gg.gain.setValueAtTime(v, t); gg.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(gg); gg.connect(g); o.start(t); o.stop(t + dur);
  };
  const noise = (dur, v, hp = 800) => {
    const b = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = actx.createBufferSource(); src.buffer = b; const f = actx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const gg = actx.createGain(); gg.gain.value = v; src.connect(f); f.connect(gg); gg.connect(g); src.start(t);
  };
  g.gain.value = 0.35 * OPTS.vol * (T() - deafT < 3 ? 0.35 : 1);
  if (kind === "shot") { noise(sub === "sniper" ? 0.35 : sub === "shotgun" ? 0.25 : 0.09, 0.5 * vol, sub === "sniper" ? 300 : 900); if (sub === "staff") tone("sawtooth", 300, 80, 0.2, 0.2 * vol); }
  else if (kind === "hit") tone("square", 220, 120, 0.05, 0.08);
  else if (kind === "hs") { tone("sine", 1760, 1760, 0.18, 0.35); tone("sine", 2640, 2640, 0.12, 0.15); }
  else if (kind === "hurt") tone("sawtooth", 160, 60, 0.15, 0.25);
  else if (kind === "boom") { noise(0.5, 0.7, 60); tone("sine", 120, 30, 0.4, 0.5); }
  else if (kind === "shout" && sub === "fire") { noise(0.7, 0.5, 300); tone("sawtooth", 90, 60, 0.6, 0.3); }
  else if (kind === "shout" && sub === "frost") { tone("sine", 1200, 400, 0.7, 0.2); noise(0.6, 0.3, 3000); }
  else if (kind === "shout" && sub === "storm") { noise(0.4, 0.6, 1500); tone("square", 400, 60, 0.5, 0.2); }
  else if (kind === "shout") { tone("sawtooth", 110, 55, 0.6, 0.35); noise(0.5, 0.3, 200); }
  else if (kind === "lvl") [523, 659, 784, 1046].forEach((f, i) => { const o = actx.createOscillator(); o.type = "triangle"; o.frequency.value = f; const gg = actx.createGain(); gg.gain.setValueAtTime(0, t + i * 0.08); gg.gain.linearRampToValueAtTime(0.25, t + i * 0.08 + 0.01); gg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25); o.connect(gg); gg.connect(g); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3); });
  else if (kind === "perfect") { tone("triangle", 880, 1320, 0.15, 0.3); }
  else if (kind === "jam") tone("square", 120, 90, 0.2, 0.2);
  else if (kind === "banner") tone("triangle", 196, 196, 0.8, 0.25);
  else if (kind === "shame") { [0, 0.45, 0.9].forEach((d) => { const o = actx.createOscillator(); o.type = "sine"; o.frequency.value = 330; const o2 = actx.createOscillator(); o2.type = "sine"; o2.frequency.value = 494; const gg = actx.createGain(); gg.gain.setValueAtTime(0.5, t + d); gg.gain.exponentialRampToValueAtTime(0.001, t + d + 1.2); o.connect(gg); o2.connect(gg); gg.connect(g); o.start(t + d); o2.start(t + d); o.stop(t + d + 1.2); o2.stop(t + d + 1.2); }); tone("sawtooth", 90, 60, 1.2, 0.3); }
  else if (kind === "bile") { noise(0.5, 0.5, 150); tone("sawtooth", 140, 50, 0.5, 0.25); }
  else if (kind === "scream") { tone("sawtooth", 900, 1400, 0.9, 0.25); tone("square", 1200, 700, 0.9, 0.12); }
  else if (kind === "glass") { noise(0.2, 0.6, 3000); tone("sine", 2400, 1800, 0.15, 0.2); }
  else if (kind === "throw") tone("sine", 500, 250, 0.12, 0.15);
  else if (kind === "zap") { noise(0.25, 0.5, 2500); tone("square", 1800, 200, 0.25, 0.15); }
  else if (kind === "click") tone("square", 1400, 1200, 0.03, 0.2);
  else if (kind === "kick") { tone("sine", 160, 80, 0.1, 0.4); noise(0.05, 0.3, 1500); }
  else if (kind === "goal") { noise(1.6, 0.35, 500); tone("triangle", 523, 1046, 0.7, 0.3); }
  else if (kind === "alarm") [0, 0.3, 0.6, 0.9].forEach((d) => { const o = actx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(880, t + d); o.frequency.setValueAtTime(660, t + d + 0.15); const gg = actx.createGain(); gg.gain.setValueAtTime(0.15, t + d); gg.gain.setValueAtTime(0.001, t + d + 0.29); o.connect(gg); gg.connect(g); o.start(t + d); o.stop(t + d + 0.3); });
  else if (kind === "rex") { tone("sawtooth", 90, 40, 1.4, 0.5); noise(1.2, 0.4, 100); }
  else if (kind === "splash") { noise(0.5, 0.5, 400); tone("sine", 300, 80, 0.3, 0.15); }
}

// the valley's verdict on teamkillers, read out loud where the browser can speak
function sayShame(who) {
  try {
    if (!("speechSynthesis" in window) || OPTS.vol < 0.05) return;
    const u = new SpeechSynthesisUtterance(`Shame. Shame. Shame. ${who} killed a teammate.`);
    u.volume = Math.min(1, OPTS.vol); u.rate = 0.85; u.pitch = 0.6;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch {}
}

// ---------------------------------------------------------------- options
const OPTS = { vol: 1, sens: 1, fov: 80, invert: false, shake: true };
try { Object.assign(OPTS, JSON.parse(localStorage.getItem("slop-opts") || "{}")); } catch {}
let optsOpen = false;
function saveOpts() { try { localStorage.setItem("slop-opts", JSON.stringify(OPTS)); } catch {} }
let padView = 0;
function toggleOptions(force) {
  optsOpen = force === undefined ? !optsOpen : force;
  clearInterval(padView);
  if (optsOpen) padView = setInterval(() => {
    const gp = pad(), el = $("o-pad"); if (!el) return;
    el.textContent = gp ? `${gp.id}${gp.mapping === "standard" ? " (standard gamepad: no setup needed)" : ""}` : "No flight stick or gamepad found. Plug it in and press any button on it.";
    const fi = flyInput();
    ["pitch", "roll", "yaw", "thr"].forEach((k, i) => { const s2 = $("o-ax-" + k); if (s2) s2.textContent = fi ? fi.f[i].toFixed(2) : "-"; });
  }, 100);
  $("options").classList.toggle("hidden", !optsOpen);
  if (optsOpen) { keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); renderOptions(); }
}
function renderOptions() {
  const row = (id, label, min, max, step, val, fmt) => `<div class="opt"><label for="o-${id}">${label}</label><input type="range" id="o-${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span id="o-${id}-v">${fmt(val)}</span></div>`;
  const pct = (v) => Math.round(v * 100) + "%";
  $("optsBody").innerHTML =
    row("vol", "Volume", 0, 1.5, 0.05, OPTS.vol, pct) +
    row("sens", "Mouse sensitivity", 0.2, 3, 0.05, OPTS.sens, (v) => (+v).toFixed(2) + "x") +
    row("fov", "Field of view", 60, 110, 1, OPTS.fov, (v) => v + "°") +
    `<div class="opt"><label><input type="checkbox" id="o-invert"${OPTS.invert ? " checked" : ""}> Invert mouse Y</label></div>` +
    `<div class="opt"><label><input type="checkbox" id="o-shake"${OPTS.shake ? " checked" : ""}> Screen shake</label></div>` +
    `<div class="opt"><label>View</label><span>${{ fp: "First person", tp: "Third person", top: "Top-down" }[viewMode]} (press T to switch)</span></div>` +
    `<h3 class="opt-h">Flight stick / gamepad (helicopters)</h3><div class="opt-pad" id="o-pad"></div>` +
    [["pitch", "Pitch (stick forward/back)"], ["roll", "Roll / strafe (stick left/right)"], ["yaw", "Yaw (twist or rudder)"], ["thr", "Collective (throttle: up = climb)"]].map(([k, l]) =>
      `<div class="opt"><label>${l}</label><button class="cbtn alt bind" data-ax="${k}">Axis ${FLY[k]}</button><label class="inv"><input type="checkbox" data-inv="${k}"${FLY.inv[k] ? " checked" : ""}> invert</label><span id="o-ax-${k}"></span></div>`).join("") +
    `<div class="opt-note">Click an axis button, then push that control all the way. Trigger fires the chain gun, button 2 fires rockets, button 3 gets out. Set the throttle to the middle to hover. A standard gamepad needs no setup.</div>`;
  for (const id of ["vol", "sens", "fov"]) {
    const el = $("o-" + id), fmt = id === "vol" ? pct : id === "sens" ? (v) => (+v).toFixed(2) + "x" : (v) => v + "°";
    el.oninput = () => { OPTS[id] = +el.value; $("o-" + id + "-v").textContent = fmt(OPTS[id]); saveOpts(); if (id === "vol") sfx("hit"); };
  }
  $("o-invert").onchange = (e) => { OPTS.invert = e.target.checked; saveOpts(); };
  for (const el of document.querySelectorAll("[data-inv]")) el.onchange = () => { FLY.inv[el.dataset.inv] = el.checked; saveFly(); };
  for (const el of document.querySelectorAll(".bind")) el.onclick = () => {
    const gp = pad(); if (!gp) { el.textContent = "No stick found"; return; }
    const rest = [...gp.axes]; el.textContent = "Push it now...";
    const t0 = Date.now(), iv = setInterval(() => {
      const g = pad(); if (!g) return;
      let best = -1, bd = 0.45; g.axes.forEach((v, i) => { const d = Math.abs(v - (rest[i] || 0)); if (d > bd) { bd = d; best = i; } });
      if (best >= 0 || Date.now() - t0 > 5000) { clearInterval(iv); if (best >= 0) { FLY[el.dataset.ax] = best; saveFly(); } el.textContent = `Axis ${FLY[el.dataset.ax]}`; }
    }, 50);
  };
  $("o-shake").onchange = (e) => { OPTS.shake = e.target.checked; saveOpts(); };
}
$("options").addEventListener("click", (e) => { if (e.target === $("options")) toggleOptions(false); });
$("optBtn").onclick = (e) => { e.target.blur(); toggleOptions(); };

// ---------------------------------------------------------------- dialogue & journal
let dlgOpen = false;
const hearts = (v) => { const n = Math.max(0, Math.min(5, Math.floor(v / 20))); return "♥".repeat(n) + "♡".repeat(5 - n); };
const myLove = (id) => { const mine = S?.p.find((p) => p.id === me); return (mine && mine.lo && mine.lo[id]) || 0; };
const GLYPH_CH = ["☀", "☾", "★", "◆"];
function showDlg(e) {
  const box = $("dlg");
  if (e.close) { dlgOpen = false; box.classList.add("hidden"); return; }
  dlgOpen = true;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const love = e.love !== undefined ? `<span class="dl-love">${hearts(e.love)}${e.rel ? ` · ${e.rel === "spouse" ? "married" : "dating"}` : ""}</span>` : "";
  box.innerHTML = `<div class="dl-n">${esc(e.name)} <span>${esc(e.role)}</span>${love}</div><div class="dl-t">${esc(e.text)}</div>` +
    e.opts.map((o, i) => `<div class="dl-o" data-i="${i}"><b>${i + 1}.</b> ${esc(o)}</div>`).join("");
  for (const el of box.querySelectorAll(".dl-o")) el.onclick = () => send({ t: "dlg", i: Number(el.dataset.i) });
  box.classList.remove("hidden");
  sfx("hit");
}
let journalOpen = false;
function toggleJournal(force) {
  journalOpen = force === undefined ? !journalOpen : force;
  $("journal").classList.toggle("hidden", !journalOpen);
  if (journalOpen) renderJournal();
}
function renderJournal() {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const qs = mine.q.length ? mine.q.map(([title, desc, prog, goal, done, npc]) => `<div class="jq${done ? " done" : ""}"><b>${esc(title)}</b> <span>${done ? "done" : `${prog}/${goal}`}</span><small>${esc(desc)} (${esc(npc)})</small></div>`).join("") : `<div class="tag">No quests yet. Talk to people in town [E].</div>`;
  const cl = S.g.clues.length ? S.g.clues.map((c) => `<div class="jc">${esc(c)}</div>`).join("") : `<div class="tag">Nothing yet. Somebody in town knows something.</div>`;
  let lg = "";
  if (S.g.deeds) {
    const max = Math.max(20, ...Object.values(S.g.deeds));
    const L = LEGENDS[S.g.now];
    lg = `<h3>Reputation</h3><div class="tag">${S.g.legend ? `At the Reckoning they named you <b style="color:${LEGENDS[S.g.legend].color}">${esc(LEGENDS[S.g.legend].title)}</b>. ` : ""}Right now the valley sees you as <b style="color:${L ? L.color : "#aaa"}">${L ? esc(L.title) : "nobody in particular"}</b>. It keeps watching.</div>` +
      Object.entries(LEGENDS).map(([k2, v]) => `<div class="lg"><small style="color:${v.color}">${esc(v.title)}</small><div class="bar"><div style="width:${Math.round(100 * S.g.deeds[k2] / max)}%;background:${v.color}"></div></div></div>`).join("");
  }
  $("journalBody").innerHTML = `<h3>Quests</h3>${qs}<h3>Evidence (${S.g.clues.length}/5)</h3>${cl}${lg}`;
}
setInterval(() => { if (journalOpen) renderJournal(); }, 500);

function keyMask() {
  if (chatting || shopOpen || skillsOpen || casinoOpen || wardOpen || (S && S.g.ph === "intro")) return 0;
  const mine = S && S.p.find((p) => p.id === me);
  if (mine && mine.go) return 0;
  // infected: forward is P, back is INSERT, left is ALT. There is no right.
  const jump = keys.has(" ") ? 16 : 0;
  if (mine && mine.inf === "keys") return jump | (keys.has("p") ? 1 : 0) | (keys.has("alt") ? 2 : 0) | (keys.has("insert") ? 4 : 0);
  return jump | (keys.has("w") ? 1 : 0) | (keys.has("a") ? 2 : 0) | (keys.has("s") ? 4 : 0) | (keys.has("d") ? 8 : 0) | (keys.has("c") && (pred.swim || flying()) ? 32 : 0);
}
function aimAngle() { if (use3d) return aimYaw; const o = myScr(); return Math.atan2(mouseY - o.y, mouseX - o.x); }
const aiming = () => adsDown && !chatting && !shopOpen && !skillsOpen && !building && !casinoOpen && !wardOpen;
let padExit = false;
setInterval(() => {
  if (!joined) return;
  const msg = { t: "in", k: keyMask(), a: aimAngle(), f: mouseDown && !chatting && !shopOpen && !skillsOpen && !building && !casinoOpen && !wardOpen, ads: aiming() ? 1 : 0 };
  if (use3d) { msg.pt = +aimPitch.toFixed(3); msg.rel = 1; }
  if (piloting()) {
    const fi = flyInput();
    if (fi) {
      msg.fly = fi.f.map((v) => +v.toFixed(3)); if (fi.fire) msg.f = true; if (fi.alt) msg.ads = 1;
      if (fi.exit && !padExit) send({ t: "use" });
      padExit = fi.exit;
    }
  }
  send(msg);
}, 33);
// ---------------------------------------------------------------- flight sticks and gamepads (helicopters)
// A standard gamepad just works: left stick flies, right stick turns, triggers climb and descend, bumpers shoot.
// Anything else (a HOTAS like the Thrustmaster T.16000M) uses the axes chosen in Options, which you can re-bind.
const AIR = { heli: 1, gunship: 1 };
const FLY = { pitch: 1, roll: 0, yaw: 5, thr: 2, inv: { pitch: true, roll: false, yaw: false, thr: true }, dead: 0.08 };
try { const f = JSON.parse(localStorage.getItem("slop-fly") || "{}"); Object.assign(FLY, f); FLY.inv = { pitch: true, roll: false, yaw: false, thr: true, ...(f.inv || {}) }; } catch {}
function saveFly() { try { localStorage.setItem("slop-fly", JSON.stringify(FLY)); } catch {} }
function pad() { try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.axes.length >= 2) || null; } catch { return null; } }
function myVehicle() { const mine = S?.p.find((p) => p.id === me); return mine && mine.vh ? S.vh.find((v) => v[0] === mine.vh) : null; }
function flying() { const v = myVehicle(); return !!(v && AIR[v[1]]); }
function piloting() { const v = myVehicle(); return !!(v && AIR[v[1]] && v[6] === me); }
function flyInput() {
  const gp = pad(); if (!gp) return null;
  const dz = (v) => (Math.abs(v || 0) < FLY.dead ? 0 : v || 0);
  const ax = (k) => { const v = dz(gp.axes[FLY[k]]); return FLY.inv[k] ? -v : v; };
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  if (gp.mapping === "standard") return { f: [-dz(gp.axes[1]), dz(gp.axes[0]), dz(gp.axes[2]), (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0)], fire: b(5), alt: b(4), exit: b(3) };
  return { f: [ax("pitch"), ax("roll"), ax("yaw"), ax("thr")], fire: b(0), alt: b(1), exit: b(2) };
}
setInterval(() => { if (shopOpen) renderShop(); }, 250);

// ---------------------------------------------------------------- prediction (own player)
// the same physics as the server (move.js), run locally so movement feels instant; the server's answer pulls us back gently
const pred = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gr: true, pk: 0, tt: 0, init: false, srv: null, dashCd: 0 };
let boxCache = { key: "", boxes: [] };
function worldBoxes() {
  const key = (MAP ? MAP.seed + ":" + MAP.walls.length + ":" + (MAP.ver || 0) : "") + ":" + (S ? S.b.map((b) => b[0]).join(",") : "");
  if (key !== boxCache.key) {
    const solid = S ? S.b.filter((b) => PIECES[b[1]] && PIECES[b[1]].solid).map((b) => ({ x: b[2], y: b[3], w: 40, h: 40, z0: 0, z1: PIECES[b[1]].z1 || 10, kind: "built" })) : [];
    boxCache = { key, boxes: [...MAP.walls, ...solid] };
  }
  return boxCache.boxes;
}
function localDodge() {
  const t = T(); if (t < pred.dashCd) return;
  const mine = S?.p.find((p) => p.id === me); if (!mine || mine.d || mine.air || mine.vh) return;
  const w = MV.wishDir(keyMask(), use3d ? yaw : aimAngle(), use3d);
  let dx = w.x, dy = w.y;
  if (!dx && !dy) { const a = aimAngle(); dx = Math.cos(a); dy = Math.sin(a); }
  const spd = Math.max(Math.hypot(pred.vx, pred.vy), mine.sp * 2.7);
  pred.vx = dx * spd; pred.vy = dy * spd; if (!pred.gr && pred.vz < 0) pred.vz = 0;
  pred.dashCd = t + (mine.cl === "rogue" ? 0.8 : 1.3);
}
function collide(e, r) { MV.pushOut(e, r, worldBoxes(), MAP.W, MAP.H); }
function stepPred(dt) {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine || !MAP) return;
  if (mine.d) { Object.assign(pred, { x: mine.x, y: mine.y, z: mine.z || 0, vx: 0, vy: 0, vz: 0 }); return; }
  if (mine.air || mine.vh) { const k = Math.min(1, dt * 12); pred.x += (mine.x - pred.x) * k; pred.y += (mine.y - pred.y) * k; pred.z += ((mine.z || 0) - pred.z) * k; pred.vx = pred.vy = pred.vz = 0; if (Math.hypot(mine.x - pred.x, mine.y - pred.y) > 300) { pred.x = mine.x; pred.y = mine.y; } return; }
  // step in small slices so fast frames and slow frames give the same jump
  let left = Math.min(dt, 0.1);
  while (left > 1e-4) {
    const h = Math.min(left, 1 / 60); left -= h;
    MV.step(pred, { keys: keyMask(), yaw: use3d ? yaw : aimAngle(), rel: use3d }, h, { sp: mine.sp, boxes: worldBoxes(), W: MAP.W, H: MAP.H, frozen: !!mine.go || dlgOpen || !!mine.fz });
  }
  // gently pull toward the server's opinion (projected forward a little, since it's slightly out of date)
  const s = pred.srv;
  if (s) {
    const lead = 0.06, tx = s.x + s.vx * lead, ty = s.y + s.vy * lead, tz = s.z;
    const err = Math.hypot(tx - pred.x, ty - pred.y);
    if (err > 140 || Math.abs(tz - pred.z) > 90) { Object.assign(pred, { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, gr: s.gr }); }
    else {
      const k = Math.min(1, dt * 3);
      pred.x += (tx - pred.x) * k; pred.y += (ty - pred.y) * k;
      if (s.gr && pred.gr) pred.z += (tz - pred.z) * k;
      pred.vx += (s.vx - pred.vx) * k * 0.5; pred.vy += (s.vy - pred.vy) * k * 0.5;
    }
  }
}

// ---------------------------------------------------------------- decor
let decor = [];
function buildDecor() {
  let seed = (MAP.seed % 2147483646) + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  decor = [];
  for (let i = 0; i < 1000; i++) decor.push({ x: rnd() * MAP.W, y: rnd() * MAP.H, k: rnd() < 0.85 ? "tuft" : "flower", c: ["#e86", "#fd5", "#c8f", "#fff"][(rnd() * 4) | 0] });
}


// ---------------------------------------------------------------- vehicles
const VEH_NAME = { tractor: "Tractor", buggy: "Slop Buggy", limo: "Limo", heli: "Crop Chopper", gunship: "Slop Gunship" };
function drawVehicle(kind, x, y, a, t, occ, speed, z = 0) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(6, 10, kind === "limo" ? 56 : AIR[kind] ? 44 : 34, AIR[kind] ? 26 : 20, a, 0, 7); ctx.fill();
  ctx.translate(0, -z * 0.3);
  ctx.rotate(a);
  const wheel = (wx, wy, w, h) => { ctx.fillStyle = "#1a1a1a"; ctx.fillRect(wx - w / 2, wy - h / 2, w, h); };
  if (kind === "tractor") {
    wheel(-16, -20, 22, 9); wheel(-16, 20, 22, 9); wheel(18, -17, 14, 6); wheel(18, 17, 14, 6);
    ctx.fillStyle = "#3f8a3a"; ctx.fillRect(-28, -15, 56, 30);
    ctx.fillStyle = "#2f6a2c"; ctx.fillRect(6, -11, 22, 22);
    ctx.fillStyle = "#9fd0e0"; ctx.fillRect(-20, -12, 16, 24);
    ctx.fillStyle = "#ffd34d"; ctx.fillRect(26, -12, 4, 6); ctx.fillRect(26, 6, 4, 6);
    ctx.fillStyle = "#555"; ctx.fillRect(10, -16, 5, 5);
    if (Math.abs(speed) > 10) { ctx.fillStyle = "#6668"; ctx.beginPath(); ctx.arc(12 - ((t * 60) % 30), -22, 5, 0, 7); ctx.fill(); }
  } else if (kind === "buggy") {
    for (const [wx, wy] of [[-16, -17], [-16, 17], [16, -17], [16, 17]]) wheel(wx, wy, 14, 8);
    ctx.fillStyle = "#e88a2a"; ctx.beginPath(); ctx.moveTo(-26, -13); ctx.lineTo(20, -13); ctx.lineTo(28, 0); ctx.lineTo(20, 13); ctx.lineTo(-26, 13); ctx.fill();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 3; ctx.strokeRect(-14, -11, 18, 22);
    ctx.fillStyle = "#6fcf3a"; ctx.fillRect(-24, -3, 8, 6);
    ctx.fillStyle = "#fff8a0"; ctx.fillRect(24, -8, 4, 4); ctx.fillRect(24, 4, 4, 4);
  } else if (AIR[kind]) {
    const gs = kind === "gunship";
    ctx.strokeStyle = "#333"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -16); ctx.lineTo(20, -16); ctx.moveTo(-20, 16); ctx.lineTo(20, 16); ctx.stroke(); // skids
    ctx.fillStyle = gs ? "#4a5a3a" : "#e8c040"; ctx.fillRect(-58, -4, 40, 8); // tail boom
    ctx.fillStyle = gs ? "#3a4a2c" : "#d0a830"; ctx.fillRect(-62, -12, 8, 24);
    ctx.fillStyle = gs ? "#55663f" : "#f0d050"; ctx.beginPath(); ctx.ellipse(0, 0, 30, 18, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#9fd0e0"; ctx.beginPath(); ctx.ellipse(14, 0, 12, 12, 0, -1.2, 1.2); ctx.fill();
    if (gs) { ctx.fillStyle = "#2a2a2a"; ctx.fillRect(-6, -30, 12, 60); ctx.fillRect(26, -2, 16, 4); for (const sy of [-26, 26]) { ctx.fillStyle = "#3a3a3a"; ctx.fillRect(-10, sy - 5, 18, 10); } }
    ctx.strokeStyle = "rgba(30,30,30,0.55)"; ctx.lineWidth = 4; const ra = t * (z > 2 || speed > 1 ? 30 : 8);
    for (let i = 0; i < 4; i++) { const q = ra + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(q) * 54, Math.sin(q) * 54); ctx.stroke(); }
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
  } else if (kind === "limo") {
    for (const [wx, wy] of [[-36, -16], [-36, 16], [34, -16], [34, 16]]) wheel(wx, wy, 14, 6);
    ctx.fillStyle = "#ff8fc8"; ctx.beginPath(); ctx.roundRect(-52, -15, 104, 30, 8); ctx.fill();
    ctx.fillStyle = "#402838"; for (let i = 0; i < 4; i++) ctx.fillRect(-36 + i * 18, -12, 13, 24);
    ctx.fillStyle = "#ffd34d"; ctx.fillRect(48, -10, 4, 5); ctx.fillRect(48, 5, 4, 5);
  }
  occ.forEach((p, i) => { if (!p) return; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(kind === "tractor" ? -12 : -6, i ? 7 : -7, 7, 0, 7); ctx.fill(); ctx.strokeStyle = "#0008"; ctx.lineWidth = 1.5; ctx.stroke(); });
  ctx.restore();
  const names = occ.filter(Boolean).map((p) => p.n.split(" ")[0]);
  if (names.length) text(names.join(" + "), x, y + 34 - z * 0.3, 11, "#fff");
}

// ---------------------------------------------------------------- opening cutscene
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const RISE = [[-150, -60], [-60, 40], [40, -90], [130, 20], [-110, 110], [80, 120], [170, -80]];
function storyShots() {
  const V = MAP.valley, wl = MAP.well || { x: 1275, y: 745 }, h = MAP.hearth, hc = { x: h.x + h.w / 2, y: h.y + h.h / 2 };
  const rc = { x: MAP.W * 0.28, y: MAP.H * 0.72 };
  return [
    { d: 5, npcs: true, tint: "rgba(255,140,60,0.18)", cam: (k) => ({ x: lerp(300, MAP.W - 300, ease(k)), y: lerp(350, MAP.H * 0.6, ease(k)), z: 0.75 }),
      cap: () => intro.prev ? `${intro.prev} This time, it's ${V}.` : `${V}. Three hundred years of turnips, mud and minding its own business.` },
    { d: 6, tint: "rgba(5,8,30,0.62)", cam: (k) => ({ x: wl.x - 70 + k * 30, y: wl.y + 10, z: 1.7 }),
      cap: (k) => "Three weeks ago, somebody came to the old well in the dead of night." + (k > 0.6 ? " Nobody saw who." : ""),
      draw: (k, t) => {
        const fx = wl.x - 230 + Math.min(1, k / 0.45) * 180, fy = wl.y + 6, walk = k < 0.45 ? Math.sin(t * 10) * 2 : 0;
        ctx.fillStyle = "#0005"; ctx.beginPath(); ctx.ellipse(fx, fy + 16, 16, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#2a2230"; ctx.beginPath(); ctx.arc(fx, fy + walk, 18, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx - 14, fy - 8); ctx.lineTo(fx, fy - 34); ctx.lineTo(fx + 14, fy - 8); ctx.fill();
        if (k > 0.12 && k < 0.42) { ctx.fillStyle = "#fff"; ctx.save(); ctx.translate(fx - 12, fy - 18); ctx.rotate(Math.sin(t * 12) * 0.4); ctx.fillRect(-4, -4, 9, 9); ctx.restore(); }
        const tilt = k > 0.5 ? Math.min(1, (k - 0.5) / 0.1) * 1.2 : 0;
        ctx.save(); ctx.translate(fx + 22, fy - 4); ctx.rotate(tilt); ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-10, -14, 20, 26); ctx.fillStyle = "#4a3218"; ctx.fillRect(-10, -8, 20, 3); ctx.fillRect(-10, 4, 20, 3); ctx.restore();
      },
      glow: (k, t) => {
        const g = k > 0.55 ? Math.min(1, (k - 0.55) / 0.3) : 0;
        if (g > 0) { const rg = ctx.createRadialGradient(wl.x, wl.y, 4, wl.x, wl.y, 20 + g * 40); rg.addColorStop(0, `rgba(110,255,80,${0.55 * g})`); rg.addColorStop(1, "rgba(110,255,80,0)"); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(wl.x, wl.y, 20 + g * 40, 0, 7); ctx.fill(); }
        if (k > 0.55 && k < 0.92) for (let i = 0; i < 6; i++) { const q = (t * 2 + i / 6) % 1; ctx.fillStyle = "#7dff5a"; ctx.beginPath(); ctx.arc(lerp(wl.x - 40, wl.x - 4, q), lerp(wl.y - 10, wl.y, q) + Math.sin(q * 3) * -10, 3, 0, 7); ctx.fill(); }
      } },
    { d: 5, tint: "rgba(5,8,30,0.6)", cam: (k) => ({ x: rc.x, y: rc.y, z: lerp(1.1, 1.35, k) }),
      cap: () => `Since then, the dead of ${V} won't stay buried.`,
      draw: (k) => RISE.forEach(([dx, dy], i) => {
        const p = Math.max(0, Math.min(1, (k - 0.06 - i * 0.09) / 0.25)), x = rc.x + dx, y = rc.y + dy;
        ctx.fillStyle = "#4a3620"; ctx.beginPath(); ctx.ellipse(x, y + 10, 22, 9, 0, 0, 7); ctx.fill();
        if (!p) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x - 40, y - 60, 80, 70); ctx.clip();
        const yy = y + (1 - p) * 30;
        ctx.fillStyle = "#6fa35a"; ctx.beginPath(); ctx.arc(x, yy, 15, 0, 7); ctx.fill();
        ctx.strokeStyle = "#6fa35a"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x - 10, yy - 4); ctx.lineTo(x - 16, yy - 22 * p); ctx.moveTo(x + 10, yy - 4); ctx.lineTo(x + 16, yy - 22 * p); ctx.stroke(); ctx.lineCap = "butt";
        ctx.restore();
      }),
      glow: (k) => RISE.forEach(([dx, dy], i) => { const p = Math.max(0, Math.min(1, (k - 0.06 - i * 0.09) / 0.25)); if (p < 0.6) return; const yy = rc.y + dy + (1 - p) * 30; ctx.fillStyle = "#ffec40"; ctx.beginPath(); ctx.arc(rc.x + dx - 5, yy - 3, 2.5, 0, 7); ctx.arc(rc.x + dx + 5, yy - 3, 2.5, 0, 7); ctx.fill(); }) },
    { d: 4, npcs: true, tint: "rgba(255,140,60,0.12)", cam: (k) => ({ x: hc.x, y: lerp(hc.y + 260, hc.y, ease(k)), z: lerp(0.9, 1.3, ease(k)) }),
      cap: () => "Only the Hearth still holds them back. Just about." },
    { d: 5, card: true, npcs: true, tint: "rgba(0,0,0,0)", cam: () => ({ x: hc.x, y: hc.y, z: 1.3 }), cap: () => "" },
  ];
}
function royaleShots() {
  return [
    { d: 4.5, tint: "rgba(255,200,120,0.1)", cam: (k) => ({ x: lerp(300, MAP.W - 300, k), y: MAP.H / 2 + Math.sin(k * 3) * 120, z: 0.7 }), cap: () => "VEX AIR presents...",
      draw: (k) => { const x = lerp(300, MAP.W - 300, k) + 160, y = MAP.H / 2 + Math.sin(k * 3) * 120 - 60; ctx.fillStyle = "#b05a8a"; ctx.beginPath(); ctx.ellipse(x, y - 40, 55, 65, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#ffd34d"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(x + i * 20, y - 40, 6, 62, 0, 0, 7); ctx.fill(); } ctx.fillStyle = "#6b4a2a"; ctx.fillRect(x - 26, y + 28, 52, 26); text("VEX AIR", x, y - 40, 13, "#fff"); } },
    { d: 5.5, card: true, tint: "rgba(0,0,0,0)", cam: () => ({ x: MAP.W - 300, y: MAP.H / 2 + Math.sin(3) * 120, z: 0.7 }), cap: () => "" },
  ];
}
function introShot(t) {
  const shots = intro.mode === "royale" ? royaleShots() : storyShots();
  let el = t - intro.start, i = 0;
  while (i < shots.length - 1 && el >= shots[i].d) { el -= shots[i].d; i++; }
  const sh = shots[i], k = Math.max(0, Math.min(1, el / sh.d)), c = sh.cam(k);
  const hx = VW / 2 / c.z, hy = VH / 2 / c.z; // keep the camera inside the valley
  c.x = hx * 2 >= MAP.W ? MAP.W / 2 : Math.max(hx, Math.min(MAP.W - hx, c.x)); c.y = hy * 2 >= MAP.H ? MAP.H / 2 : Math.max(hy, Math.min(MAP.H - hy, c.y));
  if (i !== intro.shot) { intro.shot = i; sfx("banner"); }
  return { ...sh, k, i, cam: { x: c.x, y: c.y }, z: c.z };
}
function drawIntroOverlay(sh, t, worldXf) {
  ctx.fillStyle = sh.tint; ctx.fillRect(0, 0, VW, VH);
  if (sh.glow) { ctx.save(); worldXf(); sh.glow(sh.k, t); ctx.restore(); }
  const lb = Math.round(VH * 0.11);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VW, lb); ctx.fillRect(0, VH - lb, VW, lb);
  const fade = Math.max(0, 1 - (sh.k * sh.d) / 0.4);
  if (sh.card) {
    const a = Math.min(1, sh.k * sh.d / 0.8);
    ctx.fillStyle = `rgba(8,6,12,${0.88 * a})`; ctx.fillRect(0, lb, VW, VH - 2 * lb);
    ctx.globalAlpha = a;
    const royale = intro.mode === "royale", cast = intro.cast || [];
    text(royale ? "SLOP ROYALE" : "SLOP VALLEY", VW / 2, VH * 0.25, Math.min(72, VW / 10), "#ffd34d");
    text(royale ? MAP.valley.toUpperCase() : "starring", VW / 2, VH * 0.25 + 50, 18, "#cfe0b8");
    cast.forEach(([n, cls, col], i) => { if (sh.k * sh.d > 0.8 + i * 0.35) text(`${n}, the ${cls}`, VW / 2, VH * 0.25 + 90 + i * 30, 20, col); });
    const y2 = VH * 0.25 + 110 + cast.length * 30;
    if (sh.k > 0.55) text(royale ? `One balloon. ${cast.length} farmer${cast.length === 1 ? "" : "s"}. One survivor.` : "and one very special guest (maybe)", VW / 2, y2, 17, "#e0c0ff");
    if (sh.k > 0.7) text(royale ? "Celebrity commentary by Gordon Rampage: \"I've seen more fight in a soufflé.\"" : "The valley is watching. It will remember what you do.", VW / 2, y2 + 32, 15, royale ? "#ff9ad0" : "#aaa");
    ctx.globalAlpha = 1;
  } else {
    const cap = sh.cap(sh.k), n = Math.floor(sh.k * sh.d * 40);
    text(cap.slice(0, n), VW / 2, VH - lb / 2, Math.max(15, Math.min(22, VW / 50)), "#f2ead0");
  }
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, VW, VH); }
  text(`SPACE to skip (${intro.skip || 0}/${S.p.length})`, VW - 20, lb / 2, 13, "#888", "right");
}

// ---------------------------------------------------------------- drawing helpers
function smooth(key, x, y, dt) {
  let d = disp.get(key);
  if (!d || Math.hypot(d.x - x, d.y - y) > 200) { d = { x, y }; disp.set(key, d); }
  const k = Math.min(1, dt * 14);
  d.x += (x - d.x) * k; d.y += (y - d.y) * k; d.seen = frameNo;
  return d;
}
function drawHat(hat, x, y, r) {
  ctx.save(); ctx.translate(x, y - r * 0.6);
  if (hat === "crown") { ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-10, -12); ctx.lineTo(-5, -6); ctx.lineTo(0, -14); ctx.lineTo(5, -6); ctx.lineTo(10, -12); ctx.lineTo(10, 0); ctx.fill(); }
  else if (hat === "cowboy") { ctx.fillStyle = "#8a5a2b"; ctx.fillRect(-16, -3, 32, 5); ctx.fillRect(-9, -13, 18, 11); }
  else if (hat === "wizard") { ctx.fillStyle = "#4a3ab0"; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(3, -26); ctx.lineTo(12, 0); ctx.fill(); ctx.fillStyle = "#ffd34d"; ctx.fillRect(-1, -12, 3, 3); }
  else if (hat === "horns") { ctx.fillStyle = "#999"; ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#eee"; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-18, -16); ctx.lineTo(-7, -8); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(18, -16); ctx.lineTo(7, -8); ctx.fill(); }
  else if (hat === "party") { ctx.fillStyle = "#ff5fa0"; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -24); ctx.lineTo(9, 0); ctx.fill(); ctx.fillStyle = "#ffe14d"; for (const [x, y] of [[-3, -6], [2, -12], [-1, -17]]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); } ctx.beginPath(); ctx.arc(0, -25, 3, 0, 7); ctx.fill(); }
  else if (hat === "bucket") { ctx.fillStyle = "#8a9aa8"; ctx.beginPath(); ctx.moveTo(-13, 2); ctx.lineTo(-10, -16); ctx.lineTo(10, -16); ctx.lineTo(13, 2); ctx.fill(); ctx.strokeStyle = "#5a6a78"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -8, 14, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); }
  else if (hat === "cone") { ctx.fillStyle = "#ff7a1a"; ctx.beginPath(); ctx.moveTo(-12, 2); ctx.lineTo(0, -30); ctx.lineTo(12, 2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(-6, -14, 12, 4); ctx.fillStyle = "#ff7a1a"; ctx.fillRect(-15, 0, 30, 4); }
  else if (hat === "tinfoil") { ctx.fillStyle = "#cfd6de"; ctx.beginPath(); ctx.moveTo(-12, 1); ctx.lineTo(-6, -12); ctx.lineTo(-1, -6); ctx.lineTo(3, -20); ctx.lineTo(7, -8); ctx.lineTo(12, 1); ctx.fill(); }
  else if (hat === "fish") { ctx.fillStyle = "#6ab0c0"; ctx.beginPath(); ctx.ellipse(0, -5, 15, 6, 0.15, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(13, -4); ctx.lineTo(22, -11); ctx.lineTo(21, 2); ctx.fill(); ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-9, -6, 1.8, 0, 7); ctx.fill(); }
  else if (hat === "dunce") { ctx.fillStyle = "#f4f0e0"; ctx.beginPath(); ctx.moveTo(-10, 1); ctx.lineTo(0, -34); ctx.lineTo(10, 1); ctx.fill(); ctx.fillStyle = "#222"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText("D", 0, -8); }
  else if (hat === "clown") { for (const [x, y, c] of [[-13, -2, "#ff4b4b"], [13, -2, "#4da6ff"], [0, -9, "#ffe14d"], [-7, -8, "#7fd34d"], [7, -8, "#c070ff"]]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); } }
  else if (hat === "propeller") { ctx.fillStyle = "#4da6ff"; ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#ffe14d"; ctx.fillRect(-1, -16, 2, 6); const a = performance.now() / 60; ctx.fillStyle = "#ff4b4b"; ctx.fillRect(-12 * Math.cos(a), -17, 24 * Math.cos(a), 3); }
  else if (hat === "pirate") { ctx.fillStyle = "#222"; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.quadraticCurveTo(0, -24, 18, 0); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -7, 3, 0, 7); ctx.fill(); }
  else if (hat === "sombrero") { ctx.fillStyle = "#d8b060"; ctx.beginPath(); ctx.ellipse(0, -1, 24, 6, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, -2); ctx.quadraticCurveTo(0, -24, 8, -2); ctx.fill(); ctx.fillStyle = "#c03030"; ctx.fillRect(-8, -5, 16, 3); }
  else if (hat === "viking") { ctx.fillStyle = "#8a8a90"; ctx.beginPath(); ctx.arc(0, 0, 12, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#f0e6c8"; ctx.beginPath(); ctx.moveTo(-11, -3); ctx.quadraticCurveTo(-22, -8, -18, -24); ctx.lineTo(-8, -8); ctx.fill(); ctx.beginPath(); ctx.moveTo(11, -3); ctx.quadraticCurveTo(22, -8, 18, -24); ctx.lineTo(8, -8); ctx.fill(); }
  else if (hat === "antlers") { ctx.strokeStyle = "#d8cfae"; ctx.lineWidth = 3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 5, -2); ctx.lineTo(s * 14, -22); ctx.moveTo(s * 10, -13); ctx.lineTo(s * 20, -15); ctx.moveTo(s * 12, -18); ctx.lineTo(s * 9, -28); ctx.stroke(); } }
  else if (hat === "toque") { ctx.fillStyle = "#fff"; ctx.fillRect(-10, -7, 20, 7); for (const [cx, cy, r] of [[-7, -12, 7], [0, -16, 8], [7, -12, 7]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); } }
  else if (hat === "halo") { ctx.strokeStyle = `rgba(255,220,90,${0.8 + Math.sin(performance.now() / 200) * 0.2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -16, 12, 4, 0, 0, 7); ctx.stroke(); }
  else if (hat === "dicecrown") { ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, -6); ctx.lineTo(0, -16); ctx.lineTo(6, -6); ctx.lineTo(12, -12); ctx.lineTo(12, 0); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(-5, -26, 10, 10); ctx.fillStyle = "#c01818"; for (const [x, y] of [[-2.5, -23.5], [2.5, -18.5], [0, -21]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill(); } }
  else if (hat === "flower") { for (let i = 0; i < 5; i++) { ctx.fillStyle = "#ff8fc8"; ctx.beginPath(); ctx.arc(Math.cos(i * 1.26) * 5, -6 + Math.sin(i * 1.26) * 5, 4, 0, 7); ctx.fill(); } ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(0, -6, 3, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawNpcHat(hat, x, y) {
  ctx.save(); ctx.translate(x, y - 12);
  if (hat === "tophat") { ctx.fillStyle = "#222"; ctx.fillRect(-14, -2, 28, 5); ctx.fillRect(-9, -20, 18, 18); ctx.fillStyle = "#a33"; ctx.fillRect(-9, -6, 18, 3); }
  else if (hat === "hood") { ctx.fillStyle = "#8a7a5a"; ctx.beginPath(); ctx.arc(0, 6, 19, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(0, -16); ctx.fill(); }
  else if (hat === "witch") { ctx.fillStyle = "#2a3a2a"; ctx.fillRect(-18, -2, 36, 5); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(6, -34); ctx.lineTo(11, 0); ctx.fill(); }
  else if (hat === "flatcap") { ctx.fillStyle = "#5a5040"; ctx.beginPath(); ctx.ellipse(2, 0, 16, 7, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(4, -2, 16, 4); }
  else if (hat === "chef") { ctx.fillStyle = "#fff"; ctx.fillRect(-11, -8, 22, 8); for (const [cx, cy, r] of [[-8, -14, 8], [0, -18, 9], [8, -14, 8]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); } ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.strokeRect(-11, -8, 22, 8); }
  else if (hat === "helmet") { ctx.fillStyle = "#99a"; ctx.beginPath(); ctx.arc(0, 2, 15, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#c33"; ctx.fillRect(-2, -18, 4, 8); }
  ctx.restore();
}
function drawMinimap(mine, t) {
  if (!S || S.g.ph === "lobby" && !S.g.zone) return;
  const mw = 190, mh = mw * MAP.H / MAP.W, mx = 12, my = 12, k = mw / MAP.W;
  ctx.fillStyle = "#000b"; ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
  ctx.fillStyle = "#3f6030"; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = "#0006"; for (const w of MAP.walls) if (w.z1 > 0 && w.kind !== "hwall" && w.kind !== "furn") ctx.fillRect(mx + w.x * k, my + w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
  for (const w of MAP.walls) if (w.kind === "lake") { ctx.fillStyle = "#2a6a8e"; ctx.fillRect(mx + w.x * k, my + w.y * k, w.w * k, w.h * k); }
  if (S.g.mode !== "royale") { const h = MAP.hearth; ctx.fillStyle = "#ff8a2a"; ctx.fillRect(mx + h.x * k, my + h.y * k, h.w * k, h.h * k); }
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
  if (S.g.zone) {
    const [cx, cy, r, tcx, tcy, tr] = S.g.zone;
    ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.arc(mx + cx * k, my + cy * k, Math.max(0.5, r * k), 0, 7, true); ctx.fillStyle = "#7828a080"; ctx.fill("evenodd");
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(mx + tcx * k, my + tcy * k, Math.max(0.5, tr * k), 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  if (S.g.drop && S.g.drop[4] < 1) { const [x0, y0, x1, y1, dk] = S.g.drop; ctx.strokeStyle = "#ffd34d"; ctx.beginPath(); ctx.moveTo(mx + x0 * k, my + y0 * k); ctx.lineTo(mx + x1 * k, my + y1 * k); ctx.stroke(); ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(mx + (x0 + (x1 - x0) * dk) * k, my + (y0 + (y1 - y0) * dk) * k, 3, 0, 7); ctx.fill(); }
  ctx.restore();
  if (MAP.npcs && S.g.mode !== "royale") for (const n of MAP.npcs) { ctx.fillStyle = n.id === "chef" ? "#ff8fc8" : "#e0c0ff"; ctx.fillRect(mx + n.x * k - 1.5, my + n.y * k - 1.5, 3, 3); }
  if (MAP.pitch) { ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 1; ctx.strokeRect(mx + MAP.pitch.x * k, my + MAP.pitch.y * k, MAP.pitch.w * k, MAP.pitch.h * k); }
  if (S.ball) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(mx + S.ball[0] * k, my + S.ball[1] * k, 2, 0, 7); ctx.fill(); }
  for (const [, cx2, cy2] of S.ca || []) { ctx.fillStyle = "#7dffb0"; ctx.fillRect(mx + cx2 * k - 2, my + cy2 * k - 2, 4, 4); }
  if (S.g.dis && S.g.dis.k === "tornado") text("🌪", mx + S.g.dis.x * k, my + S.g.dis.y * k, 12, "#ccc");
  for (const v of S.vh) { ctx.fillStyle = AIR[v[1]] ? "#ffd34d" : "#9fe0ff"; ctx.fillRect(mx + v[2] * k - 2, my + v[3] * k - 2, 4, 4); }
  for (const p of S.p) {
    if (p.d || p.air === 1) continue;
    if (S.g.mode === "royale" && p.id !== me) continue; // no wallhacks in the Royale
    const x = p.id === me ? pred.x : p.x, y = p.id === me ? pred.y : p.y;
    ctx.fillStyle = p.id === me ? "#fff" : p.c; ctx.beginPath(); ctx.arc(mx + x * k, my + y * k, p.id === me ? 3.5 : 2.5, 0, 7); ctx.fill();
  }
  if (S.g.boss) { const bz = S.z.find((z) => z[0] === S.g.boss); if (bz) { ctx.fillStyle = "#f33"; ctx.beginPath(); ctx.arc(mx + bz[2] * k, my + bz[3] * k, 4, 0, 7); ctx.fill(); } }
}
function drawEyes(style, x, y, t, id) {
  ctx.fillStyle = "#111";
  if (style === "googly") {
    for (const s of [-4, 4]) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + s, y, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x + s + Math.sin(t * 7 + id + s) * 2, y + Math.cos(t * 5 + s) * 2, 2, 0, 7); ctx.fill(); }
  } else if (style === "angry") {
    ctx.beginPath(); ctx.arc(x - 3, y, 2.5, 0, 7); ctx.arc(x + 3, y, 2.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 7, y - 5); ctx.lineTo(x - 1, y - 3); ctx.moveTo(x + 7, y - 5); ctx.lineTo(x + 1, y - 3); ctx.stroke();
  } else if (style === "sleepy") {
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 1, y); ctx.moveTo(x + 1, y); ctx.lineTo(x + 6, y); ctx.stroke();
  } else if (style === "shades") {
    ctx.fillRect(x - 8, y - 3, 7, 5); ctx.fillRect(x + 1, y - 3, 7, 5); ctx.fillRect(x - 2, y - 2, 4, 2);
  } else { ctx.beginPath(); ctx.arc(x - 3, y, 2.5, 0, 7); ctx.arc(x + 3, y, 2.5, 0, 7); ctx.fill(); }
}
function bar(x, y, w, h, frac, col, bg = "#0009") {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}
function text(s, x, y, size, col, align = "center", stroke = true) {
  ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`; ctx.textAlign = align; ctx.textBaseline = "middle";
  if (stroke) { ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = "#000c"; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function star(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.fill();
}


// cosmetic trails: particles dropped behind a moving player
const trailLast = new Map();
function trailFx(p, d, t) {
  const last = trailLast.get(p.id);
  trailLast.set(p.id, { x: d.x, y: d.y });
  if (!last || Math.hypot(d.x - last.x, d.y - last.y) < 1.5 || Math.random() > 0.55) return;
  const x = d.x + (Math.random() - 0.5) * 12, y = d.y + 10 + (Math.random() - 0.5) * 6;
  const k = p.trl, col = { bubbles: "#bfe8ff", slime: "#7dff5a", flies: "#222", loo: "#fff", hearts: "#ff6aa0", sparkle: "#fff6a0", fire: "#ff8a2a", money: "#7fd34d" }[k] || "#fff";
  fx.push({ kind: "trail", t0: t, dur: k === "loo" ? 2.5 : 0.9, x, y, c: k === "rainbow" ? `hsl(${(t * 300) % 360},90%,60%)` : col, trl: k, r: Math.random() });
}

// ---------------------------------------------------------------- 3D view (first / third person)
// a ray against the world (boxes, ground, the dead, other players) in game coordinates; returns the distance
function rayWorld(o, d, maxT, skipId, boxesOnly) {
  let best = maxT;
  for (const b of worldBoxes()) {
    if (b.kind === "lake") continue; // water doesn't stop a bullet or a camera
    let tmin = 0, tmax = Infinity, miss = false;
    const lo = [b.x, b.y, b.z0 || 0], hi = [b.x + b.w, b.y + b.h, b.z1 || 60];
    for (let i = 0; i < 3 && !miss; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) miss = true; continue; }
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) miss = true;
    }
    if (!miss && tmin < best) best = tmin;
  }
  if (d[2] < -1e-6) best = Math.min(best, -o[2] / d[2]);
  if (boxesOnly) return best;
  const cyl = (x, y, r, z0, z1) => {
    const hl = Math.hypot(d[0], d[1]); if (hl < 1e-6) return;
    const ux = d[0] / hl, uy = d[1] / hl, fx = o[0] - x, fy = o[1] - y, b2 = fx * ux + fy * uy, c = fx * fx + fy * fy - r * r, disc = b2 * b2 - c;
    if (disc < 0) return;
    const th = -b2 - Math.sqrt(disc); if (th < 0) return;
    const tt = th / hl, z = o[2] + d[2] * tt;
    if (z >= z0 && z <= z1 && tt < best) best = tt;
  };
  if (S) {
    for (const z of S.z) { const r = ZR[z[1]] || 15; cyl(z[2], z[3], r, z[6] || 0, (z[6] || 0) + r * 3.7); }
    for (const p of S.p) if (p.id !== skipId && !p.d && !p.air) cyl(p.x, p.y, 16, p.z || 0, (p.z || 0) + 56);
  }
  return best;
}
const dirOf = (yw, pt) => [Math.cos(yw) * Math.cos(pt), Math.sin(yw) * Math.cos(pt), Math.sin(pt)];
function render3d(mine, t, dt) {
  ctx.clearRect(0, 0, VW, VH);
  R3D.resize(VW, VH);
  if (document.pointerLockElement === cv && menusOpen()) document.exitPointerLock();
  adsZoom += ((mine && !mine.d && aiming() ? 1.35 : 1) - adsZoom) * Math.min(1, dt * 10);
  const adsK = Math.max(0, (adsZoom - 1) / 0.35), fp = viewMode === "fp";
  const eye = { x: pred.x, y: pred.y, z: pred.z + MV.EYE };
  let cam, ownView = false;
  watcher = null;
  aimYaw = yaw; aimPitch = pitch;
  const third = (tx, ty, tz, dist, side, up) => { // over-the-shoulder camera that doesn't go through walls
    const f = dirOf(yaw, pitch), rx = -Math.sin(yaw), ry = Math.cos(yaw);
    const want = [tx - f[0] * dist + rx * side, ty - f[1] * dist + ry * side, tz - f[2] * dist + up];
    const dv = [want[0] - tx, want[1] - ty, want[2] - tz], L = Math.hypot(...dv) || 1, u = dv.map((v) => v / L);
    const hit = rayWorld([tx, ty, tz], u, L, me);
    const k = Math.max(6, hit - 16);
    const cx = tx + u[0] * k, cy = ty + u[1] * k, lk = MV.lakeAt(MAP.walls, cx, cy);
    return { x: cx, y: cy, z: Math.max(lk ? lk.z0 + 8 : 8, tz + u[2] * k), yaw, pitch, fov: OPTS.fov - 6 - adsK * 20 };
  };
  if (!mine) cam = { x: MAP.W / 2, y: MAP.H + 300, z: 900, look: [MAP.W / 2, MAP.H / 2, 0], fov: 60 };
  else if (mine.d || mine.out) {
    let f = mine;
    if (mine.out && S.g.ph === "royale") { const alive = S.p.filter((p) => !p.d && !p.out); if (alive.length) f = alive[Math.floor(t / 8) % alive.length]; }
    const d = smooth("spec", f.x, f.y, dt), a = t * 0.25;
    cam = { x: d.x - Math.cos(a) * 260, y: d.y - Math.sin(a) * 260, z: (f.z || 0) + 180, look: [d.x, d.y, (f.z || 0) + 30], fov: 70 };
  } else if (mine.air === 1 && S.g.drop) {
    const [x0, y0, x1, y1, k] = S.g.drop, bx = x0 + (x1 - x0) * k, by = y0 + (y1 - y0) * k;
    cam = third(bx, by, 760, 320, 0, 60); cam.look = null;
  } else if (mine.inf === "second") {
    // second person: you are seen through someone else's eyes, looking at you
    let best = null, bd = 900 * 900;
    const far = (x, y) => { const d2 = (x - pred.x) ** 2 + (y - pred.y) ** 2; return d2 > 160 * 160 && d2 < bd ? d2 : 0; };
    for (const q of S.p) { if (q.id === me || q.d) continue; const d2 = far(q.x, q.y); if (d2) { bd = d2; best = { x: q.x, y: q.y, z: (q.z || 0) + 46, who: q.n }; } }
    for (const z of S.z) { const d2 = far(z[2], z[3]); if (d2) { bd = d2; const r = z[1] === "b" ? 48 : 15; best = { x: z[2], y: z[3], z: (z[6] || 0) + r * 3, who: z[1] === "b" ? "the boss" : "a zombie" }; } }
    if (!best) { const a = t * 0.15; best = { x: pred.x + Math.cos(a) * 320, y: pred.y + Math.sin(a) * 320, z: 60, who: "something in the bushes" }; }
    const w = smooth("watch", best.x, best.y, dt);
    cam = { x: w.x, y: w.y, z: best.z, look: [pred.x, pred.y, pred.z + 30], fov: 70 };
    watcher = { x: w.x, y: w.y, who: best.who };
  } else if (fp && !mine.vh && !mine.air) {
    const bob = pred.gr ? Math.sin(t * 11) * Math.min(1, Math.hypot(pred.vx, pred.vy) / 200) * 1.6 : 0;
    cam = { x: eye.x, y: eye.y, z: eye.z + bob, yaw, pitch, fov: OPTS.fov - adsK * 30 };
    ownView = true;
  } else {
    cam = mine.vh ? third(eye.x, eye.y, eye.z + 30, 220, 0, 50) : third(eye.x, eye.y, eye.z, 120 - adsK * 50, 30, 14);
    // aim where the crosshair points, not where the camera is
    const d = dirOf(yaw, pitch), hitT = rayWorld([cam.x, cam.y, cam.z], d, 2500, me);
    const px = cam.x + d[0] * hitT, py = cam.y + d[1] * hitT, pz = cam.z + d[2] * hitT;
    aimYaw = Math.atan2(py - eye.y, px - eye.x); aimPitch = Math.atan2(pz - (eye.z - 6), Math.hypot(px - eye.x, py - eye.y));
  }
  camNow = cam;
  // what you're about to build
  let ghost = null;
  if (building && mine && !mine.d && cam.yaw !== undefined) {
    const d = dirOf(cam.yaw, cam.pitch);
    let gx = pred.x + Math.cos(yaw) * 90, gy = pred.y + Math.sin(yaw) * 90;
    if (d[2] < -0.02) { const tt = -cam.z / d[2]; if (tt < 400) { gx = cam.x + d[0] * tt; gy = cam.y + d[1] * tt; } }
    const g = { x: Math.round((gx - 20) / 40) * 40, y: Math.round((gy - 20) / 40) * 40 };
    ghost = { ...g, ok: Math.hypot(g.x + 20 - pred.x, g.y + 20 - pred.y) < 280 && PIECES[buildKind] && mine.g >= PIECES[buildKind].cost * 0.7 };
    ghost3d = g;
  } else ghost3d = null;
  // expire effects (the 2D renderer normally does this)
  for (let i = fx.length - 1; i >= 0; i--) if ((t - fx[i].t0) / fx[i].dur >= 1) fx.splice(i, 1);
  const sl = slashT.get(me), moving = Math.hypot(pred.vx, pred.vy) > 30 && pred.gr;
  const vm = ownView && mine && !mine.d ? { type: mine.w, rar: mine.wr, show: true, kick: Math.max(0, 1 - (t - lastShotT) / 0.12), bob: moving ? t * 11 : 0, ads: adsK, swing: sl ? Math.min(1, (t - sl) / 0.25) : 1 } : null;
  R3D.frame({ S, MAP, t, dt, me, pred, aimYaw, aimPitch, fp: ownView, cam, fx, messes, hearthHitT, ghost, vm, slashT });
  overlay3d(mine, t, dt);
  if (t - hurtFlash < 0.3) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); g.addColorStop(0, "#f000"); g.addColorStop(1, `rgba(200,0,0,${0.5 * (1 - (t - hurtFlash) / 0.3)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
  if (t - fogT < 1.2) { ctx.fillStyle = `rgba(120,40,160,${0.25 * (1 - (t - fogT) / 1.2)})`; ctx.fillRect(0, 0, VW, VH); }
  drawHud(mine, t);
  drawMinimap(mine, t);
  drawCrosshair(mine, t);
  if (mine && document.pointerLockElement !== cv && !menusOpen()) { ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 170, VH / 2 + 40, 340, 34, 8); ctx.fill(); text("Click to look around  ·  T switches view", VW / 2, VH / 2 + 57, 15, "#ffd34d"); }
  if (t - viewT < 2) text(`${VIEW_NAME[viewMode]}  (T to switch)`, VW / 2, 150, 20, "#fff");
  for (const k of disp.keys()) if (disp.get(k).seen < frameNo - 30) disp.delete(k);
}
let ghost3d = null;
// names, health bars, damage numbers and the like, drawn flat over the 3D view
function overlay3d(mine, t, dt) {
  // labels hide behind walls: a quick line-of-sight check from the camera
  const seen = (x, y, z) => { if (!camNow || camNow.x === undefined) return true; const v = [x - camNow.x, y - camNow.y, z - camNow.z], L = Math.hypot(...v); if (L < 1) return true; return rayWorld([camNow.x, camNow.y, camNow.z], v.map((c) => c / L), L, me, true) >= L - 12; };
  const P = (x, y, z) => { const s = R3D.project(x, y, z); return s && s.d < 1500 && seen(x, y, z) ? s : null; };
  for (const p of S.p) {
    if (p.d || p.air === 1 || p.vh) continue;
    const own = p.id === me;
    const d = own ? { x: pred.x, y: pred.y } : smooth("p" + p.id, p.x, p.y, dt), z = own ? pred.z : (p.z || 0);
    if (p.trl && !(own && viewMode === "fp")) { const n = fx.length; trailFx(p, d, t); if (fx.length > n) fx[fx.length - 1].z = z + 4; }
    if (own) continue;
    const s = P(d.x, d.y, z + 66); if (!s) continue;
    let y = s.y;
    if (p.st > 0) { ctx.fillStyle = "#ffcc00"; for (let i = 0; i < p.st; i++) star(s.x - (p.st - 1) * 7 + i * 14, y - 16, 6); }
    text(`${p.ch ? "♛ " : ""}${p.n} · ${p.lv}`, s.x, y, 12, p.ch ? "#ffd34d" : "#e8e8e8");
    if (p.ttl) { y -= 14; text(`« ${p.ttl} »`, s.x, y, 10, "#ffc030"); }
    if (p.sh) { y -= 20; text("🔔 TEAMKILLER 🔔", s.x, y, 16 + Math.sin(t * 10) * 2, Math.floor(t * 4) % 2 ? "#ff3030" : "#fff"); }
    if (p.bi) { y -= 14; text("covered in bile", s.x, y, 11, "#b8e04a"); }
    if (p.go) { y -= 16; text(p.go === "poo" ? "💩 busy" : "💦 busy", s.x, y, 12, "#ffe7a0"); }
    bar(s.x - 18, s.y + 8, 36, 4, p.hp / p.mh, "#5f5");
    const b = bubbles.get(p.id);
    if (b && t - b.t < 4.5) { ctx.font = "bold 13px Trebuchet MS"; const tw = Math.min(260, ctx.measureText(b.text).width + 16); ctx.fillStyle = "#fffe"; ctx.beginPath(); ctx.roundRect(s.x - tw / 2, y - 44, tw, 24, 8); ctx.fill(); text(b.text.length > 36 ? b.text.slice(0, 35) + "…" : b.text, s.x, y - 32, 13, "#222", "center", false); }
  }
  if (S.sh && pred.z < -40) for (const w of MAP.walls) {
    if (w.kind === "shrine") { const s = P(w.x + w.w / 2, w.y + w.h / 2, w.z1 + 30); if (s && s.d < 600) text(S.sh[5] ? "The shrine stands open" : "Carved here:  " + S.sh.slice(0, 4).map((g, i) => (i < S.sh[4] ? "✓" : "") + GLYPH_CH[g]).join("   "), s.x, s.y, 18, "#bfe8ff"); }
    if (w.kind === "glyph") { const s = P(w.x + 15, w.y + 15, w.z1 + 16); if (s && s.d < 500) text(GLYPH_CH[w.g], s.x, s.y, 26, S.sh.slice(0, S.sh[4]).includes(w.g) ? "#ffffff" : "#7dd8ff"); }
  }
  if (MAP.npcs && S.g.mode !== "royale") for (const n of MAP.npcs) {
    const s = P(n.x, n.y, 72); if (!s || s.d > 900) continue;
    text(n.name, s.x, s.y, 12, "#e0c0ff"); text(n.role, s.x, s.y + 13, 10, "#b0a0c8");
    if (myLove(n.id) >= 20) text(hearts(myLove(n.id)), s.x, s.y + 26, 11, "#ff8fc8");
    if (mine && (!mine.nt.includes(n.id) || mine.qr.includes(n.id))) { const q = mine.qr.includes(n.id); text(q ? "?" : "!", s.x, s.y - 20 + Math.sin(t * 4) * 3, 24, q ? "#7dffb0" : "#ffd34d"); }
    if (n.id === "chef" && Math.sin(t * 1.3 + n.x) > 0.6) text(["IT'S RAW!", "DONKEY!", "SHUT IT DOWN!", "WHERE'S THE LAMB SAUCE?"][Math.floor(t / 4.8 + n.x) % 4], s.x, s.y - 40, 14, "#ff5050");
  }
  for (const [, type, zx, zy, hp, , zh] of S.z) {
    if (hp >= 100 || type === "b") continue;
    const r = ZR[type] || 15, s = P(zx, zy, (zh || 0) + r * 3.9);
    if (s && s.d < 900) bar(s.x - 16, s.y, 32, 4, hp / 100, "#e44");
  }
  const hw = MAP.hearth, hs = P(hw.x + hw.w / 2, hw.y + hw.h / 2, 190);
  if (hs && S.g.mode !== "royale") { text("THE HEARTH", hs.x, hs.y - 12, 14, "#ffe9a0"); bar(hs.x - 60, hs.y, 120, 8, S.g.hh / S.g.hm, S.g.hh / S.g.hm > 0.3 ? "#e8703a" : "#ff3030"); }
  for (const [, , vx, vy, , vhp] of S.vh) if (vhp < 100) { const s = P(vx, vy, 70); if (s) bar(s.x - 26, s.y, 52, 5, vhp / 100, vhp > 35 ? "#8fd35a" : "#e84a3a"); }
  for (const [, kind, bx, by, hp] of S.b) if (hp < 100 && kind !== "spikes") { const s = P(bx + 20, by + 20, 80); if (s && s.d < 700) bar(s.x - 18, s.y, 36, 4, hp / 100, "#e8a33a"); }
  if (ghost3d && PIECES[buildKind]) { const s = P(ghost3d.x + 20, ghost3d.y + 20, 50); if (s) text(PIECES[buildKind].name, s.x, s.y, 12, "#fff"); }
  for (const f of fx) {
    const k = (t - f.t0) / f.dur; if (k >= 1) continue;
    if (f.kind === "text") { const s = P(f.x, f.y + 20, (f.z || 40) + k * 30); if (s) { ctx.globalAlpha = 1 - k; text(f.text, s.x, s.y, f.big ? 20 : 14, f.color); ctx.globalAlpha = 1; } }
    else if (f.kind === "trail") {
      const s = P(f.x, f.y, (f.z || 6) + (f.trl === "fire" || f.trl === "bubbles" || f.trl === "hearts" || f.trl === "money" ? k * 18 : 0)); if (!s) continue;
      const sc = Math.max(0.3, Math.min(2.5, 300 / s.d));
      ctx.globalAlpha = 1 - k; ctx.fillStyle = f.c;
      if (f.trl === "hearts") text("♥", s.x, s.y, 12 * sc, f.c, "center", false);
      else if (f.trl === "money") text("$", s.x, s.y, 13 * sc, f.c);
      else { ctx.beginPath(); ctx.arc(s.x, s.y, 3.5 * sc, 0, 7); if (f.trl === "bubbles") { ctx.strokeStyle = f.c; ctx.lineWidth = 1.5; ctx.stroke(); } else ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- render
let frameNo = 0, lastFrame = T();
const dark = document.createElement("canvas"), dctx = dark.getContext("2d");
function render() {
  requestAnimationFrame(render);
  const t = T(), dt = Math.min(0.05, t - lastFrame); lastFrame = t; frameNo++;
  drawWheel(t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, VW, VH);
  if (!MAP || !S) { text("Connecting to the valley...", VW / 2, VH / 2, 24, "#ffd34d"); return; }
  const mine = S.p.find((p) => p.id === me);
  use3d = has3d && viewMode !== "top" && !intro && !!mine;
  if (has3d) R3D.show(use3d);
  stepPred(dt);
  if (use3d) { render3d(mine, t, dt); return; }
  if (document.pointerLockElement === cv) document.exitPointerLock();
  let cam = mine ? { x: pred.x, y: pred.y } : { x: MAP.W / 2, y: MAP.H / 2 };
  let zoom = 1, shot = null;
  if (intro) { shot = introShot(t); cam = shot.cam; zoom = shot.z; }
  if (mine && mine.out && S.g.ph === "royale") { const alive = S.p.filter((p) => !p.d && !p.out); if (alive.length) { const f = alive[Math.floor(t / 8) % alive.length]; const d = smooth("spec", f.x, f.y, dt); cam = { x: d.x, y: d.y }; } }
  // aim down sights: zoom in on where you're looking
  adsZoom += ((!intro && mine && !mine.d && aiming() ? 1.35 : 1) - adsZoom) * Math.min(1, dt * 10);
  if (!intro && Math.abs(adsZoom - 1) > 0.005) zoom = adsZoom;
  // second person: the camera belongs to whoever is watching you
  watcher = null;
  if (!intro && mine && !mine.d && mine.inf === "second") {
    // the nearest thing that's far enough away to have a view of you; failing that, something in the bushes
    let best = null, bd = 900 * 900;
    const far = (x, y) => { const d2 = (x - pred.x) ** 2 + (y - pred.y) ** 2; return d2 > 240 * 240 && d2 < bd ? d2 : 0; };
    for (const q of S.p) { if (q.id === me || q.d) continue; const d2 = far(q.x, q.y); if (d2) { bd = d2; best = { x: q.x, y: q.y, who: q.n }; } }
    for (const z of S.z) { const d2 = far(z[2], z[3]); if (d2) { bd = d2; best = { x: z[2], y: z[3], who: z[1] === "b" ? "the boss" : "a zombie" }; } }
    if (!best) { const a = t * 0.15; best = { x: pred.x + Math.cos(a) * 320, y: pred.y + Math.sin(a) * 320, who: "something in the bushes" }; }
    const w = smooth("watch", best.x, best.y, dt);
    const lim = Math.min(VW, VH) * 0.34 / zoom, dx = pred.x - w.x, dy = pred.y - w.y, l = Math.hypot(dx, dy);
    const k = l > lim ? (l - lim) / l : 0;
    cam = { x: w.x + dx * k, y: w.y + dy * k };
    watcher = { x: w.x, y: w.y, who: best.who };
  }
  shake *= Math.pow(0.001, dt);
  const shk = OPTS.shake ? shake : 0, sx = (Math.random() - 0.5) * shk, sy = (Math.random() - 0.5) * shk;
  const ox = Math.round(VW / 2 - cam.x + sx), oy = Math.round(VH / 2 - cam.y + sy);
  Object.assign(view, zoom !== 1 ? { cx: cam.x, cy: cam.y, z: zoom, sx: 0, sy: 0 } : { cx: cam.x, cy: cam.y, z: 1, sx: ox - (VW / 2 - cam.x), sy: oy - (VH / 2 - cam.y) });
  ctx.save();
  const worldXf = () => { if (zoom !== 1) { ctx.translate(VW / 2, VH / 2); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y); } else ctx.translate(ox, oy); };
  worldXf();

  // ground
  ctx.fillStyle = "#4f7a3a"; ctx.fillRect(0, 0, MAP.W, MAP.H);
  ctx.fillStyle = "#6a5a3a"; // dirt paths
  ctx.fillRect(MAP.W / 2 - 40, 0, 80, MAP.H); ctx.fillRect(0, MAP.H / 2 - 40, MAP.W, 80);
  for (const d of decor) {
    if (d.x < cam.x - VW / 2 / zoom - 20 || d.x > cam.x + VW / 2 / zoom + 20 || d.y < cam.y - VH / 2 / zoom - 20 || d.y > cam.y + VH / 2 / zoom + 20) continue;
    if (d.k === "tuft") { ctx.strokeStyle = "#3d6a2c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(d.x - 4, d.y); ctx.lineTo(d.x - 2, d.y - 7); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 1, d.y - 9); ctx.moveTo(d.x + 4, d.y); ctx.lineTo(d.x + 5, d.y - 6); ctx.stroke(); }
    else { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, 7); ctx.fill(); }
  }
  ctx.strokeStyle = "#2a3d20"; ctx.lineWidth = 8; ctx.strokeRect(0, 0, MAP.W, MAP.H);
  if (MAP.pitch) { // the football pitch: the only thing in the valley that calms anyone down
    const p = MAP.pitch; ctx.fillStyle = "#5a8a40"; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "#f0f0f0cc"; ctx.lineWidth = 3; ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.beginPath(); ctx.moveTo(p.x + p.w / 2, p.y); ctx.lineTo(p.x + p.w / 2, p.y + p.h); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 50, 0, 7); ctx.stroke();
    for (const s of [0, 1]) ctx.strokeRect(s ? p.x + p.w - 70 : p.x, p.y + p.h / 2 - 80, 70, 160);
  }

  // plots
  MAP.plots.forEach((pl, i) => {
    const st = S.pl[i];
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(pl.x - 26, pl.y - 26, 52, 52);
    ctx.fillStyle = "#6e4826"; for (let r = -18; r <= 18; r += 12) ctx.fillRect(pl.x - 22, pl.y + r - 2, 44, 4);
    if (st === 1) { ctx.fillStyle = "#c9a36a"; ctx.beginPath(); ctx.arc(pl.x, pl.y, 4, 0, 7); ctx.fill(); }
    else if (st === 2) { ctx.strokeStyle = "#7fd34d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pl.x, pl.y + 8); ctx.lineTo(pl.x, pl.y - 6); ctx.stroke(); ctx.fillStyle = "#7fd34d"; ctx.beginPath(); ctx.ellipse(pl.x - 6, pl.y - 6, 6, 3, -0.5, 0, 7); ctx.ellipse(pl.x + 6, pl.y - 6, 6, 3, 0.5, 0, 7); ctx.fill(); }
    else if (st === 3) {
      const bob = Math.sin(t * 3 + i) * 2;
      ctx.fillStyle = "#e9e0f0"; ctx.beginPath(); ctx.arc(pl.x, pl.y + 4, 12, 0, 7); ctx.fill();
      ctx.fillStyle = "#b35fd0"; ctx.beginPath(); ctx.arc(pl.x, pl.y + 1, 12, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = "#4cbf3a"; ctx.beginPath(); ctx.ellipse(pl.x - 5, pl.y - 12 + bob, 4, 9, -0.4, 0, 7); ctx.ellipse(pl.x + 5, pl.y - 12 + bob, 4, 9, 0.4, 0, 7); ctx.fill();
    }
  });

  // messes. Someone has to clean these up. Nobody will.
  for (const m of messes) {
    const age = t - m.t; if (age > 90) continue;
    ctx.globalAlpha = Math.min(1, (90 - age) / 10);
    const s = m.big ? 1.6 : 1;
    if (m.kind === "pee") { ctx.fillStyle = "#e8d84a99"; ctx.beginPath(); ctx.ellipse(m.x + 4, m.y + 14, 16 * s, 8 * s, 0.2, 0, 7); ctx.ellipse(m.x - 8 * s, m.y + 18, 8 * s, 5 * s, 0, 0, 7); ctx.fill(); }
    else {
      ctx.fillStyle = "#6b4520";
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(m.x, m.y + 14 - i * 5 * s, (9 - i * 2.5) * s, (5 - i) * s, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#111"; for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; ctx.fillRect(m.x + Math.cos(a) * 14 * s, m.y + Math.sin(a * 1.3) * 8 + 2, 2, 2); }
    }
  }
  ctx.globalAlpha = 1;

  // the old well
  if (MAP.well && S.g.mode !== "royale") {
    const wl = MAP.well;
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(wl.x + 6, wl.y + 8, 28, 14, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8a8a8e"; ctx.beginPath(); ctx.arc(wl.x, wl.y, 24, 0, 7); ctx.fill();
    ctx.fillStyle = "#6d6d72"; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(wl.x + Math.cos(i * 0.785) * 19, wl.y + Math.sin(i * 0.785) * 19, 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#1c2a14"; ctx.beginPath(); ctx.arc(wl.x, wl.y, 14, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(90,200,60,${0.35 + Math.sin(t * 2) * 0.15})`; ctx.beginPath(); ctx.arc(wl.x, wl.y, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = "#5a3a1e"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(wl.x - 26, wl.y - 4); ctx.lineTo(wl.x - 26, wl.y - 34); ctx.lineTo(wl.x + 26, wl.y - 34); ctx.lineTo(wl.x + 26, wl.y - 4); ctx.stroke();
  }

  // the lake: deep water, with the sunken shrine just about visible on the bottom
  const lake = MAP.walls.find((w) => w.kind === "lake");
  if (lake) {
    ctx.fillStyle = "#6a6a62"; ctx.fillRect(lake.x - 24, lake.y - 24, lake.w + 48, lake.h + 48);
    const g = ctx.createRadialGradient(lake.x + lake.w / 2, lake.y + lake.h / 2, 40, lake.x + lake.w / 2, lake.y + lake.h / 2, Math.max(lake.w, lake.h) * 0.7);
    g.addColorStop(0, "#14405e"); g.addColorStop(1, "#2a6a8e"); ctx.fillStyle = g; ctx.fillRect(lake.x, lake.y, lake.w, lake.h);
    for (const w of MAP.walls) {
      if (w.z1 > 0 || w.kind === "lake" || w.kind === "bank") continue;
      ctx.globalAlpha = 0.55;
      if (w.kind === "shrine") { ctx.fillStyle = "#8a9a8a"; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = "#c8b060"; ctx.fillRect(w.x + w.w / 2 - 14, w.y + w.h - 30, 28, 30); }
      else if (w.kind === "glyph") { const lit = S.sh && S.sh.slice(0, S.sh[4]).includes(w.g); ctx.fillStyle = lit ? "#60e0ff" : "#5a6a6a"; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.globalAlpha = 0.9; text(GLYPH_CH[w.g], w.x + 15, w.y + 16, 16, lit ? "#fff" : "#bfe8ff"); }
      else if (w.kind === "vent") { ctx.fillStyle = "#bfe8ff"; for (let i = 0; i < 3; i++) { const q = (t * 0.7 + i / 3) % 1; ctx.beginPath(); ctx.arc(w.x + 20 + Math.sin(t * 3 + i) * 6, w.y + 20 - q * 40, 3 + q * 4, 0, 7); ctx.fill(); } }
      else { ctx.fillStyle = "#1a3a50"; ctx.beginPath(); ctx.roundRect(w.x, w.y, w.w, w.h, 14); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 14; i++) { const q = (t * 0.05 + i * 0.37) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.12 * Math.sin(q * Math.PI)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lake.x + ((i * 97) % lake.w), lake.y + q * lake.h); ctx.lineTo(lake.x + ((i * 97) % lake.w) + 40, lake.y + q * lake.h); ctx.stroke(); }
    const sh = MAP.walls.find((w) => w.kind === "shrine");
    if (sh && S.sh && (sh.x + sh.w / 2 - pred.x) ** 2 + (sh.y + sh.h / 2 - pred.y) ** 2 < 420 * 420 && pred.z < -40) text(S.sh[5] ? "The shrine stands open" : "Carved on the shrine:  " + S.sh.slice(0, 4).map((g, i) => (i < S.sh[4] ? "✓" : "") + GLYPH_CH[g]).join("  "), sh.x + sh.w / 2, sh.y - 14, 15, "#bfe8ff");
  }
  // walls / buildings
  const inside = MAP.walls.find((w) => w.kind === "house" && pred.x > w.x && pred.x < w.x + w.w && pred.y > w.y && pred.y < w.y + w.h && pred.z < w.z0);
  const walls2d = [...MAP.walls].sort((a, b) => (a.z1 || 0) - (b.z1 || 0)); // low things first, so towers and catwalks sit on top
  for (const w of walls2d) {
    if (w.kind === "hearth" || w.kind === "lake" || w.kind === "bank" || w.z1 <= 0) continue;
    if (w.kind === "hwall") { ctx.fillStyle = "#6b4228"; ctx.fillRect(w.x, w.y, w.w, w.h); continue; }
    if (w.kind === "furn") {
      if (w.f === "bed") { ctx.fillStyle = "#5a3a1e"; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = "#e8e0d0"; ctx.fillRect(w.x + 4, w.y + 4, w.w - 8, 18); ctx.fillStyle = ["#a33b2b", "#3b5ea3", "#5d6b3a", "#6b4a8a"][(w.id || 0) % 4]; ctx.fillRect(w.x + 4, w.y + 24, w.w - 8, w.h - 28); }
      else { ctx.fillStyle = "#7a5530"; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = "#94693c"; ctx.fillRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6); ctx.fillStyle = "#e8d84a"; ctx.beginPath(); ctx.arc(w.x + w.w / 2, w.y + w.h / 2, 4, 0, 7); ctx.fill(); }
      continue;
    }
    if (w.kind === "house") {
      if (w === inside) { ctx.fillStyle = "#c8a878"; ctx.globalAlpha = 0.18; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.globalAlpha = 1; continue; } // you're inside: lift the roof off
      const roof = [["#a33b2b", "#c24a36"], ["#3b5ea3", "#4a6fc2"], ["#5d6b3a", "#6f7f45"], ["#6b4a8a", "#7d5aa0"]][w.roof || 0];
      ctx.fillStyle = "#00000040"; ctx.fillRect(w.x + 8, w.y + 10, w.w, w.h);
      ctx.fillStyle = roof[0]; ctx.fillRect(w.x - 4, w.y - 4, w.w + 8, w.h + 8);
      ctx.fillStyle = roof[1]; for (let xx = w.x - 4; xx < w.x + w.w + 4; xx += 16) ctx.fillRect(xx, w.y - 4, 8, w.h + 8);
      ctx.fillStyle = "#3a2616"; ctx.fillRect(w.x + w.w / 2 - 14, w.door === "n" ? w.y - 8 : w.y + w.h - 2, 28, 10);
      continue;
    }
    if (w.kind === "rubble") { ctx.fillStyle = "#00000030"; ctx.fillRect(w.x + 4, w.y + 6, w.w, w.h); ctx.fillStyle = "#6d5a4a"; ctx.fillRect(w.x + 8, w.y + 8, w.w - 16, w.h - 16); ctx.fillStyle = "#8b5a3a"; for (let i = 0; i < 9; i++) ctx.fillRect(w.x + ((i * 37) % 97) / 97 * (w.w - 20), w.y + ((i * 61) % 89) / 89 * (w.h - 16), 20, 14); continue; }
    if (w.kind === "post") { ctx.fillStyle = "#f4f4f4"; ctx.fillRect(w.x, w.y, w.w, w.h); continue; }
    if (w.kind === "pad") { const cx = w.x + w.w / 2, cy = w.y + w.h / 2, k = (t * 1.5) % 1; ctx.fillStyle = "#1090c0"; ctx.beginPath(); ctx.arc(cx, cy, w.w / 2, 0, 7); ctx.fill(); ctx.strokeStyle = `rgba(190,248,255,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, w.w / 2 * (0.4 + k * 0.8), 0, 7); ctx.stroke(); continue; }
    if (w.kind === "step" || w.kind === "tower" || w.kind === "bridge" || w.kind === "ledge" || w.kind === "crate") {
      const lift = Math.min(18, (w.z1 || 0) / 12);
      ctx.fillStyle = "#00000040"; ctx.fillRect(w.x + lift * 0.6, w.y + lift, w.w, w.h);
      ctx.fillStyle = { step: "#9a7a4a", tower: "#7d7066", bridge: "#8a6a42", ledge: "#6a6a74", crate: "#d8b860" }[w.kind];
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = "#ffffff18"; ctx.fillRect(w.x, w.y, w.w, 3);
      if (w.kind === "tower" || w.kind === "ledge") text(`${Math.round(w.z1)}`, w.x + w.w / 2, w.y + w.h / 2 + 4, 11, "#ffffffaa", "center", false);
      continue;
    }
    if (w.kind === "tree") {
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      ctx.fillStyle = "#00000040"; ctx.beginPath(); ctx.ellipse(cx + 8, cy + 10, w.w * 0.7, w.h * 0.45, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(cx - 5, cy - 4, 10, w.h / 2 + 4);
      ctx.fillStyle = "#2f5e28"; ctx.beginPath(); ctx.arc(cx, cy - 8, w.w * 0.72, 0, 7); ctx.fill();
      ctx.fillStyle = "#3b7431"; ctx.beginPath(); ctx.arc(cx - 6, cy - 14, w.w * 0.45, 0, 7); ctx.fill();
      continue;
    }
    if (w.kind === "fence" || w.w < 40 || w.h < 40) { ctx.fillStyle = "#7a5530"; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = "#94693c"; for (let yy = w.y; yy < w.y + w.h; yy += 20) ctx.fillRect(w.x - 3, yy, w.w + 6, 4); continue; }
    if (w.w <= 90 && w.h <= 90) { ctx.fillStyle = "#7d7d80"; ctx.beginPath(); ctx.roundRect(w.x, w.y, w.w, w.h, 18); ctx.fill(); ctx.fillStyle = "#9a9a9e"; ctx.beginPath(); ctx.roundRect(w.x + 8, w.y + 6, w.w - 24, w.h - 26, 12); ctx.fill(); continue; }
    ctx.fillStyle = "#00000040"; ctx.fillRect(w.x + 8, w.y + 10, w.w, w.h);
    ctx.fillStyle = "#8b5a3a"; ctx.fillRect(w.x, w.y, w.w, w.h);
    const roof = [["#a33b2b", "#c24a36"], ["#3b5ea3", "#4a6fc2"], ["#5d6b3a", "#6f7f45"], ["#6b4a8a", "#7d5aa0"]][w.roof || 0];
    ctx.fillStyle = roof[0]; ctx.fillRect(w.x - 6, w.y - 6, w.w + 12, w.h * 0.55);
    ctx.fillStyle = roof[1]; for (let xx = w.x - 6; xx < w.x + w.w + 6; xx += 16) ctx.fillRect(xx, w.y - 6, 8, w.h * 0.55);
    ctx.fillStyle = "#3a2616"; ctx.fillRect(w.x + w.w / 2 - 12, w.y + w.h - 30, 24, 30);
  }
  // hearth
  const hw = MAP.hearth;
  const hflash = t - hearthHitT < 0.12;
  ctx.fillStyle = "#00000050"; ctx.fillRect(hw.x + 10, hw.y + 12, hw.w, hw.h);
  ctx.fillStyle = hflash ? "#c77" : "#9a8a70"; ctx.fillRect(hw.x, hw.y, hw.w, hw.h);
  ctx.fillStyle = "#6f5f4a"; for (let yy = hw.y; yy < hw.y + hw.h; yy += 16) for (let xx = hw.x + ((yy / 16) % 2) * 12; xx < hw.x + hw.w; xx += 24) ctx.fillRect(xx, yy, 22, 14);
  const fl = 1 + Math.sin(t * 9) * 0.1;
  ctx.fillStyle = "#ff8a2a"; ctx.beginPath(); ctx.ellipse(hw.x + hw.w / 2, hw.y + hw.h / 2, 26 * fl, 34 * fl, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#ffe07a"; ctx.beginPath(); ctx.ellipse(hw.x + hw.w / 2, hw.y + hw.h / 2 + 6, 13 * fl, 18 * fl, 0, 0, 7); ctx.fill();
  text("THE HEARTH", hw.x + hw.w / 2, hw.y - 28, 14, "#ffe9a0");
  bar(hw.x, hw.y - 16, hw.w, 8, S.g.hh / S.g.hm, S.g.hh / S.g.hm > 0.3 ? "#e8703a" : "#ff3030");

  // crates
  for (const [id, x, y, rar, grave] of S.cr) {
    const glow = 0.5 + Math.sin(t * 4 + id) * 0.3;
    ctx.fillStyle = RARITY_COL[rar] + "55"; ctx.beginPath(); ctx.arc(x, y, 26 + glow * 6, 0, 7); ctx.fill();
    if (grave) { ctx.fillStyle = "#888"; ctx.beginPath(); ctx.roundRect(x - 12, y - 16, 24, 30, [12, 12, 2, 2]); ctx.fill(); text("RIP", x, y - 2, 10, "#333", "center", false); }
    else { ctx.fillStyle = "#6b4a2a"; ctx.fillRect(x - 15, y - 12, 30, 24); ctx.fillStyle = RARITY_COL[rar]; ctx.fillRect(x - 15, y - 3, 30, 6); ctx.fillRect(x - 3, y - 12, 6, 24); }
  }

  // Slop-Tech caches
  for (const [id, x, y, busy] of S.ca || []) {
    ctx.fillStyle = "#0005"; ctx.fillRect(x - 14, y - 6, 36, 26);
    ctx.fillStyle = "#2a3440"; ctx.fillRect(x - 18, y - 14, 36, 28);
    ctx.fillStyle = busy ? "#ffd34d" : Math.floor(t * 2 + id) % 2 ? "#7dffb0" : "#2a8a5a"; ctx.fillRect(x - 12, y - 9, 24, 8);
    text("SLOP-TECH", x, y + 7, 8, "#9fb", "center", false);
  }
  // the football
  if (S.ball) { const [bx, by, bz] = S.ball, yy = by - bz * 0.5; ctx.fillStyle = "#0005"; ctx.beginPath(); ctx.ellipse(bx, by + 6, 9, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, yy, 9, 0, 7); ctx.fill(); ctx.strokeStyle = "#222"; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(bx, yy, 3.5, 0, 7); ctx.fill(); }
  // natural disasters
  const dis = S.g.dis;
  if (dis) {
    if (dis.k === "flood" && dis.w > 0) { ctx.fillStyle = `rgba(50,120,190,${Math.min(0.45, dis.w / 60)})`; ctx.fillRect(0, 0, MAP.W, MAP.H); }
    for (const [mx2, my2, left] of dis.m || []) { const k = Math.max(0, Math.min(1, 1 - left / 1.8)); ctx.strokeStyle = `rgba(255,80,40,${0.4 + k * 0.6})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx2, my2, 170, 0, 7); ctx.stroke(); ctx.fillStyle = `rgba(255,80,40,${0.1 + k * 0.2})`; ctx.fill(); ctx.fillStyle = "#ffb040"; ctx.beginPath(); ctx.arc(mx2 - (1 - k) * 300, my2 - (1 - k) * 500, 22, 0, 7); ctx.fill(); }
    if (dis.k === "tornado") for (let i = 0; i < 6; i++) { const a = t * 6 + i; ctx.strokeStyle = `rgba(160,150,140,${0.5 - i * 0.06})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(dis.x + Math.cos(a) * 10, dis.y + Math.sin(a) * 10, 30 + i * 22, a, a + 4); ctx.stroke(); }
  }
  // things people built
  for (const [id, kind, bx, by, hp, ba, owner] of S.b) {
    const hitK = t - (pieceHit.get(id) || -9) < 0.12;
    const cx = bx + 20, cy = by + 20;
    if (kind === "wall") {
      ctx.fillStyle = "#0004"; ctx.fillRect(bx + 5, by + 6, 40, 40);
      ctx.fillStyle = hitK ? "#c77" : "#8a6a42"; ctx.fillRect(bx, by, 40, 40);
      ctx.fillStyle = "#6e5232"; for (let i = 0; i < 3; i++) ctx.fillRect(bx, by + 4 + i * 13, 40, 3);
      ctx.fillStyle = "#555"; for (const [nx, ny] of [[6, 7], [34, 7], [6, 33], [34, 33]]) ctx.fillRect(bx + nx - 1, by + ny - 1, 3, 3);
    } else if (kind === "spikes") {
      ctx.fillStyle = "#4a3a2a"; ctx.fillRect(bx + 4, by + 4, 32, 32);
      ctx.fillStyle = "#cfd2d8"; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const px = bx + 9 + i * 11, py = by + 12 + j * 11; ctx.beginPath(); ctx.moveTo(px - 4, py + 3); ctx.lineTo(px, py - 6); ctx.lineTo(px + 4, py + 3); ctx.fill(); }
    } else if (kind === "turret") {
      ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.arc(cx + 5, cy + 6, 20, 0, 7); ctx.fill();
      ctx.fillStyle = hitK ? "#c77" : "#5d6470"; ctx.fillRect(bx + 2, by + 2, 36, 36);
      ctx.fillStyle = "#7b8594"; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ba); ctx.fillStyle = "#333"; ctx.fillRect(4, -4, 22, 8); ctx.restore();
      ctx.fillStyle = "#e33"; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
    } else if (kind === "lamp") {
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(cx - 3, cy - 18, 6, 30);
      ctx.fillStyle = `rgba(255,220,120,${0.8 + Math.sin(t * 6 + id) * 0.1})`; ctx.beginPath(); ctx.arc(cx, cy - 20, 8, 0, 7); ctx.fill();
      if (S.g.ph === "night") { ctx.fillStyle = "rgba(255,210,120,0.12)"; ctx.beginPath(); ctx.arc(cx, cy, 90, 0, 7); ctx.fill(); }
    }
    if (hp < 100 && kind !== "spikes") bar(bx + 2, by - 7, 36, 4, hp / 100, "#e8a33a");
  }
  // vehicles
  if (!shot || shot.npcs) for (const [id, kind, vx, vy, va, vhp, drv, pas, vs, vz] of S.vh) {
    const d = smooth("v" + id, vx, vy, dt);
    let a = va; const prevA = disp.get("va" + id); if (prevA) { let da = va - prevA.x; da = Math.atan2(Math.sin(da), Math.cos(da)); a = prevA.x + da * Math.min(1, dt * 14); } disp.set("va" + id, { x: a, y: 0, seen: frameNo });
    drawVehicle(kind, d.x, d.y, a, t, [drv, pas].map((pid) => S.p.find((p) => p.id === pid)), vs, vz || 0);
    if (vhp < 100) bar(d.x - 26, d.y - 42, 52, 5, vhp / 100, vhp > 35 ? "#8fd35a" : "#e84a3a");
    if (vhp < 35) { ctx.fillStyle = `rgba(60,60,60,${0.4 + Math.sin(t * 9 + id) * 0.2})`; ctx.beginPath(); ctx.arc(d.x - Math.cos(a) * 10, d.y - 30 - ((t * 30 + id) % 20), 8, 0, 7); ctx.fill(); }
  }

  // townsfolk
  if (MAP.npcs && S.g.mode !== "royale" && (!shot || shot.npcs)) for (const n of MAP.npcs) {
    const bob = Math.sin(t * 2 + n.x) * 1.5;
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(n.x, n.y + 14, 16, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(n.x, n.y + bob, 17, 0, 7); ctx.fill();
    ctx.strokeStyle = "#0008"; ctx.lineWidth = 2; ctx.stroke();
    drawEyes("dot", n.x, n.y + bob - 3, t, 0);
    drawNpcHat(n.hat, n.x, n.y + bob);
    if (n.id === "chef") { drawVehicle("limo", n.x + 90, n.y + 20, 0.2, t, [], 0); if (Math.sin(t * 1.3 + n.x) > 0.6) { ctx.fillStyle = "#fffe"; ctx.beginPath(); ctx.roundRect(n.x - 60, n.y - 92, 120, 22, 8); ctx.fill(); text(["IT'S RAW!", "DONKEY!", "SHUT IT DOWN!", "WHERE'S THE LAMB SAUCE?"][Math.floor(t / 4.8 + n.x) % 4], n.x, n.y - 81, 12, "#c02020", "center", false); } }
    text(n.name, n.x, n.y - 38, 12, "#e0c0ff");
    text(n.role, n.x, n.y - 25, 10, "#b0a0c8");
    if (myLove(n.id) >= 20) text(hearts(myLove(n.id)), n.x, n.y + 30, 11, "#ff8fc8");
    if (mine && (!mine.nt.includes(n.id) || mine.qr.includes(n.id))) {
      const q = mine.qr.includes(n.id);
      text(q ? "?" : "!", n.x, n.y - 58 + Math.sin(t * 4) * 3, 22, q ? "#7dffb0" : "#ffd34d");
    }
  }

  // fire on the ground
  for (const [cx, cy] of S.fi || []) {
    const x = (cx + 0.5) * 40, y = (cy + 0.5) * 40;
    ctx.fillStyle = "#2a1a1088"; ctx.fillRect(x - 20, y - 20, 40, 40);
    for (let i = 0; i < 4; i++) { const f = Math.abs(Math.sin(t * (8 + i) + cx * 3 + cy)); ctx.fillStyle = i % 2 ? `rgba(255,210,60,${0.6 + f * 0.3})` : `rgba(255,100,20,${0.6 + f * 0.3})`; ctx.beginPath(); ctx.arc(x + (i % 2 ? 7 : -7), y + ((i >> 1) ? 7 : -7) - f * 6, 6 + f * 6, 0, 7); ctx.fill(); }
  }
  // grenades, molotovs and rockets
  for (const [, kind, x, y, z] of S.pr || []) {
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(x, y + 4, 6, 3, 0, 0, 7); ctx.fill();
    const yy = y - z * 0.3;
    if (kind === "rocket") { ctx.fillStyle = "#ffb040"; ctx.beginPath(); ctx.arc(x, yy, 7, 0, 7); ctx.fill(); ctx.fillStyle = "#5a6a3a"; ctx.beginPath(); ctx.arc(x, yy, 4, 0, 7); ctx.fill(); }
    else if (kind === "molo") { ctx.fillStyle = "#6a4a1a"; ctx.fillRect(x - 3, yy - 6, 6, 12); ctx.fillStyle = "#ff9a20"; ctx.beginPath(); ctx.arc(x, yy - 8, 3 + Math.random() * 2, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = "#3a5a2a"; ctx.beginPath(); ctx.arc(x, yy, 5, 0, 7); ctx.fill(); ctx.fillStyle = Math.floor(t * 8) % 2 ? "#f33" : "#600"; ctx.beginPath(); ctx.arc(x, yy - 4, 1.8, 0, 7); ctx.fill(); }
  }
  // zombies
  const ZCOL2 = { e: "#3a6a8a", t: "#3f6b3a", r: "#a0d070", w: "#6fa35a", c: "#7a5a3a", f: "#4a3a5a", x: "#8aa04a", s: "#d8d0c0", d: "#7a8a3a", y: "#5a6a2a" };
  for (const [id, type, zx, zy, hpPct, burn, zh, charging, frozen] of S.z) {
    const d = smooth("z" + id, zx, zy, dt);
    const bk = S.g.bk;
    const r = ZR[type] || 15;
    const bossCol = { leshen: "#3a5a2a", drowned: "#3a6a8a", golem: "#b08a3a" }[bk];
    const col = burn ? "#d0602a" : type === "b" ? bossCol : ZCOL2[type] || "#6fa35a";
    const wob = Math.sin(t * 8 + id) * 2;
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(d.x + (zh || 0) * 0.15, d.y + r * 0.8 + (zh || 0) * 0.25, r, r * 0.4, 0, 0, 7); ctx.fill();
    if (type === "f") { // wings
      const fl = Math.sin(t * 14 + id) * 0.6; ctx.fillStyle = "#2a2030";
      for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + s2 * r * 2.4, d.y - r * (0.6 + fl)); ctx.lineTo(d.x + s2 * r * 1.6, d.y + r * 0.5); ctx.fill(); }
    }
    if (type === "d" || type === "y") { // tail and back spikes
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(d.x - r * 1.1, d.y + r * 0.3, r * 1.1, r * 0.3, 0.25 + Math.sin(t * 6 + id) * 0.15, 0, 7); ctx.fill();
      ctx.fillStyle = type === "y" ? "#3a4a1a" : "#c8702a"; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(d.x - r * 0.6 + k * r * 0.35, d.y - r * 0.8); ctx.lineTo(d.x - r * 0.45 + k * r * 0.35, d.y - r * 1.2); ctx.lineTo(d.x - r * 0.3 + k * r * 0.35, d.y - r * 0.8); ctx.fill(); }
    }
    if (type === "x") { ctx.fillStyle = "#c8e060"; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(d.x + Math.cos(k * 1.3) * r * 0.9, d.y + Math.sin(k * 1.3) * r * 0.9, 4, 0, 7); ctx.fill(); } }
    if (charging) { ctx.strokeStyle = "#ff404088"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, r + 6 + Math.sin(t * 20) * 2, 0, 7); ctx.stroke(); }
    if (type === "e" || (type === "b" && bk === "drowned")) { // chain of office + drips
      ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y + r * 0.2, r * 0.7, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.fillStyle = "#6ab0e0"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(d.x - r * 0.6 + k * r * 0.6, d.y + r + ((t * 40 + k * 13 + id) % 20), 3, 0, 7); ctx.fill(); }
    }
    if (type === "b" && bk === "golem") { // pipes + steam
      ctx.fillStyle = "#6b5220"; ctx.fillRect(d.x - r - 10, d.y - 10, 20, 30); ctx.fillRect(d.x + r - 10, d.y - 10, 20, 30);
      ctx.fillStyle = "#ffffff55"; for (let k = 0; k < 3; k++) { const q = (t * 0.8 + k / 3) % 1; ctx.beginPath(); ctx.arc(d.x + (k - 1) * 20, d.y - r - q * 50, 8 + q * 12, 0, 7); ctx.fill(); }
    }
    if (type === "b" && bk === "leshen") { // Leshen antlers
      ctx.strokeStyle = "#d8cfae"; ctx.lineWidth = 6;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d.x + s * 20, d.y - 30); ctx.lineTo(d.x + s * 50, d.y - 80); ctx.moveTo(d.x + s * 38, d.y - 60); ctx.lineTo(d.x + s * 68, d.y - 66); ctx.moveTo(d.x + s * 44, d.y - 70); ctx.lineTo(d.x + s * 36, d.y - 100); ctx.stroke(); }
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(d.x, d.y + wob * 0.3, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#0006"; ctx.lineWidth = 2; ctx.stroke();
    if (type === "s") { ctx.fillStyle = "#100808"; ctx.beginPath(); ctx.ellipse(d.x, d.y + r * 0.3, r * 0.25, r * 0.4, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = type === "b" ? (bk === "golem" ? "#ff8a20" : "#ff2020") : type === "e" || type === "s" ? "#bfe8ff" : type === "f" ? "#ff3030" : "#ffec40"; ctx.beginPath(); ctx.arc(d.x - r * 0.35, d.y - r * 0.2, r * 0.14, 0, 7); ctx.arc(d.x + r * 0.35, d.y - r * 0.2, r * 0.14, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = r * 0.35; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(d.x - r * 0.7, d.y + r * 0.2); ctx.lineTo(d.x - r * 1.1, d.y + r * 0.6 + wob); ctx.moveTo(d.x + r * 0.7, d.y + r * 0.2); ctx.lineTo(d.x + r * 1.1, d.y + r * 0.6 - wob); ctx.stroke(); ctx.lineCap = "butt";
    if (frozen) { ctx.fillStyle = "#bfefff88"; ctx.beginPath(); ctx.arc(d.x, d.y, r + 3, 0, 7); ctx.fill(); ctx.strokeStyle = "#e8faff"; ctx.lineWidth = 2; ctx.stroke(); }
    if (hpPct < 100 && type !== "b") bar(d.x - r, d.y - r - 9, r * 2, 4, hpPct / 100, "#e44");
  }

  // players
  for (const p of S.p) {
    if (p.d || p.air === 1 || p.vh) continue;
    const d = p.id === me ? { x: pred.x, y: pred.y } : smooth("p" + p.id, p.x, p.y, dt);
    if (p.air === 2) { // parachuting
      ctx.save(); ctx.translate(d.x, d.y); ctx.scale(1.4, 1.4);
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-22, -34); ctx.moveTo(8, -6); ctx.lineTo(22, -34); ctx.stroke();
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(0, -34, 26, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#fff5"; ctx.beginPath(); ctx.arc(0, -34, 26, Math.PI, Math.PI * 1.33); ctx.lineTo(0, -34); ctx.fill();
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); ctx.restore();
      text(p.n, d.x, d.y + 32, 12, "#fff");
      continue;
    }
    if (p.trl) trailFx(p, d, t);
    const a = p.id === me ? aimAngle() : p.a;
    if (p.cl === "gaffer") { ctx.strokeStyle = "#ffd34d33"; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, 260, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    const pz = p.id === me ? pred.z : (p.z || 0);
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(d.x + pz * 0.15, d.y + 14 + pz * 0.25, 16, 6, 0, 0, 7); ctx.fill();
    if (pz > 4) text(`▲${Math.round(pz)}`, d.x + 22, d.y + 22, 10, "#bfe8ff");
    // gun
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(a);
    const gl = { pistol: 20, smg: 26, shotgun: 30, rifle: 34, sniper: 42, staff: 36, ak: 32, sword: 40, rocket: 38 }[p.w] || 24;
    const sw = slashT.get(p.id), sk = sw ? Math.min(1, (t - sw) / 0.25) : 1;
    if (p.w === "sword") { if (sk < 1) ctx.rotate(-1.1 + sk * 2.2); ctx.fillStyle = "#5a3a1e"; ctx.fillRect(4, -2, 8, 4); ctx.fillStyle = "#c8a040"; ctx.fillRect(11, -7, 3, 14); ctx.fillStyle = "#dfe4ea"; ctx.fillRect(14, -2.5, gl, 5); }
    else if (p.w === "rocket") { ctx.fillStyle = "#4a5a32"; ctx.fillRect(2, -5, gl, 10); ctx.fillStyle = "#b03a2a"; ctx.fillRect(gl, -3, 6, 6); }
    else { ctx.fillStyle = p.w === "staff" ? "#8b5a2b" : "#333"; ctx.fillRect(8, -3, gl, 6); }
    if (p.w === "staff") { ctx.fillStyle = "#ff7a2a"; ctx.beginPath(); ctx.arc(8 + gl, 0, 5, 0, 7); ctx.fill(); }
    if (p.wr > 0) { ctx.fillStyle = RARITY_COL[p.wr]; ctx.fillRect(12, -1, gl - 8, 2); }
    ctx.restore();
    ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(d.x, d.y, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = "#0008"; ctx.lineWidth = 2; ctx.stroke();
    drawEyes(p.ey, d.x + Math.cos(a) * 7, d.y + Math.sin(a) * 5 - 3, t, p.id);
    drawHat(p.h, d.x, d.y, 16);
    if (p.ch) { ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(d.x, d.y, 21, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = "#ffd34d"; ctx.stroke(); }
    if (p.hot) { ctx.strokeStyle = "#7dffb0aa"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, 19 + Math.sin(t * 10) * 1.5, 0, 7); ctx.stroke(); }
    let topY = d.y - 34;
    if (p.st > 0) { ctx.fillStyle = "#ffcc00"; for (let i = 0; i < p.st; i++) star(d.x - (p.st - 1) * 7 + i * 14, topY - 2, 6); topY -= 14; }
    text(`${p.ch ? "♛ " : ""}${p.n} · ${p.lv}`, d.x, topY, 12, p.ch ? "#ffd34d" : p.id === me ? "#fff" : "#e8e8e8");
    if (p.ttl) { topY -= 14; text(`« ${p.ttl} »`, d.x, topY, 10, "#ffc030"); }
    if (p.go) { topY -= 16; text(p.go === "poo" ? "💩 busy" : "💦 busy", d.x, topY, 12, "#ffe7a0"); }
    if (p.sh) { topY -= 20; text("🔔 TEAMKILLER 🔔", d.x, topY, 15 + Math.sin(t * 10) * 2, Math.floor(t * 4) % 2 ? "#ff3030" : "#fff"); }
    if (p.bi) { ctx.fillStyle = "#9fd04055"; ctx.beginPath(); ctx.arc(d.x, d.y, 22, 0, 7); ctx.fill(); }
    if (p.fr) { ctx.fillStyle = `rgba(255,120,20,${0.4 + Math.random() * 0.3})`; ctx.beginPath(); ctx.arc(d.x, d.y - 6, 18, 0, 7); ctx.fill(); }
    if (p.inf) { ctx.strokeStyle = "#9fdc5a88"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, 18 + Math.sin(t * 6 + p.id) * 2, 0, 7); ctx.stroke(); }
    if (p.id === me && watcher) { topY -= 22; text("▼ YOU ▼", d.x, topY, 14, "#9fdc5a"); ctx.strokeStyle = "#9fdc5aaa"; ctx.setLineDash([4, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(watcher.x, watcher.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]); }
    bar(d.x - 18, d.y + 21, 36, 4, p.hp / p.mh, "#5f5");
    if (p.ar > 0) bar(d.x - 18, d.y + 26, 36 * p.ar / 60, 2, 1, "#6cf", "#0000");
    if (p.id === me) { // plumbob
      const pb = topY - 18 + Math.sin(t * 2.5) * 3;
      ctx.fillStyle = p.hp / p.mh > 0.5 ? "#39e639" : p.hp / p.mh > 0.25 ? "#e6d839" : "#e63939";
      ctx.beginPath(); ctx.moveTo(d.x, pb - 10); ctx.lineTo(d.x + 6, pb); ctx.lineTo(d.x, pb + 10); ctx.lineTo(d.x - 6, pb); ctx.fill();
    }
    const b = bubbles.get(p.id);
    if (b && t - b.t < 4.5) {
      ctx.font = "bold 13px Trebuchet MS"; const tw = Math.min(260, ctx.measureText(b.text).width + 16);
      ctx.fillStyle = "#fffe"; ctx.beginPath(); ctx.roundRect(d.x - tw / 2, topY - 46, tw, 24, 8); ctx.fill();
      text(b.text.length > 36 ? b.text.slice(0, 35) + "…" : b.text, d.x, topY - 34, 13, "#222", "center", false);
    }
  }

  // effects
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], k = (t - f.t0) / f.dur;
    if (k >= 1) { fx.splice(i, 1); continue; }
    if (f.kind === "tr") { ctx.strokeStyle = f.m ? "#ff4b4b" : TRACER[f.c] || "#fff"; ctx.globalAlpha = 1 - k; ctx.lineWidth = f.c === "sniper" ? 3 : 2; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (f.kind === "boom" && f.dust) { ctx.fillStyle = `rgba(200,180,140,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k * 1.5), 0, 7); ctx.fill(); }
    else if (f.kind === "boom" && f.c2) { ctx.fillStyle = `rgba(${f.c2},${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.8), 0, 7); ctx.fill(); }
    else if (f.kind === "boom") { ctx.fillStyle = `rgba(255,${140 - k * 100},40,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.8), 0, 7); ctx.fill(); }
    else if (f.kind === "shout") {
      ctx.fillStyle = `rgba(${f.c2 || "200,230,255"},${0.5 * (1 - k)})`; ctx.beginPath();
      if (f.full) ctx.arc(f.x, f.y, 60 + k * 200, 0, 7);
      else { ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, (f.r || 280) * Math.min(1, k * 2), f.a - 0.7, f.a + 0.7); }
      ctx.fill();
      if (!f.full) text(f.text || "FUS RO DAH!", f.x, f.y - 60 - k * 30, 26, `rgba(${f.c2 || "220,240,255"},${1 - k})`);
    }
    else if (f.kind === "zap") { ctx.strokeStyle = `rgba(230,210,255,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); f.pts.forEach(([x, y], i) => { if (!i) ctx.moveTo(x, y); else { const [px, py] = f.pts[i - 1]; for (let j = 1; j < 4; j++) ctx.lineTo(px + (x - px) * j / 4 + (Math.random() - 0.5) * 24, py + (y - py) * j / 4 + (Math.random() - 0.5) * 24); ctx.lineTo(x, y); } }); ctx.stroke(); }
    else if (f.kind === "burn") { ctx.fillStyle = `rgba(255,${160 - k * 120},30,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y - k * 30, 5 * (1 - k) + 2, 0, 7); ctx.fill(); }
    else if (f.kind === "trail") {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = f.c;
      if (f.trl === "hearts") text("♥", f.x, f.y - k * 20, 12, f.c, "center", false);
      else if (f.trl === "money") text("$", f.x, f.y - k * 16, 13, f.c);
      else if (f.trl === "flies") { ctx.fillRect(f.x + Math.sin(t * 20 + f.r * 9) * 8, f.y - 10 + Math.cos(t * 17 + f.r * 5) * 8, 2, 2); }
      else if (f.trl === "loo") { ctx.fillRect(f.x - 4, f.y - 1, 8, 3); }
      else if (f.trl === "sparkle") { ctx.save(); ctx.translate(f.x, f.y - k * 10); ctx.rotate(k * 3); ctx.fillRect(-3, -0.8, 6, 1.6); ctx.fillRect(-0.8, -3, 1.6, 6); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(f.x, f.y - (f.trl === "fire" || f.trl === "bubbles" ? k * 18 : 0), (f.trl === "fire" ? 5 : 4) * (f.trl === "bubbles" ? 0.6 + k : 1 - k * 0.5), 0, 7); if (f.trl === "bubbles") { ctx.strokeStyle = f.c; ctx.lineWidth = 1.5; ctx.stroke(); } else ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    else if (f.kind === "text") { ctx.globalAlpha = 1 - k; text(f.text, f.x, f.y - k * 30, f.big ? 20 : 14, f.color); ctx.globalAlpha = 1; }
  }
  // the drop balloon
  if (S.g.drop) {
    const [x0, y0, x1, y1, k] = S.g.drop;
    if (k < 1) {
      ctx.strokeStyle = "#ffffff30"; ctx.setLineDash([12, 10]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      const bd = smooth("balloon", x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, dt);
      ctx.fillStyle = "#0003"; ctx.beginPath(); ctx.ellipse(bd.x + 40, bd.y + 80, 50, 20, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#b05a8a"; ctx.beginPath(); ctx.ellipse(bd.x, bd.y - 40, 55, 65, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffd34d"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(bd.x + i * 20, bd.y - 40, 6, 62, 0, 0, 7); ctx.fill(); }
      ctx.strokeStyle = "#654"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bd.x - 30, bd.y + 5); ctx.lineTo(bd.x - 22, bd.y + 30); ctx.moveTo(bd.x + 30, bd.y + 5); ctx.lineTo(bd.x + 22, bd.y + 30); ctx.stroke();
      ctx.fillStyle = "#6b4a2a"; ctx.fillRect(bd.x - 26, bd.y + 28, 52, 26);
      text("VEX AIR", bd.x, bd.y - 40, 13, "#fff");
      const riders = S.p.filter((p) => p.air === 1);
      riders.forEach((p, i) => { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(bd.x - 16 + (i % 4) * 11, bd.y + 28, 6, 0, 7); ctx.fill(); });
    }
  }
  // the slop fog
  if (S.g.zone && S.g.ph !== "lobby") {
    const [cx, cy, r, tcx, tcy, tr] = S.g.zone;
    ctx.save();
    ctx.beginPath(); ctx.rect(-2000, -2000, MAP.W + 4000, MAP.H + 4000); ctx.arc(cx, cy, Math.max(1, r), 0, 7, true);
    ctx.fillStyle = `rgba(120, 40, 160, ${0.28 + Math.sin(t * 1.5) * 0.04})`; ctx.fill("evenodd");
    ctx.restore();
    ctx.strokeStyle = "#c080ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, 7); ctx.stroke();
    if (tr < r - 2) { ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 2; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.arc(tcx, tcy, Math.max(1, tr), 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }
  // build ghost
  if (building && mine && !mine.d) {
    const g = ghostCell(), ok = Math.hypot(g.x + 20 - pred.x, g.y + 20 - pred.y) < 280 && PIECES[buildKind] && mine.g >= PIECES[buildKind].cost * 0.7;
    ctx.globalAlpha = 0.55; ctx.fillStyle = ok ? "#7dffb0" : "#ff5050"; ctx.fillRect(g.x, g.y, 40, 40); ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#7dffb0" : "#ff5050"; ctx.lineWidth = 2; ctx.strokeRect(g.x, g.y, 40, 40);
    ctx.strokeStyle = "#ffffff30"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(pred.x, pred.y, 280, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    text(PIECES[buildKind] ? PIECES[buildKind].name : "", g.x + 20, g.y - 10, 12, "#fff");
  }
  if (shot && shot.draw) shot.draw(shot.k, t);
  ctx.restore();

  if (shot) { drawIntroOverlay(shot, t, worldXf); return; }

  // darkness
  drawDarkness(t);

  // hurt vignette
  if (t - hurtFlash < 0.3) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); g.addColorStop(0, "#f000"); g.addColorStop(1, `rgba(200,0,0,${0.5 * (1 - (t - hurtFlash) / 0.3)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }

  if (t - fogT < 1.2) { ctx.fillStyle = `rgba(120,40,160,${0.25 * (1 - (t - fogT) / 1.2)})`; ctx.fillRect(0, 0, VW, VH); }
  drawHud(mine, t);
  drawMinimap(mine, t);
  drawCrosshair(mine, t);
  for (const k of disp.keys()) if (disp.get(k).seen < frameNo - 30) disp.delete(k);
}

function drawDarkness(t) {
  const ph = S.g.ph;
  let alpha = 0;
  if (ph === "night") alpha = S.g.fog ? 0.96 : 0.86;
  else if (ph === "day" && S.g.left >= 0 && S.g.left < 10) alpha = (10 - S.g.left) / 10 * 0.5; // dusk
  const FL = S.g.fog && ph === "night" ? 230 : 480;
  if (alpha <= 0) return;
  if (dark.width !== cv.width || dark.height !== cv.height) { dark.width = cv.width; dark.height = cv.height; }
  dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dctx.globalCompositeOperation = "source-over";
  dctx.clearRect(0, 0, VW, VH);
  dctx.fillStyle = `rgba(5,8,25,${alpha})`; dctx.fillRect(0, 0, VW, VH);
  dctx.globalCompositeOperation = "destination-out";
  const Z = view.z;
  const hole = (x, y, r, inner = 0.2) => { r *= Z; const g = dctx.createRadialGradient(x, y, r * inner, x, y, r); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); dctx.fillStyle = g; dctx.beginPath(); dctx.arc(x, y, r, 0, 7); dctx.fill(); };
  const hw = MAP.hearth;
  { const c = toScr(hw.x + hw.w / 2, hw.y + hw.h / 2); hole(c.x, c.y, 260 + Math.sin(t * 7) * 8); }
  for (const p of S.p) {
    if (p.d) continue;
    const d = p.id === me ? { x: pred.x, y: pred.y } : disp.get("p" + p.id) || p;
    const a = p.id === me ? aimAngle() : p.a;
    const { x, y } = toScr(d.x, d.y);
    hole(x, y, 110, 0.3);
    // flashlight cone
    const g = dctx.createRadialGradient(x, y, 20 * Z, x, y, FL * Z);
    g.addColorStop(0, "rgba(0,0,0,0.95)"); g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(x, y); dctx.arc(x, y, FL * Z, a - 0.42, a + 0.42); dctx.closePath(); dctx.fill();
  }
  for (const f of fx) if (f.kind === "boom" || f.kind === "burn") { const c = toScr(f.x, f.y); hole(c.x, c.y, f.kind === "boom" ? 160 : 40); }
  for (const [cx, cy] of S.fi || []) { const c = toScr((cx + 0.5) * 40, (cy + 0.5) * 40); hole(c.x, c.y, 70 + Math.sin(t * 9 + cx) * 6, 0.3); }
  for (const b of S.b) if (b[1] === "lamp") { const c = toScr(b[2] + 20, b[3] + 20); hole(c.x, c.y, 200 + Math.sin(t * 5 + b[0]) * 6, 0.3); }
  for (const [id, , vx, vy, va, , drv] of S.vh) {
    if (!drv) continue;
    const d = disp.get("v" + id) || { x: vx, y: vy }, { x, y } = toScr(d.x, d.y);
    const g = dctx.createRadialGradient(x, y, 20 * Z, x, y, 520 * Z); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(x, y); dctx.arc(x, y, 520 * Z, va - 0.35, va + 0.35); dctx.closePath(); dctx.fill();
  }
  ctx.drawImage(dark, 0, 0, VW, VH);
}

function drawHud(mine, t) {
  const g = S.g;
  // top center: phase
  let label = "";
  if (g.ph === "lobby") label = `${(MAP.valley || "").toUpperCase()} — ${S.p.length} farmer${S.p.length === 1 ? "" : "s"} waiting`;
  else if (g.ph === "day") label = `DAY ${g.n + 1}  ·  night falls in ${g.left}s`;
  else if (g.ph === "night") label = g.left < 0 ? `NIGHT ${g.n}  ·  ${g.mode === "endless" ? "BOSS NIGHT" : "FINAL CONTRACT"}` : `NIGHT ${g.n}${g.mode === "story" && g.n < 5 ? "/5" : ""}${g.fog ? " · FOG" : ""}${g.dino ? " · THE RIFT" : ""}  ·  dawn in ${g.left}s`;
  else if (g.ph === "royale") label = `ROYALE · ${g.alive} alive${g.zone && g.zone[6] >= 0 ? ` · fog moves in ${g.zone[6]}s` : g.zone && g.zone[5] < g.zone[2] - 2 ? " · FOG CLOSING" : ""}`;
  else label = g.res === "win" ? "VICTORY" : g.res === "royale" ? "ROYALE OVER" : "DEFEAT";
  if (g.ph === "lobby") label += g.mode === "royale" ? " · Royale" : g.mode === "endless" ? " · Endless" : " · Story";
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 200, 10, 400, 44, 10); ctx.fill();
  text(label, VW / 2, 26, 18, g.ph === "night" ? "#9fc0ff" : "#ffe9a0");
  if (g.mode !== "royale") bar(VW / 2 - 180, 42, 360, 6, g.hh / g.hm, "#e8703a");
  if (g.ph === "lobby" && joined) {
    const rd = S.p.filter((p) => p.rd).length;
    text(g.cd >= 0 ? `STARTING IN ${Math.ceil(g.cd)}` : `${rd}/${S.p.length} ready · press F when you are`, VW / 2, 80, g.cd >= 0 ? 28 : 16, g.cd >= 0 ? "#7dffb0" : "#ccc");
  }
  if (t - legendT < 7) {
    const L = LEGENDS[legendKind], k = t - legendT, a = Math.min(1, k * 2, 7 - k);
    ctx.globalAlpha = a;
    text("THE VALLEY HAS DECIDED", VW / 2, VH * 0.36, 20, "#ddd");
    const lt = L ? `YOU ARE ${L.title.toUpperCase()} OF ${(MAP.valley || "").toUpperCase()}` : "YOU ARE NOBODY IN PARTICULAR";
    text(lt, VW / 2, VH * 0.36 + 40, Math.min(38, (VW - 40) / (lt.length * 0.7)), L ? L.color : "#aaa");
    if (L) text(L.blurb, VW / 2, VH * 0.36 + 78, 16, "#eee");
    ctx.globalAlpha = 1;
  }
  if (building) text("BUILD MODE", VW / 2, 70, 16, "#9fe0ff");
  let dy = 0;
  if (g.dis) {
    const DN = { meteor: "☄ METEOR SHOWER", flood: "🌊 FLOOD", tornado: "🌪 TORNADO", quake: "⚠ EARTHQUAKE" };
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 130, 58, 260, 22, 8); ctx.fill();
    text(`${DN[g.dis.k] || g.dis.k.toUpperCase()}${g.dis.left > 0 ? `  ·  ${g.dis.left}s` : ""}`, VW / 2, 69, 13, "#ffb060");
    dy = 26;
  }
  // boss bar
  if (g.boss) {
    const bz = S.z.find((z) => z[0] === g.boss);
    if (bz) { text(BOSS_NAME[g.bk] || "BOSS", VW / 2, 74 + dy, 16, "#ff6060"); bar(VW / 2 - 250, 86 + dy, 500, 12, bz[4] / 100, "#c02020"); }
  }
  const elite = S.z.find((z) => z[1] === "e");
  if (elite && !g.boss) { text("THE DROWNED MAYOR", VW / 2, 74 + dy, 16, "#6ab0e0"); bar(VW / 2 - 200, 86 + dy, 400, 10, elite[4] / 100, "#3a7ab0"); }

  // kill feed (top right)
  feed.forEach((f, i) => {
    const age = t - f.t; if (age > 8) return;
    ctx.globalAlpha = Math.min(1, 8 - age);
    ctx.font = "bold 13px Trebuchet MS"; const w = ctx.measureText(f.text).width + 16;
    ctx.fillStyle = "#000a"; ctx.fillRect(VW - w - 12, 12 + i * 26, w, 22);
    text(f.text, VW - 20, 23 + i * 26, 13, f.color || "#fff", "right", false);
    ctx.globalAlpha = 1;
  });
  // chat log (bottom left)
  chatLog.forEach((c, i) => {
    const age = t - c.t; if (age > 15 && !chatting) return;
    ctx.globalAlpha = chatting ? 1 : Math.min(1, 15 - age);
    ctx.font = "bold 14px Trebuchet MS";
    const y = VH - 236 - (chatLog.length - 1 - i) * 20;
    text(c.from + ":", 14, y, 14, c.color, "left");
    const w = ctx.measureText(c.from + ": ").width;
    text(c.text, 14 + w, y, 14, "#fff", "left");
    ctx.globalAlpha = 1;
  });
  // toasts
  toasts.forEach((to, i) => {
    const age = t - to.t; if (age > 4) return;
    ctx.globalAlpha = Math.min(1, 4 - age);
    text(to.text, VW / 2, VH - 190 - (toasts.length - 1 - i) * 26, 17, to.color || "#fff");
    ctx.globalAlpha = 1;
  });

  if (!mine) return;
  // aim-down-sights vignette
  if (adsZoom > 1.02) { const k = (adsZoom - 1) / 0.35, o = myScr(); const g = ctx.createRadialGradient(o.x, o.y, VH * 0.25, o.x, o.y, VH * 0.75); g.addColorStop(0, "#0000"); g.addColorStop(1, `rgba(0,0,0,${0.55 * k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
  // second person
  if (watcher) {
    ctx.fillStyle = "rgba(60,90,20,0.12)"; ctx.fillRect(0, 0, VW, VH);
    text(`SECOND PERSON · you are seen through the eyes of ${watcher.who}`, VW / 2, VH - 232, 15, "#9fdc5a");
  }
  if (mine.inf) {
    const lbl = { second: "Second person", keys: "P forward · INSERT back · ALT left · no right", runs: "The runs" }[mine.inf] || "";
    ctx.fillStyle = "#1d2a0dcc"; ctx.beginPath(); ctx.roundRect(VW / 2 - 230, 104, 460, 40, 8); ctx.fill();
    text(`🦠 INFECTED (${mine.il}s): ${lbl}`, VW / 2, 124, 15, t - symT < 1 && Math.floor(t * 8) % 2 ? "#fff" : "#9fdc5a");
    text("Dawn or an Antidote from the shop will cure it.", VW / 2, 139, 10, "#9fdc5acc");
  }
  if (mine.md) { ctx.fillStyle = `rgba(255,60,30,${0.12 + Math.sin(t * 9) * 0.06})`; ctx.fillRect(0, 0, VW, VH); text("MELTDOWN", VW / 2 + Math.sin(t * 31) * 4, VH * 0.3, 40, "#ff6040"); text("You can't hold a gun steady. Breathe. Or go and kick a ball about.", VW / 2, VH * 0.3 + 34, 15, "#ffd0c0"); }
  if (mine.sw && pred.z < -44) { ctx.fillStyle = "rgba(20,70,120,0.28)"; ctx.fillRect(0, 0, VW, VH); }
  if (mine.br < 15 || (mine.sw && pred.z < -44)) {
    const b = mine.br / 15; ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 110, VH - 252, 220, 24, 8); ctx.fill();
    text("Breath", VW / 2 - 100, VH - 240, 12, b < 0.3 && Math.floor(t * 4) % 2 ? "#f55" : "#bfe8ff", "left");
    bar(VW / 2 - 50, VH - 245, 150, 8, b, b < 0.3 ? "#e33" : "#7fd0ff");
  }
  if (mine.fz) { ctx.fillStyle = "rgba(150,220,255,0.22)"; ctx.fillRect(0, 0, VW, VH); text("FROZEN", VW / 2, VH * 0.36, 30, "#bfefff"); }
  if (g.dis && g.dis.k === "flood" && g.dis.w > 1 && pred.z < g.dis.w) { ctx.fillStyle = `rgba(40,110,170,${Math.min(0.3, g.dis.w / 100)})`; ctx.fillRect(0, VH * 0.55, VW, VH * 0.45); text("wading", VW / 2, VH * 0.55 + 16, 12, "#bfe0ff"); }
  // bottom left: bladder and bowels
  if (["day", "night", "royale"].includes(S.g.ph)) {
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(12, VH - 176, 330, 26, 8); ctx.fill();
    const nb = (x, lbl, v, col) => { text(lbl, x, VH - 162, 12, v >= 80 && Math.floor(t * 3) % 2 ? "#f55" : "#ddd", "left"); bar(x + 58, VH - 167, 90, 8, v / 100, v >= 80 ? "#e33" : col); };
    nb(22, "💧 Pee", mine.bl, "#e8d84a"); nb(178, "💩 Poo", mine.bw, "#a0703a");
    if (Math.max(mine.bl, mine.bw) >= 60) text("[X] go", 336, VH - 162, 11, "#ffc030", "right");
    // stress (football is the cure) and the Thu'um element
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(12, VH - 206, 330, 26, 8); ctx.fill();
    const ss = mine.ss || 0;
    text("😰 Stress", 22, VH - 192, 12, ss >= 60 && Math.floor(t * 3) % 2 ? "#f55" : "#ddd", "left");
    bar(92, VH - 197, 90, 8, ss / 100, ss >= 80 ? "#e33" : ss >= 60 ? "#ff9a40" : "#8fb0d0");
    const el = ELEMS[mine.el] || ELEMS.force;
    text(`${el.icon} ${el.name}${(mine.els || "").includes(",") ? "  [Z] swap" : ""}`, 332, VH - 192, 12, el.color, "right");
    if (ss >= 60) text("Stressed out. Kick a ball about on the pitch to calm down.", 22, VH - 218, 12, "#ffb070", "left");
  }
  // bottom left: vitals
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(12, VH - 146, 330, 134, 10); ctx.fill();
  bar(24, VH - 138, 300, 5, mine.xp / mine.xn, "#9fe0ff");
  text(`Lv ${mine.lv}${mine.pts ? `  ·  ${mine.pts} skill point${mine.pts > 1 ? "s" : ""}: press K` : ""}`, 324, VH - 125, 11, mine.pts ? "#9fe0ff" : "#8aa", "right");
  text(mine.n, 24, VH - 112, 15, mine.c, "left");
  text(`Gen ${mine.gen} · ${mine.tr}: ${TRAIT_DESC[mine.tr] || ""}`, 24, VH - 94, 12, "#b8a8e0", "left");
  bar(24, VH - 80, 300, 14, mine.hp / mine.mh, mine.hp / mine.mh > 0.3 ? "#4c4" : "#e33");
  text(`${mine.hp} / ${mine.mh}`, 174, VH - 73, 12, "#fff");
  if (mine.ar > 0) bar(24, VH - 64, 300 * mine.ar / 60, 5, 1, "#6cf", "#0000");
  text(`${mine.g}g`, 24, VH - 45, 20, "#ffd34d", "left");
  text(`🌱 ${mine.sd}`, 110, VH - 45, 18, "#8f8", "left");
  if (mine.spn) text(`🎰 ${mine.spn} spin${mine.spn > 1 ? "s" : ""} [G]`, 324, VH - 22, 13, "#ffd34d", "right");
  text(`[3] 💣 ${mine.gn ?? 0}   [4] 🔥 ${mine.mo ?? 0}${mine.hoe ? `   ${["", "Hoe", "Steel Hoe", "Golden Hoe"][mine.hoe]}` : ""}`, VW - 296, VH - 116, 13, "#ffb070", "left");
  if (mine.st > 0) { ctx.fillStyle = "#ffcc00"; for (let i = 0; i < 5; i++) { ctx.globalAlpha = i < mine.st ? 1 : 0.2; star(190 + i * 22, VH - 45, 9); } ctx.globalAlpha = 1; }
  const sc = mine.sc;
  const shEl = ELEMS[mine.el] || ELEMS.force;
  text(sc > 0 ? `Q  shout ${Math.ceil(sc)}s` : `Q  ${shEl.word} ready`, 24, VH - 22, 13, sc > 0 ? "#888" : shEl.color, "left");
  // bottom right: weapon
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW - 312, VH - 128, 300, 116, 10); ctx.fill();
  const wn = `${mine.we ? ENH[mine.we] + " " : ""}${mine.wn}`;
  text(wn, VW - 24, VH - 80, 20, RARITY_COL[mine.wr], "right");
  text(`${RARITY[mine.wr]}${mine.we ? `  +${mine.we}` : ""}`, VW - 24, VH - 58, 13, RARITY_COL[mine.wr], "right");
  const busy = mine.rs || mine.jam;
  text(mine.rs === "shell" ? `${mine.am} ⟳` : mine.rs ? (mine.rw ? "PRESS R" : STAGE_NAME[mine.rs] || "RELOADING") : mine.jam ? "JAMMED" : mine.w === "sword" ? "∞" : `${mine.am}`, VW - 24, VH - 32, busy && mine.rs !== "shell" ? 18 : 28, mine.jam && !mine.rs ? "#ff8060" : mine.am === 0 && !busy ? "#f55" : mine.hot ? "#7dffb0" : "#fff", "right");
  if (mine.hot && !busy) text("EMPOWERED", VW - 70, VH - 32, 12, "#7dffb0", "right");
  if (PARTS[mine.w]) { const dd = mine.dirt || 0; text(mine.jam ? "⚠ JAMMED: R clears it, L strips & cleans" : `Condition: ${dd < 20 ? "clean" : dd < 45 ? "grubby" : dd < 70 ? "dirty, may jam" : "filthy, will jam"}${dd >= 45 ? "  ·  L to clean" : ""}`, VW - 296, VH - 98, 12, mine.jam ? "#ff8060" : dd < 20 ? "#8f8" : dd < 45 ? "#cc9" : dd < 70 ? "#ffb070" : "#ff8060", "left"); }
  text(mine.sec ? "[1] Pistol  [2] Primary" : "", VW - 296, VH - 32, 12, "#999", "left");
  const myVeh = mine.vh && S.vh.find((v) => v[0] === mine.vh);
  if (myVeh) {
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW - 312, VH - 190, 300, 52, 10); ctx.fill();
    const driving = myVeh[6] === me;
    text(`${VEH_NAME[myVeh[1]]} · ${driving ? "driving" : "passenger"}`, VW - 296, VH - 176, 14, "#9fe0ff", "left");
    text(`${AIR[myVeh[1]] ? `ALT ${Math.round((myVeh[9] || 0) / 10)}m · ` : ""}${Math.round(Math.abs(myVeh[8]) * 0.36)} km/h`, VW - 24, VH - 176, 14, "#fff", "right");
    bar(VW - 296, VH - 158, 268, 8, myVeh[5] / 100, myVeh[5] > 35 ? "#8fd35a" : "#e84a3a");
  }

  // interaction hint
  if (!mine.d) {
    let hint = null;
    for (const [, x, y, busy] of S.ca || []) if ((x - pred.x) ** 2 + (y - pred.y) ** 2 < 62 * 62) { hint = [busy ? "Someone's hacking this one" : "E  hack the Slop-Tech cache", "#7dffb0"]; break; }
    if (!hint) for (const [, x, y, rar, grave] of S.cr) if ((x - pred.x) ** 2 + (y - pred.y) ** 2 < 60 * 60) { hint = [`E  ${grave ? "loot grave" : "open crate"}`, RARITY_COL[rar]]; break; }
    if (!hint) MAP.plots.forEach((pl, i) => { if (!hint && (pl.x - pred.x) ** 2 + (pl.y - pred.y) ** 2 < 48 * 48) { const s = S.pl[i]; hint = s === 0 ? [mine.sd ? "E  plant seed" : "No seeds — buy some [B]", "#8f8"] : s === 3 ? ["E  harvest", "#ffd34d"] : ["growing...", "#aaa"]; } });
    if (!hint && !mine.vh) for (const [, kind, vx, vy, , , drv, pas, , vz] of S.vh) if ((vx - pred.x) ** 2 + (vy - pred.y) ** 2 < (AIR[kind] ? 76 : 62) ** 2 && Math.abs((vz || 0) - pred.z) < 70 && (!drv || !pas)) { hint = [`E  ${drv ? "ride in" : AIR[kind] ? "fly" : "drive"} the ${VEH_NAME[kind]}`, "#9fe0ff"]; break; }
    if (mine.vh) hint = piloting() ? [pad() ? "Flying with your stick · button 3 gets out" : "W/S pitch · A/D strafe · mouse turns · SPACE up · C down · E out", "#9fe0ff"] : [S.vh.find((v) => v[0] === mine.vh)?.[6] === me ? "WASD drive · E get out" : "E get out", "#9fe0ff"];
    if (!hint && mine.sw && pred.z < -60 && MAP.walls.some((w) => w.kind === "glyph" && (w.x + 15 - pred.x) ** 2 + (w.y + 15 - pred.y) ** 2 < 60 * 60)) hint = ["E  touch the glyph", "#7dd8ff"];
    if (!hint && MAP.npcs && g.mode !== "royale" && !dlgOpen) for (const n of MAP.npcs) if ((n.x - pred.x) ** 2 + (n.y - pred.y) ** 2 < 70 * 70) { hint = [`E  talk to ${n.name}`, "#e0c0ff"]; break; }
    if (!hint && mine.hoe && g.mode !== "royale" && !mine.vh && pred.gr && pred.z < 4 && (g.ph === "day" || g.ph === "night") && !dlgOpen) hint = ["E  till a new plot here", "#b8e070"];
    if (mine.air === 1) hint = ["SPACE to jump", "#ffd34d"];
    else if (mine.air === 2) hint = ["WASD to steer your landing", "#ffd34d"];
    if (hint) text(hint[0], VW / 2, VH / 2 + 50, 16, hint[1]);
    if (t - clueT < 5) text(`NEW EVIDENCE (${g.clues.length}/5): press J`, VW / 2, 120, 18, "#e0c0ff");
  }

  // banner
  if (banner && t - banner.t < 4) {
    const k = t - banner.t, a = Math.min(1, k * 3, (4 - k));
    ctx.globalAlpha = a;
    ctx.fillStyle = "#000a"; ctx.fillRect(0, VH * 0.25 - 50, VW, 100);
    text(banner.text, VW / 2, VH * 0.25 - 12, 42, "#ffd34d");
    text(banner.sub, VW / 2, VH * 0.25 + 26, 17, "#eee");
    ctx.globalAlpha = 1;
  }
  // TEAMKILL. Nobody gets to miss it.
  if (shameWho && t - shameT < 6) {
    const k = t - shameT, a = Math.min(1, k * 4, 6 - k), me2 = shameWho.id === me;
    ctx.globalAlpha = a * (0.25 + 0.15 * Math.sin(t * 12)); ctx.fillStyle = "#c00000"; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    const sz = Math.min(120, VW / 7) * (1 + Math.max(0, 0.3 - k) * 2);
    text("TEAMKILL", VW / 2, VH * 0.42, sz, Math.floor(t * 6) % 2 ? "#ff2020" : "#ffffff");
    text(me2 ? `YOU KILLED ${shameWho.vic.toUpperCase()}. YOUR OWN TEAMMATE.` : `${shameWho.who.toUpperCase()} KILLED ${shameWho.vic.toUpperCase()}`, VW / 2, VH * 0.42 + sz * 0.6, 22, "#fff");
    text(me2 ? "Everyone saw that. Everyone." : `That's teamkill number ${shameWho.n} for them. Point and laugh.`, VW / 2, VH * 0.42 + sz * 0.6 + 30, 16, "#ffd0d0");
    text("🔔 SHAME 🔔 SHAME 🔔 SHAME 🔔", VW / 2, VH * 0.42 - sz * 0.62, 26, "#ffd34d");
    ctx.globalAlpha = 1;
  }
  if (mine.bi) { ctx.fillStyle = `rgba(140,190,40,${0.14 + Math.sin(t * 3) * 0.04})`; ctx.fillRect(0, 0, VW, VH); text("BILED: the horde can smell you", VW / 2, 150, 16, "#b8e04a"); }
  if (mine.fr) { const g2 = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.25, VW / 2, VH / 2, VH * 0.8); g2.addColorStop(0, "#f000"); g2.addColorStop(1, `rgba(255,110,20,${0.45 + Math.random() * 0.15})`); ctx.fillStyle = g2; ctx.fillRect(0, 0, VW, VH); }
  if (t - deafT < 2.5) text("*EEEEEEEEEE*", VW / 2 + (Math.random() - 0.5) * 8, 180, 22, "#ff8080");
  // wasted
  if (mine.d && g.mode === "royale" && wastedPlace) {
    ctx.fillStyle = "rgba(40,40,40,0.45)"; ctx.fillRect(0, VH / 2 - 80, VW, 150);
    text(wastedPlace === 99 ? "SPECTATING" : `ELIMINATED  #${wastedPlace}`, VW / 2, VH / 2 - 20, 60, "#d02020");
    text("Spectating the survivors...", VW / 2, VH / 2 + 35, 18, "#ddd");
  } else if (mine.d && t - wasted < 6) {
    const k = Math.min(1, (t - wasted) * 2);
    ctx.fillStyle = `rgba(40,40,40,${0.55 * k})`; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = k;
    text("WASTED", VW / 2, VH / 2 - 20, 80, "#d02020");
    text("This is how you died.", VW / 2, VH / 2 + 40, 20, "#ddd");
    text("Your heir will arrive shortly and inherits your skills (and half your gold).", VW / 2, VH / 2 + 70, 15, "#aaa");
    ctx.globalAlpha = 1;
  }
  // case opening
  if (caseAnim) {
    const k = t - caseAnim.t0;
    if (k > 4.2) caseAnim = null;
    else {
      const cw = 130, total = 34 * cw;
      const prog = 1 - Math.pow(1 - Math.min(1, k / 3), 3);
      const off = prog * total;
      const cx = VW / 2, cy = VH / 2 - 120;
      ctx.fillStyle = "#000c"; ctx.fillRect(cx - 360, cy - 60, 720, 130);
      ctx.save(); ctx.beginPath(); ctx.rect(cx - 355, cy - 55, 710, 110); ctx.clip();
      caseAnim.reel.forEach((it, i) => {
        const x = cx + i * cw - off - cw / 2;
        if (x < cx - 500 || x > cx + 400) return;
        ctx.fillStyle = "#222"; ctx.fillRect(x + 4, cy - 45, cw - 8, 90);
        ctx.fillStyle = RARITY_COL[it.rarity]; ctx.fillRect(x + 4, cy + 35, cw - 8, 10);
        text(it.name || WNAME[it.type], x + cw / 2, cy - 5, 15, RARITY_COL[it.rarity]);
      });
      ctx.restore();
      ctx.fillStyle = "#ffd34d"; ctx.fillRect(cx - 1, cy - 60, 3, 130);
      if (k > 3.1) text(`${RARITY[caseAnim.rarity].toUpperCase()} ${caseAnim.name || WNAME[caseAnim.type]}!`, cx, cy + 95, 30, RARITY_COL[caseAnim.rarity]);
      if (k > 3.0 && !caseAnim.dinged) { caseAnim.dinged = true; sfx(caseAnim.rarity >= 3 ? "lvl" : "hit"); }
    }
  }
  // enhancement
  if (enhAnim) {
    const k = t - enhAnim.t0;
    if (k > 2.2) enhAnim = null;
    else {
      ctx.globalAlpha = Math.min(1, 2.2 - k);
      if (enhAnim.ok) text(`SUCCESS  ${ENH[enhAnim.lvl]} (+${enhAnim.lvl})`, VW / 2, VH / 2 - 140, 38, "#ffd34d");
      else text(enhAnim.down ? `FAILED — downgraded to +${enhAnim.lvl}` : "FAILED", VW / 2, VH / 2 - 140, 38, "#ff4040");
      ctx.globalAlpha = 1;
    }
  }
  if (showScores) drawScores();
}

function drawScores() {
  const rows = [...S.p].sort((a, b) => b.k - a.k);
  const w = 760, h = 70 + rows.length * 30, x = VW / 2 - w / 2, y = VH / 2 - h / 2;
  ctx.fillStyle = "#000d"; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  const cols = [["Name", 20], ["Class", 290], ["Lv", 370], ["Kills", 410], ["Deaths", 470], ["Crops", 540], ["HS", 600], ["Acc", 650], ["TK", 710]];
  for (const [n, cx] of cols) text(n, x + cx, y + 24, 13, "#9fb58a", "left");
  rows.forEach((p, i) => {
    const yy = y + 58 + i * 30;
    text(p.n, x + 20, yy, 14, p.c, "left");
    text(p.cl, x + 290, yy, 14, "#ddd", "left");
    text(String(p.lv), x + 370, yy, 14, "#9fe0ff", "left");
    text(String(p.k), x + 410, yy, 14, "#fff", "left");
    text(String(p.de), x + 470, yy, 14, "#fff", "left");
    text(String(p.cr), x + 540, yy, 14, "#8f8", "left");
    text(String(p.hs), x + 600, yy, 14, "#ff9d2e", "left");
    text(p.acc + "%", x + 650, yy, 14, "#fff", "left");
    text(String(p.tk), x + 710, yy, 14, p.tk ? "#f66" : "#fff", "left");
  });
}

function showOver() {
  const win = S.g.res === "win";
  const royale = S.g.res === "royale";
  const myRow = (S.stats || []).find((r) => r.id === me);
  $("overTitle").textContent = royale ? (myRow && myRow.winner ? "WINNER WINNER CHICKEN DINNER" : `#${myRow ? myRow.place : "?"} · BETTER LUCK NEXT DROP`) : win ? "WINNER WINNER CHICKEN DINNER" : "THE HEARTH HAS FALLEN";
  $("overTitle").style.fontSize = "34px";
  $("overSub").innerHTML = (S.ending || []).map((l) => `<p>${String(l).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</p>`).join("");
  const rows = S.stats || [];
  const rc = (r) => r >= 8 ? "#4fd04f" : r >= 7 ? "#a8e04f" : r >= 6 ? "#e0d04f" : r >= 5 ? "#e09a4f" : "#e05050";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cols = royale
    ? [["#", (r) => r.place], ["Player", null], ["Pos", (r) => r.cls], ["Elims", (r) => r.pk], ["Zombies", (r) => r.kills], ["Dmg", (r) => r.dmg], ["HS", (r) => r.hs], ["Acc", (r) => r.acc + "%"]]
    : [["Player", null], ["Pos", (r) => r.cls], ["Kills", (r) => r.kills], ["Dmg", (r) => r.dmg], ["Crops", (r) => r.crops], ["HS", (r) => r.hs], ["Acc", (r) => r.acc + "%"], ["Deaths", (r) => r.deaths], ["TK", (r) => r.tk]];
  $("overTable").innerHTML = `<tr>${cols.map(([h]) => `<th>${h}</th>`).join("")}<th>Rating</th></tr>` +
    rows.map((r, i) => `<tr>${cols.map(([, f]) => f ? `<td>${esc(f(r))}</td>` : `<td style="color:${r.color}">${i === 0 ? '<span class="motm">★</span> ' : ""}${esc(r.name)}</td>`).join("")}<td><span class="rating" style="background:${rc(r.rating)}">${r.rating.toFixed(1)}</span></td></tr>`).join("") +
    (rows[0] ? `<tr><td colspan="${cols.length + 1}" class="motm">★ Player of the Match: ${esc(rows[0].name)}</td></tr>` : "");
  $("overLineage").parentElement.querySelector("h3:last-of-type").textContent = royale ? "" : "Dynasties";
  $("overLineage").innerHTML = rows.map((r) => `<div class="lineage">${r.lineage.map(esc).join(" → ")}</div>`).join("");
  $("over").classList.remove("hidden");
  toggleShop(false); toggleSkills(false); toggleJournal(false);
  if (dlgOpen) showDlg({ close: 1 });
}

// dynamic crosshair: the gap shows your real spread, so tap-firing and standing still visibly pay off
function drawCrosshair(mine, t) {
  if (!mine || mine.d || chatting || shopOpen || skillsOpen || cleanOpen || hackOpen || S.g.ph === "over") { cv.style.cursor = "default"; return; }
  cv.style.cursor = "none";
  if (use3d) { mouseX = VW / 2; mouseY = VH / 2; }
  const o = myScr(), dist = Math.hypot(mouseX - o.x, mouseY - o.y);
  const gap = use3d ? 4 + Math.tan(mine.spr) * (VH / 2) / Math.tan(((camNow && camNow.fov) || 78) * Math.PI / 360) : 4 + Math.tan(mine.spr) * Math.max(60, dist);
  const col = t - hsT < 0.25 ? "#ff9d2e" : mine.hot ? "#7dffb0" : "#ffffff";
  ctx.strokeStyle = "#000a"; ctx.lineWidth = 4;
  const lines = () => { ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(mouseX + dx * gap, mouseY + dy * gap); ctx.lineTo(mouseX + dx * (gap + 8), mouseY + dy * (gap + 8)); } ctx.stroke(); };
  lines(); ctx.strokeStyle = col; ctx.lineWidth = 2; lines();
  ctx.fillStyle = col; ctx.fillRect(mouseX - 1, mouseY - 1, 2, 2);
  if (t - hsT < 0.25) { ctx.strokeStyle = "#ff9d2e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mouseX - 10, mouseY - 10); ctx.lineTo(mouseX - 4, mouseY - 4); ctx.moveTo(mouseX + 10, mouseY - 10); ctx.lineTo(mouseX + 4, mouseY - 4); ctx.moveTo(mouseX - 10, mouseY + 10); ctx.lineTo(mouseX - 4, mouseY + 4); ctx.moveTo(mouseX + 10, mouseY + 10); ctx.lineTo(mouseX + 4, mouseY + 4); ctx.stroke(); }
  // staged reload: each stage fills, then waits for R. Tap R right as a stage fills for a smooth reload.
  if (mine.rs || mine.jam) {
    const bw = 110, bx = mouseX - bw / 2, by = mouseY - 52;
    const k = mine.rw ? 1 : rel.end ? 1 - Math.max(0, rel.end - t) / rel.total : 0;
    const label = mine.rw ? `R  ${{ out: "MAG IN", in: "RACK" }[mine.rs] || "GO"}` : mine.rs ? STAGE_NAME[mine.rs] || "" : "JAMMED · R";
    ctx.fillStyle = "#000b"; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
    ctx.fillStyle = mine.rw ? (Math.floor(t * 6) % 2 ? "#7dffb0" : "#3fbf6f") : mine.rs === "clear" || !mine.rs ? "#ff8060" : "#ffd34d";
    ctx.fillRect(bx, by, bw * Math.min(1, k), 6);
    text(label, mouseX, by + 20, 13, mine.rw ? "#7dffb0" : !mine.rs ? "#ff8060" : "#ddd");
  }
}

// ---------------------------------------------------------------- the Thu'um's elements
const ELEMS = {
  force: { name: "Force", word: "FUS RO DAH", color: "#c8e6ff", hex: 0xc8e6ff, rgb: "200,230,255", icon: "💨" },
  fire: { name: "Fire", word: "YOL TOOR SHUL", color: "#ff8a2a", hex: 0xff8a2a, rgb: "255,138,42", icon: "🔥" },
  frost: { name: "Frost", word: "FO KRAH DIIN", color: "#8fe0ff", hex: 0x8fe0ff, rgb: "143,224,255", icon: "❄" },
  storm: { name: "Storm", word: "STRUN BAH QO", color: "#e0d0ff", hex: 0xe0d0ff, rgb: "224,208,255", icon: "⚡" },
};
const STAGE_NAME = { out: "MAG OUT", in: "MAG IN", rack: "RACK", shell: "LOADING", load: "RELOADING", clear: "CLEARING JAM" };

// ---------------------------------------------------------------- field strip & clean (L)
// take it apart in the right order, scrub, oil, put it back together in the right order. Every wrong move leaves it dirtier.
const PARTS = {
  pistol: ["Magazine", "Chamber check", "Slide", "Recoil spring", "Barrel"],
  smg: ["Magazine", "Chamber check", "Rear pin", "Stock", "Bolt", "Firing pin"],
  rifle: ["Magazine", "Chamber check", "Takedown pin", "Charging handle", "Bolt carrier", "Bolt", "Firing pin"],
  ak: ["Magazine", "Chamber check", "Cleaning rod", "Dust cover", "Recoil spring", "Bolt carrier", "Bolt", "Gas tube"],
  shotgun: ["Unload the tube", "Chamber check", "Magazine cap", "Barrel", "Trigger group", "Bolt assembly"],
  sniper: ["Magazine", "Chamber check", "Bolt", "Action screws", "Stock"],
  rocket: ["Chamber check", "Blast shield", "Trigger housing", "Venturi"],
};
const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const escH = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let cl = null;
function openClean() {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine || mine.d || menusOpen()) return;
  const parts = PARTS[mine.w], t = T();
  if (!parts) return pushLim(toasts, { text: mine.w === "sword" ? "It's a sword. Wipe it on your trousers." : "There's nothing on this to strip.", color: "#bbb", t }, 4);
  if (mine.rs) return pushLim(toasts, { text: "Finish reloading first.", color: "#bbb", t }, 4);
  const build = parts.filter((p) => !/check|Unload/.test(p)).reverse().concat(["Function check"]);
  cl = { w: mine.wn, strip: parts.slice(), build, phase: "strip", i: 0, mistakes: 0, scrub: 0, msg: "Strip it down in the right order. Wrong moves count as mistakes.", order: shuf(parts.slice()) };
  cleanOpen = true; keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock();
  send({ t: "clean", start: true }); $("clean").classList.remove("hidden"); renderClean();
}
function closeClean(cancel) {
  if (!cleanOpen) return;
  cleanOpen = false; $("clean").classList.add("hidden");
  send(cancel ? { t: "clean", cancel: true } : { t: "clean", mistakes: cl.mistakes });
  cl = null;
}
function pickPart(name) {
  const list = cl.phase === "strip" ? cl.strip : cl.build, want = list[cl.i];
  if (name === want) {
    cl.i++; sfx("click");
    cl.msg = cl.phase === "strip" ? `${name}: out.` : name === "Function check" ? "Function check: click. Good as new." : `${name}: back in.`;
    if (cl.i >= list.length) { if (cl.phase === "strip") { cl.phase = "scrub"; cl.msg = "Stripped. Now scrub the barrel and bolt, then oil it."; } else return closeClean(false); }
  } else {
    cl.mistakes++; sfx("jam");
    cl.msg = cl.phase === "strip" && want === "Chamber check" ? "Check the chamber's empty first. Always. That's a mistake." : cl.phase === "strip" && want === "Unload the tube" ? "Unload it before anything else. That's a mistake." : `The ${name.toLowerCase()} won't ${cl.phase === "strip" ? "come out" : "go in"} yet. That's a mistake.`;
  }
  renderClean();
}
function renderClean() {
  if (!cl) return;
  const done = cl.phase === "strip" ? cl.strip.slice(0, cl.i) : cl.phase === "build" ? cl.build.slice(0, cl.i) : [];
  const tray = cl.phase === "strip" ? done : cl.phase === "scrub" ? cl.strip.filter((p) => !/check|Unload/.test(p)) : cl.build.slice(cl.i).filter((p) => p !== "Function check");
  let h = `<div class="cl-h">${escH(cl.w)} · ${cl.phase === "strip" ? "STRIP" : cl.phase === "scrub" ? "CLEAN" : "REASSEMBLE"} <span>mistakes: ${cl.mistakes}</span></div><div class="cl-msg">${escH(cl.msg)}</div>`;
  if (cl.phase === "scrub") h += `<div class="cl-parts"><button class="cbtn" data-a="scrub">Scrub (${cl.scrub}/6)</button><button class="cbtn alt" data-a="oil">Oil it</button></div>`;
  else h += `<div class="cl-parts">${cl.order.map((p) => `<button class="cbtn${done.includes(p) ? " done" : ""}" data-p="${escH(p)}"${done.includes(p) ? " disabled" : ""}>${escH(p)}</button>`).join("")}</div>`;
  h += `<div class="cl-l">${cl.phase === "build" ? "Still on the table" : "On the table"}</div><div class="cl-tray">${tray.map((p) => `<span>${escH(p)}</span>`).join("")}</div>`;
  $("cleanBody").innerHTML = h;
  for (const b of $("cleanBody").querySelectorAll("button")) b.onclick = () => {
    if (b.dataset.p) return pickPart(b.dataset.p);
    if (b.dataset.a === "scrub") { cl.scrub = Math.min(6, cl.scrub + 1); sfx("hit"); cl.msg = cl.scrub < 6 ? "Scrub, scrub..." : "Clean as a whistle. Oil it."; }
    else if (cl.scrub < 6) { cl.mistakes++; sfx("jam"); cl.msg = "Oiling a dirty barrel just makes sludge. Scrub it first. That's a mistake."; }
    else { cl.phase = "build"; cl.i = 0; cl.order = shuf(cl.build.slice()); cl.msg = "Oiled. Now put it back together in the right order."; }
    renderClean();
  };
}

// ---------------------------------------------------------------- Slop-Tech breach (hacking caches)
// pick codes from the lit line: row, then column, then row... Chain them to match the daemon sequences.
let hk = null, hackTimer = 0;
function openHack(e) {
  if (cleanOpen) closeClean(true);
  hk = { g: e.g, seqs: e.seqs, buf: e.buf, time: e.time, until: T() + e.time, picks: [] };
  hackOpen = true; keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock();
  $("hack").classList.remove("hidden"); renderHack();
  clearInterval(hackTimer);
  hackTimer = setInterval(() => { if (!hk) return clearInterval(hackTimer); if (T() > hk.until) return closeHack(false); const el = $("hkTime"); if (el) el.style.width = Math.max(0, (hk.until - T()) / hk.time * 100) + "%"; }, 200);
}
function closeHack(cancel) {
  if (!hackOpen) return;
  hackOpen = false; clearInterval(hackTimer); $("hack").classList.add("hidden");
  send(cancel ? { t: "hack", cancel: true } : { t: "hack", picks: hk.picks });
  hk = null;
}
function renderHack() {
  if (!hk) return;
  const n = hk.picks.length, last = hk.picks[n - 1], ln = !n ? { row: 0 } : n % 2 ? { col: last[1] } : { row: last[0] };
  const used = new Set(hk.picks.map((p) => p.join(","))), str = hk.picks.map(([r, c]) => hk.g[r][c]).join(" ");
  let h = `<div class="hk-time"><div id="hkTime" style="width:${Math.max(0, (hk.until - T()) / hk.time * 100)}%"></div></div><div class="hk-wrap"><table class="hk-grid">`;
  hk.g.forEach((row, r) => { h += "<tr>" + row.map((v, c) => { const on = ln.row === r || ln.col === c, u = used.has(r + "," + c); return `<td class="${on ? "on" : ""}${u ? " used" : ""}" data-r="${r}" data-c="${c}">${u ? "[ ]" : v}</td>`; }).join("") + "</tr>"; });
  h += `</table><div class="hk-side"><div class="hk-l">BUFFER</div><div class="hk-buf">${Array.from({ length: hk.buf }, (_, i) => `<span>${hk.picks[i] ? hk.g[hk.picks[i][0]][hk.picks[i][1]] : ""}</span>`).join("")}</div><div class="hk-l">DAEMONS</div>`;
  hk.seqs.forEach((sq, i) => { const ok = str.includes(sq.join(" ")); h += `<div class="hk-seq${ok ? " ok" : ""}">${sq.map((x) => `<span>${x}</span>`).join("")}<b>${["DATAMINE", "ICEPICK", "OVERRIDE"][i]}${ok ? " ✓" : ""}</b></div>`; });
  h += `</div></div><div class="hk-f">Pick from the lit ${ln.row !== undefined ? "row" : "column"}. Rows and columns alternate. Match the daemon codes in order to upload them.</div><button class="cbtn" id="hkGo">UPLOAD</button><button class="cbtn alt" id="hkReset">Clear buffer</button><button class="cbtn alt" id="hkQuit">Walk away</button>`;
  $("hackBody").innerHTML = h;
  for (const td of $("hackBody").querySelectorAll("td.on:not(.used)")) td.onclick = () => { hk.picks.push([+td.dataset.r, +td.dataset.c]); sfx("click"); if (hk.picks.length >= hk.buf) return closeHack(false); renderHack(); };
  $("hkGo").onclick = () => closeHack(false);
  $("hkReset").onclick = () => { hk.picks = []; renderHack(); };
  $("hkQuit").onclick = () => closeHack(true);
}

window.slopDebug = { get S() { return S; }, get me() { return me; }, get MAP() { return MAP; }, get mask() { return keyMask(); }, look(y, p) { yaw = y; pitch = p; }, get pred() { return pred; }, get use3d() { return use3d; }, send, ev: (e) => { handleEvent(e); handlePersonal(e); } }; // for tools/ and curious people
requestAnimationFrame(render);
})();
