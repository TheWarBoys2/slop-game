// Browser client, 11-screens: Smaller screens: elements, gun cleaning, hacking, disaster minigames, the bag, the stall, the stock exchange, elections, the bomb, Slop Snap.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- the Thu'um's elements
const ELEM_ICON = { force: "💨", fire: "🔥", frost: "❄", storm: "⚡" };
const ELEMS = Object.fromEntries(Object.entries(DATA.ELEMENTS).map(([k, e]) => { const n = parseInt(e.color.slice(1), 16); return [k, { ...e, hex: n, rgb: `${n >> 16},${(n >> 8) & 255},${n & 255}`, icon: ELEM_ICON[k] }]; }));

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
  laser: ["Power cell", "Safety interlock", "Focusing lens", "Capacitor bank", "Emitter"],
};
const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const escH = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let cl = null;
function openClean() {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine || mine.d || menusOpen()) return;
  const parts = PARTS[mine.w], t = T();
  if (!parts) return pushLim(toasts, { text: mine.w === "sword" ? "It's a sword. Wipe it on your trousers." : "There's nothing on this to strip.", color: "#bbb", t }, 4);
  if (mine.rl > 0) return pushLim(toasts, { text: "Finish reloading first.", color: "#bbb", t }, 4);
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
// ---------------------------------------------------------------- disaster control stations: one minigame per disaster
let fixOpen = false, fx2 = null, fixTimer = 0;
const FIX_HELP = {
  meteor: "Click the meteors on the radar before they reach the valley. Shoot down 7 of 10.",
  flood: "Click the pipes to turn them. Join the inlet on the left to the outlet on the right and the water drains.",
  tornado: "The launcher sweeps round. Fire (click or Space) when it's inside the storm's bearing. 3 hits from 6 rockets break it up.",
  quake: "Hold A and D (or the arrow keys) to keep the needle in the green. Fill the damper bar before time runs out.",
};
function openFix(e) {
  if (e.close) { if (fixOpen) { fixOpen = false; fx2 = null; $("fix").classList.add("hidden"); cancelAnimationFrame(fixTimer); } if (e.why) pushLim(toasts, { text: e.why, color: "#bbb", t: T() }, 4); return; }
  if (cleanOpen) closeClean(true);
  if (hackOpen) closeHack(true);
  fixOpen = true; keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock();
  const t = T();
  fx2 = { kind: e.kind, t0: t, until: t + e.time, time: e.time, sent: false, keys: {} };
  if (e.kind === "meteor") Object.assign(fx2, { n: 10, need: 7, spawned: 0, hits: 0, lost: 0, rocks: [], next: t + 0.8, booms: [] });
  if (e.kind === "flood") Object.assign(fx2, { R: e.R, C: e.C, r0: e.r0, r1: e.r1, g: e.g, rots: e.g.map((c) => c[1]) });
  if (e.kind === "tornado") Object.assign(fx2, { shots: 6, hits: 0, need: 3, ang: 0, spd: 2.2, tgt: Math.random() * 6.28, tv: 0.6, flash: 0, msg: "" });
  if (e.kind === "quake") Object.assign(fx2, { x: 0, v: 0, prog: 0, push: 0 });
  $("fixTitle").textContent = e.title || "Control station";
  $("fixHelp").textContent = FIX_HELP[e.kind] || "";
  $("fix").classList.remove("hidden");
  cancelAnimationFrame(fixTimer); fixLoop();
}
function fixDone(ok) { if (!fx2 || fx2.sent) return; const F = fx2; F.sent = true; setTimeout(() => { if (fx2 === F) openFix({ close: 1 }); }, 3000); send(fx2.kind === "flood" ? { t: "fix", rots: fx2.rots } : { t: "fix", ok }); }
const PIPE_M = [5, 3, 7], rotM = (m, k) => { for (let i = 0; i < (k & 3); i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
function sluiceWet() { // which pipes the water reaches from the inlet
  const { R, C, r0, g, rots } = fx2, mask = (i) => rotM(PIPE_M[g[i][0]], rots[i]), wet = new Set();
  if (!(mask(r0 * C) & 8)) return wet;
  const q = [r0 * C]; wet.add(r0 * C);
  const D = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]];
  while (q.length) { const i = q.shift(), r = Math.floor(i / C), c = i % C, m = mask(i); for (const [b, dr, dc, o] of D) { const a = r + dr, cc = c + dc, j = a * C + cc; if (!(m & b) || a < 0 || a >= R || cc < 0 || cc >= C || wet.has(j) || !(mask(j) & o)) continue; wet.add(j); q.push(j); } }
  return wet;
}
function fixLoop() {
  if (!fixOpen || !fx2) return;
  fixTimer = requestAnimationFrame(fixLoop);
  const cv2 = $("fixCv"), c = cv2.getContext("2d"), W2 = cv2.width, H2 = cv2.height, t = T(), F = fx2;
  const dt = Math.min(0.05, t - (F.last || t)); F.last = t;
  $("fixTime").style.width = Math.max(0, (F.until - t) / F.time * 100) + "%";
  if (t > F.until && !F.sent) { fixDone(false); }
  c.clearRect(0, 0, W2, H2);
  const txt = (s, x, y, size, col, al = "center") => { c.fillStyle = col; c.font = `bold ${size}px sans-serif`; c.textAlign = al; c.textBaseline = "middle"; c.fillText(s, x, y); };
  if (F.kind === "meteor") {
    const cx = W2 / 2, cy = H2 / 2, R = 165;
    c.strokeStyle = "#1f5a3a"; c.lineWidth = 1; for (let r = 40; r <= R; r += 42) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    const sw = t * 2; c.fillStyle = "#2aff9a22"; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, sw, sw + 0.5); c.fill();
    c.fillStyle = "#7dffb0"; c.beginPath(); c.arc(cx, cy, 10, 0, 7); c.fill(); txt("VALLEY", cx, cy + 20, 10, "#7dffb0");
    if (!F.sent && F.spawned < F.n && t > F.next) { F.spawned++; F.next = t + 1.2 + Math.random() * 0.9; const a = Math.random() * 6.28; F.rocks.push({ a, d: R, v: 32 + Math.random() * 22 + F.spawned * 2 }); }
    for (const m of F.rocks) { m.d -= m.v * dt; if (m.d < 12) { m.dead = true; F.lost++; F.booms.push({ x: cx, y: cy, t }); } }
    F.rocks = F.rocks.filter((m) => !m.dead);
    for (const m of F.rocks) { const x = cx + Math.cos(m.a) * m.d, y = cy + Math.sin(m.a) * m.d; c.fillStyle = "#ffb040"; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); c.strokeStyle = "#ff602080"; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(m.a) * 22, y + Math.sin(m.a) * 22); c.stroke(); }
    for (const b of F.booms) { const k = (t - b.t) / 0.4; if (k < 1) { c.strokeStyle = `rgba(255,200,80,${1 - k})`; c.lineWidth = 3; c.beginPath(); c.arc(b.x, b.y, 8 + k * 26, 0, 7); c.stroke(); } }
    txt(`Shot down ${F.hits}/${F.need}`, 12, 16, 15, "#7dffb0", "left"); txt(`Hit the valley: ${F.lost}`, W2 - 12, 16, 15, F.lost ? "#ff8060" : "#aaa", "right");
    if (!F.sent && (F.hits >= F.need || F.lost > F.n - F.need || (F.spawned >= F.n && !F.rocks.length))) fixDone(F.hits >= F.need);
  } else if (F.kind === "flood") {
    const cs = Math.min((W2 - 80) / F.C, (H2 - 20) / F.R), ox = (W2 - cs * F.C) / 2, oy = (H2 - cs * F.R) / 2, wet = sluiceWet();
    F.cell = { cs, ox, oy };
    c.fillStyle = "#3a8ad0"; c.fillRect(0, oy + F.r0 * cs + cs * 0.38, ox, cs * 0.24); txt("IN", ox / 2, oy + F.r0 * cs + cs * 0.2, 11, "#9fe0ff");
    const outWet = wet.has(F.r1 * F.C + F.C - 1) && (rotM(PIPE_M[F.g[F.r1 * F.C + F.C - 1][0]], F.rots[F.r1 * F.C + F.C - 1]) & 2);
    c.fillStyle = outWet ? "#3a8ad0" : "#334"; c.fillRect(ox + cs * F.C, oy + F.r1 * cs + cs * 0.38, ox, cs * 0.24); txt("OUT", W2 - ox / 2, oy + F.r1 * cs + cs * 0.2, 11, "#9fe0ff");
    for (let i = 0; i < F.R * F.C; i++) {
      const r = Math.floor(i / F.C), col = i % F.C, x = ox + col * cs, y = oy + r * cs, m = rotM(PIPE_M[F.g[i][0]], F.rots[i]);
      c.fillStyle = "#18242c"; c.fillRect(x + 2, y + 2, cs - 4, cs - 4);
      c.fillStyle = wet.has(i) ? "#3a8ad0" : "#7a8a96"; const w = cs * 0.24, mid = cs / 2;
      c.fillRect(x + mid - w / 2, y + mid - w / 2, w, w);
      if (m & 1) c.fillRect(x + mid - w / 2, y, w, mid); if (m & 4) c.fillRect(x + mid - w / 2, y + mid, w, mid);
      if (m & 2) c.fillRect(x + mid, y + mid - w / 2, mid, w); if (m & 8) c.fillRect(x, y + mid - w / 2, mid, w);
    }
    if (outWet && !F.sent) { F.flowAt = F.flowAt || t; if (t - F.flowAt > 0.5) fixDone(true); } else if (!outWet) F.flowAt = 0;
    if (outWet) txt("FLOWING! Draining the valley...", W2 / 2, H2 - 8, 14, "#9fe0ff");
  } else if (F.kind === "tornado") {
    const cx = W2 / 2, cy = H2 / 2 + 10, R = 140;
    F.tv += (Math.random() - 0.5) * dt * 3; F.tv = Math.max(-1, Math.min(1, F.tv)); F.tgt += F.tv * dt; F.ang += F.spd * dt;
    const wid = 0.46;
    c.strokeStyle = "#345"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; txt(["E", "SE", "S", "SW", "W", "NW", "N", "NE"][i], cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 16), 10, "#678"); }
    c.fillStyle = "#a0908060"; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, F.tgt - wid / 2, F.tgt + wid / 2); c.fill(); txt("🌪", cx + Math.cos(F.tgt) * (R - 26), cy + Math.sin(F.tgt) * (R - 26), 20, "#ccc");
    c.strokeStyle = F.flash > t ? "#7dffb0" : "#ffd34d"; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(F.ang) * R, cy + Math.sin(F.ang) * R); c.stroke();
    c.fillStyle = "#ffd34d"; c.beginPath(); c.arc(cx, cy, 8, 0, 7); c.fill();
    txt(`Hits ${F.hits}/${F.need}   Rockets left ${F.shots}`, 12, 16, 15, "#9fe0ff", "left"); if (F.msg) txt(F.msg, W2 / 2, H2 - 12, 14, F.flash > t ? "#7dffb0" : "#ff8060");
    F.fire = () => {
      if (F.sent || F.shots <= 0) return; F.shots--;
      const d = Math.atan2(Math.sin(F.ang - F.tgt), Math.cos(F.ang - F.tgt));
      if (Math.abs(d) < wid / 2) { F.hits++; F.flash = T() + 0.4; F.msg = "Direct hit! The cloud's breaking up."; F.spd *= 1.25; sfx("perfect"); } else { F.msg = "Missed. Wait for it..."; sfx("jam"); }
      if (F.hits >= F.need) fixDone(true); else if (F.shots < F.need - F.hits) fixDone(false);
    };
  } else if (F.kind === "quake") {
    const k = F.keys, push = (k.a ? -1 : 0) + (k.d ? 1 : 0);
    F.v += ((Math.random() - 0.5) * 9 + Math.sin(t * 1.7) * 2.2 + push * 6.5) * dt; F.v *= Math.pow(0.5, dt); F.x += F.v * dt;
    if (Math.abs(F.x) > 1) { F.x = Math.sign(F.x); F.v *= -0.3; }
    const ok = Math.abs(F.x) < 0.25;
    F.prog = Math.max(0, Math.min(100, F.prog + (ok ? 9 : -4) * dt));
    const gx = 40, gw = W2 - 80, gy = 150;
    c.fillStyle = "#222c"; c.fillRect(gx, gy, gw, 40); c.fillStyle = "#2a6a3a"; c.fillRect(gx + gw * 0.375, gy, gw * 0.25, 40);
    for (let i = 0; i <= 20; i++) { c.fillStyle = "#567"; c.fillRect(gx + gw * i / 20, gy + 40, 1, i % 5 ? 6 : 12); }
    c.fillStyle = ok ? "#7dffb0" : "#ff8060"; c.fillRect(gx + gw * (F.x + 1) / 2 - 3, gy - 14, 6, 68);
    txt("◀ A", gx, gy - 30, 16, k.a ? "#ffd34d" : "#678", "left"); txt("D ▶", gx + gw, gy - 30, 16, k.d ? "#ffd34d" : "#678", "right");
    c.fillStyle = "#223"; c.fillRect(gx, 260, gw, 18); c.fillStyle = "#9fe0ff"; c.fillRect(gx, 260, gw * F.prog / 100, 18); txt(`Damper ${Math.round(F.prog)}%`, W2 / 2, 300, 15, "#9fe0ff");
    if (F.prog >= 100) fixDone(true);
  }
}
$("fixCv").addEventListener("mousedown", (e) => {
  const F = fx2; if (!F || F.sent) return;
  const cv2 = $("fixCv"), rc = cv2.getBoundingClientRect(), x = (e.clientX - rc.left) * cv2.width / rc.width, y = (e.clientY - rc.top) * cv2.height / rc.height;
  if (F.kind === "meteor") { const cx = cv2.width / 2, cy = cv2.height / 2; const hit = F.rocks.find((m) => Math.hypot(cx + Math.cos(m.a) * m.d - x, cy + Math.sin(m.a) * m.d - y) < 20); if (hit) { hit.dead = true; F.rocks = F.rocks.filter((m) => !m.dead); F.hits++; F.booms.push({ x: cx + Math.cos(hit.a) * hit.d, y: cy + Math.sin(hit.a) * hit.d, t: T() }); sfx("hit"); } }
  if (F.kind === "flood" && F.cell) { const { cs, ox, oy } = F.cell, col = Math.floor((x - ox) / cs), r = Math.floor((y - oy) / cs); if (col >= 0 && col < F.C && r >= 0 && r < F.R) { const i = r * F.C + col; F.rots[i] = (F.rots[i] + (e.button === 2 ? 3 : 1)) % 4; sfx("hit", 0.4); } }
  if (F.kind === "tornado" && F.fire) F.fire();
});
$("fixCv").addEventListener("contextmenu", (e) => e.preventDefault());
function fixKey(e, down) {
  if (!fx2) return;
  const k = e.key.toLowerCase();
  if (down && k === "escape") { send({ t: "fix", cancel: true }); openFix({ close: 1 }); return; }
  if (k === "a" || k === "arrowleft") fx2.keys.a = down;
  if (k === "d" || k === "arrowright") fx2.keys.d = down;
  if (down && k === " " && fx2.kind === "tornado" && fx2.fire) { e.preventDefault(); if (!e.repeat) fx2.fire(); }
}
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

// ---------------------------------------------------------------- the bag (I)
const GEAR_ICON = { head: "⛑", body: "🦺", hands: "🧤", feet: "🥾" };
const SLOT_NAME = { head: "Head", body: "Body", hands: "Hands", feet: "Feet" };
const RAR_COL = RARITY_COL, RAR_NAME = RARITY, GEAR_MULT = DATA.GEAR_RAR;
function gearDesc(g, r = 0) {
  const m = GEAR_MULT[r] || 1, pc = (v) => Math.round(v * (v > 0 ? m : 1) * 100) + "%";
  const out = [];
  if (g.def) out.push(`-${pc(g.def)} damage`); if (g.rad) out.push(`-${pc(g.rad)} radiation`); if (g.speed) out.push(`${g.speed > 0 ? "+" : ""}${pc(g.speed)} speed`);
  if (g.swim) out.push(`+${pc(g.swim)} swim speed`); if (g.reload) out.push(`${pc(g.reload)} faster reloads`); if (g.spread) out.push(`${pc(g.spread)} steadier aim`); if (g.dirt) out.push(`guns get ${pc(g.dirt)} less dirty`);
  return out.join(", ") + (g.desc ? `. ${g.desc}` : "");
}
let invOpen = false;
function toggleInv(force) {
  invOpen = force === undefined ? !invOpen : force;
  if (invOpen) closeScreens(toggleInv);
  $("inv").classList.toggle("hidden", !invOpen);
  if (invOpen) { toggleShop(false); toggleMarket(false); keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); renderInv(); }
}
function renderInv() {
  if (!INV) { $("invBody").innerHTML = `<div class="tag">Nothing yet.</div>`; return; }
  const meter = (lbl, v, col) => `<div class="meter"><b>${lbl}</b><i><s style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></s></i><span>${v}</span></div>`;
  const slots = ["head", "body", "hands", "feet"].map((k) => {
    const g = INV.gear[k], d = g && GEAR[g.id];
    return `<div class="gslot${d ? " on" : ""}" data-slot="${k}" title="${d ? "Click to take it off" : ""}"><small>${SLOT_NAME[k]}</small>${d ? `<b style="color:${RAR_COL[g.r || 0]}">${GEAR_ICON[k]} ${escH(d.name)}</b><small>${escH(gearDesc(d, g.r || 0))}</small>` : `<b class="empty">${GEAR_ICON[k]} nothing</b>`}</div>`;
  }).join("");
  const cells = [];
  for (let i = 0; i < INV.size; i++) {
    const it = INV.bag[i];
    if (!it) { cells.push(`<div class="bslot empty"></div>`); continue; }
    const g = GEAR[it.id], d = ITEMS[it.id];
    const name = g ? g.name : d ? d.name : it.id, icon = g ? GEAR_ICON[g.slot] : d ? d.icon : "?";
    const tip = g ? `${RAR_NAME[it.r || 0]} ${g.name}: ${gearDesc(g, it.r || 0)}. Click to wear it.` : d && d.kind === "seed" ? `${d.name}: ${d.desc} Click to plant these next.` : d ? `${d.name}: ${d.desc || ""}${d.f ? ` Food +${d.f}.` : ""}${d.d ? ` Drink +${d.d}.` : ""}${d.hp ? ` Heals ${d.hp > 500 ? "fully" : d.hp}.` : ""} Click to use.` : "";
    cells.push(`<div class="bslot${d && d.kind === "seed" && INV.sel === d.crop ? " sel" : ""}" data-i="${i}" title="${escH(tip)} Right-click to drop it."><span class="ic">${icon}</span><span class="nm" style="color:${g ? RAR_COL[it.r || 0] : "#eee"}">${escH(name)}</span>${it.n > 1 ? `<span class="ct">${it.n}</span>` : ""}</div>`);
  }
  const mineP = S && S.p.find((q) => q.id === me), mate = mineP && S.p.filter((q) => q.id !== me && !q.d && !q.air).map((q) => [q, Math.hypot(q.x - mineP.x, q.y - mineP.y)]).filter(([, d]) => d < 150).sort((a, b) => a[1] - b[1])[0];
  const giveRow = mate ? `<div class="fine" style="margin-top:6px">Next to <b>${escH(mate[0].n)}</b>: <kbd>Shift</kbd>+click an item to give it. Give gold: ${[10, 50, 100, 500].map((n) => `<button class="tab" data-gold="${n}">${n}g</button>`).join(" ")}</div>` : `<div class="fine" style="margin-top:6px">Stand next to a mate to give them items or gold.</div>`;
  $("invBody").innerHTML = `<div class="invL">${meter("🍞 Food", INV.food, "#d8a050")}${meter("💧 Drink", INV.water, "#5ab0ff")}${meter("☢ Radiation", INV.rad, INV.rad > 50 ? "#e33" : "#9fff60")}<h3>Wearing</h3>${slots}${mechPanel()}</div>` +
    `<div class="invR"><h3>Bag ${INV.bag.length}/${INV.size}</h3><div class="bag">${cells.join("")}</div>${giveRow}<div class="fine">Click to eat, drink, use or wear. Right-click to drop (someone else can pick it up). <kbd>H</kbd> eats or drinks whatever you need most. Cook two turnips at the Hearth [E] for stew. Fill bottles at the lake.</div></div>`;
  for (const el of $("invBody").querySelectorAll(".bslot[data-i]")) {
    el.onclick = (e) => send({ t: "item", a: e.shiftKey ? "give" : "use", i: +el.dataset.i });
    el.oncontextmenu = (e) => { e.preventDefault(); send({ t: "item", a: "drop", i: +el.dataset.i }); };
  }
  for (const el of $("invBody").querySelectorAll("[data-gold]")) el.onclick = () => send({ t: "item", a: "gold", n: +el.dataset.gold });
  for (const el of $("invBody").querySelectorAll(".gslot.on")) el.onclick = () => send({ t: "item", a: "unequip", slot: el.dataset.slot });
}
$("inv").addEventListener("click", (e) => { if (e.target === $("inv")) toggleInv(false); });

// your mech's parts, in the inventory screen
const MECH_SLOT = [["core", "Core", "🔋"], ["legs", "Legs", "🦿"], ["armR", "Right arm (click)", "💪"], ["armL", "Left arm (right-click)", "💪"], ["head", "Head", "⛑"]];
function mechPanel() {
  const mine = S && S.p.find((q) => q.id === me);
  if (!mine || !mine.mc || S.g.mode === "royale") return "";
  const parts = String(mine.mc[0]).split(",");
  if (!parts.some(Boolean) && !INV.bag.some((b) => String(b.id).startsWith("mp_"))) return "";
  const ready = parts[0] && parts[1] && (parts[2] || parts[3]);
  const rows = MECH_SLOT.map(([, lbl, ic], i) => { const d = parts[i] && ITEMS["mp_" + parts[i]]; return `<div class="fine" style="margin:2px 0">${lbl}: ${d ? `<b style="color:#7fdcff">${d.icon} ${escH(d.name)}</b>` : `<span style="color:#888">${ic} nothing</span>`}</div>`; }).join("");
  const state = mine.mc[3] >= 0 ? `Deployed, ${mine.mc[3]}% armour. P drops it back to you.` : mine.mc[1] > 0 ? `Wrecked. Rebuild in ${mine.mc[1]}s (P).` : mine.mc[2] ? "Wrecked. P rebuilds it (costs gold)." : ready ? "Ready. Press P to call it down." : "Not walking yet: it needs a core, legs and an arm.";
  return `<h3>Mech</h3><div class="fine">${state} Click a mech part in your bag to bolt it on.</div>${rows}`;
}
// ---------------------------------------------------------------- crops

// ---------------------------------------------------------------- the produce stall (Old Giles)
let stallOpen = false;
function toggleStall(force) {
  stallOpen = force === undefined ? !stallOpen : force;
  if (stallOpen) closeScreens(toggleStall);
  $("stall").classList.toggle("hidden", !stallOpen);
  if (stallOpen) { toggleShop(false); toggleInv(false); toggleMarket(false); keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); renderStall(); }
}
function myCropPrice(id) {
  const mine = S?.p.find((p) => p.id === me), i = CROP_KEYS.indexOf(id), base = S && S.g.pp ? S.g.pp[i] : CROPS[id].sell;
  return Math.max(1, Math.round(base * (mine && mine.cl === "farmer" ? 1.5 : 1) * (1 + 0.15 * ((mine && mine.hoe) || 0))));
}
let stallSig = "";
function renderStall() {
  if (!stallOpen || !S) return;
  const mine = S.p.find((p) => p.id === me); if (!mine) return;
  const st = MAP.walls.find((w) => w.kind === "stall");
  if (S.g.ph === "night" || !st || (st.x + st.w / 2 - mine.x) ** 2 + (st.y + st.h / 2 - mine.y) ** 2 > 200 * 200) { toggleStall(false); return; }
  const have = (id) => (INV ? INV.bag.filter((b) => b.id === id).reduce((a, b) => a + (b.n || 1), 0) : 0);
  const sig = JSON.stringify([S.g.pp, INV && INV.bag, mine.g]); if (sig === stallSig && $("stallBody").innerHTML) return; stallSig = sig;
  const disc = (mine.cl === "farmer" ? " (farmer's price)" : "");
  const sell = CROP_KEYS.filter((id) => have(id)).map((id) => { const n = have(id), pr = myCropPrice(id);
    return `<tr><td><span class="ic">${CROPS[id].icon}</span> <b>${escH(CROPS[id].name)}</b> x${n}</td><td class="px">${pr}g each</td><td class="btns"><button data-sell="${id}" data-n="1">Sell 1</button><button data-sell="${id}" data-n="${n}">Sell ${n} (${pr * n}g)</button></td></tr>`; }).join("");
  const total = CROP_KEYS.reduce((a, id) => a + have(id) * myCropPrice(id), 0);
  const tm = (c) => { const s2 = 13 * 3 * c.t; return s2 < 60 ? `${Math.round(s2)}s` : `${(s2 / 60).toFixed(1)} min`; };
  const buy = CROP_KEYS.map((id) => { const c = CROPS[id], cost = Math.round(c.seed * SEED_PACK * Math.max(0.2, 1 - (S.g.disc || 0)));
    return `<tr><td><span class="ic">${c.icon}</span> <b>${escH(c.name)}</b><small>${escH(c.desc)}</small></td><td><small>grows in ${tm(c)}${c.regrow ? ", fruits again" : ""}${c.yield ? `, gives ${c.yield}` : ""}</small><small>sells for ~${myCropPrice(id)}g</small></td><td class="btns"><button class="buy" data-buy="${id}"${mine.g < cost ? " disabled" : ""}>${SEED_PACK} seeds · ${cost}g</button></td></tr>`; }).join("");
  $("stallBody").innerHTML = `<div class="tag">"What've you got for me?" You have ${mine.g}g. Prices follow the Farmers' Co-op share price (FARM)${disc}. Flood the market and it drops.</div>` +
    `<h3>Sell</h3>${sell ? `<table class="mkt">${sell}</table><button class="cbtn" id="sellAll">Sell everything you grew (${total}g)</button>` : `<div class="tag">You've nothing he wants. He'll buy anything you've grown.</div>`}` +
    `<h3>Seeds</h3><table class="mkt">${buy}</table><div class="fine">Seeds go in your bag. Click a packet in your bag [I] to choose what you plant next. <kbd>Esc</kbd> to close.</div>`;
  for (const b of $("stallBody").querySelectorAll("[data-sell]")) b.onclick = () => { send({ t: "stall", a: "sell", id: b.dataset.sell, n: +b.dataset.n }); sfx("perfect"); };
  for (const b of $("stallBody").querySelectorAll("[data-buy]")) b.onclick = () => { send({ t: "stall", a: "buy", id: b.dataset.buy }); sfx("click"); };
  if ($("sellAll")) $("sellAll").onclick = () => { send({ t: "stall", a: "sell", id: "*" }); sfx("perfect"); };
}
setInterval(renderStall, 400);
$("stall").addEventListener("click", (e) => { if (e.target === $("stall")) toggleStall(false); });

// ---------------------------------------------------------------- the stock exchange (M)
let mktOpen = false, mkHist = null, mkLastT = 0;
function toggleMarket(force) {
  mktOpen = force === undefined ? !mktOpen : force;
  if (mktOpen) closeScreens(toggleMarket);
  $("market").classList.toggle("hidden", !mktOpen);
  if (mktOpen) { toggleShop(false); toggleInv(false); keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); send({ t: "mkh" }); renderMarket(); }
}
function trackMarket(t) { // keep our own copy of the price history between full refreshes
  if (!S || !S.g.mk || !mkHist || t - mkLastT < 1) return;
  mkLastT = t;
  Object.keys(STOCKS).forEach((s, i) => { const h = mkHist[s] || (mkHist[s] = []); h.push(S.g.mk[i]); if (h.length > 120) h.shift(); });
}
setInterval(() => { trackMarket(T()); if (mktOpen) renderMarket(); }, 1000);
function spark(h, w, h0) {
  if (!h || h.length < 2) return "";
  const lo = Math.min(...h), hi = Math.max(...h), k = hi - lo || 1;
  const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(h0 - (v - lo) / k * (h0 - 2) - 1).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h0}" viewBox="0 0 ${w} ${h0}"><polyline fill="none" stroke="${h[h.length - 1] >= h[0] ? "#7fd34d" : "#ff6060"}" stroke-width="1.6" points="${pts}"/></svg>`;
}
function renderMarket() {
  const mine = S?.p.find((p) => p.id === me);
  if (!S || !S.g.mk) return;
  const syms = Object.keys(STOCKS), sh = (INV && INV.shares) || {}, basis = (INV && INV.basis) || {};
  let worth = 0;
  const rows = syms.map((s, i) => {
    const px = S.g.mk[i], h = mkHist && mkHist[s], ch = h && h.length > 1 ? (px / h[0] - 1) * 100 : 0, n = sh[s] || 0, val = n * px, pl = n ? val - (basis[s] || 0) : 0;
    worth += val;
    return `<tr><td><b>${s}</b><small>${escH(STOCKS[s].name)}</small></td><td>${spark(h, 110, 30)}</td><td class="px">${px.toFixed(2)}g<small style="color:${ch >= 0 ? "#7fd34d" : "#ff6060"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%</small></td>` +
      `<td>${n ? `${n}<small>${Math.round(val)}g <span style="color:${pl >= 0 ? "#7fd34d" : "#ff6060"}">${pl >= 0 ? "+" : ""}${Math.round(pl)}</span></small>` : "<small>-</small>"}</td>` +
      `<td class="btns"><button data-s="${s}" data-n="1">Buy 1</button><button data-s="${s}" data-n="10">Buy 10</button><button data-s="${s}" data-n="-1"${n ? "" : " disabled"}>Sell 1</button><button data-s="${s}" data-n="${-n}"${n ? "" : " disabled"}>Sell all</button></td></tr>`;
  }).join("");
  const news = (S.g.news || []).map(([txt, up]) => `<div class="nw" style="color:${up ? "#7fd34d" : "#ff8080"}">${up ? "▲" : "▼"} ${escH(txt)}</div>`).join("") || `<div class="tag">Quiet day on the exchange.</div>`;
  const M = S.g.mayor && CANDS[S.g.mayor];
  $("marketBody").innerHTML = `<div class="tag">You have ${mine ? mine.g : 0}g. Your shares are worth ${Math.round(worth)}g. Shares pay 1.5% dividends every dawn. Trading fee: ${M && S.g.mayor === "vex" ? "none (Mayor Vex)" : "2%"}, plus a 1% spread. Your own orders move the price as they fill, so you can't sell into a rise you bought.</div>` +
    `<table class="mkt">${rows}</table><h3>Valley news</h3>${news}<div class="fine">Prices react to what happens: kills, harvests, hacks, disasters, elections, bombs. <kbd>M</kbd>/<kbd>Esc</kbd> to close.</div>`;
  for (const b of $("marketBody").querySelectorAll("button[data-s]")) b.onclick = () => { send({ t: "trade", sym: b.dataset.s, n: +b.dataset.n }); sfx("click"); };
}
$("market").addEventListener("click", (e) => { if (e.target === $("market")) toggleMarket(false); });

// ---------------------------------------------------------------- elections


// ---------------------------------------------------------------- the bomb, the bunker, the wasteland
let sirenT = -99, nukeFx = null;
function compass(dx, dy) { const a = Math.atan2(dy, dx); return ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
function drawNukeHud(mine, t) {
  const g = S.g;
  if (g.nuke) {
    const b = MAP.walls.find((w) => w.kind === "bunker"), left = g.nuke[2];
    ctx.fillStyle = `rgba(160,20,10,${0.12 + 0.08 * Math.sin(t * 8)})`; ctx.fillRect(0, 0, VW, VH);
    const ny = Math.max(hudTop + 6, 100); nukeBottom = ny + 60;
    ctx.fillStyle = "#000c"; ctx.beginPath(); ctx.roundRect(VW / 2 - 260, ny, 520, 54, 10); ctx.fill();
    text(`☢ NUCLEAR STRIKE IN ${Math.ceil(left)}s ☢`, VW / 2, ny + 18, 24, Math.floor(t * 4) % 2 ? "#ff4030" : "#ffd34d");
    if (b && mine.air !== 3) { const dx = b.x + b.w / 2 - pred.x, dy = b.y + b.h / 2 - pred.y; text(`Bunker: ${Math.round(Math.hypot(dx, dy) / 10)}m ${compass(dx, dy)}. Press E at the hatch. Or dive deep in the lake.`, VW / 2, ny + 42, 13, "#fff"); }
    else text("You're safe in the bunker. Wait for the blast.", VW / 2, ny + 42, 13, "#9fff60");
  }
  if (mine.air === 3) {
    ctx.fillStyle = "rgba(10,12,8,0.82)"; ctx.fillRect(0, 0, VW, VH);
    text("IN THE BUNKER", VW / 2, VH * 0.42, 32, "#c8d0a0");
    text(g.nuke ? "The hatch is sealed. Wait for the bomb." : "Tinned peaches, a camp bed, a dartboard. Press E to climb out.", VW / 2, VH * 0.42 + 40, 16, "#aab");
  }
  if (nukeFx && t - nukeFx.t < 5) { const k = (t - nukeFx.t) / 5; ctx.fillStyle = `rgba(255,250,230,${(1 - k) ** 1.5})`; ctx.fillRect(0, 0, VW, VH); }
  if (g.waste && mine.air !== 3) { ctx.fillStyle = "rgba(90,110,20,0.08)"; ctx.fillRect(0, 0, VW, VH); }
  if (mine.rad >= 50) { ctx.fillStyle = `rgba(120,255,60,${0.05 + 0.05 * Math.sin(t * 5)})`; ctx.fillRect(0, 0, VW, VH); }
  // the Geiger counter
  if (g.hot && g.hot.length && mine.air !== 3 && actx && Math.random() < hotLevel(pred.x, pred.y, g.hot) * 0.5) sfx("click", 0.4);
}
function hotLevel(x, y, hot) { let v = 0; for (const [hx, hy, r] of hot) { const d = Math.hypot(x - hx, y - hy); if (d < r) v += 1 - d / r; } return Math.min(1, v); }

// ---------------------------------------------------------------- Slop Snap (Y)
let cardsOpen = false, cgState = null, cgStaged = [], cgSel = null;
function toggleCards(force) {
  cardsOpen = force === undefined ? !cardsOpen : force;
  if (cardsOpen) closeScreens(toggleCards);
  $("cards").classList.toggle("hidden", !cardsOpen);
  if (cardsOpen) { toggleShop(false); toggleInv(false); toggleMarket(false); keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); renderCards(); }
}
const CARD_RAR = ["#9a8a70", "#b8b8b8", "#4da6ff", "#c070ff", "#ffc030"];
function snapCard(id, pow, extra = "", attrs = "") {
  const c = CARDS[id] || { name: id, cost: 0, pow: 0, txt: "" };
  return `<div class="sc ${extra}" style="border-color:${CARD_RAR[c.r || 0]}" ${attrs} title="${escH(c.txt)}"><span class="cc">${c.cost}</span><span class="cp">${pow ?? c.pow}</span><b>${escH(c.name)}</b><small>${escH(c.txt)}</small></div>`;
}
function renderCards() {
  if (!cardsOpen) return;
  const body = $("cardsBody");
  if (!cgState) { // the collection and your deck
    const coll = (INV && INV.cards) || {}, deck = (INV && INV.deck) || [];
    const ids = Object.keys(CARDS).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].r - CARDS[b].r);
    const owned = ids.filter((id) => coll[id]).length;
    body.innerHTML = `<h2 style="margin:0;color:#ffd34d">Slop Snap: your collection</h2><div class="tag">${owned}/${ids.length} cards collected. Challenge any townsperson [E] to a game to win theirs. Packs at Vex's store. Click cards to build your deck of 12 (${deck.length} picked; the rest are filled with your best cards).</div>` +
      `<div class="coll">${ids.map((id) => { const n = coll[id] || 0, inDeck = deck.filter((d) => d === id).length; return snapCard(id, null, `${n ? "" : "locked"}${inDeck ? " indeck" : ""}`, `data-id="${id}"`).replace("</div>", "") + `<span class="cn">${n ? `x${n}` : "?"}${inDeck ? ` · ${inDeck} in deck` : ""}</span></div>`; }).join("")}</div>` +
      `<div class="fine"><button class="cbtn alt" id="deckClear">Clear deck</button> <kbd>Y</kbd>/<kbd>Esc</kbd> to close.</div>`;
    for (const el of body.querySelectorAll(".sc[data-id]")) el.onclick = () => {
      const id = el.dataset.id, n = coll[id] || 0; if (!n) return;
      let d = deck.slice(); const have = d.filter((x) => x === id).length;
      if (have < n && d.length < 12) d.push(id); else d = d.filter((x) => x !== id);
      INV.deck = d; send({ t: "cg", a: "deck", ids: d }); renderCards();
    };
    $("deckClear").onclick = () => { INV.deck = []; send({ t: "cg", a: "deck", ids: [] }); renderCards(); };
    return;
  }
  const v = cgState.v, staged = cgStaged;
  const used = staged.reduce((a, [uid]) => { const h = v.hand.find((x) => x[1] === uid); return a + (h ? CARDS[h[0]].cost : 0); }, 0), energy = v.energy - used;
  const lanes = v.lanes.map(([mine, theirs, my, op], l) => {
    const loc = LOCS[v.locs[l]] || {};
    const st = staged.filter((x) => x[1] === l).map(([uid]) => { const h = v.hand.find((x) => x[1] === uid); return h ? snapCard(h[0], null, "staged", `data-unstage="${uid}"`) : ""; }).join("");
    const win = my > op ? "win" : op > my ? "lose" : "";
    return `<div class="lane ${cgSel !== null ? "pick" : ""}" data-l="${l}"><div class="opside">${theirs.map(([id, pw, , on]) => snapCard(id, on ? pw : "?", on ? "" : "hidden")).join("")}</div>` +
      `<div class="loc"><b>${escH(loc.name || "")}</b><small>${escH(loc.txt || "")}</small><div class="score ${win}"><span>${op}</span> vs <span>${my}</span></div></div>` +
      `<div class="myside">${mine.map(([id, pw]) => snapCard(id, pw)).join("")}${st}</div></div>`;
  }).join("");
  const hand = v.hand.filter(([, uid]) => !staged.some((x) => x[0] === uid)).map(([id, uid]) => snapCard(id, null, `${CARDS[id].cost > energy ? "dim" : ""}${cgSel === uid ? " sel" : ""}`, `data-uid="${uid}"`)).join("");
  const over = v.over ? `<div class="cg-over ${v.result}">${v.result === "win" ? "YOU WIN!" : v.result === "draw" ? "A DRAW" : "YOU LOSE"}</div>` : "";
  body.innerHTML = `<div class="cg-head"><b>vs ${escH(cgState.name)}</b>${cgState.stake ? ` · ${cgState.stake}g on it` : ""}<span>Turn ${Math.min(v.turn, v.turns)}/${v.turns} · Energy <b class="en">${energy}</b>/${v.energy} · their hand ${v.opHand}</span></div>` +
    `<div class="lanes">${lanes}</div>${over}<div class="hand">${v.over ? "" : hand}</div>` +
    `<div class="cg-btns">${v.over ? `<button class="cbtn" id="cgClose">Close</button>` : `<button class="cbtn" id="cgEnd">End turn</button><button class="cbtn alt" id="cgUndo">Undo</button><button class="cbtn alt" id="cgFold">Fold</button>`}</div>` +
    `<div class="fine">Click a card, then a lane. Cards are revealed at the end of the turn, yours first. Win 2 of the 3 lanes. ${v.log.length ? "· " + escH(v.log.join(" · ")) : ""}</div>`;
  for (const el of body.querySelectorAll(".hand .sc")) el.onclick = () => { const uid = +el.dataset.uid, h = v.hand.find((x) => x[1] === uid); if (!h || CARDS[h[0]].cost > energy) return; cgSel = cgSel === uid ? null : uid; renderCards(); };
  for (const el of body.querySelectorAll(".lane")) el.onclick = () => { if (cgSel === null) return; cgStaged.push([cgSel, +el.dataset.l]); cgSel = null; sfx("click"); renderCards(); };
  for (const el of body.querySelectorAll("[data-unstage]")) el.onclick = (e) => { e.stopPropagation(); cgStaged = cgStaged.filter((x) => x[0] !== +el.dataset.unstage); renderCards(); };
  if ($("cgEnd")) $("cgEnd").onclick = () => { send({ t: "cg", a: "play", plays: cgStaged }); cgSel = null; sfx("perfect"); };
  if ($("cgUndo")) $("cgUndo").onclick = () => { cgStaged = []; cgSel = null; renderCards(); };
  if ($("cgFold")) $("cgFold").onclick = () => send({ t: "cg", a: "quit" });
  if ($("cgClose")) $("cgClose").onclick = () => { send({ t: "cg", a: "quit" }); cgState = null; toggleCards(false); };
}

