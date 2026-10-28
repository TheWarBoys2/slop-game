// Browser client, 10-render: The frame: HUD, minimap, compass, every screen drawn each frame.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- render
let frameNo = 0, lastFrame = T();
function render() {
  requestAnimationFrame(render);
  if (impact && T() < impact.until) { if (!impact.drawn) { impact.drawn = true; drawImpact(); } return; } // impact frame: hold the picture
  const t = T(), dt = Math.min(0.05, t - lastFrame); lastFrame = t; frameNo++;
  drawWheel(t);
  ctx.setTransform(DPR * UIS, 0, 0, DPR * UIS, 0, 0);
  if (!has3d || !MAP || !S) {
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, VW, VH);
    if (has3d) text("Connecting to the valley...", VW / 2, VH / 2, 24, "#ffd34d");
    else { text("Slop Valley needs WebGL, and this browser can't start it.", VW / 2, VH / 2 - 14, 22, "#ffd34d"); text("Try an up-to-date Chrome, Edge or Firefox, with hardware acceleration switched on.", VW / 2, VH / 2 + 16, 15, "#ccc"); }
    return;
  }
  R3D.show(true);
  stepPred(dt);
  const mine = S.p.find((p) => p.id === me);
  playView = !intro && !!mine; // in the game, looking through your own camera
  if (intro) renderIntro(t, dt); else render3d(mine, t, dt);
}



function drawHud(mine, t) {
  const g = S.g;
  // top center: phase
  let label = "";
  if (g.ph === "lobby") label = `${(MAP.valley || "").toUpperCase()} — ${S.p.length} farmer${S.p.length === 1 ? "" : "s"} waiting`;
  else if (g.ph === "day") label = `DAY ${g.n + 1}${g.dd ? " · DINOSAUR DAY" : ""}  ·  night falls in ${g.left}s`;
  else if (g.ph === "night") label = g.left < 0 ? `NIGHT ${g.n}  ·  ${g.mode === "endless" ? "BOSS NIGHT" : "THE LAST NIGHT"}` : `NIGHT ${g.n}${g.fog ? " · FOG" : ""}${g.dino ? " · DINOSAURS" : ""}  ·  dawn in ${g.left}s`;
  else if (g.ph === "royale") label = `ROYALE · ${g.alive} alive${g.zone && g.zone[6] >= 0 ? ` · fog moves in ${g.zone[6]}s` : g.zone && g.zone[5] < g.zone[2] - 2 ? " · FOG CLOSING" : ""}`;
  else label = g.res === "win" ? "VICTORY" : g.res === "royale" ? "ROYALE OVER" : "DEFEAT";
  if (g.ph === "lobby") label += g.mode === "royale" ? " · Royale" : g.mode === "endless" ? " · Hearth Defence: Endless" : g.mode === "adventure" ? " · Adventure" : " · Hearth Defence";
  const lobby = g.ph === "lobby"; // the lobby and join panels already say all this, and the clock showed through them
  if (!lobby) { ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 200, 10, 400, 44, 10); ctx.fill(); }
  const dusk = (g.ph === "day" || (g.ph === "night" && g.left >= 0)) && g.left >= 0 && g.left <= 10; // the last ten seconds of a day or night glow amber
  if (!lobby) text(label, VW / 2, 26, 18, dusk && Math.floor(t * 2) % 2 ? "#ffb040" : g.ph === "night" ? "#9fc0ff" : "#ffe9a0");
  const hHit = t - hearthHitT < 1.5 && g.mode !== "royale";
  if (g.mode !== "royale" && g.mode !== "adventure") bar(VW / 2 - 180, 42, 360, 6, g.hh / g.hm, hHit && Math.floor(t * 8) % 2 ? "#ff3020" : "#e8703a");
  // everything under the clock and compass stacks downwards, so nothing lands on top of anything else
  let top = playView && !["lobby", "over", "intro"].includes(g.ph) && Math.min(420, VW - 460) >= 160 ? 84 : 62;
  const slot = (h) => { const y = top; top += h + 4; return y; };
  if (g.ph === "lobby" && joined && $("lobbyPanel").classList.contains("hidden")) {
    const rd = S.p.filter((p) => p.rd).length, y = slot(28);
    text(g.cd >= 0 ? `STARTING IN ${Math.ceil(g.cd)}` : `${rd}/${S.p.length} ready · press F when you are`, VW / 2, y + 14, g.cd >= 0 ? 28 : 16, g.cd >= 0 ? "#7dffb0" : "#ccc");
  }
  if (building) { const y = slot(18); text("BUILD MODE  ·  click to place, 1-4 to pick, right-click, C or Esc to stop", VW / 2, y + 9, 14, "#9fe0ff"); const by = slot(56) + "px", bb = $("buildBar"); if (bb.style.top !== by) bb.style.top = by; }
  if (g.dis) {
    const DN = { meteor: "☄ METEOR SHOWER", flood: "🌊 FLOOD", tornado: "🌪 TORNADO", quake: "⚠ EARTHQUAKE" };
    let y = slot(22);
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 130, y, 260, 22, 8); ctx.fill();
    text(`${DN[g.dis.k] || g.dis.k.toUpperCase()}${g.dis.left > 0 ? `  ·  ${g.dis.left}s` : ""}`, VW / 2, y + 11, 13, "#ffb060");
    if (g.dis.st) { const [sx, sy] = g.dis.st, d = Math.hypot(sx - pred.x, sy - pred.y); y = slot(20); ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 170, y, 340, 20, 8); ctx.fill(); text(`Stop it: control station ${Math.round(d / 10)}m ${compass(sx - pred.x, sy - pred.y)} (⚠ on your map)`, VW / 2, y + 10, 12, "#9fe0ff"); }
  }
  if (g.moon) moonHud(g, slot, t); // Moonfall (13-moon.js)
  // boss bar
  if (g.boss) {
    const bz = S.z.find((z) => z[0] === g.boss);
    if (bz) { const y = slot(30); text(BOSS_NAME[g.bk] || "BOSS", VW / 2, y + 7, 16, "#ff6060"); bar(VW / 2 - 250, y + 18, 500, 12, bz[4] / 100, "#c02020"); }
  }
  if (g.adv && ["day", "night"].includes(g.ph)) {
    const q = g.adv.q.find((x) => x[9]) || g.adv.q[0];
    if (q) { const y = slot(20), dx = q[4] - pred.x, dy = q[5] - pred.y, txt = `${advIcon(q)} ${Math.round(Math.hypot(dx, dy) / 10)}m ${compass(dx, dy)}  ·  ${q[3].length > 90 ? q[3].slice(0, 88) + "…" : q[3]}`; ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; const w = Math.min(VW - 40, ctx.measureText(txt).width + 48); ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - w / 2, y, w, 20, 8); ctx.fill(); text(txt, VW / 2, y + 10, 13, "#ffe9a0"); }
    let best = null, bd = 1100 * 1100;
    for (const [id, name] of g.adv.qb) { const z = S.z.find((q2) => q2[0] === id); if (!z) continue; const d = (z[2] - pred.x) ** 2 + (z[3] - pred.y) ** 2; if (d < bd) { bd = d; best = [z, name]; } }
    if (best && !g.boss) { const y = slot(28); text(best[1].toUpperCase(), VW / 2, y + 7, 15, "#ff9060"); bar(VW / 2 - 180, y + 17, 360, 9, best[0][4] / 100, "#d05030"); }
    if (t - advSignT < 4) { const y = slot(22); text(`SIGN FOUND (${advSignN}/3): press J`, VW / 2, y + 11, 18, "#e0c0ff"); }
  }
  const elite = S.z.find((z) => z[1] === "e");
  if (elite && !g.boss) { const y = slot(28); text("THE DROWNED MAYOR", VW / 2, y + 7, 16, "#6ab0e0"); bar(VW / 2 - 200, y + 18, 400, 10, elite[4] / 100, "#3a7ab0"); }
  // Dust II: the round, the bomb, the defuse
  if (g.du && g.du[0] !== "post" && inDustC()) {
    const [st, site, , , , left, def, nz, wins, losses, planting] = g.du, y = slot(def >= 0 ? 44 : 24);
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 200, y, 400, def >= 0 ? 44 : 24, 8); ctx.fill();
    const line = st === "buy" ? `BUY TIME  ${Math.ceil(left)}s  ·  B opens the armoury  ·  ${wins}-${losses}` : st === "live" ? `${planting ? "THEY'RE PLANTING!  ·  " : ""}${nz} terrorist${nz === 1 ? "" : "s"} left  ·  the bomb is on its way  ·  ${wins}-${losses}` : `💣 BOMB PLANTED AT ${site}  ·  ${Math.ceil(left)}s`;
    text(line, VW / 2, y + 12, st === "planted" ? 16 : 14, st === "planted" ? (Math.floor(t * (left < 10 ? 6 : 2)) % 2 ? "#ff4040" : "#ffd34d") : planting ? "#ff8040" : "#e0c080");
    if (def >= 0) { text("DEFUSING", VW / 2, y + 26, 11, "#9fe0ff"); bar(VW / 2 - 150, y + 32, 300, 8, def, "#4da6ff"); }
  }
  // the Hearth is being hit and you're nowhere near it
  if (hHit && MAP.hearth && g.ph !== "lobby" && Math.hypot(MAP.hearth.x + MAP.hearth.w / 2 - pred.x, MAP.hearth.y + MAP.hearth.h / 2 - pred.y) > 450) {
    const y = slot(18), hx = MAP.hearth.x + MAP.hearth.w / 2 - pred.x, hy = MAP.hearth.y + MAP.hearth.h / 2 - pred.y;
    text(`🔥 THE HEARTH IS UNDER ATTACK  ·  ${Math.round(100 * g.hh / g.hm)}%  ·  ${Math.round(Math.hypot(hx, hy) / 10)}m ${compass(hx, hy)}`, VW / 2, y + 9, 14, Math.floor(t * 4) % 2 ? "#ff6040" : "#ffd34d");
  }

  // kill feed (top right): wraps, keeps clear of the clock in the middle and stops above the story card
  {
    const fw = Math.max(220, VW / 2 - 236), maxY = storyCardOn() ? 172 : VH * 0.45, rows = [];
    let h = 0;
    for (let i = feed.length - 1; i >= 0; i--) {
      const f = feed[i], age = t - f.t; if (age > 8) continue;
      const lines = wrapText(f.text, 13, fw - 16), bh = 6 + lines.length * 16;
      if (12 + h + bh > maxY) break;
      rows.unshift({ f, lines, bh, a: Math.min(1, 8 - age) }); h += bh + 4;
    }
    let y = 12;
    for (const { f, lines, bh, a } of rows) {
      ctx.globalAlpha = a;
      ctx.font = `bold 13px "Trebuchet MS", sans-serif`; const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
      ctx.fillStyle = "#000a"; ctx.fillRect(VW - w - 12, y, w, bh);
      lines.forEach((l, j) => text(l, VW - 20, y + 11 + j * 16, 13, f.color || "#fff", "right", false));
      y += bh + 4;
      ctx.globalAlpha = 1;
    }
  }
  // chat log (bottom left), sitting above however many needs rows are showing
  const nr = mine && ["day", "night", "royale"].includes(g.ph) ? (Math.max(mine.bl, mine.bw) >= 50) + ((mine.fd ?? 100) < 60 || (mine.wt ?? 100) < 60 || mine.rad > 0) + ((mine.ss || 0) >= 25 || (mine.els || "").includes(",")) + ((mine.ss || 0) >= 60 ? 0.7 : 0) : 0;
  const chatY = Math.min(VH - 236, VH - 176 - 30 * nr - 10);
  chatLog.forEach((c, i) => {
    const age = t - c.t; if (age > 15 && !chatting) return;
    ctx.globalAlpha = chatting ? 1 : Math.min(1, 15 - age);
    ctx.font = `bold 14px "Trebuchet MS", sans-serif`;
    const y = chatY - (chatLog.length - 1 - i) * 20;
    text(c.from + ":", 14, y, 14, c.color, "left");
    const w = ctx.measureText(c.from + ": ").width;
    text(c.text, 14 + w, y, 14, "#fff", "left");
    ctx.globalAlpha = 1;
  });
  // toasts
  toasts.forEach((to, i) => {
    const age = t - to.t; if (age > 4) return;
    ctx.globalAlpha = Math.min(1, 4 - age);
    text(to.text, VW / 2, VH - 190 - (toasts.length - 1 - i) * 26, 17, to.color || "#fff");
    ctx.globalAlpha = 1;
  });

  if (!mine) return;
  // low health: the edges of the screen pulse red until you patch yourself up
  if (!mine.d && mine.hp > 0 && mine.hp / mine.mh < 0.3) { const k = 1 - mine.hp / mine.mh / 0.3; tint("low", (0.18 + 0.22 * k) * (0.75 + 0.25 * Math.sin(t * 5))); }
  // aim-down-sights vignette
  if (adsZoom > 1.02) tint("ads", 0.55 * (adsZoom - 1) / 0.35);
  // second person
  if (watcher) {
    ctx.fillStyle = "rgba(60,90,20,0.12)"; ctx.fillRect(0, 0, VW, VH);
    text(`SECOND PERSON · you are seen through the eyes of ${watcher.who}`, VW / 2, VH - 232, 15, "#9fdc5a");
  }
  if (mine.inf) {
    const lbl = { second: "Second person", keys: "P forward · INSERT back · ALT left · no right", runs: "The runs" }[mine.inf] || "";
    const iy = slot(40);
    ctx.fillStyle = "#1d2a0dcc"; ctx.beginPath(); ctx.roundRect(VW / 2 - 230, iy, 460, 40, 8); ctx.fill();
    text(`🦠 INFECTED (${mine.il}s): ${lbl}`, VW / 2, iy + 20, 15, t - symT < 1 && Math.floor(t * 8) % 2 ? "#fff" : "#9fdc5a");
    text(bagHas("antidote") ? "Press H to inject your antidote." : "Dawn or an Antidote from the shop will cure it (then press H).", VW / 2, iy + 35, 10, "#9fdc5acc");
  }
  if (mine.md) { ctx.fillStyle = `rgba(255,60,30,${0.12 + Math.sin(t * 9) * 0.06})`; ctx.fillRect(0, 0, VW, VH); text("MELTDOWN", VW / 2 + Math.sin(t * 31) * 4, VH * 0.3, 40, "#ff6040"); text("You can't hold a gun steady. Breathe. Or go and kick a ball about.", VW / 2, VH * 0.3 + 34, 15, "#ffd0c0"); }
  if (mine.sw && pred.z < -44) { ctx.fillStyle = "rgba(20,70,120,0.28)"; ctx.fillRect(0, 0, VW, VH); }
  if (mine.br < 15 || (mine.sw && pred.z < -44)) {
    const b = mine.br / 15; ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW / 2 - 110, VH - 164, 220, 24, 8); ctx.fill();
    text("Breath", VW / 2 - 100, VH - 152, 12, b < 0.3 && Math.floor(t * 4) % 2 ? "#f55" : "#bfe8ff", "left");
    bar(VW / 2 - 50, VH - 157, 150, 8, b, b < 0.3 ? "#e33" : "#7fd0ff");
  }
  if (mine.fz) { ctx.fillStyle = "rgba(150,220,255,0.22)"; ctx.fillRect(0, 0, VW, VH); text("FROZEN", VW / 2, VH * 0.36, 30, "#bfefff"); }
  if (!mine.d && t - clueT < 5) { const y = slot(22); text(`NEW EVIDENCE (${g.clues.length}/5): press J`, VW / 2, y + 11, 18, "#e0c0ff"); }
  if (mine.bi) { const y = slot(18); text("BILED: the horde can smell you", VW / 2, y + 9, 16, "#b8e04a"); }
  if (t - deafT < 2.5) { const y = slot(24); text("*EEEEEEEEEE*", VW / 2 + (Math.random() - 0.5) * 8, y + 12, 22, "#ff8080"); }
  if (t - psyT < 1.4) { ctx.fillStyle = `rgba(150,60,220,${0.3 * (1 - (t - psyT) / 1.4)})`; ctx.fillRect(0, 0, VW, VH); text("THE BRAIN BUG IS IN YOUR HEAD", VW / 2 + (Math.random() - 0.5) * 10, VH * 0.4, 26, "#e0b0ff"); }
  if (g.bug && g.ph === "night") { // Bug Night: how it's going
    const y = slot(22), B = g.bug, brain = B.d ? "dead" : B.b ? "OUT (purple skull on your map)" : "in its hive";
    text(`🐜 BUG NIGHT · holes sealed ${B.s}/${B.n} · Brain Bug ${brain}`, VW / 2, y + 11, 16, B.d ? "#c0ff80" : "#ffb040");
  }
  if (mine.mc && !mine.d) { // your mech: armour while you're in it, a reminder when it's ready and Bug Night is on
    const mv = mine.vh && S.vh.find((v) => v[0] === mine.vh && v[1] === "mech");
    if (mv && mv[5] < 35) { const y = slot(18); text("MECH ARMOUR LOW: get back to the Hearth to repair it", VW / 2, y + 9, 15, Math.floor(t * 3) % 2 ? "#ff6050" : "#fff"); }
    else if (!mv && g.bug && g.ph === "night" && mine.mc[3] < 0 && !mine.vh) { const parts = String(mine.mc[0]).split(","), ready = parts[0] && parts[1] && (parts[2] || parts[3]); if (ready || mine.mc[2]) { const y = slot(18); text(mine.mc[1] > 0 ? `Mech wrecked: rebuild in ${mine.mc[1]}s` : "Press P to call your mech", VW / 2, y + 9, 15, Math.floor(t * 2) % 2 ? "#7fdcff" : "#fff"); } }
  }
  hudTop = top; nukeBottom = 0;
  drawNukeHud(mine, t);
  if (g.dis && g.dis.k === "flood" && g.dis.w > 1 && pred.z < g.dis.w) { ctx.fillStyle = `rgba(40,110,170,${Math.min(0.3, g.dis.w / 100)})`; ctx.fillRect(0, VH * 0.55, VW, VH * 0.45); text("wading", VW / 2, VH * 0.55 + 16, 12, "#bfe0ff"); }
  // bottom left: needs. Each row only shows up once it matters, so the HUD stays quiet most of the time.
  if (["day", "night", "royale"].includes(S.g.ph)) {
    let ry = VH - 176;
    const row = () => { ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(12, ry, 330, 26, 8); ctx.fill(); const y = ry + 14; ry -= 30; return y; };
    if (Math.max(mine.bl, mine.bw) >= 50) {
      const y = row();
      const nb = (x, lbl, v, col) => { text(lbl, x, y, 12, v >= 80 && Math.floor(t * 3) % 2 ? "#f55" : "#ddd", "left"); bar(x + 58, y - 5, 90, 8, v / 100, v >= 80 ? "#e33" : col); };
      nb(22, "💧 Pee", mine.bl, "#e8d84a"); nb(178, "💩 Poo", mine.bw, "#a0703a");
      if (Math.max(mine.bl, mine.bw) >= 60) text("[X] go", 336, y, 11, "#ffc030", "right");
    }
    const fd = mine.fd ?? 100, wt = mine.wt ?? 100;
    if (fd < 60 || wt < 60 || mine.rad > 0) {
      const y = row();
      const fb = (x, lbl, v, col) => { text(lbl, x, y, 12, v <= 20 && Math.floor(t * 3) % 2 ? "#f55" : "#ddd", "left"); bar(x + 58, y - 5, 70, 8, v / 100, v <= 20 ? "#e33" : col); };
      fb(22, "🍞 Food", fd, "#d8a050"); fb(160, "💧 Drink", wt, "#5ab0ff");
      if (mine.rad > 0) text(`☢ ${mine.rad}`, 336, y, 12, mine.rad > 50 && Math.floor(t * 3) % 2 ? "#f55" : "#9fff60", "right");
      else if (fd < 30 || wt < 30) text("[H] eat", 336, y, 11, "#ffc030", "right");
    }
    const ss = mine.ss || 0, el = ELEMS[mine.el] || ELEMS.force, multi = (mine.els || "").includes(",");
    if (ss >= 25 || multi) {
      const y = row();
      text("😰 Stress", 22, y, 12, ss >= 60 && Math.floor(t * 3) % 2 ? "#f55" : "#ddd", "left");
      bar(92, y - 5, 90, 8, ss / 100, ss >= 80 ? "#e33" : ss >= 60 ? "#ff9a40" : "#8fb0d0");
      text(`${el.icon} ${el.name}${multi ? "  [Z] swap" : ""}`, 332, y, 12, el.color, "right");
      if (ss >= 60) text("Stressed out. Kick a ball about on the pitch to calm down.", 22, ry + 16, 12, "#ffb070", "left");
    }
  }
  // bottom left: vitals
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(12, VH - 146, 330, 134, 10); ctx.fill();
  bar(24, VH - 138, 300, 5, mine.xp / mine.xn, "#9fe0ff");
  text(`Lv ${mine.lv}${mine.pts ? `  ·  ${mine.pts} skill point${mine.pts > 1 ? "s" : ""}: press K` : ""}`, 324, VH - 125, 11, mine.pts ? "#9fe0ff" : "#8aa", "right");
  text(mine.n, 24, VH - 112, 15, mine.c, "left");
  text(`Gen ${mine.gen} · ${mine.tr}: ${TRAIT_DESC[mine.tr] || ""}`, 24, VH - 94, 12, "#b8a8e0", "left");
  bar(24, VH - 80, 300, 14, mine.hp / mine.mh, mine.hp / mine.mh > 0.3 ? "#4c4" : "#e33");
  text(`${mine.hp} / ${mine.mh}`, 174, VH - 73, 12, "#fff");
  if (mine.ar > 0) bar(24, VH - 64, 300 * mine.ar / 60, 5, 1, "#6cf", "#0000");
  text(`${mine.g}g`, 24, VH - 45, 20, "#ffd34d", "left");
  text(`🌱 ${mine.sd}`, 110, VH - 45, 18, "#8f8", "left");
  if (mine.spn) text(`🎰 ${mine.spn} spin${mine.spn > 1 ? "s" : ""} at the casino`, 324, VH - 22, 13, "#ffd34d", "right");
  text(`[3] 💣 ${mine.gn ?? 0}   [4] 🔥 ${mine.mo ?? 0}${mine.hoe ? `   [F] ${["", "Hoe", "Steel Hoe", "Golden Hoe"][mine.hoe]}${mine.ho ? " (in hand)" : ""}` : ""}`, VW - 296, VH - 116, 13, "#ffb070", "left");
  if (mine.wm) text("🔥 The Hearth's warmth is healing you", VW / 2, VH - 176, 13, "#ffb070");
  if ((mine.sta ?? 100) < 100) { // stamina: only shown while it's being used or refilling
    const k = (mine.sta ?? 100) / 100; ctx.fillStyle = "#0008"; ctx.beginPath(); ctx.roundRect(VW / 2 - 62, VH - 30, 124, 9, 4); ctx.fill();
    ctx.fillStyle = k < 0.15 ? "#ff7050" : "#9fe0ff"; ctx.beginPath(); ctx.roundRect(VW / 2 - 60, VH - 28, 120 * k, 5, 3); ctx.fill();
  }
  if (mine.ho) text("🌱 Hoe in hand: click open ground to till · F puts it away", VW / 2, VH - 150, 14, "#c8e0a0");
  if (mine.st > 0) { ctx.fillStyle = "#ffcc00"; for (let i = 0; i < 5; i++) { ctx.globalAlpha = i < mine.st ? 1 : 0.2; star(190 + i * 22, VH - 45, 9); } ctx.globalAlpha = 1; text("WANTED", 290, VH - 45, 11, "#ffcc00", "left"); }
  const sc = mine.sc;
  const shEl = ELEMS[mine.el] || ELEMS.force;
  text(sc > 0 ? `Q  shout ${Math.ceil(sc)}s` : `Q  ${shEl.word} ready`, 24, VH - 22, 13, sc > 0 ? "#888" : shEl.color, "left");
  // bottom right: weapon (with its firing mode and attachments)
  ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW - 312, VH - 128, 300, 116, 10); ctx.fill();
  const wn = `${mine.we ? ENH[mine.we] + " " : ""}${mine.wn}`;
  text(wn, VW - 24, VH - 80, 20, RARITY_COL[mine.wr], "right");
  text(`${mine.wmo ? `${MODE_ICON[mine.wmo] || ""} ${mine.we >= 4 ? "OVERCHARGED · " : ""}` : ""}${(mine.wat || "").split(",").filter(Boolean).map((a) => ATT_ICON[a]).join(" ")}${mine.wat ? "  " : ""}${RARITY[mine.wr]}${mine.we ? `  +${mine.we}` : ""}`, VW - 24, VH - 58, 13, RARITY_COL[mine.wr], "right");
  const busy = mine.rl > 0 || mine.jam;
  text(mine.jam ? "JAMMED" : mine.rl > 0 ? "RELOADING" : mine.w === "sword" ? "∞" : `${mine.am}`, VW - 24, VH - 32, busy ? 18 : 28, mine.jam ? "#ff8060" : mine.am === 0 ? "#f55" : mine.hot ? "#7dffb0" : "#fff", "right");
  if (mine.hot && !busy) text("EMPOWERED", VW - 70, VH - 32, 12, "#7dffb0", "right");
  else if (mine.w === "ak" && !busy && !mine.jam && !(mine.rl > 0)) text("🎲 MAYBE", VW - 70, VH - 32, 12, "#ffd34d", "right"); // the AK-Maybe re-rolls its ammo every shot; a perfect reload steadies it
  if (PARTS[mine.w]) { const dd = mine.dirt || 0; text(mine.jam ? "⚠ JAMMED: R clears it, L strips & cleans" : `Condition: ${dd < 20 ? "clean" : dd < 45 ? "grubby" : dd < 70 ? "dirty, may jam" : "filthy, will jam"}${dd >= 45 ? "  ·  L to clean" : ""}`, VW - 296, VH - 98, 12, mine.jam ? "#ff8060" : dd < 20 ? "#8f8" : dd < 45 ? "#cc9" : dd < 70 ? "#ffb070" : "#ff8060", "left"); }
  text(mine.sec ? "[1] Pistol  [2] Primary" : "", VW - 296, VH - 32, 12, "#999", "left");
  const myVeh = mine.vh && S.vh.find((v) => v[0] === mine.vh);
  { const qp = quickPlan(mine); if (qp) { const qy = myVeh ? VH - 250 : VH - 166; ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW - 232, qy, 220, 30, 8); ctx.fill(); text(`[H] ${qp.icon} ${qp.label}`, VW - 222, qy + 15, 13, qp.col, "left"); } } // the quick-use slot
  if (myVeh) {
    ctx.fillStyle = "#000a"; ctx.beginPath(); ctx.roundRect(VW - 312, VH - 212, 300, 74, 10); ctx.fill();
    const driving = myVeh[6] === me;
    text(`${VEH_NAME[myVeh[1]]} · ${driving ? (AIR[myVeh[1]] ? "pilot" : "driving") : AIR[myVeh[1]] ? "gunner" : "passenger"}`, VW - 296, VH - 194, 14, "#9fe0ff", "left");
    text(`${AIR[myVeh[1]] ? `ALT ${Math.round((myVeh[9] || 0) / 10)}m · ` : ""}${Math.round(Math.abs(myVeh[8]) * 0.36)} km/h`, VW - 296, VH - 174, 13, "#fff", "left");
    bar(VW - 296, VH - 156, 268, 8, myVeh[5] / 100, myVeh[5] > 35 ? "#8fd35a" : "#e84a3a");
  }

  // interaction hint
  if (!mine.d) {
    let hint = null;
    if (g.dis && g.dis.st && (g.dis.st[0] - pred.x) ** 2 + (g.dis.st[1] - pred.y) ** 2 < 85 * 85) hint = [g.dis.st[2] ? "Someone's working the station. Cover them!" : `E  ${{ meteor: "shoot down the meteors", flood: "open the sluice gates", tornado: "launch the cloud-seeding rocket", quake: "work the seismic damper" }[g.dis.k]}`, "#9fe0ff"];
    if (!hint && g.moon) hint = moonHint();
    if (!hint) for (const [, x, y, busy] of S.ca || []) if ((x - pred.x) ** 2 + (y - pred.y) ** 2 < 62 * 62) { hint = [busy ? "Someone's hacking this one" : "E  hack the Slop-Tech cache", "#7dffb0"]; break; }
    if (!hint) { // office terminals: hack enough of a block's and its vault opens
      const tm = new Set(S.tm || []);
      for (const w of MAP.walls) if (w.kind === "term" && Math.abs(pred.z - w.z0) < 30 && (w.x + w.w / 2 - pred.x) ** 2 + (w.y + w.h / 2 - pred.y) ** 2 < 56 * 56) { const n = MAP.walls.filter((q) => q.kind === "term" && q.bid === w.bid && tm.has(q.id)).length; hint = tm.has(w.id) ? [`Terminal hacked (${Math.min(n, 3)}/3 for the vault)`, "#7dffb0"] : [`E  hack the terminal (${n}/3 for the vault in the lobby)`, "#7dffb0"]; break; }
    }
    if (!hint) for (const [, x, y, rar, grave] of S.cr) if ((x - pred.x) ** 2 + (y - pred.y) ** 2 < 60 * 60) { hint = [`E  ${grave ? "loot grave" : "open crate"}`, RARITY_COL[rar]]; break; }
    if (!hint) MAP.plots.forEach((pl, i) => { if (!hint && (pl.x - pred.x) ** 2 + (pl.y - pred.y) ** 2 < 48 * 48) { const s = S.pl[i] % 4, cr = CROPS[CROP_KEYS[S.pl[i] >> 2]] || {}; const sel = INV && INV.sel && INV.bag.some((b) => b.id === "s_" + INV.sel) ? CROPS[INV.sel].name.toLowerCase() : "seed"; hint = s === 0 ? [mine.sd ? `E  plant ${sel}` : "No seeds. Old Giles sells them at the produce stall.", "#8f8"] : s === 3 ? [`E  pick the ${(cr.name || "crop").toLowerCase()}`, "#ffd34d"] : [`${cr.name || ""} growing...`, "#aaa"]; } });
    if (!hint && MAP.keepers && g.mode !== "royale") { const st = MAP.walls.find((w) => w.kind === "stall"); if (st && (st.x + st.w / 2 - pred.x) ** 2 + (st.y + st.h / 2 - pred.y) ** 2 < 110 * 110) hint = g.ph === "night" ? ["The stall's shut. Back at dawn.", "#aaa"] : ["E  produce stall: sell crops, buy seeds", "#ffd34d"]; }
    if (!hint && g.du && inDustC()) { // Dust II
      const [st, , bx, by, bz] = g.du;
      if (st === "planted" && Math.hypot(bx - pred.x, by - pred.y) < 70 && Math.abs(bz - pred.z) < 60) hint = g.du[11] === me ? ["Defusing... stay on the bomb", "#9fe0ff"] : ["E  defuse the bomb (5s)", "#ff6040"];
      else { const rd = CHUNK_WALLS.find((w) => w.kind === "radio"); if (rd && Math.hypot(rd.x + rd.w / 2 - pred.x, rd.y + rd.h / 2 - pred.y) < 70) hint = st === "post" && g.du[5] > 0 ? [`The radio's cooling down: ${g.du[5]}s`, "#aaa"] : st === "post" || !st ? ["E  the radio: start a round", "#e0c080"] : ["A round's on. Defend the sites!", "#e0c080"]; }
    }
    if (!hint && !g.du && inDustC()) { const rd = CHUNK_WALLS.find((w) => w.kind === "radio"); if (rd && Math.hypot(rd.x + rd.w / 2 - pred.x, rd.y + rd.h / 2 - pred.y) < 70) hint = ["E  the radio: start a round", "#e0c080"]; }
    const boxD = (w) => Math.max(Math.abs(pred.x - (w.x + w.w / 2)) - w.w / 2, Math.abs(pred.y - (w.y + w.h / 2)) - w.h / 2);
    if (!hint && g.mode !== "royale" && MAP.walls) for (const w of MAP.walls) { // inside the shops: the slots, the tables, the club bar
      if (!(w.kind === "slot" || w.kind === "ctable" || (w.kind === "till" && w.sid === "club")) || boxD(w) > 40 || Math.abs(pred.z) > 40) continue;
      hint = w.kind === "slot" ? ["E  pull the slot machine (10g)", "#ffd34d"] : w.kind === "ctable" ? [`E  ${{ wheel: "the wheel", bj: "the blackjack table", pk: "the poker table" }[w.g]}`, "#ffd34d"] : g.ph === "night" ? ["E  buy a drink from Lola (15g)", "#ff9ad0"] : ["The bar opens at dusk.", "#aaa"];
      break;
    }
    if (!hint && g.mode !== "royale" && MAP.walls && !(MAP.npcs || []).some((n) => (n.x - pred.x) ** 2 + (n.y - pred.y) ** 2 < 70 * 70)) for (const w of [...MAP.walls.filter((q) => q.kind === "till" && q.sid !== "club"), MAP.hearth]) {
      if (!w || boxD(w) > 70 || Math.abs(pred.z) > 40) continue;
      const sid = w.kind === "hearth" ? "hearth" : w.sid, sh = SHOPS[sid] || {};
      hint = sh.hours === "day" && g.ph === "night" ? [`${sh.name} is shut. Back at dawn.`, "#aaa"] : sid === "hearth" ? [`E  the Hearth: repair it${g.dome && g.dome[0] < g.dome[1] ? `, fund the Dome (${g.dome[0]}/${g.dome[1]}g)` : ""}`, "#9fe0ff"] : [`E  ${sh.name}`, "#ffd34d"];
      break;
    }
    if (!hint && !mine.vh) for (const [, kind, vx, vy, , , drv, pas, , vz, , , own] of S.vh) {
      if (kind === "mech") { if ((vx - pred.x) ** 2 + (vy - pred.y) ** 2 < 70 ** 2) { if (own === me && !drv) hint = ["E  climb into your mech", "#7fdcff"]; else if (!pas) hint = ["E  ride on the mech's shoulder", "#7fdcff"]; } if (hint) break; continue; }
      if ((vx - pred.x) ** 2 + (vy - pred.y) ** 2 < (AIR[kind] ? 76 : 62) ** 2 && Math.abs((vz || 0) - pred.z) < 70 && (!drv || !pas)) { hint = [`E  ${drv ? "ride in" : AIR[kind] ? "fly" : "drive"} the ${VEH_NAME[kind]}`, "#9fe0ff"]; break; }
    }
    const mechV = mine.vh && S.vh.find((v) => v[0] === mine.vh && v[1] === "mech");
    if (mechV) { const pr = String(mechV[10] || "").split(","); hint = mechV[6] === me ? [`WASD walk · click ${MECH_NAME[pr[2]] || "nothing"}${pr[3] ? ` · right-click ${MECH_NAME[pr[3]]}` : ""}${pr[1] === "jet" ? " · SPACE jets" : ""} · E out`, "#7fdcff"] : ["Riding on the shoulder · E hop off", "#7fdcff"]; }
    else if (mine.vh) hint = piloting() ? [pad() ? "Flying with your stick · button 3 gets out" : "W/S pitch · A/D strafe · mouse turns · SPACE up · C down · E out", "#9fe0ff"] : [S.vh.find((v) => v[0] === mine.vh)?.[6] === me ? "WASD drive · E get out" : "E get out", "#9fe0ff"];
    if (!hint && mine.sw && pred.z < -60 && MAP.walls.some((w) => w.kind === "glyph" && (w.x + 15 - pred.x) ** 2 + (w.y + 15 - pred.y) ** 2 < 60 * 60)) hint = ["E  touch the glyph", "#7dd8ff"];
    if (!hint && g.adv && !dlgOpen) {
      for (const [x, y, kind] of g.adv.pts) if ((x - pred.x) ** 2 + (y - pred.y) ** 2 < 60 * 60) { hint = kind ? ["E  pick up the parcel", "#ffd34d"] : ["E  examine", "#e0c0ff"]; break; }
      if (!hint) for (const w of advWalls()) if (Math.max(Math.abs(pred.x - (w.x + w.w / 2)) - w.w / 2, Math.abs(pred.y - (w.y + w.h / 2)) - w.h / 2) < 60) { hint = w.kind === "board" ? ["E  read the notice board", "#ffe9a0"] : ["E  signpost: fast travel", "#ffe9a0"]; break; }
    }
    if (!hint && MAP.npcs && g.mode !== "royale" && !dlgOpen) for (const n of MAP.npcs) if ((n.x - pred.x) ** 2 + (n.y - pred.y) ** 2 < 70 * 70) { hint = [`E  talk to ${n.name}`, "#e0c0ff"]; break; }
    if (!hint && mine.hoe && g.mode !== "royale" && !mine.vh && pred.gr && pred.z < 4 && (g.ph === "day" || g.ph === "night") && !dlgOpen) hint = ["E  till a new plot here", "#b8e070"];
    if (mine.air === 1) hint = ["SPACE to jump", "#ffd34d"];
    else if (mine.air === 2) hint = ["WASD to steer your landing", "#ffd34d"];
    else if (mine.air === 4) hint = ["HELLPOD: WASD to steer. Land on zombies, not friends.", "#ff9a40"];
    if (hint) { ctx.font = 'bold 16px "Trebuchet MS", sans-serif'; const hw = ctx.measureText(hint[0]).width + 24; ctx.fillStyle = "#0008"; ctx.beginPath(); ctx.roundRect(VW / 2 - hw / 2, VH / 2 + 37, hw, 26, 8); ctx.fill(); text(hint[0], VW / 2, VH / 2 + 50, 16, hint[1]); }
  }

  // banner
  let bannerEnd = 0;
  if (banner && t - banner.t < 4) {
    const k = t - banner.t, a = Math.min(1, k * 3, (4 - k));
    ctx.globalAlpha = a;
    // sits under whatever the top of the screen is showing, and wraps its line so the story card doesn't cut it off
    const sw = safeW(), lines = banner.sub ? wrapText(banner.sub, 17, sw) : [];
    const by = Math.max(VH * 0.25, (nukeBottom || hudTop) + 54), bh = 70 + lines.length * 22;
    ctx.fillStyle = "#000a"; ctx.fillRect(0, by - 50, VW, bh); bannerEnd = by - 50 + bh;
    ctx.font = 'bold 42px "Trebuchet MS", sans-serif'; const tw = ctx.measureText(banner.text).width;
    text(banner.text, VW / 2, by - 12, Math.max(24, Math.min(42, 42 * sw / tw)), "#ffd34d");
    lines.forEach((l, i) => text(l, VW / 2, by + 26 + i * 22, 17, "#eee"));
    ctx.globalAlpha = 1;
  }
  // the Reckoning's verdict, under the day banner and clear of the story card
  if (t - legendT < 7) {
    const L = LEGENDS[legendKind], k = t - legendT, a = Math.min(1, k * 2, 7 - k), ly = Math.max(VH * 0.36, bannerEnd + 30);
    ctx.globalAlpha = a;
    text("THE VALLEY HAS DECIDED", VW / 2, ly, 20, "#ddd");
    const lt = L ? `YOU ARE ${L.title.toUpperCase()} OF ${(MAP.valley || "").toUpperCase()}` : "YOU ARE NOBODY IN PARTICULAR";
    text(lt, VW / 2, ly + 40, Math.min(38, safeW() / (lt.length * 0.7)), L ? L.color : "#aaa");
    if (L) wrapText(L.blurb, 16, safeW()).forEach((l, i) => text(l, VW / 2, ly + 78 + i * 20, 16, "#eee"));
    ctx.globalAlpha = 1;
  }
  // TEAMKILL. Nobody gets to miss it.
  if (shameWho && t - shameT < 6) {
    const k = t - shameT, a = Math.min(1, k * 4, 6 - k), me2 = shameWho.id === me;
    ctx.globalAlpha = a * (0.25 + 0.15 * Math.sin(t * 12)); ctx.fillStyle = "#c00000"; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    const sz = Math.min(120, VW / 7) * (1 + Math.max(0, 0.3 - k) * 2);
    text("TEAMKILL", VW / 2, VH * 0.42, sz, Math.floor(t * 6) % 2 ? "#ff2020" : "#ffffff");
    text(me2 ? `YOU KILLED ${shameWho.vic.toUpperCase()}. YOUR OWN TEAMMATE.` : `${shameWho.who.toUpperCase()} KILLED ${shameWho.vic.toUpperCase()}`, VW / 2, VH * 0.42 + sz * 0.6, 22, "#fff");
    text(me2 ? "Everyone saw that. Everyone." : `That's teamkill number ${shameWho.n} for them. Point and laugh.`, VW / 2, VH * 0.42 + sz * 0.6 + 30, 16, "#ffd0d0");
    text("🔔 SHAME 🔔 SHAME 🔔 SHAME 🔔", VW / 2, VH * 0.42 - sz * 0.62, 26, "#ffd34d");
    ctx.globalAlpha = 1;
  }
  if (mine.bi) tint("bile", 0.14 + Math.sin(t * 3) * 0.04);
  if (mine.fr) tint("fire", 0.45 + Math.random() * 0.15);
  // wasted
  if (mine.d && g.mode === "royale" && wastedPlace) {
    ctx.fillStyle = "rgba(40,40,40,0.45)"; ctx.fillRect(0, VH / 2 - 80, VW, 150);
    text(wastedPlace === 99 ? "SPECTATING" : `ELIMINATED  #${wastedPlace}`, VW / 2, VH / 2 - 20, 60, "#d02020");
    text("Spectating the survivors...", VW / 2, VH / 2 + 35, 18, "#ddd");
  } else if (mine.d && t - wasted < 6) {
    const k = Math.min(1, (t - wasted) * 2);
    ctx.fillStyle = `rgba(40,40,40,${0.55 * k})`; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = k;
    text("WASTED", VW / 2, VH / 2 - 20, 80, "#d02020");
    text("This is how you died.", VW / 2, VH / 2 + 40, 20, "#ddd");
    const hl = Math.ceil(5 - (t - wasted)); // the server sends your heir five seconds after you drop
    text(`${hl > 0 ? `Your heir arrives in ${hl}s` : "Your heir is on the way"} and inherits your skills (and most of your gold).`, VW / 2, VH / 2 + 70, 15, "#aaa");
    ctx.globalAlpha = 1;
  }
  // case opening
  if (caseAnim) {
    const k = t - caseAnim.t0;
    if (k > 4.2) caseAnim = null;
    else {
      const cw = 130, total = 34 * cw;
      const prog = 1 - Math.pow(1 - Math.min(1, k / 3), 3);
      const off = prog * total;
      const cx = VW / 2, cy = VH / 2 - 120;
      ctx.fillStyle = "#000c"; ctx.fillRect(cx - 360, cy - 60, 720, 130);
      ctx.save(); ctx.beginPath(); ctx.rect(cx - 355, cy - 55, 710, 110); ctx.clip();
      caseAnim.reel.forEach((it, i) => {
        const x = cx + i * cw - off - cw / 2;
        if (x < cx - 500 || x > cx + 400) return;
        ctx.fillStyle = "#222"; ctx.fillRect(x + 4, cy - 45, cw - 8, 90);
        ctx.fillStyle = RARITY_COL[it.rarity]; ctx.fillRect(x + 4, cy + 35, cw - 8, 10);
        text(it.name || WNAME[it.type], x + cw / 2, cy - 5, 15, RARITY_COL[it.rarity]);
      });
      ctx.restore();
      ctx.fillStyle = "#ffd34d"; ctx.fillRect(cx - 1, cy - 60, 3, 130);
      if (k > 3.1) text(`${RARITY[caseAnim.rarity].toUpperCase()} ${caseAnim.name || WNAME[caseAnim.type]}!`, cx, cy + 95, 30, RARITY_COL[caseAnim.rarity]);
      if (k > 3.0 && !caseAnim.dinged) { caseAnim.dinged = true; sfx(caseAnim.rarity >= 3 ? "lvl" : "hit"); }
    }
  }
  // enhancement
  if (enhAnim) {
    const k = t - enhAnim.t0;
    if (k > 2.2) enhAnim = null;
    else {
      ctx.globalAlpha = Math.min(1, 2.2 - k);
      if (enhAnim.ok) text(`SUCCESS  ${ENH[enhAnim.lvl]} (+${enhAnim.lvl})`, VW / 2, VH / 2 - 140, 38, "#ffd34d");
      else text(enhAnim.down ? `FAILED — downgraded to +${enhAnim.lvl}` : "FAILED", VW / 2, VH / 2 - 140, 38, "#ff4040");
      ctx.globalAlpha = 1;
    }
  }
  if (showScores) drawScores();
}

function drawScores() {
  const rows = [...S.p].sort((a, b) => b.k - a.k);
  const w = 760, h = 70 + rows.length * 30, x = VW / 2 - w / 2, y = VH / 2 - h / 2;
  ctx.fillStyle = "#000d"; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  const cols = [["Name", 20], ["Class", 290], ["Lv", 370], ["Kills", 410], ["Deaths", 470], ["Crops", 540], ["HS", 600], ["Acc", 650], ["TK", 710]];
  for (const [n, cx] of cols) text(n, x + cx, y + 24, 13, "#9fb58a", "left");
  rows.forEach((p, i) => {
    const yy = y + 58 + i * 30;
    if (p.id === me) { ctx.fillStyle = "#ffffff14"; ctx.fillRect(x + 8, yy - 13, w - 16, 26); } // you
    ctx.globalAlpha = p.d ? 0.5 : 1;
    text(`${p.d ? "💀 " : ""}${p.n}`, x + 20, yy, 14, p.c, "left");
    text((CLASSES.find((c) => c[0] === p.cl) || [, p.cl])[1], x + 290, yy, 14, "#ddd", "left");
    text(String(p.lv), x + 370, yy, 14, "#9fe0ff", "left");
    text(String(p.k), x + 410, yy, 14, "#fff", "left");
    text(String(p.de), x + 470, yy, 14, "#fff", "left");
    text(String(p.cr), x + 540, yy, 14, "#8f8", "left");
    text(String(p.hs), x + 600, yy, 14, "#ff9d2e", "left");
    text(p.acc + "%", x + 650, yy, 14, "#fff", "left");
    text(String(p.tk), x + 710, yy, 14, p.tk ? "#f66" : "#fff", "left");
    ctx.globalAlpha = 1;
  });
}

// the ending: who did it, what they raised, what became of them. Then the scoreboard.
let cut = null;
function playCutscene(c) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const slides = [
    [`${esc(c.valley).toUpperCase()} · NIGHT ${c.night}`, `${esc(c.boss)} is dead. The sun comes up on the Hearth, still burning.`, "#ffe9a0"],
    [`It was ${esc(c.who)}.`, esc(c.motive), c.color],
    [esc(c.boss), esc(c.bossLine), "#ff9070"],
    ["Afterwards", esc(c.fate), "#cfe0b8"],
    ["THE END", "...of this valley, anyway.", "#ffd34d"],
  ];
  cut = { i: -1, slides, timer: 0 };
  $("cutscene").classList.remove("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
  nextSlide();
}
function nextSlide() {
  if (!cut) return;
  clearTimeout(cut.timer);
  cut.i++;
  if (cut.i >= cut.slides.length) return endCutscene();
  const [big, txt, col] = cut.slides[cut.i], el = $("csSlide");
  el.classList.remove("on");
  setTimeout(() => { if (!cut) return; el.innerHTML = `<div class="cs-big" style="color:${col}">${big}</div><div class="cs-txt">${txt}</div>`; el.classList.add("on"); }, 350);
  cut.timer = setTimeout(nextSlide, cut.i === 1 ? 9000 : 6000);
}
function endCutscene() { if (cut) clearTimeout(cut.timer); cut = null; $("cutscene").classList.add("hidden"); }
$("cutscene").addEventListener("click", () => nextSlide());
addEventListener("keydown", (e) => { if (!cut) return; e.stopImmediatePropagation(); if (e.key === "Escape") endCutscene(); else if (e.key === " " || e.key === "Enter") { e.preventDefault(); nextSlide(); } }, true);
function showOver() {
  const win = S.g.res === "win";
  if (win && S.cut && S.g.mode === "story") playCutscene(S.cut);
  const royale = S.g.res === "royale";
  const myRow = (S.stats || []).find((r) => r.id === me);
  $("overTitle").textContent = royale ? (myRow && myRow.winner ? "WINNER WINNER CHICKEN DINNER" : `#${myRow ? myRow.place : "?"} · BETTER LUCK NEXT DROP`) : win ? "WINNER WINNER CHICKEN DINNER" : "THE HEARTH HAS FALLEN";
  $("overTitle").style.fontSize = "34px";
  $("overSub").innerHTML = (S.ending || []).map((l) => `<p>${String(l).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</p>`).join("");
  const rows = S.stats || [];
  const rc = (r) => r >= 8 ? "#4fd04f" : r >= 7 ? "#a8e04f" : r >= 6 ? "#e0d04f" : r >= 5 ? "#e09a4f" : "#e05050";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cols = royale
    ? [["#", (r) => r.place], ["Player", null], ["Pos", (r) => r.cls], ["Elims", (r) => r.pk], ["Zombies", (r) => r.kills], ["Dmg", (r) => r.dmg], ["HS", (r) => r.hs], ["Acc", (r) => r.acc + "%"]]
    : [["Player", null], ["Pos", (r) => r.cls], ["Kills", (r) => r.kills], ["Dmg", (r) => r.dmg], ["Crops", (r) => r.crops], ["HS", (r) => r.hs], ["Acc", (r) => r.acc + "%"], ["Deaths", (r) => r.deaths], ["TK", (r) => r.tk]];
  $("overTable").innerHTML = `<tr>${cols.map(([h]) => `<th>${h}</th>`).join("")}<th>Rating</th></tr>` +
    rows.map((r, i) => `<tr>${cols.map(([, f]) => f ? `<td>${esc(f(r))}</td>` : `<td style="color:${r.color}">${i === 0 ? '<span class="motm">★</span> ' : ""}${esc(r.name)}</td>`).join("")}<td><span class="rating" style="background:${rc(r.rating)}">${r.rating.toFixed(1)}</span></td></tr>`).join("") +
    (rows[0] ? `<tr><td colspan="${cols.length + 1}" class="motm">★ Player of the Match: ${esc(rows[0].name)}</td></tr>` : "");
  $("overLineage").parentElement.querySelector("h3:last-of-type").textContent = royale ? "" : "Dynasties";
  $("overLineage").innerHTML = rows.map((r) => `<div class="lineage">${r.lineage.map(esc).join(" → ")}</div>`).join("");
  $("over").classList.remove("hidden");
  toggleShop(false); toggleSkills(false); toggleJournal(false);
  if (dlgOpen) showDlg({ close: 1 });
}

// dynamic crosshair: the gap shows your real spread, so tap-firing and standing still visibly pay off
function drawCrosshair(mine, t) {
  if (!mine || mine.d || showScores || radial || chatting || shopOpen || skillsOpen || cleanOpen || hackOpen || S.g.ph === "over") { cv.style.cursor = "default"; return; }
  cv.style.cursor = "none";
  const mouseX = VW / 2, mouseY = VH / 2; // the crosshair sits in the middle of the screen
  const gap = 4 + Math.tan(mine.spr) * (VH / 2) / Math.tan(((camNow && camNow.fov) || 78) * Math.PI / 360);
  const col = t - hsT < 0.25 ? "#ff9d2e" : mine.hot ? "#7dffb0" : "#ffffff";
  ctx.strokeStyle = "#000a"; ctx.lineWidth = 4;
  const lines = () => { if (scopedNow) return; ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(mouseX + dx * gap, mouseY + dy * gap); ctx.lineTo(mouseX + dx * (gap + 8), mouseY + dy * (gap + 8)); } ctx.stroke(); };
  lines(); ctx.strokeStyle = col; ctx.lineWidth = 2; lines(); // the scope has its own reticle
  if (!scopedNow) { ctx.fillStyle = col; ctx.fillRect(mouseX - 1, mouseY - 1, 2, 2); }
  if (mine.chg > 0) { ctx.strokeStyle = "#ff2a2a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mouseX, mouseY, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * mine.chg); ctx.stroke(); if (mine.chg >= 1) text("FIRE", mouseX, mouseY + 40, 12, "#ff2a2a"); }
  const hk = t - hitT, hdur = hitKind === "kill" ? 0.35 : 0.2;
  if (hk < hdur && OPTS.hitmarkers !== false) {
    const big = hitKind === "kill" ? 15 : hitKind === "wk" ? 13 : 10, inner = hitKind === "kill" ? 5 : 4;
    ctx.globalAlpha = 1 - hk / hdur;
    ctx.strokeStyle = { body: "#ffffff", hs: "#ff9d2e", wk: "#ff3030", arm: "#9aa4ad", kill: "#ff3030" }[hitKind]; ctx.lineWidth = hitKind === "kill" || hitKind === "wk" ? 3 : 2;
    ctx.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(mouseX + sx * big, mouseY + sy * big); ctx.lineTo(mouseX + sx * inner, mouseY + sy * inner); } ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // active reload: tap R again while the marker crosses the green window for an instant, empowered reload
  if (inj.t0 && !(mine.inf && bagHas("antidote"))) inj.t0 = 0;
  if (inj.t0) { // the injection timing bar
    const k = ((t - inj.t0) / 1.1) % 1, bw = 140, bx = mouseX - bw / 2, by = mouseY + 52;
    ctx.fillStyle = "#000a"; ctx.fillRect(bx - 2, by - 2, bw + 4, 12); ctx.fillStyle = "#2a3a1a"; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = "#9fdc5a"; ctx.fillRect(bx + bw * 0.42, by, bw * 0.2, 8);
    ctx.fillStyle = "#fff"; ctx.fillRect(bx + bw * k - 1, by - 3, 3, 14);
    text("💉 H in the green", mouseX, by + 22, 12, "#9fdc5a");
  }
  if (rel.end) {
    const k = 1 - Math.max(0, rel.end - t) / rel.total, bw = 110, bx = mouseX - bw / 2, by = mouseY + 30;
    ctx.fillStyle = "#000b"; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
    if (!mine.jam) { ctx.fillStyle = rel.tried ? "#555" : "#3fbf6f"; ctx.fillRect(bx + bw * 0.45, by, bw * 0.17, 6); }
    ctx.fillStyle = "#fff"; ctx.fillRect(bx + bw * Math.min(1, k) - 1, by - 3, 3, 12);
    text(mine.jam ? "CLEARING JAM" : rel.tried ? "" : "R", mine.jam ? mouseX : bx + bw + 12, mine.jam ? by + 20 : by + 4, 12, mine.jam ? "#ff8060" : "#bbb");
  } else if (mine.jam) text("JAMMED · press R", mouseX, mouseY + 34, 13, "#ff8060");
  else if (mine.am === 0 && mine.w !== "sword" && !mine.vh) text("EMPTY · press R", mouseX, mouseY + 34, 13, Math.floor(t * 3) % 2 ? "#ff8080" : "#fff");
}

