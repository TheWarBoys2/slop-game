// Browser client, 09-view: Drawing helpers and the 3D view (first and third person).
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- drawing helpers
function smooth(key, x, y, dt) {
  let d = disp.get(key);
  if (!d || Math.hypot(d.x - x, d.y - y) > 200) { d = { x, y }; disp.set(key, d); }
  const k = Math.min(1, dt * 14);
  d.x += (x - d.x) * k; d.y += (y - d.y) * k; d.seen = frameNo;
  return d;
}
const offDuty = (k) => (k.hours === "day" && S.g.ph === "night") || (k.hours === "night" && S.g.ph !== "night"); // shopkeepers go home at night; the club's people only come out then
// where the main quest wants you next (server's pick), at the townsfolk's live positions
function questNpcs() {
  if (!S || !S.g.mq || !S.g.mq.length || !S.np) return [];
  return S.g.mq.map((id) => { const n = S.np.find((q) => q[0] === id); return n && { id, x: n[1], y: n[2] }; }).filter(Boolean);
}
// a compass strip under the clock: N/E/S/W, the Hearth, the shops and the quest
function drawCompass(t) {
  if (!S || !playView || ["lobby", "over", "intro"].includes(S.g.ph)) return;
  const W2 = Math.min(420, VW - 460), cx = VW / 2, y = COMPASS_Y, span = Math.PI * 0.75;
  if (W2 < 160) return;
  // Skyrim: a long dark strip between two thin rules, with a diamond at each end
  const g0 = ctx.createLinearGradient(cx - W2 / 2, 0, cx + W2 / 2, 0); g0.addColorStop(0, "#0000"); g0.addColorStop(0.12, "#000a"); g0.addColorStop(0.88, "#000a"); g0.addColorStop(1, "#0000");
  ctx.fillStyle = g0; ctx.fillRect(cx - W2 / 2, y - 11, W2, 22);
  ctx.strokeStyle = "#d8ccaa99"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - W2 / 2 + 10, y - 11.5); ctx.lineTo(cx + W2 / 2 - 10, y - 11.5); ctx.moveTo(cx - W2 / 2 + 10, y + 11.5); ctx.lineTo(cx + W2 / 2 - 10, y + 11.5); ctx.stroke();
  ctx.fillStyle = "#d8ccaa"; for (const ex of [cx - W2 / 2 + 6, cx + W2 / 2 - 6]) { ctx.beginPath(); ctx.moveTo(ex, y - 6); ctx.lineTo(ex + 4, y); ctx.lineTo(ex, y + 6); ctx.lineTo(ex - 4, y); ctx.fill(); }
  const at = (ang) => { let d = ang - aimYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) > span / 2 ? null : cx + d / (span / 2) * (W2 / 2 - 10); };
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, x = at(a); if (x == null) continue; const lab = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][i]; text(lab, x, y, lab.length === 1 ? 15 : 10, lab === "N" ? "#ff7060" : "#e8dfc4"); }
  const placed = []; // icons in the same direction sit side by side instead of on top of each other
  const mark = (wx, wy, icon, col) => { let x = at(Math.atan2(wy - pred.y, wx - pred.x)); if (x == null) return; for (let i = 0; i < 4 && placed.some((px) => Math.abs(px - x) < 15); i++) x += 15; placed.push(x); text(icon, x, y + 1, 14, col, "center", false); };
  if (S.g.mode !== "royale" && MAP.hearth) mark(MAP.hearth.x + MAP.hearth.w / 2, MAP.hearth.y + MAP.hearth.h / 2, "🔥", "#ff8a2a");
  if (S.g.mode !== "royale") for (const w of MAP.walls) if (w.kind === "shop" && w.sid !== "casino") mark(w.x + w.w / 2, w.y + w.h / 2, w.sid === "armoury" ? "🔫" : w.sid === "club" ? "🪩" : "🛒", "#fff");
  if (S.g.mode !== "royale" && DUSTR) mark(DUSTR.x + DUSTR.w / 2, DUSTR.y + DUSTR.h / 2, "💣", "#e0c080"); // Dust II, out in the desert
  for (const n of questNpcs()) mark(n.x, n.y, "❓", "#ffa020");
  if (S.g.adv) { for (const [, x, y, disc, , home] of S.g.adv.t) if (!home) mark(x, y, disc ? "🏘" : "❔", "#ffe9a0"); for (const q of S.g.adv.q) mark(q[4], q[5], advIcon(q), "#ffd34d"); }
  const boss = S.g.boss && S.z.find((z) => z[0] === S.g.boss); if (boss) mark(boss[2], boss[3], "💀", "#fff");
  if (S.g.moon) moonCompass(mark);
  for (const pg of livePings(T())) { const P = PING[pg.w] || PING.go; mark(pg.x, pg.y, P[0], P[2]); }
  ctx.fillStyle = "#ffd34d"; ctx.fillRect(cx - 1, y - 14, 2, 5);
}
function drawMinimap(mine, t) {
  if (!S || S.g.ph === "lobby" && !S.g.zone) return;
  // GTA San Andreas: a round radar that follows you, north up, with what's off the edge pinned to the rim
  const mw = RADAR_D, mh = RADAR_D, mx = 14, my = 12, k = RADAR_K, rc = [mx + mw / 2, my + mh / 2];
  const ox = pred.x - mw / 2 / k, oy = pred.y - mh / 2 / k;
  ctx.fillStyle = "#000c"; ctx.beginPath(); ctx.arc(rc[0], rc[1], mw / 2 + 4, 0, 7); ctx.fill();
  ctx.fillStyle = "#3a5a2c"; ctx.beginPath(); ctx.arc(rc[0], rc[1], mw / 2, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(rc[0], rc[1], mw / 2, 0, 7); ctx.clip();
  if (ox || oy) { ctx.fillStyle = "#3f6030"; ctx.fillRect(mx + (0 - ox) * k, my + (0 - oy) * k, MAP.W * k, MAP.H * k); ctx.strokeStyle = "#ffe9a066"; ctx.lineWidth = 1; ctx.strokeRect(mx + (0 - ox) * k, my + (0 - oy) * k, MAP.W * k, MAP.H * k); }
  else { ctx.fillStyle = "#3f6030"; ctx.fillRect(mx, my, mw, mh); }
  ctx.fillStyle = "#0006"; for (const w of MAP.walls) if (w.z1 > 0 && w.kind !== "hwall" && w.kind !== "furn" && w.x + w.w > ox && w.x < ox + MAP.W && w.y + w.h > oy && w.y < oy + MAP.H) ctx.fillRect(mx + (w.x - ox) * k, my + (w.y - oy) * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
  for (const w of MAP.walls) if (w.kind === "lake") { ctx.fillStyle = "#2a6a8e"; ctx.fillRect(mx + (w.x - ox) * k, my + (w.y - oy) * k, w.w * k, w.h * k); }
  for (const [hx, hy, hr, lk] of S.g.hot || []) if (!lk) { ctx.fillStyle = "rgba(150,255,60,0.35)"; ctx.beginPath(); ctx.arc(mx + (hx - ox) * k, my + (hy - oy) * k, Math.max(2, hr * k), 0, 7); ctx.fill(); }
  for (const w of MAP.walls) if (w.kind === "bunker") { ctx.fillStyle = S.g.nuke && Math.floor(t * 4) % 2 ? "#ff4030" : "#ffd34d"; ctx.fillRect(mx + (w.x - ox) * k - 1, my + (w.y - oy) * k - 1, w.w * k + 2, w.h * k + 2); }
  if (S.g.mode !== "royale") {
    const h = MAP.hearth; ctx.fillStyle = "#ff8a2a"; ctx.fillRect(mx + (h.x - ox) * k, my + (h.y - oy) * k, h.w * k, h.h * k);
    if (S.g.dome && S.g.dome[0] >= S.g.dome[1]) { ctx.strokeStyle = "#9fe0ffaa"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx + (h.x + h.w / 2 - ox) * k, my + (h.y + h.h / 2 - oy) * k, DOME_R * k, 0, 7); ctx.stroke(); }
    for (const w of MAP.walls) if (w.kind === "shop") text(w.sid === "casino" ? "🎰" : w.sid === "armoury" ? "🔫" : w.sid === "club" ? "🪩" : "🛒", mx + (w.x + w.w / 2 - ox) * k, my + (w.y + w.h / 2 - oy) * k, 11, "#fff", "center", false);
    const st = MAP.walls.find((w) => w.kind === "stall"); if (st) text("🥕", mx + (st.x + st.w / 2 - ox) * k, my + (st.y + st.h / 2 - oy) * k, 10, "#fff", "center", false);
    for (const n of questNpcs()) text("?", mx + (n.x - ox) * k, my + (n.y - oy) * k, 14 + Math.sin(t * 4) * 2, "#ffa020");
  }
  if (S.g.adv) { // Adventure: the towns, the jobs' search areas, and anything you can pick up
    for (const [, x, y, disc, , home] of S.g.adv.t) if (!home) { ctx.fillStyle = disc ? "#ffe9a0" : "#8a9a80"; ctx.fillRect(mx + (x - ox) * k - 5, my + (y - oy) * k - 5, 10, 10); }
    for (const q of S.g.adv.q) { const qx = mx + (q[4] - ox) * k, qy = my + (q[5] - oy) * k; if (q[6]) { ctx.strokeStyle = "#ffd34d"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(qx, qy, Math.max(4, q[6] * k), 0, 7); ctx.stroke(); ctx.setLineDash([]); } text(advIcon(q), qx, qy, 11, "#fff", "center", false); }
    for (const [x, y, kind] of S.g.adv.pts) text(kind ? "📦" : "🔍", mx + (x - ox) * k, my + (y - oy) * k, 9, "#fff", "center", false);
  }
  ctx.save(); ctx.beginPath(); ctx.arc(rc[0], rc[1], mw / 2, 0, 7); ctx.clip();
  if (S.g.zone) {
    const [cx, cy, r, tcx, tcy, tr] = S.g.zone;
    ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.arc(mx + (cx - ox) * k, my + (cy - oy) * k, Math.max(0.5, r * k), 0, 7, true); ctx.fillStyle = "#7828a080"; ctx.fill("evenodd");
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(mx + (tcx - ox) * k, my + (tcy - oy) * k, Math.max(0.5, tr * k), 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  if (S.g.drop && S.g.drop[4] < 1) { const [x0, y0, x1, y1, dk] = S.g.drop; ctx.strokeStyle = "#ffd34d"; ctx.beginPath(); ctx.moveTo(mx + (x0 - ox) * k, my + (y0 - oy) * k); ctx.lineTo(mx + (x1 - ox) * k, my + (y1 - oy) * k); ctx.stroke(); ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(mx + ((x0 + (x1 - x0) * dk) - ox) * k, my + ((y0 + (y1 - y0) * dk) - oy) * k, 3, 0, 7); ctx.fill(); }
  ctx.restore();
  if (MAP.npcs && S.g.mode !== "royale") for (const n of MAP.npcs) { ctx.fillStyle = n.guest ? "#ff8fc8" : "#e0c0ff"; ctx.fillRect(mx + (n.x - ox) * k - 1.5, my + (n.y - oy) * k - 1.5, 3, 3); }
  if (MAP.pitch) { ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 1; ctx.strokeRect(mx + (MAP.pitch.x - ox) * k, my + (MAP.pitch.y - oy) * k, MAP.pitch.w * k, MAP.pitch.h * k); }
  if (S.ball) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(mx + (S.ball[0] - ox) * k, my + (S.ball[1] - oy) * k, 2, 0, 7); ctx.fill(); }
  for (const [, cx2, cy2] of S.ca || []) { ctx.fillStyle = "#7dffb0"; ctx.fillRect(mx + (cx2 - ox) * k - 2, my + (cy2 - oy) * k - 2, 4, 4); }
  if (S.g.dis && S.g.dis.k === "tornado") text("🌪", mx + (S.g.dis.x - ox) * k, my + (S.g.dis.y - oy) * k, 12, "#ccc");
  if (S.g.dis && S.g.dis.st) { const sx = mx + (S.g.dis.st[0] - ox) * k, sy = my + (S.g.dis.st[1] - oy) * k; ctx.fillStyle = Math.floor(T() * 3) % 2 ? "#9fe0ff" : "#ffd34d"; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill(); text("⚠", sx, sy - 9, 11, "#ffd34d"); }
  if (S.g.moon) moonMap(mx, my, ox, oy, k);
  for (const v of S.vh) { ctx.fillStyle = AIR[v[1]] ? "#ffd34d" : "#9fe0ff"; ctx.fillRect(mx + (v[2] - ox) * k - 2, my + (v[3] - oy) * k - 2, 4, 4); }
  for (const p of S.p) {
    if (p.d || p.air === 1 || p.air === 3) continue;
    if (S.g.mode === "royale" && p.id !== me) continue; // no wallhacks in the Royale
    const x = p.id === me ? pred.x : p.x, y = p.id === me ? pred.y : p.y;
    if (p.id === me) continue; // you're the arrow in the middle, drawn last
    ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(mx + (x - ox) * k, my + (y - oy) * k, 3, 0, 7); ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();
  }
  if (S.g.uav) { ctx.fillStyle = "#ff4040"; for (const z of S.z) { const zx = mx + (z[2] - ox) * k, zy = my + (z[3] - oy) * k; if (zx > mx && zy > my && zx < mx + mw && zy < my + mh) ctx.fillRect(zx - 1.5, zy - 1.5, 3, 3); } text(`📡 UAV ${S.g.uav}s`, mx + mw / 2, my + mh - 14, 12, "#7fdcff"); }
  if (S.g.bug) { // Bug Night: every hole, the hive, and (with a Sensor Helm on your mech) every bug
    const sensor = mine.vh && S.vh.some((v) => v[0] === mine.vh && v[1] === "mech" && String(v[10]).endsWith(",sensor"));
    if (sensor) { ctx.fillStyle = "#ffb040"; for (const z of S.z) if ("gpkq".includes(z[1])) ctx.fillRect(mx + (z[2] - ox) * k - 1.5, my + (z[3] - oy) * k - 1.5, 3, 3); }
    for (const [, hx, hy, hp] of S.g.bug.h) { const sx = mx + (hx - ox) * k, sy = my + (hy - oy) * k; if (hp < 0) text("💀", sx, sy, 13, "#c060ff"); else { ctx.strokeStyle = "#c0ff80"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.stroke(); ctx.fillStyle = "#3a2a14"; ctx.fill(); } }
    const bb = S.g.bug.b && S.z.find((z) => z[0] === S.g.bug.b); if (bb) { ctx.fillStyle = "#c060ff"; ctx.beginPath(); ctx.arc(mx + (bb[2] - ox) * k, my + (bb[3] - oy) * k, 5, 0, 7); ctx.fill(); }
  }
  if (S.g.boss) { const bz = S.z.find((z) => z[0] === S.g.boss); if (bz) { ctx.fillStyle = "#f33"; ctx.beginPath(); ctx.arc(mx + (bz[2] - ox) * k, my + (bz[3] - oy) * k, 4, 0, 7); ctx.fill(); } }
  ctx.restore();
  radarRim(mine, rc, mw / 2, ox, oy, k, t);
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
// split a line of HUD text into lines no wider than maxW (bold Trebuchet at this size)
function wrapText(s, size, maxW) {
  ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  if (ctx.measureText(s).width <= maxW) return [s];
  const out = []; let line = "";
  for (const w of String(s).split(" ")) { const tryL = line ? line + " " + w : w; if (line && ctx.measureText(tryL).width > maxW) { out.push(line); line = w; } else line = tryL; }
  if (line) out.push(line);
  return out;
}
// where the story card starts on the right (the feed and banners keep clear of it)
const storyCardOn = () => !$("story").classList.contains("hidden");
const safeW = () => (storyCardOn() ? Math.max(360, VW - 2 * 372) : VW - 80); // widest centred text that misses the story card
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
function rayBox(o, d, b) { // how far along the ray it enters the box (Infinity if it misses)
  let tmin = 0, tmax = Infinity;
  const lo = [b.x, b.y, b.z0 || 0], hi = [b.x + b.w, b.y + b.h, b.z1 ?? 60];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return Infinity; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayWorld(o, d, maxT, skipId, boxesOnly) {
  let best = maxT;
  for (const b of worldBoxes()) if (b.kind !== "lake") best = Math.min(best, rayBox(o, d, b)); // water doesn't stop a bullet or a camera
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
    for (const z of S.z) { const r = ZR[z[1]] || 15; cyl(z[2], z[3], r, z[6] || 0, (z[6] || 0) + r * (ZH[z[1]] || 3.7)); }
    for (const p of S.p) if (p.id !== skipId && !p.d && !p.air) cyl(p.x, p.y, 16, p.z || 0, (p.z || 0) + 56);
  }
  return best;
}
const dirOf = (yw, pt) => [Math.cos(yw) * Math.cos(pt), Math.sin(yw) * Math.cos(pt), Math.sin(pt)];
function render3d(mine, t, dt) {
  ctx.clearRect(0, 0, VW, VH);
  R3D.resize(innerWidth, innerHeight); // the 3D view is in real pixels, the HUD in UI units
  if (document.pointerLockElement === cv && menusOpen()) document.exitPointerLock();
  adsZoom += ((mine && !mine.d && aiming() ? 1.35 : 1) - adsZoom) * Math.min(1, dt * 10);
  const adsK = Math.max(0, (adsZoom - 1) / 0.35), fp = viewMode === "fp";
  crouchEye += ((pred.slide > 0 ? 28 : crouching() && !pred.swim && !flying() ? 20 : 0) - crouchEye) * Math.min(1, dt * 12);
  sprintK += ((pred.sprint && Math.hypot(pred.vx, pred.vy) > 150 ? 1 : 0) - sprintK) * Math.min(1, dt * 8);
  slideK += ((pred.slide > 0 ? 1 : 0) - slideK) * Math.min(1, dt * 10);
  roll += ((pred.wr > 0 && pred.wn ? 0.16 * Math.sign(pred.wn[0] * Math.sin(yaw) - pred.wn[1] * Math.cos(yaw)) : slideK * 0.06) - roll) * Math.min(1, dt * 8); // lean away from the wall you're running on
  landDip -= landDip * Math.min(1, dt * 9); mantleDip -= mantleDip * Math.min(1, dt * 5);
  const eye = { x: pred.x, y: pred.y, z: pred.z + MV.EYE - crouchEye - landDip };
  let cam, ownView = false;
  watcher = null;
  aimYaw = yaw; aimPitch = pitch;
  // the sniper scope: a real zoom with a little sway; the Steady skill and crouching calm it down
  const scoped = !!(mine && !mine.d && !mine.vh && !mine.air && !mine.out && mine.w === "sniper" && adsK > 0.85); // looks through the scope from either view
  scopedNow = scoped;
  if (scoped) { const sw = 0.006 * (1 - 0.25 * ((mine.sk && mine.sk.steady) || 0)) * (mine.cro ? 0.35 : 1); aimYaw += Math.sin(t * 1.3) * sw; aimPitch += Math.sin(t * 1.9 + 1) * sw * 0.7; }
  const third = (tx, ty, tz, dist, side, up) => { // over-the-shoulder camera that doesn't go through walls
    const f = dirOf(yaw, pitch), rx = -Math.sin(yaw), ry = Math.cos(yaw);
    const want = [tx - f[0] * dist + rx * side, ty - f[1] * dist + ry * side, tz - f[2] * dist + up];
    const dv = [want[0] - tx, want[1] - ty, want[2] - tz], L = Math.hypot(...dv) || 1, u = dv.map((v) => v / L);
    const hit = rayWorld([tx, ty, tz], u, L, me);
    const k = Math.max(6, hit - 16);
    const cx = tx + u[0] * k, cy = ty + u[1] * k, lk = MV.lakeAt(MAP.walls, cx, cy);
    return { x: cx, y: cy, z: Math.max(lk ? lk.z0 + 8 : 8, tz + u[2] * k), yaw, pitch, fov: OPTS.fov - 6 - adsK * 20 + sprintK * 6 + slideK * 6, roll: roll * 0.5 };
  };
  if (!mine) { const a = t * 0.04; cam = { x: MAP.W / 2 + Math.cos(a) * 1500, y: MAP.H / 2 + Math.sin(a) * 1200, z: 700, look: [MAP.W / 2, MAP.H / 2, 0], fov: 60 }; } // not joined yet: a slow lap of the valley
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
    for (const z of S.z) { const d2 = far(z[2], z[3]); if (d2) { bd = d2; const r = ZR[z[1]] || 15; best = { x: z[2], y: z[3], z: (z[6] || 0) + r * (ZH[z[1]] || 3.7) * 0.8, who: z[1] === "b" ? "the boss" : "a zombie" }; } }
    if (!best) { const a = t * 0.15; best = { x: pred.x + Math.cos(a) * 320, y: pred.y + Math.sin(a) * 320, z: 60, who: "something in the bushes" }; }
    const w = smooth("watch", best.x, best.y, dt);
    cam = { x: w.x, y: w.y, z: best.z, look: [pred.x, pred.y, pred.z + 30], fov: 70 };
    watcher = { x: w.x, y: w.y, who: best.who };
  } else if ((fp || scoped) && !mine.vh && !mine.air) {
    const bob = pred.gr ? Math.sin(t * 11) * Math.min(1, Math.hypot(pred.vx, pred.vy) / 200) * 1.6 : 0;
    const bob2 = sprintK > 0.3 && pred.gr ? Math.sin(t * 15) * 1.4 * sprintK : 0; // sprinting bounces more
    cam = scoped ? { x: eye.x, y: eye.y, z: eye.z, yaw: aimYaw, pitch: aimPitch, fov: 14 } : { x: eye.x, y: eye.y, z: eye.z + bob + bob2, yaw, pitch: pitch - mantleDip * 0.18, fov: OPTS.fov - adsK * 30 + sprintK * 8 + slideK * 10, roll };
    ownView = true;
  } else {
    const inMech = mine.vh && S.vh.some((v) => v[0] === mine.vh && v[1] === "mech");
    cam = inMech ? third(eye.x, eye.y, eye.z + 90, 270, 0, 60) : mine.vh ? third(eye.x, eye.y, eye.z + 30, 220, 0, 50) : third(eye.x, eye.y, eye.z, 120 - adsK * 50, 30, 14);
    // aim where the crosshair points, not where the camera is
    const d = dirOf(yaw, pitch), hitT = rayWorld([cam.x, cam.y, cam.z], d, 2500, me);
    const px = cam.x + d[0] * hitT, py = cam.y + d[1] * hitT, pz = cam.z + d[2] * hitT;
    aimYaw = Math.atan2(py - eye.y, px - eye.x); aimPitch = Math.atan2(pz - (eye.z - 6), Math.hypot(px - eye.x, py - eye.y));
  }
  punch -= punch * Math.min(1, dt * 14); punchYaw -= punchYaw * Math.min(1, dt * 14); shake *= Math.pow(0.001, dt);
  if (cam.yaw !== undefined && !cam.look) { // recoil kicks the camera; shake rattles it
    const j = OPTS.shake ? shake * 0.0022 : 0;
    cam = { ...cam, yaw: cam.yaw + punchYaw + (Math.random() - 0.5) * j, pitch: cam.pitch + punch + (Math.random() - 0.5) * j };
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
  // expire effects
  for (let i = fx.length - 1; i >= 0; i--) if ((t - fx[i].t0) / fx[i].dur >= 1) fx.splice(i, 1);
  const sl = slashT.get(me), moving = Math.hypot(pred.vx, pred.vy) > 30 && pred.gr;
  const vm = ownView && mine && !mine.d && !scoped ? { type: mine.w, rar: mine.wr, sk: mine.wsk, at: mine.wat, spr: sprintK, sli: slideK, man: mantleDip, rl: mine.rl > 0 && mine.rt ? 1 - mine.rl / mine.rt : 0, show: true, kick: Math.max(0, 1 - (t - lastShotT) / 0.12), bob: moving ? t * 11 : 0, ads: adsK, swing: sl ? Math.min(1, (t - sl) / 0.25) : 1 } : null;
  R3D.frame({ S, MAP, t, dt, me, pred, aimYaw, aimPitch, fp: ownView, cam, fx, messes, hearthHitT, ghost, vm, slashT, nukeFx, cropKeys: CROP_KEYS, domeR: DOME_R });
  if (scoped && ownView) { ctx.save(); ctx.beginPath(); ctx.arc(VW / 2, VH / 2, VH * 0.44, 0, 7); ctx.clip(); } // through the scope, names and labels only show inside the lens
  overlay3d(mine, t, dt); drawPings(t);
  if (scoped && ownView) ctx.restore();
  if (scoped && ownView) { // scope overlay: black outside the lens, fine crosshair inside
    const R = VH * 0.44; tint("scope", 1);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(VW / 2 - R, VH / 2); ctx.lineTo(VW / 2 + R, VH / 2); ctx.moveTo(VW / 2, VH / 2 - R); ctx.lineTo(VW / 2, VH / 2 + R); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(VW / 2 - R, VH / 2); ctx.lineTo(VW / 2 - R * 0.12, VH / 2); ctx.moveTo(VW / 2 + R * 0.12, VH / 2); ctx.lineTo(VW / 2 + R, VH / 2); ctx.moveTo(VW / 2, VH / 2 + R * 0.12); ctx.lineTo(VW / 2, VH / 2 + R); ctx.stroke();
    ctx.fillStyle = "#ff3030"; ctx.beginPath(); ctx.arc(VW / 2, VH / 2, 1.8, 0, 7); ctx.fill();
    if (!mine.cro) text("CTRL to crouch: steadier scope", VW / 2, VH / 2 + R + 18, 12, "#bbb");
  }
  if (t - hurtFlash < 0.3) tint("hurt", 0.5 * (1 - (t - hurtFlash) / 0.3));
  if (t - fogT < 1.2) tint("fog", 0.25 * (1 - (t - fogT) / 1.2));
  drawHud(mine, t); drawHitDirs(t); drawAchievement(t); drawMsgLog();
  drawMinimap(mine, t); drawCompass(t); zombieSounds(t);
  drawCrosshair(mine, t); drawRadial(); // the wheel goes on top of everything
  if (mine && document.pointerLockElement !== cv && !menusOpen() && !radial) { ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 240, VH / 2 + 80, 480, 34, 8); ctx.fill(); text(`Click to look around  ·  ${keyFor("view")} switches view  ·  hold F1 for controls`, VW / 2, VH / 2 + 97, 15, "#ffd34d"); }
  if (t - viewT < 2) text(`${VIEW_NAME[viewMode]}  (${keyFor("view")} to switch)`, VW / 2, Math.max(150, hudTop + 14), 20, "#fff");
  for (const k of disp.keys()) if (disp.get(k).seen < frameNo - 30) disp.delete(k);
  { const n = performance.now(), ft = (n - fpsLast) / 1000; fpsLast = n; if (ft > 0 && ft < 2) fpsAvg += (1 / ft - fpsAvg) * 0.05; }
  if (OPTS.fps) text(`${Math.round(fpsAvg)} fps`, VW - 40, VH - 12, 12, fpsAvg < 30 ? "#ff8080" : "#9f9");
}
let fpsAvg = 60, fpsLast = 0;
let ghost3d = null, scopedNow = false;
// names, health bars, damage numbers and the like, drawn flat over the 3D view
function overlay3d(mine, t, dt) {
  // labels hide behind walls: a quick line-of-sight check from the camera
  const seen = (x, y, z) => { if (!camNow || camNow.x === undefined) return true; const v = [x - camNow.x, y - camNow.y, z - camNow.z], L = Math.hypot(...v); if (L < 1) return true; return rayWorld([camNow.x, camNow.y, camNow.z], v.map((c) => c / L), L, me, true) >= L - 12; };
  const P = (x, y, z) => { const s = project3(x, y, z); return s && s.d < 1500 && seen(x, y, z) ? s : null; };
  // the main quest's next step: a big orange ? you can see from anywhere
  if (S.g.adv) {
    const A = S.g.adv;
    for (const [x, y, kind] of A.pts) { const s = P(x, y, 30); if (s && s.d < 800) text(kind ? "📦" : "🔍", s.x, s.y + Math.sin(t * 3) * 3, 26, "#fff", "center", false); }
    for (const q of A.q) { const s = project3(q[4], q[5], 140); if (s && s.d > 350) { text(advIcon(q), s.x, s.y, 22, "#fff", "center", false); text(`${Math.round(s.d / 10)}m`, s.x, s.y + 18, 11, "#ffd34d"); } } // a waypoint you can see from anywhere
    for (const [id, name] of A.qb) { const z = S.z.find((q) => q[0] === id); if (!z) continue; const s = P(z[2], z[3], (z[6] || 0) + 120); if (s && s.d < 1200) text(name, s.x, s.y, 14, "#ff9060"); }
    for (const w of advWalls()) { const s = P(w.x + w.w / 2, w.y + w.h / 2, w.z1 + 20); if (s && s.d < 700) text(w.kind === "board" ? "Notice board" : "Signpost", s.x, s.y, 13, "#ffe9a0"); }
    for (const [n, x, y, , , home] of A.t) { if (home) continue; const s = project3(x, y, 260); if (s && s.d < 1400 && s.d > 300) text(n, s.x, s.y, 22, "#ffe9a0"); }
  }
  for (const n of questNpcs()) { const s = project3(n.x, n.y, 100); if (!s) continue; const bob = Math.sin(t * 3) * 4; ctx.save(); ctx.shadowColor = "#ff8a00"; ctx.shadowBlur = 18; text("?", s.x, s.y - 16 + bob, 44, "#ffa020"); ctx.restore(); if (s.d > 300) text(`${Math.round(s.d / 10)}m`, s.x, s.y + 14 + bob, 12, "#ffc070"); }
  for (const p of S.p) {
    if (p.d || p.air === 1 || p.air === 3 || p.vh) continue;
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
    if (b && t - b.t < 4.5) { ctx.font = `bold 13px "Trebuchet MS", sans-serif`; const tw = Math.min(260, ctx.measureText(b.text).width + 16); ctx.fillStyle = "#fffe"; ctx.beginPath(); ctx.roundRect(s.x - tw / 2, y - 44, tw, 24, 8); ctx.fill(); text(b.text.length > 36 ? b.text.slice(0, 35) + "…" : b.text, s.x, y - 32, 13, "#222", "center", false); }
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
    if (n.quips && Math.sin(t * 1.3 + n.x) > 0.6) text(n.quips[Math.floor(t / 4.8 + n.x) % n.quips.length], s.x, s.y - 40, 14, "#ff5050");
  }
  if (MAP.keepers) for (const n of MAP.keepers) { if (offDuty(n)) continue; const s = P(n.x, n.y, 72); if (s && s.d < 900) { text(n.name, s.x, s.y, 12, "#ffd34d"); text(n.role, s.x, s.y + 13, 10, "#d8c8a0"); } }
  for (const [, type, zx, zy, hp, , zh] of S.z) {
    if (hp >= 100 || type === "b") continue;
    const r = ZR[type] || 15, s = P(zx, zy, (zh || 0) + r * ((ZH[type] || 3.7) + 0.2));
    if (s && s.d < 900) bar(s.x - 16, s.y, 32, 4, hp / 100, "#e44");
  }
  const hw = MAP.hearth, hs = P(hw.x + hw.w / 2, hw.y + hw.h / 2, 190);
  if (hs && S.g.mode !== "royale") { text("THE HEARTH", hs.x, hs.y - 12, 14, "#ffe9a0"); bar(hs.x - 60, hs.y, 120, 8, S.g.hh / S.g.hm, S.g.hh / S.g.hm > 0.3 ? "#e8703a" : "#ff3030"); if (S.g.dome) { bar(hs.x - 60, hs.y + 10, 120, 5, S.g.dome[0] / S.g.dome[1], "#7cc8ff"); if (hs.d < 900) text(S.g.dome[0] >= S.g.dome[1] ? "DOME UP" : `DOME ${S.g.dome[0]}/${S.g.dome[1]}g`, hs.x, hs.y + 22, 10, "#9fe0ff"); } }
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

