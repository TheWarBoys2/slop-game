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
    if (m.g.ph === "lobby" || (m.g.ph === "over" && process.env.AGAIN)) { const want = process.env.ROYALE ? "royale" : process.env.ENDLESS ? "endless" : "story"; if (m.g.mode !== want) ws.send(JSON.stringify({ t: "mode", m: want })); else if (mine && !mine.rd) ws.send(JSON.stringify({ t: "ready", v: true })); }
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
    for (const e of m.pe) if (e.k === "sym" && e.sym) { seen.sym = seen.sym || {}; seen.sym[e.sym] = (seen.sym[e.sym] || 0) + 1; }
    for (const e of m.pe) if (e.k === "unlucky") seen.unlucky = (seen.unlucky || 0) + 1;
    for (const e of m.e) if (e.k === "mess") { seen.mess = seen.mess || {}; const k = e.kind + (e.big ? "!" : ""); seen.mess[k] = (seen.mess[k] || 0) + 1; }
    for (const e of m.pe) if (e.k === "hack") {
      seen.hacks = (seen.hacks || 0) + 1;
      // a real solver half the time, nonsense the rest
      let best = [], bestN = -1;
      const dfs = (path, used, r, c, i) => {
        const codes = path.map(([a, b]) => e.g[a][b]).join(" "), n = e.seqs.filter((q) => codes.includes(q.join(" "))).length;
        if (n > bestN) { bestN = n; best = path.slice(); }
        if (path.length >= e.buf || n === 3) return;
        for (let k = 0; k < 5; k++) { const cell = i % 2 === 0 ? [r, k] : [k, c]; const key = cell.join(); if (used.has(key)) continue; used.add(key); path.push(cell); dfs(path, used, cell[0], cell[1], i + 1); path.pop(); used.delete(key); }
      };
      if (Math.random() < 0.5) dfs([], new Set(), 0, 0, 0); else best = [[0, 0], [1, 0]];
      setTimeout(() => ws.send(JSON.stringify({ t: "hack", picks: best })), 1500);
    }
    for (const e of m.pe) if (e.k === "fix" && !e.close) {
      seen.fixTry = (seen.fixTry || 0) + 1;
      const wait = { meteor: 11, flood: 4, tornado: 5, quake: 11 }[e.kind] * 1000;
      setTimeout(() => ws.send(JSON.stringify(e.kind === "flood" ? { t: "fix", rots: e.g.map((c) => c[1]) } : { t: "fix", ok: true })), wait);
    }
    for (const e of m.e) if (e.k === "banner" && / STOPPED$/.test(e.text)) seen.fixed = (seen.fixed || 0) + 1;
    for (const e of m.e) if (e.k === "banner" && /DINOSAUR/.test(e.text)) seen.dinoBanner = e.text;
    if (m.g.dd) seen.dinoDay = (seen.dinoDay || 0) + 1;
    if (m.vote) seen.voteTitles = [...new Set([...(seen.voteTitles || []), m.vote.title])];
    if (m.g.elec) seen.elecSeen = 1;
    if (m.g.ph === "lobby" && mine && mine.g) seen.lobbyGold = mine.g;
    for (const e of m.e) if (e.k === "hacked") seen.hacked = (seen.hacked || 0) + 1;
    for (const e of m.e) if (e.k === "alarm") seen.alarms = (seen.alarms || 0) + 1;
    for (const e of m.e) if (e.k === "collapse") seen.collapse = (seen.collapse || 0) + 1;
    for (const e of m.e) if (e.k === "disaster") { seen.dis = seen.dis || {}; seen.dis[e.kind] = 1; }
    for (const e of m.e) if (e.k === "goal") seen.goals = (seen.goals || 0) + 1;
    for (const e of m.e) if (e.k === "zap") seen.zaps = (seen.zaps || 0) + 1;
    for (const e of m.pe) if (e.k === "jammed") seen.jams = (seen.jams || 0) + 1;
    for (const e of m.pe) if (e.k === "eff") { seen.eff = seen.eff || {}; seen.eff[e.m] = (seen.eff[e.m] || 0) + 1; }
    for (const e of m.e) if (e.k === "shame") seen.shame = (seen.shame || 0) + 1;
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
    const st = S.g.dis && S.g.dis.st, goSt = st && i === 0;
    const a = goSt ? Math.atan2(st[1] - p.y, st[0] - p.x) : tgt ? Math.atan2(tgt[3] - p.y, tgt[2] - p.x) : Math.random() * 7;
    if (goSt && (st[0] - p.x) ** 2 + (st[1] - p.y) ** 2 < 60 * 60 && Math.random() < 0.1) ws.send(JSON.stringify({ t: "use" }));
    if (!seen.bugSent && i === 0 && S.g.ph === "day") { seen.bugSent = 1; ws.send(JSON.stringify({ t: "bug", text: "Bot test report: the turnips look at me funny.", errors: ["TypeError: test @ game.js:1"], ua: "bot" })); }
    if (S.g.elec && Math.random() < 0.02) ws.send(JSON.stringify({ t: "elect", i: (Math.random() * S.g.elec.c.length) | 0 }));
    const k = goSt ? 1 : [1, 2, 4, 8][(Date.now() / 700 + i) % 4 | 0] | (i % 2 && Math.random() < 0.3 ? 16 : 0); // odd bots bunny hop
    seen.maxZ3 = Math.max(seen.maxZ3 || 0, p.z || 0);
    ws.send(JSON.stringify({ t: "in", k, a, rel: goSt ? 1 : 0, f: !goSt && !process.env.PASSIVE && !!tgt && bd < 700 ** 2, ads: i % 3 === 0 && !!tgt }));
    if (i % 2 === 0 && Math.max(p.bl, p.bw) > 70 && Math.random() < 0.05) ws.send(JSON.stringify({ t: "go" })); // odd bots just have accidents
    const r = Math.random();
    if (p.air === 1 && Math.random() < 0.05) ws.send(JSON.stringify({ t: "dodge" }));
    if (r < 0.02) ws.send(JSON.stringify({ t: "use" }));
    else if (r < 0.03) ws.send(JSON.stringify({ t: "shout" }));
    else if (r < 0.04) ws.send(JSON.stringify({ t: "dodge" }));
    else if (r < 0.05) ws.send(JSON.stringify({ t: "buy", item: ["case", "enhance", "seeds", "medkit", "repair", "kevlar", "gcase", "hoe", "grenade", "molotov", "rocket"][(Math.random() * 11) | 0] }));
    else if (r < 0.055) ws.send(JSON.stringify({ t: "chat", text: "sul sul" }));
    else if (r < 0.06) ws.send(JSON.stringify({ t: "build", kind: ["wall", "spikes", "turret", "lamp"][(Math.random() * 4) | 0], x: p.x + (Math.random() - 0.5) * 300, y: p.y + (Math.random() - 0.5) * 300 }));
    else if (r < 0.07) ws.send(JSON.stringify({ t: "reload" }));
    else if (r < 0.075) ws.send(JSON.stringify({ t: "throw", k: Math.random() < 0.5 ? "gren" : "molo" }));
    else if (r < 0.08) ws.send(JSON.stringify({ t: "elem" }));
    if ((p.rl > 0 || p.jam) && Math.random() < 0.3) ws.send(JSON.stringify({ t: "reload" }));
    if (p.dirt > 60 && Math.random() < 0.01) { ws.send(JSON.stringify({ t: "clean", start: true })); setTimeout(() => ws.send(JSON.stringify({ t: "clean", mistakes: (Math.random() * 3) | 0 })), 3000); seen.cleans = (seen.cleans || 0) + 1; }
    seen.stress = Math.max(seen.stress || 0, p.ss || 0); seen.maxWalls = S.ball ? 1 : 0;
    seen.zt = seen.zt || {}; for (const z of S.z) seen.zt[z[1]] = 1;
    seen.fires = Math.max(seen.fires || 0, (S.fi || []).length); seen.projs = Math.max(seen.projs || 0, (S.pr || []).length);
    seen.fog = seen.fog || !!S.g.fog; seen.night = Math.max(seen.night || 0, S.g.n); seen.hoe = Math.max(seen.hoe || 0, p.hoe || 0);
    if (S.vote && Math.random() < 0.05) ws.send(JSON.stringify({ t: "vote", i: (Math.random() * S.vote.ch.length) | 0 }));
    if (p.pts > 0) ws.send(JSON.stringify({ t: "learn", s: ["deadeye", "steady", "quick", "tough", "wind", "fleet", "green", "haggler", "scavenger", "thuum", "rally", "bloodlust"][(Math.random() * 12) | 0] }));
    if (S.story && !seen.stories.includes(S.story.title + ": " + S.story.pick)) seen.stories.push(S.story.title + ": " + S.story.pick);
  }, 50);
}
setInterval(() => console.log(JSON.stringify({ phases: [...seen.phases], maxZ: seen.maxZ, hh: seen.hh, errors: seen.errors, lv: seen.lv, dlg: seen.dlg, clues: seen.clues, alive: seen.alive, zone: seen.zone, casino: seen.casino, spins: seen.spins, games: seen.games, cos: seen.cos, lastMsg: seen.lastMsg, maxZ3: seen.maxZ3, sym: seen.sym, mess: seen.mess, unlucky: seen.unlucky, intro: seen.intro, cd: seen.cd, veh: seen.veh, builds: seen.builds, legend: seen.legend, reckoned: seen.reckoned, deeds: seen.deeds, stories: seen.stories, ending: seen.ending, zt: seen.zt && Object.keys(seen.zt).join(""), fires: seen.fires, projs: seen.projs, fog: seen.fog, night: seen.night, hoe: seen.hoe, shame: seen.shame, hacks: seen.hacks, hacked: seen.hacked, alarms: seen.alarms, collapse: seen.collapse, dis: seen.dis && Object.keys(seen.dis).join(","), fixTry: seen.fixTry, fixed: seen.fixed, dinoBanner: seen.dinoBanner, dinoDay: seen.dinoDay, votes: seen.voteTitles, elec: seen.elecSeen, lobbyGold: seen.lobbyGold, goals: seen.goals, zaps: seen.zaps, jams: seen.jams, eff: seen.eff, cleans: seen.cleans, stress: seen.stress, ball: seen.maxWalls, over: seen.over && seen.over.map((r) => [r.name, r.rating, r.kills, r.hs, r.acc, r.deaths]) })), 5000);
