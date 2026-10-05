// The wild: everything past the town's hedge, made up one chunk at a time as people walk into it.
// Each chunk is built from the map seed and its own coordinates, so the same valley always has the same wild.

import { DUST, dustChunk } from "./dust2.js";

export const CS = 1000; // chunk size, in world units

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (seed, a, b) => (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(seed | 0, 83492791)) | 0;

// what a patch of the wild is like. Neighbouring chunks lean the same way, so forests and moors have some size.
export const BIOMES = {
  forest:  { name: "Blackwood", trees: [16, 26], rocks: [1, 4], ruins: 0.15, crates: [0, 1] },
  meadow:  { name: "the open fields", trees: [2, 6], rocks: [0, 3], ruins: 0.2, crates: [0, 1], bales: [2, 5] },
  moor:    { name: "the rocky moor", trees: [0, 3], rocks: [8, 14], ruins: 0.25, crates: [0, 2] },
  orchard: { name: "an old orchard", orchard: true, rocks: [0, 2], ruins: 0.1, crates: [0, 1] },
  ruins:   { name: "a ruined hamlet", trees: [3, 7], rocks: [1, 3], ruins: 1, crates: [1, 2] },
  stones:  { name: "the standing stones", trees: [1, 4], rocks: [1, 3], stones: true, crates: [1, 1] },
  dust:    { name: "Dust II", rocks: [0, 0], crates: [0, 0] }, // a whole Counter-Strike map, out in the desert (dust2.js)
};
const BIOME_KEYS = Object.keys(BIOMES);
export function biomeAt(seed, cx, cy) {
  const r = mulberry(hash(seed, Math.floor(cx / 2) * 7 + 3, Math.floor(cy / 2) * 5 + 1))(); // the region's leaning
  const own = mulberry(hash(seed, cx, cy))();
  if (own < 0.06) return "stones";
  if (own < 0.14) return "ruins";
  return ["forest", "forest", "meadow", "meadow", "moor", "orchard"][Math.floor(r * 6)];
}

// build one chunk. `town` is the town's rectangle: nothing in the wild goes inside it (nor inside any of `keep`, Adventure's towns).
// Returns walls (no ids yet) and spots for loot.
export function makeChunk(seed, cx, cy, town, keep = []) {
  const rng = mulberry(hash(seed, cx * 31 + 7, cy * 17 + 11));
  const R = (a, b) => a + rng() * (b - a), N = ([a, b]) => Math.floor(R(a, b + 1));
  const x0 = cx * CS, y0 = cy * CS;
  const dustHere = Math.max(0, Math.min(x0 + CS, DUST.x + DUST.w) - Math.max(x0, DUST.x)) * Math.max(0, Math.min(y0 + CS, DUST.y + DUST.h) - Math.max(y0, DUST.y)) > CS * CS / 2;
  const kind = dustHere ? "dust" : biomeAt(seed, cx, cy), B = BIOMES[kind];
  const walls = dustChunk(cx, cy, CS), loot = [];
  const hitR = (r, o, pad) => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y;
  const inTown = (r, pad) => hitR(r, town, pad) || hitR(r, DUST, pad) || keep.some((k) => hitR(r, k, pad)); // nothing wild grows in town or on Dust II
  const free = (r, pad) => !inTown(r, 140) && r.x > x0 + 10 && r.y > y0 + 10 && r.x + r.w < x0 + CS - 10 && r.y + r.h < y0 + CS - 10 &&
    !walls.some((o) => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y);
  const place = (n, mk, pad) => { for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) { const r = mk(); if (free(r, pad)) { walls.push(r); i++; } } };
  const spot = (pad = 60) => { for (let i = 0; i < 40; i++) { const p = { x: R(x0 + 60, x0 + CS - 60), y: R(y0 + 60, y0 + CS - 60) }; if (free({ x: p.x - 20, y: p.y - 20, w: 40, h: 40 }, pad)) return p; } return null; };
  if (dustHere) { for (const w of walls) w.ck = `${cx},${cy}`; return { kind, walls, loot: [], far: Math.hypot(x0 + CS / 2 - town.x - town.w / 2, y0 + CS / 2 - town.y - town.h / 2) }; }
  // landmarks first, so they get room
  if (B.stones) { // a ring of tall stones with something left in the middle
    const c = { x: x0 + CS / 2 + R(-120, 120), y: y0 + CS / 2 + R(-120, 120) };
    if (!inTown({ x: c.x - 260, y: c.y - 260, w: 520, h: 520 }, 0)) {
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, s = R(34, 46); walls.push({ x: c.x + Math.cos(a) * 200 - s / 2, y: c.y + Math.sin(a) * 200 - s / 2, w: s, h: s * 0.7, kind: "rock", z0: 0, z1: Math.round(R(110, 160)), stone: 1 }); }
      walls.push({ x: c.x - 40, y: c.y - 25, w: 80, h: 50, kind: "rock", z0: 0, z1: 26, stone: 1 }); // the altar
      loot.push({ x: c.x, y: c.y + 60, good: 1 });
    }
  }
  if (B.ruins && rng() < B.ruins) { // the shell of a building: broken walls, rubble, sometimes a lookout tower
    const w = R(200, 300), h = R(150, 220), x = R(x0 + 80, x0 + CS - w - 80), y = R(y0 + 80, y0 + CS - h - 80);
    if (free({ x, y, w, h }, 40)) {
      const T = 14, side = (sx, sy, sw, sh) => { // a wall with gaps knocked out of it
        const horiz = sw > sh, len = horiz ? sw : sh;
        for (let at = 0; at < len;) { const seg = R(40, 110); if (rng() < 0.7) walls.push(horiz ? { x: sx + at, y: sy, w: Math.min(seg, len - at), h: T, kind: "ruin", z0: 0, z1: Math.round(R(30, 90)) } : { x: sx, y: sy + at, w: T, h: Math.min(seg, len - at), kind: "ruin", z0: 0, z1: Math.round(R(30, 90)) }); at += seg + R(20, 60); }
      };
      side(x, y, w, T); side(x, y + h - T, w, T); side(x, y, T, h); side(x + w - T, y, T, h);
      if (rng() < 0.6) walls.push({ x: x + w / 2 - 40, y: y + h / 2 - 30, w: 80, h: 60, kind: "rubble", z0: 0, z1: 24 });
      loot.push({ x: x + w * 0.3, y: y + h * 0.6 });
      if (rng() < 0.35) { // a lookout: climb it to see what's coming
        const tx = x + w + 30, ty = y + 20, top = Math.round(R(150, 200));
        const tw = { x: tx, y: ty, w: 70, h: 70, kind: "tower", z0: 0, z1: top };
        const steps = []; const n = Math.ceil(top / 20);
        for (let i = 0; i < n; i++) steps.push({ x: tx + 13, y: ty + 70 + (n - 1 - i) * 30, w: 44, h: 30, kind: "step", z0: 0, z1: Math.round(top * (i + 1) / n) });
        if ([tw, ...steps].every((r) => free(r, 20))) walls.push(tw, ...steps);
      }
    }
  }
  if (B.orchard) { // rows of fruit trees
    const ox = x0 + R(80, 200), oy = y0 + R(80, 200), gap = R(110, 140);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const r = { x: ox + i * gap, y: oy + j * gap, w: 44, h: 44, kind: "tree", fruit: 1, z0: 0, z1: 200 }; if (rng() < 0.85 && free(r, 30)) walls.push(r); }
  }
  if (B.trees) place(N(B.trees), () => { const s = R(40, 58); return { x: R(x0, x0 + CS - s), y: R(y0, y0 + CS - s), w: s, h: s, kind: "tree", z0: 0, z1: Math.round(R(220, 300)), dark: kind === "forest" ? 1 : 0 }; }, 40);
  place(N(B.rocks), () => { const s = R(50, 110); return { x: R(x0, x0 + CS - s), y: R(y0, y0 + CS - s), w: s, h: s * R(0.6, 1), kind: "rock", z0: 0, z1: Math.round(R(26, kind === "moor" ? 110 : 60)) }; }, 50);
  if (B.bales) place(N(B.bales), () => ({ x: R(x0, x0 + CS - 50), y: R(y0, y0 + CS - 50), w: 50, h: 50, kind: "crate", z0: 0, z1: 50 }), 40);
  if (rng() < 0.3) place(N([1, 3]), () => rng() < 0.5 ? { x: R(x0, x0 + CS - 220), y: R(y0, y0 + CS), w: R(120, 220), h: 18, kind: "fence", z0: 0, z1: 34 } : { x: R(x0, x0 + CS), y: R(y0, y0 + CS - 220), w: 18, h: R(120, 220), kind: "fence", z0: 0, z1: 34 }, 50);
  for (let i = 0, n = N(B.crates); i < n; i++) { const p = spot(); if (p) loot.push(p); }
  // the further from town, the better the loot (and the worse the dead)
  const tcx = town.x + town.w / 2, tcy = town.y + town.h / 2, far = Math.hypot(x0 + CS / 2 - tcx, y0 + CS / 2 - tcy);
  for (const w of walls) { w.x = Math.round(w.x); w.y = Math.round(w.y); w.w = Math.round(w.w); w.h = Math.round(w.h); w.ck = `${cx},${cy}`; }
  return { kind, walls, loot: loot.map((l) => ({ x: Math.round(l.x), y: Math.round(l.y), good: l.good || 0 })), far };
}
