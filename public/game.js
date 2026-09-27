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
const WNAME = { pistol: "Pistol", smg: "SMG", shotgun: "Shotgun", rifle: "Rifle", sniper: "Sniper", staff: "Fire Staff" };
const TRACER = { pistol: "#ffe9a0", smg: "#ffe9a0", shotgun: "#ffcf70", rifle: "#fff3b0", sniper: "#ffffff", staff: "#ff7a2a" };
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
let ws, MAP = null, SHOP = null, ENH_COST = [], ENH_CHANCE = [];
let S = null; // latest snapshot
let me = 0, joined = false;
const disp = new Map(); // smoothed positions by key
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "hello") { SHOP = m.shop; ENH_COST = m.enhCost; ENH_CHANCE = m.enhChance; if (joined) send({ t: "join", ...choice }); return; }
    if (m.t === "map") { MAP = m.map; buildDecor(); disp.clear(); return; }
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
  $("startBtn").classList.toggle("hidden", !(joined && m.g.ph === "lobby" && hostId === me));
  const canMode = joined && hostId === me && (m.g.ph === "lobby" || m.g.ph === "over");
  for (const el of document.querySelectorAll(".modeBtns")) el.classList.toggle("hidden", !canMode);
  for (const b of document.querySelectorAll(".modeBtns button")) b.classList.toggle("sel", b.dataset.m === m.g.mode);
  $("startBtn").textContent = m.g.mode === "royale" ? "Start Royale" : "Start Story";
  if (m.g.ph === "over") {
    $("again").classList.toggle("hidden", hostId !== me);
    $("waitHost").classList.toggle("hidden", hostId === me);
  }
  const mine = m.p.find((p) => p.id === me);
  if (mine && pred.init === false) { pred.x = mine.x; pred.y = mine.y; pred.init = true; }
  if (mine) {
    const dx = mine.x - pred.x, dy = mine.y - pred.y;
    if ((mine.d || dx * dx + dy * dy > 90 * 90) && !mine.air) { pred.x = mine.x; pred.y = mine.y; }
    pred.srvX = mine.x; pred.srvY = mine.y;
  }
}
function handleEvent(e) {
  const t = T();
  if (e.k === "tr") { fx.push({ kind: "tr", t0: t, dur: e.c === "sniper" ? 0.25 : 0.08, ...e }); const d = Math.hypot(e.x1 - pred.x, e.y1 - pred.y); if (d < 700) sfx("shot", 1 - d / 700, e.c); }
  else if (e.k === "boom") { fx.push({ kind: "boom", t0: t, dur: 0.4, ...e }); nearShake(e, 8); sfx("boom"); }
  else if (e.k === "shout") { fx.push({ kind: "shout", t0: t, dur: 0.7, ...e }); nearShake(e, 10); sfx("shout"); }
  else if (e.k === "burn") fx.push({ kind: "burn", t0: t, dur: 0.8, x: e.x + (Math.random() - 0.5) * 20, y: e.y });
  else if (e.k === "trample") fx.push({ kind: "text", t0: t, dur: 1, x: e.x, y: e.y, text: "trampled!", color: "#c96" });
  else if (e.k === "roar") { fx.push({ kind: "shout", t0: t, dur: 0.8, x: e.x, y: e.y, a: 0, full: true }); shake = Math.max(shake, 12); }
  else if (e.k === "hhit") { hearthHitT = t; }
  else if (e.k === "feed") pushLim(feed, { text: e.text, color: e.color, t }, 6);
  else if (e.k === "chat") pushLim(chatLog, { from: e.from, text: e.text, color: e.color, t }, 8);
  else if (e.k === "say") bubbles.set(e.id, { text: e.text, t });
  else if (e.k === "banner") { banner = { text: e.text, sub: e.sub, t }; sfx("banner"); }
  else if (e.k === "vote") sfx("banner");
  else if (e.k === "clue") { sfx("lvl"); clueT = t; }
  else if (e.k === "land") fx.push({ kind: "boom", t0: t, dur: 0.35, x: e.x, y: e.y, r: 30, dust: true });
}
function handlePersonal(e) {
  const t = T();
  if (e.k === "toast") pushLim(toasts, { text: e.text, color: e.color, t }, 4);
  else if (e.k === "dmg") {
    fx.push({ kind: "text", t0: t, dur: 0.7, x: e.x + (Math.random() - 0.5) * 16, y: e.y, text: e.hs ? `${e.v}!` : String(e.v), color: e.ff ? "#ff5050" : e.hs ? "#ff9d2e" : e.crit ? "#ffd34d" : "#fff", big: e.crit || e.hs });
    if (e.hs) { hsT = t; sfx("hs"); } else sfx("hit");
  }
  else if (e.k === "lvl") { pushLim(toasts, { text: `LEVEL ${e.lvl}!  Press K to spend your skill point`, color: "#9fe0ff", t }, 4); sfx("lvl"); }
  else if (e.k === "perfect") { pushLim(toasts, { text: "PERFECT RELOAD  +20% damage this mag", color: "#7dffb0", t }, 4); sfx("perfect"); }
  else if (e.k === "jam") { pushLim(toasts, { text: "Fumbled the reload!", color: "#ff8080", t }, 4); sfx("jam"); }
  else if (e.k === "gold") pushLim(toasts, { text: `+${e.amt}g  ${e.reason}`, color: "#ffd34d", t }, 4);
  else if (e.k === "hurt") { hurtFlash = t; shake = Math.max(shake, 5); sfx("hurt"); }
  else if (e.k === "wasted") { wasted = t; wastedPlace = e.place || 0; }
  else if (e.k === "dlg") showDlg(e);
  else if (e.k === "fog") fogT = t;
  else if (e.k === "case") caseAnim = { t0: t, type: e.type, rarity: e.rarity, name: e.name, reel: makeReel(e.type, e.rarity, e.name) };
  else if (e.k === "enh") { enhAnim = { t0: t, ...e }; sfx(e.ok ? "lvl" : "jam"); }
}
function pushLim(arr, v, n) { arr.push(v); while (arr.length > n) arr.shift(); }
function nearShake(e, amt) { if (Math.hypot(e.x - pred.x, e.y - pred.y) < 500) shake = Math.max(shake, amt); }
let hearthHitT = 0, hsT = -9, localReloadTry = 0, wastedPlace = 0, fogT = -9, clueT = -9;
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
  const k = e.key.toLowerCase();
  if (k === "tab") { e.preventDefault(); showScores = true; return; }
  if (k === "enter") { openChat(); e.preventDefault(); return; }
  if (k === "b") { toggleSkills(false); toggleShop(); return; }
  if (dlgOpen && /^[1-9]$/.test(k)) { send({ t: "dlg", i: Number(k) - 1 }); return; }
  if (k === "escape" && dlgOpen) { send({ t: "dlg", i: -1 }); return; }
  if (k === "k") { toggleSkills(); return; }
  if (k === "j") { toggleJournal(); return; }
  if (k === "escape") { toggleShop(false); toggleSkills(false); toggleJournal(false); return; }
  if (shopOpen && /^[0-9]$/.test(k)) { const items = Object.keys(SHOP); const i = (Number(k) + 9) % 10; if (items[i]) send({ t: "buy", item: items[i] }); return; }
  if (e.repeat) return;
  keys.add(k);
  if (k === "r") { const mine = S?.p.find((p) => p.id === me); if (mine && mine.rl && !mine.rtr) localReloadTry = T(); send({ t: "reload" }); }
  if (k === "e") send({ t: "use" });
  if (k === "q") send({ t: "shout" });
  if (k === " ") { send({ t: "dodge" }); localDodge(); e.preventDefault(); }
  if (k === "1") send({ t: "swap", i: 0 });
  if (k === "2") send({ t: "swap", i: 1 });
});
addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); keys.delete(k); if (k === "tab") showScores = false; });
addEventListener("blur", () => { keys.clear(); mouseDown = false; showScores = false; });
cv.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; });
cv.addEventListener("mousedown", (e) => { if (e.button === 0) mouseDown = true; });
addEventListener("mouseup", () => { mouseDown = false; });
cv.addEventListener("wheel", () => send({ t: "swap" }), { passive: true });
cv.addEventListener("contextmenu", (e) => e.preventDefault());
$("startBtn").onclick = (e) => { e.target.blur(); send({ t: "start" }); };
$("again").onclick = (e) => { e.target.blur(); send({ t: "start" }); };
for (const b of document.querySelectorAll(".modeBtns button")) b.onclick = (e) => { e.target.blur(); send({ t: "mode", m: b.dataset.m }); };
function openChat() { chatting = true; keys.clear(); mouseDown = false; $("chatbox").classList.remove("hidden"); $("chatin").value = ""; $("chatin").focus(); }
function closeChat() { chatting = false; $("chatbox").classList.add("hidden"); $("chatin").blur(); cv.focus(); }
function toggleShop(force) {
  shopOpen = force === undefined ? !shopOpen : force;
  if (shopOpen && S && S.g.ph === "night") { shopOpen = false; pushLim(toasts, { text: "The shop is shut at night.", color: "#f88", t: T() }, 4); }
  $("shop").classList.toggle("hidden", !shopOpen);
  if (shopOpen) { keys.clear(); mouseDown = false; renderShop(); }
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
    const d = document.createElement("div");
    d.className = "item";
    d.innerHTML = `<span><span class="k">${(i + 1) % 10}</span>${label}</span><span>${cost}</span>`;
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
      `<div class="st-f">Click to vote. Majority decides.</div>`;
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
  g.gain.value = 0.35;
  if (kind === "shot") { noise(sub === "sniper" ? 0.35 : sub === "shotgun" ? 0.25 : 0.09, 0.5 * vol, sub === "sniper" ? 300 : 900); if (sub === "staff") tone("sawtooth", 300, 80, 0.2, 0.2 * vol); }
  else if (kind === "hit") tone("square", 220, 120, 0.05, 0.08);
  else if (kind === "hs") { tone("sine", 1760, 1760, 0.18, 0.35); tone("sine", 2640, 2640, 0.12, 0.15); }
  else if (kind === "hurt") tone("sawtooth", 160, 60, 0.15, 0.25);
  else if (kind === "boom") { noise(0.5, 0.7, 60); tone("sine", 120, 30, 0.4, 0.5); }
  else if (kind === "shout") { tone("sawtooth", 110, 55, 0.6, 0.35); noise(0.5, 0.3, 200); }
  else if (kind === "lvl") [523, 659, 784, 1046].forEach((f, i) => { const o = actx.createOscillator(); o.type = "triangle"; o.frequency.value = f; const gg = actx.createGain(); gg.gain.setValueAtTime(0, t + i * 0.08); gg.gain.linearRampToValueAtTime(0.25, t + i * 0.08 + 0.01); gg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25); o.connect(gg); gg.connect(g); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3); });
  else if (kind === "perfect") { tone("triangle", 880, 1320, 0.15, 0.3); }
  else if (kind === "jam") tone("square", 120, 90, 0.2, 0.2);
  else if (kind === "banner") tone("triangle", 196, 196, 0.8, 0.25);
}

// ---------------------------------------------------------------- dialogue & journal
let dlgOpen = false;
function showDlg(e) {
  const box = $("dlg");
  if (e.close) { dlgOpen = false; box.classList.add("hidden"); return; }
  dlgOpen = true;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  box.innerHTML = `<div class="dl-n">${esc(e.name)} <span>${esc(e.role)}</span></div><div class="dl-t">${esc(e.text)}</div>` +
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
  $("journalBody").innerHTML = `<h3>Quests</h3>${qs}<h3>Evidence (${S.g.clues.length}/5)</h3>${cl}`;
}
setInterval(() => { if (journalOpen) renderJournal(); }, 500);

function keyMask() {
  if (chatting || shopOpen || skillsOpen) return 0;
  return (keys.has("w") ? 1 : 0) | (keys.has("a") ? 2 : 0) | (keys.has("s") ? 4 : 0) | (keys.has("d") ? 8 : 0);
}
function aimAngle() { return Math.atan2(mouseY - VH / 2, mouseX - VW / 2); }
setInterval(() => { if (joined) send({ t: "in", k: keyMask(), a: aimAngle(), f: mouseDown && !chatting && !shopOpen && !skillsOpen }); }, 33);
setInterval(() => { if (shopOpen) renderShop(); }, 250);

// ---------------------------------------------------------------- prediction (own player)
const pred = { x: 0, y: 0, init: false, srvX: 0, srvY: 0, dashUntil: 0, dashCd: 0, dx: 0, dy: 0 };
function localDodge() {
  const t = T(); if (t < pred.dashCd) return;
  const mine = S?.p.find((p) => p.id === me); if (!mine || mine.d) return;
  const m = keyMask();
  let dx = ((m & 8) ? 1 : 0) - ((m & 2) ? 1 : 0), dy = ((m & 4) ? 1 : 0) - ((m & 1) ? 1 : 0);
  if (!dx && !dy) { const a = aimAngle(); dx = Math.cos(a); dy = Math.sin(a); }
  const l = Math.hypot(dx, dy); pred.dx = dx / l; pred.dy = dy / l;
  pred.dashUntil = t + 0.18; pred.dashCd = t + (mine.cl === "rogue" ? 0.8 : 1.3);
}
function collide(e, r) {
  for (const w of MAP.walls) {
    const cx = Math.max(w.x, Math.min(e.x, w.x + w.w)), cy = Math.max(w.y, Math.min(e.y, w.y + w.h));
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 1e-4) { const d = Math.sqrt(d2); e.x = cx + dx / d * r; e.y = cy + dy / d * r; }
  }
  e.x = Math.max(r, Math.min(MAP.W - r, e.x)); e.y = Math.max(r, Math.min(MAP.H - r, e.y));
}
function stepPred(dt) {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine || !MAP) return;
  if (mine.d) { pred.x = mine.x; pred.y = mine.y; return; }
  if (mine.air) { const k = Math.min(1, dt * 12); pred.x += (mine.x - pred.x) * k; pred.y += (mine.y - pred.y) * k; if (Math.hypot(mine.x - pred.x, mine.y - pred.y) > 300) { pred.x = mine.x; pred.y = mine.y; } return; }
  const m = keyMask();
  let mx = ((m & 8) ? 1 : 0) - ((m & 2) ? 1 : 0), my = ((m & 4) ? 1 : 0) - ((m & 1) ? 1 : 0);
  if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
  if (T() < pred.dashUntil) { mx = pred.dx * 3.1; my = pred.dy * 3.1; }
  pred.x += mx * mine.sp * dt; pred.y += my * mine.sp * dt;
  // gently pull toward the server's opinion
  const k = Math.min(1, dt * (mx || my ? 2 : 8));
  pred.x += (pred.srvX - pred.x) * k; pred.y += (pred.srvY - pred.y) * k;
  collide(pred, 16);
}

// ---------------------------------------------------------------- decor
let decor = [];
function buildDecor() {
  let seed = (MAP.seed % 2147483646) + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  decor = [];
  for (let i = 0; i < 500; i++) decor.push({ x: rnd() * MAP.W, y: rnd() * MAP.H, k: rnd() < 0.85 ? "tuft" : "flower", c: ["#e86", "#fd5", "#c8f", "#fff"][(rnd() * 4) | 0] });
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
  else if (hat === "flower") { for (let i = 0; i < 5; i++) { ctx.fillStyle = "#ff8fc8"; ctx.beginPath(); ctx.arc(Math.cos(i * 1.26) * 5, -6 + Math.sin(i * 1.26) * 5, 4, 0, 7); ctx.fill(); } ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(0, -6, 3, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawNpcHat(hat, x, y) {
  ctx.save(); ctx.translate(x, y - 12);
  if (hat === "tophat") { ctx.fillStyle = "#222"; ctx.fillRect(-14, -2, 28, 5); ctx.fillRect(-9, -20, 18, 18); ctx.fillStyle = "#a33"; ctx.fillRect(-9, -6, 18, 3); }
  else if (hat === "hood") { ctx.fillStyle = "#8a7a5a"; ctx.beginPath(); ctx.arc(0, 6, 19, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(0, -16); ctx.fill(); }
  else if (hat === "witch") { ctx.fillStyle = "#2a3a2a"; ctx.fillRect(-18, -2, 36, 5); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(6, -34); ctx.lineTo(11, 0); ctx.fill(); }
  else if (hat === "flatcap") { ctx.fillStyle = "#5a5040"; ctx.beginPath(); ctx.ellipse(2, 0, 16, 7, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(4, -2, 16, 4); }
  else if (hat === "helmet") { ctx.fillStyle = "#99a"; ctx.beginPath(); ctx.arc(0, 2, 15, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#c33"; ctx.fillRect(-2, -18, 4, 8); }
  ctx.restore();
}
function drawMinimap(mine, t) {
  if (!S || S.g.ph === "lobby" && !S.g.zone) return;
  const mw = 190, mh = mw * MAP.H / MAP.W, mx = 12, my = 12, k = mw / MAP.W;
  ctx.fillStyle = "#000b"; ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
  ctx.fillStyle = "#3f6030"; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = "#0006"; for (const w of MAP.walls) ctx.fillRect(mx + w.x * k, my + w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
  if (S.g.mode !== "royale") { const h = MAP.hearth; ctx.fillStyle = "#ff8a2a"; ctx.fillRect(mx + h.x * k, my + h.y * k, h.w * k, h.h * k); }
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
  if (S.g.zone) {
    const [cx, cy, r, tcx, tcy, tr] = S.g.zone;
    ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.arc(mx + cx * k, my + cy * k, Math.max(0.5, r * k), 0, 7, true); ctx.fillStyle = "#7828a080"; ctx.fill("evenodd");
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(mx + tcx * k, my + tcy * k, Math.max(0.5, tr * k), 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  if (S.g.drop && S.g.drop[4] < 1) { const [x0, y0, x1, y1, dk] = S.g.drop; ctx.strokeStyle = "#ffd34d"; ctx.beginPath(); ctx.moveTo(mx + x0 * k, my + y0 * k); ctx.lineTo(mx + x1 * k, my + y1 * k); ctx.stroke(); ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(mx + (x0 + (x1 - x0) * dk) * k, my + (y0 + (y1 - y0) * dk) * k, 3, 0, 7); ctx.fill(); }
  ctx.restore();
  if (MAP.npcs && S.g.mode !== "royale") for (const n of MAP.npcs) { ctx.fillStyle = "#e0c0ff"; ctx.fillRect(mx + n.x * k - 1.5, my + n.y * k - 1.5, 3, 3); }
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

// ---------------------------------------------------------------- render
let frameNo = 0, lastFrame = T();
const dark = document.createElement("canvas"), dctx = dark.getContext("2d");
function render() {
  requestAnimationFrame(render);
  const t = T(), dt = Math.min(0.05, t - lastFrame); lastFrame = t; frameNo++;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, VW, VH);
  if (!MAP || !S) { text("Connecting to the valley...", VW / 2, VH / 2, 24, "#ffd34d"); return; }
  stepPred(dt);
  const mine = S.p.find((p) => p.id === me);
  let cam = mine ? { x: pred.x, y: pred.y } : { x: MAP.W / 2, y: MAP.H / 2 };
  if (mine && mine.out && S.g.ph === "royale") { const alive = S.p.filter((p) => !p.d && !p.out); if (alive.length) { const f = alive[Math.floor(t / 8) % alive.length]; const d = smooth("spec", f.x, f.y, dt); cam = { x: d.x, y: d.y }; } }
  shake *= Math.pow(0.001, dt);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  const ox = Math.round(VW / 2 - cam.x + sx), oy = Math.round(VH / 2 - cam.y + sy);
  ctx.save(); ctx.translate(ox, oy);

  // ground
  ctx.fillStyle = "#4f7a3a"; ctx.fillRect(0, 0, MAP.W, MAP.H);
  ctx.fillStyle = "#6a5a3a"; // dirt paths
  ctx.fillRect(MAP.W / 2 - 40, 0, 80, MAP.H); ctx.fillRect(0, MAP.H / 2 - 40, MAP.W, 80);
  for (const d of decor) {
    if (d.x < cam.x - VW / 2 - 20 || d.x > cam.x + VW / 2 + 20 || d.y < cam.y - VH / 2 - 20 || d.y > cam.y + VH / 2 + 20) continue;
    if (d.k === "tuft") { ctx.strokeStyle = "#3d6a2c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(d.x - 4, d.y); ctx.lineTo(d.x - 2, d.y - 7); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 1, d.y - 9); ctx.moveTo(d.x + 4, d.y); ctx.lineTo(d.x + 5, d.y - 6); ctx.stroke(); }
    else { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, 7); ctx.fill(); }
  }
  ctx.strokeStyle = "#2a3d20"; ctx.lineWidth = 8; ctx.strokeRect(0, 0, MAP.W, MAP.H);

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

  // walls / buildings
  for (const w of MAP.walls) {
    if (w.kind === "hearth") continue;
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

  // townsfolk
  if (MAP.npcs && S.g.mode !== "royale") for (const n of MAP.npcs) {
    const bob = Math.sin(t * 2 + n.x) * 1.5;
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(n.x, n.y + 14, 16, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(n.x, n.y + bob, 17, 0, 7); ctx.fill();
    ctx.strokeStyle = "#0008"; ctx.lineWidth = 2; ctx.stroke();
    drawEyes("dot", n.x, n.y + bob - 3, t, 0);
    drawNpcHat(n.hat, n.x, n.y + bob);
    text(n.name, n.x, n.y - 38, 12, "#e0c0ff");
    text(n.role, n.x, n.y - 25, 10, "#b0a0c8");
    if (mine && (!mine.nt.includes(n.id) || mine.qr.includes(n.id))) {
      const q = mine.qr.includes(n.id);
      text(q ? "?" : "!", n.x, n.y - 58 + Math.sin(t * 4) * 3, 22, q ? "#7dffb0" : "#ffd34d");
    }
  }

  // zombies
  for (const [id, type, zx, zy, hpPct, burn] of S.z) {
    const d = smooth("z" + id, zx, zy, dt);
    const bk = S.g.bk;
    const r = type === "b" ? 48 : type === "e" ? 34 : type === "t" ? 26 : type === "r" ? 12 : 15;
    const bossCol = { leshen: "#3a5a2a", drowned: "#3a6a8a", golem: "#b08a3a" }[bk];
    const col = burn ? "#d0602a" : type === "b" ? bossCol : type === "e" ? "#3a6a8a" : type === "t" ? "#3f6b3a" : type === "r" ? "#a0d070" : "#6fa35a";
    const wob = Math.sin(t * 8 + id) * 2;
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(d.x, d.y + r * 0.8, r, r * 0.4, 0, 0, 7); ctx.fill();
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
    ctx.fillStyle = type === "b" ? (bk === "golem" ? "#ff8a20" : "#ff2020") : type === "e" ? "#bfe8ff" : "#ffec40"; ctx.beginPath(); ctx.arc(d.x - r * 0.35, d.y - r * 0.2, r * 0.14, 0, 7); ctx.arc(d.x + r * 0.35, d.y - r * 0.2, r * 0.14, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = r * 0.35; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(d.x - r * 0.7, d.y + r * 0.2); ctx.lineTo(d.x - r * 1.1, d.y + r * 0.6 + wob); ctx.moveTo(d.x + r * 0.7, d.y + r * 0.2); ctx.lineTo(d.x + r * 1.1, d.y + r * 0.6 - wob); ctx.stroke(); ctx.lineCap = "butt";
    if (hpPct < 100 && type !== "b") bar(d.x - r, d.y - r - 9, r * 2, 4, hpPct / 100, "#e44");
  }

  // players
  for (const p of S.p) {
    if (p.d || p.air === 1) continue;
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
    const a = p.id === me ? aimAngle() : p.a;
    if (p.cl === "gaffer") { ctx.strokeStyle = "#ffd34d33"; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, 260, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = "#0004"; ctx.beginPath(); ctx.ellipse(d.x, d.y + 14, 16, 6, 0, 0, 7); ctx.fill();
    // gun
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(a);
    const gl = { pistol: 20, smg: 26, shotgun: 30, rifle: 34, sniper: 42, staff: 36 }[p.w] || 24;
    ctx.fillStyle = p.w === "staff" ? "#8b5a2b" : "#333"; ctx.fillRect(8, -3, gl, 6);
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
    else if (f.kind === "boom") { ctx.fillStyle = `rgba(255,${140 - k * 100},40,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.8), 0, 7); ctx.fill(); }
    else if (f.kind === "shout") {
      ctx.fillStyle = `rgba(200,230,255,${0.5 * (1 - k)})`; ctx.beginPath();
      if (f.full) ctx.arc(f.x, f.y, 60 + k * 200, 0, 7);
      else { ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, (f.r || 280) * Math.min(1, k * 2), f.a - 0.7, f.a + 0.7); }
      ctx.fill();
      if (!f.full) text("FUS RO DAH!", f.x, f.y - 60 - k * 30, 26, `rgba(220,240,255,${1 - k})`);
    }
    else if (f.kind === "burn") { ctx.fillStyle = `rgba(255,${160 - k * 120},30,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y - k * 30, 5 * (1 - k) + 2, 0, 7); ctx.fill(); }
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
  ctx.restore();

  // darkness
  drawDarkness(ox, oy, t);

  // hurt vignette
  if (t - hurtFlash < 0.3) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); g.addColorStop(0, "#f000"); g.addColorStop(1, `rgba(200,0,0,${0.5 * (1 - (t - hurtFlash) / 0.3)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }

  if (t - fogT < 1.2) { ctx.fillStyle = `rgba(120,40,160,${0.25 * (1 - (t - fogT) / 1.2)})`; ctx.fillRect(0, 0, VW, VH); }
  drawHud(mine, t);
  drawMinimap(mine, t);
  drawCrosshair(mine, t);
  for (const k of disp.keys()) if (disp.get(k).seen < frameNo - 30) disp.delete(k);
}

function drawDarkness(ox, oy, t) {
  const ph = S.g.ph;
  let alpha = 0;
  if (ph === "night") alpha = 0.86;
  else if (ph === "day" && S.g.left >= 0 && S.g.left < 10) alpha = (10 - S.g.left) / 10 * 0.5; // dusk
  if (alpha <= 0) return;
  if (dark.width !== cv.width || dark.height !== cv.height) { dark.width = cv.width; dark.height = cv.height; }
  dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dctx.globalCompositeOperation = "source-over";
  dctx.clearRect(0, 0, VW, VH);
  dctx.fillStyle = `rgba(5,8,25,${alpha})`; dctx.fillRect(0, 0, VW, VH);
  dctx.globalCompositeOperation = "destination-out";
  const hole = (x, y, r, inner = 0.2) => { const g = dctx.createRadialGradient(x, y, r * inner, x, y, r); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); dctx.fillStyle = g; dctx.beginPath(); dctx.arc(x, y, r, 0, 7); dctx.fill(); };
  const hw = MAP.hearth;
  hole(hw.x + hw.w / 2 + ox, hw.y + hw.h / 2 + oy, 260 + Math.sin(t * 7) * 8);
  for (const p of S.p) {
    if (p.d) continue;
    const d = p.id === me ? { x: pred.x, y: pred.y } : disp.get("p" + p.id) || p;
    const a = p.id === me ? aimAngle() : p.a;
    const x = d.x + ox, y = d.y + oy;
    hole(x, y, 110, 0.3);
    // flashlight cone
    const g = dctx.createRadialGradient(x, y, 20, x, y, 480);
    g.addColorStop(0, "rgba(0,0,0,0.95)"); g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(x, y); dctx.arc(x, y, 480, a - 0.42, a + 0.42); dctx.closePath(); dctx.fill();
  }
  for (const f of fx) if (f.kind === "boom" || f.kind === "burn") hole(f.x + ox, f.y + oy, f.kind === "boom" ? 160 : 40);
  ctx.drawImage(dark, 0, 0, VW, VH);
}

function drawHud(mine, t) {
  const g = S.g;
  // top center: phase
  let label = "";
  if (g.ph === "lobby") label = `${(MAP.valley || "").toUpperCase()} — ${S.p.length} farmer${S.p.length === 1 ? "" : "s"} waiting`;
  else if (g.ph === "day") label = `DAY ${g.n + 1}  ·  night falls in ${g.left}s`;
  else if (g.ph === "night") label = g.left < 0 ? `NIGHT ${g.n}  ·  FINAL CONTRACT` : `NIGHT ${g.n}/5  ·  dawn in ${g.left}s`;
  else if (g.ph === "royale") label = `ROYALE · ${g.alive} alive${g.zone && g.zone[6] >= 0 ? ` · fog moves in ${g.zone[6]}s` : g.zone && g.zone[5] < g.zone[2] - 2 ? " · FOG CLOSING" : ""}`;
  else label = g.res === "win" ? "VICTORY" : g.res === "royale" ? "ROYALE OVER" : "DEFEAT";
  if (g.ph === "lobby") label += g.mode === "royale" ? " · Royale" : " · Story";
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 200, 10, 400, 44, 10); ctx.fill();
  text(label, VW / 2, 26, 18, g.ph === "night" ? "#9fc0ff" : "#ffe9a0");
  if (g.mode !== "royale") bar(VW / 2 - 180, 42, 360, 6, g.hh / g.hm, "#e8703a");
  if (g.ph === "lobby" && joined) {
    const hostId = S.p.length ? Math.min(...S.p.map((p) => p.id)) : 0;
    if (hostId !== me) text("Waiting for the host to start...", VW / 2, 80, 16, "#ccc");
  }
  // boss bar
  if (g.boss) {
    const bz = S.z.find((z) => z[0] === g.boss);
    if (bz) { text(BOSS_NAME[g.bk] || "BOSS", VW / 2, 74, 16, "#ff6060"); bar(VW / 2 - 250, 86, 500, 12, bz[4] / 100, "#c02020"); }
  }
  const elite = S.z.find((z) => z[1] === "e");
  if (elite && !g.boss) { text("THE DROWNED MAYOR", VW / 2, 74, 16, "#6ab0e0"); bar(VW / 2 - 200, 86, 400, 10, elite[4] / 100, "#3a7ab0"); }

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
    const y = VH - 170 - (chatLog.length - 1 - i) * 20;
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
  if (mine.st > 0) { ctx.fillStyle = "#ffcc00"; for (let i = 0; i < 5; i++) { ctx.globalAlpha = i < mine.st ? 1 : 0.2; star(190 + i * 22, VH - 45, 9); } ctx.globalAlpha = 1; }
  const sc = mine.sc;
  text(sc > 0 ? `Q  shout ${Math.ceil(sc)}s` : "Q  FUS RO DAH ready", 24, VH - 22, 13, sc > 0 ? "#888" : "#bfe0ff", "left");
  // bottom right: weapon
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW - 312, VH - 100, 300, 88, 10); ctx.fill();
  const wn = `${mine.we ? ENH[mine.we] + " " : ""}${mine.wn}`;
  text(wn, VW - 24, VH - 80, 20, RARITY_COL[mine.wr], "right");
  text(`${RARITY[mine.wr]}${mine.we ? `  +${mine.we}` : ""}`, VW - 24, VH - 58, 13, RARITY_COL[mine.wr], "right");
  text(mine.rl ? "RELOADING..." : `${mine.am}`, VW - 24, VH - 32, mine.rl ? 18 : 28, mine.am === 0 && !mine.rl ? "#f55" : mine.hot ? "#7dffb0" : "#fff", "right");
  if (mine.hot && !mine.rl) text("EMPOWERED", VW - 70, VH - 32, 12, "#7dffb0", "right");
  text(mine.sec ? "[1] Pistol  [2] Primary" : "", VW - 296, VH - 32, 12, "#999", "left");

  // interaction hint
  if (!mine.d) {
    let hint = null;
    for (const [, x, y, rar, grave] of S.cr) if ((x - pred.x) ** 2 + (y - pred.y) ** 2 < 60 * 60) { hint = [`E  ${grave ? "loot grave" : "open crate"}`, RARITY_COL[rar]]; break; }
    if (!hint) MAP.plots.forEach((pl, i) => { if (!hint && (pl.x - pred.x) ** 2 + (pl.y - pred.y) ** 2 < 48 * 48) { const s = S.pl[i]; hint = s === 0 ? [mine.sd ? "E  plant seed" : "No seeds — buy some [B]", "#8f8"] : s === 3 ? ["E  harvest", "#ffd34d"] : ["growing...", "#aaa"]; } });
    if (!hint && MAP.npcs && g.mode !== "royale" && !dlgOpen) for (const n of MAP.npcs) if ((n.x - pred.x) ** 2 + (n.y - pred.y) ** 2 < 70 * 70) { hint = [`E  talk to ${n.name}`, "#e0c0ff"]; break; }
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
  if (!mine || mine.d || chatting || shopOpen || skillsOpen || S.g.ph === "over") { cv.style.cursor = "default"; return; }
  cv.style.cursor = "none";
  const dist = Math.hypot(mouseX - VW / 2, mouseY - VH / 2);
  const gap = 4 + Math.tan(mine.spr) * Math.max(60, dist);
  const col = t - hsT < 0.25 ? "#ff9d2e" : mine.hot ? "#7dffb0" : "#ffffff";
  ctx.strokeStyle = "#000a"; ctx.lineWidth = 4;
  const lines = () => { ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(mouseX + dx * gap, mouseY + dy * gap); ctx.lineTo(mouseX + dx * (gap + 8), mouseY + dy * (gap + 8)); } ctx.stroke(); };
  lines(); ctx.strokeStyle = col; ctx.lineWidth = 2; lines();
  ctx.fillStyle = col; ctx.fillRect(mouseX - 1, mouseY - 1, 2, 2);
  if (t - hsT < 0.25) { ctx.strokeStyle = "#ff9d2e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mouseX - 10, mouseY - 10); ctx.lineTo(mouseX - 4, mouseY - 4); ctx.moveTo(mouseX + 10, mouseY - 10); ctx.lineTo(mouseX + 4, mouseY - 4); ctx.moveTo(mouseX - 10, mouseY + 10); ctx.lineTo(mouseX - 4, mouseY + 4); ctx.moveTo(mouseX + 10, mouseY + 10); ctx.lineTo(mouseX + 4, mouseY + 4); ctx.stroke(); }
  // active reload bar: press R again in the green zone
  if (rel.end) {
    const k = 1 - Math.max(0, rel.end - t) / rel.total;
    const bw = 90, bx = mouseX - bw / 2, by = mouseY + 26;
    ctx.fillStyle = "#000b"; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
    ctx.fillStyle = rel.tried ? "#555" : "#3fbf6f"; ctx.fillRect(bx + bw * 0.45, by, bw * 0.17, 6);
    ctx.fillStyle = "#fff"; ctx.fillRect(bx + bw * Math.min(1, k) - 1, by - 3, 3, 12);
    if (!rel.tried) text("R", bx + bw + 10, by + 3, 11, "#bbb");
  }
}

window.slopDebug = { get S() { return S; }, get me() { return me; }, get MAP() { return MAP; } }; // for tools/ and curious people
requestAnimationFrame(render);
})();
