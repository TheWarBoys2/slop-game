// Browser client, 07-movement: Prediction for your own player, movement feel, vehicles.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- prediction (own player)
// the same physics as the server (move.js), run locally so movement feels instant; the server's answer pulls us back gently
const pred = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gr: true, pk: 0, tt: 0, init: false, srv: null, dashCd: 0 };
let boxCache = { key: "", boxes: [] };
let builtKeyS = null, builtKeyV = "";
const builtKey = () => { if (S !== builtKeyS) { builtKeyS = S; builtKeyV = S ? S.b.map((b) => b[0]).join(",") : ""; } return builtKeyV; }; // once per snapshot, not on every ray
function worldBoxes() { // everything solid within reach of you (the wild has a lot of trees)
  const cx = Math.floor(pred.x / 400), cy = Math.floor(pred.y / 400);
  const key = (MAP ? MAP.seed + ":" + MAP.walls.length + ":" + (MAP.ver || 0) + ":" + (MAP.cv || 0) : "") + ":" + builtKey() + ":" + cx + "," + cy;
  if (key !== boxCache.key) {
    const solid = S ? S.b.filter((b) => PIECES[b[1]] && PIECES[b[1]].solid).map((b) => ({ x: b[2], y: b[3], w: 40, h: 40, z0: 0, z1: PIECES[b[1]].z1 || 10, kind: "built" })) : [];
    const x0 = cx * 400 - 1200, x1 = cx * 400 + 1600, y0 = cy * 400 - 1200, y1 = cy * 400 + 1600;
    boxCache = { key, boxes: [...MAP.walls.filter((w) => w.x < x1 && w.x + w.w > x0 && w.y < y1 && w.y + w.h > y0), ...solid] };
  }
  return boxCache.boxes;
}
function localDodge() {
  const t = T(); if (t < pred.dashCd) return;
  const mine = S?.p.find((p) => p.id === me); if (!mine || mine.d || mine.air || mine.vh) return;
  const w = MV.wishDir(keyMask(), yaw);
  let dx = w.x, dy = w.y;
  if (!dx && !dy) { const a = aimYaw; dx = Math.cos(a); dy = Math.sin(a); }
  const spd = Math.max(Math.hypot(pred.vx, pred.vy), mine.sp * 2.7);
  pred.vx = dx * spd; pred.vy = dy * spd; if (!pred.gr && pred.vz < 0) pred.vz = 0;
  pred.dashCd = t + (mine.cl === "rogue" ? 0.8 : 1.3);
}
// ---------------------------------------------------------------- movement feel: sounds and camera moves for parkour
let landDip = 0, mantleDip = 0, slideCrouch = false, sprintK = 0, slideK = 0, roll = 0;
function moveFx(ev) {
  if (ev === "slide") { sfx("slide"); if (!OPTS.crouchHold) slideCrouch = true; }
  else if (ev === "djump") sfx("whoosh");
  else if (ev === "walljump") { sfx("whoosh", 1.2); sfx("step"); }
  else if (ev === "wallrun") sfx("step");
  else if (ev === "mantle") { sfx("step"); mantleDip = 1; }
  else if (ev === "boost") sfx("boost");
}
function stepPred(dt) {
  const mine = S?.p.find((p) => p.id === me);
  if (!mine || !MAP) return;
  if (mine.d) { Object.assign(pred, { x: mine.x, y: mine.y, z: mine.z || 0, vx: 0, vy: 0, vz: 0 }); return; }
  if (mine.air || mine.vh) { const k = Math.min(1, dt * 12); pred.x += (mine.x - pred.x) * k; pred.y += (mine.y - pred.y) * k; pred.z += ((mine.z || 0) - pred.z) * k; pred.vx = pred.vy = pred.vz = 0; if (Math.hypot(mine.x - pred.x, mine.y - pred.y) > 300) { pred.x = mine.x; pred.y = mine.y; } return; }
  // step in small slices so fast frames and slow frames give the same jump
  let left = Math.min(dt, 0.1);
  while (left > 1e-4) {
    const h = Math.min(left, 1 / 60); left -= h;
    const vz0 = pred.vz, gr0 = pred.gr;
    const ev = MV.step(pred, { keys: keyMask(), yaw }, h, { sp: mine.sp, boxes: worldBoxes(), W: BWc(), H: BHc(), frozen: !!mine.go || dlgOpen || !!mine.fz || !!mine.cg || mine.air === 3, canSprint: !mouseDown && !aiming(), stam: mine.sta ?? 100, wrLen: 0.9 + 0.2 * ((mine.sk && mine.sk.fleet) || 0), airJumps: 1 });
    if (ev) moveFx(ev);
    if (!gr0 && pred.gr && vz0 < -480) landDip = Math.min(9, -vz0 / 110); // a hard landing dips the camera
  }
  if (slideCrouch && !(pred.slide > 0)) { slideCrouch = false; crouchOn = false; } // a slide stands you back up
  // gently pull toward the server's opinion (projected forward a little, since it's slightly out of date)
  const s = pred.srv;
  if (s) {
    const lead = 0.06, tx = s.x + s.vx * lead, ty = s.y + s.vy * lead, tz = s.z;
    const err = Math.hypot(tx - pred.x, ty - pred.y);
    if (err > 140 || Math.abs(tz - pred.z) > 90) { Object.assign(pred, { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, gr: s.gr }); }
    else {
      const k = Math.min(1, dt * 3);
      pred.x += (tx - pred.x) * k; pred.y += (ty - pred.y) * k;
      if (s.gr && pred.gr) pred.z += (tz - pred.z) * k;
      pred.vx += (s.vx - pred.vx) * k * 0.5; pred.vy += (s.vy - pred.vy) * k * 0.5;
    }
  }
}

// ---------------------------------------------------------------- vehicles
const MECH_NAME = { cannon: "autocannon", rockets: "rockets", flamer: "flamer", sword: "sword" };
const VEH_NAME = { mech: "Mech", tractor: "Tractor", buggy: "Slop Buggy", limo: "Limo", heli: "Crop Chopper", gunship: "Slop Gunship" };

