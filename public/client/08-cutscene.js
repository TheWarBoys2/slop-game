// Browser client, 08-cutscene: The opening cutscene.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- opening cutscene
// Each shot is a camera move through the real 3D valley. A shot can add props for its few seconds (a stranger at the well,
// the dead climbing out of their graves, the balloon) and a glow drawn flat over the picture.
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const RISE = [[-150, -60], [-60, 40], [40, -90], [130, 20], [-110, 110], [80, 120], [170, -80]];
const flyCam = (x, y, z, lx, ly, lz, fov = 60) => ({ x, y, z, look: [lx, ly, lz], fov });
const tall = (w) => w.kind === "lake" || (w.z1 ?? 60) - (w.z0 || 0) >= 4; // anything that isn't a floor or a path
function clearDist(c) { // how far the camera can sit from its subject before something is in the way
  const [lx, ly, lz] = c.look, dv = [c.x - lx, c.y - ly, c.z - lz], L = Math.hypot(...dv) || 1, u = dv.map((v) => v / L), o = [lx + u[0] * 40, ly + u[1] * 40, lz + u[2] * 40];
  let best = L - 40;
  for (const w of MAP.walls) if (w.kind !== "lake" && tall(w)) { const t = rayBox(o, u, w); if (t > 0) best = Math.min(best, t); } // (0: the subject itself)
  return { L, u, k: Math.min(L, 40 + Math.max(0, best - 16)) };
}
function clearShot(c) { // the valley's layout changes, so pull the camera in front of whatever is between it and its subject
  const { L, u, k } = clearDist(c), [lx, ly, lz] = c.look;
  return k >= L ? c : { ...c, x: lx + u[0] * k, y: ly + u[1] * k, z: lz + u[2] * k };
}
const orbit = (lx, ly, lz, dist, z, a, fov) => flyCam(lx + Math.cos(a) * dist, ly + Math.sin(a) * dist, z, lx, ly, lz, fov);
const AROUND = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Math.PI / 2 + i * Math.PI / 4), SIDES = [Math.PI / 2, -Math.PI / 2];
function bestAngle(key, cam, angles = AROUND) { // film from whichever direction has the clearest view; cam(a) is the shot from angle a
  if (intro[key] === undefined) { let best = -1; for (const a of angles) { const k = clearDist(cam(a)).k; if (k > best + 1) { best = k; intro[key] = a; } } }
  return intro[key];
}
function openSpot(x, y, r) { // the nearest open ground to (x, y), for the dead to climb out of
  for (let ring = 0; ring < 14; ring++) for (let i = 0, n = Math.max(1, ring * 6); i < n; i++) {
    const px = x + Math.cos(i / n * 7) * ring * 110, py = y + Math.sin(i / n * 7) * ring * 110;
    if (px < r || py < r || px > MAP.W - r || py > MAP.H - r) continue;
    if (MAP.pitch && px > MAP.pitch.x - r && px < MAP.pitch.x + MAP.pitch.w + r && py > MAP.pitch.y - r && py < MAP.pitch.y + MAP.pitch.h + r) continue; // not on the football pitch
    if (!MAP.walls.some((w) => tall(w) && w.x < px + r && w.x + w.w > px - r && w.y < py + r && w.y + w.h > py - r)) return { x: px, y: py };
  }
  return { x, y };
}
function glowAt(x, y, z, r, rgb, a) {
  const s = project3(x, y, z); if (!s) return;
  const R = r * 600 / Math.max(120, s.d), g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, R);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 7); ctx.fill();
}
function advShots() {
  const hc = { x: MAP.W / 2, y: MAP.H / 2 }, pan = (k) => { const x = lerp(hc.x - 900, hc.x + 900, ease(k)); return flyCam(x, hc.y + 800, 420, x + 100, hc.y, 0); }; // high enough to see over the rooftops
  return [
    { d: 4, free: true, tint: "rgba(255,220,150,0.08)", cam: pan, cap: () => "No horde at the Hearth this time. Just the road, and work for anyone who wants it." },
    { d: 5, free: true, card: true, tint: "rgba(0,0,0,0)", cam: () => pan(1), cap: () => "" },
  ];
}
function storyShots() {
  const V = MAP.valley, wl = MAP.well || { x: 1775, y: 1145 }, h = MAP.hearth, hc = { x: h.x + h.w / 2, y: h.y + h.h / 2 };
  const rc = intro.rc || (intro.rc = openSpot(MAP.W * 0.28, MAP.H * 0.72, 230));
  const stranger = (k) => ({ x: wl.x - 230 + Math.min(1, k / 0.45) * 180, y: wl.y + 6 });
  const risen = (k, i) => clamp01((k - 0.06 - i * 0.09) / 0.25);
  const hearthCam = (k) => { const a = bestAngle("hearthA", (a) => orbit(hc.x, hc.y, 110, 340, 200, a)); return orbit(hc.x, hc.y, 110, lerp(700, 340, ease(k)), lerp(420, 200, ease(k)), a); };
  return [
    { d: 5, free: true, npcs: true, tint: "rgba(255,140,60,0.18)", cam: (k) => flyCam(lerp(300, MAP.W - 300, ease(k)), MAP.H * 0.95, 620, lerp(500, MAP.W - 500, ease(k)), MAP.H * 0.45, 0),
      cap: () => intro.prev ? `${intro.prev} This time, it's ${V}.` : `${V}. Three hundred years of turnips, mud and minding its own business.` },
    { d: 6, tint: "rgba(5,8,30,0.6)", cam: (k) => { const a = bestAngle("wellA", (a) => orbit(wl.x - 70, wl.y, 30, 300, 150, a), SIDES); return orbit(wl.x - 85 + k * 30, wl.y, 30, 300, 150, a, 50); }, // side on, to watch them walk up
      cap: (k) => "Three weeks ago, somebody came to the old well in the dead of night." + (k > 0.6 ? " Nobody saw who." : ""),
      props: (k) => ({ npcs: [{ id: "intro-stranger", ...stranger(k), a: 0, color: "#2a2230", hat: "hood" }] }),
      glow: (k, t) => {
        const g = k > 0.55 ? Math.min(1, (k - 0.55) / 0.3) : 0;
        if (g > 0) glowAt(wl.x, wl.y, 20, 20 + g * 40, "110,255,80", 0.55 * g);
        if (k > 0.55 && k < 0.92) { const s = stranger(k); for (let i = 0; i < 6; i++) { const q = (t * 2 + i / 6) % 1; glowAt(lerp(s.x + 20, wl.x, q), lerp(s.y, wl.y, q), 40 + Math.sin(q * 3) * 14, 5, "125,255,90", 0.9); } }
      } },
    { d: 5, tint: "rgba(5,8,30,0.55)", cam: (k) => orbit(rc.x, rc.y, 20, 300, lerp(190, 160, k), bestAngle("graveA", (a) => orbit(rc.x, rc.y, 20, 300, 175, a)), 55),
      cap: () => `Since then, the dead of ${V} won't stay buried.`,
      props: (k) => ({ z: RISE.flatMap(([dx, dy], i) => { const p = risen(k, i); return p ? [[-1 - i, "w", rc.x + dx, rc.y + dy, 100, 0, -(1 - p) * 60, 0, 0, 0, 0, 0]] : []; }) }),
      glow: (k) => RISE.forEach(([dx, dy], i) => { glowAt(rc.x + dx, rc.y + dy, 1, 26, "60,40,20", 0.7); if (risen(k, i) >= 0.6) glowAt(rc.x + dx, rc.y + dy, 50 - (1 - risen(k, i)) * 60, 6, "255,236,64", 0.9); }) },
    { d: 4, npcs: true, tint: "rgba(255,140,60,0.12)", cam: hearthCam, cap: () => "Only the Hearth still holds them back. Just about." },
    { d: 5, card: true, npcs: true, tint: "rgba(0,0,0,0)", cam: () => hearthCam(1), cap: () => "" },
  ];
}
function royaleShots() {
  const y = MAP.H / 2, x0 = 460, x1 = MAP.W - 140;
  const follow = (k) => { const bx = lerp(x0, x1, k); return flyCam(bx - 520, y + 560, 820, bx, y, 760); };
  return [
    { d: 4.5, free: true, tint: "rgba(255,200,120,0.1)", cam: follow, cap: () => "VEX AIR presents...", props: (k) => ({ drop: [x0, y, x1, y, k * 0.999] }) },
    { d: 5.5, free: true, card: true, tint: "rgba(0,0,0,0)", cam: () => follow(1), cap: () => "" },
  ];
}
function introShot(t) {
  const shots = intro.mode === "royale" ? royaleShots() : intro.mode === "adventure" ? advShots() : storyShots();
  let el = t - intro.start, i = 0;
  while (i < shots.length - 1 && el >= shots[i].d) { el -= shots[i].d; i++; }
  const sh = shots[i], k = clamp01(el / sh.d);
  if (i !== intro.shot) { intro.shot = i; sfx("banner"); }
  return { ...sh, k, i, cam: sh.free ? sh.cam(k) : clearShot(sh.cam(k)) };
}
function renderIntro(t, dt) {
  ctx.clearRect(0, 0, VW, VH);
  R3D.resize(innerWidth, innerHeight); // the 3D view is in real pixels, the HUD in UI units
  if (document.pointerLockElement === cv) document.exitPointerLock();
  const sh = introShot(t), pr = sh.props ? sh.props(sh.k, t) : {};
  const npcs = (sh.npcs && MAP.npcs) || [];
  const S2 = { ...S, z: pr.z || [], g: pr.drop ? { ...S.g, drop: pr.drop } : S.g };
  camNow = sh.cam;
  R3D.frame({ S: S2, MAP: { ...MAP, npcs: pr.npcs ? npcs.concat(pr.npcs) : npcs }, t, dt, me, pred, aimYaw, aimPitch, fp: false, cam: sh.cam, fx, messes, hearthHitT, ghost: null, vm: null, slashT, nukeFx, cropKeys: CROP_KEYS, domeR: DOME_R });
  drawIntroOverlay(sh, t);
}
function drawIntroOverlay(sh, t) {
  ctx.fillStyle = sh.tint; ctx.fillRect(0, 0, VW, VH);
  if (sh.glow) sh.glow(sh.k, t);
  const lb = Math.round(VH * 0.11);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VW, lb); ctx.fillRect(0, VH - lb, VW, lb);
  const fade = Math.max(0, 1 - (sh.k * sh.d) / 0.4);
  if (sh.card) {
    const a = Math.min(1, sh.k * sh.d / 0.8);
    ctx.fillStyle = `rgba(8,6,12,${0.88 * a})`; ctx.fillRect(0, lb, VW, VH - 2 * lb);
    ctx.globalAlpha = a;
    const royale = intro.mode === "royale", cast = intro.cast || [];
    text(royale ? "SLOP ROYALE" : "SLOP VALLEY", VW / 2, VH * 0.25, Math.min(72, VW / 10), "#ffd34d");
    text(royale ? MAP.valley.toUpperCase() : "starring", VW / 2, VH * 0.25 + 50, 18, "#cfe0b8");
    cast.forEach(([n, cls, col], i) => { if (sh.k * sh.d > 0.8 + i * 0.35) text(`${n}, the ${cls}`, VW / 2, VH * 0.25 + 90 + i * 30, 20, col); });
    const y2 = VH * 0.25 + 110 + cast.length * 30;
    if (sh.k > 0.55 && intro.mode === "adventure") text("Five towns. A lot of work. One Legendary Contract.", VW / 2, y2, 17, "#e0c0ff");
    else if (sh.k > 0.55) text(royale ? `One balloon. ${cast.length} farmer${cast.length === 1 ? "" : "s"}. One survivor.` : "and one very special guest (maybe)", VW / 2, y2, 17, "#e0c0ff");
    if (sh.k > 0.7 && intro.mode !== "adventure") text(royale ? "Celebrity commentary by Gordon Rampage: \"I've seen more fight in a soufflé.\"" : "The valley is watching. It will remember what you do.", VW / 2, y2 + 32, 15, royale ? "#ff9ad0" : "#aaa");
    ctx.globalAlpha = 1;
  } else {
    const cap = sh.cap(sh.k), n = Math.floor(sh.k * sh.d * 40);
    text(cap.slice(0, n), VW / 2, VH - lb / 2, Math.max(15, Math.min(22, VW / 50)), "#f2ead0");
  }
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, VW, VH); }
  text(`SPACE to skip (${intro.skip || 0}/${S.p.length})`, VW - 20, lb / 2, 13, "#888", "right");
}

