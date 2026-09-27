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
    if (m.g.ph === "lobby") ws.send(JSON.stringify({ t: "start" }));
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
    if (r < 0.02) ws.send(JSON.stringify({ t: "use" }));
    else if (r < 0.03) ws.send(JSON.stringify({ t: "shout" }));
    else if (r < 0.04) ws.send(JSON.stringify({ t: "dodge" }));
    else if (r < 0.05) ws.send(JSON.stringify({ t: "buy", item: ["case", "enhance", "seeds", "medkit", "repair", "kevlar"][(Math.random() * 6) | 0] }));
    else if (r < 0.055) ws.send(JSON.stringify({ t: "chat", text: "sul sul" }));
    else if (r < 0.07) ws.send(JSON.stringify({ t: "reload" }));
    if (S.vote && Math.random() < 0.05) ws.send(JSON.stringify({ t: "vote", i: (Math.random() * S.vote.ch.length) | 0 }));
    if (p.pts > 0) ws.send(JSON.stringify({ t: "learn", s: ["deadeye", "steady", "quick", "tough", "wind", "fleet", "green", "haggler", "scavenger", "thuum", "rally", "bloodlust"][(Math.random() * 12) | 0] }));
    if (S.story && !seen.stories.includes(S.story.title + ": " + S.story.pick)) seen.stories.push(S.story.title + ": " + S.story.pick);
  }, 50);
}
setInterval(() => console.log(JSON.stringify({ phases: [...seen.phases], maxZ: seen.maxZ, hh: seen.hh, errors: seen.errors, lv: seen.lv, stories: seen.stories, ending: seen.ending, over: seen.over && seen.over.map((r) => [r.name, r.rating, r.kills, r.hs, r.acc, r.deaths]) })), 5000);
