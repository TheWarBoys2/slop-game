// Browser client, 21-front: the screens around a match. Joining is Smash Bros' character select (a P1 card that
// shows your farmer as you pick, Enter to go), the lobby is Mario Kart's cup select, the end of a round is Smash's
// results, and the first time something happens a Left 4 Dead instructor hint says what to do about it.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- join (Super Smash Bros. character select)
const CLASS_ICON = { fighter: "🔫", rogue: "🗡", wizard: "🔥", farmer: "🌾", gaffer: "📣" };
const BG_ICON = { soldier: "🎖", farmhand: "🐄", noble: "👑", outlander: "🏕", acolyte: "🕯", urchin: "🐀" };
function drawFace() { // your farmer, roughly as the game draws them
  const c = $("csFace").getContext("2d"), col = choice.color;
  c.clearRect(0, 0, 180, 180);
  c.fillStyle = "#0004"; c.beginPath(); c.ellipse(90, 168, 52, 9, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.roundRect(48, 98, 84, 70, 22); c.fill();
  c.fillStyle = "#f0c8a0"; c.beginPath(); c.arc(90, 76, 38, 0, 7); c.fill();
  c.fillStyle = col; c.globalAlpha = 0.35; c.beginPath(); c.arc(90, 76, 38, 0, 7); c.fill(); c.globalAlpha = 1;
  const eye = (x) => {
    const e = choice.eyes;
    if (e === "googly") { c.fillStyle = "#fff"; c.beginPath(); c.arc(x, 72, 10, 0, 7); c.fill(); c.strokeStyle = "#000"; c.lineWidth = 2; c.stroke(); c.fillStyle = "#000"; c.beginPath(); c.arc(x + (x < 90 ? -3 : 4), 75, 4, 0, 7); c.fill(); }
    else if (e === "sleepy") { c.strokeStyle = "#222"; c.lineWidth = 3; c.beginPath(); c.arc(x, 72, 6, 0.2, Math.PI - 0.2); c.stroke(); }
    else { c.fillStyle = "#222"; c.beginPath(); c.arc(x, 72, 5, 0, 7); c.fill(); }
    if (e === "angry") { c.strokeStyle = "#222"; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 9, x < 90 ? 60 : 66); c.lineTo(x + 9, x < 90 ? 66 : 60); c.stroke(); }
  };
  eye(76); eye(104);
  if (choice.eyes === "shades") { c.fillStyle = "#111"; c.beginPath(); c.roundRect(62, 64, 56, 16, 5); c.fill(); c.fillStyle = "#fff6"; c.fillRect(68, 67, 10, 3); }
  c.strokeStyle = "#5a3a2a"; c.lineWidth = 3; c.beginPath(); c.arc(90, 88, 10, 0.3, Math.PI - 0.3); c.stroke();
  const h = choice.hat;
  if (h === "crown") { c.fillStyle = "#ffd34d"; c.beginPath(); c.moveTo(62, 46); c.lineTo(62, 22); c.lineTo(76, 36); c.lineTo(90, 16); c.lineTo(104, 36); c.lineTo(118, 22); c.lineTo(118, 46); c.closePath(); c.fill(); }
  if (h === "cowboy") { c.fillStyle = "#8a5a2a"; c.beginPath(); c.ellipse(90, 46, 58, 10, 0, 0, 7); c.fill(); c.beginPath(); c.roundRect(64, 14, 52, 34, 10); c.fill(); }
  if (h === "wizard") { c.fillStyle = "#5a3aa0"; c.beginPath(); c.moveTo(56, 48); c.lineTo(96, -4); c.lineTo(124, 48); c.closePath(); c.fill(); c.fillStyle = "#ffd34d"; c.font = "16px sans-serif"; c.fillText("★", 84, 34); }
  if (h === "horns") { c.fillStyle = "#8a9098"; c.beginPath(); c.arc(90, 60, 40, Math.PI, 0); c.fill(); c.fillStyle = "#e8e0d0"; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(90 + s * 34, 44); c.lineTo(90 + s * 58, 18); c.lineTo(90 + s * 40, 54); c.closePath(); c.fill(); } }
  if (h === "flower") { c.fillStyle = "#ff7ab0"; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; c.beginPath(); c.arc(112 + Math.cos(a) * 8, 40 + Math.sin(a) * 8, 6, 0, 7); c.fill(); } c.fillStyle = "#ffd34d"; c.beginPath(); c.arc(112, 40, 5, 0, 7); c.fill(); }
}
function joinRefresh() {
  drawFace();
  const cl = DATA.CLASSES[choice.cls] || {}, bg = DATA.BACKGROUNDS[choice.bg] || {};
  $("csName").textContent = $("name").value.trim() || "Peasant";
  $("csCls").textContent = `${cl.name || ""} · ${bg.name || ""}`;
  $("clsInfo").innerHTML = `<b>${CLASS_ICON[choice.cls] || ""} ${escH(cl.name || "")}</b> ${escH(cl.desc || "")}`;
  $("bgInfo").innerHTML = `<b>${BG_ICON[choice.bg] || ""} ${escH(bg.name || "")}</b> ${escH(bg.desc || "")}`;
  $("csFace").parentElement.style.setProperty("--pc", choice.color);
}
for (const [box, icons] of [[$("classes"), CLASS_ICON], [$("bgs"), BG_ICON]]) for (const d of box.children) d.insertAdjacentHTML("afterbegin", `<i class="cs-ic">${icons[d.dataset.v] || "❔"}</i>`);
$("join").addEventListener("click", () => setTimeout(joinRefresh, 0));
$("name").addEventListener("input", joinRefresh);
if (saved.name) $("csTag").textContent = `Welcome back, ${saved.name}. Everything's as you left it: press Enter to go.`;
addEventListener("keydown", (e) => { // Enter from anywhere on the select screen, not just the name box
  if (joined || $("join").classList.contains("hidden") || e.key !== "Enter" || document.activeElement === $("name")) return;
  e.preventDefault(); $("go").click();
});
joinRefresh();
// ---------------------------------------------------------------- lobby (Mario Kart's cup select)
const GAME_MODE_ICON = { story: "🔥", endless: "♾", royale: "🎈", adventure: "🗺" };
addEventListener("keydown", (e) => { // the host flips through modes with the arrow keys
  if (!joined || !S || S.g.ph !== "lobby" || lobbyHost !== me || chatting || optsOpen || !/^Arrow(Left|Right)$/.test(e.key)) return;
  const ks = Object.keys(MODE_INFO), i = ks.indexOf(S.g.mode);
  send({ t: "mode", m: ks[(i + (e.key === "ArrowRight" ? 1 : -1) + ks.length) % ks.length] }); sfx("click");
});
// ---------------------------------------------------------------- end of a round (Smash Bros' results)
const ORD = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
function overDress(rows, royale, win) {
  $("over").dataset.res = royale ? "royale" : win ? "win" : "lose";
  const top = rows.slice(0, 4);
  $("overPodium").innerHTML = top.map((r, i) => {
    const place = royale ? r.place : i + 1, stat = royale ? [["Elims", r.pk], ["Dmg", r.dmg]] : [["Kills", r.kills], ["Dmg", r.dmg], ["Crops", r.crops]];
    return `<div class="op-card${i === 0 ? " first" : ""}" style="--pc:${r.color};--d:${i * 0.12}s"><div class="op-place">${ORD(place)}</div><div class="op-name">${escH(r.name)}</div><div class="op-cls">${escH(r.cls || "")}</div>` +
      `<div class="op-stats">${stat.map(([k, v]) => `<span><b>${escH(v ?? 0)}</b>${k}</span>`).join("")}</div><div class="op-rate">${r.rating.toFixed(1)}</div>${i === 0 ? `<div class="op-motm">★ Player of the Match</div>` : ""}</div>`;
  }).join("");
  $("overMore").open = rows.length > 4;
}
// ---------------------------------------------------------------- first-time hints (Left 4 Dead's instructor)
// Once per computer, the first time each thing comes up, a hint pops up over the crosshair with the key to press.
const HINTS = [ // [id, when, icon, text]
  ["start", () => true, "🎒", () => `Hold ${keyFor("wheel")} for your screens and ${keyFor("wheel2")} for actions. Esc pauses.`],
  ["night", (m) => S.g.ph === "night" && ["story", "endless"].includes(S.g.mode), "🔥", () => "Night. The dead go for the Hearth: stay close and keep it standing."],
  ["pts", (m) => m.pts > 0, "⭐", () => `You've a skill point to spend. Press ${keyFor("skills")}.`],
  ["hungry", (m) => (m.fd ?? 100) < 40 || (m.wt ?? 100) < 40, "🍗", () => `Running low. ${keyFor("eat")} eats or drinks the best thing in your bag.`],
  ["dirty", (m) => (m.dirt || 0) >= 45 && PARTS[m.w], "🧽", () => `Your gun's dirty and will start to jam. ${keyFor("clean")} strips and cleans it.`],
  ["loo", (m) => Math.max(m.bl || 0, m.bw || 0) >= 60, "🚽", () => `Nature calls. Tap ${keyFor("wheel2")} to go.`],
  ["ping", (m) => S.p.length > 1 && T() - hintStart > 90, "📍", () => `${keyFor("ping")} or the middle mouse button pings a spot for your mates.`],
  ["map", () => T() - hintStart > 150, "🗺", () => `${keyFor("map")} opens the map. Click it to drop a waypoint.`],
];
let hintNow = null, hintStart = 0;
const hintSeen = (id) => { try { return !!localStorage.getItem("slop.hint." + id); } catch { return true; } };
setInterval(() => {
  const mine = S && joined && S.p.find((p) => p.id === me);
  if (!mine || !["day", "night"].includes(S.g.ph) || !playView || menusOpen() || mine.d || !$("cutscene").classList.contains("hidden")) { if (!mine || S.g.ph === "lobby") hintStart = 0; return; }
  if (!hintStart) hintStart = T();
  if (hintNow && T() - hintNow.t < 8) return;
  hintNow = null;
  const h = HINTS.find(([id, when]) => !hintSeen(id) && when(mine)); if (!h) return;
  try { localStorage.setItem("slop.hint." + h[0], "1"); } catch { }
  hintNow = { icon: h[2], text: h[3](), t: T() }; sfx("click", 0.5);
}, 1000);
function drawFirstHint(t) {
  if (!hintNow || menusOpen()) return;
  const age = t - hintNow.t; if (age > 8) return;
  const k = Math.min(1, age * 5, (8 - age) * 2), y = VH / 2 - 150 - (1 - k) * 12;
  ctx.globalAlpha = k; ctx.font = "bold 15px sans-serif";
  const w = ctx.measureText(hintNow.text).width + 64, x = VW / 2 - w / 2;
  ctx.fillStyle = "#000c"; ctx.beginPath(); ctx.roundRect(x, y, w, 36, 18); ctx.fill();
  ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(x + 18, y + 18, 13, 0, 7); ctx.fill();
  text(hintNow.icon, x + 18, y + 19, 14, "#000", "center", false); text(hintNow.text, x + 40, y + 18, 15, "#fff", "left");
  ctx.globalAlpha = 1;
}
