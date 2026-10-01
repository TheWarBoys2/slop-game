// Movement physics, shared word for word by the server (the authority) and the browser (prediction).
// Plain script on purpose: the server evaluates this file's text, and the client gets it prepended to game.js.
// World units: x/y are the ground plane (y points "down" the map), z is height.
var MV = (function () {
  const GRAV = 1500, JUMP = 470, STEP = 22, HGT = 56, EYE = 46, PAD = 1080;
  const ACCEL = 11, FRICTION = 7, AIR_ACCEL = 16, AIR_CAP = 42, MAX_MULT = 3.2, TAP_TURN = 1.25, TAP_CD = 0.12;
  const KEY = { F: 1, L: 2, B: 4, R: 8, JUMP: 16, DOWN: 32 };
  const SURF = -14, SWIM = 0.62; // treading water, the head just above the surface

  // the lake: a box of kind "lake" whose z0 is its bed. Inside it the ground is the lake bed, not z=0.
  function lakeAt(boxes, x, y) { for (const b of boxes) if (b.kind === "lake" && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b; return null; }

  const touches = (b, x, y, r) => { const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h)); return (x - cx) ** 2 + (y - cy) ** 2 < r * r; };
  const blocks = (b, z, hgt) => z < b.z1 - STEP && z + hgt > b.z0;

  // push a circle out of every box it's stuck in at its current height. Returns the first box hit, or "edge".
  function pushOut(e, r, boxes, W, H, z = e.z || 0, hgt = HGT) {
    let hit = null;
    for (const w of boxes) {
      if (w.kind === "lake" || !blocks(w, z, hgt)) continue;
      const cx = Math.max(w.x, Math.min(e.x, w.x + w.w)), cy = Math.max(w.y, Math.min(e.y, w.y + w.h));
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = hit || w;
      if (d2 > 1e-4) { const d = Math.sqrt(d2); e.x = cx + (dx / d) * r; e.y = cy + (dy / d) * r; }
      else {
        const l = e.x - w.x, rr = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y, m = Math.min(l, rr, t, b);
        if (m === l) e.x = w.x - r; else if (m === rr) e.x = w.x + w.w + r; else if (m === t) e.y = w.y - r; else e.y = w.y + w.h + r;
      }
    }
    if (W === Infinity) return hit; // the open world has no edge
    if (e.x < r || e.x > W - r || e.y < r || e.y > H - r) hit = hit || "edge";
    e.x = Math.max(r, Math.min(W - r, e.x)); e.y = Math.max(r, Math.min(H - r, e.y));
    return hit;
  }
  // the highest surface under a point that is at or below `z` (+ a step)
  function floorAt(x, y, r, z, boxes) {
    const lk = lakeAt(boxes, x, y);
    let h = lk ? lk.z0 : 0, box = null;
    for (const b of boxes) if (b.kind !== "lake" && b.z1 <= z + STEP && b.z1 > h && touches(b, x, y, r)) { h = b.z1; box = b; }
    return { h, box };
  }
  function ceilAt(x, y, r, headWas, boxes) {
    let c = Infinity;
    for (const b of boxes) if (b.kind !== "lake" && b.z0 >= headWas - 1 && b.z0 < c && touches(b, x, y, r)) c = b.z0;
    return c;
  }
  // apply gravity, floors, ceilings and jump pads. Returns "pad" if it launched off one.
  function vertical(e, dt, boxes, r, hgt) {
    const pz = e.z, wasGround = e.gr;
    e.vz -= GRAV * dt; e.z += e.vz * dt;
    if (e.vz > 0) { const c = ceilAt(e.x, e.y, r, pz + hgt, boxes); if (e.z + hgt > c) { e.z = c - hgt; e.vz = 0; } }
    const f = floorAt(e.x, e.y, r * 0.6, Math.max(pz, e.z), boxes);
    if (e.z <= f.h) { e.z = f.h; if (e.vz < 0) e.vz = 0; e.gr = true; }
    else if (wasGround && e.vz <= 0 && pz - f.h <= STEP + 2) { e.z = f.h; e.vz = 0; e.gr = true; } // walk down stairs instead of bouncing
    else e.gr = false;
    if (e.gr && f.box && f.box.kind === "pad") { e.vz = PAD; e.gr = false; return "pad"; }
    return null;
  }
  // wish direction from the key mask: yaw-relative in 3D, screen-relative in the classic view
  function wishDir(keys, yaw, rel) {
    const f = ((keys & KEY.F) ? 1 : 0) - ((keys & KEY.B) ? 1 : 0), s = ((keys & KEY.R) ? 1 : 0) - ((keys & KEY.L) ? 1 : 0);
    let x, y;
    if (rel) { const c = Math.cos(yaw), n = Math.sin(yaw); x = c * f - n * s; y = n * f + c * s; }
    else { x = s; y = -f; }
    const l = Math.hypot(x, y);
    return l ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }
  // one step of player movement: ground friction and acceleration, Quake-style air strafing,
  // tap-strafing (a fresh direction key in the air redirects your momentum), bunny hops (jumping on the
  // landing tick skips friction), jump pads, stairs and ledges.
  // swimming: water drag, slow strokes, Space swims up, CTRL dives, and you float back to the surface
  function swim(e, inp, dt, env) {
    const keys = inp.keys | 0, w = env.frozen ? { x: 0, y: 0 } : wishDir(keys, inp.yaw, inp.rel), sp = env.sp * SWIM;
    const up = !env.frozen && (keys & KEY.JUMP), down = !env.frozen && (keys & KEY.DOWN);
    const k = Math.min(1, dt * 4);
    e.vx += (w.x * sp - e.vx) * k; e.vy += (w.y * sp - e.vy) * k;
    const tvz = up ? 230 : down ? -230 : 40;
    e.vz += (tvz - e.vz) * Math.min(1, dt * 5);
    e.x += e.vx * dt; e.y += e.vy * dt;
    pushOut(e, 16, env.boxes, env.W, env.H);
    e.z += e.vz * dt;
    const f = floorAt(e.x, e.y, 9.6, e.z, env.boxes);
    if (e.z < f.h) { e.z = f.h; if (e.vz < 0) e.vz = 0; }
    const c = ceilAt(e.x, e.y, 16, e.z - e.vz * dt + HGT, env.boxes);
    if (e.z + HGT > c) { e.z = c - HGT; if (e.vz > 0) e.vz = 0; }
    if (e.z > SURF) { if (up && e.vz > 150) { e.vz = JUMP * 0.8; e.z = SURF + 1; e.gr = false; e.swim = false; e.pk = keys; return "leap"; } e.z = SURF; e.vz = Math.min(e.vz, 0); }
    if (!lakeAt(env.boxes, e.x, e.y)) { const g = floorAt(e.x, e.y, 9.6, e.z + STEP, env.boxes); if (e.z <= g.h) { e.z = g.h; e.vz = 0; e.gr = true; e.swim = false; } } // climbed out onto the bank
    else e.gr = false;
    e.pk = keys;
    return null;
  }
  const inWater = (e, boxes) => e.z < -6 && !!lakeAt(boxes, e.x, e.y);
  function step(e, inp, dt, env) {
    if (inWater(e, env.boxes) && !(e.vz > 200)) { e.swim = true; return swim(e, inp, dt, env); }
    e.swim = false;
    const keys = inp.keys | 0, sp = env.sp, w = env.frozen ? { x: 0, y: 0 } : wishDir(keys, inp.yaw, inp.rel);
    const jump = !env.frozen && (keys & KEY.JUMP) && e.gr;
    e.tt = (e.tt || 0) - dt;
    if (e.gr && !jump) {
      const spd = Math.hypot(e.vx, e.vy);
      if (spd > 0) { const ns = Math.max(0, spd - Math.max(spd, 60) * FRICTION * dt); e.vx *= ns / spd; e.vy *= ns / spd; }
    }
    if (e.gr) {
      const cur = e.vx * w.x + e.vy * w.y, add = sp - cur;
      if (add > 0 && (w.x || w.y)) { const a = Math.min(ACCEL * sp * dt, add); e.vx += a * w.x; e.vy += a * w.y; }
    } else {
      const fresh = keys & ~(e.pk || 0) & 15, spd = Math.hypot(e.vx, e.vy);
      if (fresh && (w.x || w.y) && spd > 120 && e.tt <= 0) {
        const va = Math.atan2(e.vy, e.vx), wa = Math.atan2(w.y, w.x);
        let d = wa - va; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const na = va + Math.max(-TAP_TURN, Math.min(TAP_TURN, d)), ns = spd * 0.96;
        e.vx = Math.cos(na) * ns; e.vy = Math.sin(na) * ns; e.tt = TAP_CD; e.taps = (e.taps || 0) + 1;
      }
      const cur = e.vx * w.x + e.vy * w.y, add = AIR_CAP - cur;
      if (add > 0 && (w.x || w.y)) { const a = Math.min(AIR_ACCEL * sp * dt, add); e.vx += a * w.x; e.vy += a * w.y; }
    }
    const spd = Math.hypot(e.vx, e.vy), cap = sp * MAX_MULT;
    if (spd > cap) { e.vx *= cap / spd; e.vy *= cap / spd; }
    if (jump) { e.vz = JUMP; e.gr = false; e.hops = (e.hops || 0) + 1; }
    e.x += e.vx * dt; e.y += e.vy * dt;
    const hit = pushOut(e, 16, env.boxes, env.W, env.H);
    if (hit && hit !== "edge") { // lose the velocity going into the wall, keep the slide along it
      const cx = Math.max(hit.x, Math.min(e.x, hit.x + hit.w)), cy = Math.max(hit.y, Math.min(e.y, hit.y + hit.h));
      const nx = e.x - cx, ny = e.y - cy, nl = Math.hypot(nx, ny);
      if (nl > 0) { const into = e.vx * nx / nl + e.vy * ny / nl; if (into < 0) { e.vx -= into * nx / nl; e.vy -= into * ny / nl; } }
    }
    const ev = vertical(e, dt, env.boxes, 16, HGT);
    e.pk = keys;
    return ev;
  }
  return { GRAV, JUMP, STEP, HGT, EYE, PAD, KEY, SURF, touches, blocks, pushOut, floorAt, vertical, wishDir, step, lakeAt, inWater };
})();
