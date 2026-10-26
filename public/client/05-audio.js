// Browser client, 05-audio: Sound effects and NPC voices.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- sound
let actx = null;
addEventListener("pointerdown", () => { if (!actx) try { actx = new AudioContext(); } catch {} }, { once: false });
let lastShotSfx = 0;
// the dead make noise: a moan now and then from something nearby, each kind with a sound you learn to dread,
// and a snort when a charger winds up to charge
let moanNext = 0; const zWound = new Set();
function zombieSounds(t) {
  if (!S || !S.z || !OPTS.vol) return;
  const near = [];
  for (const z of S.z) {
    const d = Math.hypot(z[2] - pred.x, z[3] - pred.y);
    if (z[1] === "c") { if (z[7] && !zWound.has(z[0])) { zWound.add(z[0]); sfxAt({ x: z[2], y: z[3], far: 900 }, "moan", 1, "snort"); } else if (!z[7]) zWound.delete(z[0]); }
    if (d < 750) near.push([z, d]);
  }
  if (t < moanNext || !near.length) return;
  moanNext = t + 0.5 + Math.random() * (near.length > 6 ? 0.6 : 1.6);
  const [z, d] = near[(Math.random() * near.length) | 0];
  sfx("moan", 1, z[1], heard({ x: z[2], y: z[3], far: 900 }) || { vol: 0.05, cut: 900, pan: 0 });
}
// [crack length, crack pitch, thump pitch, thump length, thump volume, tail length]
const SHOT_SND = { pistol: [0.08, 1200, 160, 0.12, 0.5, 0.15], smg: [0.06, 1500, 140, 0.08, 0.32, 0.08], rifle: [0.1, 900, 120, 0.15, 0.6, 0.25], ak: [0.11, 800, 105, 0.16, 0.65, 0.25], shotgun: [0.22, 500, 85, 0.26, 0.7, 0.4], sniper: [0.3, 300, 65, 0.36, 0.7, 0.6], staff: [0.05, 2000, 200, 0.1, 0.2, 0], laser: [0.2, 600, 55, 0.5, 0.7, 0.5], rocket: [0.25, 300, 60, 0.3, 0.7, 0.5] };
// where a sound comes from: it gets quieter and duller with distance, and comes from the side it's on
// at = { x, y, far }: silent beyond far, half volume at about a third of the way out
function heard(at) {
  const dx = at.x - pred.x, dy = at.y - pred.y, d = Math.hypot(dx, dy), far = at.far || 900;
  if (d >= far) return null;
  const k = d / far, ref = far * 0.3;
  return { vol: (1 - k) / (1 + (d / ref) ** 2), cut: 18000 * Math.pow(1 - k, 2.2) + 700, pan: d > 30 ? Math.max(-0.85, Math.min(0.85, (dx * -Math.sin(yaw) + dy * Math.cos(yaw)) / d)) : 0 };
}
function sfxAt(at, kind, vol, sub) { const h = heard(at); if (h) sfx(kind, vol, sub, h); }
function sfx(kind, vol = 1, sub, h) {
  if (!actx) return;
  const t = actx.currentTime;
  if (kind === "shot") { if (t - lastShotSfx < 0.03) return; lastShotSfx = t; }
  const g = actx.createGain();
  if (h) { // far away: quieter, muffled, and off to one side
    const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = h.cut; g.connect(lp);
    if (actx.createStereoPanner) { const pn = actx.createStereoPanner(); pn.pan.value = h.pan; lp.connect(pn); pn.connect(actx.destination); } else lp.connect(actx.destination);
  } else g.connect(actx.destination);
  const tone = (type, f0, f1, dur, v) => {
    const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gg = actx.createGain(); gg.gain.setValueAtTime(v, t); gg.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(gg); gg.connect(g); o.start(t); o.stop(t + dur);
  };
  const noise = (dur, v, hp = 800) => {
    const b = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = actx.createBufferSource(); src.buffer = b; const f = actx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const gg = actx.createGain(); gg.gain.value = v; src.connect(f); f.connect(gg); gg.connect(g); src.start(t);
  };
  g.gain.value = 0.35 * OPTS.vol * (T() - deafT < 3 ? 0.35 : 1) * (h ? h.vol : 1);
  if (kind === "shot" && sub === "rico") { tone("sine", 2600, 900, 0.2, 0.16 * vol); noise(0.04, 0.2 * vol, 3000); }
  else if (kind === "shot") { // a crack, a thump you feel, and a tail that rolls off
    const P = SHOT_SND[sub] || SHOT_SND.pistol;
    noise(P[0], 0.55 * vol, P[1]); tone("sine", P[2], 35, P[3], P[4] * vol); if (P[5]) noise(P[5], 0.14 * vol, 180);
    if (sub === "staff") tone("sawtooth", 300, 80, 0.2, 0.2 * vol); if (sub === "laser") tone("sawtooth", 1400, 120, 0.5, 0.35 * vol);
  }
  else if (kind === "whoosh") { noise(0.22, 0.35 * vol, 1200); tone("sine", 220, 520, 0.18, 0.08 * vol); }
  else if (kind === "slide") noise(0.55, 0.3 * vol, 400);
  else if (kind === "glass") { noise(0.3, 0.3 * vol, 4000); for (let i = 0; i < 4; i++) tone("triangle", 2400 + i * 900, 1600, 0.12 + i * 0.04, 0.05 * vol); }
  else if (kind === "step") { tone("sine", 120, 60, 0.07, 0.25 * vol); noise(0.05, 0.25 * vol, 900); }
  else if (kind === "boost") { tone("square", 300, 1400, 0.35, 0.12 * vol); tone("sine", 600, 2400, 0.3, 0.1 * vol); }
  else if (kind === "casing") { tone("triangle", 3300, 2900, 0.05, 0.045); tone("triangle", 2600, 2400, 0.04, 0.03); }
  else if (kind === "hit") tone("square", 220, 120, 0.05, 0.08);
  else if (kind === "hs") { tone("sine", 1760, 1760, 0.18, 0.35); tone("sine", 2640, 2640, 0.12, 0.15); }
  else if (kind === "weak") { tone("sine", 2093, 2093, 0.2, 0.35); tone("sawtooth", 520, 260, 0.12, 0.2); noise(0.08, 0.3, 2000); }
  else if (kind === "lcharge") { tone("sawtooth", 180, 1400, 1.2, 0.22 * vol); tone("sine", 360, 2800, 1.2, 0.12 * vol); }
  else if (kind === "moan") {
    const v = 0.22 * vol, r = 0.9 + Math.random() * 0.2;
    if (sub === "w") { tone("sawtooth", 120 * r, 80 * r, 1.0, v * 0.6); tone("sine", 240 * r, 160 * r, 1.0, v * 0.3); } // walker: a long groan
    else if (sub === "r") { tone("sawtooth", 950 * r, 520 * r, 0.32, v * 0.6); noise(0.2, v * 0.4, 2500); } // runner: a shriek
    else if (sub === "t") { tone("sawtooth", 62 * r, 44 * r, 1.4, v); tone("square", 31 * r, 25, 1.4, v * 0.4); } // tank: a low rumble
    else if (sub === "c" || sub === "snort") { noise(sub === "snort" ? 0.45 : 0.25, v * (sub === "snort" ? 1.6 : 0.8), 300); tone("square", 90, 60, 0.3, v * 0.5); } // charger: snorts
    else if (sub === "f") { tone("triangle", 1600 * r, 1150 * r, 0.4, v * 0.6); tone("triangle", 1700 * r, 1250 * r, 0.35, v * 0.4); } // flyer: a screech
    else if (sub === "x") { noise(0.6, v * 0.7, 120); tone("sine", 70 * r, 40, 0.6, v * 0.6); } // boomer: a gurgle
    else if (sub === "s") { tone("sawtooth", 1300 * r, 1700 * r, 0.6, v * 0.5); } // screamer: a rising scream
    else if (sub === "d") { tone("square", 1100 * r, 1400 * r, 0.12, v * 0.5); tone("square", 1300 * r, 1000 * r, 0.12, v * 0.4); } // raptor: a chirp
    else if (sub === "g" || sub === "p" || sub === "k" || sub === "q") { for (let i = 0; i < (sub === "g" ? 3 : 5); i++) tone("square", (sub === "k" || sub === "q" ? 500 : 1500) * r + Math.random() * 400, 700 * r, 0.05 + i * 0.04, v * 0.4); noise(0.3, v * 0.5, sub === "g" ? 4000 : 1200); } // bugs: clicking and chittering
    else if (sub === "b" || sub === "e" || sub === "y") { tone("sawtooth", 70 * r, 38, 1.8, v * 1.3); noise(1.2, v * 0.6, 80); } // big things: a roar
  }
  else if (kind === "bugs") { for (let i = 0; i < 4; i++) setTimeout(() => { tone("square", 640, 640, 0.35, 0.18); tone("square", 480, 480, 0.35, 0.12); }, i * 450); } // the klaxon
  else if (kind === "chitter") { for (let i = 0; i < 5; i++) tone("square", 1800 + Math.random() * 900, 900, 0.04 + i * 0.03, 0.08 * vol); noise(0.25, 0.25 * vol, 3500); }
  else if (kind === "psy") { tone("sine", 90, 220, 1.4, 0.35 * vol); tone("sine", 93, 225, 1.4, 0.3 * vol); tone("triangle", 1400, 300, 1.0, 0.08 * vol); }
  else if (kind === "fireburst") { noise(0.3, 0.3 * vol, 500); }
  else if (kind === "clank") { tone("square", 1250, 900, 0.06, 0.12); noise(0.05, 0.25, 4000); }
  else if (kind === "kill") { tone("sine", 140, 60, 0.18, 0.4); tone("triangle", 1320, 1320, 0.1, 0.12); }
  else if (kind === "armbreak") { noise(0.25, 0.5, 2500); tone("square", 700, 200, 0.2, 0.15); }
  else if (kind === "hurt") tone("sawtooth", 160, 60, 0.15, 0.25);
  else if (kind === "boom") { noise(0.5, 0.7, 60); tone("sine", 120, 30, 0.4, 0.5); }
  else if (kind === "shout" && sub === "fire") { noise(0.7, 0.5, 300); tone("sawtooth", 90, 60, 0.6, 0.3); }
  else if (kind === "shout" && sub === "frost") { tone("sine", 1200, 400, 0.7, 0.2); noise(0.6, 0.3, 3000); }
  else if (kind === "shout" && sub === "storm") { noise(0.4, 0.6, 1500); tone("square", 400, 60, 0.5, 0.2); }
  else if (kind === "shout") { tone("sawtooth", 110, 55, 0.6, 0.35); noise(0.5, 0.3, 200); }
  else if (kind === "lvl") [523, 659, 784, 1046].forEach((f, i) => { const o = actx.createOscillator(); o.type = "triangle"; o.frequency.value = f; const gg = actx.createGain(); gg.gain.setValueAtTime(0, t + i * 0.08); gg.gain.linearRampToValueAtTime(0.25, t + i * 0.08 + 0.01); gg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25); o.connect(gg); gg.connect(g); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3); });
  else if (kind === "perfect") { tone("triangle", 880, 1320, 0.15, 0.3); }
  else if (kind === "ding") { tone("sine", sub ? 1760 : 1320, sub ? 1700 : 1300, 0.35, 0.22 * vol); tone("sine", sub ? 2640 : 1980, 1900, 0.2, 0.06 * vol); } // a steel target; the bull rings higher
  else if (kind === "reel") { for (let i = 0; i < 6; i++) { const o = actx.createOscillator(), gg = actx.createGain(); o.type = "square"; o.frequency.value = 600 + (i % 3) * 140; gg.gain.setValueAtTime(0.0001, t); gg.gain.setValueAtTime(0.08, t + i * 0.06); gg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.04); o.connect(gg); gg.connect(g); o.start(t); o.stop(t + 0.5); } }
  else if (kind === "jackpot") { [523, 659, 784, 1047].forEach((f, i) => { const o = actx.createOscillator(), gg = actx.createGain(); o.type = "triangle"; o.frequency.value = f; gg.gain.setValueAtTime(0.0001, t); gg.gain.setValueAtTime(0.18, t + i * 0.09); gg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.3); o.connect(gg); gg.connect(g); o.start(t); o.stop(t + 0.8); }); }
  else if (kind === "jam") tone("square", 120, 90, 0.2, 0.2);
  else if (kind === "banner") tone("triangle", 196, 196, 0.8, 0.25);
  else if (kind === "shame") { [0, 0.45, 0.9].forEach((d) => { const o = actx.createOscillator(); o.type = "sine"; o.frequency.value = 330; const o2 = actx.createOscillator(); o2.type = "sine"; o2.frequency.value = 494; const gg = actx.createGain(); gg.gain.setValueAtTime(0.5, t + d); gg.gain.exponentialRampToValueAtTime(0.001, t + d + 1.2); o.connect(gg); o2.connect(gg); gg.connect(g); o.start(t + d); o2.start(t + d); o.stop(t + d + 1.2); o2.stop(t + d + 1.2); }); tone("sawtooth", 90, 60, 1.2, 0.3); }
  else if (kind === "bile") { noise(0.5, 0.5, 150); tone("sawtooth", 140, 50, 0.5, 0.25); }
  else if (kind === "scream") { tone("sawtooth", 900, 1400, 0.9, 0.25); tone("square", 1200, 700, 0.9, 0.12); }
  else if (kind === "glass") { noise(0.2, 0.6, 3000); tone("sine", 2400, 1800, 0.15, 0.2); }
  else if (kind === "throw") tone("sine", 500, 250, 0.12, 0.15);
  else if (kind === "zap") { noise(0.25, 0.5, 2500); tone("square", 1800, 200, 0.25, 0.15); }
  else if (kind === "click") tone("square", 1400, 1200, 0.03, 0.2);
  else if (kind === "kick") { tone("sine", 160, 80, 0.1, 0.4); noise(0.05, 0.3, 1500); }
  else if (kind === "goal") { noise(1.6, 0.35, 500); tone("triangle", 523, 1046, 0.7, 0.3); }
  else if (kind === "alarm") [0, 0.3, 0.6, 0.9].forEach((d) => { const o = actx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(880, t + d); o.frequency.setValueAtTime(660, t + d + 0.15); const gg = actx.createGain(); gg.gain.setValueAtTime(0.15, t + d); gg.gain.setValueAtTime(0.001, t + d + 0.29); o.connect(gg); gg.connect(g); o.start(t + d); o.stop(t + d + 0.3); });
  else if (kind === "rex") { tone("sawtooth", 90, 40, 1.4, 0.5); noise(1.2, 0.4, 100); }
  else if (kind === "siren") { for (let i = 0; i < 6; i++) { const o = actx.createOscillator(), gg = actx.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(380, t + i * 1.6); o.frequency.linearRampToValueAtTime(820, t + i * 1.6 + 0.8); o.frequency.linearRampToValueAtTime(380, t + i * 1.6 + 1.6); gg.gain.setValueAtTime(0.12, t + i * 1.6); gg.gain.linearRampToValueAtTime(0.001, t + i * 1.6 + 1.6); o.connect(gg); gg.connect(g); o.start(t + i * 1.6); o.stop(t + i * 1.6 + 1.6); } }
  else if (kind === "nuke") { noise(4, 1, 30); tone("sine", 70, 18, 4, 0.9); tone("sawtooth", 50, 20, 3, 0.3); }
  else if (kind === "splash") { noise(0.5, 0.5, 400); tone("sine", 300, 80, 0.3, 0.15); }
}

// the valley's verdict on teamkillers, read out loud where the browser can speak
function sayShame(who) {
  try {
    if (!("speechSynthesis" in window) || OPTS.vol < 0.05) return;
    const u = new SpeechSynthesisUtterance(`Shame. Shame. Shame. ${who} killed a teammate.`);
    u.volume = Math.min(1, OPTS.vol); u.rate = 0.85; u.pitch = 0.6;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch {}
}

// the townsfolk talk out loud. Each has their own pitch, pace, accent and (where the browser has several) their own
// system voice, pushed far enough apart that you can tell who's talking with your eyes shut.
// [pitch, rate, "f" for a woman's voice, preferred accent, slot: which matching voice to take, so two Brits don't share one]
const VOICES = {
  grubb: [0.7, 0.95, "", /GB/, 0], aldous: [0.5, 0.72, "", /GB|IE/, 1], morwen: [1.4, 0.82, "f", /IE|GB|AU/, 0], vex: [1.35, 1.32, "", /US/, 0],
  pell: [0.3, 0.62, "", /GB|AU/, 2], haddock: [0.6, 1.22, "", /GB/, 3], giles: [0.42, 0.7, "", /AU|GB|IE/, 1], lou: [1.25, 1.2, "f", /US/, 1],
  radio: [0.9, 1.05, "", /US/, 3], // Dust II's radio voice
  chef: [1.05, 1.45, "", /GB/, 4], bear: [0.8, 1.05, "", /GB/, 5], boulder: [0.2, 0.85, "", /US/, 1], david: [0.85, 0.74, "", /GB/, 6], warren: [0.95, 0.8, "", /US/, 2],
};
let voiceList = [];
const loadVoices = () => { try { voiceList = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); } catch {} };
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(fem, accent, slot = 0) {
  const isF = (v) => /female|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|libby|sonia|mia|aria|jenny|emma|amy|olivia|natasha|serena|kate/i.test(v.name);
  const pool = voiceList.filter((v) => fem ? isF(v) : !isF(v));
  const local = accent ? pool.filter((v) => accent.test(v.lang)) : [];
  const from = local.length ? local : pool.length ? pool : voiceList;
  return from.length ? from[slot % from.length] : null;
}
// "quoted speech" gets spoken; narration around it doesn't
function speakable(text) {
  const s = String(text || "").replace(/\*[^*]*\*/g, " ");
  const q = s.match(/"[^"]+"|“[^”]+”/g);
  return (q ? q.join(" ") : s).replace(/["“”]/g, "").replace(/\s+/g, " ").trim().slice(0, 320);
}
const ARRIVE_LINE = {
  chef: "Right. Where's the kitchen? This place is an absolute disgrace.",
  bear: "Today I'm going to show you how to survive a zombie valley. First, we drink this.",
  boulder: "Can you smell what the valley is cooking?",
  david: "Here, in this remote valley, the humble farmer prepares for the long night.",
  warren: "Never bet against the valley. Unless the price is right.",
};
function speakNpc(id, text) {
  try {
    if (!OPTS.voices || !("speechSynthesis" in window) || OPTS.vol < 0.05) return;
    const line = speakable(text); if (!line) return;
    const [pitch, rate, f, accent, slot] = VOICES[id] || [1, 1];
    const u = new SpeechSynthesisUtterance(line), v = pickVoice(f === "f", accent, slot);
    if (v) u.voice = v;
    u.volume = Math.min(1, OPTS.vol); u.pitch = pitch; u.rate = rate;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch {}
}
function hush() { try { if ("speechSynthesis" in window && !shameSpeaking()) speechSynthesis.cancel(); } catch {} }
const shameSpeaking = () => T() - shameT < 4;

