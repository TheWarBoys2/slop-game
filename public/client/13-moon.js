// Browser client, 13-moon: Moonfall. The countdown, the title cards, the shrines on the map and compass, and the songs.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// The moon itself, the shrines and the Giants are drawn in r3d.js (moon3d).
const GIANT_NAMES = ["Moor Giant", "Orchard Giant", "Bog Giant", "Stone Giant"], GIANT_HUE = ["#c08aff", "#ffd34d", "#7dffb0", "#9fe0ff"];
let moonCard = null;
// a note or a chord, played straight to the speakers (sfx() has no music in it)
function moonNote(f, dur, vol, delay = 0, type = "triangle") {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.35 * OPTS.vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const moonBell = (n = 1) => { for (let i = 0; i < n; i++) { moonNote(196, 3, 0.5, i * 1.6, "sine"); moonNote(392, 2.2, 0.18, i * 1.6, "sine"); moonNote(587, 1.6, 0.08, i * 1.6, "sine"); } }; // the clock tower
const moonOath = () => [[587, 0], [440, 0.3], [349, 0.6], [587, 1.0], [659, 1.4], [698, 1.8]].forEach(([f, d]) => moonNote(f, 0.5, 0.35, d, "triangle")); // played on a slop-bucket ocarina
function moonEvent(e, t) {
  if (e.say === "start") moonBell(3);
  else if (e.say === "card") { moonCard = { text: e.text, hrs: e.hrs, t }; moonBell(1); }
  else if (e.say === "oath") { if (Math.hypot(e.x - pred.x, e.y - pred.y) < 1600) moonOath(); }
  else if (e.say === "giant") { shake = Math.max(shake, 14); moonNote(55, 2.5, 0.6, 0, "sawtooth"); moonNote(82, 2.5, 0.4, 0.2, "sawtooth"); }
  else if (e.say === "saved") [[523, 0], [659, 0.25], [784, 0.5], [1047, 0.8]].forEach(([f, d]) => { moonNote(f, 1.4, 0.3, d, "triangle"); moonNote(f / 2, 1.4, 0.2, d, "sine"); });
  else if (e.say === "fall") shake = Math.max(shake, 40);
}
const moonHrs = (h) => h >= 1 ? `${Math.floor(h)} hour${Math.floor(h) === 1 ? "" : "s"} remain` : "it's about to land";
// the line under the clock, plus progress at a shrine you're standing in
function moonHud(g, slot, t) {
  const M = g.moon;
  if (M.h >= 0 && !M.f) {
    const woke = M.sh.filter((s) => s[3]).length, y = slot(24), late = M.h < 12, col = late && Math.floor(t * 2) % 2 ? "#ff6040" : late ? "#ffb070" : "#e0c0ff";
    ctx.fillStyle = "#1a0a14cc"; ctx.beginPath(); ctx.roundRect(VW / 2 - 190, y, 380, 24, 8); ctx.fill();
    text(`🌕 THE MOON FALLS  ·  ${moonHrs(M.h)}  ·  Giants ${woke}/4`, VW / 2, y + 12, 14, col);
    const near = M.sh.findIndex(([x, y2, , aw, on]) => on && !aw && (x - pred.x) ** 2 + (y2 - pred.y) ** 2 < 900 * 900);
    if (near >= 0) {
      const s = M.sh[near], inside = (s[0] - pred.x) ** 2 + (s[1] - pred.y) ** 2 < 190 * 190, y2 = slot(30);
      text(`Waking the ${GIANT_NAMES[near]}: ${s[2]}%${inside ? "" : "  ·  GET IN THE CIRCLE"}`, VW / 2, y2 + 8, 14, inside ? GIANT_HUE[near] : "#ff8060");
      bar(VW / 2 - 160, y2 + 19, 320, 8, s[2] / 100, GIANT_HUE[near]);
    }
  }
  // the Majora's Mask title card at every dawn and dusk
  if (moonCard && t - moonCard.t > 3.5 && t - moonCard.t < 9.5) { // after the day's own banner has had its say
    const k = t - moonCard.t - 3.5, a = Math.min(1, k * 1.5, (6 - k) / 1.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#000000aa"; ctx.fillRect(0, VH * 0.4 - 50, VW, 110);
    ctx.font = 'italic bold 44px Georgia, "Times New Roman", serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 6; ctx.strokeStyle = "#000"; ctx.strokeText(moonCard.text, VW / 2, VH * 0.4 - 8); ctx.fillStyle = "#fff4d8"; ctx.fillText(moonCard.text, VW / 2, VH * 0.4 - 8);
    ctx.font = 'italic 22px Georgia, "Times New Roman", serif'; ctx.fillStyle = "#e0c0ff"; ctx.fillText(`- ${moonCard.hrs} Hours Remain -`, VW / 2, VH * 0.4 + 34);
    ctx.globalAlpha = 1;
  }
}
// E at a shrine
function moonHint() {
  const M = S.g.moon; if (!M || M.h < 0 || M.f) return null;
  for (let i = 0; i < M.sh.length; i++) {
    const [x, y, prog, awake, on] = M.sh[i];
    if ((x - pred.x) ** 2 + (y - pred.y) ** 2 > 150 * 150) continue;
    if (awake) return [`The ${GIANT_NAMES[i]} is awake`, GIANT_HUE[i]];
    return on ? [`Hold the circle! ${prog}%`, GIANT_HUE[i]] : [`E  play the Oath to Order (wake the ${GIANT_NAMES[i]})`, GIANT_HUE[i]];
  }
  return null;
}
function moonMap(mx, my, ox, oy, k) {
  const M = S.g.moon; if (!M || M.h < 0) return;
  M.sh.forEach(([x, y, , awake, on], i) => text(awake ? "🗿" : on ? "🎵" : "🗿", mx + (x - ox) * k, my + (y - oy) * k, awake ? 10 : 13, GIANT_HUE[i], "center", !awake));
}
function moonCompass(mark) {
  const M = S.g.moon; if (!M || M.h < 0) return;
  M.sh.forEach(([x, y, , awake], i) => { if (!awake) mark(x, y, "🗿", GIANT_HUE[i]); });
}
