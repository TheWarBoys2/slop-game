// Browser client, 12-music: Music, made up on the spot. Closes the shared function and starts the render loop.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- music: made up on the spot, never the same twice
const MUSIC = {
  day: { bpm: 100, root: 60, scale: [0, 2, 4, 7, 9], prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: "triangle", drums: 1, swing: 0 },
  night: { bpm: 84, root: 57, scale: [0, 2, 3, 7, 8], prog: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], lead: "sawtooth", drums: 2, swing: 0 },
  boss: { bpm: 140, root: 52, scale: [0, 1, 3, 7, 8], prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [6, 10, 13]], lead: "square", drums: 3, swing: 0 },
  casino: { bpm: 118, root: 62, scale: [0, 2, 4, 7, 9, 10], prog: [[0, 4, 7, 10], [5, 9, 12, 15], [2, 5, 9, 12], [7, 11, 14, 17]], lead: "sine", drums: 4, swing: 0.18 },
  cards: { bpm: 92, root: 60, scale: [0, 3, 5, 7, 10], prog: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]], lead: "sine", drums: 4, swing: 0.15 },
  nuke: { bpm: 70, root: 45, scale: [0, 1, 6, 7], prog: [[0, 1, 6], [0, 6, 7], [1, 6, 12], [0, 7, 13]], lead: "sawtooth", drums: 2, swing: 0 },
  waste: { bpm: 76, root: 50, scale: [0, 3, 5, 6, 10], prog: [[0, 3, 7], [6, 10, 13], [3, 7, 10], [5, 8, 12]], lead: "triangle", drums: 2, swing: 0 },
  club: { bpm: 124, root: 57, scale: [0, 3, 5, 7, 10], prog: [[0, 3, 7, 10], [0, 3, 7, 10], [8, 12, 15], [10, 14, 17]], lead: "square", drums: 5, swing: 0 },
  lobby: { bpm: 96, root: 62, scale: [0, 2, 4, 7, 9], prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: "triangle", drums: 0, swing: 0 },
};
let mus = { bus: null, mood: "", next: 0, step: 0, bar: 0 };
const mf = (n) => 440 * 2 ** ((n - 69) / 12);
function musicMood() {
  if (!S || !joined) return "lobby";
  const g = S.g;
  if (g.nuke) return "nuke";
  if (cardsOpen && cgState) return "cards";
  if (casinoOpen) return "casino";
  if (MAP && MAP.walls && g.mode !== "royale") { const b = MAP.walls.find((w) => w.kind === "shop" && (w.sid === "club" || w.sid === "casino") && pred.x > w.x && pred.x < w.x + w.w && pred.y > w.y && pred.y < w.y + w.h && pred.z < 80); if (b && (b.sid === "casino" || g.ph === "night")) return b.sid; } // inside the casino, or the club on a night out
  if (g.ph === "night" && g.boss) return "boss";
  if (g.ph === "night" || g.ph === "royale") return g.waste ? "waste" : "night";
  if (g.ph === "day") return g.waste ? "waste" : "day";
  return "lobby";
}
function note(type, f, t0, dur, vol, out, filt) {
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  if (filt) { const f2 = actx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = filt; o.connect(f2); f2.connect(g); } else o.connect(g);
  g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
function drum(kind, t0, out, vol) {
  if (kind === "k") { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.22); return; }
  const len = kind === "s" ? 0.16 : 0.04, b = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); src.buffer = b; f.type = "highpass"; f.frequency.value = kind === "s" ? 1200 : 6000; g.gain.value = vol * (kind === "s" ? 0.6 : 0.3);
  src.connect(f); f.connect(g); g.connect(out); src.start(t0);
}
function musicTick() {
  if (!actx) return;
  if (!mus.bus) { mus.bus = actx.createGain(); mus.bus.connect(actx.destination); }
  mus.bus.gain.value = 0.16 * OPTS.music * OPTS.vol;
  if (OPTS.music < 0.02) return;
  const mood = musicMood(), M = MUSIC[mood];
  if (mood !== mus.mood) { mus.mood = mood; mus.step = 0; mus.next = Math.max(mus.next, actx.currentTime + 0.05); }
  const sixteenth = 60 / M.bpm / 4;
  while (mus.next < actx.currentTime + 0.25) {
    const st = mus.step % 16, bar = Math.floor(mus.step / 16), ch = M.prog[bar % M.prog.length], t0 = mus.next + (st % 2 ? M.swing * sixteenth : 0), out = mus.bus;
    if (st === 0) for (const n of ch) note(mood === "nuke" || mood === "waste" ? "sawtooth" : "triangle", mf(M.root + n - 12), t0, sixteenth * 15, 0.05, out, 900); // pad
    if (st % 4 === 0 || (M.drums === 3 && st % 2 === 0)) note("sine", mf(M.root + ch[0] - 24 + (st === 8 && Math.random() < 0.5 ? 7 : 0)), t0, sixteenth * 3, 0.22, out); // bass
    if (M.drums && M.drums !== 4 && (st === 0 || st === 8 || (M.drums === 3 && st % 4 === 0) || (M.drums === 5 && st % 4 === 0))) drum("k", t0, out, 0.5);
    if (M.drums === 5 && st % 4 === 2) drum("h", t0, out, 0.5); // the club: four on the floor, open hats on the off-beat
    if (M.drums === 1 && (st === 4 || st === 12)) drum("s", t0, out, 0.3);
    if (M.drums === 2 && st === 8 && bar % 2) drum("s", t0, out, 0.25);
    if ((M.drums === 3 || M.drums === 5) && (st === 4 || st === 12)) drum("s", t0, out, 0.5);
    if (M.drums && st % 2 === 0) drum("h", t0, out, M.drums === 4 ? 0.25 : 0.35);
    if (M.drums === 4 && (st === 4 || st === 12)) drum("s", t0, out, 0.15);
    const density = mood === "nuke" ? 0.15 : mood === "night" || mood === "waste" ? 0.3 : 0.45;
    if ((st % 2 === 0 || mood === "boss") && Math.random() < density) { // a wandering melody over the chord
      const deg = M.scale[(Math.random() * M.scale.length) | 0] + (Math.random() < 0.3 ? 12 : 0);
      note(M.lead, mf(M.root + deg + (Math.random() < 0.5 ? ch[0] % 12 : 0)), t0, sixteenth * (Math.random() < 0.3 ? 4 : 2), M.lead === "sawtooth" || M.lead === "square" ? 0.03 : 0.07, out, M.lead === "sine" ? null : 2400);
    }
    mus.next += sixteenth; mus.step++;
  }
}
setInterval(musicTick, 60);

window.slopDebug = { get S() { return S; }, get me() { return me; }, get MAP() { return MAP; }, get mask() { return keyMask(); }, look(y, p) { yaw = y; pitch = p; }, get pred() { return pred; }, get playView() { return playView; }, send, ev: (e) => { handleEvent(e); handlePersonal(e); }, get ui() { return { ballotOpen, dlgOpen, fixOpen, bugOpen, fx: fx2 }; }, get ghost() { const mine = S && S.p.find((p) => p.id === me); return ghost3d && mine ? { ...ghost3d, why: buildCheck(ghost3d, mine) } : null; } }; // for tools/ and curious people
requestAnimationFrame(render);
})();
