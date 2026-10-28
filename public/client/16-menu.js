// Browser client, 16-menu: the Esc menu (Persona 5) and the tab strip that ties every screen together.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- tabs
// Every "your stuff" screen is a tab. Its own key still opens it; once any of them is up, the strip along the top shows
// all of them, Q and E (or the mouse wheel over the strip) flip between them, and Esc backs out to the menu you came from.
const P5_TABS = [ // [id, label, icon, key action, is it open, open/close it, can you open it now]
  ["bag", "Bag", "🎒", "bag", () => invOpen, (on) => toggleInv(on)],
  ["skills", "Skills", "⭐", "skills", () => skillsOpen, (on) => toggleSkills(on)],
  ["journal", "Journal", "📓", "journal", () => journalOpen, (on) => toggleJournal(on)],
  ["market", "Market", "📈", "market", () => mktOpen, (on) => toggleMarket(on)],
  ["cards", "Cards", "🃏", "cards", () => cardsOpen, (on) => toggleCards(on), () => !cgState],
  ["ballot", "Ballot", "🗳", "ballot", () => ballotOpen, (on) => toggleBallot(on), () => S && (S.vote || S.g.elec)],
  ["ward", "Wardrobe", "👒", "ward", () => wardOpen, (on) => toggleWardrobe(on)],
  ["opts", "Options", "⚙", "opts", () => optsOpen, (on) => toggleOptions(on)],
  ["bug", "Ideas & bugs", "🐞", "f8", () => bugOpen, (on) => toggleBug(on)],
];
const tabCan = (tb) => !tb[6] || tb[6]();
const inGameTabs = () => joined && S && S.g.ph !== "lobby" && S.g.ph !== "over" && !(cardsOpen && cgState); // the lobby has its own screen
const openTabNow = () => P5_TABS.find((tb) => tb[4]());
let pauseOpen = false, pauseSel = 0, fromPause = false;
function openTab(id) {
  const tb = P5_TABS.find((x) => x[0] === id); if (!tb || !tabCan(tb)) return;
  if (cardsOpen && cgState) return; // mid-match: finish or forfeit first
  for (const o of P5_TABS) if (o !== tb && o[4]()) o[5](false);
  closeScreens();
  if (pauseOpen) { fromPause = true; showPause(false); }
  tb[5](true);
  drawTabs();
}
function flipTab(dir) {
  const cur = openTabNow(); if (!cur) return;
  const ok = P5_TABS.filter((tb) => tb === cur || tabCan(tb)), i = ok.indexOf(cur);
  openTab(ok[(i + dir + ok.length) % ok.length][0]);
  sfx("whoosh", 0.4);
}
const tabStrip = document.createElement("div");
tabStrip.id = "p5tabs"; tabStrip.className = "hidden";
document.body.appendChild(tabStrip);
let tabSig = "";
function drawTabs() {
  const cur = openTabNow(), show = !!cur && inGameTabs();
  if (!cur) fromPause = false;
  document.body.classList.toggle("p5", show);
  tabStrip.classList.toggle("hidden", !show);
  if (!show) { tabSig = ""; return; }
  const sig = cur[0] + P5_TABS.map(tabCan).join() + keyFor("opts");
  if (sig === tabSig) return; tabSig = sig;
  tabStrip.innerHTML = `<kbd class="p5k">${keyFor("shout")}</kbd>` + P5_TABS.map((tb) => `<button class="p5t${tb === cur ? " on" : ""}${tabCan(tb) ? "" : " off"}" data-tab="${tb[0]}" title="${tb[1]} [${tb[3] === "f8" ? "F8" : keyFor(tb[3])}]"><i>${tb[2]}</i><span>${tb[1]}</span></button>`).join("") + `<kbd class="p5k">${keyFor("use")}</kbd><span class="p5esc">Esc ${fromPause ? "back" : "close"}</span>`;
  for (const b of tabStrip.querySelectorAll("[data-tab]")) b.onclick = (e) => { e.stopPropagation(); b.blur(); openTab(b.dataset.tab); };
}
tabStrip.addEventListener("wheel", (e) => { e.preventDefault(); flipTab(e.deltaY > 0 ? 1 : -1); }, { passive: false });
setInterval(drawTabs, 150); // the screens open from all over the place (keys, the wheel, shops); the strip just follows
// ---------------------------------------------------------------- the Esc menu
const pause = document.createElement("div");
pause.id = "p5menu"; pause.className = "hidden";
document.body.appendChild(pause);
const PAUSE_ITEMS = () => [["resume", "Resume", "▶"], ...P5_TABS.map((tb) => [tb[0], tb[1], tb[2]])];
function showPause(on) {
  pauseOpen = on;
  pause.classList.toggle("hidden", !on);
  if (!on) return;
  closeScreens(); keys.clear(); mouseDown = false; radial = null;
  if (document.pointerLockElement) document.exitPointerLock();
  pauseSel = 0; fromPause = false; renderPause(); sfx("whoosh", 0.5);
}
function renderPause() {
  const mine = S && S.p.find((p) => p.id === me), items = PAUSE_ITEMS();
  const note = { skills: mine && mine.pts ? `${mine.pts} point${mine.pts > 1 ? "s" : ""} to spend` : "", ballot: S && (S.vote || S.g.elec) ? "Vote open" : "Nothing to vote on" };
  pause.innerHTML = `<div class="p5bg"></div><div class="p5title">PAUSE<small>${S && S.g.ph === "night" ? "the dead don't wait" : "the town carries on without you"}</small></div><ul class="p5list">` +
    items.map(([id, label, icon], i) => {
      const tb = P5_TABS.find((x) => x[0] === id), key = !tb ? "Esc" : tb[3] === "f8" ? "F8" : keyFor(tb[3]);
      return `<li class="${i === pauseSel ? "on" : ""}${tb && !tabCan(tb) ? " off" : ""}" data-i="${i}" style="--n:${i}"><b>${icon}</b><span>${label}</span><kbd>${key}</kbd>${note[id] ? `<em>${note[id]}</em>` : ""}</li>`;
    }).join("") + `</ul><div class="p5foot">W/S or the mouse to pick · Enter to open · hold F1 for every key</div>`;
  for (const li of pause.querySelectorAll("li")) {
    li.onmouseenter = () => { if (pauseSel !== +li.dataset.i) { pauseSel = +li.dataset.i; markPause(); } };
    li.onclick = (e) => { e.stopPropagation(); pickPause(+li.dataset.i); };
  }
}
function markPause() { pause.querySelectorAll("li").forEach((li, i) => li.classList.toggle("on", i === pauseSel)); }
function pickPause(i) {
  const [id] = PAUSE_ITEMS()[i] || [];
  if (id === "resume") { showPause(false); lockMouse(); return; }
  if (id) openTab(id);
}
// The browser takes Esc for itself while the mouse is locked: it lets go of the mouse and we never see the key.
// So losing the lock in the middle of play (and not because a screen opened) is the same as pressing Esc.
const canPause = () => joined && S && ["day", "night", "royale"].includes(S.g.ph) && playView && !menusOpen() && !radial && !building && $("cutscene").classList.contains("hidden");
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement) return;
  setTimeout(() => { if (!document.pointerLockElement && canPause()) showPause(true); }, 60);
});
addEventListener("keydown", (e) => {
  if (!joined || chatting || rebinding) return;
  const k = bindKey(e.key.toLowerCase()), typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (pauseOpen) {
    e.preventDefault(); e.stopImmediatePropagation();
    const n = PAUSE_ITEMS().length;
    if (k === "escape") { showPause(false); lockMouse(); }
    else if (k === "w" || k === "arrowup") { pauseSel = (pauseSel + n - 1) % n; markPause(); }
    else if (k === "s" || k === "arrowdown" || k === "tab") { pauseSel = (pauseSel + 1) % n; markPause(); }
    else if (k === "enter" || k === " " || k === "e") pickPause(pauseSel);
    else { const tb = P5_TABS.find((x) => ACT[x[3]] === k); if (tb) openTab(tb[0]); } // a screen's own key goes straight to it
    return;
  }
  const cur = openTabNow();
  if (cur && !typing && inGameTabs()) {
    if (k === "q" || k === "e") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) flipTab(k === "e" ? 1 : -1); return; }
    if (k === "escape" && fromPause) { e.preventDefault(); e.stopImmediatePropagation(); cur[5](false); showPause(true); return; }
  }
  if (cur && k === "escape" && cur[0] === "bug" && fromPause) { e.preventDefault(); e.stopImmediatePropagation(); toggleBug(false); showPause(true); return; }
  if (k === "escape" && !e.repeat && canPause()) { e.preventDefault(); e.stopImmediatePropagation(); showPause(true); }
}, true);
