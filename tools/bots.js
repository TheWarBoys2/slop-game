// Headless bot playtest: `bun tools/bots.js [url] [count]`. Bots wander, shoot the nearest zombie, farm and shop.
const url = process.argv[2] || "ws://localhost:7777/ws";
const count = Number(process.argv[3] || 4);
const classes = ["fighter", "rogue", "wizard", "farmer", "gaffer"];
let seen = { phases: new Set(), over: null, maxZ: 0, errors: 0, stories: [], ending: null, lv: 0 };
for (let i = 0; i < count; i++) {
  const ws = new WebSocket(url);
  let S = null, me = 0;
  ws.onopen = () => ws.send(JSON.stringify({ t: "join", name: "Bot" + i, color: "#40d0c0", hat: "crown", cls: classes[i % 5], bg: ["soldier","noble","urchin"][i % 3], trait: i ? "random" : "Lucky", eyes: "googly" }));
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t !== "s") return;
    S = m; me = m.me;
    seen.phases.add(m.g.ph + m.g.n); seen.hh = m.g.hh; seen.maxZ = Math.max(seen.maxZ, m.z.length);
    if (m.g.ph === "over" && !seen.over) { seen.over = m.stats; seen.ending = m.ending; }
    const mp = m.p.find((q) => q.id === m.me); if (mp) seen.lv = Math.max(seen.lv, mp.lv);
    const mine = m.p.find((q) => q.id === m.me);
    if (m.g.ph === "lobby" || (m.g.ph === "over" && process.env.AGAIN)) { if (process.env.ROYALE && m.g.mode !== "royale") ws.send(JSON.stringify({ t: "mode", m: "royale" })); else if (mine && !mine.rd) ws.send(JSON.stringify({ t: "ready", v: true })); }
    if (m.g.intro && Math.random() < 0.02) ws.send(JSON.stringify({ t: "skip" }));
    if (m.g.intro) seen.intro = true;
    if (m.g.cd >= 0) seen.cd = true;
    seen.veh = Math.max(seen.veh || 0, m.p.filter((q) => q.vh).length); seen.builds = Math.max(seen.builds || 0, m.b.length);
    if (m.g.now) seen.legend = m.g.now; if (m.g.legend) seen.reckoned = m.g.legend;
    if (m.map === undefined && m.g && m.g.deeds) seen.deeds = m.g.deeds;
    for (const e of m.pe) if (e.k === "casino") {
      seen.casino = (seen.casino || 0) + 1;
      const g = e.game;
      if (g) { seen.games = seen.games || {}; seen.games[g.k + (g.over || g.stage === "done" ? "-done" : "")] = 1; if (g.msg && (g.over || g.stage === "done")) seen.lastMsg = g.msg; }
      const act = !g ? (e.spins ? { t: "spin" } : null) : g.k === "bj" ? { t: "casino", a: g.over ? "leave" : g.next ? "deal" : Math.random() < 0.5 ? "hit" : "stand" } : { t: "casino", a: g.stage === "hold" ? "draw" : "leave", hold: [1, 0, 1, 0, 1].map((x) => !!x) };
      if (act) setTimeout(() => ws.send(JSON.stringify(act)), 300);
    }
    for (const e of m.pe) if (e.k === "cos") { seen.cos = e.list.length; ws.send(JSON.stringify({ t: "equip", slot: "hat", id: e.list.find((c) => !["degen", "bandit", "shark", "roller"].includes(c)) || "crown" })); }
    for (const e of m.pe) if (e.k === "wheel") seen.spins = (seen.spins || 0) + 1;
    for (const e of m.pe) if (e.k === "dlg" && !e.close) { seen.dlg = (seen.dlg || 0) + 1; setTimeout(() => ws.send(JSON.stringify({ t: "dlg", i: (Math.random() * e.opts.length) | 0 })), 100); }
    seen.clues = m.g.clues.length; seen.alive = m.g.alive; seen.zone = m.g.zone && m.g.zone[2];
  };
  ws.onerror = () => seen.errors++;
  setInterval(() => {
    if (!S) return;
    const p = S.p.find((q) => q.id === me); if (!p) return;
    let tgt = null, bd = 1e12;
    for (const z of S.z) { const d = (z[2] - p.x) ** 2 + (z[3] - p.y) ** 2; if (d < bd) { bd = d; tgt = z; } }
    const a = tgt ? Math.atan2(tgt[3] - p.y, tgt[2] - p.x) : Math.random() * 7;
    const k = [1, 2, 4, 8][(Date.now() / 700 + i) % 4 | 0];
    ws.send(JSON.stringify({ t: "in", k, a, f: !process.env.PASSIVE && !!tgt && bd < 700 ** 2 }));
    const r = Math.random();
    if (p.air === 1 && Math.random() < 0.05) ws.send(JSON.stringify({ t: "dodge" }));
    if (r < 0.02) ws.send(JSON.stringify({ t: "use" }));
    else if (r < 0.03) ws.send(JSON.stringify({ t: "shout" }));
    else if (r < 0.04) ws.send(JSON.stringify({ t: "dodge" }));
    else if (r < 0.05) ws.send(JSON.stringify({ t: "buy", item: ["case", "enhance", "seeds", "medkit", "repair", "kevlar", "gcase", "gcase"][(Math.random() * 8) | 0] }));
    else if (r < 0.055) ws.send(JSON.stringify({ t: "chat", text: "sul sul" }));
    else if (r < 0.06) ws.send(JSON.stringify({ t: "build", kind: ["wall", "spikes", "turret", "lamp"][(Math.random() * 4) | 0], x: p.x + (Math.random() - 0.5) * 300, y: p.y + (Math.random() - 0.5) * 300 }));
    else if (r < 0.07) ws.send(JSON.stringify({ t: "reload" }));
    if (S.vote && Math.random() < 0.05) ws.send(JSON.stringify({ t: "vote", i: (Math.random() * S.vote.ch.length) | 0 }));
    if (p.pts > 0) ws.send(JSON.stringify({ t: "learn", s: ["deadeye", "steady", "quick", "tough", "wind", "fleet", "green", "haggler", "scavenger", "thuum", "rally", "bloodlust"][(Math.random() * 12) | 0] }));
    if (S.story && !seen.stories.includes(S.story.title + ": " + S.story.pick)) seen.stories.push(S.story.title + ": " + S.story.pick);
  }, 50);
}
setInterval(() => console.log(JSON.stringify({ phases: [...seen.phases], maxZ: seen.maxZ, hh: seen.hh, errors: seen.errors, lv: seen.lv, dlg: seen.dlg, clues: seen.clues, alive: seen.alive, zone: seen.zone, casino: seen.casino, spins: seen.spins, games: seen.games, cos: seen.cos, lastMsg: seen.lastMsg, intro: seen.intro, cd: seen.cd, veh: seen.veh, builds: seen.builds, legend: seen.legend, reckoned: seen.reckoned, deeds: seen.deeds, stories: seen.stories, ending: seen.ending, over: seen.over && seen.over.map((r) => [r.name, r.rating, r.kills, r.hs, r.acc, r.deaths]) })), 5000);
