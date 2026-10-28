// Browser client, 04-menus: Radial menus, the lobby, Vex's Casino, the wardrobe, building, skills and story votes.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- radial menus
// Hold G for the screens, X for the actions; flick the mouse at one and let go (or press its number).
// The old letter keys still work for anyone who learnt them.
const RADIAL = {
  g: [["🎒", "Bag", "I", () => toggleInv()], ["⭐", "Skills", "K", () => toggleSkills()], ["📓", "Journal", "J", () => toggleJournal()], ["🃏", "Cards", "Y", () => { if (!cgState) toggleCards(); }],
      ["📈", "Stock market", "M", () => toggleMarket()], ["👒", "Wardrobe", "V", () => toggleWardrobe()], ["⚙️", "Options", "O", () => toggleOptions()], ["🗺", "Map", ",", () => toggleMap()]],
  x: [["🍞", "Eat or drink", "H", () => send({ t: "item", a: "quick" })], ["💣", "Grenade", "3", () => send({ t: "throw", k: "gren" })], ["🔥", "Molotov", "4", () => send({ t: "throw", k: "molo" })],
      ["🧽", "Clean your gun", "L", () => openClean()], ["🔨", "Build", "C", () => { if (!pred.swim && !flying()) toggleBuild(); }], ["🌀", "Switch shout", "Z", () => send({ t: "elem" })], ["🚽", "Relieve yourself", "", () => send({ t: "go" })], ["🌱", "Hoe out / away", "F", () => send({ t: "hoe" })]],
};
let radial = null;
// one screen at a time: opening any of them closes whichever other one was up
function closeScreens(keep) {
  const list = [[invOpen, toggleInv], [skillsOpen, toggleSkills], [journalOpen, toggleJournal], [mktOpen, toggleMarket], [wardOpen, toggleWardrobe], [optsOpen, toggleOptions],
    [stallOpen, toggleStall], [shopOpen, toggleShop], [casinoOpen, toggleCasino], [ballotOpen, toggleBallot], [cardsOpen && !cgState, toggleCards], [mapOpen, toggleMap]];
  for (const [open, fn] of list) if (open && fn !== keep) fn(false);
}
function openRadial(key) { radial = { key, sel: -1, ax: 0, ay: 0, t0: T() }; keys.clear(); mouseDown = false; }
function pickRadial(i) {
  const r = radial; radial = null;
  if (r && i < 0 && r.key === "x" && T() - r.t0 < 0.25) return send({ t: "go" }); // a quick tap of X still means "I need to go"
  if (!r || i < 0) return;
  const it = RADIAL[r.key][i]; if (it) it[3]();
}
function drawRadial() {
  if (!radial) return;
  const items = RADIAL[radial.key], cx = VW / 2, cy = VH / 2, R = 120, n = items.length;
  ctx.save();
  ctx.fillStyle = "#0005"; ctx.fillRect(0, 0, VW, VH); // dim the busy screen behind it so the wheel reads
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.arc(cx, cy, R + 52, 0, 7); ctx.fill();
  items.forEach(([icon, name, key], i) => {
    const a = i / n * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, on = i === radial.sel;
    ctx.fillStyle = on ? "#ffd34d" : "#2a3423"; ctx.beginPath(); ctx.arc(x, y, on ? 40 : 34, 0, 7); ctx.fill();
    ctx.strokeStyle = on ? "#fff" : "#ffffff40"; ctx.lineWidth = 2; ctx.stroke();
    text(icon, x, y - 6, on ? 24 : 20, "#fff", "center", false);
    text(name, x, y + 20, 11, on ? "#1a1a1a" : "#e8e8d0", "center", false);
    text(String(i + 1), x - 26, y - 24, 11, "#ffd34d");
  });
  const sel = items[radial.sel];
  text(radial.key === "g" ? "SCREENS" : "ACTIONS", cx, cy - 10, 14, "#ffd34d");
  text(sel ? (sel[2] ? `${sel[1]} · also ${sel[2]}` : sel[1]) : "flick to pick, let go", cx, cy + 10, 11, "#ddd");
  ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + radial.ax * 0.6, cy + radial.ay * 0.6); ctx.stroke();
  ctx.restore();
}
// ---------------------------------------------------------------- lobby
let lobbySig = "";
const MODE_INFO = {
  story: ["Hearth Defence: Story", "Hold the Hearth against the dead every night. Somebody poisoned the well, and it's someone different every game. Find the evidence, accuse them, then survive what they raised. Votes, a mayor, a celebrity visit and Dinosaur Day on day 4."],
  endless: ["Hearth Defence: Endless", "No story, no end. A boss every fifth night and Dinosaur Day every week. How long can you last?"],
  royale: ["Royale", "Jump from the balloon, loot up, last farmer standing wins. Friendly fire is very much on."],
  adventure: ["Adventure (RPG)", "No Hearth, no waves. Five towns out past the hedge, each with a notice board of work: monster contracts, gigs, breaches and deliveries. Travel, get paid, level up, then take the Legendary Contract."],
};
const LOBBY_TIPS = [
  "Bug Night: seal the bug holes with explosions (or land a jump-jet mech on one), then kill the Brain Bug and every bug dies with it.",
  "Mechs: click a mech part in your bag to bolt it on, then press P to call your mech down. It repairs itself by the Hearth.",
  "Reloading: press R, then tap R again as the marker crosses the green for an instant, empowered mag.",
  "Natural disasters can be stopped: find the control station on your map and press E at it.",
  "The town votes once a day. Press N to open the ballot any time before dusk.",
  "Hungry or thirsty? You'll eat and drink from your bag on your own when you're running low.",
  "Something broken, or got an idea? Press F8 and tell us. It's saved straight to the host's computer.",
];
let lobbyTip = Math.floor(Math.random() * LOBBY_TIPS.length);
function renderLobby(m, hostId) {
  const inLobby = joined && m.g.ph === "lobby";
  $("lobbyPanel").classList.toggle("hidden", !inLobby);
  if (inLobby && document.pointerLockElement) document.exitPointerLock();
  const mine = m.p.find((p) => p.id === me);
  const ready = m.p.filter((p) => p.rd).length;
  const cd = m.g.cd >= 0 ? `Starting in ${Math.ceil(m.g.cd)}...` : ready ? `${ready}/${m.p.length} ready` : "";
  const sig = JSON.stringify([inLobby, m.g.ph, m.g.mode, m.p.map((p) => [p.id, p.n, p.rd, p.cl]), cd, hostId]);
  if (sig === lobbySig) return;
  lobbySig = sig;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  $("lpTitle").textContent = `${MAP ? MAP.valley : "The valley"} · ${m.p.length} farmer${m.p.length === 1 ? "" : "s"} in the lobby. Nothing you do here earns gold or XP.`;
  const host = hostId === me;
  $("lpModes").innerHTML = Object.entries(MODE_INFO).map(([k, [n, d]]) => `<div class="lp-mode${k === m.g.mode ? " sel" : ""}${host ? " pick" : ""}" data-m="${k}"><b>${n}${k === m.g.mode ? " ✓" : ""}</b>${d}</div>`).join("");
  if (host) for (const el of $("lpModes").querySelectorAll(".lp-mode")) el.onclick = () => send({ t: "mode", m: el.dataset.m });
  $("lpTip").textContent = "Tip: " + LOBBY_TIPS[lobbyTip];
  $("lpList").innerHTML = m.p.map((p) => `<div class="lp-row"><span style="color:${p.c}">${p.id === hostId ? "♛ " : ""}${esc(p.n)}</span><span><span class="${p.rd ? "ok" : "no"}">${p.rd ? "READY" : "not ready"}</span>${host && p.id !== me ? ` <button class="lp-kick" data-kick="${p.id}" title="Kick them out of the game">Kick</button>` : ""}</span></div>`).join("");
  for (const el of $("lpList").querySelectorAll("[data-kick]")) el.onclick = () => { const p = m.p.find((q) => q.id === +el.dataset.kick); if (p && confirm(`Kick ${p.n} out of the game?`)) send({ t: "kick", id: p.id }); };
  $("lpForce").classList.toggle("hidden", !host || m.p.length < 2 || m.g.cd >= 0 || ready === m.p.length);
  $("lpMode").textContent = hostId === me ? "You're the host: click a mode to pick it." : "The host picks the mode.";
  for (const b of [$("readyBtn"), $("overReady")]) { b.classList.toggle("on", !!(mine && mine.rd)); b.textContent = mine && mine.rd ? "Ready! (click to cancel)" : b.id === "readyBtn" ? "Ready" : "Ready for another round"; }
  $("lpCd").textContent = cd;
  $("overReadyInfo").textContent = m.g.ph === "over" ? (m.g.cd >= 0 ? `Everyone's ready. Starting in ${Math.ceil(m.g.cd)}...` : `${ready}/${m.p.length} ready. The next round starts when everyone is.`) : "";
}


// ---------------------------------------------------------------- Vex's Casino
let casinoOpen = false, casinoState = { spins: 0, game: null }, wheelAnim = null, wheelAngle = 0, wantCasino = false, pkHold = [false, false, false, false, false];
const esc2 = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function toggleCasino(force) {
  casinoOpen = force === undefined ? !casinoOpen : force;
  if (casinoOpen) closeScreens(toggleCasino);
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
  if (wardOpen) closeScreens(toggleWardrobe);
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
  return ghost3d || { x: Math.round((pred.x - 20) / 40) * 40, y: Math.round((pred.y - 20) / 40) * 40 };
}

function openChat() { chatting = true; keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); $("chatbox").classList.remove("hidden"); $("chatin").value = ""; $("chatin").focus(); }
$("chatin").addEventListener("blur", () => setTimeout(() => { if (chatting) closeChat(); }, 0)); // click away and the chat box goes, rather than eating every key
function closeChat() { chatting = false; $("chatbox").classList.add("hidden"); $("chatin").blur(); cv.focus(); }
// every counter in town opens this panel: E at Vex's store, Haddock's armoury, the casino or the Hearth itself
function toggleShop(force, sid) {
  shopOpen = force === undefined ? !shopOpen : force;
  if (shopOpen) closeScreens(toggleShop);
  if (sid) { if (sid !== shopSid) shopTab = null; shopSid = sid; }
  $("shop").classList.toggle("hidden", !shopOpen);
  if (shopOpen) { if (casinoOpen) toggleCasino(false); if (wardOpen) toggleWardrobe(false); toggleStall(false); keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); renderShop(true); }
}
let shopTab = null, shopList = [], shopAt = null;
const GUN_TYPES = new Set(DATA.GUN_TYPES);
const SHOP_TABS = [["arms", "Weapons"], ["mods", "Attachments & skins 🔧"], ["gear", "Gear"], ["food", "Food & medicine"], ["gift", "Gifts 💐"], ["veh", "Vehicles 🚁"], ["farm", "Farm & fun"], ["dome", "The Dome"]];
const SHOP_VOICE = { general: "vex", armoury: "haddock", casino: "lou", produce: "giles" };
const SHOP_BLURB = {
  general: "\"Everything a body needs. Mostly tins.\" Open by day.",
  armoury: "\"Sign here. No, there. Don't point that at me.\" Open by day.",
  casino: "\"The house always wins, sweetheart. But it's a lovely house.\" Open all hours.",
  hearth: "Feed it, fix it, and finish the dome before the bombs come.",
};
function shopWallC(sid) { return sid === "hearth" ? MAP && MAP.hearth : MAP && MAP.walls.find((w) => w.kind === "shop" && w.sid === sid); }
let shopSig = "";
function renderShop(force) {
  if (!SHOP) return;
  const mine = S?.p.find((p) => p.id === me);
  const sig = JSON.stringify([shopSid, shopTab, mine && mine.g, mine && mine.we, mine && mine.hoe, mine && mine.wn, mine && mine.wat, mine && mine.wsk, S && S.g.dome, casinoState.spins, INV && INV.bag.length]);
  if (sig === shopSig && !force) return; // only redraw when something changed, so clicks don't land on a vanished button
  shopSig = sig;
  const tabs = SHOP_TABS.filter(([k]) => Object.values(SHOP).some((it) => it.shop === shopSid && (it.cat || "arms") === k));
  if (!tabs.some(([k]) => k === shopTab)) shopTab = tabs[0] ? tabs[0][0] : null;
  $("shopname").textContent = (SHOPS[shopSid] || {}).name || "Shop";
  let top = `<div class="tag">${SHOP_BLURB[shopSid] || ""}</div>`;
  if (shopSid === "hearth" && S && S.g.dome) { const [have, cost] = S.g.dome, k = Math.min(1, have / cost); top += `<div class="dome"><b>Hearth Dome: ${have}/${cost}g</b>${k >= 1 ? " &middot; UP. It will stop one nuke, then drop to half." : S.g.n < 5 ? ` &middot; the radio says the bombs come after day 5` : " &middot; the bombs can fall any night now"}<div class="bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div></div>`; }
  if (shopSid === "casino" && mine) top += `<div class="item tables"><span>🎰 Go to the tables${casinoState.spins ? ` (${casinoState.spins} spin${casinoState.spins > 1 ? "s" : ""} to use)` : ""}: the wheel, blackjack, poker</span><span>›</span></div>`;
  $("shopgold").textContent = mine ? `You have ${mine.g}g${INV ? ` · bag ${INV.bag.length}/${INV.size}` : ""}` : "";
  $("shopitems").innerHTML = top + (tabs.length > 1 ? `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab${k === shopTab ? " on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>` : "");
  for (const b of $("shopitems").querySelectorAll(".tab")) b.onclick = (e) => { e.stopPropagation(); shopTab = b.dataset.tab; renderShop(true); };
  const tb = $("shopitems").querySelector(".tables"); if (tb) tb.onclick = () => { toggleShop(false); wantCasino = false; toggleCasino(true); };
  shopList = Object.keys(SHOP).filter((id) => SHOP[id].shop === shopSid && (SHOP[id].cat || "arms") === shopTab);
  shopList.map((id) => [id, SHOP[id]]).forEach(([id, it], i) => {
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
      else { label = h ? `Upgrade to ${DATA.HOES[h + 1]}: ${3 + 3 * (h + 1)} plots, faster crops, better harvests` : "Hoe: press F to hold it, then click open ground to till new plots"; cost = Math.round(DATA.HOE_COST[h] * disc) + "g"; }
    }
    if (it.cat === "mods" && mine) { // what's already on the gun in your hands
      const on = id.startsWith("att_") ? (mine.wat || "").split(",").includes(id.slice(4)) : mine.wsk === id.slice(5);
      if (!GUN_TYPES.has(mine.w)) label += ` (hold a gun)`; else if (on) { label += ` ✔ on your ${mine.wn}`; cost = "FITTED"; }
    }
    const d = document.createElement("div");
    const price = parseInt(cost, 10); // can't afford it (or it's maxed out): greyed, and the price goes red
    d.className = "item" + (mine && (isNaN(price) || mine.g < price) ? " poor" : "");
    const g = GEAR[id], stat = g ? gearDesc(g) : it.desc || "";
    d.innerHTML = `<span><span class="k">${i < 10 ? (i + 1) % 10 : ""}</span>${ITEMS[id] ? ITEMS[id].icon + " " : g ? GEAR_ICON[g.slot] + " " : ""}${label}${stat ? `<small class="sd">${stat}</small>` : ""}</span><span>${cost}</span>`;
    d.onclick = () => send({ t: "buy", item: id });
    $("shopitems").appendChild(d);
  });
}
$("shop").addEventListener("click", (e) => { if (e.target === $("shop")) toggleShop(false); });
for (const [id, close] of [["inv", () => toggleInv(false)], ["skills", () => toggleSkills(false)], ["journal", () => toggleJournal(false)], ["market", () => toggleMarket(false)], ["stall", () => toggleStall(false)], ["cards", () => { if (!cgState) toggleCards(false); }]])
  $(id).addEventListener("click", (e) => { if (e.target === $(id)) close(); });

// ---------------------------------------------------------------- skills
let skillsOpen = false;
function toggleSkills(force) {
  skillsOpen = force === undefined ? !skillsOpen : force;
  if (skillsOpen) closeScreens(toggleSkills);
  if (skillsOpen) toggleShop(false);
  $("skills").classList.toggle("hidden", !skillsOpen);
  if (skillsOpen) { keys.clear(); mouseDown = false; renderSkills(); }
}
let skillSig = "", skillHover = null;
function renderSkills() {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine) return;
  const sig = JSON.stringify([mine.sk, mine.pts, mine.lv]);
  if (sig === skillSig) return;
  skillSig = sig;
  $("skillpts").textContent = `Level ${mine.lv} · ${mine.pts} skill point${mine.pts === 1 ? "" : "s"} to spend. Your heirs keep everything you learn.`;
  $("skilltrees").innerHTML = TREES.map((tn, ti) => `<div class="tree"><h3>${tn}</h3>` + Object.entries(SKILL_INFO).filter(([, v]) => v[1] === ti).map(([id, [name, , desc, max]]) => {
    const r = mine.sk[id] || 0, can = mine.pts > 0 && r < max;
    return `<div class="skill${can ? " can" : ""}${r ? " has" : ""}" data-s="${id}"><b>${name}</b> <span class="pips">${"★".repeat(r)}${"☆".repeat(max - r)}</span><small>${desc}</small></div>`;
  }).join("") + "</div>").join("");
  for (const el of $("skilltrees").querySelectorAll(".skill")) { el.onclick = () => send({ t: "learn", s: el.dataset.s }); el.onmouseenter = () => { skillHover = el.dataset.s; $("skillnote").innerHTML = skillNote(skillHover, mine); }; }
  $("skillnote").innerHTML = skillHover ? skillNote(skillHover, mine) : "Hover a skill to see what its next rank does.";
}
setInterval(() => { if (skillsOpen) renderSkills(); }, 200);
$("skills").addEventListener("click", (e) => { if (e.target === $("skills")) toggleSkills(false); });

// ---------------------------------------------------------------- story votes
let storySig = "";
// one ballot a day: the day's question (and, on election days, the mayor's race) stays open until dusk.
// Collapsed it's a one-line reminder; N opens it and frees the mouse so you can click.
let ballotOpen = false;
function toggleBallot(force) {
  const has = S && (S.vote || S.g.elec);
  ballotOpen = !has ? false : force === undefined ? !ballotOpen : force;
  if (ballotOpen) closeScreens(toggleBallot);
  if (ballotOpen) { keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); }
  storySig = ""; renderStory();
}
let storyKey = "", storyAt = 0;
setInterval(() => { if (S) renderStory(); }, 1000);
function renderStory() {
  const box = $("story");
  const v = S?.vote, st = S?.story, E = S?.g.elec;
  if (!v && !E && ballotOpen) ballotOpen = false;
  if (!v && !st && !E) { if (storySig) { box.classList.add("hidden"); storySig = ""; } return; }
  // a new story beat shows in full, then shrinks to its title after a while so it stops covering the right of the screen (click it to read it again)
  const sk = st ? st.title + "|" + st.pick : ""; if (sk !== storyKey) { storyKey = sk; storyAt = T(); }
  const brief = !ballotOpen && T() - storyAt > 25;
  const sig = JSON.stringify([v && [v.title, v.votes, Math.ceil(v.left / 5)], st && [st.title, st.pick], E && [E.c, E.v], ballotOpen, brief]);
  if (sig === storySig) return;
  storySig = sig;
  box.classList.remove("hidden");
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tally = (votes, n) => { const counts = Array(n).fill(0); let mine = -1; for (const [pid, i] of Object.entries(votes)) { counts[i]++; if (Number(pid) === me) mine = i; } return [counts, mine]; };
  const left = v ? v.left : E ? E.left : 0, mins = left > 90 ? `${Math.ceil(left / 60)} min` : `${Math.max(0, Math.round(left))}s`;
  let html = st && (!v || st.title !== v.title) ? `<div class="st-h">${esc(st.title)}</div>${st.pick ? `<div class="st-p">${v ? "" : "You chose: "}${esc(st.pick)}</div>` : ""}${brief ? "" : `<div class="st-t">${esc(st.text)}</div>`}` : "";
  if (v || E) {
    const [vc, vm] = v ? tally(v.votes, v.ch.length) : [[], -1], [ec, em] = E ? tally(E.v, E.c.length) : [[], -1];
    const todo = (v && vm < 0) || (E && em < 0);
    if (!ballotOpen) {
      html += `<div class="st-mini${todo ? " todo" : ""}">🗳 <b>${v ? esc(v.title) : "Election"}</b>${E && v ? " + election" : ""} · ${todo ? "you haven't voted" : "voted"} · counted at dusk (${mins}) · <kbd>N</kbd></div>`;
    } else {
      if (v) html += `<div class="st-h">${esc(v.title)} <span>${mins} to dusk</span></div><div class="st-t">${esc(v.text)}</div>` +
        v.ch.map(([label, desc], i) => `<div class="st-c${vm === i ? " mine" : ""}" data-v="${i}"><b>${esc(label)}</b><small>${esc(desc)}</small><span class="st-n">${"●".repeat(vc[i])}</span></div>`).join("");
      if (E) html += `<div class="st-h" style="margin-top:10px">🗳 Election <span>${mins}</span></div><div class="st-t">Pick the mayor of ${esc(MAP.valley || "the valley")} for the next five days.</div>` +
        E.c.map((id, i) => { const C = CANDS[id] || {}; return `<div class="st-c${em === i ? " mine" : ""}${C.posadist ? " posad" : ""}" data-e="${i}"><b>${esc(C.name)}</b><small><i>"${esc(C.slogan)}"</i></small><small>${esc(C.desc)}</small><span class="st-n">${"●".repeat(ec[i])}</span></div>`; }).join("");
      html += `<div class="st-f">Click to vote. You can change your mind until dusk. <kbd>N</kbd>/<kbd>Esc</kbd> to close.</div>`;
    }
  }
  box.innerHTML = html;
  box.classList.toggle("wide", ballotOpen);
  for (const el of box.querySelectorAll("[data-v]")) el.onclick = () => send({ t: "vote", i: Number(el.dataset.v) });
  for (const el of box.querySelectorAll("[data-e]")) el.onclick = () => send({ t: "elect", i: Number(el.dataset.e) });
  const mini = box.querySelector(".st-mini"); if (mini) mini.onclick = (e) => { e.stopPropagation(); toggleBallot(true); };
  const head = box.querySelector(".st-h"); if (head && !ballotOpen) { head.style.cursor = "pointer"; head.title = brief ? "Click to read it again" : ""; head.onclick = () => { storyAt = T(); renderStory(); }; }
}

