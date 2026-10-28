// Browser client, 15-hud: the overhauled HUD pieces, each one styled after a different game.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// drawHud (10-render) still decides what shows when; these draw it. All sizes are in UI units (see UIS in 01-core).
const CLOCK_Y = 8, CLOCK_H = 70; // the clock panel; the compass and the alert stack sit under it
const COMPASS_Y = CLOCK_Y + CLOCK_H + 16;
const HUD_STACK_TOP = COMPASS_Y + 18; // where the top-centre alerts start
// ---------------------------------------------------------------- the clock (Majora's Mask)
// A half-moon dial: the sun (by day) or the moon (by night) rides over it from left to right, and the gold arc
// fills as the phase runs out. Majora's Mask counts down three days; we count down to dusk or dawn.
let clockPhase = "", clockLen = 1;
function hudClock(g, day, note, t, dusk, hearth) {
  const cx = VW / 2, cy = CLOCK_Y + 54, R = 38, night = g.ph === "night";
  if (g.ph !== clockPhase || g.left > clockLen) { clockPhase = g.ph; clockLen = Math.max(1, g.left); }
  const timed = (g.ph === "day" || g.ph === "night") && g.left >= 0, k = timed ? Math.max(0, Math.min(1, 1 - g.left / clockLen)) : 0;
  const pw = Math.min(460, VW - 40);
  ctx.fillStyle = night ? "#0c1230dd" : "#2a1a08dd"; ctx.beginPath(); ctx.roundRect(cx - pw / 2, CLOCK_Y, pw, CLOCK_H, [10, 10, 26, 26]); ctx.fill();
  ctx.strokeStyle = night ? "#6a7ad0" : "#c8963a"; ctx.lineWidth = 2; ctx.stroke();
  if (timed) {
    // the dial: thirteen notches, the track, and the part of the day that has already gone
    ctx.lineWidth = 7; ctx.strokeStyle = "#0008"; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = dusk && Math.floor(t * 2) % 2 ? "#ff6030" : night ? "#7f9cff" : "#ffcf4d"; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, Math.PI + Math.PI * k); ctx.stroke();
    ctx.strokeStyle = "#fff6"; ctx.lineWidth = 1.5;
    for (let i = 0; i <= 12; i++) { const a = Math.PI + i * Math.PI / 12, r0 = R + 5, r1 = R + (i % 3 ? 8 : 11); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
    const a = Math.PI + Math.PI * k;
    text(night ? "🌙" : "☀️", cx + Math.cos(a) * R, cy + Math.sin(a) * R, 15, "#fff", "center", false);
    text(`${g.left}s`, cx, cy - 14, 16, dusk ? "#ff9a40" : "#fff");
    text(night ? "to dawn" : "to dusk", cx, cy - 1, 9, "#ccc", "center", false);
  }
  // the day on the left of the dial (Majora's Mask: "Dawn of the First Day"), what's special about it on the right
  const side = timed ? R + 20 : 0, col = dusk && Math.floor(t * 2) % 2 ? "#ffb040" : night ? "#b8c8ff" : "#ffe9a0";
  if (day) text(day, timed ? cx - side : cx, CLOCK_Y + 30, 21, col, timed ? "right" : "center");
  if (note) wrapText(note, 12, timed ? pw / 2 - side - 14 : pw - 30).slice(0, 2).forEach((l, i) => text(l, timed ? cx + side : cx, CLOCK_Y + (day && !timed ? 48 : 26) + i * 15, 12, timed ? "#ddd" : col, timed ? "left" : "center"));
  if (hearth) { // the Hearth's health along the bottom of the clock
    const [f, hit] = hearth, bw = pw - 70;
    text("🔥", cx - bw / 2 - 12, CLOCK_Y + CLOCK_H - 7, 11, "#fff", "center", false);
    bar(cx - bw / 2, CLOCK_Y + CLOCK_H - 10, bw, 6, f, hit && Math.floor(t * 8) % 2 ? "#ff3020" : "#e8703a");
  }
}
// ---------------------------------------------------------------- hearts (The Legend of Zelda)
// 25 HP to a heart, quarter hearts as you take damage, ten to a row. Below a quarter of your health they beat.
const HEART = new Path2D("M0 -3.2 C -1.6 -7.8, -8.6 -6.8, -8.4 -1.4 C -8.2 3, -3 5.6, 0 8.2 C 3 5.6, 8.2 3, 8.4 -1.4 C 8.6 -6.8, 1.6 -7.8, 0 -3.2 Z");
// the top of the vitals panel, which grows a row for every ten hearts
function vitalsTop(mine) { return VH - 12 - (89 + Math.ceil(Math.ceil(mine.mh / 25) / 10) * 19 + (mine.ar > 0 ? 7 : 0)); }
function hudHearts(x, y, hp, mh, t) {
  const n = Math.max(1, Math.ceil(mh / 25)), per = 10, low = hp > 0 && hp / mh < 0.25;
  for (let i = 0; i < n; i++) {
    const hx = x + (i % per) * 21 + 9, hy = y + Math.floor(i / per) * 19 + 8;
    const fill = Math.max(0, Math.min(1, Math.floor((hp - i * 25) / 6.25) / 4)); // quarters
    const beat = low && i === Math.ceil(hp / 25) - 1 ? 1 + 0.15 * Math.max(0, Math.sin(t * 9)) : 1;
    ctx.save(); ctx.translate(hx, hy); ctx.scale(beat, beat);
    ctx.fillStyle = "#3a0a0a"; ctx.fill(HEART);
    if (fill > 0) { ctx.save(); ctx.beginPath(); ctx.rect(-9, -9, 18 * fill, 18); ctx.clip(); ctx.fillStyle = "#e8283a"; ctx.fill(HEART); ctx.fillStyle = "#ff9aa6"; ctx.beginPath(); ctx.arc(-4, -3, 1.6, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.lineWidth = 1.5; ctx.strokeStyle = "#1a0505"; ctx.stroke(HEART);
    ctx.restore();
  }
  return Math.ceil(n / per) * 19;
}
// ---------------------------------------------------------------- food and drink (Minecraft)
// Ten drumsticks and ten water drops, each worth 10, emptying from the right. Only shown once you're below 90.
function hudFoodDrink(x, y, fd, wt, t) {
  const row = (ry, v, full, empty) => {
    for (let i = 0; i < 10; i++) {
      const f = Math.max(0, Math.min(1, (v - i * 10) / 10)), ix = x + i * 15 + 7;
      ctx.globalAlpha = f >= 1 ? 1 : f > 0 ? 0.6 : 0.22;
      text(f > 0 ? full : empty, ix, ry + (v <= 20 && f > 0 ? Math.sin(t * 20 + i) * 1.2 : 0), 12, "#fff", "center", false);
    }
    ctx.globalAlpha = 1;
  };
  row(y, fd, "🍗", "🦴"); row(y + 16, wt, "💧", "💧");
}
// ---------------------------------------------------------------- stamina (Breath of the Wild)
// A green wheel beside you, only while it's being spent or refilling. It goes red when it's nearly empty.
let staShow = 0, staT = 0;
function hudStamina(mine, t) {
  const s = (mine.sta ?? 100) / 100, dt = Math.min(0.1, Math.max(0, t - staT)); staT = t;
  staShow += ((s < 1 ? 1 : 0) - staShow) * Math.min(1, dt * (s < 1 ? 10 : 3));
  if (staShow < 0.02) return;
  const x = VW / 2 + 64, y = VH / 2 - 26, r = 13;
  ctx.globalAlpha = staShow;
  ctx.lineWidth = 6; ctx.strokeStyle = "#0007"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.strokeStyle = s < 0.2 ? (Math.floor(T() * 6) % 2 ? "#ff4030" : "#ff9060") : "#6ee04a";
  ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s); ctx.stroke(); ctx.lineCap = "butt";
  ctx.globalAlpha = 1;
}
// ---------------------------------------------------------------- the weapon (Halo)
// A big round count with the magazine drawn as a strip of bullets above it, and everything else small and below.
function hudWeapon(mine, t, opts) {
  const pw = 300, ph = 116, x = VW - pw - 12, y = VH - ph - 12, busy = mine.rl > 0 || mine.jam;
  ctx.fillStyle = "#06121ccc"; ctx.beginPath(); ctx.roundRect(x, y, pw, ph, [4, 14, 4, 14]); ctx.fill();
  ctx.strokeStyle = "#5ab8e888"; ctx.lineWidth = 1.5; ctx.stroke();
  const mg = mine.mg || 0, am = mine.am || 0, melee = mine.w === "sword" || mine.w === "staff";
  // the count, Halo-blue, red when empty
  text(mine.jam ? "JAM" : mine.rl > 0 ? "··" : melee ? "∞" : `${am}`, x + pw - 16, y + 30, busy ? 22 : 34, mine.jam ? "#ff8060" : am === 0 && !melee ? "#ff5050" : mine.hot ? "#7dffb0" : "#bfe8ff", "right");
  if (!melee && mg > 0) { // the magazine, one tick a round (two rows past 30, a bar past 60)
    const bx = x + 14, bw = pw - 96, top = y + 12;
    if (mg <= 60) {
      const perRow = Math.min(30, mg), rows = Math.ceil(mg / perRow), step = bw / perRow;
      for (let i = 0; i < mg; i++) { const r = Math.floor(i / perRow), c = i % perRow; ctx.fillStyle = i < am ? (am / mg < 0.25 ? "#ff8a60" : "#bfe8ff") : "#ffffff22"; ctx.fillRect(bx + (perRow - 1 - c) * step, top + r * 14 + (rows === 1 ? 4 : 0), Math.max(1.5, step - 2), 11); }
    } else bar(bx, top + 6, bw, 10, am / mg, am / mg < 0.25 ? "#ff8a60" : "#bfe8ff", "#ffffff22");
  }
  if (mine.rl > 0 && mine.rt) { bar(x + 14, y + 42, pw - 96, 4, 1 - mine.rl / mine.rt, "#7dffb0"); text("RELOADING", x + 14, y + 52, 10, "#7dffb0", "left", false); }
  else if (!melee && mg && am / mg < 0.25 && !mine.jam) text(`${keyFor("reload")}  RELOAD`, x + 14, y + 52, 11, Math.floor(t * 3) % 2 ? "#ff8a60" : "#fff", "left");
  // the gun: name and rarity, then its mode and attachments
  const wn = `${mine.we ? ENH[mine.we] + " " : ""}${mine.wn}`;
  text(wn, x + pw - 16, y + 62, 17, RARITY_COL[mine.wr], "right");
  text(opts.sub, x + pw - 16, y + 80, 11, RARITY_COL[mine.wr], "right");
  if (opts.badge) text(opts.badge[0], x + 14, y + 66, 11, opts.badge[1], "left");
  // condition, throwables and the other gun along the bottom
  if (opts.cond) text(opts.cond[0], x + 14, y + 82, 11, opts.cond[1], "left");
  const gk = keyFor("gren"), mk = keyFor("molo");
  text(`${gk} 💣${mine.gn ?? 0}   ${mk} 🔥${mine.mo ?? 0}${mine.hoe ? `   ${keyFor("hoe")} ${["", "Hoe", "Steel Hoe", "Golden Hoe"][mine.hoe]}${mine.ho ? " ✋" : ""}` : ""}`, x + 14, y + ph - 14, 11, "#ffb070", "left");
  if (mine.sec) text(`${keyFor("prim")} Pistol · ${keyFor("sec")} Primary`, x + pw - 16, y + ph - 14, 11, "#8aa", "right");
  return y;
}
// ---------------------------------------------------------------- boss bars (Dark Souls)
// The name over a long, thin bar along the bottom of the screen. Several stack upwards.
let bossSlot = 0;
function hudBossBar(name, frac, col) {
  const w = Math.max(260, Math.min(760, VW - 740)), x = VW / 2 - w / 2, y = VH - 64 - bossSlot * 34;
  bossSlot++;
  text(name, x, y - 9, 15, "#f0e6d0", "left");
  ctx.fillStyle = "#000c"; ctx.fillRect(x - 2, y - 2, w + 4, 10);
  ctx.fillStyle = "#5a0a0a"; ctx.fillRect(x, y, w, 6);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 6);
  ctx.strokeStyle = "#c8b48a88"; ctx.lineWidth = 1; ctx.strokeRect(x - 2, y - 2, w + 4, 10);
}
// ---------------------------------------------------------------- the kill feed (Counter-Strike)
// Dark rows on the right; anything you did has a red outline, like your own kills in CS.
function hudFeedRow(f, lines, x, y, w, bh, mineName) {
  const yours = mineName && f.text.includes(mineName);
  ctx.fillStyle = yours ? "#1a0808d0" : "#000000a8"; ctx.fillRect(x, y, w, bh);
  if (yours) { ctx.strokeStyle = "#e0303a"; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, bh - 1.5); }
  lines.forEach((l, j) => text(l, x + w - 8, y + 11 + j * 16, 13, f.color || "#fff", "right", false));
}
// ---------------------------------------------------------------- the radar (GTA San Andreas)
// drawMinimap (09-view) draws the round radar around you; this adds the rim, north, the arrow that is you,
// and pins on the rim for the things that matter most when they're off the edge.
const RADAR_D = 160, RADAR_K = 0.1; // 160 UI units across, 800 world units from the middle to the rim
function radarRim(mine, [cx, cy], R, ox, oy, k, t) {
  ctx.strokeStyle = "#e8e0c8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, 7); ctx.stroke();
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy - R - 1, 9, 0, 7); ctx.fill();
  text("N", cx, cy - R - 1, 12, "#fff", "center", false);
  const pin = (wx, wy, icon, col) => {
    const dx = wx - pred.x, dy = wy - pred.y, d = Math.hypot(dx, dy) * k;
    if (d < R - 6) return;
    const a = Math.atan2(dy, dx), px = cx + Math.cos(a) * (R - 2), py = cy + Math.sin(a) * (R - 2);
    ctx.fillStyle = "#000c"; ctx.beginPath(); ctx.arc(px, py, 8, 0, 7); ctx.fill();
    text(icon, px, py + 0.5, 11, col, "center", false);
  };
  if (S.g.mode !== "royale" && MAP.hearth) pin(MAP.hearth.x + MAP.hearth.w / 2, MAP.hearth.y + MAP.hearth.h / 2, "🔥", "#ff8a2a");
  for (const n of questNpcs()) pin(n.x, n.y, "❓", "#ffa020");
  if (S.g.adv) { const q = S.g.adv.q.find((x) => x[9]) || S.g.adv.q[0]; if (q) pin(q[4], q[5], advIcon(q), "#ffd34d"); }
  const boss = S.g.boss && S.z.find((z) => z[0] === S.g.boss); if (boss) pin(boss[2], boss[3], "💀", "#fff");
  if (S.g.dis && S.g.dis.st) pin(S.g.dis.st[0], S.g.dis.st[1], "⚠", "#ffd34d");
  // you: an arrow pointing where you're looking
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(aimYaw);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5.5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
