// Browser client, 03-input: Keyboard and mouse input, and bug reports (F8).
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- input
const keys = new Set();
let mouseDown = false, chatting = false, shopOpen = false, showScores = false;
addEventListener("keydown", (e) => {
  if (e.key === "F1") { e.preventDefault(); if (joined && !e.repeat) showKeySheet(true); return; } // hold for the controls
  if (e.key === "F8") { e.preventDefault(); toggleBug(); return; }
  if (bugOpen) { if (e.key === "Escape") toggleBug(false); return; }
  if (!joined) return;
  if (chatting) {
    if (e.key === "Enter") { const v = $("chatin").value.trim(); if (v) send({ t: "chat", text: v }); closeChat(); }
    else if (e.key === "Escape") closeChat();
    return;
  }
  if (fixOpen) { fixKey(e, true); return; }
  if (cleanOpen || hackOpen) { if (e.key === "Escape") { if (cleanOpen) closeClean(true); else closeHack(true); } return; }
  const k = bindKey(e.key.toLowerCase()); // rebound keys arrive as the key they stand in for
  if (k === "tab") { e.preventDefault(); showScores = true; return; }
  if (k === "enter") { openChat(); e.preventDefault(); return; }
  if (S && S.g.ph === "lobby") { if (k === "f") send({ t: "ready" }); else if (k === "o") toggleOptions(); else if (k === "escape") { if (optsOpen) toggleOptions(false); else closeScreens(); } return; } // the lobby is a screen, not a playground
  if (cardsOpen && k === "escape") { if (cgState && !cgState.v.over) return; toggleCards(false); if (cgState) send({ t: "cg", a: "quit" }); return; }
  if (cardsOpen && cgState) return; // mid-match: the table has your full attention
  if (k === "b") { if (shopOpen) toggleShop(false); else if (inDustC() && S && S.g.mode !== "royale") send({ t: "buyzone" }); else pushLim(toasts, { text: "Shops are places now: Vex's store and Haddock's armoury are just south of the Hearth, the casino's on your map. Walk up and press E.", color: "#ffd34d", t: T() }, 4); return; }
  if (k === "i") { toggleInv(); return; }
  if (k === "m") { toggleMarket(); return; }
  if (k === "y") { if (!cgState) toggleCards(); return; }
  if (k === "escape" && (invOpen || mktOpen || stallOpen)) { toggleInv(false); toggleMarket(false); toggleStall(false); return; }
  if (k === "f" && S && (S.g.ph === "lobby" || S.g.ph === "over")) { send({ t: "ready" }); return; }
  if (k === "f" && !e.repeat) { send({ t: "hoe" }); return; } // hold the hoe (click to till) or put it away
  if (k === "control") { e.preventDefault(); if (!OPTS.crouchHold && !e.repeat) crouchOn = !crouchOn; } // CTRL: crouch on land, dive in water, descend in a helicopter
  else if (e.ctrlKey && k.length === 1) e.preventDefault(); // CTRL+S, CTRL+D and friends shouldn't save the page mid-crouch
  if (k === "c" && !pred.swim && !flying()) { toggleBuild(); return; }
  if (building && /^[1-4]$/.test(k)) { buildKind = Object.keys(PIECES)[Number(k) - 1] || buildKind; renderBuildBar(); return; }
  if (building && k === "escape") { toggleBuild(false); return; }
  if (dlgOpen && /^[0-9]$/.test(k)) { send({ t: "dlg", i: (Number(k) + 9) % 10 }); return; }
  if (k === "escape" && dlgOpen) { send({ t: "dlg", i: -1 }); showDlg({ close: 1 }); return; }
  if (k === "k") { toggleSkills(); return; }
  if (k === "n") { toggleBallot(); return; }
  if (k === "escape" && ballotOpen) { toggleBallot(false); return; }
  if (k === "j") { toggleJournal(); return; }
  if (k === ",") { toggleMap(); return; }
  if (k === "escape" && mapOpen) { toggleMap(false); return; }
  if ((k === "g" || k === "x") && !e.repeat && !menusOpen() && !dlgOpen) { openRadial(k); return; }
  if (radial && /^[1-8]$/.test(k)) { pickRadial(Number(k) - 1); return; }
  if (radial && k === "escape") { radial = null; return; } // changed your mind
  if (k === "v") { toggleWardrobe(); return; }
  if (k === "o") { toggleOptions(); return; }
  if (k === "escape" && optsOpen) { toggleOptions(false); return; }
  if (k === "escape" && (casinoOpen || wardOpen)) { toggleCasino(false); toggleWardrobe(false); return; }
  if (k === "escape") { toggleShop(false); toggleSkills(false); toggleJournal(false); return; }
  if (shopOpen && /^[0-9]$/.test(k)) { const i = (Number(k) + 9) % 10; if (shopList[i]) send({ t: "buy", item: shopList[i] }); return; }
  if (k === "alt" || k === "insert") e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if (k === "h") quickUse();
  if (k === "r") { const mine = S?.p.find((p) => p.id === me); if (mine && mine.rl && !mine.rtr) localReloadTry = T(); send({ t: "reload" }); }
  if (k === "e") send({ t: "use" });
  if (k === "q") send({ t: "shout" });
  if (k === " ") { e.preventDefault(); crouchOn = false; const mine = S?.p.find((p) => p.id === me); if ((mine && mine.air === 1) || (S && S.g.ph === "intro")) send({ t: "dodge" }); } // jump (held); also bails out of the balloon
  if (k === "shift") { send({ t: "dodge" }); localDodge(); }
  if (k === "t") { viewMode = VIEWS[(VIEWS.indexOf(viewMode) + 1) % VIEWS.length]; try { localStorage.setItem("slop-view", viewMode); } catch {} viewT = T(); }
  if (k === "1") send({ t: "swap", i: 0 });
  if (k === "2") send({ t: "swap", i: 1 });
  if (k === "3") send({ t: "throw", k: "gren" });
  if (k === "4") send({ t: "throw", k: "molo" });
  if (k === "z") send({ t: "elem" });
  if (k === "u") doPing();
  if (k === "l") openClean();
  if (k === "p") { const mine = S?.p.find((p) => p.id === me); if (mine && mine.inf !== "keys") send({ t: "mech" }); } // call your mech down
});
addEventListener("keyup", (e) => { if (e.key === "F1") showKeySheet(false); if (fixOpen) fixKey(e, false); const k = bindKey(e.key.toLowerCase()); keys.delete(k); if (radial && radial.key === k) pickRadial(radial.sel); if (k === "alt") e.preventDefault(); if (k === "tab") showScores = false; });
// CTRL is crouch now, and CTRL+W closes a browser tab; ask before leaving mid-game
addEventListener("beforeunload", (e) => { if (joined && S && ["day", "night", "royale"].includes(S.g.ph)) { e.preventDefault(); e.returnValue = ""; } });
addEventListener("blur", () => { showKeySheet(false); radial = null; keys.clear(); mouseDown = false; adsDown = false; showScores = false; });
cv.addEventListener("mousemove", (e) => {
  if (radial) { // steer the wheel instead of the camera
    if (document.pointerLockElement === cv) { radial.ax += e.movementX; radial.ay += e.movementY; const d = Math.hypot(radial.ax, radial.ay); if (d > 120) { radial.ax *= 120 / d; radial.ay *= 120 / d; } }
    else { radial.ax = (e.clientX - innerWidth / 2) / UIS; radial.ay = (e.clientY - innerHeight / 2) / UIS; }
    const items = RADIAL[radial.key], d = Math.hypot(radial.ax, radial.ay);
    radial.sel = d < 28 ? -1 : Math.round(((Math.atan2(radial.ay, radial.ax) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2 / items.length)) % items.length;
    return;
  }
  if (document.pointerLockElement === cv) { const sm = S && S.p.find((q) => q.id === me), sc = sm && sm.w === "sniper" && adsZoom > 1.3; const sens = 0.0024 * OPTS.sens * (sc ? 0.2 : adsZoom > 1.05 ? 0.55 : 1); yaw += e.movementX * sens; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * sens * (OPTS.invert ? -1 : 1))); return; }
});
const menusOpen = () => pauseOpen || mapOpen || fixOpen || dlgOpen || bugOpen || ballotOpen || (S && S.g.ph === "lobby") || cleanOpen || hackOpen || optsOpen || chatting || shopOpen || skillsOpen || casinoOpen || wardOpen || journalOpen || invOpen || mktOpen || cardsOpen || stallOpen || (S && S.g.ph === "over");
// Browsers refuse to re-lock the mouse for about a second after it was released (closing a menu with Esc counts).
// So if a click comes too soon, quietly try again once the browser allows it instead of leaving the mouse stuck.
let lockRetry = 0;
function lockMouse(tries = 0) {
  clearTimeout(lockRetry);
  const again = () => { if (tries < 3) lockRetry = setTimeout(() => { if (document.pointerLockElement !== cv && !menusOpen() && playView) lockMouse(tries + 1); }, 1100); };
  try { const r = cv.requestPointerLock?.(); if (r && r.catch) r.catch(again); } catch { again(); }
}
document.addEventListener("pointerlockerror", () => {});
document.addEventListener("pointerlockchange", () => document.body.classList.toggle("locked", document.pointerLockElement === cv));
cv.addEventListener("mousedown", (e) => {
  if (radial) { if (e.button === 0) pickRadial(radial.sel); else radial = null; return; }
  if (playView && document.pointerLockElement !== cv) { if (e.button === 0 && !menusOpen()) lockMouse(); return; }
  if (building) { if (e.button === 0) { const g = ghostCell(); send({ t: "build", kind: buildKind, x: g.x, y: g.y }); } else toggleBuild(false); return; }
  if (e.button === 0) mouseDown = true;
  if (e.button === 1) { e.preventDefault(); doPing(); } // middle click: ping (Apex)
  if (e.button === 2) adsDown = true;
});
addEventListener("mouseup", (e) => { if (e.button === 2) adsDown = false; else mouseDown = false; });
let wheelT = 0;
cv.addEventListener("wheel", () => { const n = performance.now(); if (n - wheelT < 180) return; wheelT = n; send({ t: "swap" }); }, { passive: true }); // one notch, one swap, however fast the wheel spins
cv.addEventListener("contextmenu", (e) => e.preventDefault());
$("readyBtn").onclick = (e) => { e.target.blur(); send({ t: "ready" }); };
$("lpOpts").onclick = (e) => { e.target.blur(); toggleOptions(true); };
$("lpForce").onclick = (e) => { e.target.blur(); send({ t: "force" }); };
$("lpBug").onclick = (e) => { e.target.blur(); toggleBug(true); };
setInterval(() => { lobbyTip = (lobbyTip + 1) % LOBBY_TIPS.length; if (S && S.g.ph === "lobby") $("lpTip").textContent = "Tip: " + LOBBY_TIPS[lobbyTip]; }, 9000);
// ---------------------------------------------------------------- bug reports (F8)
const recentErrors = [];
addEventListener("error", (e) => { recentErrors.push(`${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`); if (recentErrors.length > 8) recentErrors.shift(); });
addEventListener("unhandledrejection", (e) => { recentErrors.push(`promise: ${e.reason && e.reason.message || e.reason}`); if (recentErrors.length > 8) recentErrors.shift(); });
let bugOpen = false;
function toggleBug(force) {
  bugOpen = force === undefined ? !bugOpen : force;
  $("bug").classList.toggle("hidden", !bugOpen);
  if (bugOpen) { keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); $("bugText").value = ""; setTimeout(() => $("bugText").focus(), 0); }
}
$("bugSend").onclick = () => {
  const text = $("bugText").value.trim();
  if (!text) { $("bugText").focus(); return; }
  if (!joined) { pushLim(toasts, { text: "Join the game first, then report it.", color: "#f88", t: T() }, 4); return; }
  const kind = (document.querySelector('input[name="bugKind"]:checked') || {}).value || "Bug";
  send({ t: "bug", kind, text, errors: kind === "Bug" ? recentErrors.slice(-5) : [], ua: navigator.userAgent }); toggleBug(false);
};
$("bugCancel").onclick = () => toggleBug(false);
$("bug").addEventListener("click", (e) => { if (e.target === $("bug")) toggleBug(false); });
$("overReady").onclick = (e) => { e.target.blur(); send({ t: "ready" }); };
for (const b of document.querySelectorAll(".modeBtns button")) b.onclick = (e) => { e.target.blur(); send({ t: "mode", m: b.dataset.m }); };
