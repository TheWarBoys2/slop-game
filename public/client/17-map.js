// Browser client, 17-map: the full-screen map (Breath of the Wild) and your waypoint.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- the map
// A tab in the Esc menu (and its own key). Wheel to zoom, drag to pan, click to drop a waypoint, right-click to clear it.
// The waypoint shows on the compass, the radar and in the world until you get there.
let mapOpen = false, mapView = null, mapDrag = null, waypoint = null;
const mapEl = document.createElement("div");
mapEl.id = "bigmap"; mapEl.className = "overlay hidden";
document.body.appendChild(mapEl);
function toggleMap(force) {
  mapOpen = force === undefined ? !mapOpen : force;
  if (mapOpen) closeScreens(toggleMap);
  mapEl.classList.toggle("hidden", !mapOpen);
  if (!mapOpen) return;
  keys.clear(); mouseDown = false; if (document.pointerLockElement) document.exitPointerLock();
  mapView = { cx: pred.x, cy: pred.y, k: Math.min(0.5, Math.max(0.12, (VH - 140) / (MAP.H || 2600))) };
}
const mapXY = (e) => [e.clientX / UIS, e.clientY / UIS]; // the map lives on the HUD canvas, in UI units
const mapW2S = (x, y) => [VW / 2 + (x - mapView.cx) * mapView.k, VH / 2 + 20 + (y - mapView.cy) * mapView.k];
const mapS2W = (sx, sy) => [mapView.cx + (sx - VW / 2) / mapView.k, mapView.cy + (sy - VH / 2 - 20) / mapView.k];
mapEl.addEventListener("wheel", (e) => {
  e.preventDefault(); if (!mapView) return;
  const [sx, sy] = mapXY(e), [wx, wy] = mapS2W(sx, sy);
  mapView.k = Math.max(0.04, Math.min(2, mapView.k * (e.deltaY > 0 ? 0.85 : 1 / 0.85)));
  const [nx, ny] = mapS2W(sx, sy); mapView.cx += wx - nx; mapView.cy += wy - ny; // zoom about the cursor
}, { passive: false });
mapEl.addEventListener("mousedown", (e) => { if (e.button === 0) { const [sx, sy] = mapXY(e); mapDrag = { sx, sy, cx: mapView.cx, cy: mapView.cy, moved: false }; } });
mapEl.addEventListener("mousemove", (e) => {
  const [sx, sy] = mapXY(e); if (mapView) mapView.mouse = [sx, sy];
  if (!mapDrag) return;
  if (Math.hypot(sx - mapDrag.sx, sy - mapDrag.sy) > 4) mapDrag.moved = true;
  mapView.cx = mapDrag.cx - (sx - mapDrag.sx) / mapView.k; mapView.cy = mapDrag.cy - (sy - mapDrag.sy) / mapView.k;
});
addEventListener("mouseup", (e) => {
  if (!mapDrag || e.button !== 0) return;
  if (!mapDrag.moved && mapOpen) { const [wx, wy] = mapS2W(...mapXY(e)); waypoint = { x: wx, y: wy }; sfx("hit", 0.6); }
  mapDrag = null;
});
mapEl.addEventListener("contextmenu", (e) => { e.preventDefault(); if (waypoint) { waypoint = null; sfx("whoosh", 0.4); } });
function liveWaypoint() { if (waypoint && Math.hypot(waypoint.x - pred.x, waypoint.y - pred.y) < 90) { waypoint = null; sfx("perfect", 0.4); } return waypoint; } // reached it
function drawBigMap(t) {
  if (!mapOpen || !S || !MAP || !mapView) return;
  const k = mapView.k, P = (x, y) => mapW2S(x, y);
  // the Sheikah Slate: a dark blue frame round a muted map, cyan for everything you can interact with
  ctx.fillStyle = "#0b1620"; ctx.fillRect(0, 0, VW, VH);
  const fx = 24, fy = 70, fw = VW - 48, fh = VH - 94;
  ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
  ctx.fillStyle = "#1c2a24"; ctx.fillRect(fx, fy, fw, fh);
  const [x0, y0] = P(0, 0); ctx.fillStyle = "#8a9a6a"; ctx.fillRect(x0, y0, (MAP.W || 3400) * k, (MAP.H || 2600) * k); // the valley; the wild lands round it stay dark
  const [wx0, wy0] = mapS2W(fx, fy), [wx1, wy1] = mapS2W(fx + fw, fy + fh);
  const vis = (w) => w.x + w.w > wx0 && w.x < wx1 && w.y + w.h > wy0 && w.y < wy1;
  for (const w of MAP.walls) if (w.kind === "lake" && vis(w)) { const [a, b] = P(w.x, w.y); ctx.fillStyle = "#4a7a9a"; ctx.fillRect(a, b, w.w * k, w.h * k); }
  ctx.fillStyle = "#4a4a3acc";
  for (const w of MAP.walls) if (w.z1 > 0 && w.kind !== "hwall" && w.kind !== "furn" && w.kind !== "lake" && vis(w)) { const [a, b] = P(w.x, w.y); ctx.fillRect(a, b, Math.max(1, w.w * k), Math.max(1, w.h * k)); }
  // contour-ish grid, every 500 units, with the BotW faint lines
  ctx.strokeStyle = "#ffffff14"; ctx.lineWidth = 1; ctx.beginPath();
  for (let gx = Math.floor(wx0 / 500) * 500; gx < wx1; gx += 500) { const [a] = P(gx, 0); ctx.moveTo(a, fy); ctx.lineTo(a, fy + fh); }
  for (let gy = Math.floor(wy0 / 500) * 500; gy < wy1; gy += 500) { const [, b] = P(0, gy); ctx.moveTo(fx, b); ctx.lineTo(fx + fw, b); }
  ctx.stroke();
  for (const [hx, hy, hr, lk] of S.g.hot || []) if (!lk) { const [a, b] = P(hx, hy); ctx.fillStyle = "rgba(150,255,60,0.3)"; ctx.beginPath(); ctx.arc(a, b, Math.max(3, hr * k), 0, 7); ctx.fill(); }
  const icon = (x, y, s, col, size = 16, label) => { const [a, b] = P(x, y); text(s, a, b, size, col, "center", false); if (label && k > 0.08) text(label, a, b + size * 0.9 + 2, 11, "#fff"); };
  for (const w of MAP.walls) if (w.kind === "bunker") icon(w.x + w.w / 2, w.y + w.h / 2, "☢", "#ffd34d", 16, "Bunker");
  if (S.g.mode !== "royale" && MAP.hearth) {
    const h = MAP.hearth, [a, b] = P(h.x + h.w / 2, h.y + h.h / 2);
    if (S.g.dome && S.g.dome[0] >= S.g.dome[1]) { ctx.strokeStyle = "#9fe0ffaa"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a, b, DOME_R * k, 0, 7); ctx.stroke(); }
    icon(h.x + h.w / 2, h.y + h.h / 2, "🔥", "#ff8a2a", 20, "The Hearth");
    const SHOPN = { armoury: ["🔫", "Haddock's Armoury"], club: ["🪩", "The club"], casino: ["🎰", "Casino"] };
    for (const w of MAP.walls) if (w.kind === "shop") { const [ic, nm] = SHOPN[w.sid] || ["🛒", "Vex's store"]; icon(w.x + w.w / 2, w.y + w.h / 2, ic, "#fff", 16, nm); }
    const st = MAP.walls.find((w) => w.kind === "stall"); if (st) icon(st.x + st.w / 2, st.y + st.h / 2, "🥕", "#fff", 14, "Giles's stall");
    if (DUSTR) icon(DUSTR.x + DUSTR.w / 2, DUSTR.y + DUSTR.h / 2, "💣", "#e0c080", 16, "Dust II");
    for (const n of questNpcs()) icon(n.x, n.y, "❓", "#ffa020", 18);
  }
  if (S.g.adv) {
    for (const [n, x, y, disc, , home] of S.g.adv.t) icon(x, y, home ? "🏠" : disc ? "🏘" : "❔", disc || home ? "#ffe9a0" : "#aab", 18, disc || home ? n : `${n}?`);
    for (const q of S.g.adv.q) { const [a, b] = P(q[4], q[5]); if (q[6]) { ctx.strokeStyle = "#ffd34d"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(a, b, Math.max(6, q[6] * k), 0, 7); ctx.stroke(); ctx.setLineDash([]); } text(advIcon(q), a, b, 16, "#ffd34d", "center", false); }
  }
  if (S.g.zone) { const [cx, cy, r] = S.g.zone, [a, b] = P(cx, cy); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.arc(a, b, Math.max(1, r * k), 0, 7, true); ctx.fillStyle = "#7828a066"; ctx.fill("evenodd"); }
  if (S.g.dis && S.g.dis.st) icon(S.g.dis.st[0], S.g.dis.st[1], "⚠", "#ffd34d", 18, "Control station");
  const boss = S.g.boss && S.z.find((z) => z[0] === S.g.boss); if (boss) icon(boss[2], boss[3], "💀", "#fff", 20);
  for (const pg of livePings(t)) { const pi = PING[pg.w] || PING.go; icon(pg.x, pg.y, pi[0], pi[2], 16); }
  for (const p of S.p) if (!p.d && p.id !== me) { const [a, b] = P(p.x, p.y); ctx.fillStyle = p.c; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a, b, 5, 0, 7); ctx.fill(); ctx.stroke(); if (k > 0.06) text(p.n, a, b - 12, 11, "#fff"); }
  const wp = liveWaypoint();
  if (wp) { const [a, b] = P(wp.x, wp.y); mapPin(a, b, t); }
  { const [a, b] = P(pred.x, pred.y); ctx.save(); ctx.translate(a, b); ctx.rotate(aimYaw); ctx.fillStyle = "#6ff0ff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  ctx.restore();
  // the frame, the cursor's distance, and the legend
  ctx.strokeStyle = "#6ff0ff"; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, fw, fh);
  ctx.strokeStyle = "#6ff0ff55"; ctx.lineWidth = 1; ctx.strokeRect(fx - 5, fy - 5, fw + 10, fh + 10);
  for (const [cx, cy] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) { ctx.fillStyle = "#6ff0ff"; ctx.fillRect(cx - 4, cy - 4, 8, 8); }
  text("N ↑", fx + 22, fy + 18, 13, "#6ff0ff");
  if (mapView.mouse) { const [mx, my] = mapView.mouse, [wx, wy] = mapS2W(mx, my); if (mx > fx && mx < fx + fw && my > fy && my < fy + fh) text(`${Math.round(Math.hypot(wx - pred.x, wy - pred.y) / 10)}m`, mx + 16, my + 16, 12, "#6ff0ff", "left"); }
  const leg = [["🔥", "Hearth"], ["🛒", "Shops"], ["❓", "Someone to talk to"], ["☢", "Bunker"], ["⚠", "Disaster station"], ["◆", "Pings"], ["📍", "Your waypoint"]];
  if (S.g.adv) leg.push(["🏘", "Towns you've found"], ["❗", "Jobs"]);
  const lw = 190, lh = 26 + leg.length * 19, lx = fx + 12, ly = fy + fh - lh - 12; // bottom left, clear of the cursor's corner
  ctx.fillStyle = "#0b1620dd"; ctx.fillRect(lx, ly, lw, lh); ctx.strokeStyle = "#6ff0ff88"; ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
  text("LEGEND", lx + 10, ly + 13, 11, "#6ff0ff", "left");
  leg.forEach(([ic, nm], i) => { text(ic, lx + 18, ly + 32 + i * 19, 13, "#fff", "center", false); text(nm, lx + 34, ly + 32 + i * 19, 12, "#dde", "left", false); });
  text(`Wheel to zoom · drag to move · click for a waypoint${waypoint ? " · right-click clears it" : ""} · ${keyFor("map")} or Esc to close`, VW / 2, VH - 12, 12, "#9fd8e0");
}
function mapPin(x, y, t) { // a Sheikah stamp: a blue drop with a white ring
  const bob = Math.sin(t * 4) * 2;
  ctx.fillStyle = "#2a9adf"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - 12, y - 14 + bob, x - 9, y - 28 + bob, x, y - 28 + bob); ctx.bezierCurveTo(x + 9, y - 28 + bob, x + 12, y - 14 + bob, x, y); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y - 19 + bob, 3.5, 0, 7); ctx.fill();
}
function drawWaypoint(t) { // in the world: the pin over the spot, with how far
  const wp = liveWaypoint(); if (!wp || mapOpen) return;
  const s = project3(wp.x, wp.y, (pred.z || 0) + 60); if (!s) return;
  mapPin(s.x, s.y, t); text(`${Math.round(s.d / 10)}m`, s.x, s.y + 12, 12, "#9fe0ff");
}
