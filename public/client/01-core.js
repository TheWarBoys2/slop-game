// Browser client, 01-core: Setup, the view toggle, the join form and the network. Opens the one function every client file shares.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// SLOP VALLEY — browser client
(() => {
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
const $ = (id) => document.getElementById(id);
let VW = 0, VH = 0, DPR = 1, UIS = 1;
// UI scale: "auto" fits the window (100% at about 950px tall), or a fixed 75-150% from Options.
// VW and VH are the screen in UI units, so the whole HUD grows or shrinks with it; --ui zooms the HTML panels to match.
// The HUD canvas also follows the Resolution option, so a lower resolution means fewer HUD pixels to paint as well.
const uiPrefs = () => { try { const o = JSON.parse(localStorage.getItem("slop-opts") || "{}"); return { ui: o.ui ?? "auto", res: +o.res || 1 }; } catch { return { ui: "auto", res: 1 }; } };
function resize() {
  const p = uiPrefs();
  UIS = p.ui === "auto" ? Math.max(0.8, Math.min(1.4, innerHeight / 950)) : Math.max(0.75, Math.min(1.5, +p.ui || 1));
  DPR = (window.devicePixelRatio || 1) * Math.min(1, p.res);
  VW = innerWidth / UIS; VH = innerHeight / UIS;
  cv.width = Math.round(innerWidth * DPR); cv.height = Math.round(innerHeight * DPR); cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
  document.documentElement.style.setProperty("--ui", UIS);
}
addEventListener("resize", resize); resize();

// ---------------------------------------------------------------- constants
// the game's tables come from the server's data.js, bundled in front of this file as DATA
const RARITY_COL = DATA.RARITY_COL, RARITY = DATA.RARITY, ENH = DATA.ENH_NAMES;
const WNAME = Object.fromEntries(Object.entries(DATA.WEAPONS).map(([k, w]) => [k, w.name]));
const TRACER = { rico: "#aee8ff", laser: "#ff2a2a", pistol: "#ffe9a0", smg: "#ffe9a0", shotgun: "#ffcf70", rifle: "#fff3b0", sniper: "#ffffff", staff: "#ff7a2a", ak: "#ffb0ff", rocket: "#ffb040" };
// ---------------------------------------------------------------- view: first or third person
const VIEWS = ["fp", "tp"], VIEW_NAME = { fp: "First person", tp: "Third person" };
let viewMode = (() => { try { return localStorage.getItem("slop-view") || "fp"; } catch { return "fp"; } })();
if (!VIEWS.includes(viewMode)) viewMode = "fp";
const has3d = typeof R3D !== "undefined" && R3D.init();
const project3 = (x, y, z) => { const s = R3D.project(x, y, z); if (s) { s.x /= UIS; s.y /= UIS; } return s; }; // a point in the world to the HUD (UI units)
let yaw = 0, pitch = 0, yawInit = false, aimYaw = 0, aimPitch = 0, playView = false, camNow = null, lastShotT = -9, viewT = -9;
const slashT = new Map();
const COLORS = ["#e0b050", "#e05050", "#50a0e0", "#60c060", "#c070e0", "#f08040", "#f0f0f0", "#40d0c0"];
const HATS = [["none", "None"], ["crown", "Crown"], ["cowboy", "Cowboy"], ["wizard", "Wizard"], ["horns", "Iron Helmet"], ["flower", "Flower"]];
const CLASSES = Object.entries(DATA.CLASSES).map(([id, c]) => [id, c.name, c.desc]);
const BACKGROUNDS = Object.entries(DATA.BACKGROUNDS).map(([id, b]) => [id, b.name, b.desc]);
const EYES = [["dot", "Dots"], ["angry", "Angry"], ["sleepy", "Sleepy"], ["googly", "Googly"], ["shades", "Shades"]];
const TREES = DATA.SKILL_TREES;
const SKILL_INFO = Object.fromEntries(Object.entries(DATA.SKILLS).map(([id, k]) => [id, [k.name, k.tree, k.desc, k.max]]));
const BOSS_NAME = DATA.BOSS_NAMES;
const TRAIT_DESC = Object.fromEntries(Object.entries(DATA.TRAITS).map(([k, t]) => [k, t.desc]));

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
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); $("name").blur(); $("go").click(); } }); // and don't let that Enter open the chat box
// say what the picked trait does, and put the cursor in the name box so Enter gets you straight in
const showTrait = () => { $("traitDesc").textContent = choice.trait === "random" ? "Random: fate picks one when you join (Strong, Swift, Bald...). Your heirs roll their own." : `${choice.trait}: ${TRAIT_DESC[choice.trait] || ""}`; };
$("traits").addEventListener("click", showTrait); showTrait();
setTimeout(() => { if (!joined) $("name").focus(); }, 0);

// ---------------------------------------------------------------- network
let WHEEL = [], COSM = {}, FREE_HATS = [], myCos = [], DUSTR = null;
const inDustC = () => !!DUSTR && pred.x > DUSTR.x && pred.x < DUSTR.x + DUSTR.w && pred.y > DUSTR.y && pred.y < DUSTR.y + DUSTR.h; // standing on Dust II
let ws, MAP = null, SHOP = null, SHOPS = {}, DOME_R = 1000, shopSid = "general", ENH_COST = [], ENH_CHANCE = [], PIECES = {}, LEGENDS = {};
let CHUNK_WALLS = [], chunkVer = 0, CHUNK_BIO = {}; // the wild past the hedge, sent a chunk at a time as people explore
const openWorld = () => !S || S.g.mode !== "royale";
const BWc = () => (openWorld() ? Infinity : MAP.W), BHc = () => (openWorld() ? Infinity : MAP.H);
let ITEMS = {}, GEAR = {}, CARDS = {}, LOCS = {}, STOCKS = {}, CANDS = {}, INV = null, CROPS = {}, CROP_KEYS = [], SEED_PACK = 3;
let S = null; // latest snapshot
let me = 0, joined = false;
const disp = new Map(); // smoothed positions by key
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "hello") { WHEEL = m.wheel || []; COSM = m.cosmetics || {}; FREE_HATS = m.freeHats || []; SHOP = m.shop; SHOPS = m.shops || {}; DOME_R = m.domeR || 1000; ENH_COST = m.enhCost; ENH_CHANCE = m.enhChance; PIECES = m.pieces || {}; LEGENDS = m.legends || {}; ITEMS = m.items || {}; CROPS = m.crops || {}; CROP_KEYS = Object.keys(CROPS); SEED_PACK = m.seedPack || 3; GEAR = m.gear || {}; CARDS = m.cards || {}; LOCS = m.locs || {}; STOCKS = m.stocks || {}; CANDS = m.cands || {}; DUSTR = m.dust || null; renderBuildBar(); if (joined) send({ t: "join", ...choice }); return; }
    if (m.t === "map") { const fresh = !MAP || MAP.seed !== m.map.seed; if (fresh) { CHUNK_WALLS = []; CHUNK_BIO = {}; } MAP = m.map; MAP.bio = CHUNK_BIO; MAP.walls = MAP.walls.concat(CHUNK_WALLS); MAP.cv = chunkVer; if (fresh) {  disp.clear(); } return; }
    if (m.t === "ck") { if (m.reset) { CHUNK_WALLS = []; for (const k in CHUNK_BIO) delete CHUNK_BIO[k]; } CHUNK_WALLS.push(...m.walls); for (const [cx, cy, kind] of m.bio || []) CHUNK_BIO[cx + "," + cy] = kind; chunkVer++; if (MAP && MAP.seed === m.seed) { MAP.walls = MAP.walls.filter((w) => !w.ck).concat(CHUNK_WALLS); MAP.cv = chunkVer; } return; }
    if (m.t === "wd") { // walls knocked down since the last tick (wild ones too), and any rubble they left
      const gone = new Set(m.gone);
      CHUNK_WALLS = CHUNK_WALLS.filter((w) => !gone.has(w.id));
      if (MAP) { MAP.walls = MAP.walls.filter((w) => !gone.has(w.id)).concat(m.add || []); MAP.ver = m.ver; }
      return;
    }
    if (m.t === "s") onSnap(m);
    if (m.t === "kicked") kicked = true;
  };
  ws.onclose = () => {
    if (!kicked) { setTimeout(connect, 1500); return; }
    if (document.pointerLockElement) document.exitPointerLock();
    const d = document.createElement("div"); d.style.cssText = "position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#111e;color:#ffd34d;font:bold 28px sans-serif;text-align:center";
    d.innerHTML = "The host kicked you out of the valley.<br><button class='cbtn' style='margin-top:18px;font-size:18px'>Try again</button>"; d.querySelector("button").onclick = () => location.reload(); document.body.appendChild(d);
  };
}
let kicked = false;
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
connect();

