// Browser client, 20-games: every minigame gets the look of the game it borrows from, plus the keys and help it was missing.
// Vex's casino (Yakuza), Slop Snap (Marvel Snap), the stock exchange (GTA V's BAWSAQ), the ballot (Papers, Please),
// the breach (Cyberpunk 2077), control stations (Among Us) and the build bar (Fortnite). Each says how to play the first time.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- "how to play", once
const HOW_TO = {
  casino: "Buy Golden Cases at the counter for spins, then spin the wheel. Some prizes sit you at a table: <kbd>H</kbd> hit, <kbd>S</kbd> stand, <kbd>1</kbd>-<kbd>5</kbd> hold cards in poker, <kbd>Enter</kbd> for the next hand.",
  snap: "Drag a card onto a location (or click the card, then the location). Cards cost energy; you get one more each turn. Everyone reveals at the end of the turn. Win two of the three locations. <kbd>Enter</kbd> ends your turn.",
  market: "Pick how many shares at the top, then Buy or Sell on a row. Click a row for its chart. Shares pay 1.5% every dawn; big orders move the price against you.",
  ballot: "Read the papers, then stamp one choice for each question. <kbd>1</kbd>-<kbd>9</kbd> stamps them too. You can change your mind until dusk, when it's counted.",
  breach: "Pick codes from the lit line. Rows and columns take turns. Line the codes up in the buffer to match a daemon's sequence and it uploads. Point at a code to see which line it opens next.",
};
const seenHow = (id) => { try { return !!localStorage.getItem("slop.how." + id); } catch { return false; } };
function howTo(id, panel) { // a banner at the top of the panel until you say you've got it
  if (!panel || seenHow(id)) { const old = panel && panel.querySelector(".howto"); if (old) old.remove(); return; }
  if (panel.querySelector(".howto")) return;
  const d = document.createElement("div"); d.className = "howto";
  d.innerHTML = `<b>HOW TO PLAY</b><span>${HOW_TO[id]}</span><button>Got it</button>`;
  d.querySelector("button").onclick = (e) => { e.stopPropagation(); try { localStorage.setItem("slop.how." + id, "1"); } catch { } d.remove(); };
  panel.prepend(d);
}
// ---------------------------------------------------------------- Vex's casino (Yakuza)
function casinoDress() { // after renderCasino: key labels on every button
  howTo("casino", $("casino").querySelector(".panel"));
  const KEY = { hit: "H", stand: "S", deal: "Enter", draw: "Enter", leave: "Enter" };
  for (const b of $("cGame").querySelectorAll("button[data-a]")) if (KEY[b.dataset.a]) b.insertAdjacentHTML("beforeend", ` <kbd>${KEY[b.dataset.a]}</kbd>`);
  if (!$("cSpin").querySelector("kbd")) $("cSpin").insertAdjacentHTML("beforeend", " <kbd>Space</kbd>");
  $("cGame").querySelectorAll("#pkCards .card.pick").forEach((c, i) => c.dataset.k = i + 1);
}
function casinoKey(k) {
  const g = casinoState.game, click = (a) => { const b = $("cGame").querySelector(`button[data-a="${a}"]`); if (b) { b.click(); return true; } return false; };
  if (!g) { if (k === " " || k === "enter") { if (!$("cSpin").disabled) $("cSpin").click(); return true; } return false; }
  if (k === "h") return click("hit");
  if (k === "s") return click("stand");
  if (k === "enter" || k === " ") return click("deal") || click("draw") || click("leave");
  if (/^[1-5]$/.test(k) && g.k === "pk" && g.stage === "hold") { const c = $("cGame").querySelector(`#pkCards .card[data-i="${+k - 1}"]`); if (c) c.click(); return true; }
  return false;
}
// ---------------------------------------------------------------- Slop Snap (Marvel Snap)
function snapDress() { // after renderCards
  const body = $("cardsBody"), panel = $("cards").querySelector(".panel");
  panel.classList.toggle("snapmatch", !!cgState);
  if (!cgState) { const o = panel.querySelector(".howto"); if (o) o.remove(); return; }
  howTo("snap", panel);
  const v = cgState.v;
  // what the staged cards would add to each location, before anything reveals
  body.querySelectorAll(".lane").forEach((lane, l) => {
    const add = cgStaged.filter((x) => x[1] === l).reduce((a, [uid]) => { const h = v.hand.find((x) => x[1] === uid); return a + (h ? CARDS[h[0]].pow || 0 : 0); }, 0);
    const mine = lane.querySelector(".score span:last-child");
    if (add && mine) mine.insertAdjacentHTML("afterend", `<i class="proj">+${add}</i>`);
    lane.ondragover = (e) => { e.preventDefault(); lane.classList.add("drop"); };
    lane.ondragleave = () => lane.classList.remove("drop");
    lane.ondrop = (e) => { e.preventDefault(); const uid = +e.dataTransfer.getData("text/plain"); if (!uid && uid !== 0) return; cgStaged.push([uid, l]); cgSel = null; sfx("click"); renderCards(); };
  });
  for (const el of body.querySelectorAll(".hand .sc:not(.dim)")) { el.draggable = true; el.ondragstart = (e) => { e.dataTransfer.setData("text/plain", el.dataset.uid); cgSel = +el.dataset.uid; }; }
  const end = $("cgEnd"); if (end) end.innerHTML = `END TURN<small>${Math.min(v.turn, v.turns)}/${v.turns}</small>`;
}
function snapKey(k) {
  if (!cgState || cgState.v.over) return false;
  if (k === "enter" && $("cgEnd")) { $("cgEnd").click(); return true; }
  if ((k === "backspace" || k === "z") && $("cgUndo")) { $("cgUndo").click(); return true; }
  return false;
}
// ---------------------------------------------------------------- the stock exchange (GTA V's BAWSAQ)
let mkQty = 1, mkSel = null;
function mkMax(sym) { // the most shares your gold buys, counting how your own order pushes the price up
  const mine = S && S.p.find((p) => p.id === me), i = Object.keys(STOCKS).indexOf(sym); if (!mine || i < 0) return 0;
  const px = S.g.mk[i], fee = (S.g.mayor === "vex" ? 0 : 0.02) + 0.01, a = px * 0.00015 / 2 * (1 + fee), b = px * (1 + fee);
  return Math.max(0, Math.min(1000, Math.floor((-b + Math.sqrt(b * b + 4 * a * mine.g)) / (2 * a))));
}
// ---------------------------------------------------------------- the ballot (Papers, Please)
function ballotDress() { // after renderStory
  const box = $("story");
  box.classList.toggle("papers", ballotOpen);
  if (!ballotOpen) return;
  howTo("ballot", box);
  box.querySelectorAll(".st-c").forEach((el, i) => { if (i < 9) el.insertAdjacentHTML("afterbegin", `<kbd class="st-k">${i + 1}</kbd>`); if (el.classList.contains("mine")) el.insertAdjacentHTML("beforeend", `<span class="stamp">VOTED</span>`); });
  if (!box.querySelector(".pp-head")) box.insertAdjacentHTML("afterbegin", `<div class="pp-head">MINISTRY OF ${escH(String(MAP.valley || "the valley").toUpperCase())} · OFFICIAL BALLOT</div>`);
}
function ballotKey(k) {
  if (!/^[1-9]$/.test(k)) return false;
  const el = $("story").querySelectorAll(".st-c")[+k - 1]; if (el) { el.click(); sfx("click"); }
  return true;
}
// ---------------------------------------------------------------- the breach (Cyberpunk 2077)
function hackDress() { // after renderHack: point at a code to see the line it opens next
  howTo("breach", $("hack").querySelector(".panel"));
  const n = hk.picks.length, cells = [...$("hackBody").querySelectorAll(".hk-grid td")];
  for (const td of $("hackBody").querySelectorAll("td.on:not(.used)")) {
    td.onmouseenter = () => { const r = +td.dataset.r, c = +td.dataset.c; for (const x of cells) x.classList.toggle("nx", n % 2 === 0 ? +x.dataset.c === c : +x.dataset.r === r); };
    td.onmouseleave = () => cells.forEach((x) => x.classList.remove("nx"));
  }
}
// ---------------------------------------------------------------- control stations (Among Us)
function fixBanner(ok) {
  const b = document.createElement("div"); b.className = "taskdone" + (ok ? "" : " fail"); b.textContent = ok ? "Task Completed!" : "Task Failed";
  $("fix").querySelector(".panel").appendChild(b);
  setTimeout(() => b.remove(), 2800);
}
// ---------------------------------------------------------------- building (Fortnite)
const PIECE_ICON = { wall: "🧱", spikes: "⚔", turret: "🔫", lamp: "💡" };
let buildWhy = { key: "", why: "" };
function buildCheck(g, mine) { // the server's placement rules, so the ghost goes red (and says why) before you click
  const pc = PIECES[buildKind]; if (!pc) return "Pick a piece";
  const key = `${g.x},${g.y},${buildKind},${mine.g},${S.b.length},${MAP.cv || 0}`; if (key === buildWhy.key) return buildWhy.why;
  const cx = g.x + 20, cy = g.y + 20, inR = (o, r) => Math.hypot(Math.max(g.x, Math.min(o.x, g.x + 40)) - o.x, Math.max(g.y, Math.min(o.y, g.y + 40)) - o.y) < r;
  const hit = (o) => g.x < o.x + o.w && g.x + 40 > o.x && g.y < o.y + o.h && g.y + 40 > o.y;
  const cost = Math.round(pc.cost * Math.max(0.2, 1 - 0.1 * (mine.sk.haggler || 0) - (S.g.disc || 0)));
  let why = "";
  if (Math.hypot(cx - pred.x, cy - pred.y) > 280) why = "Too far away";
  else if (mine.g < cost) why = `Need ${cost - mine.g}g more`;
  else if (S.b.filter((b) => b[6] === me).length >= 25) why = "25 pieces max";
  else if (S.b.some((b) => hit({ x: b[2], y: b[3], w: 40, h: 40 })) || MAP.walls.some((w) => w.w && hit(w))) why = "Something's already there";
  else if ((MAP.plots || []).some((pl) => inR(pl, 30))) why = "Not on the crops";
  else if (MAP.well && inR(MAP.well, 30)) why = "Not on the well";
  else if (pc.solid && S.p.some((q) => !q.d && !q.air && inR(q, 16))) why = "Someone's in the way";
  buildWhy = { key, why };
  return why;
}
function placeBuildBar() { // bottom middle, above any boss bars
  const bb = $("buildBar"), b = (bossSlot ? 40 + bossSlot * 34 : 14) + "px";
  if (bb.style.bottom !== b) bb.style.bottom = b;
}
// ---------------------------------------------------------------- the keys
addEventListener("keydown", (e) => {
  if (!joined || chatting || rebinding || e.repeat) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  const k = e.key.toLowerCase();
  const used = casinoOpen ? casinoKey(k) : cardsOpen && cgState ? snapKey(k) : ballotOpen && !pauseOpen ? ballotKey(k) : false;
  if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
