// Browser client, 02-effects: Effects, toasts, the feed, and weapon feel: recoil, view punch, impact frames.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- effects
const fx = []; // {kind, t0, dur, ...}
const toasts = [];
const feed = [];
const chatLog = [];
const bubbles = new Map();
let duskWarn = -1, duskLong = -1;
let banner = null, wasted = 0, caseAnim = null, enhAnim = null, shake = 0, hurtFlash = 0;
const T = () => performance.now() / 1000;

function onSnap(m) {
  const prevPhase = S?.g.ph;
  S = SNAP.merge(S, m); m = S; me = m.me;
  if (MAP && MAP.npcs && m.np) for (const [id, x, y, a] of m.np) { const n = MAP.npcs.find((q) => q.id === id); if (n) { n.x = x; n.y = y; n.a = a; } }
  for (const e of m.e) handleEvent(e);
  for (const e of m.pe) handlePersonal(e);
  if (m.g.ph === "over" && prevPhase !== "over") showOver();
  if (m.g.ph !== "over") { $("over").classList.add("hidden"); if (cut) endCutscene(); }
  if (m.g.ph === "night" && shopOpen && !shopAt && (SHOPS[shopSid] || {}).hours === "day") toggleShop(false);
  renderStory();
  // a heads-up before dark, once a day, so nobody gets caught out in the fields
  if (m.g.ph === "day" && m.g.left > 14) duskLong = m.g.n; // only warn on days that were long enough to need it
  if (joined && m.g.ph === "day" && m.g.left > 0 && m.g.left <= 10 && duskWarn !== m.g.n && duskLong === m.g.n) { duskWarn = m.g.n; pushLim(toasts, { text: m.g.mode === "adventure" ? `Night falls in ${m.g.left}s. The wild gets meaner after dark.` : `Night falls in ${m.g.left}s. The dead come for the Hearth.`, color: "#ffb040", t: T() }, 4); sfx("banner"); }
  const mr = m.p.find((p) => p.id === me);
  if (mr && mr.rl > 0) { const end = T() + mr.rl; if (!rel.end || Math.abs(end - rel.end) > 0.15) rel.end = end; rel.total = mr.rt; rel.tried = !!mr.rtr; } else rel.end = 0;
  const hostId = m.p.length ? Math.min(...m.p.map((p) => p.id)) : 0;
  if (m.g.ph !== "day" && m.g.ph !== "night" && m.g.ph !== "lobby" && dlgOpen) showDlg({ close: 1 });
  // the dialogue box and the server must agree; if they don't for a moment, the box closes (and you're never left frozen)
  if (mr && dlgOpen !== !!mr.dl) { if (!dlgMismatch) dlgMismatch = T(); else if (T() - dlgMismatch > 0.6) { dlgMismatch = 0; if (dlgOpen) showDlg({ close: 1 }); else send({ t: "dlg", i: -1 }); } } else dlgMismatch = 0;
  // same for the card table: if the server has no match for us (new round, reconnect), close it rather than trap the screen
  if (mr && cgState && !mr.cg) { if (!cgMismatch) cgMismatch = T(); else if (T() - cgMismatch > 0.6) { cgMismatch = 0; cgState = null; toggleCards(false); } } else cgMismatch = 0;
  const canMode = joined && hostId === me && (m.g.ph === "lobby" || m.g.ph === "over");
  for (const el of document.querySelectorAll(".modeBtns")) el.classList.toggle("hidden", !canMode);
  for (const b of document.querySelectorAll(".modeBtns button")) b.classList.toggle("sel", b.dataset.m === m.g.mode);
  renderLobby(m, hostId);
  if (m.g.intro) { const start = T() - m.g.intro.at; if (!intro || m.g.ph !== prevPhase || Math.abs(start - intro.start) > 0.4) intro = { start, len: m.g.intro.len, mode: m.g.mode, cast: m.g.intro.cast, prev: m.g.prev, shot: -1 }; intro.skip = m.g.intro.skip; }
  else intro = null;
  if (building && !["day", "night", "royale"].includes(m.g.ph)) toggleBuild(false);
  const mine = m.p.find((p) => p.id === me);
  if (mine && pred.init === false) { pred.x = mine.x; pred.y = mine.y; pred.z = mine.z || 0; pred.init = true; }
  if (mine) {
    const mv = mine.mv || [0, 0, 0, 1];
    pred.srv = { x: mine.x, y: mine.y, z: mine.z || 0, vx: mv[0], vy: mv[1], vz: mv[2], gr: !!mv[3] };
    if (mine.d) { pred.x = mine.x; pred.y = mine.y; pred.z = mine.z || 0; }
    if (!yawInit && !mine.d) { yaw = mine.a; yawInit = true; }
  }
}
function handleEvent(e) {
  const t = T();
  if (e.k === "tr") { fx.push({ kind: "tr", t0: t, dur: e.c === "laser" ? 0.6 : e.c === "sniper" ? 0.25 : 0.12, col: parseInt((TRACER[e.c] || "#ffffff").slice(1), 16), ...e }); if (e.c !== "rico" && Math.hypot(e.x1 - pred.x - Math.cos(aimYaw) * 20, e.y1 - pred.y - Math.sin(aimYaw) * 20) < 24) { lastShotT = t; ownShot(e.c, t); } sfxAt({ x: e.x1, y: e.y1, far: e.c === "sniper" || e.c === "laser" || e.c === "rocket" ? 2600 : 1800 }, "shot", 1, e.c); }
  else if (e.k === "boom") { fx.push({ kind: "boom", t0: t, dur: e.small ? 0.25 : 0.4, ...e }); nearShake(e, e.small ? 3 : 8); sfxAt({ x: e.x, y: e.y, far: e.small ? 1200 : 3000 }, "boom", e.small ? 0.35 : 1); }
  else if (e.k === "shout") { const el = ELEMS[e.el] || ELEMS.force; fx.push({ kind: "shout", t0: t, dur: 0.7, ...e, text: e.text || el.word + "!", col: el.hex, c2: el.rgb }); nearShake(e, 10); sfxAt({ x: e.x, y: e.y, far: 1400 }, "shout", 1, e.el); }
  else if (e.k === "burn") fx.push({ kind: "burn", t0: t, dur: 0.8, x: e.x + (Math.random() - 0.5) * 20, y: e.y });
  else if (e.k === "trample") fx.push({ kind: "text", t0: t, dur: 1, x: e.x, y: e.y, text: e.burnt ? "burnt!" : "trampled!", color: e.burnt ? "#f84" : "#c96" });
  else if (e.k === "roar") { fx.push({ kind: "shout", t0: t, dur: e.psy ? 1.4 : 0.8, x: e.x, y: e.y, a: 0, full: true, ...(e.rex ? { col: 0xc8a040, c2: "200,160,64" } : e.psy ? { col: 0xc060ff, c2: "192,96,255" } : {}) }); shake = Math.max(shake, e.rex || e.psy ? 18 : 12); if (e.rex) sfxAt({ x: e.x, y: e.y, far: 1600 }, "rex"); if (e.psy) sfxAt({ x: e.x, y: e.y, far: 2000 }, "psy"); }
  // Bug Night and mechs
  else if (e.k === "bugs") { sfx("bugs"); bugNightT = t; }
  else if (e.k === "bughole") { fx.push({ kind: "boom", t0: t, dur: 0.6, x: e.x, y: e.y, r: 50, dust: true, col: 0x6a4a2a }); sfxAt({ x: e.x, y: e.y, far: 1100 }, "chitter"); }
  else if (e.k === "sealed") { fx.push({ kind: "text", t0: t, dur: 2, x: e.x, y: e.y, z: 70, text: "HOLE SEALED", color: "#c0ff80", big: true }); sfxAt({ x: e.x, y: e.y, far: 2000 }, "perfect"); }
  else if (e.k === "part") { fx.push({ kind: "text", t0: t, dur: 2.5, x: e.x, y: e.y, z: 50, text: "MECH PART", color: "#ffc030", big: true }); }
  else if (e.k === "mechcall") { fx.push({ kind: "shout", t0: t, dur: 4, x: e.x, y: e.y, a: 0, full: true, col: 0xff3030, c2: "255,48,48" }); sfxAt({ x: e.x, y: e.y, far: 1500 }, "siren", 0.25); }
  else if (e.k === "mechland") { fx.push({ kind: "boom", t0: t, dur: 0.9, x: e.x, y: e.y, r: 120, dust: true }); fx.push({ kind: "boom", t0: t, dur: 0.4, x: e.x, y: e.y, r: 60 }); nearShake(e, 20); sfxAt({ x: e.x, y: e.y, far: 3000 }, "boom"); }
  else if (e.k === "slam") { nearShake(e, 16); sfxAt({ x: e.x, y: e.y, far: 2000 }, "boom", 0.8); }
  else if (e.k === "jet") { sfxAt({ x: e.x, y: e.y, far: 1200 }, "boost"); }
  else if (e.k === "spit") { sfxAt({ x: e.x, y: e.y, far: 1300 }, "bile", 0.6); }
  else if (e.k === "flame" || e.k === "acid") { fx.push({ kind: e.k, t0: t, dur: 0.3, ...e }); if (Math.random() < 0.35) sfxAt({ x: e.x, y: e.y, far: 900 }, e.k === "acid" ? "bile" : "fireburst"); }
  else if (e.k === "hhit") { hearthHitT = t; }
  else if (e.k === "feed") pushLim(feed, { text: e.text, color: e.color, t }, 6);
  else if (e.k === "chat") pushLim(chatLog, { from: e.from, text: e.text, color: e.color, t }, 8);
  else if (e.k === "say") bubbles.set(e.id, { text: e.text, t });
  else if (e.k === "ping") addPing(e, t);
  else if (e.k === "banner") { banner = { text: e.text, sub: e.sub, t }; sfx("banner"); if (e.npc) { const n = S && S.np && S.np.find((q) => q[0] === e.npc); if (n && Math.hypot(n[1] - pred.x, n[2] - pred.y) < 600) speakNpc(e.npc, ARRIVE_LINE[e.npc] || ""); } } // only the people standing there hear them
  else if (e.k === "vote") { sfx("banner"); pushLim(toasts, { text: "The town meeting is open until dusk. Press N to vote.", color: "#e0c0ff", t }, 4); }
  else if (e.k === "clue") { sfx("lvl"); clueT = t; }
  else if (e.k === "advsign") { sfx("lvl"); advSignT = t; advSignN = e.n; }
  else if (e.k === "lcharge") { sfxAt({ x: e.x, y: e.y, far: 1200 }, "lcharge"); }
  else if (e.k === "armbreak") { fx.push({ kind: "boom", t0: t, dur: 0.3, x: e.x, y: e.y, z: e.z, r: 26, col: 0xb0b8c0 }); sfxAt({ x: e.x, y: e.y, far: 700 }, "armbreak"); }
  else if (e.k === "podin") { if (e.id === me) sfx("boom", 0.4); }
  else if (e.k === "podland") { nearShake(e, 14); sfxAt({ x: e.x, y: e.y, far: 900 }, "boom"); }
  else if (e.k === "land") fx.push({ kind: "boom", t0: t, dur: 0.35, x: e.x, y: e.y, r: 30, dust: true });
  else if (e.k === "built") { fx.push({ kind: "boom", t0: t, dur: 0.3, x: e.x, y: e.y, r: 24, dust: true }); sfxAt({ x: e.x, y: e.y, far: 500 }, "hit"); }
  else if (e.k === "bhit") pieceHit.set(e.id, t);
  else if (e.k === "cd") sfx("lvl");
  else if (e.k === "legend") { legendT = t; legendKind = e.kind; sfx("banner"); }
  else if (e.k === "mess") { pushLim(messes, { ...e, t }, 60); if (e.drop) { fx.push({ kind: "boom", t0: t, dur: 0.6, x: e.x, y: e.y, r: 70, dust: true, col: e.kind === "poo" ? 0x6a4a20 : 0xe0d040 }); sfxAt({ x: e.x, y: e.y, far: 600 }, "hurt", 0.5); } }
  else if (e.k === "slash") { slashT.set(e.id, t); fx.push({ kind: "slash", t0: t, dur: 0.22, ...e }); sfxAt({ x: e.x, y: e.y, far: 600 }, "shout", 0.25); }
  else if (e.k === "shame") { shameT = t; shameWho = e; sfx("shame"); shake = Math.max(shake, 10); sayShame(e.who); }
  else if (e.k === "bile") { fx.push({ kind: "boom", t0: t, dur: 0.7, x: e.x, y: e.y, z: e.z, r: e.r * 0.7, col: 0x9fd040, c2: "159,208,64" }); sfxAt({ x: e.x, y: e.y, far: 600 }, "bile"); }
  else if (e.k === "scream") { fx.push({ kind: "shout", t0: t, dur: 1.2, x: e.x, y: e.y, z: e.z, a: 0, full: true, col: 0xff4040 }); sfxAt({ x: e.x, y: e.y, far: 900 }, "scream"); }
  else if (e.k === "dust") { // Dust II: the radio calls it
    const near = inDustC() || (DUSTR && Math.hypot(pred.x - (DUSTR.x + DUSTR.w / 2), pred.y - (DUSTR.y + DUSTR.h / 2)) < 2200);
    if (near) {
      if (e.text) { banner = { text: e.text, sub: e.sub, t }; sfx("banner"); }
      const LINE = { go: "Go go go!", move: "Terrorists are moving.", planted: "The bomb has been planted.", ct: "Counter-terrorists win.", t: "Terrorists win." }[e.say];
      if (LINE) speakNpc("radio", LINE);
      if (e.say === "planted") sfx("ding", 1, 1);
    } else if (e.say === "ct" || e.say === "t") pushLim(feed, { text: `Dust II: ${e.text.toLowerCase()}`, color: "#e0c080", t }, 6);
  }
  else if (e.k === "ding") { sfxAt({ x: e.x, y: e.y, far: 600 }, "ding", 1, e.b); }
  else if (e.k === "glass" && e.id === undefined) { /* a molotov bottle smashing; a window pane (with an id) is handled below */ fx.push({ kind: "boom", t0: t, dur: 0.35, x: e.x, y: e.y, z: e.z, r: 50, col: 0xffa030, c2: "255,160,48" }); sfxAt({ x: e.x, y: e.y, far: 700 }, "glass"); }
  else if (e.k === "throw") { if (Math.hypot((S?.p.find((p) => p.id === e.id)?.x ?? 1e9) - pred.x, (S?.p.find((p) => p.id === e.id)?.y ?? 1e9) - pred.y) < 600) sfx("throw"); }
  else if (e.k === "mv") { if (e.id !== me) sfxAt({ x: e.x, y: e.y, far: 600 }, e.m === "slide" ? "slide" : e.m === "boost" ? "boost" : e.m === "mantle" || e.m === "wallrun" ? "step" : "whoosh", 0.5); }
  else if (e.k === "kd") { sfxAt({ x: e.x, y: e.y, far: 700 }, "hit"); sfxAt({ x: e.x, y: e.y, far: 700 }, "kick", 0.7); }
  else if (e.k === "pad") { sfxAt({ x: e.x, y: e.y, far: 600 }, "perfect", 0.6); }
  else if (e.k === "splash") { fx.push({ kind: "boom", t0: t, dur: 0.6, x: e.x, y: e.y, z: -12, r: 40, dust: true, col: 0xbfe8ff, c2: "190,230,255" }); sfxAt({ x: e.x, y: e.y, far: 600 }, "splash"); }
  else if (e.k === "glyph") { fx.push({ kind: "shout", t0: t, dur: 0.9, x: e.x, y: e.y, z: e.z, a: 0, full: true, col: e.g < 0 ? 0xff4040 : 0x60e0ff, c2: e.g < 0 ? "255,64,64" : "96,224,255" }); sfxAt({ x: e.x, y: e.y, far: 700 }, e.g < 0 ? "jam" : "perfect"); }
  else if (e.k === "wedding") { sfx("goal"); for (let i = 0; i < 18; i++) fx.push({ kind: "text", t0: t + i * 0.05, dur: 2, x: pred.x + (Math.random() - 0.5) * 300, y: pred.y + (Math.random() - 0.5) * 200, z: 60 + Math.random() * 60, text: "♥", color: ["#ff8fc8", "#ff5fa0", "#fff"][i % 3], big: true }); }
  else if (e.k === "glass") {
    if (MAP) { MAP.walls = MAP.walls.filter((w) => w.id !== e.id); chunkVer++; MAP.cv = chunkVer; }
    sfxAt({ x: e.x, y: e.y, far: 900 }, "glass");
    fx.push({ kind: "boom", t0: t, dur: 0.45, x: e.x, y: e.y, z: e.z, r: 24, col: 0xbfe2f0 });
  }
  else if (e.k === "collapse") { fx.push({ kind: "boom", t0: t, dur: 0.9, x: e.x, y: e.y, z: 10, r: Math.max(e.w, e.h) * 0.6, dust: true }); sfxAt({ x: e.x, y: e.y, far: 1800 }, "boom", 0.6); if (Math.hypot(e.x - pred.x, e.y - pred.y) < 700) shake = Math.max(shake, 6); }
  else if (e.k === "zap") { fx.push({ kind: "zap", t0: t, dur: 0.35, pts: e.pts }); if (Math.hypot(e.pts[0][0] - pred.x, e.pts[0][1] - pred.y) < 900) sfx("zap"); }
  else if (e.k === "meteor") { fx.push({ kind: "boom", t0: t, dur: 0.8, x: e.x, y: e.y, z: e.z, r: 170 }); fx.push({ kind: "boom", t0: t, dur: 1.4, x: e.x, y: e.y, z: e.z, r: 120, dust: true }); const d = Math.hypot(e.x - pred.x, e.y - pred.y); sfxAt({ x: e.x, y: e.y, far: 3500 }, "boom"); if (d < 1200) { shake = Math.max(shake, 16 * (1 - d / 1200)); } }
  else if (e.k === "quake") shake = Math.max(shake, 14);
  else if (e.k === "moon") moonEvent(e, t); // Moonfall (13-moon.js)
  else if (e.k === "siren") { sirenT = t; sfx("siren"); }
  else if (e.k === "nuke") { nukeFx = { x: e.x, y: e.y, t }; shake = Math.max(shake, 30); sfx("nuke"); }
  else if (e.k === "hatch") { sfxAt({ x: e.x, y: e.y, far: 500 }, "click"); }
  else if (e.k === "ballkick") { sfxAt({ x: e.x, y: e.y, far: 600 }, "kick"); }
  else if (e.k === "goal") { sfx("goal"); fx.push({ kind: "text", t0: t, dur: 2, x: e.x, y: e.y, z: 80, text: "GOAL!", color: "#ffd34d", big: true }); }
  else if (e.k === "vault") { fx.push({ kind: "text", t0: t, dur: 2.5, x: e.x, y: e.y, z: 80, text: "VAULT OPEN", color: "#ffd34d", big: true }); sfxAt({ x: e.x, y: e.y, far: 1200 }, "jackpot"); }
  else if (e.k === "alarm") { fx.push({ kind: "shout", t0: t, dur: 1.5, x: e.x, y: e.y, a: 0, full: true, col: 0xff3030, c2: "255,48,48" }); sfxAt({ x: e.x, y: e.y, far: 1000 }, "alarm"); }
  else if (e.k === "hacked") { fx.push({ kind: "text", t0: t, dur: 1.6, x: e.x, y: e.y, z: (e.tz || 0) + 60, text: e.of ? `TERMINAL ${e.of[0]}/${e.of[1]}` : `ACCESS GRANTED ${e.n}/3`, color: "#7dffb0", big: true }); sfxAt({ x: e.x, y: e.y, far: 700 }, "perfect"); }
}
function handlePersonal(e) {
  const t = T();
  if (e.k === "toast") { pushLim(toasts, { text: e.text, color: e.color, t }, 4); if (/^(Bought|Upgraded)/.test(e.text)) sfx("perfect", 0.5); else if (e.color === "#f88") sfx("hit", 0.6); } // a ka-ching when it worked, a dull thud when it didn't
  else if (e.k === "travel") { sfx("banner"); banner = { text: e.to.toUpperCase(), sub: "The coach rattles off without you.", t }; pred.init = false; }
  else if (e.k === "dmg") {
    fx.push({ kind: "text", t0: t, dur: 0.7, x: e.x + (Math.random() - 0.5) * 16, y: e.y, z: e.z, text: e.wk ? `${e.v}!!` : e.hs ? `${e.v}!` : String(e.v), color: e.ff ? "#ff5050" : e.wk ? "#ff3030" : e.hs ? "#ff9d2e" : e.arm ? "#9aa4ad" : e.crit ? "#ffd34d" : "#fff", big: e.crit || e.hs || e.wk });
    // hitmarkers: a different mark and sound for body, headshot, weak point, armour and the kill
    hitT = t; hitKind = e.kill ? "kill" : e.wk ? "wk" : e.hs ? "hs" : e.arm ? "arm" : "body";
    if (e.hs) hsT = t;
    sfx(e.wk ? "weak" : e.hs ? "hs" : e.arm ? "clank" : "hit"); if (e.kill) sfx("kill");
    { const w = (S && S.p.find((q) => q.id === me) || {}).w; // impact frames on the hits that matter
      if (e.wk) impactFrame("wk"); else if (e.big && e.kill) impactFrame("big"); else if (e.hs && (e.kill || !AUTO_GUNS.has(w))) impactFrame("hs"); else if (e.kill && (w === "sword" || w === "sniper" || w === "laser")) impactFrame(w === "sword" ? "big" : "hs"); }
  }
  else if (e.k === "fitted") sfx("clank");
  else if (e.k === "lvl") { achieve(`Level ${e.lvl}`, `A skill point to spend: press ${keyFor("skills")}`, t); sfx("lvl"); }
  else if (e.k === "perfect") { pushLim(toasts, { text: "PERFECT RELOAD  +20% damage this mag" + (S && S.p && (S.p.find((q) => q.id === me) || {}).w === "ak" ? ", and no more maybe" : ""), color: "#7dffb0", t }, 4); sfx("perfect"); }
  else if (e.k === "jam") { pushLim(toasts, { text: "Fumbled the reload!", color: "#ff8080", t }, 4); sfx("jam"); }
  else if (e.k === "gold") pushLim(toasts, { text: `+${e.amt}g  ${e.reason}`, color: "#ffd34d", t }, 4);
  else if (e.k === "hurt") { hurtFlash = t; shake = Math.max(shake, 5); sfx("hurt"); if (e.fx !== undefined) hitFrom(e.fx, e.fy, t); }
  else if (e.k === "eff") fx.push({ kind: "text", t0: t, dur: 1, x: e.x, y: e.y, z: e.z, text: e.m > 1 ? "SUPER EFFECTIVE!" : "not very effective...", color: e.m > 1 ? "#ffd34d" : "#9aa", big: e.m > 1 });
  else if (e.k === "click") sfx("click");
  else if (e.k === "jammed") { pushLim(toasts, { text: "JAMMED! Press R to clear it. Press L to strip and clean your gun.", color: "#ff8060", t }, 4); sfx("jam"); }
  else if (e.k === "hack") openHack(e);
  else if (e.k === "fix") openFix(e);
  else if (e.k === "love") { const n = MAP.npcs && MAP.npcs.find((q) => q.id === e.npc); pushLim(toasts, { text: `${n ? n.name : ""}  ${hearts(e.v)}`, color: e.d === "hate" ? "#ff8080" : "#ff8fc8", t }, 4); sfx(e.d === "hate" ? "jam" : "perfect"); }
  else if (e.k === "kick") { pred.vx += e.vx; pred.vy += e.vy; pred.vz = Math.max(pred.vz, 0) + e.vz; if (e.vz > 0) pred.gr = false; }
  else if (e.k === "deaf") { deafT = t; shake = Math.max(shake, 8); }
  else if (e.k === "psy") { psyT = t; }
  else if (e.k === "wasted") { wasted = t; wastedPlace = e.place || 0; }
  else if (e.k === "dlg") showDlg(e);
  else if (e.k === "inv") { INV = e; if (invOpen) renderInv(); if (cardsOpen && !cgState) renderCards(); if (mktOpen) renderMarket(); }
  else if (e.k === "mkh") { mkHist = e.hist; if (mktOpen) renderMarket(); }
  else if (e.k === "cg") { if (e.close) { cgState = null; if (cardsOpen) toggleCards(false); } else { const fresh = !cgState || cgState.v.turn !== e.v.turn || e.v.over; cgState = e; if (fresh) cgStaged = []; toggleCards(true); renderCards(); } }
  else if (e.k === "stall") { if (!stallOpen) speakNpc("giles", "What've you got for me?"); toggleStall(true); }
  else if (e.k === "shop") { const fresh = !shopOpen || shopSid !== e.sid; shopAt = e.at || null; toggleShop(true, e.sid); if (fresh) speakNpc(SHOP_VOICE[e.sid], SHOP_BLURB[e.sid]); }
  else if (e.k === "pack") { pushLim(toasts, { text: `New card${e.cards.length > 1 ? "s" : ""}: ${e.cards.map((c) => CARDS[c] ? CARDS[c].name : c).join(", ")}  [Y]`, color: "#ffd34d", t }, 4); sfx("perfect"); }
  else if (e.k === "wheel") { wheelAnim = { t0: t, from: wheelAngle, seg: e.seg }; sfx("banner"); toggleCasino(true); }
  else if (e.k === "casino") { casinoState = e; if (e.game || e.open || (e.spins && wantCasino)) { wantCasino = false; toggleCasino(true); } renderCasino(); }
  else if (e.k === "slots") { sfx("reel"); setTimeout(() => { sfx(e.win >= 30 ? "jackpot" : e.win ? "perfect" : "click"); pushLim(toasts, { text: `[ ${e.r.map((i) => ["🍒", "🍋", "🔔", "💎", "7", "🧟"][i]).join(" | ")} ]  ${e.msg}${e.win ? ` +${e.win}g` : ""}`, color: e.win ? "#ffd34d" : "#bbb", t: T() }, 4); }, 450); }
  else if (e.k === "cos") { myCos = e.list; if (wardOpen) renderWardrobe(); }
  else if (e.k === "fog") fogT = t;
  else if (e.k === "case" && e.spins) { wantCasino = true; caseAnim = { t0: t, type: e.type, rarity: e.rarity, name: e.name, reel: makeReel(e.type, e.rarity, e.name) }; }
  else if (e.k === "case") caseAnim = { t0: t, type: e.type, rarity: e.rarity, name: e.name, reel: makeReel(e.type, e.rarity, e.name) };
  else if (e.k === "enh") { enhAnim = { t0: t, ...e }; sfx(e.ok ? "lvl" : "jam"); }
  else if (e.k === "sym") { symT = t; pushLim(toasts, { text: e.text, color: e.sym ? "#9fdc5a" : "#8f8", t }, 4); if (e.sym) { sfx("hurt"); keys.clear(); } }
  else if (e.k === "accident") { shake = Math.max(shake, 6); sfx("jam"); }
  else if (e.k === "unlucky") { banner = { text: "THE 0.004%", sub: `Level ${e.lv}, every skill point and every upgrade: gone. It was always going to be someone.`, t }; sfx("banner"); shake = 14; }
}
const messes = [];
let symT = -9, adsDown = false, adsZoom = 1, watcher = null;
function pushLim(arr, v, n) { if ((arr === feed || arr === toasts) && v && v.text) logMsg(v); arr.push(v); while (arr.length > n) arr.shift(); }
// ---------------------------------------------------------------- weapon feel: recoil, view punch, impact frames
// [view punch (radians, just the camera), climb (how far it really pushes your aim up), screen shake]
const RECOIL = { pistol: [0.035, 0.012, 2.5], smg: [0.016, 0.005, 1.4], rifle: [0.028, 0.009, 2.4], ak: [0.04, 0.013, 3], shotgun: [0.09, 0.028, 7], sniper: [0.12, 0.03, 8], staff: [0.03, 0.004, 3], rocket: [0.1, 0.02, 9], laser: [0.16, 0.03, 14] };
const AUTO_GUNS = new Set(["smg", "ak", "rifle"]);
const MODE_ICON = { ricochet: "↯", fire: "🔥", frost: "❄", storm: "⚡", boom: "💥" };
const ATT_ICON = { dot: "🔴", mag: "▮▮", comp: "≋" };
let punch = 0, punchYaw = 0, lastOwnShot = -9, impact = null, impactLast = -9;
function ownShot(type, t) {
  if (t - lastOwnShot < 0.02) return; // a shotgun's pellets are one shot
  lastOwnShot = t;
  const r = RECOIL[type]; if (!r) return;
  const mine = S && S.p.find((q) => q.id === me), comp = mine && (mine.wat || "").includes("comp") ? 0.6 : 1, calm = (crouching() ? 0.7 : 1) * (aiming() ? 0.8 : 1);
  punch += r[0] * comp; punchYaw += (Math.random() - 0.5) * r[0] * 0.6 * comp;
  pitch = Math.min(1.45, pitch + r[1] * comp * calm);
  shake = Math.max(shake, r[2] * comp);
  if (PARTS[type] && type !== "shotgun") setTimeout(() => sfx("casing"), 260 + Math.random() * 120); // brass on the floor
}
function impactFrame(kind) {
  const t = T();
  if (OPTS.impact === false || t - impactLast < 0.3) return;
  impactLast = t;
  impact = { t0: t, until: t + (kind === "big" ? 0.11 : kind === "wk" ? 0.085 : 0.065), kind, drawn: false };
}
function drawImpact() { // one held, high-contrast frame: the screen stops for a blink
  ctx.setTransform(DPR * UIS, 0, 0, DPR * UIS, 0, 0);
  const cx = VW / 2, cy = VH / 2, red = impact.kind === "wk";
  ctx.fillStyle = red ? "rgba(255,40,30,0.22)" : "rgba(255,255,255,0.28)"; ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 3;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + Math.random() * 0.2, r0 = Math.min(VW, VH) * (0.18 + Math.random() * 0.06); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * VW, cy + Math.sin(a) * VW); ctx.stroke(); }
  ctx.strokeStyle = red ? "#ff3030" : "#fff"; ctx.lineWidth = 5;
  for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(cx - 22, cy - 22 * s); ctx.lineTo(cx - 8, cy - 8 * s); ctx.moveTo(cx + 8, cy + 8 * s); ctx.lineTo(cx + 22, cy + 22 * s); ctx.stroke(); }
}
function nearShake(e, amt) { if (Math.hypot(e.x - pred.x, e.y - pred.y) < 500) shake = Math.max(shake, amt); }
let psyT = -99, bugNightT = -99; // the Brain Bug in your head; when Bug Night started
let shameT = -99, shameWho = null, deafT = -99, cleanOpen = false, hackOpen = false;
let hitT = -9, hitKind = "body";
let hudTop = 84, nukeBottom = 0; // how far down the top-centre HUD reaches this frame
let advSignT = -9, advSignN = 0;
let hearthHitT = 0, hsT = -9, localReloadTry = 0, wastedPlace = 0, fogT = -9, clueT = -9, legendT = -99, legendKind = null, intro = null;
const pieceHit = new Map();
const rel = { end: 0, total: 1, tried: false };
// H is the quick-use key: inject an antidote if you're infected, heal if you're hurt, otherwise eat or drink.
// Injecting is a small timing check: press H again while the needle is in the green.
const inj = { t0: 0, lock: 0 };
const bagHas = (id) => (INV && INV.bag ? INV.bag.filter((b) => b.id === id).reduce((a, b) => a + (b.n || 1), 0) : 0);
function quickPlan(mine) {
  if (!mine) return null;
  if (mine.inf && bagHas("antidote")) return { icon: "💉", label: inj.t0 ? "H in the green!" : "Inject antidote", col: "#9fdc5a" };
  if (mine.hp < mine.mh * 0.7) for (const id of ["medkit", "bandage"]) if (bagHas(id)) return { icon: id === "medkit" ? "⛑" : "🩹", label: `${id === "medkit" ? "Medkit" : "Bandage"} (${bagHas(id)})`, col: "#ff8080" };
  return { icon: "🍞", label: "Eat or drink", col: "#ffd34d" };
}
function quickUse() {
  const mine = S?.p.find((p) => p.id === me), t = T();
  if (mine && mine.inf && bagHas("antidote")) {
    if (t < inj.lock) return;
    if (!inj.t0) { inj.t0 = t; sfx("click"); return; }
    const k = ((t - inj.t0) / 1.1) % 1, ok = k > 0.42 && k < 0.62;
    inj.t0 = 0; if (!ok) inj.lock = t + 0.8;
    send({ t: "item", a: "inject", ok: ok ? 1 : 0 }); sfx(ok ? "perfect" : "jam");
    return;
  }
  send({ t: "item", a: "quick" });
}
function makeReel(type, rarity, name) {
  const types = Object.keys(WNAME).filter((k) => k !== "pistol");
  const reel = [];
  for (let i = 0; i < 40; i++) { const r = Math.random() * 100; reel.push({ type: types[(Math.random() * types.length) | 0], rarity: r < 4 ? 3 : r < 15 ? 2 : r < 40 ? 1 : 0 }); }
  reel[34] = { type, rarity, name };
  return reel;
}

// ---------------------------------------------------------------- full-screen tints
// The big screen-wide glows (aiming down sights, low health, getting hit, on fire, the sniper scope) are CSS layers
// between the 3D view and the HUD canvas. They used to be fresh canvas gradients painted over the whole HUD canvas
// (at full screen resolution) every frame, which is what made aiming down sights drop the framerate.
// Call tint(id, alpha) each frame it should show; any layer not asked for that frame fades out by itself.
const TINTS = {
  ads: "radial-gradient(circle 75vh, #0000 33.3%, #000 100%)",
  low: "radial-gradient(circle 85vh, #0000 41.2%, rgb(170,0,0) 100%)",
  hurt: "radial-gradient(circle 80vh, #0000 37.5%, rgb(200,0,0) 100%)",
  fire: "radial-gradient(circle 80vh, #0000 31.2%, rgb(255,110,20) 100%)",
  bile: "rgb(140,190,40)",
  fog: "rgb(120,40,160)",
  scope: "radial-gradient(circle 44vh, #0000 99.6%, #000 100%)",
};
const tintEl = {}, tintWant = {};
let tintSeen = -1;
for (const [id, bg] of Object.entries(TINTS)) {
  const el = document.createElement("div");
  el.className = "tint";
  el.style.cssText = `position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0;background:${bg}`;
  cv.parentNode.insertBefore(el, cv); // same layer as the HUD canvas but painted under it
  tintEl[id] = el; el._a = 0;
}
function tint(id, a) { tintWant[id] = Math.max(tintWant[id] || 0, a); }
requestAnimationFrame(function tintFrame() { // first runs after every client file has loaded (frameNo lives in 10-render)
  requestAnimationFrame(tintFrame);
  if (frameNo === tintSeen) return; // an impact frame holds the picture, so hold the tints too
  tintSeen = frameNo;
  for (const id in tintEl) {
    const el = tintEl[id], a = Math.round(Math.min(1, tintWant[id] || 0) * 100) / 100;
    if (a !== el._a) { el._a = a; el.style.opacity = a; } // only touch the style when it changes
    tintWant[id] = 0;
  }
});
