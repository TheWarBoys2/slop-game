// Snapshots are sent as deltas: the server leaves out anything that hasn't changed since the last one it sent,
// and the receiver fills it back in from the previous snapshot. Shared by the server (which decides what to drop),
// the browser and the bots (which merge it back), so the two sides can't disagree about which fields are which.
var SNAP = {
  // top-level sections that only go out when they change (the rest, like zombie and NPC positions, go every time)
  SLOW: ["vote", "story", "pl", "ca", "tm", "sh", "cr", "b"],
  // a player's fields that go out every time; everything else about them only when it changes
  FAST_P: ["id", "x", "y", "z", "mv", "pt", "a", "hp", "ar", "d", "air", "vh", "am", "rl", "rt", "chg", "spr", "sc", "hot", "jam", "st"],
  // server side: makes a delta of `full` against what was last sent (`last` holds JSON strings), updating `last`
  diff(full, last) {
    const out = {}, same = (k, v) => { const s = JSON.stringify(v === undefined ? null : v); if (last[k] === s) return true; last[k] = s; return false; };
    for (const k in full) if (k !== "g" && k !== "p" && !(SNAP.SLOW.includes(k) && same(k, full[k]))) out[k] = full[k];
    out.g = {};
    for (const k in full.g) if (!same("g." + k, full.g[k])) out.g[k] = full.g[k] === undefined ? null : full.g[k];
    out.p = full.p.map((p) => {
      const q = {};
      for (const k in p) if (SNAP.FAST_P.includes(k) || !same("p" + p.id + "." + k, p[k])) q[k] = p[k] === undefined ? null : p[k];
      return q;
    });
    return out;
  },
  // receiving side: fills a delta back in from the previous snapshot (a full one, marked `full`, replaces it)
  merge(prev, m) {
    if (!prev || m.full) return m;
    for (const k of SNAP.SLOW) if (!(k in m)) m[k] = prev[k];
    for (const k in prev.g) if (!(k in m.g)) m.g[k] = prev.g[k];
    const old = new Map(prev.p.map((p) => [p.id, p]));
    for (const p of m.p) { const o = old.get(p.id); if (o) for (const k in o) if (!(k in p)) p[k] = o[k]; }
    return m;
  },
};
