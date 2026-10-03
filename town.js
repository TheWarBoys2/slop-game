// SLOP VALLEY — the town's bigger buildings: office blocks, two-storey houses with cellars, and the tunnels that join the cellars up.
// Everything here is boxes like the rest of the map ({ x, y, w, h, z0, z1, kind }), so move.js walks on it unchanged.
// It also builds a small waypoint graph (doors, stairs, tunnels) so the dead can follow you inside: see zombieNav in server.js.

export const CD = 120; // how deep the cellars and tunnels go
export const HS = 110; // one storey of a house
export const OS = 100; // one storey of an office
export const SH = 100; // a shop's walls
const T = 10; // wall thickness
const TW = 60; // tunnel width
const snap = (v, g = 10) => Math.round(v / g) * g; // the dug-out parts sit on a 10-unit grid, so the tunnel walls line up exactly
const OFFICE_NAMES = ["Slop & Partners", "Gristle Holdings", "Valley Mutual", "Turnip Capital", "Bunkr & Sons"];

// a building's own frame: lx along its width, ly from the front (the door side) to the back
function framer(b) {
  const north = b.door === "n";
  return {
    R: (lx, ly, lw, lh) => ({ x: b.x + lx, y: north ? b.y + ly : b.y + b.h - ly - lh, w: lw, h: lh }),
    P: (lx, ly, z) => ({ x: b.x + lx, y: north ? b.y + ly : b.y + b.h - ly, z }),
  };
}
// a rectangle with another cut out of it, as up to four rectangles (same frame)
function minus(a, c) {
  const out = [], ax1 = a.x + a.w, ay1 = a.y + a.h, cx0 = Math.max(a.x, c.x), cy0 = Math.max(a.y, c.y), cx1 = Math.min(ax1, c.x + c.w), cy1 = Math.min(ay1, c.y + c.h);
  if (cx0 >= cx1 || cy0 >= cy1) return [a];
  if (cy0 > a.y) out.push({ x: a.x, y: a.y, w: a.w, h: cy0 - a.y });
  if (ay1 > cy1) out.push({ x: a.x, y: cy1, w: a.w, h: ay1 - cy1 });
  if (cx0 > a.x) out.push({ x: a.x, y: cy0, w: cx0 - a.x, h: cy1 - cy0 });
  if (ax1 > cx1) out.push({ x: cx1, y: cy0, w: ax1 - cx1, h: cy1 - cy0 });
  return out;
}
// does the segment a-c pass through the rectangle (grown by pad)? Liang-Barsky clipping
export function segHitsRect(a, c, r, pad = 0) {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad, dx = c.x - a.x, dy = c.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}
const hits = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

// ---------------------------------------------------------------- placing the big things (early, so they get room)
export function placeBig({ walls, R, rng, overlaps, W, H }) {
  const big = { offices: [], houses: [], hatches: [] }, hc = { x: W / 2, y: H / 2 };
  const add = (r, pad, list) => { if (overlaps(r, pad)) return false; walls.push(r); list.push(r); return true; };
  // office blocks: four or five floors of glass, out towards the edges of town, doors facing the middle
  for (let i = 0, tries = 0; i < 3 && tries < 900; tries++) {
    const w = 300, h = 220, x = snap(R(140, W - w - 140)), y = snap(R(140, H - h - 140));
    if (Math.hypot(x + w / 2 - hc.x, y + h / 2 - hc.y) < 700 || big.offices.some((o) => Math.hypot(o.x - x, o.y - y) < 800)) continue;
    const fl = 4 + (i % 2);
    if (add({ x, y, w, h, kind: "office", ns: 1, fl, door: y + h / 2 < hc.y ? "s" : "n", name: OFFICE_NAMES[i % OFFICE_NAMES.length], z0: 0, z1: fl * OS }, 120, big.offices)) i++;
  }
  // two-storey houses with a cellar. The back needs room for the tunnel.
  for (let i = 0, tries = 0; i < 6 && tries < 900; tries++) {
    const w = snap(R(250, 290), 20), h = snap(R(200, 220), 20), x = snap(R(100, W - w - 100)), y = snap(R(100, H - h - 160));
    if (Math.hypot(x + w / 2 - hc.x, y + h / 2 - hc.y) < 430) continue;
    const door = y + h / 2 < hc.y ? "s" : "n";
    if (add({ x, y, w, h, kind: "house", fl: 2, cellar: 1, roof: (rng() * 4) | 0, door, z0: 2 * HS, z1: 2 * HS + 10 }, 130, big.houses)) i++;
  }
  // shelters: steps down into the tunnels from open ground. One near the Hearth, one out in town.
  const hatch = (minD, maxD) => {
    for (let tries = 0; tries < 900; tries++) {
      const x = snap(R(100, W - 160)), y = snap(R(100, H - 260)), d = Math.hypot(x + 30 - hc.x, y + 75 - hc.y);
      if (d < minD || d > maxD) continue;
      if (add({ x, y, w: 60, h: 150, kind: "hatch", ns: 1, door: y < hc.y ? "s" : "n", z0: -CD, z1: 0 }, 80, big.hatches)) return;
    }
  };
  hatch(330, 620); hatch(900, 2200);
  return big;
}

// ---------------------------------------------------------------- insides, tunnels, and the waypoint graph (late, once everything else is placed)
export function finishTown(big, { walls, W, H, lake }) {
  const push = (b) => { walls.push(b); return b; };
  const nav = { structs: [], nodes: [], edges: [] };
  const node = (p, region) => { nav.nodes.push({ x: Math.round(p.x), y: Math.round(p.y), z: p.z, r: region }); return nav.nodes.length - 1; };
  const edge = (a, b) => nav.edges.push([a, b]);
  const rooms = [], ports = [], dug = []; // rooms: what tunnels must go round; ports: where a tunnel can start; dug: every hole
  const hole = (r, look, cut) => { const b = push({ ...r, kind: "hole", look, z0: -CD, z1: 0 }); if (cut) b.cut = 1; else dug.push(b); return b; };
  const roof = (r) => push({ ...r, kind: "slab", look: "turf", z0: -8, z1: 0 });
  for (const b of big.shops || []) rooms.push({ x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 }); // tunnels keep out from under the shops
  // a bare bulb on a wire. Not solid (ns), and r3d hangs a light off the nearest few.
  const bulb = (x, y, z) => push({ x: Math.round(x) - 6, y: Math.round(y) - 6, w: 12, h: 12, kind: "bulb", ns: 1, z0: z - 10, z1: z });

  // --- two-storey houses: a staircase up, a floor upstairs, a cellar underneath with its own stairs, and a door out the back into the tunnels
  big.houses.forEach((b, hi) => {
    const { R, P } = framer(b), { w, h } = b, top = b.z0, own = { house: b };
    const wall = (lx, ly, lw, lh, z0 = 0, z1 = top) => push({ ...R(lx, ly, lw, lh), kind: "hwall", house: b, roof: b.roof, noclimb: 1, z0, z1 });
    const dw = 48, dx0 = w / 2 - dw / 2;
    wall(0, 0, dx0, T); wall(dx0 + dw, 0, w - dx0 - dw, T); wall(dx0, 0, dw, T, 66, top); // the front, with the door
    wall(0, h - T, w, T); wall(0, T, T, h - 2 * T); wall(w - T, T, T, h - 2 * T);
    const inner = { x: T, y: T, w: w - 2 * T, h: h - 2 * T };
    // stairs up along the back wall, climbing towards the right-hand wall
    const US = 6, UD = 24, ux0 = w - T - US * UD, uy0 = h - T - 44;
    for (let i = 0; i < US; i++) push({ ...R(ux0 + i * UD, uy0, UD, 44), kind: "step", ...own, z0: 0, z1: Math.round(HS * (i + 1) / US) });
    for (const r of minus(inner, { x: ux0, y: uy0, w: US * UD, h: 44 })) push({ ...R(r.x, r.y, r.w, r.h), kind: "slab", look: "wood", ...own, z0: HS - 8, z1: HS });
    push({ ...R(ux0 - 4, uy0 - 4, US * UD - 30, 4), kind: "rail", ...own, z0: HS, z1: HS + 30 }); // a banister upstairs, so you don't walk off into the stairwell
    // stairs down to the cellar along the left wall, with a rail round the hole
    const CS = 5, CDp = 24, cx0 = T, cy0 = T + 6, open = { x: cx0, y: cy0, w: 44, h: CS * CDp };
    for (let i = 0; i < CS; i++) push({ ...R(cx0, cy0 + i * CDp, 44, CDp), kind: "step", ...own, z0: -CD, z1: -20 * (i + 1) });
    for (const r of minus(inner, open)) push({ ...R(r.x, r.y, r.w, r.h), kind: "slab", look: "wood", ...own, z0: -8, z1: 0 });
    push({ ...R(cx0 + 44, cy0 + CDp, 4, CS * CDp - CDp + 4), kind: "rail", ...own, z0: 0, z1: 30 });
    push({ ...R(cx0, cy0 + CS * CDp, 44, 4), kind: "rail", ...own, z0: 0, z1: 30 });
    hole(R(inner.x, inner.y, inner.w, inner.h), "cellar");
    hole(R(open.x, open.y, open.w, open.h), "cellar", 1); // the ground is cut away over the stairwell
    // furniture. Downstairs: a sofa, a table, a kitchen counter. Upstairs: two beds, a wardrobe, a desk. The cellar: shelves and barrels.
    const furn = (f, lx, ly, lw, lh, z0, ht) => push({ ...R(lx, ly, lw, lh), kind: "furn", f, ...own, z0, z1: z0 + ht });
    furn("sofa", w - T - 28, T + 24, 28, 72, 0, 24);
    furn("table", w / 2 - 26, h / 2 - 10, 52, 36, 0, 28);
    furn("counter", T, h - T - 44, 44, 44, 0, 32);
    furn("bed", T + 6, T + 6, 52, 80, HS, 18);
    furn("bed", w - T - 58, T + 6, 52, 80, HS, 18);
    furn("wardrobe", w / 2 - 30, T, 60, 22, HS, 70);
    furn("desk", T + 6, h - T - 40, 50, 30, HS, 26);
    furn("shelf", w - T - 22, T + 30, 22, 90, -CD, 60);
    furn("barrels", w - T - 46, h - T - 46, 36, 36, -CD, 34);
    { const c = P(w / 2, h / 2, 0); bulb(c.x, c.y, -CD + 86); }
    // out the back: a short tunnel to where the network picks up
    const stub = { x: w / 2 - TW / 2, y: h - T, w: TW, h: T + 80 };
    hole(R(stub.x, stub.y, stub.w, stub.h), "tunnel"); roof(R(stub.x, stub.y, stub.w, stub.h));
    rooms.push({ ...b, own: hi });
    // waypoints
    const sid = nav.structs.length;
    nav.structs.push({ kind: "house", x: b.x, y: b.y, w, h, floors: [0, HS], house: b });
    const F0 = sid + ":0", F1 = sid + ":1";
    const out = node(P(w / 2, -34, 0), "O"), din = node(P(w / 2, T + 26, 0), F0);
    const ub = node(P(ux0 - 14, uy0 + 22, 0), F0), us = node(P(w - T - 12, uy0 + 22, HS), F1), ut = node(P(w - T - 30, uy0 - 26, HS), F1);
    const ct = node(P(T + 70, T + 20, 0), F0), cm = node(P(T + 22, T + 18, -20), F0), cb = node(P(T + 22, cy0 + CS * CDp + 26, -CD), "U");
    const mo = node(P(w / 2, h - T - 26, -CD), "U"), port = node(P(w / 2, h + 50, -CD), "U");
    [[out, din], [din, ub], [din, ct], [ub, ct], [ub, us], [us, ut], [ct, cm], [cm, cb], [cb, mo], [mo, port]].forEach(([a, c]) => edge(a, c));
    ports.push({ n: port, x: nav.nodes[port].x, y: nav.nodes[port].y, room: hi });
  });

  // --- shelters: a stairwell down from open ground, with rails round it
  big.hatches.forEach((b) => {
    const { R, P } = framer(b);
    for (let i = 0; i < 5; i++) push({ ...R(0, i * 24, 60, 24), kind: "step", look: "stone", z0: -CD, z1: -20 * (i + 1) });
    hole(R(0, 0, 60, 150), "hatch"); hole(R(0, 0, 60, 150), "hatch", 1);
    for (const r of [R(-10, -10, 80, 10), R(-10, 150, 80, 10), R(-10, 0, 10, 150), R(60, 0, 10, 150)]) push({ ...r, kind: "pillar", look: "parapet", z0: -10, z1: 6 }); // a concrete rim round the top
    push({ ...R(-4, 0, 4, 154), kind: "rail", look: "stone", z0: 6, z1: 36 }); push({ ...R(60, 0, 4, 154), kind: "rail", look: "stone", z0: 6, z1: 36 }); push({ ...R(0, 150, 60, 4), kind: "rail", look: "stone", z0: 6, z1: 36 });
    const stub = R(0, 150, 60, 80); hole(stub, "tunnel"); roof(stub);
    { const c = P(30, 60, 0); bulb(c.x, c.y, -CD + 86); }
    const ri = rooms.length; rooms.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    const top = node(P(30, -30, 0), "O"), bot = node(P(30, 130, -CD), "U"), port = node(P(30, 200, -CD), "U");
    edge(top, bot); edge(bot, port);
    ports.push({ n: port, x: nav.nodes[port].x, y: nav.nodes[port].y, room: ri });
  });

  // --- tunnels: join the ports up (cheapest first, like a minimum spanning tree), with L-shaped runs that keep clear of the lake and the cellars
  const lakeBox = lake ? { x: lake.x - 60, y: lake.y - 60, w: lake.w + 120, h: lake.h + 120 } : null;
  const seg = (a, c) => { const x = snap(Math.min(a.x, c.x) - TW / 2), y = snap(Math.min(a.y, c.y) - TW / 2); return { x, y, w: snap(Math.max(a.x, c.x) + TW / 2) - x, h: snap(Math.max(a.y, c.y) + TW / 2) - y }; };
  const segOk = (r) => r.x > 40 && r.y > 40 && r.x + r.w < W - 40 && r.y + r.h < H - 40 && !(lakeBox && hits(r, lakeBox)) && !rooms.some((m) => hits(r, m, 10));
  const route = (a, c) => {
    if (a.x === c.x || a.y === c.y) { const s = seg(a, c); return segOk(s) ? { segs: [s], corner: null } : null; }
    for (const k of [{ x: a.x, y: c.y }, { x: c.x, y: a.y }]) { const s1 = seg(a, k), s2 = seg(k, c); if (segOk(s1) && segOk(s2)) return { segs: [s1, s2], corner: k }; }
    return null;
  };
  const comp = ports.map((_, i) => i), find = (i) => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  const pairs = [];
  for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) pairs.push([Math.abs(ports[i].x - ports[j].x) + Math.abs(ports[i].y - ports[j].y), i, j]);
  pairs.sort((a, b) => a[0] - b[0]);
  const tunnels = [];
  for (const [, i, j] of pairs) {
    if (find(i) === find(j)) continue;
    const rt = route(ports[i], ports[j]);
    if (!rt) continue;
    comp[find(i)] = find(j);
    for (const s of rt.segs) {
      hole(s, "tunnel"); roof(s);
      const n = Math.max(1, Math.round(Math.max(s.w, s.h) / 420)); // a bulb every few hundred units
      for (let b = 0; b < n; b++) { const f = (b + 0.5) / n; bulb(s.w > s.h ? s.x + f * s.w : s.x + s.w / 2, s.h > s.w ? s.y + f * s.h : s.y + s.h / 2, -CD + 86); }
    }
    if (rt.corner) { const k = node({ ...rt.corner, z: -CD }, "U"); edge(ports[i].n, k); edge(k, ports[j].n); } else edge(ports[i].n, ports[j].n);
    tunnels.push(rt);
  }

  // --- earth: the dug-out parts are walled by packed earth. Rasterise every hole on the 10-unit grid and wall off its outline.
  if (dug.length) {
    const G = 10, x0 = Math.min(...dug.map((d) => d.x)) - 2 * G, y0 = Math.min(...dug.map((d) => d.y)) - 2 * G;
    const nx = Math.ceil((Math.max(...dug.map((d) => d.x + d.w)) + 2 * G - x0) / G), ny = Math.ceil((Math.max(...dug.map((d) => d.y + d.h)) + 2 * G - y0) / G);
    const U = new Uint8Array(nx * ny);
    // round outwards, so a hole that doesn't land on the grid is never walled off from the inside
    for (const d of dug) for (let j = Math.floor((d.y - y0) / G); j < Math.ceil((d.y + d.h - y0) / G); j++) for (let i = Math.floor((d.x - x0) / G); i < Math.ceil((d.x + d.w - x0) / G); i++) U[j * nx + i] = 1;
    const wallCell = (i, j) => { if (U[j * nx + i]) return false; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, c = j + dj; if (a >= 0 && c >= 0 && a < nx && c < ny && U[c * nx + a]) return true; } return false; };
    // runs along each row, then stack identical runs from row to row into boxes
    let open = new Map();
    const flush = (keep) => { for (const [k, b] of open) if (!keep.has(k)) { push({ x: x0 + b.i0 * G, y: y0 + b.j0 * G, w: (b.i1 - b.i0) * G, h: (b.j1 - b.j0) * G, kind: "earth", z0: -CD - 30, z1: 0 }); open.delete(k); } };
    for (let j = 0; j <= ny; j++) {
      const runs = new Set();
      if (j < ny) for (let i = 0; i < nx; i++) { if (!wallCell(i, j)) continue; let e = i; while (e + 1 < nx && wallCell(e + 1, j)) e++; const k = i + "," + (e + 1); runs.add(k); if (open.has(k)) open.get(k).j1 = j + 1; else open.set(k, { i0: i, i1: e + 1, j0: j, j1: j + 1 }); i = e; }
      flush(runs);
    }
  }

  // --- office blocks: glass on every side, a concrete frame, a switchback staircase at the back that goes all the way up to the roof
  big.offices.forEach((b, oi) => {
    const { R, P } = framer(b), { w, h } = b, n = b.fl, topZ = n * OS, own = { bld: b };
    const P16 = 16, MW = 8, FD = 6; // corner pillars, mullions, facade depth
    for (const [lx, ly] of [[0, 0], [w - P16, 0], [0, h - P16], [w - P16, h - P16]]) push({ ...R(lx, ly, P16, P16), kind: "pillar", ...own, noclimb: 1, z0: 0, z1: topZ + 24 });
    // one side of glass: bays between mullions, a pane per floor in each bay. The middle of the front is the way in.
    const side = (horiz, fixed, len, front) => {
      const nb = Math.max(1, Math.round((len - 2 * P16) / 70)), bw = (len - 2 * P16 - MW * (nb - 1)) / nb;
      const d0 = Math.floor((nb - 1) / 2), d1 = Math.ceil((nb - 1) / 2); // the two bays in the middle of the front are the way in
      for (let i = 0; i < nb; i++) {
        const a = P16 + i * (bw + MW), doorBay = front && (i === d0 || i === d1);
        // the mullion between the two door bays starts above the lobby, so nothing stands in the doorway
        if (i < nb - 1) push({ ...(horiz ? R(a + bw, fixed, MW, FD) : R(fixed, a + bw, FD, MW)), kind: "pillar", look: "mullion", ...own, noclimb: 1, z0: front && i === d0 && d1 > d0 ? OS : 0, z1: topZ });
        for (let k = 0; k < n; k++) {
          if (doorBay && k === 0) continue;
          push({ ...(horiz ? R(a, fixed, bw, FD) : R(fixed, a, FD, bw)), kind: "glass", ...own, noclimb: 1, z0: k * OS, z1: (k + 1) * OS - 8 });
        }
      }
    };
    side(true, 0, w, true); side(true, h - FD, w, false); side(false, 0, h, false); side(false, w - FD, h, false);
    // the stairs: two lanes at the back, flights alternating direction, with a wall between the lanes
    const SN = 5, SD = 26, X0 = w - FD - 44 - SN * SD, laneA = h - FD - 44, laneB = h - FD - 88;
    for (let k = 0; k < n; k++) for (let i = 0; i < SN; i++) {
      const up = k % 2 === 0, lx = up ? X0 + i * SD : X0 + SN * SD - (i + 1) * SD;
      push({ ...R(lx, up ? laneA : laneB, SD, 44), kind: "step", look: "concrete", ...own, z0: k * OS, z1: k * OS + 20 * (i + 1) });
    }
    push({ ...R(X0 + SD, laneA - 2, SN * SD - 2 * SD, 4), kind: "pillar", look: "core", ...own, z0: 0, z1: topZ });
    // floors (and the roof), each with the hole the stairs come up through
    for (let k = 1; k <= n; k++) {
      const up = (k - 1) % 2 === 0, opening = { x: X0, y: up ? laneA : laneB, w: SN * SD, h: 44 };
      for (const r of minus({ x: 0, y: 0, w, h }, opening)) push({ ...R(r.x, r.y, r.w, r.h), kind: "slab", look: k === n ? "roof" : "carpet", ...own, z0: k * OS - 8, z1: k * OS });
    }
    for (const r of [R(0, 0, w, FD), R(0, h - FD, w, FD), R(0, FD, FD, h - 2 * FD), R(w - FD, FD, FD, h - 2 * FD)]) push({ ...r, kind: "pillar", look: "parapet", ...own, z0: topZ, z1: topZ + 24 });
    // the lobby and the floors above it
    const furn = (f, lx, ly, lw, lh, z0, ht) => push({ ...R(lx, ly, lw, lh), kind: "furn", f, ...own, z0, z1: z0 + ht });
    furn("reception", 190, 60, 80, 26, 0, 32); furn("plant", 14, 12, 24, 24, 0, 44); furn("plant", w - 38, 12, 24, 24, 0, 44); furn("sofa", 12, 70, 28, 80, 0, 24); furn("cooler", w - 34, 98, 20, 20, 0, 42);
    for (let k = 1; k < n; k++) {
      for (const lx of [20, 110, 200]) for (const ly of [30, 86]) furn("desk", lx, ly, 50, 30, k * OS, 26);
      furn("plant", 14, 140, 24, 24, k * OS, 44); furn(k % 2 ? "printer" : "cooler", w - 34, 98, 22, 22, k * OS, 40);
    }
    furn("ac", 30, 40, 50, 40, topZ, 30); furn("ac", 130, 30, 40, 40, topZ, 30);
    for (let k = 0; k < n; k++) { const c = P(w / 2, h / 2, 0); bulb(c.x, c.y, k * OS + OS - 16); } // strip lights, one per floor
    // waypoints: in the door, then flight by flight
    const sid = nav.structs.length;
    nav.structs.push({ kind: "office", x: b.x, y: b.y, w, h, floors: Array.from({ length: n + 1 }, (_, k) => k * OS) });
    const out = node(P(w / 2, -34, 0), "O"), din = node(P(w / 2, 34, 0), sid + ":0");
    edge(out, din);
    let prevTop = din;
    for (let k = 0; k < n; k++) {
      const up = k % 2 === 0, cy = (up ? laneA : laneB) + 22;
      const bot = node(P(up ? X0 - 16 : X0 + SN * SD + 18, cy, k * OS), sid + ":" + k), top = node(P(up ? X0 + SN * SD + 18 : X0 - 16, cy, (k + 1) * OS), sid + ":" + (k + 1));
      edge(prevTop, bot); edge(bot, top); prevTop = top;
    }
  });

  // --- the shops and the club: walk-in buildings with a counter (the "till") you press E at, and something to do inside
  const spots = {};
  (big.shops || []).forEach((b) => {
    const { R, P } = framer(b), { w, h } = b, top = SH, own = { shop: b.sid };
    const fa = b.door === "n" ? -Math.PI / 2 : Math.PI / 2, spot = (k, lx, ly) => { spots[k] = { ...P(lx, ly, 0), fa }; }; // keepers face the door
    const look = { general: "plank", armoury: "brick", casino: "casino", club: "club" }[b.sid];
    const wall = (lx, ly, lw, lh, z0 = 0, z1 = top) => push({ ...R(lx, ly, lw, lh), kind: "swall", look, ...own, noclimb: 1, z0, z1 });
    const dw = 64, dx0 = w / 2 - dw / 2;
    wall(0, 0, dx0, T); wall(dx0 + dw, 0, w - dx0 - dw, T); wall(dx0, 0, dw, T, 76, top); // the front, with a wide door
    wall(0, h - T, w, T); wall(0, T, T, h - 2 * T); wall(w - T, T, T, h - 2 * T);
    push({ ...R(0, 0, w, h), kind: "slab", look: b.sid === "casino" ? "gold" : b.sid === "club" ? "club" : "roof", ...own, z0: top, z1: top + 8 });
    const furn = (f, lx, ly, lw, lh, ht, extra) => push({ ...R(lx, ly, lw, lh), kind: "furn", f, ...own, z0: 0, z1: ht, ...extra });
    const BACK = { flip: b.door === "n" ? 1 : 0 }, FRONT = { flip: b.door === "s" ? 1 : 0 }; // which way a piece against the back or front wall faces
    // the till: you stand in front of it, the keeper stands behind it (far enough back that E opens the shop, not a chat)
    const till = (lx, lw) => { push({ ...R(lx, h - T - 78, lw, 44), kind: "till", sid: b.sid, ...own, z0: 0, z1: 34 }); spot(b.sid, lx + lw / 2, h - T - 16); };
    if (b.sid === "general") { // Vex's: two aisles of shelves, a fridge, veg by the door
      till(w - 120, 100);
      furn("aisle", 30, 50, 20, 84, 56); furn("aisle", 64, 50, 20, 84, 56); // two aisles down the left, a clear walk from the door to the till
      furn("fridge", T + 2, h - T - 24, 84, 24, 72, BACK); furn("veg", w - T - 70, T + 8, 60, 30, 24, FRONT); furn("veg", T + 8, T + 6, 60, 26, 24, FRONT);
      furn("shelf", w - T - 22, 46, 22, 46, 60);
    } else if (b.sid === "armoury") { // Haddock's: gun racks, ammo, and a little shooting range at the back
      till(w - 124, 104);
      furn("rack", T, 30, 16, 120, 72); furn("rack", 24, T, 76, 16, 72, FRONT);
      furn("ammo", w - T - 54, T + 8, 46, 34, 30, FRONT); furn("barrels", 36, 80, 36, 36, 34);
      furn("bench", 26, h - T - 112, 110, 14, 30); // the range: shoot over the bench at the targets on the back wall
      for (let i = 0; i < 3; i++) push({ ...R(30 + i * 36, h - T - 10, 26, 10), kind: "target", ...own, z0: 26, z1: 62 });
    } else if (b.sid === "casino") { // the Golden Slop: slots down one wall, the wheel, a blackjack table, a poker table, a bar
      till(w / 2 - 70, 90);
      for (let i = 0; i < 4; i++) push({ ...R(T, 34 + i * 38, 28, 30), kind: "slot", ...own, z0: 0, z1: 58 });
      push({ ...R(w - 120, 34, 92, 60), kind: "ctable", g: "wheel", ...own, z0: 0, z1: 30 });
      push({ ...R(w - 120, 120, 92, 52), kind: "ctable", g: "bj", ...own, z0: 0, z1: 30 });
      push({ ...R(100, 50, 90, 56), kind: "ctable", g: "pk", ...own, z0: 0, z1: 30 });
      furn("bar", T, h - T - 40, 90, 40, 34, BACK); furn("plant", w - T - 30, h - T - 30, 24, 24, 44);
    } else if (b.sid === "club") { // Club Slop: a dance floor that lights up at night, a DJ, speakers, a bar
      push({ ...R(60, 40, w - 120, 100), kind: "dance", ns: 1, ...own, z0: 0, z1: 1 });
      furn("dj", w / 2 - 40, h - T - 62, 80, 28, 34, BACK); spot("dj", w / 2, h - T - 18); furn("speaker", w / 2 - 84, h - T - 36, 34, 30, 64, BACK); furn("speaker", w / 2 + 50, h - T - 36, 34, 30, 64, BACK);
      push({ ...R(T + 22, 40, 26, 120), kind: "till", sid: "club", ...own, z0: 0, z1: 36 }); spot("club", T + 11, 100); spot("bouncer", w / 2 + 50, -28);
      furn("sofa", w - T - 30, 40, 28, 80, 24);
    }
    for (const lx of [w * 0.3, w * 0.7]) { const c = P(lx, h / 2, 0); bulb(c.x, c.y, top - 12); }
    // waypoints: one floor, in through the door
    const sid = nav.structs.length;
    nav.structs.push({ kind: "shop", x: b.x, y: b.y, w, h, floors: [0] });
    edge(node(P(w / 2, -34, 0), "O"), node(P(w / 2, 34, 0), sid + ":0"));
    b.din = P(w / 2, 34, 0); b.dout = P(w / 2, -40, 0);
  });

  // --- corners: a waypoint just off each corner of every building, for going round it
  for (const st of nav.structs) for (const [x, y] of [[st.x - 40, st.y - 40], [st.x + st.w + 40, st.y - 40], [st.x - 40, st.y + st.h + 40], [st.x + st.w + 40, st.y + st.h + 40]]) node({ x, y, z: 0 }, "O");

  // --- the graph: shortest routes between every pair of waypoints (Floyd-Warshall; there are only a hundred or so)
  const N = nav.nodes.length, D = new Float32Array(N * N).fill(Infinity), NX = new Int16Array(N * N).fill(-1);
  const len = (a, c) => Math.hypot(a.x - c.x, a.y - c.y) + Math.abs(a.z - c.z);
  for (let i = 0; i < N; i++) { D[i * N + i] = 0; NX[i * N + i] = i; }
  for (const [a, c] of nav.edges) { const d = len(nav.nodes[a], nav.nodes[c]); D[a * N + c] = D[c * N + a] = d; NX[a * N + c] = c; NX[c * N + a] = a; }
  // the open air links outside waypoints that can see each other: not through a building, so the dead go round the corner
  const outside = nav.nodes.map((nd, i) => (nd.r === "O" ? i : -1)).filter((i) => i >= 0);
  const blocked = (a, c) => nav.structs.some((st) => segHitsRect(a, c, st, -4));
  for (const a of outside) for (const c of outside) if (a < c && !blocked(nav.nodes[a], nav.nodes[c])) { const d = len(nav.nodes[a], nav.nodes[c]); if (d < D[a * N + c]) { D[a * N + c] = D[c * N + a] = d; NX[a * N + c] = c; NX[c * N + a] = a; } }
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) { const dik = D[i * N + k]; if (dik === Infinity) continue; for (let j = 0; j < N; j++) { const d = dik + D[k * N + j]; if (d < D[i * N + j]) { D[i * N + j] = d; NX[i * N + j] = NX[i * N + k]; } } }
  nav.D = D; nav.NX = NX; nav.N = N;
  return { nav, tunnels: tunnels.length, spots };
}

// which part of the town something is in, for the waypoints: "O" outside, "U" underground, or "<building>:<floor>"
export function regionOf(nav, e) {
  const z = e.z || 0;
  if (z < -40) return "U";
  for (let s = 0; s < nav.structs.length; s++) {
    const st = nav.structs[s];
    if (e.x > st.x && e.x < st.x + st.w && e.y > st.y && e.y < st.y + st.h) {
      if (st.house && !(st.house.hp > 0)) return "O"; // flattened
      let k = 0; for (let i = 0; i < st.floors.length; i++) if (z + 30 >= st.floors[i]) k = i;
      return s + ":" + k;
    }
  }
  return "O";
}
