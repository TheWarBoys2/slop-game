// Browser client, 06-ui: Options, dialogue and the journal, and flight sticks and gamepads.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- options
const OPTS = { vol: 1, music: 0.5, sens: 1, fov: 80, invert: false, shake: true, impact: true, voices: true, crouchHold: false, res: 1, fps: false, ui: "auto", hud: 1 };
try { Object.assign(OPTS, JSON.parse(localStorage.getItem("slop-opts") || "{}")); } catch {}
let optsOpen = false;
if (has3d) R3D.setScale(OPTS.res);
cv.style.opacity = OPTS.hud;
function saveOpts() { try { localStorage.setItem("slop-opts", JSON.stringify(OPTS)); } catch {} }
let padView = 0;
function toggleOptions(force) {
  optsOpen = force === undefined ? !optsOpen : force;
  if (optsOpen) closeScreens(toggleOptions);
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
    row("music", "Music", 0, 1.5, 0.05, OPTS.music, pct) +
    row("sens", "Mouse sensitivity", 0.2, 3, 0.05, OPTS.sens, (v) => (+v).toFixed(2) + "x") +
    row("fov", "Field of view", 60, 110, 1, OPTS.fov, (v) => v + "°") +
    row("res", "Resolution (lower = smoother)", 0.5, 1.5, 0.05, OPTS.res, pct) +
    row("ui", "Interface size", 0.75, 1.5, 0.05, OPTS.ui === "auto" ? +UIS.toFixed(2) : OPTS.ui, pct) +
    `<div class="opt"><label><input type="checkbox" id="o-uiauto"${OPTS.ui === "auto" ? " checked" : ""}> Interface size fits the window</label></div>` +
    row("hud", "HUD opacity", 0.4, 1, 0.05, OPTS.hud, pct) +
    `<div class="opt"><label><input type="checkbox" id="o-fps"${OPTS.fps ? " checked" : ""}> Show frames per second</label></div>` +
    `<div class="opt"><label><input type="checkbox" id="o-invert"${OPTS.invert ? " checked" : ""}> Invert mouse Y</label></div>` +
    `<div class="opt"><label><input type="checkbox" id="o-shake"${OPTS.shake ? " checked" : ""}> Screen shake</label></div>` +
    `<div class="opt"><label><input type="checkbox" id="o-impact"${OPTS.impact ? " checked" : ""}> Impact frames (a split-second freeze on big hits)</label></div>` +
    `<div class="opt"><label><input type="checkbox" id="o-voices"${OPTS.voices ? " checked" : ""}> NPC voices (the townsfolk talk out loud)</label></div>` +
    `<div class="opt"><label>View</label><span>${VIEW_NAME[viewMode] || "First person"} (press ${keyFor("view")} to switch)</span></div>` +
    `<div class="opt"><label><input type="checkbox" id="o-crouch"${OPTS.crouchHold ? " checked" : ""}> Hold CTRL to crouch / dive (off: tap CTRL to toggle)</label></div>` +
    `<h3 class="opt-h">Flight stick / gamepad (helicopters)</h3><div class="opt-pad" id="o-pad"></div>` +
    [["pitch", "Pitch (stick forward/back)"], ["roll", "Roll / strafe (stick left/right)"], ["yaw", "Yaw (twist or rudder)"], ["thr", "Collective (throttle: up = climb)"]].map(([k, l]) =>
      `<div class="opt"><label>${l}</label><button class="cbtn alt bind" data-ax="${k}">Axis ${FLY[k]}</button><label class="inv"><input type="checkbox" data-inv="${k}"${FLY.inv[k] ? " checked" : ""}> invert</label><span id="o-ax-${k}"></span></div>`).join("") +
    `<div class="opt-note">Click an axis button, then push that control all the way. Trigger fires the chain gun, button 2 fires rockets, button 3 gets out. Set the throttle to the middle to hover. A standard gamepad needs no setup.</div>` +
    `<h3 class="opt-h">Controls <small>(hold F1 in game to see them)</small></h3><div id="o-controls"></div>`;
  renderControls();
  for (const id of ["vol", "music", "sens", "fov", "res", "ui", "hud"]) {
    const el = $("o-" + id), fmt = id === "vol" || id === "music" || id === "res" || id === "ui" || id === "hud" ? pct : id === "sens" ? (v) => (+v).toFixed(2) + "x" : (v) => v + "°";
    el.oninput = () => { OPTS[id] = +el.value; $("o-" + id + "-v").textContent = fmt(OPTS[id]); saveOpts(); if (id === "vol") sfx("hit"); if (id === "res" && has3d) R3D.setScale(OPTS.res); if (id === "res" || id === "ui") { $("o-uiauto").checked = OPTS.ui === "auto"; resize(); } if (id === "hud") cv.style.opacity = OPTS.hud; };
  $("o-uiauto").onchange = (e) => { OPTS.ui = e.target.checked ? "auto" : +UIS.toFixed(2); saveOpts(); resize(); $("o-ui").value = UIS; $("o-ui-v").textContent = pct(UIS); };
  }
  $("o-fps").onchange = (e) => { OPTS.fps = e.target.checked; saveOpts(); };
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
  $("o-impact").onchange = (e) => { OPTS.impact = e.target.checked; saveOpts(); };
  $("o-crouch").onchange = (e) => { OPTS.crouchHold = e.target.checked; crouchOn = false; saveOpts(); };
  $("o-voices").onchange = (e) => { OPTS.voices = e.target.checked; saveOpts(); if (OPTS.voices) speakNpc("grubb", "\"Splendid. Can you hear me? Splendid.\""); else hush(); };
}
$("options").addEventListener("click", (e) => { if (e.target === $("options")) toggleOptions(false); });

// ---------------------------------------------------------------- dialogue & journal
let dlgOpen = false;
const hearts = (v) => { const n = Math.max(0, Math.min(5, Math.floor(v / 20))); return "♥".repeat(n) + "♡".repeat(5 - n); };
const myLove = (id) => { const mine = S?.p.find((p) => p.id === me); return (mine && mine.lo && mine.lo[id]) || 0; };
const GLYPH_CH = ["☀", "☾", "★", "◆"];
let dlgMismatch = 0, cgMismatch = 0;
function showDlg(e) {
  const box = $("dlg");
  if (e.close) { dlgOpen = false; box.classList.add("hidden"); hush(); return; }
  dlgOpen = true; keys.clear(); mouseDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const love = e.love !== undefined ? `<span class="dl-love">${hearts(e.love)}${e.rel ? ` · ${e.rel === "spouse" ? "married" : "dating"}` : ""}</span>` : "";
  box.innerHTML = `<div class="dl-n">${esc(e.name)} <span>${esc(e.role)}</span>${love}</div><div class="dl-t">${esc(e.text)}</div>` +
    e.opts.map((o, i) => `<div class="dl-o" data-i="${i}"><b>${i < 10 ? (i + 1) % 10 + "." : "·"}</b> ${esc(o)}</div>`).join("") +
    `<div class="dl-x" title="Esc">✕ Walk away <kbd>Esc</kbd></div>`;
  for (const el of box.querySelectorAll(".dl-o")) el.onclick = () => send({ t: "dlg", i: Number(el.dataset.i) });
  box.querySelector(".dl-x").onclick = () => { send({ t: "dlg", i: -1 }); showDlg({ close: 1 }); };
  speakNpc(e.npc, e.text);
  box.classList.remove("hidden");
  sfx("hit");
}
let journalOpen = false;
function toggleJournal(force) {
  journalOpen = force === undefined ? !journalOpen : force;
  if (journalOpen) closeScreens(toggleJournal);
  $("journal").classList.toggle("hidden", !journalOpen);
  if (journalOpen) renderJournal();
}
// Adventure: the jobs the party has on, and a map of the towns
const ADV_ICON = { contract: "🐺", gig: "⚔", hack: "💾", delivery: "📦" };
const advIcon = (q) => (q[9] ? "💀" : ADV_ICON[q[1]] || "❗");
const advWalls = () => MAP._adv || (MAP._adv = MAP.walls.filter((w) => w.kind === "board" || w.kind === "sign")); // cached per map
function renderAdvJournal(mine) {
  const A = S.g.adv, esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const qs = A.q.length ? A.q.map((q) => `<div class="jq"><b>${advIcon(q)} ${esc(q[2])}</b> <span>${q[8]}g</span><small>${esc(q[3])}${q[10] && q[1] === "contract" ? " 🌙" : ""}</small><small style="color:#8a7aa0">${esc(q[11])} (${esc(q[7])})</small></div>`).join("") : `<div class="tag">No jobs on. Every town has a notice board [E] with work on it. The one in ${esc(MAP.valley)} is just north of the Hearth.</div>`;
  // the map: every town, the jobs, and the party
  const xs = [...A.t.map((t) => t[1]), ...A.q.map((q) => q[4]), ...S.p.map((p) => p.x)], ys = [...A.t.map((t) => t[2]), ...A.q.map((q) => q[5]), ...S.p.map((p) => p.y)];
  const x0 = Math.min(...xs) - 900, x1 = Math.max(...xs) + 900, y0 = Math.min(...ys) - 900, y1 = Math.max(...ys) + 900, Wm = 460, k = Wm / Math.max(x1 - x0, y1 - y0), Hm = Math.round((y1 - y0) * k);
  const X = (x) => ((x - x0) * k).toFixed(1), Y = (y) => ((y - y0) * k).toFixed(1);
  let svg = `<svg width="${Wm}" height="${Hm}" style="background:#2d4424;border-radius:8px;display:block;margin:6px auto">`;
  for (const q of A.q) if (q[6]) svg += `<circle cx="${X(q[4])}" cy="${Y(q[5])}" r="${Math.max(6, q[6] * k)}" fill="#ffd34d22" stroke="#ffd34d" stroke-dasharray="3 3"/>`;
  for (const [n, x, y, disc, tier, home] of A.t) {
    svg += `<rect x="${(X(x) - 7)}" y="${(Y(y) - 7)}" width="14" height="14" rx="3" fill="${home ? "#ff8a2a" : disc ? "#ffe9a0" : "#6a7a60"}" stroke="#000"/>`;
    svg += `<text x="${X(x)}" y="${(+Y(y) + 22)}" fill="${disc || home ? "#fff" : "#aab"}" font-size="12" font-weight="bold" text-anchor="middle">${esc(disc || home ? n : n + " ?")}${home ? "" : ` · Lv ${tier * 2}+`}</text>`;
  }
  for (const q of A.q) svg += `<text x="${X(q[4])}" y="${(+Y(q[5]) + 5)}" font-size="15" text-anchor="middle">${advIcon(q)}</text>`;
  for (const p of S.p) if (!p.d) svg += `<circle cx="${X(p.id === me ? pred.x : p.x)}" cy="${Y(p.id === me ? pred.y : p.y)}" r="${p.id === me ? 5 : 4}" fill="${p.id === me ? "#fff" : p.c}" stroke="#000"/>`;
  svg += `<text x="8" y="16" fill="#cfe0b8" font-size="11">N ↑ · you are the white dot · towns you've found are pale gold</text></svg>`;
  const found = A.t.filter((t) => t[3] && !t[5]).length;
  $("journalBody").innerHTML = `<h3>Jobs (${A.q.length})</h3>${qs}<h3>Renown ${A.ren[0]}/${A.ren[1]}</h3><div class="tag">${A.ren[0] >= A.ren[1] ? "The Legendary Contract is up. Follow the 💀." : `Finish ${A.ren[1] - A.ren[0]} more job${A.ren[1] - A.ren[0] === 1 ? "" : "s"} and the Legendary Contract goes up.`} ${found}/${A.t.length - 1} towns found. A town's signpost can take you to any town you've already found (25g).</div><h3>The valley</h3>${svg}`;
}
function renderJournal() {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine) return;
  if (S.g.adv) { renderAdvJournal(mine); hookJournal(); return; }
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
  let war = "";
  if (S.g.dome) { const [h, k] = S.g.dome, left = 5 - S.g.n; war = `<h3>The war</h3><div class="jq${h >= k ? " done" : ""}"><b>Raise the Hearth Dome</b> <span>${h}/${k}g</span><small>${h >= k ? "It's up. Stand inside it (near the Hearth) when the siren goes. Each bomb drains it by half, so keep it topped up." : left > 0 ? `The wireless says the bombs come after day 5 (${left} day${left === 1 ? "" : "s"} from now). No Dome, no Hearth. Pay in at the Hearth [E].` : "The bombs can fall any night now. Pay in at the Hearth [E]. If the siren goes before it's full, get to the bunker or the bottom of the lake."}</small></div>`; }
  $("journalBody").innerHTML = `${war}<h3>Quests</h3>${qs}<h3>Who poisoned the well? Evidence (${S.g.clues.length}/5)</h3>${S.g.solved ? `<div class="tag">Solved. Now survive what they raised.</div>` : S.g.clues.length >= 3 ? `<div class="tag" style="color:#ffd34d">You know enough to accuse someone: talk to them [E]. The suspects are Mayor Grubb, Vex and Morwen. Accuse the wrong one and the real culprit gets bolder. Follow the orange ? if you're stuck.</div>` : `<div class="tag">It's someone different every game. Follow the orange ? to whoever knows something.</div>`}${cl}${lg}`;
  hookJournal();
}
setInterval(() => { if (journalOpen) renderJournal(); }, 500);

let crouchOn = false, crouchEye = 0, lastWet = false;
const crouching = () => OPTS.crouchHold ? keys.has("control") : crouchOn;
function keyMask() {
  if (chatting || shopOpen || skillsOpen || casinoOpen || wardOpen || (S && S.g.ph === "intro")) return 0;
  const mine = S && S.p.find((p) => p.id === me);
  if (mine && mine.go) return 0;
  // infected: forward is P, back is INSERT, left is ALT. There is no right.
  const jump = keys.has(" ") ? 16 : 0;
  if (mine && mine.inf === "keys") return jump | (keys.has("p") ? 1 : 0) | (keys.has("alt") ? 2 : 0) | (keys.has("insert") ? 4 : 0);
  const wet = !!(pred.swim || flying());
  if (wet !== lastWet) { lastWet = wet; crouchOn = false; } // getting in the water or a helicopter stands you up
  const down = crouching();
  return jump | (keys.has("w") ? 1 : 0) | (keys.has("a") ? 2 : 0) | (keys.has("s") ? 4 : 0) | (keys.has("d") ? 8 : 0) | ((down && wet) || (keys.has("c") && flying()) ? 32 : 0) | (down && !wet ? 64 : 0) | (keys.has("shift") ? 128 : 0);
}
const aiming = () => adsDown && !chatting && !shopOpen && !skillsOpen && !building && !casinoOpen && !wardOpen;
let padExit = false;
setInterval(() => {
  if (!joined) return;
  const msg = { t: "in", k: keyMask(), a: aimYaw, f: mouseDown && !chatting && !shopOpen && !skillsOpen && !building && !casinoOpen && !wardOpen, ads: aiming() ? 1 : 0 };
  msg.pt = +aimPitch.toFixed(3); msg.my = +yaw.toFixed(4); // walk by the camera, aim by the crosshair (they differ over the shoulder)
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
setInterval(() => {
  if (!shopOpen) return;
  const w = shopWallC(shopSid);
  if (shopAt) { if (Math.hypot(pred.x - shopAt[0], pred.y - shopAt[1]) > 200) toggleShop(false); else renderShop(); return; } // an Adventure town's merchant or smith
  const buyZone = shopSid === "armoury" && inDustC(); // Dust II's buy menu works anywhere on the map, day or night
  if (!buyZone && w && Math.max(Math.abs(pred.x - (w.x + w.w / 2)) - w.w / 2, Math.abs(pred.y - (w.y + w.h / 2)) - w.h / 2) > 150) return toggleShop(false); // walked off
  if (!buyZone && S && S.g.ph === "night" && (SHOPS[shopSid] || {}).hours === "day") { toggleShop(false); return pushLim(toasts, { text: "Closing time. Out you go.", color: "#f88", t: T() }, 4); }
  renderShop();
}, 250);

