// SLOP VALLEY — the 3D view (first and third person). Uses three.js, which index.html loads onto window.THREE.
// Game coordinates are (x, y) on the ground and z for height; three.js is y-up, so a game point (x, y, z) sits at (x, z, y).
// game.js owns the game state and the camera maths; this file only turns that state into a scene.
// zombie sizes by the one-letter code the server sends (game.js uses this too)
var ZR = { b: 48, e: 34, t: 26, r: 12, w: 15, c: 20, f: 13, x: 24, s: 14 };
var R3D = (function () {
  let T = null, R = null, scene = null, cam = null, gl = null, ok = false, vw = 0, vh = 0;
  let level = null, levelKey = "";
  const pools = new Map(); // "kind:id" -> { obj, seen, x, y, z, a }
  const fxObjs = new Map(); // fx object -> mesh
  let frameNo = 0, viewModel = null, vmKey = "";
  const L = { hemi: null, sun: null, hearth: null, spots: [], points: [] };
  const matCache = new Map();

  function mat(color, emissive, extra) {
    const key = color + "|" + (emissive || "") + "|" + (extra ? JSON.stringify(extra) : "");
    let m = matCache.get(key);
    if (!m) { m = new T.MeshLambertMaterial({ color, emissive: emissive || 0x000000, ...(extra || {}) }); matCache.set(key, m); }
    return m;
  }
  const basic = (color, opacity) => new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new T.Mesh(geo, m); o.position.set(x, y, z); return o; }
  // helpers taking game coordinates
  const at = (o, x, y, z) => { o.position.set(x, z, y); return o; };
  function box(w, d, h, m) { return new T.Mesh(new T.BoxGeometry(w, h, d), m); } // footprint w x d, height h

  function init() {
    T = window.THREE;
    if (!T) return false;
    try {
      gl = document.createElement("canvas"); gl.id = "gl";
      gl.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:0;display:none";
      document.body.insertBefore(gl, document.body.firstChild);
      R = new T.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: "high-performance" });
      R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      scene = new T.Scene();
      scene.background = new T.Color(0x8fc4e8);
      scene.fog = new T.Fog(0x8fc4e8, 1500, 4200);
      cam = new T.PerspectiveCamera(78, 1, 2, 6000);
      scene.add(cam);
      L.hemi = new T.HemisphereLight(0xd8ecff, 0x4a5a30, 1.7); scene.add(L.hemi);
      L.sun = new T.DirectionalLight(0xfff2d8, 2.2); L.sun.position.set(-600, 1200, -400); scene.add(L.sun); scene.add(L.sun.target);
      L.hearth = new T.PointLight(0xff9a40, 2, 700, 0); scene.add(L.hearth);
      for (let i = 0; i < 5; i++) { const s = new T.SpotLight(0xfff0c8, 0, 800, 0.45, 0.45, 0); scene.add(s); scene.add(s.target); L.spots.push(s); }
      for (let i = 0; i < 4; i++) { const p = new T.PointLight(0xffd890, 0, 280, 0); scene.add(p); L.points.push(p); }
      ok = true;
    } catch (e) { console.warn("3D unavailable:", e); ok = false; if (gl) gl.remove(); }
    return ok;
  }
  function show(v) { if (gl) gl.style.display = v ? "block" : "none"; }
  function resize(w, h) {
    if (w === vw && h === vh) return;
    vw = w; vh = h; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- the ground
  function groundTexture(MAP) {
    const c = document.createElement("canvas"), sc = 0.8;
    c.width = Math.round(MAP.W * sc); c.height = Math.round(MAP.H * sc);
    const g = c.getContext("2d");
    g.scale(sc, sc);
    g.fillStyle = "#4f7a3a"; g.fillRect(0, 0, MAP.W, MAP.H);
    let seed = (MAP.seed % 2147483646) + 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < 0.5 ? "#476f33" : "#588741"; g.beginPath(); g.arc(rnd() * MAP.W, rnd() * MAP.H, 6 + rnd() * 26, 0, 7); g.fill(); }
    g.fillStyle = "#6a5a3a"; g.fillRect(MAP.W / 2 - 40, 0, 80, MAP.H); g.fillRect(0, MAP.H / 2 - 40, MAP.W, 80);
    g.strokeStyle = "#3d6a2c"; g.lineWidth = 2;
    for (let i = 0; i < 3000; i++) { const x = rnd() * MAP.W, y = rnd() * MAP.H; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x - 1, y - 6); g.moveTo(x, y); g.lineTo(x + 1, y - 8); g.stroke(); }
    for (let i = 0; i < 400; i++) { g.fillStyle = ["#e86", "#fd5", "#c8f", "#fff"][(rnd() * 4) | 0]; g.beginPath(); g.arc(rnd() * MAP.W, rnd() * MAP.H, 3, 0, 7); g.fill(); }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    return tex;
  }

  // ---------------------------------------------------------------- static level
  const ROOFS = [0xa33b2b, 0x3b5ea3, 0x5d6b3a, 0x6b4a8a];
  function buildLevel(MAP) {
    if (level) { scene.remove(level); level.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    level = new T.Group();
    const ground = mesh(new T.PlaneGeometry(MAP.W, MAP.H), new T.MeshLambertMaterial({ map: groundTexture(MAP) }), MAP.W / 2, 0, MAP.H / 2);
    ground.rotation.x = -Math.PI / 2; level.add(ground);
    // the world's edge: a low dark hedge all round
    for (const [x, y, w, d] of [[MAP.W / 2, -10, MAP.W + 40, 20], [MAP.W / 2, MAP.H + 10, MAP.W + 40, 20], [-10, MAP.H / 2, 20, MAP.H], [MAP.W + 10, MAP.H / 2, 20, MAP.H]]) level.add(at(box(w, d, 60, mat(0x2a3d20)), x, y, 30));
    for (const w of MAP.walls) addWall(w);
    // plots
    MAP.plots.forEach((pl) => { const s = at(box(52, 52, 3, mat(0x5b3a1e)), pl.x, pl.y, 1.5); level.add(s); for (let r = -18; r <= 18; r += 12) level.add(at(box(44, 4, 3.4, mat(0x6e4826)), pl.x, pl.y + r, 1.7)); });
    // the old well
    if (MAP.well) {
      const wl = MAP.well, g = new T.Group();
      g.add(mesh(new T.CylinderGeometry(24, 26, 22, 16), mat(0x8a8a8e), 0, 11, 0));
      const slop = mesh(new T.CircleGeometry(15, 16), mat(0x2a5a1c, 0x2a8a18), 0, 22.2, 0); slop.rotation.x = -Math.PI / 2; g.add(slop); g.userData.slop = slop;
      for (const s of [-1, 1]) g.add(mesh(new T.BoxGeometry(4, 50, 4), mat(0x5a3a1e), s * 24, 36, 0));
      g.add(mesh(new T.BoxGeometry(56, 4, 4), mat(0x5a3a1e), 0, 60, 0));
      level.userData.well = at(g, wl.x, wl.y, 0); level.add(g);
    }
    scene.add(level);
  }
  function addWall(w) {
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2, z0 = w.z0 || 0, z1 = w.z1 || 60, hgt = z1 - z0;
    if (w.kind === "house") {
      level.add(at(box(w.w, w.h, hgt - 8, mat(0x8b5a3a)), cx, cy, (hgt - 8) / 2));
      level.add(at(box(w.w + 12, w.h + 12, 8, mat(ROOFS[w.roof || 0])), cx, cy, hgt - 4));
      for (const s of [-1, 1]) level.add(at(box(w.w + 12, 6, 12, mat(ROOFS[w.roof || 0])), cx, cy + s * (w.h / 2 + 3), hgt + 6)); // parapet
      level.add(at(box(22, 3, 44, mat(0x3a2616)), cx, w.y + w.h + 1, 22)); // door
      for (const fx of [-0.3, 0.3]) level.add(at(box(22, 3, 18, mat(0x9fc8e0, 0x1a2a3a)), cx + fx * w.w, w.y + w.h + 1, hgt * 0.55));
      level.add(at(box(16, 16, 40, mat(0x6d5a4a)), w.x + w.w * 0.75, w.y + w.h * 0.3, hgt + 20)); // chimney
    } else if (w.kind === "hearth") {
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(w.w, hgt, w.h), mat(0x9a8a70), 0, hgt / 2, 0));
      g.add(mesh(new T.BoxGeometry(w.w + 10, 10, w.h + 10), mat(0x6f5f4a), 0, hgt + 5, 0));
      const f1 = mesh(new T.ConeGeometry(30, 70, 10), mat(0xff8a2a, 0xff6a10), 0, hgt + 40, 0), f2 = mesh(new T.ConeGeometry(16, 44, 8), mat(0xffe07a, 0xffd040), 0, hgt + 32, 0);
      g.add(f1, f2); g.userData.flames = [f1, f2];
      level.userData.hearth = at(g, cx, cy, 0); level.add(g);
    } else if (w.kind === "tower") {
      level.add(at(box(w.w, w.h, hgt, mat(0x7d7066)), cx, cy, hgt / 2));
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) level.add(at(box(14, 14, 18, mat(0x6d6056)), cx + dx * (w.w / 2 - 7), cy + dy * (w.h / 2 - 7), z1 + 9));
      level.add(at(box(w.w + 4, w.h + 4, 6, mat(0x5a4e46)), cx, cy, z1 - 3));
    } else if (w.kind === "bridge") {
      level.add(at(box(w.w, w.h, hgt, mat(0x8a6a42)), cx, cy, (z0 + z1) / 2));
      const horiz = w.w > w.h;
      for (const s of [-1, 1]) level.add(at(box(horiz ? w.w : 4, horiz ? 4 : w.h, 26, mat(0x6e5232)), horiz ? cx : cx + s * (w.w / 2 - 2), horiz ? cy + s * (w.h / 2 - 2) : cy, z1 + 13));
    } else if (w.kind === "step") {
      level.add(at(box(w.w, w.h, hgt, mat(0x9a7a4a)), cx, cy, hgt / 2));
      level.add(at(box(w.w, w.h, 3, mat(0x7a5a32)), cx, cy, z1 - 1.5));
    } else if (w.kind === "ledge") {
      level.add(at(box(w.w, w.h, hgt, mat(0x6a6a74)), cx, cy, (z0 + z1) / 2));
      level.add(at(box(w.w + 2, w.h + 2, 2, mat(0x7dffb0, 0x2a9a60)), cx, cy, z0 + 1));
    } else if (w.kind === "pad") {
      const p = mesh(new T.CylinderGeometry(w.w / 2, w.w / 2 + 3, 5, 20), mat(0x40e0ff, 0x1090c0), 0, 2.5, 0);
      const ring = mesh(new T.TorusGeometry(w.w / 2 - 4, 2.5, 6, 24), basic(0xbff8ff, 0.8), 0, 6, 0); ring.rotation.x = Math.PI / 2;
      const g = new T.Group(); g.add(p, ring); g.userData.ring = ring; at(g, cx, cy, 0); level.add(g);
      (level.userData.pads = level.userData.pads || []).push(g);
    } else if (w.kind === "crate") {
      level.add(at(box(w.w, w.h, hgt, mat(0xd8b860)), cx, cy, hgt / 2));
      for (const s of [-0.25, 0.25]) level.add(at(box(w.w + 1, 3, hgt + 1, mat(0x8a6a32)), cx, cy + s * w.h, hgt / 2));
    } else if (w.kind === "rock") {
      const r = mesh(new T.DodecahedronGeometry(1, 0), mat(0x7d7d80));
      r.scale.set(w.w * 0.62, hgt * 0.95, w.h * 0.62); at(r, cx, cy, hgt * 0.45); r.rotation.y = (w.x * 7) % 3; level.add(r);
    } else if (w.kind === "tree") {
      level.add(at(mesh(new T.CylinderGeometry(6, 9, 120, 8), mat(0x5a3a1e)), cx, cy, 60));
      level.add(at(mesh(new T.ConeGeometry(w.w * 0.9, 130, 9), mat(0x2f5e28)), cx, cy, 150));
      level.add(at(mesh(new T.ConeGeometry(w.w * 0.65, 100, 9), mat(0x3b7431)), cx, cy, 215));
    } else if (w.kind === "fence") {
      level.add(at(box(w.w, w.h * 0.4, 8, mat(0x94693c)), cx, cy, 26));
      level.add(at(box(w.w, w.h * 0.4, 8, mat(0x94693c)), cx, cy, 12));
      const n = Math.max(2, Math.round(Math.max(w.w, w.h) / 40));
      for (let i = 0; i <= n; i++) { const k = i / n; level.add(at(box(6, 6, hgt, mat(0x7a5530)), w.w > w.h ? w.x + k * w.w : cx, w.w > w.h ? cy : w.y + k * w.h, hgt / 2)); }
    } else {
      level.add(at(box(w.w, w.h, hgt, mat(0x8a8a8a)), cx, cy, (z0 + z1) / 2));
    }
  }

  // ---------------------------------------------------------------- models
  const WEAPON_LEN = { pistol: 18, smg: 24, shotgun: 30, rifle: 34, sniper: 44, staff: 40, ak: 32, sword: 44, rocket: 42 };
  const RAR = [0xd8d8d8, 0x4da6ff, 0xc070ff, 0xffc030, 0xff4b4b];
  function weaponMesh(type, rar) {
    const g = new T.Group(), len = WEAPON_LEN[type] || 24;
    if (type === "sword") {
      g.add(mesh(new T.BoxGeometry(len, 5, 1.6), mat(0xdfe4ea, rar === 4 ? 0x802020 : 0x202428), len / 2 + 6, 0, 0));
      g.add(mesh(new T.BoxGeometry(3, 3, 14), mat(RAR[rar] || 0xd8d8d8), 5, 0, 0));
      g.add(mesh(new T.BoxGeometry(9, 3, 3), mat(0x5a3a1e), 0, 0, 0));
    } else if (type === "rocket") {
      const tube = mesh(new T.CylinderGeometry(4, 4, len, 12), mat(0x4a5a32), len / 2 - 6, 1, 0); tube.rotation.z = Math.PI / 2; g.add(tube);
      const tip = mesh(new T.ConeGeometry(3.5, 9, 10), mat(rar === 4 ? 0xff4b4b : 0xb03a2a), len + 1, 1, 0); tip.rotation.z = -Math.PI / 2; g.add(tip);
      g.add(mesh(new T.BoxGeometry(5, 9, 3.5), mat(0x2a2a2a), 6, -6, 0));
      if (rar > 0) g.add(mesh(new T.BoxGeometry(len - 10, 1.4, 8.4), mat(RAR[rar], RAR[rar]), len / 2 - 4, 1, 0));
    } else if (type === "staff") {
      const shaft = mesh(new T.CylinderGeometry(1.8, 1.8, len, 6), mat(0x8b5a2b), len / 2, 0, 0); shaft.rotation.z = Math.PI / 2; g.add(shaft);
      g.add(mesh(new T.SphereGeometry(4.5, 10, 8), mat(0xff7a2a, 0xff5a10), len, 0, 0));
    } else {
      g.add(mesh(new T.BoxGeometry(len, 5, 4.5), mat(0x333333), len / 2, 0, 0));
      g.add(mesh(new T.BoxGeometry(5, 9, 3.5), mat(0x2a2a2a), 4, -5, 0));
      if (rar > 0) g.add(mesh(new T.BoxGeometry(len - 6, 1.4, 4.8), mat(RAR[rar], RAR[rar]), len / 2 + 2, 1.5, 0));
    }
    return g;
  }
  function hatMesh(hat) {
    const g = new T.Group();
    const cone = (r, h, c, y = h / 2) => g.add(mesh(new T.ConeGeometry(r, h, 12), mat(c), 0, y, 0));
    const cyl = (r1, r2, h, c, y = h / 2) => g.add(mesh(new T.CylinderGeometry(r1, r2, h, 14), mat(c), 0, y, 0));
    const dome = (r, c) => g.add(mesh(new T.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c), 0, -4, 0));
    const horn = (s, c, len = 16) => { const h = mesh(new T.ConeGeometry(3.2, len, 8), mat(c), 0, 4, s * 12); h.rotation.x = s * 1.0; g.add(h); };
    switch (hat) {
      case "crown": cyl(10, 10, 6, 0xffd34d); for (let i = 0; i < 5; i++) { const a = i * 1.256; g.add(mesh(new T.ConeGeometry(2.4, 7, 5), mat(0xffd34d), Math.cos(a) * 9, 9, Math.sin(a) * 9)); } break;
      case "cowboy": cyl(19, 19, 2, 0x8a5a2b, 1); cyl(9, 10, 11, 0x8a5a2b, 7); break;
      case "wizard": cyl(15, 15, 2, 0x4a3ab0, 1); cone(10, 30, 0x4a3ab0, 16); break;
      case "horns": dome(14, 0x999999); horn(-1, 0xeeeeee); horn(1, 0xeeeeee); break;
      case "flower": for (let i = 0; i < 5; i++) g.add(mesh(new T.SphereGeometry(3.5, 8, 6), mat(0xff8fc8), Math.cos(i * 1.26) * 5, 3, Math.sin(i * 1.26) * 5)); g.add(mesh(new T.SphereGeometry(3, 8, 6), mat(0xffd34d), 0, 4, 0)); break;
      case "party": cone(8, 24, 0xff5fa0, 12); g.add(mesh(new T.SphereGeometry(3, 8, 6), mat(0xffe14d), 0, 25, 0)); break;
      case "bucket": cyl(10, 13, 16, 0x8a9aa8, 6); break;
      case "cone": cyl(15, 15, 2, 0xff7a1a, 1); cone(10, 32, 0xff7a1a, 17); break;
      case "tinfoil": cone(12, 20, 0xcfd6de, 8); break;
      case "fish": { const f = mesh(new T.SphereGeometry(1, 12, 8), mat(0x6ab0c0), 0, 5, 0); f.scale.set(16, 6, 6); g.add(f); const t = mesh(new T.ConeGeometry(6, 10, 4), mat(0x6ab0c0), -18, 5, 0); t.rotation.z = Math.PI / 2; g.add(t); break; }
      case "dunce": cone(9, 36, 0xf4f0e0, 16); break;
      case "clown": for (const [x, z, c] of [[-2, -13, 0xff4b4b], [-2, 13, 0x4da6ff], [0, 0, 0xffe14d], [-6, -7, 0x7fd34d], [-6, 7, 0xc070ff]]) g.add(mesh(new T.SphereGeometry(7, 10, 8), mat(c), x, 2, z)); break;
      case "propeller": dome(12, 0x4da6ff); { const p = mesh(new T.BoxGeometry(24, 1.5, 3), mat(0xff4b4b), 0, 12, 0); g.add(p); g.userData.spin = p; } break;
      case "pirate": { const b = mesh(new T.BoxGeometry(8, 12, 30), mat(0x222222), 0, 6, 0); g.add(b); g.add(mesh(new T.SphereGeometry(2.5, 6, 6), mat(0xffffff), 4.5, 7, 0)); break; }
      case "sombrero": cyl(26, 26, 2, 0xd8b060, 1); cone(10, 20, 0xd8b060, 11); cyl(10.5, 10.5, 3, 0xc03030, 4); break;
      case "viking": dome(14, 0x8a8a90); horn(-1, 0xf0e6c8, 20); horn(1, 0xf0e6c8, 20); break;
      case "antlers": for (const s of [-1, 1]) { const a = mesh(new T.CylinderGeometry(1.5, 2, 26, 5), mat(0xd8cfae), 0, 12, s * 9); a.rotation.x = s * 0.5; g.add(a); const b = mesh(new T.CylinderGeometry(1.2, 1.5, 12, 5), mat(0xd8cfae), 0, 16, s * 17); b.rotation.x = s * 1.2; g.add(b); } break;
      case "toque": case "chef": cyl(11, 11, 9, 0xffffff, 4); for (const [x, z] of [[-6, 0], [5, -5], [5, 5], [0, 0]]) g.add(mesh(new T.SphereGeometry(8, 10, 8), mat(0xffffff), x, 14, z)); break;
      case "halo": { const h = mesh(new T.TorusGeometry(11, 1.8, 8, 24), mat(0xffdd60, 0xffc020), 0, 14, 0); h.rotation.x = Math.PI / 2; g.add(h); break; }
      case "dicecrown": cyl(11, 11, 6, 0xffd34d); for (let i = 0; i < 5; i++) { const a = i * 1.256; g.add(mesh(new T.ConeGeometry(2.4, 7, 5), mat(0xffd34d), Math.cos(a) * 10, 9, Math.sin(a) * 10)); } g.add(mesh(new T.BoxGeometry(10, 10, 10), mat(0xffffff), 0, 17, 0)); break;
      case "tophat": cyl(16, 16, 2, 0x222222, 1); cyl(10, 10, 20, 0x222222, 11); cyl(10.4, 10.4, 3, 0xaa3333, 4); break;
      case "hood": dome(15, 0x8a7a5a); break;
      case "witch": cyl(19, 19, 2, 0x2a3a2a, 1); cone(10, 34, 0x2a3a2a, 18); break;
      case "flatcap": { dome(13, 0x5a5040); g.add(mesh(new T.BoxGeometry(12, 2, 20), mat(0x5a5040), 12, 0, 0)); break; }
      case "helmet": dome(15, 0x9999aa); g.add(mesh(new T.BoxGeometry(3, 10, 3), mat(0xcc3333), 0, 12, 0)); break;
    }
    return g;
  }
  function personMesh(color, hat, eyes) {
    const g = new T.Group(), body = new T.Group();
    g.add(body);
    body.add(mesh(new T.CylinderGeometry(11, 13, 28, 14), mat(color), 0, 16, 0));
    const head = mesh(new T.SphereGeometry(13, 16, 12), mat(color), 0, 42, 0); body.add(head);
    if (eyes === "shades") body.add(mesh(new T.BoxGeometry(3, 5, 20), mat(0x111111), 12, 45, 0));
    else for (const s of [-1, 1]) {
      const big = eyes === "googly" ? 1.5 : 1;
      body.add(mesh(new T.SphereGeometry(3.6 * big, 10, 8), mat(0xffffff), 10.5, 45, s * 5.2));
      const pu = mesh(new T.SphereGeometry(1.9 * big, 8, 6), mat(0x111111), 13.2 + big, 45 + (eyes === "sleepy" ? -1 : 0), s * 5.2); body.add(pu);
      if (eyes === "angry") { const b = mesh(new T.BoxGeometry(2, 1.6, 7), mat(0x111111), 12.5, 50, s * 5.2); b.rotation.x = s * 0.5; body.add(b); }
      if (eyes === "sleepy") body.add(mesh(new T.BoxGeometry(2, 2.5, 8), mat(color), 12.6, 47.5, s * 5.2));
    }
    const hatG = hatMesh(hat); hatG.position.y = 53; body.add(hatG); g.userData.hat = hatG;
    const arm = new T.Group(); arm.position.set(4, 32, 9); body.add(arm); g.userData.arm = arm;
    arm.add(mesh(new T.SphereGeometry(4, 8, 6), mat(color), 4, 0, 0));
    g.userData.body = body;
    return g;
  }
  const ZCOL = { e: 0x3a6a8a, t: 0x3f6b3a, r: 0xa0d070, w: 0x6fa35a, c: 0x7a5a3a, f: 0x4a3a5a, x: 0x8aa04a, s: 0xd8d0c0 };
  function zombieMesh(type, bk) {
    const r = ZR[type] || 15;
    const bossCol = { leshen: 0x3a5a2a, drowned: 0x3a6a8a, golem: 0xb08a3a }[bk] || 0x3a5a2a;
    const col = type === "b" ? bossCol : ZCOL[type] || 0x6fa35a;
    const g = new T.Group(), k = r / 15;
    const skin = mat(col);
    const eye = type === "b" ? (bk === "golem" ? 0xff8a20 : 0xff2020) : type === "e" || type === "s" ? 0xbfe8ff : type === "f" ? 0xff3030 : 0xffec40;
    const arms = [];
    if (type === "f") { // a flying thing: a body, a head and two big leathery wings
      g.add(mesh(new T.SphereGeometry(10 * k, 10, 8), skin, 0, 24 * k, 0));
      g.add(mesh(new T.SphereGeometry(7 * k, 10, 8), skin, 9 * k, 30 * k, 0));
      for (const s of [-1, 1]) g.add(mesh(new T.SphereGeometry(1.8 * k, 6, 5), mat(eye, eye), 15 * k, 31 * k, s * 3 * k));
      const wings = [];
      for (const s of [-1, 1]) { const piv = new T.Group(); piv.position.set(0, 26 * k, s * 6 * k); const w = mesh(new T.BoxGeometry(18 * k, 1.5, 30 * k), mat(0x2a2030), 0, 0, s * 15 * k); piv.add(w); g.add(piv); wings.push(piv); }
      g.userData.wings = wings;
    } else {
      const fat = type === "x" ? 1.7 : type === "s" ? 0.7 : 1, tall = type === "s" ? 1.3 : type === "c" ? 0.85 : 1;
      g.add(mesh(new T.CylinderGeometry(10 * k * fat, 12 * k * fat, 30 * k * tall, 12), skin, 0, 17 * k * tall, 0));
      const headY = (type === "c" ? 36 : 42) * k * tall;
      g.add(mesh(new T.SphereGeometry(11 * k * (type === "s" ? 0.8 : 1), 12, 10), skin, (type === "c" ? 8 : 2) * k, headY, 0));
      for (const s of [-1, 1]) g.add(mesh(new T.SphereGeometry(2.4 * k, 8, 6), mat(eye, eye), (type === "c" ? 17 : 11) * k, headY + 2 * k, s * 4.5 * k));
      if (type === "s") g.add(mesh(new T.SphereGeometry(3.5 * k, 8, 6), mat(0x100808), 10 * k, headY - 5 * k, 0)); // the mouth, always open
      if (type === "x") for (let i = 0; i < 6; i++) g.add(mesh(new T.SphereGeometry((3 + (i % 3)) * k, 8, 6), mat(0xc8e060, 0x405010), Math.cos(i * 1.1) * 15 * k, (12 + (i * 5) % 20) * k, Math.sin(i * 1.1) * 15 * k));
      for (const s of [-1, 1]) {
        const big = type === "c" && s === 1; // the charger has one enormous arm
        const a = mesh(new T.BoxGeometry((big ? 30 : 24) * k, (big ? 12 : 5) * k, (big ? 12 : 5) * k), skin, 12 * k, 30 * k * tall, s * (big ? 16 : 12) * k); g.add(a); arms.push(a);
      }
    }
    const fire = mesh(new T.ConeGeometry(12 * k, 40 * k, 8, 1, true), new T.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.55, depthWrite: false }), 0, 26 * k, 0);
    fire.visible = false; g.add(fire); g.userData.fire = fire;
    if (type === "b" && bk === "leshen") for (const s of [-1, 1]) { const a = mesh(new T.CylinderGeometry(3, 4, 70, 6), mat(0xd8cfae), 0, 90, s * 26); a.rotation.x = s * 0.6; g.add(a); const b2 = mesh(new T.CylinderGeometry(2, 3, 34, 6), mat(0xd8cfae), 0, 104, s * 50); b2.rotation.x = s * 1.3; g.add(b2); }
    if (type === "b" && bk === "golem") for (const s of [-1, 1]) g.add(mesh(new T.CylinderGeometry(7, 7, 40, 8), mat(0x6b5220), -10, 60, s * 30));
    if (type === "e" || (type === "b" && bk === "drowned")) { const c = mesh(new T.TorusGeometry(10 * k, 1.5 * k, 6, 20), mat(0xffd34d, 0x806010), 4 * k, 32 * k, 0); c.rotation.y = Math.PI / 2; c.rotation.x = 0.4; g.add(c); }
    g.userData.arms = arms; g.userData.skin = skin; g.userData.r = r;
    return g;
  }
  function vehicleMesh(kind) {
    const g = new T.Group();
    const wheel = (x, z, r, w) => { const m = mesh(new T.CylinderGeometry(r, r, w, 12), mat(0x1a1a1a), x, r, z); m.rotation.x = Math.PI / 2; g.add(m); };
    if (kind === "tractor") {
      wheel(-16, -20, 14, 9); wheel(-16, 20, 14, 9); wheel(18, -17, 9, 6); wheel(18, 17, 9, 6);
      g.add(mesh(new T.BoxGeometry(56, 18, 30), mat(0x3f8a3a), 0, 22, 0));
      g.add(mesh(new T.BoxGeometry(22, 30, 26), mat(0x9fd0e0, 0x102030), -12, 44, 0));
      g.add(mesh(new T.BoxGeometry(24, 4, 30), mat(0x2f6a2c), -12, 60, 0));
      g.add(mesh(new T.CylinderGeometry(2.5, 2.5, 18, 6), mat(0x555555), 12, 40, -8));
    } else if (kind === "buggy") {
      for (const [x, z] of [[-16, -17], [-16, 17], [16, -17], [16, 17]]) wheel(x, z, 9, 7);
      g.add(mesh(new T.BoxGeometry(50, 10, 26), mat(0xe88a2a), 0, 16, 0));
      for (const [x, z] of [[-14, -11], [-14, 11], [4, -11], [4, 11]]) g.add(mesh(new T.BoxGeometry(2.5, 22, 2.5), mat(0x333333), x, 30, z));
      g.add(mesh(new T.BoxGeometry(20, 2.5, 25), mat(0x333333), -5, 41, 0));
    } else {
      for (const [x, z] of [[-36, -16], [-36, 16], [34, -16], [34, 16]]) wheel(x, z, 9, 6);
      g.add(mesh(new T.BoxGeometry(104, 18, 30), mat(0xff8fc8), 0, 18, 0));
      g.add(mesh(new T.BoxGeometry(72, 14, 28), mat(0x402838, 0x100810), -4, 34, 0));
    }
    return g;
  }
  function pieceMesh(kind) {
    const g = new T.Group();
    if (kind === "wall") { g.add(mesh(new T.BoxGeometry(40, 70, 40), mat(0x8a6a42), 20, 35, 20)); for (let i = 0; i < 3; i++) g.add(mesh(new T.BoxGeometry(41, 4, 41), mat(0x6e5232), 20, 12 + i * 22, 20)); }
    else if (kind === "spikes") { g.add(mesh(new T.BoxGeometry(32, 3, 32), mat(0x4a3a2a), 20, 1.5, 20)); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.add(mesh(new T.ConeGeometry(3, 12, 5), mat(0xcfd2d8), 9 + i * 11, 8, 9 + j * 11)); }
    else if (kind === "turret") {
      g.add(mesh(new T.BoxGeometry(36, 30, 36), mat(0x5d6470), 20, 15, 20));
      const head = new T.Group(); head.position.set(20, 38, 20); g.add(head); g.userData.head = head;
      head.add(mesh(new T.CylinderGeometry(12, 13, 14, 12), mat(0x7b8594)));
      head.add(mesh(new T.BoxGeometry(26, 6, 6), mat(0x333333), 16, 2, 0));
      head.add(mesh(new T.SphereGeometry(2.5, 6, 6), mat(0xff3030, 0xff2020), 0, 8, 0));
    } else if (kind === "lamp") {
      g.add(mesh(new T.CylinderGeometry(2.5, 3.5, 70, 6), mat(0x3a2a1a), 20, 35, 20));
      g.add(mesh(new T.SphereGeometry(7, 10, 8), mat(0xffdc78, 0xffc040), 20, 74, 20));
    }
    return g;
  }
  function cropMesh(stage) {
    const g = new T.Group();
    if (stage === 1) g.add(mesh(new T.SphereGeometry(4, 8, 6), mat(0xc9a36a), 0, 4, 0));
    else if (stage === 2) { g.add(mesh(new T.CylinderGeometry(1.5, 1.5, 14, 5), mat(0x7fd34d), 0, 8, 0)); for (const s of [-1, 1]) { const l = mesh(new T.SphereGeometry(1, 8, 6), mat(0x7fd34d), s * 5, 14, 0); l.scale.set(6, 2, 3); g.add(l); } }
    else if (stage === 3) {
      g.add(mesh(new T.SphereGeometry(12, 12, 10), mat(0xe9e0f0), 0, 10, 0));
      g.add(mesh(new T.SphereGeometry(12.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(0xb35fd0), 0, 10, 0));
      for (const s of [-1, 1]) { const l = mesh(new T.SphereGeometry(1, 8, 6), mat(0x4cbf3a), s * 5, 28, 0); l.scale.set(4, 10, 4); l.rotation.z = -s * 0.4; g.add(l); }
    }
    return g;
  }

  // ---------------------------------------------------------------- pooled dynamic things
  function pooled(key, make) {
    let e = pools.get(key);
    if (!e) { e = { obj: make(), seen: 0, init: false }; scene.add(e.obj); pools.set(key, e); }
    e.seen = frameNo;
    return e;
  }
  function sweep() {
    for (const [k, e] of pools) if (e.seen !== frameNo) { scene.remove(e.obj); pools.delete(k); }
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  function smoothTo(e, x, y, z, dt, snap = 200) {
    if (!e.init || Math.hypot(e.x - x, e.y - y) > snap) { e.x = x; e.y = y; e.z = z; e.init = true; }
    const k = Math.min(1, dt * 14);
    e.x = lerp(e.x, x, k); e.y = lerp(e.y, y, k); e.z = lerp(e.z, z, k);
  }
  const angLerp = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

  // ---------------------------------------------------------------- per frame
  function frame(st) {
    frameNo++;
    const { S, MAP, t, dt, me } = st;
    const key = MAP.seed + ":" + MAP.walls.length;
    if (key !== levelKey) { buildLevel(MAP); levelKey = key; }
    // time of day
    let n = 0;
    if (S.g.ph === "night") n = 1;
    else if (S.g.ph === "day" && S.g.left >= 0 && S.g.left < 10) n = (10 - S.g.left) / 10 * 0.7;
    const sky = new T.Color(0x8fc4e8).lerp(new T.Color(0x070a18), n);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    scene.fog.near = lerp(1500, 120, n); scene.fog.far = lerp(4200, 1300, n);
    if (S.g.fog && n > 0) { sky.lerp(new T.Color(0x2a2636), n); scene.background.copy(sky); scene.fog.color.copy(sky); scene.fog.near = 20; scene.fog.far = lerp(1300, 480, n); }
    L.hemi.intensity = lerp(1.7, 0.16, n); L.sun.intensity = lerp(2.2, 0.12, n);
    L.sun.color.setHex(n > 0.5 ? 0x8090ff : 0xfff2d8);
    // the Hearth
    const hw = MAP.hearth, hflash = t - st.hearthHitT < 0.12;
    at(L.hearth, hw.x + hw.w / 2, hw.y + hw.h / 2, 150);
    L.hearth.intensity = (1 + n * 7) * (1 + Math.sin(t * 9) * 0.08);
    const hg = level.userData.hearth;
    if (hg) { const fl = 1 + Math.sin(t * 9) * 0.1; hg.userData.flames.forEach((f, i) => f.scale.set(fl, fl * (i ? 1.1 : 1), fl)); hg.children[0].material = mat(hflash ? 0xcc7777 : 0x9a8a70); }
    if (level.userData.well) { const s = level.userData.well.userData.slop; s.material.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.3; level.userData.well.visible = S.g.mode !== "royale"; }
    for (const pd of level.userData.pads || []) { const k = (t * 1.5) % 1; pd.userData.ring.position.y = 6 + k * 40; pd.userData.ring.material.opacity = 0.8 * (1 - k); }

    // plots
    S.pl.forEach((stage, i) => {
      if (!stage) return;
      const pl = MAP.plots[i];
      const e = pooled(`crop:${i}:${stage}`, () => cropMesh(stage));
      at(e.obj, pl.x, pl.y, 3);
      if (stage === 3) e.obj.position.y = 3 + Math.sin(t * 3 + i) * 1.5;
    });
    // messes
    for (const m of st.messes) {
      const age = t - m.t; if (age > 90) continue;
      const e = pooled(`mess:${m.x}:${m.y}:${m.t}`, () => {
        const g = new T.Group(), s = m.big ? 1.6 : 1;
        if (m.kind === "pee") { const c = mesh(new T.CircleGeometry(16 * s, 16), basic(0xe8d84a, 0.6)); c.rotation.x = -Math.PI / 2; c.scale.set(1, 0.6, 1); g.add(c); }
        else for (let i = 0; i < 3; i++) g.add(mesh(new T.SphereGeometry((9 - i * 2.5) * s, 10, 8), mat(0x6b4520), 0, (3 + i * 5) * s, 0));
        return g;
      });
      at(e.obj, m.x, m.y + 12, (m.z || 0) + 0.6);
    }
    // crates
    for (const [id, x, y, rar, grave] of S.cr) {
      const e = pooled(`crate:${id}`, () => {
        const g = new T.Group();
        if (grave) { g.add(mesh(new T.BoxGeometry(8, 30, 24), mat(0x888888), 0, 15, 0)); const top = mesh(new T.CylinderGeometry(12, 12, 8, 12, 1, false, 0, Math.PI), mat(0x888888), 0, 30, 0); top.rotation.set(0, Math.PI / 2, Math.PI / 2); g.add(top); }
        else { g.add(mesh(new T.BoxGeometry(30, 22, 24), mat(0x6b4a2a), 0, 11, 0)); g.add(mesh(new T.BoxGeometry(31, 5, 25), mat(RAR[rar], RAR[rar]), 0, 11, 0)); }
        g.add(mesh(new T.CylinderGeometry(22, 22, 1, 20), basic(RAR[rar], 0.3), 0, 0.5, 0));
        return g;
      });
      at(e.obj, x, y, 0); e.obj.rotation.y = id;
      e.obj.children[e.obj.children.length - 1].material.opacity = 0.2 + Math.sin(t * 4 + id) * 0.12;
    }
    // things people built
    const lamps = [];
    for (const [id, kind, bx, by, hp, ba] of S.b) {
      const e = pooled(`build:${id}`, () => pieceMesh(kind));
      at(e.obj, bx, by, 0); e.obj.rotation.y = 0;
      if (kind === "turret") e.obj.userData.head.rotation.y = -ba;
      if (kind === "lamp") lamps.push([bx + 20, by + 20]);
    }
    // vehicles (and the celebrity's limo)
    for (const [id, kind, vx, vy, va] of S.vh) {
      const e = pooled(`veh:${id}`, () => vehicleMesh(kind));
      smoothTo(e, vx, vy, 0, dt); e.a = e.a === undefined ? va : angLerp(e.a, va, Math.min(1, dt * 14));
      at(e.obj, e.x, e.y, 0); e.obj.rotation.y = -e.a;
    }
    // townsfolk
    if (MAP.npcs && S.g.mode !== "royale") for (const n2 of MAP.npcs) {
      const e = pooled(`npc:${n2.id}`, () => personMesh(n2.color, n2.hat, "dot"));
      at(e.obj, n2.x, n2.y, Math.abs(Math.sin(t * 2 + n2.x)) * 1.5);
      const p = S.p.find((q) => q.id === me);
      if (p) e.obj.rotation.y = -Math.atan2(p.y - n2.y, p.x - n2.x);
      if (n2.id === "chef") { const l = pooled("limo:chef", () => vehicleMesh("limo")); at(l.obj, n2.x + 90, n2.y + 20, 0); l.obj.rotation.y = -0.2; }
    }
    // the dead
    const bk = S.g.bk;
    for (const zz of S.z) {
      const [id, type, zx, zy, , burn, zh, charging] = zz;
      const e = pooled(`z:${id}:${type}:${type === "b" ? bk : ""}`, () => zombieMesh(type, bk));
      const px = e.x, py = e.y;
      smoothTo(e, zx, zy, zh || 0, dt);
      const mv = Math.hypot(e.x - (px ?? e.x), e.y - (py ?? e.y));
      if (mv > 0.05) e.a = angLerp(e.a ?? 0, Math.atan2(e.y - py, e.x - px), Math.min(1, dt * 8));
      at(e.obj, e.x, e.y, e.z); e.obj.rotation.y = -(e.a || 0);
      const sw = Math.sin(t * 8 + id) * 0.25;
      e.obj.userData.arms.forEach((a, i) => { a.rotation.y = i ? sw : -sw; });
      const fr = e.obj.userData.fire; fr.visible = !!burn; if (burn) { fr.scale.set(1, 0.8 + Math.sin(t * 20 + id) * 0.2, 1); fr.rotation.y = t * 3; }
      if (e.obj.userData.wings) e.obj.userData.wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.sin(t * 14 + id) * 0.7; });
      if (charging) { e.obj.userData.arms.forEach((a) => { a.rotation.z = 0.5; }); e.obj.rotation.z = -0.25; } else e.obj.rotation.z = 0;
    }
    // grenades, molotovs and rockets in flight
    for (const [id, kind, x, y, z] of S.pr || []) {
      const e = pooled(`pr:${id}`, () => {
        const g = new T.Group();
        if (kind === "rocket") { const b = mesh(new T.CylinderGeometry(2.5, 2.5, 16, 8), mat(0x5a6a3a)); b.rotation.z = Math.PI / 2; g.add(b); const tail = mesh(new T.SphereGeometry(5, 8, 6), new T.MeshBasicMaterial({ color: 0xffb040 }), -10, 0, 0); g.add(tail); }
        else if (kind === "molo") { g.add(mesh(new T.CylinderGeometry(3, 3.5, 11, 8), mat(0x6a4a1a))); g.add(mesh(new T.SphereGeometry(3, 6, 5), new T.MeshBasicMaterial({ color: 0xff9a20 }), 0, 8, 0)); }
        else { g.add(mesh(new T.SphereGeometry(4.5, 10, 8), mat(0x3a5a2a))); g.add(mesh(new T.BoxGeometry(2, 3, 2), mat(0x999999), 0, 5, 0)); }
        return g;
      });
      const px = e.px ?? x, py = e.py ?? y, pz = e.pz ?? z;
      at(e.obj, x, y, z);
      if (kind === "rocket" && (x !== px || y !== py)) { const hd = Math.hypot(x - px, y - py); e.obj.rotation.set(0, -Math.atan2(y - py, x - px), Math.atan2(z - pz, hd)); }
      else e.obj.rotation.x = t * 12;
      e.px = x; e.py = y; e.pz = z;
    }
    // fire on the ground
    for (const [cx, cy, fz] of S.fi || []) {
      const e = pooled(`fire:${cx}:${cy}`, () => {
        const g = new T.Group(), flames = [];
        for (let i = 0; i < 4; i++) { const f = mesh(new T.ConeGeometry(7 + (i % 2) * 3, 26 + i * 4, 6), new T.MeshBasicMaterial({ color: i % 2 ? 0xffd040 : 0xff6a10, transparent: true, opacity: 0.85, depthWrite: false }), (i % 2 ? 1 : -1) * (6 + i * 2), 12, ((i >> 1) ? 1 : -1) * 8); g.add(f); flames.push(f); }
        const scorch = mesh(new T.CircleGeometry(22, 12), basic(0x2a1a10, 0.6)); scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.8; g.add(scorch);
        g.userData.flames = flames; return g;
      });
      at(e.obj, (cx + 0.5) * 40, (cy + 0.5) * 40, fz);
      e.obj.userData.flames.forEach((f, i) => { const k = 0.75 + Math.abs(Math.sin(t * (9 + i) + cx * 3 + cy)) * 0.5; f.scale.set(1, k, 1); f.position.y = 12 * k; });
    }
    // players
    let si = 0;
    const spotUse = [];
    for (const p of S.p) {
      if (p.d || p.air === 1) continue;
      const mine = p.id === me;
      const e = pooled(`p:${p.id}:${p.c}:${p.h}:${p.ey}`, () => personMesh(p.c, p.h, p.ey));
      if (mine) { e.x = st.pred.x; e.y = st.pred.y; e.z = st.pred.z; e.init = true; }
      else smoothTo(e, p.x, p.y, p.z || 0, dt);
      const yaw = mine ? st.aimYaw : p.a, pitch = mine ? st.aimPitch : (p.pt || 0);
      at(e.obj, e.x, e.y, e.z); e.obj.rotation.y = -yaw;
      e.obj.visible = !(mine && st.fp) && !p.vh;
      const body = e.obj.userData.body;
      body.scale.y = p.go ? 0.72 : 1;
      if (e.obj.userData.hat.userData.spin) e.obj.userData.hat.userData.spin.rotation.y = t * 20;
      // weapon in hand
      const wk = p.w + ":" + p.wr;
      if (e.wk !== wk) { const arm = e.obj.userData.arm; while (arm.children.length > 1) arm.remove(arm.children[1]); const wm = weaponMesh(p.w, p.wr); wm.position.set(2, 0, 0); arm.add(wm); e.wk = wk; }
      const arm = e.obj.userData.arm;
      const sl = st.slashT.get(p.id), sk = sl ? Math.min(1, (t - sl) / 0.25) : 1;
      arm.rotation.z = p.w === "sword" && sk < 1 ? pitch + 1.4 - sk * 2.6 : pitch;
      arm.rotation.y = p.w === "sword" && sk < 1 ? (sk - 0.5) * 1.6 : 0;
      // parachute
      if (p.air === 2) {
        if (!e.chute) { e.chute = mesh(new T.SphereGeometry(40, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(p.c)); e.chute.position.y = 90; e.obj.add(e.chute); }
        e.chute.visible = true;
      } else if (e.chute) e.chute.visible = false;
      // flashlight
      if (!p.vh) spotUse.push({ x: e.x, y: e.y, z: e.z + 44, yaw, pitch, d: mine ? -1 : (e.x - st.cam.x) ** 2 + (e.y - st.cam.y) ** 2 });
    }
    spotUse.sort((a, b) => a.d - b.d);
    for (const s of L.spots) {
      const u = spotUse[si++];
      if (!u || n < 0.05) { s.intensity = 0; continue; }
      at(s, u.x, u.y, u.z); s.intensity = 7 * n;
      at(s.target, u.x + Math.cos(u.yaw) * Math.cos(u.pitch) * 100, u.y + Math.sin(u.yaw) * Math.cos(u.pitch) * 100, u.z + Math.sin(u.pitch) * 100);
    }
    lamps.sort((a, b) => ((a[0] - st.cam.x) ** 2 + (a[1] - st.cam.y) ** 2) - ((b[0] - st.cam.x) ** 2 + (b[1] - st.cam.y) ** 2));
    L.points.forEach((pt, i) => { const l = lamps[i]; if (!l || n < 0.05) { pt.intensity = 0; return; } at(pt, l[0], l[1], 76); pt.intensity = 4 * n; });
    // the balloon
    if (S.g.drop && S.g.drop[4] < 1) {
      const [x0, y0, x1, y1, k] = S.g.drop;
      const e = pooled("balloon", () => { const g = new T.Group(); const b = mesh(new T.SphereGeometry(60, 20, 16), mat(0xb05a8a)); b.scale.y = 1.2; b.position.y = 110; g.add(b); for (let i = -2; i <= 2; i++) { const s = mesh(new T.SphereGeometry(60.5, 20, 16, i * 0.5, 0.12), mat(0xffd34d)); s.scale.y = 1.2; s.position.y = 110; g.add(s); } g.add(mesh(new T.BoxGeometry(52, 26, 52), mat(0x6b4a2a), 0, 0, 0)); return g; });
      smoothTo(e, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 700, dt);
      at(e.obj, e.x, e.y, e.z);
    }
    // the slop fog
    if (S.g.zone && S.g.ph !== "lobby") {
      const [cx, cy, r] = S.g.zone;
      const e = pooled("zone", () => { const m = mesh(new T.CylinderGeometry(1, 1, 900, 64, 1, true), new T.MeshBasicMaterial({ color: 0xa040e0, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false })); return m; });
      at(e.obj, cx, cy, 450); e.obj.scale.set(Math.max(1, r), 1, Math.max(1, r));
      e.obj.material.opacity = 0.2 + Math.sin(t * 1.5) * 0.04;
    }
    // build ghost
    if (st.ghost) {
      const e = pooled("ghost", () => mesh(new T.BoxGeometry(40, 40, 40), new T.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.45, depthWrite: false })));
      at(e.obj, st.ghost.x + 20, st.ghost.y + 20, 20); e.obj.material.color.setHex(st.ghost.ok ? 0x7dffb0 : 0xff5050);
    }
    // effects
    for (const f of st.fx) {
      const k = (t - f.t0) / f.dur;
      if (k >= 1) continue;
      let o = fxObjs.get(f);
      if (!o) {
        if (f.kind === "tr") { const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute([f.x1, f.z1 ?? 36, f.y1, f.x2, f.z2 ?? 36, f.y2], 3)); o = new T.Line(g, new T.LineBasicMaterial({ color: f.m ? 0xff4b4b : f.col, transparent: true })); }
        else if (f.kind === "boom") o = mesh(new T.SphereGeometry(1, 14, 10), new T.MeshBasicMaterial({ color: f.col ?? (f.dust ? 0xc8b48c : 0xff8a28), transparent: true, depthWrite: false }));
        else if (f.kind === "shout") o = mesh(new T.TorusGeometry(1, 0.08, 6, 32), new T.MeshBasicMaterial({ color: f.col ?? 0xc8e6ff, transparent: true, depthWrite: false }));
        else if (f.kind === "burn") o = mesh(new T.SphereGeometry(4, 6, 5), new T.MeshBasicMaterial({ color: 0xff9a20, transparent: true, depthWrite: false }));
        else if (f.kind === "slash") { o = mesh(new T.TorusGeometry(56, 3, 4, 20, 2.2), new T.MeshBasicMaterial({ color: f.m ? 0xff6a6a : 0xf0f6ff, transparent: true, depthWrite: false, side: T.DoubleSide })); }
        else continue;
        o.userData.fx = f; scene.add(o); fxObjs.set(f, o);
      }
      if (f.kind === "tr") o.material.opacity = 1 - k;
      else if (f.kind === "boom") { const r = f.r * (f.dust ? 0.5 + k * 1.5 : 0.4 + k * 0.8); at(o, f.x, f.y, f.z ?? 20); o.scale.setScalar(r); o.material.opacity = (f.dust ? 0.6 : 1) * (1 - k); }
      else if (f.kind === "shout") { const r = f.full ? 60 + k * 200 : (f.r || 280) * Math.min(1, k * 2); at(o, f.x, f.y, (f.z || 0) + 30); o.rotation.x = Math.PI / 2; o.scale.set(r, r, r); o.material.opacity = 0.6 * (1 - k); }
      else if (f.kind === "burn") { at(o, f.x, f.y, (f.z || 0) + 10 + k * 30); o.material.opacity = 1 - k; }
      else if (f.kind === "slash") { at(o, f.x, f.y, f.z + 32); o.rotation.set(Math.PI / 2, 0, f.a - 1.1 + k * 0.4); o.material.opacity = 0.8 * (1 - k); }
    }
    for (const [f, o] of fxObjs) if ((t - f.t0) / f.dur >= 1 || !st.fx.includes(f)) { scene.remove(o); if (o.geometry) o.geometry.dispose(); o.material.dispose(); fxObjs.delete(f); }
    sweep();

    // camera
    const c = st.cam;
    cam.fov = c.fov; cam.updateProjectionMatrix();
    at(cam, c.x, c.y, c.z);
    if (c.look) cam.lookAt(c.look[0], c.look[2], c.look[1]);
    else cam.lookAt(c.x + Math.cos(c.yaw) * Math.cos(c.pitch), c.z + Math.sin(c.pitch), c.y + Math.sin(c.yaw) * Math.cos(c.pitch));
    updateViewModel(st, t);
    R.render(scene, cam);
  }

  // the gun (or sword) in front of your face in first person
  function updateViewModel(st, t) {
    const vm = st.vm;
    const key = vm ? vm.type + ":" + vm.rar : "";
    if (key !== vmKey) {
      if (viewModel) cam.remove(viewModel);
      viewModel = null; vmKey = key;
      if (vm) { viewModel = new T.Group(); const w = weaponMesh(vm.type, vm.rar); w.rotation.y = Math.PI / 2; w.scale.setScalar(0.55); viewModel.add(w); cam.add(viewModel); }
    }
    if (!viewModel) return;
    viewModel.visible = !!(vm && vm.show);
    if (!vm) return;
    const bob = vm.bob || 0, kick = vm.kick || 0, ads = vm.ads || 0;
    viewModel.position.set(lerp(7, 0, ads) + Math.cos(bob) * 0.5, lerp(-6.5, -3.6, ads) + Math.abs(Math.sin(bob)) * 0.5 + kick * 0.8, -20 + kick * 3);
    viewModel.rotation.set(kick * 0.25, 0, 0);
    if (vm.type === "sword") { const s = vm.swing ?? 1; viewModel.rotation.set(0.2, s < 1 ? 1.2 - s * 2.4 : 0.3, s < 1 ? -0.8 + s * 1.2 : 0.35); }
  }

  function project(x, y, z) {
    const v = new T.Vector3(x, z, y).project(cam);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * vw, y: (1 - v.y) / 2 * vh, d: cam.position.distanceTo(new T.Vector3(x, z, y)) };
  }
  return { init, show, resize, frame, project, get ok() { return ok; } };
})();
