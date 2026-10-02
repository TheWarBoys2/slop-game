// Movement physics, shared word for word by the server (the authority) and the browser (prediction).
// Plain script on purpose: the server evaluates this file's text, and the client gets it prepended to game.js.
// World units: x/y are the ground plane (y points "down" the map), z is height.
var MV = (function () {
  const GRAV = 1500, JUMP = 470, STEP = 22, HGT = 56, EYE = 46, PAD = 1080;
  const ACCEL = 11, FRICTION = 7, AIR_ACCEL = 16, AIR_CAP = 42, MAX_MULT = 3.2, TAP_TURN = 1.25, TAP_CD = 0.12;
  const KEY = { F: 1, L: 2, B: 4, R: 8, JUMP: 16, DOWN: 32, CROUCH: 64, SPRINT: 128 };
  // parkour: sprinting, sliding, a double jump, wall-running, wall jumps, climbing ledges and speed boosters
  const SPRINT = 1.4, SLIDE_T = 0.75, SLIDE_SPD = 1.9, SLIDE_FR = 1.1, AIR_JUMP = 0.85, WR_MAX = 0.9, WR_KICK = 340, BOOST = 950, BOOST_T = 0.7, MANTLE = 64;
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
    if (e.gr && f.box && f.box.kind === "boost") { // a speed booster: flings you the way its arrows point
      const a = f.box.a || 0, fresh = !(e.boostT > 0.4);
      e.vx = Math.cos(a) * BOOST; e.vy = Math.sin(a) * BOOST; e.boostT = BOOST_T;
      return fresh ? "boost" : null;
    }
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
    const keys = inp.keys | 0, pk = e.pk || 0, w = env.frozen ? { x: 0, y: 0 } : wishDir(keys, inp.yaw, inp.rel);
    const jump = !env.frozen && (keys & KEY.JUMP) && e.gr;
    const jumpFresh = !env.frozen && (keys & KEY.JUMP) && !(pk & KEY.JUMP), crouchFresh = !env.frozen && (keys & KEY.CROUCH) && !(pk & KEY.CROUCH);
    let ev = null;
    e.tt = (e.tt || 0) - dt; e.slideCd = (e.slideCd || 0) - dt; e.boostT = (e.boostT || 0) - dt; e.wrOff = (e.wrOff || 0) - dt; e.mantle = (e.mantle || 0) - dt;
    if (e.gr) { e.dj = env.airJumps ?? 1; e.wrc = 0; e.wr = 0; e.wlast = null; }
    // sprint: hold it with forward. Not while crouched, aiming or shooting, and not on an empty tank
    const wantSprint = !env.frozen && (keys & KEY.SPRINT) && (keys & KEY.F) && !(keys & KEY.CROUCH) && env.canSprint !== false && (env.stam ?? 100) > (e.sprint ? 0 : 12);
    if (e.gr || !wantSprint) e.sprint = !!wantSprint && !(e.slide > 0);
    const sp = env.sp * (e.sprint ? SPRINT : (keys & KEY.CROUCH) && e.gr && !(e.slide > 0) ? 0.5 : 1); // crouching halves your speed
    // slide: crouch while running fast. Low friction, no steering, and you keep it if you jump out of it
    { const spd = Math.hypot(e.vx, e.vy);
      if (e.gr && crouchFresh && e.slideCd <= 0 && spd > env.sp * 1.15) {
        const s2 = Math.max(spd, env.sp * SLIDE_SPD); e.vx *= s2 / spd; e.vy *= s2 / spd;
        e.slide = SLIDE_T; e.slideCd = 1.0; e.sprint = false; ev = "slide";
      } else if (e.slide > 0) { e.slide -= dt; if (!e.gr || jump || spd < env.sp * 0.7 || !(keys & KEY.CROUCH)) e.slide = 0; }
    }
    // wall-running: hold forward along a tall wall in the air. Gravity mostly lets go of you for a moment
    if (e.wr > 0) {
      e.wr -= dt; e.wtouch -= dt;
      if (e.wtouch <= 0 || !(keys & KEY.F)) e.wr = 0;
      else {
        e.vx -= e.wn[0] * 30; e.vy -= e.wn[1] * 30; // lean into the wall so you stay on it
        e.vz += GRAV * dt * 0.8; if (e.vz < -70) e.vz = -70;
        const tx = -e.wn[1], ty = e.wn[0], along = e.vx * tx + e.vy * ty, dir = along >= 0 ? 1 : -1;
        if (Math.abs(along) < sp * 1.2) { e.vx += tx * dir * sp * 3 * dt; e.vy += ty * dir * sp * 3 * dt; }
      }
    }
    // in the air, a fresh jump is a wall jump (off a wall) or your double jump
    if (!e.gr && jumpFresh) {
      if (e.wr > 0) { e.vz = JUMP; e.vx += e.wn[0] * WR_KICK; e.vy += e.wn[1] * WR_KICK; e.wr = 0; e.wrOff = 0.25; e.dj = env.airJumps ?? 1; ev = "walljump"; }
      else if (e.dj > 0) {
        e.dj--; e.vz = JUMP * AIR_JUMP; ev = "djump";
        if (w.x || w.y) { const s2 = Math.max(Math.hypot(e.vx, e.vy), sp * 0.9); e.vx = w.x * s2; e.vy = w.y * s2; } // and it lets you change direction
      }
    }
    if (e.gr && !jump) {
      const spd = Math.hypot(e.vx, e.vy), fr = e.slide > 0 ? SLIDE_FR : e.boostT > 0 ? 1.2 : FRICTION;
      if (spd > 0) { const ns = Math.max(0, spd - Math.max(spd, 60) * fr * dt); e.vx *= ns / spd; e.vy *= ns / spd; }
    }
    if (e.gr && e.slide > 0) { /* no steering mid-slide */ }
    else if (e.gr) {
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
    const spd = Math.hypot(e.vx, e.vy), cap = Math.max(sp * MAX_MULT, e.boostT > 0 ? BOOST : 0);
    if (spd > cap) { e.vx *= cap / spd; e.vy *= cap / spd; }
    if (jump) { e.vz = JUMP; e.gr = false; e.hops = (e.hops || 0) + 1; }
    e.x += e.vx * dt; e.y += e.vy * dt;
    const hit = pushOut(e, 16, env.boxes, env.W, env.H);
    if (hit && hit !== "edge") { // lose the velocity going into the wall, keep the slide along it
      const cx = Math.max(hit.x, Math.min(e.x, hit.x + hit.w)), cy = Math.max(hit.y, Math.min(e.y, hit.y + hit.h));
      const nx = e.x - cx, ny = e.y - cy, nl = Math.hypot(nx, ny);
      if (nl > 0) { const into = e.vx * nx / nl + e.vy * ny / nl; if (into < 0) { e.vx -= into * nx / nl; e.vy -= into * ny / nl; } }
      const z = e.z || 0;
      if (!e.gr && nl > 0 && (keys & KEY.F) && (keys & KEY.JUMP) && hit.z1 > z + STEP && hit.z1 <= z + MANTLE && e.vz < 300) { // grab the ledge and pull yourself up
        e.vz = Math.sqrt(2 * GRAV * (hit.z1 - z + 10)); e.mantle = 0.3; ev = ev || "mantle";
      } else if (!e.gr && nl > 0 && (keys & KEY.F) && hit.z1 > z + HGT && e.wrOff <= 0) {
        const tx = -ny / nl, ty = nx / nl, along = Math.abs(e.vx * tx + e.vy * ty);
        if (e.wr > 0 && e.wbox === hit) e.wtouch = 0.12;
        else if (!(e.wr > 0) && hit !== e.wlast && (e.wrc || 0) < 3 && along > env.sp * 0.8 && e.vz < 400) { // once per wall until you land; chain between walls with wall jumps
          e.wr = env.wrLen || WR_MAX; e.wbox = e.wlast = hit; e.wn = [nx / nl, ny / nl]; e.wtouch = 0.12; e.wrc = (e.wrc || 0) + 1; e.vz = Math.min(220, Math.max(e.vz, 120)); ev = ev || "wallrun";
        }
      }
    }
    const vev = vertical(e, dt, env.boxes, 16, HGT);
    if (e.gr) e.wr = 0;
    e.pk = keys;
    return vev || ev;
  }
  return { GRAV, JUMP, STEP, HGT, EYE, PAD, KEY, BOOST, SURF, touches, blocks, pushOut, floorAt, vertical, wishDir, step, lakeAt, inWater };
})();
