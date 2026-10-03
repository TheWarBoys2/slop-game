// SLOP VALLEY — Dust II, the whole thing, out in the wild. Rebuilt from memory at about half scale, in sandstone boxes.
// Long A, the pit, A site and the goose, catwalk, mid and its doors, CT spawn, B doors, upper and lower tunnels, B site, T spawn.
// The rounds themselves (zombie terrorists carrying a bomb to a site) live in server.js; this file is the map and the routes.

export const DC = 64; // one cell
const COLS = 32, ROWS = 30;
export const DUST = { x: 5000, y: -2000, w: COLS * DC, h: ROWS * DC }; // north-east of town, a long walk out
const WALL_H = 150;

// the open floor, as rectangles on the cell grid [col, row, w, h]
const OPEN = {
  bsite: [1, 1, 9, 8], ctspawn: [13, 2, 7, 5], asite: [23, 1, 8, 7],
  ct2a: [20, 3, 3, 2], ct2b: [10, 5, 3, 2], ctgate: [15, 0, 3, 2], // CT spawn's way out to the wild (north)
  mid: [15, 7, 3, 17], cat1: [18, 11, 4, 2], cat2: [20, 7, 2, 4], cat3: [22, 7, 1, 2],
  long: [28, 8, 3, 11], longdoors: [24, 19, 7, 2], outlong: [20, 19, 4, 5],
  tspawn: [10, 24, 14, 4], tgate: [14, 28, 6, 2], // T spawn's way in from the wild (south)
  lower: [9, 14, 6, 2], upper: [4, 14, 5, 5], btun: [4, 9, 3, 5], outtun1: [4, 19, 3, 4], outtun2: [4, 23, 6, 3],
};
const ROOFED = ["upper", "btun", "lower"]; // the tunnels are covered
// crates and cover [col, row, w, h, height]
const CRATES = [
  [25, 3, 2, 2, 60], [25, 3, 1, 1, 120], [29, 1, 1, 2, 70], [24, 6, 1, 1, 60], // A site: the double stack, the goose, a box by short
  [2, 2, 1, 1, 120], [3, 2, 1, 1, 60], [6, 5, 2, 1, 50], [1, 7, 1, 1, 60], [8, 1, 1, 1, 60], // B site: the double stack, the car, back plat boxes
  [16, 13, 1, 1, 50], // the xbox in mid
  [29, 15, 1, 1, 60], [30, 11, 1, 1, 60], // the pit / long A boxes
  [12, 25, 1, 1, 50], [21, 26, 1, 1, 50], // T spawn
  [11, 3, 0.6, 0.6, 50], // a barrel at B doors
];
// mid doors: a wall across mid with a gap down the middle, and long doors' frames
const DOORS = [[15, 10, 1, 0.3], [17, 10, 1, 0.3], [26, 19, 0.3, 0.7], [26, 20.3, 0.3, 0.7]];
export const SITES = { A: { col: 26.5, row: 4.5 }, B: { col: 5.5, row: 4.5 } };
// routes the terrorists walk (cell centres), from T spawn to each site
const ROUTES = {
  A: [[[17, 26], [21.5, 22], [27, 20], [29.5, 16], [29.5, 9], [27, 5]], [[16.5, 25], [16.5, 18], [16.5, 12], [19.5, 12], [21, 9], [22.5, 8], [25, 6], [26.5, 4.5]]],
  B: [[[12, 26], [7, 24.5], [5.5, 21], [6, 16], [5.5, 11], [5.5, 5]], [[16.5, 25], [16.5, 15], [12, 15], [6, 16], [5.5, 11], [5, 5]]],
};
const RADIO = [18, 2]; // the CT radio: E to start a round
const cx = (c) => DUST.x + c * DC, cy = (r) => DUST.y + r * DC;
export const dustPt = (c, r) => ({ x: Math.round(cx(c)), y: Math.round(cy(r)) });
export const siteXY = (s) => dustPt(SITES[s].col, SITES[s].row);
export const routes = (s) => ROUTES[s].map((rt) => rt.map(([c, r]) => dustPt(c, r)));
export const tSpawn = () => dustPt(10.5 + Math.random() * 12.5, 24.5 + Math.random() * 3);
export const ctSpawn = () => dustPt(16.5, 4);
export const inDust = (e, pad = 0) => e.x > DUST.x - pad && e.x < DUST.x + DUST.w + pad && e.y > DUST.y - pad && e.y < DUST.y + DUST.h + pad;

let cache = null;
export function dustWalls() {
  if (cache) return cache;
  const open = new Uint8Array(COLS * ROWS), walls = [];
  for (const [c, r, w, h] of Object.values(OPEN)) for (let j = r; j < r + h; j++) for (let i = c; i < c + w; i++) if (i >= 0 && j >= 0 && i < COLS && j < ROWS) open[j * COLS + i] = 1;
  // solid sandstone wherever it isn't open: runs along each row, stacked into boxes from row to row
  const live = new Map();
  const flush = (keep) => { for (const [k, b] of live) if (!keep.has(k)) { walls.push({ x: cx(b.i0), y: cy(b.j0), w: (b.i1 - b.i0) * DC, h: (b.j1 - b.j0) * DC, kind: "dust", noclimb: 1, z0: 0, z1: WALL_H }); live.delete(k); } };
  for (let j = 0; j <= ROWS; j++) {
    const runs = new Set();
    if (j < ROWS) for (let i = 0; i < COLS; i++) { if (open[j * COLS + i]) continue; let e = i; while (e + 1 < COLS && !open[j * COLS + e + 1]) e++; const k = i + "," + (e + 1); runs.add(k); if (live.has(k)) live.get(k).j1 = j + 1; else live.set(k, { i0: i, i1: e + 1, j0: j, j1: j + 1 }); i = e; }
    flush(runs);
  }
  for (const k of ROOFED) { const [c, r, w, h] = OPEN[k]; walls.push({ x: cx(c), y: cy(r), w: w * DC, h: h * DC, kind: "slab", look: "sandstone", z0: WALL_H - 10, z1: WALL_H }); } // dark in there
  for (const [c, r, w, h, z1] of CRATES) walls.push({ x: cx(c) + 3, y: cy(r) + 3, w: w * DC - 6, h: h * DC - 6, kind: "dcrate", z0: z1 > 60 ? 60 : 0, z1 });
  for (const [c, r, w, h] of DOORS) walls.push({ x: cx(c), y: cy(r), w: w * DC, h: h * DC, kind: "dust", look: "door", z0: 0, z1: 110 });
  for (const s of ["A", "B"]) { const p = siteXY(s); walls.push({ x: p.x - 70, y: p.y - 70, w: 140, h: 140, kind: "bsite", ns: 1, s, z0: 0, z1: 1 }); }
  walls.push({ x: cx(RADIO[0]) + 8, y: cy(RADIO[1]) + 8, w: 30, h: 22, kind: "radio", z0: 0, z1: 40 });
  for (const w of walls) { w.x = Math.round(w.x); w.y = Math.round(w.y); w.w = Math.round(w.w); w.h = Math.round(w.h); }
  return (cache = walls);
}
// the pieces that belong to one chunk of the wild (by their centre)
export function dustChunk(cx0, cy0, CS) {
  return dustWalls().filter((w) => Math.floor((w.x + w.w / 2) / CS) === cx0 && Math.floor((w.y + w.h / 2) / CS) === cy0).map((w) => ({ ...w }));
}
