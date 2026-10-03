// SLOP VALLEY — the 3D view (first and third person). Uses three.js, which index.html loads onto window.THREE.
// Game coordinates are (x, y) on the ground and z for height; three.js is y-up, so a game point (x, y, z) sits at (x, z, y).
// game.js owns the game state and the camera maths; this file only turns that state into a scene.
// zombie sizes by the one-letter code the server sends (game.js uses this too)
var ZR = { b: 48, e: 34, t: 26, r: 12, w: 15, c: 20, f: 13, x: 24, s: 14, d: 16, y: 40 };
var R3D = (function () {
  let T = null, R = null, scene = null, cam = null, gl = null, ok = false, vw = 0, vh = 0;
  let level = null, levelKey = "", levelVer = -1;
  const wallObjs = new Map();
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
  let GLASS = null; // office glazing: see-through, and lit from both sides
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
      L.bulbs = []; for (let i = 0; i < 3; i++) { const p = new T.PointLight(0xfff0c0, 0, 320, 0); scene.add(p); L.bulbs.push(p); } // cellars, tunnels and office floors, lit day and night
      L.muzzle = []; for (let i = 0; i < 2; i++) { const p = new T.PointLight(0xffc070, 0, 260, 1.2); scene.add(p); L.muzzle.push(p); } // gunfire lights up the dark
      GLASS = new T.MeshLambertMaterial({ color: 0xbfe2f0, emissive: 0x16303c, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false });
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
    if (MAP.pitch) { // the football pitch
      const p = MAP.pitch; g.fillStyle = "#5a8a40"; g.fillRect(p.x, p.y, p.w, p.h);
      for (let i = 0; i < p.w; i += 80) { g.fillStyle = "#62944a"; g.fillRect(p.x + i, p.y, 40, p.h); }
      g.strokeStyle = "#f0f0f0"; g.lineWidth = 4; g.strokeRect(p.x, p.y, p.w, p.h);
      g.beginPath(); g.moveTo(p.x + p.w / 2, p.y); g.lineTo(p.x + p.w / 2, p.y + p.h); g.stroke();
      g.beginPath(); g.arc(p.x + p.w / 2, p.y + p.h / 2, 50, 0, 7); g.stroke();
      for (const s of [0, 1]) g.strokeRect(s ? p.x + p.w - 70 : p.x, p.y + p.h / 2 - 80, 70, 160);
    }
    g.strokeStyle = "#3d6a2c"; g.lineWidth = 2;
    for (let i = 0; i < 3000; i++) { const x = rnd() * MAP.W, y = rnd() * MAP.H; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x - 1, y - 6); g.moveTo(x, y); g.lineTo(x + 1, y - 8); g.stroke(); }
    for (let i = 0; i < 400; i++) { g.fillStyle = ["#e86", "#fd5", "#c8f", "#fff"][(rnd() * 4) | 0]; g.beginPath(); g.arc(rnd() * MAP.W, rnd() * MAP.H, 3, 0, 7); g.fill(); }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    return tex;
  }

  // the wild's ground: a small tiling texture per biome, so the outlands aren't one flat green
  const BIO_LOOK = { // base, blobs, tufts, specks
    grass:   ["#466f35", ["#3f6630", "#507a3c"], "#355a26", ["#e86", "#fd5", "#fff"]],
    forest:  ["#3d4f2a", ["#4a3a24", "#34482a", "#5a4a2e"], "#2a3c1e", ["#7a5a30", "#6a4a28"]],
    meadow:  ["#5a8a3e", ["#64964a", "#507e36"], "#47753a", ["#fd5", "#fff", "#c8f", "#e86"]],
    moor:    ["#6a7048", ["#7a7a5a", "#5a6040", "#8a8468"], "#585e3a", ["#9a9a8a", "#7a7a6a"]],
    orchard: ["#4f7c38", ["#5a8a40", "#466e32"], "#3d6a2c", ["#d04030", "#e0a030"]],
    ruins:   ["#5e6448", ["#7a7466", "#6a6a5a", "#545a40"], "#4a5236", ["#8a8478", "#6a645a"]],
    stones:  ["#56684a", ["#6a7458", "#4a5a3e"], "#44563a", ["#bfd8ff", "#9aa4ad"]],
  };
  const bioTex = {};
  function bioTexture(kind) {
    if (bioTex[kind]) return bioTex[kind];
    const L = BIO_LOOK[kind] || BIO_LOOK.grass, c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"); let seed = 1 + kind.length * 977; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = L[0]; g.fillRect(0, 0, 256, 256);
    const wrap = (x, y, f) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(x + ox, y + oy); }; // draw across the edges so it tiles
    for (let i = 0; i < 70; i++) { const x = rnd() * 256, y = rnd() * 256, r = 6 + rnd() * 22; g.fillStyle = L[1][(rnd() * L[1].length) | 0]; wrap(x, y, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); }); }
    g.strokeStyle = L[2]; g.lineWidth = 1.5;
    for (let i = 0; i < 220; i++) { const x = rnd() * 256, y = rnd() * 256; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x - 1, y - 5); g.moveTo(x, y); g.lineTo(x + 1, y - 6); g.stroke(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = L[3][(rnd() * L[3].length) | 0]; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 1.5 + rnd() * 1.5, 0, 7); g.fill(); }
    const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    return (bioTex[kind] = tex);
  }
  const BIO_TILE = 250; // world units per repeat of the texture
  const bioMats = {};
  function bioMat(kind) { return bioMats[kind] || (bioMats[kind] = new T.MeshLambertMaterial({ map: bioTexture(kind) })); }

  // ---------------------------------------------------------------- static level
  const ROOFS = [0xa33b2b, 0x3b5ea3, 0x5d6b3a, 0x6b4a8a];
  function buildLevel(MAP) {
    if (level) { scene.remove(level); level.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    level = new T.Group(); wallObjs.clear();
    const gm = new T.MeshLambertMaterial({ map: groundTexture(MAP) }), lake = MAP.walls.find((w) => w.kind === "lake");
    // a piece of the ground, with its texture lined up to the whole map
    // stairwells down into the cellars and tunnels: the ground has a hole in it there
    const cuts = (MAP.walls || []).filter((w) => w.kind === "hole" && w.cut);
    const minus = (a, c) => { // a rectangle with another cut out of it, as up to four rectangles
      const ax1 = a.x + a.w, ay1 = a.y + a.h, cx0 = Math.max(a.x, c.x), cy0 = Math.max(a.y, c.y), cx1 = Math.min(ax1, c.x + c.w), cy1 = Math.min(ay1, c.y + c.h);
      if (cx0 >= cx1 || cy0 >= cy1) return [a];
      const out = [];
      if (cy0 > a.y) out.push({ x: a.x, y: a.y, w: a.w, h: cy0 - a.y });
      if (ay1 > cy1) out.push({ x: a.x, y: cy1, w: a.w, h: ay1 - cy1 });
      if (cx0 > a.x) out.push({ x: a.x, y: cy0, w: cx0 - a.x, h: cy1 - cy0 });
      if (ax1 > cx1) out.push({ x: cx1, y: cy0, w: ax1 - cx1, h: cy1 - cy0 });
      return out;
    };
    const piece = (x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      const geo = new T.PlaneGeometry(w, h), pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (x + w / 2 + pos.getX(i)) / MAP.W, 1 - (y + h / 2 - pos.getY(i)) / MAP.H);
      const m = mesh(geo, gm, x + w / 2, 0, y + h / 2); m.rotation.x = -Math.PI / 2; level.add(m);
    };
    const groundPiece = (x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      let parts = [{ x, y, w, h }];
      for (const c of cuts) parts = parts.flatMap((r) => minus(r, c));
      for (const r of parts) piece(r.x, r.y, r.w, r.h);
    };
    level.userData.lake = lake || null; level.userData.gm = gm; level.userData.bio = new Set();
    if (lake) { // the ground goes round the lake, not over it
      groundPiece(0, 0, MAP.W, lake.y); groundPiece(0, lake.y + lake.h, MAP.W, MAP.H - lake.y - lake.h);
      groundPiece(0, lake.y, lake.x, lake.h); groundPiece(lake.x + lake.w, lake.y, MAP.W - lake.x - lake.w, lake.h);
      const lcx = lake.x + lake.w / 2, lcy = lake.y + lake.h / 2;
      const bed = mesh(new T.PlaneGeometry(lake.w, lake.h), mat(0x8a7a52), lcx, lake.z0, lcy); bed.rotation.x = -Math.PI / 2; level.add(bed);
      for (let i = 0; i < 40; i++) { // weed on the bottom
        const k = (i * 7919) % 997 / 997, j = (i * 104729) % 991 / 991;
        const wd = mesh(new T.ConeGeometry(4, 26 + (i % 5) * 10, 4), mat(0x2f6a3a), lake.x + 20 + k * (lake.w - 40), lake.z0 + 14 + (i % 5) * 5, lake.y + 20 + j * (lake.h - 40)); level.add(wd);
      }
      const water = mesh(new T.PlaneGeometry(lake.w, lake.h), new T.MeshLambertMaterial({ color: 0x2a7ab0, emissive: 0x0a2a40, transparent: true, opacity: 0.62, side: T.DoubleSide, depthWrite: false }), lcx, -2, lcy);
      water.rotation.x = -Math.PI / 2; water.renderOrder = 2; level.add(water); level.userData.water = water;
    } else groundPiece(0, 0, MAP.W, MAP.H);
    // the world's edge: a low dark hedge all round
    const hedge = new T.Group(); level.add(hedge); level.userData.hedge = hedge; // only royale keeps the hedge: everywhere else the wild goes on forever
    for (const [x, y, w, d] of [[MAP.W / 2, -10, MAP.W + 40, 20], [MAP.W / 2, MAP.H + 10, MAP.W + 40, 20], [-10, MAP.H / 2, 20, MAP.H], [MAP.W + 10, MAP.H / 2, 20, MAP.H]]) hedge.add(at(box(w, d, 60, mat(0x2a3d20)), x, y, 30));
    const wild = new T.Group(), wm = bioMat("grass"), WE = 120000; level.add(wild); level.userData.wild = wild; // grass out to the horizon, with a hole for the lake
    const L0 = lake || { x: -1, y: -1, w: 0, h: 0 };
    for (const [x, y, w, h] of [[-WE, -WE, 2 * WE, L0.y + WE], [-WE, L0.y + L0.h, 2 * WE, WE - L0.y - L0.h], [-WE, L0.y, L0.x + WE, L0.h], [L0.x + L0.w, L0.y, WE - L0.x - L0.w, L0.h]]) {
      if (w <= 0 || h <= 0) continue; const geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / BIO_TILE, uv.getY(i) * h / BIO_TILE);
      const m = mesh(geo, wm, x + w / 2, -1, y + h / 2); m.rotation.x = -Math.PI / 2; wild.add(m);
    }
    // farmland beyond the hedge, so the valley doesn't float in the sky when you fly
    const far = mat(0x3f6430), E = 4000;
    for (const [x, y, w, h] of [[-E, -E, MAP.W + 2 * E, E], [-E, MAP.H, MAP.W + 2 * E, E], [-E, 0, E, MAP.H], [MAP.W, 0, E, MAP.H]]) { const m = mesh(new T.PlaneGeometry(w, h), far, x + w / 2, -0.5, y + h / 2); m.rotation.x = -Math.PI / 2; hedge.add(m); }
    for (const w of MAP.walls) addWall(w);
    // plots
    // (plot beds are drawn per frame, since a hoe can add more)
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
    const tgt = new T.Group();
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2, z0 = w.z0 || 0, z1 = w.z1 || 60, hgt = z1 - z0;
    if (w.kind === "house") { // just the roof (you can stand on it); the walls are separate pieces
      const rc = ROOFS[w.roof || 0];
      tgt.add(at(box(w.w + 12, w.h + 12, hgt, mat(rc)), cx, cy, (z0 + z1) / 2));
      tgt.add(at(box(w.w + 14, w.h + 14, 3, mat(0x4a3020)), cx, cy, z0 + 1.5)); // eaves
      for (const s of [-1, 1]) tgt.add(at(box(w.w + 12, 6, 12, mat(rc)), cx, cy + s * (w.h / 2 + 3), z1 + 6)); // parapet
      for (const s of [-1, 1]) tgt.add(at(box(6, w.h, 12, mat(rc)), cx + s * (w.w / 2 + 3), cy, z1 + 6));
      tgt.add(at(box(16, 16, 40, mat(0x6d5a4a)), w.x + w.w * 0.75, w.y + w.h * 0.3, z1 + 20)); // chimney
      tgt.add(at(box(20, 20, 4, mat(0x4a3e34)), w.x + w.w * 0.75, w.y + w.h * 0.3, z1 + 41));
      if (!w.fl) { // a one-storey house's floorboards; a two-storey one has real floors (kind "slab")
        const fl = mesh(new T.PlaneGeometry(w.w - 4, w.h - 4), mat(0x9a6e44), cx, 0.5, cy); fl.rotation.x = -Math.PI / 2; fl.userData.keep = true; tgt.add(fl);
        for (let i = 1; i < w.w / 24; i++) { const b = at(box(1.2, w.h - 6, 0.4, mat(0x7a5232)), w.x + i * 24, cy, 0.8); b.userData.keep = true; tgt.add(b); }
      }
      tgt.add(at(mesh(new T.SphereGeometry(5, 10, 8), mat(0xffe0a0, 0xffb040)), cx, cy, z0 - 8)); // a lamp hanging inside
      tgt.userData.roof = true;
    } else if (w.kind === "hwall") {
      const wc = mat(0x8b5a3a), horiz = w.w >= w.h, len = horiz ? w.w : w.h;
      tgt.add(at(box(w.w, w.h, hgt, wc), cx, cy, (z0 + z1) / 2));
      if (z0 > 0) tgt.add(at(box(w.w + 4, w.h + 4, 5, mat(0x5a3a22)), cx, cy, z0 + 2.5)); // door lintel
      else {
        for (const k of [0, 1]) tgt.add(at(box(horiz ? 6 : w.w + 2, horiz ? w.h + 2 : 6, hgt, mat(0x6a4024)), horiz ? w.x + k * w.w : cx, horiz ? cy : w.y + k * w.h, hgt / 2)); // timber posts
        tgt.add(at(box(w.w + 2, w.h + 2, 5, mat(0x6a4024)), cx, cy, 2.5)); // skirting
        if (len > 70) for (let k = 1, n = Math.floor(len / 90); k <= n; k++) { // windows, glass seen from inside and out
          const f = k / (n + 1), wx = horiz ? w.x + f * w.w : cx, wy = horiz ? cy : w.y + f * w.h;
          tgt.add(at(box(horiz ? 26 : w.w + 2, horiz ? w.h + 2 : 26, 22, mat(0x5a3a22)), wx, wy, hgt * 0.55));
          tgt.add(at(box(horiz ? 22 : w.w + 3, horiz ? w.h + 3 : 22, 18, mat(0x9fc8e0, 0x1a2a3a)), wx, wy, hgt * 0.55));
        }
      }
    } else if (w.kind === "furn") {
      const g = new T.Group(), horiz = w.w >= w.h, rotY = horiz ? 0 : Math.PI / 2, L2 = horiz ? w.w : w.h, D2 = horiz ? w.h : w.w;
      const slab2 = (col, ht, y0) => g.add(mesh(new T.BoxGeometry(L2, ht, D2), mat(col), 0, y0 + ht / 2, 0));
      if (w.f === "sofa") {
        slab2(0x6a4a6a, 18, 0); g.add(mesh(new T.BoxGeometry(L2, 26, 10), mat(0x7a5a7a), 0, 24, -D2 / 2 + 5));
        for (const sx of [-1, 1]) g.add(mesh(new T.BoxGeometry(8, 14, D2), mat(0x7a5a7a), sx * (L2 / 2 - 4), 24, 0));
      } else if (w.f === "counter") {
        slab2(0x8a7a62, hgt - 4, 0); g.add(mesh(new T.BoxGeometry(L2 + 3, 4, D2 + 3), mat(0xcfd2d8), 0, hgt - 2, 0));
        g.add(mesh(new T.CylinderGeometry(1.5, 1.5, 14, 6), mat(0xcfd2d8), L2 / 4, hgt + 5, 0)); // a tap
      } else if (w.f === "wardrobe") {
        slab2(0x6a4024, hgt, 0); for (const sx of [-1, 1]) g.add(mesh(new T.SphereGeometry(2, 6, 5), mat(0xd8c060), sx * 5, hgt * 0.5, D2 / 2 + 1));
      } else if (w.f === "desk") {
        g.add(mesh(new T.BoxGeometry(L2, 4, D2), mat(0x8a6a42), 0, hgt - 2, 0));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new T.BoxGeometry(3, hgt - 4, 3), mat(0x6a4024), sx * (L2 / 2 - 3), (hgt - 4) / 2, sz * (D2 / 2 - 3)));
        g.add(mesh(new T.BoxGeometry(L2 * 0.4, 16, 2), mat(0x2a2a32, 0x16303c), 0, hgt + 8, -D2 / 4)); // a monitor
        g.add(mesh(new T.BoxGeometry(L2 * 0.4, 2, 10), mat(0x3a3a42), 0, hgt + 1, D2 / 6));
      } else if (w.f === "shelf") {
        for (let i = 0; i < 3; i++) g.add(mesh(new T.BoxGeometry(L2, 3, D2), mat(0x6a5236), 0, 14 + i * 20, 0));
        for (let i = 0; i < 6; i++) g.add(mesh(new T.BoxGeometry(7, 11, 7), mat([0x8a6a3a, 0x6a8a4a, 0xa05a4a][i % 3]), -L2 / 2 + 8 + (i % 3) * 12, 20 + ((i / 3) | 0) * 20, 0));
      } else if (w.f === "barrels") {
        for (const [sx, sz] of [[-1, -1], [1, 0], [0, 1]]) g.add(mesh(new T.CylinderGeometry(9, 9, hgt, 10), mat(0x6a4a2a), sx * 9, hgt / 2, sz * 9));
      } else if (w.f === "reception") {
        slab2(0x3a4a5a, hgt - 4, 0); g.add(mesh(new T.BoxGeometry(L2 + 4, 4, D2 + 6), mat(0xa8a49c), 0, hgt - 2, 0));
      } else if (w.f === "plant") {
        g.add(mesh(new T.CylinderGeometry(8, 7, 14, 10), mat(0x8a5a3a), 0, 7, 0));
        for (let i = 0; i < 5; i++) { const lf = mesh(new T.ConeGeometry(5, 26, 4), mat(0x2f6a3a), Math.cos(i * 1.26) * 4, 24, Math.sin(i * 1.26) * 4); lf.rotation.z = Math.cos(i) * 0.3; g.add(lf); }
      } else if (w.f === "cooler") {
        slab2(0xdfe6ec, hgt - 14, 0); g.add(mesh(new T.CylinderGeometry(7, 7, 16, 10), mat(0x9fd8f0, 0x2a6a8a), 0, hgt - 6, 0));
      } else if (w.f === "printer") {
        slab2(0x45484e, hgt - 6, 0); g.add(mesh(new T.BoxGeometry(L2 - 4, 3, D2 * 0.6), mat(0xf0ead8), 0, hgt - 4, D2 * 0.2));
      } else if (w.f === "ac") { // air-conditioning units on an office roof
        slab2(0x8a8e92, hgt - 6, 0); g.add(mesh(new T.CylinderGeometry(D2 * 0.3, D2 * 0.3, 5, 12), mat(0x6a6e72), 0, hgt - 3, 0));
        g.add(mesh(new T.BoxGeometry(L2 * 0.6, 2, 2), mat(0x45484e), 0, hgt, 0));
      } else if (w.f === "bed") {
        g.add(mesh(new T.BoxGeometry(L2, 10, D2), mat(0x6a4024), 0, 5, 0));
        g.add(mesh(new T.BoxGeometry(L2 - 4, 6, D2 - 4), mat(0xf0ead8), 0, 13, 0));
        g.add(mesh(new T.BoxGeometry(L2 * 0.6, 7, D2 - 2), mat([0xb04040, 0x4060a0, 0x5a8a40, 0x8a5aa0][w.id % 4]), L2 * 0.18, 14, 0)); // blanket
        g.add(mesh(new T.BoxGeometry(12, 6, D2 - 16), mat(0xffffff), -L2 / 2 + 9, 17, 0)); // pillow
        g.add(mesh(new T.BoxGeometry(4, 26, D2), mat(0x5a3418), -L2 / 2 + 2, 13, 0)); // headboard
      } else {
        g.add(mesh(new T.BoxGeometry(L2, 4, D2), mat(0x8a5a32), 0, z1 - 2, 0));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new T.BoxGeometry(3, z1 - 4, 3), mat(0x6a4024), sx * (L2 / 2 - 4), (z1 - 4) / 2, sz * (D2 / 2 - 4)));
        g.add(mesh(new T.CylinderGeometry(2, 2, 7, 8), mat(0xf4f0e0), 0, z1 + 3.5, 0)); // a candle
        g.add(mesh(new T.SphereGeometry(1.6, 6, 5), basic(0xffc040, 1), 0, z1 + 8, 0));
        g.add(mesh(new T.CylinderGeometry(5, 4, 3, 10), mat(0xd8d0c0), L2 / 4, z1 + 1.5, 0)); // a bowl of slop
      }
      g.rotation.y = rotY; at(g, cx, cy, 0); tgt.add(g);
    } else if (w.kind === "bulb") { // a bare bulb; the lights themselves follow the camera (see below)
      const g = new T.Group();
      g.add(mesh(new T.CylinderGeometry(0.5, 0.5, 10, 4), mat(0x3a3a3a), 0, 5, 0));
      g.add(mesh(new T.SphereGeometry(4, 10, 8), new T.MeshBasicMaterial({ color: 0xfff0c0 }), 0, 0, 0));
      at(g, cx, cy, z0); tgt.add(g);
      (level.userData.bulbs = level.userData.bulbs || []).push([cx, cy, z0]);
    } else if (w.kind === "hole" || w.ns === 1) {
      // a dug-out patch: the only thing to draw is the floor at the bottom. Its walls are "earth" boxes.
      if (w.kind === "hole" && !w.cut) {
        const FC = { cellar: 0x6a6054, tunnel: 0x5e564a, hatch: 0x6a6a64 }[w.look] || 0x5e564a;
        const fl = mesh(new T.PlaneGeometry(w.w, w.h), mat(FC), cx, z0 + 0.2, cy); fl.rotation.x = -Math.PI / 2; tgt.add(fl);
        const n = Math.max(1, Math.round(Math.min(w.w, w.h) / 30)); // boards / sleepers across it
        for (let i = 1; i < n; i++) tgt.add(at(box(w.w > w.h ? 2 : w.w, w.w > w.h ? w.h : 2, 1, mat(0x4a443a)), w.w > w.h ? w.x + (i / n) * w.w : cx, w.w > w.h ? cy : w.y + (i / n) * w.h, z0 + 1));
      }
      // a building's footprint is not a thing you can see (its walls and floors are their own boxes)
      if (w.kind === "office" && w.name) { // the company name over the door
        const sg = new T.Group(), horiz = true, nz = w.fl * 100 + 6;
        sg.add(mesh(new T.BoxGeometry(w.w * 0.6, 22, 4), mat(0x1a2230), 0, 0, w.door === "n" ? -w.h / 2 - 3 : w.h / 2 + 3));
        for (let i = 0; i < w.name.length; i++) sg.add(mesh(new T.BoxGeometry(5, 12, 1.5), mat(0x9fe0ff, 0x3a8ab0), -w.w * 0.26 + i * (w.w * 0.52 / Math.max(1, w.name.length - 1)), 0, (w.door === "n" ? -w.h / 2 - 6 : w.h / 2 + 6)));
        at(sg, cx, cy, nz); tgt.add(sg); void horiz;
      }
    } else if (w.kind === "glass") { // an office window: a pane with a frame round it
      tgt.add(at(box(w.w, w.h, hgt, GLASS), cx, cy, (z0 + z1) / 2));
      const horiz = w.w >= w.h;
      tgt.add(at(box(horiz ? w.w : w.w + 1, horiz ? w.h + 1 : w.h, 4, mat(0x7a8290)), cx, cy, z0 + 2));
      tgt.add(at(box(horiz ? w.w : w.w + 1, horiz ? w.h + 1 : w.h, 4, mat(0x7a8290)), cx, cy, z1 - 2));
    } else if (w.kind === "slab") { // a floor, a ceiling, or the turf over a tunnel
      const SL = { wood: [0x9a6e44, 0x7a5232], carpet: [0x4a5a66, 0x3a4a56], roof: [0x6a6e72, 0x55585c], turf: [0x5a4632, 0x6b4a33], stone: [0x8a8a86, 0x72726e] }[w.look] || [0x8a8a8a, 0x6a6a6a];
      tgt.add(at(box(w.w, w.h, hgt, mat(SL[0])), cx, cy, (z0 + z1) / 2));
      if (w.look === "wood" || w.look === "carpet") for (let i = 1; i < w.w / 26; i++) tgt.add(at(box(1.2, w.h, 0.6, mat(SL[1])), w.x + i * 26, cy, z1 + 0.3));
      if (w.look === "roof") tgt.add(at(box(w.w - 6, w.h - 6, 1, mat(0x4a4e52)), cx, cy, z1 + 0.6));
    } else if (w.kind === "rail") {
      const horiz = w.w >= w.h;
      tgt.add(at(box(w.w, w.h, 4, mat(0x6a6a74)), cx, cy, z1 - 2));
      for (let i = 0; i <= Math.max(1, Math.round((horiz ? w.w : w.h) / 40)); i++) {
        const f = i / Math.max(1, Math.round((horiz ? w.w : w.h) / 40));
        tgt.add(at(box(4, 4, hgt, mat(0x6a6a74)), horiz ? w.x + f * w.w : cx, horiz ? cy : w.y + f * w.h, (z0 + z1) / 2));
      }
    } else if (w.kind === "pillar") {
      const PC = { mullion: 0x8a929c, core: 0xa8a49c, parapet: 0x9a9690 }[w.look] || 0xb4b0a8;
      tgt.add(at(box(w.w, w.h, hgt, mat(PC)), cx, cy, (z0 + z1) / 2));
    } else if (w.kind === "earth") { // packed earth round the cellars and tunnels, with a brick face
      tgt.add(at(box(w.w, w.h, hgt - 1, mat(0x5a4632)), cx, cy, (z0 + z1 - 1) / 2));
      tgt.add(at(box(w.w + 0.5, w.h + 0.5, 10, mat(0x6b4a33)), cx, cy, z1 - 24));
    } else if (w.kind === "lake") {
      // drawn with the ground
    } else if (w.kind === "bank") { // the sides of the lake, seen from under the water
      tgt.add(at(box(w.w, w.h, hgt - 1, mat(0x5a4a32)), cx, cy, (z0 + z1 - 1) / 2));
    } else if (w.kind === "shrine") {
      const st = mat(0x6a7a7a), dk = mat(0x4a5858);
      tgt.add(at(box(w.w + 30, w.h + 30, 10, dk), cx, cy, z0 + 5)); // steps
      tgt.add(at(box(w.w + 14, w.h + 14, 10, st), cx, cy, z0 + 15));
      tgt.add(at(box(w.w * 0.7, w.h * 0.6, hgt - 30, mat(0x5a6a6a)), cx, cy, z0 + 20 + (hgt - 30) / 2)); // the sealed door block
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tgt.add(at(mesh(new T.CylinderGeometry(7, 8, hgt - 10, 10), st), cx + sx * (w.w / 2 - 6), cy + sy * (w.h / 2 - 6), z0 + 10 + (hgt - 10) / 2));
      tgt.add(at(box(w.w + 10, w.h + 10, 10, dk), cx, cy, z1 - 5)); // lintel slab
      const seal = mesh(new T.TorusGeometry(18, 3, 8, 24), mat(0x2a8a8a, 0x105050)); seal.rotation.y = Math.PI / 2; at(seal, cx, cy - w.h * 0.3 - 1, z0 + 55); tgt.add(seal);
      tgt.userData.seal = seal; level.userData.shrine = tgt;
    } else if (w.kind === "glyph") {
      tgt.add(at(box(w.w, w.h, hgt - 14, mat(0x5a6868)), cx, cy, z0 + (hgt - 14) / 2));
      const GC = [0xffc840, 0xbfd8ff, 0xffffff, 0xc070ff][w.g || 0];
      const gem = mesh(new T.OctahedronGeometry(9, 0), mat(GC, 0x000000)); at(gem, cx, cy, z1 - 4); tgt.add(gem);
      tgt.userData.gem = gem; tgt.userData.gc = GC; tgt.userData.g = w.g;
      (level.userData.glyphs = level.userData.glyphs || []).push(tgt);
    } else if (w.kind === "vent") {
      const v = mesh(new T.CylinderGeometry(w.w / 2, w.w / 2 + 6, 6, 14), mat(0x3a3a3a), 0, 3, 0); at(v, cx, cy, z0); tgt.add(v);
      const hole = mesh(new T.CircleGeometry(w.w / 2 - 4, 14), mat(0x101010, 0x0a2a3a)); hole.rotation.x = -Math.PI / 2; at(hole, cx, cy, z0 + 6.2); tgt.add(hole);
      const bub = [];
      for (let i = 0; i < 8; i++) { const b = mesh(new T.SphereGeometry(2 + (i % 3), 8, 6), basic(0xd8f4ff, 0.7)); tgt.add(b); bub.push(b); }
      tgt.userData.vent = { bub, x: cx, y: cy, z0 }; (level.userData.vents = level.userData.vents || []).push(tgt);
    } else if (w.kind === "hearth") {
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(w.w, hgt, w.h), mat(0x9a8a70), 0, hgt / 2, 0));
      g.add(mesh(new T.BoxGeometry(w.w + 10, 10, w.h + 10), mat(0x6f5f4a), 0, hgt + 5, 0));
      const f1 = mesh(new T.ConeGeometry(30, 70, 10), mat(0xff8a2a, 0xff6a10), 0, hgt + 40, 0), f2 = mesh(new T.ConeGeometry(16, 44, 8), mat(0xffe07a, 0xffd040), 0, hgt + 32, 0);
      g.add(f1, f2); g.userData.flames = [f1, f2];
      level.userData.hearth = at(g, cx, cy, 0); tgt.add(g);
    } else if (w.kind === "tower") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0x7d7066)), cx, cy, hgt / 2));
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tgt.add(at(box(14, 14, 18, mat(0x6d6056)), cx + dx * (w.w / 2 - 7), cy + dy * (w.h / 2 - 7), z1 + 9));
      tgt.add(at(box(w.w + 4, w.h + 4, 6, mat(0x5a4e46)), cx, cy, z1 - 3));
    } else if (w.kind === "bridge") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0x8a6a42)), cx, cy, (z0 + z1) / 2));
      const horiz = w.w > w.h;
      for (const s of [-1, 1]) tgt.add(at(box(horiz ? w.w : 4, horiz ? 4 : w.h, 26, mat(0x6e5232)), horiz ? cx : cx + s * (w.w / 2 - 2), horiz ? cy + s * (w.h / 2 - 2) : cy, z1 + 13));
    } else if (w.kind === "step") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0x9a7a4a)), cx, cy, hgt / 2));
      tgt.add(at(box(w.w, w.h, 3, mat(0x7a5a32)), cx, cy, z1 - 1.5));
    } else if (w.kind === "ledge") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0x6a6a74)), cx, cy, (z0 + z1) / 2));
      tgt.add(at(box(w.w + 2, w.h + 2, 2, mat(0x7dffb0, 0x2a9a60)), cx, cy, z0 + 1));
    } else if (w.kind === "boost") { // a speed booster: a dark plate with glowing arrows that chase along it
      const g = new T.Group(); g.add(mesh(new T.BoxGeometry(w.w, 2, w.h), mat(0x2a2a34), 0, 1, 0));
      const arrows = [];
      for (let i = 0; i < 3; i++) {
        const sh = new T.Shape(); sh.moveTo(-6, -14); sh.lineTo(8, 0); sh.lineTo(-6, 14); sh.lineTo(-12, 14); sh.lineTo(2, 0); sh.lineTo(-12, -14);
        const a = mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: 0xff9a20, transparent: true, side: T.DoubleSide, depthWrite: false }), (i - 1) * 16, 2.3, 0); a.rotation.x = -Math.PI / 2; g.add(a); arrows.push(a);
      }
      g.rotation.y = -(w.a || 0); g.userData.arrows = arrows; at(g, cx, cy, 0); tgt.add(g);
      (level.userData.boosts = level.userData.boosts || []).push(g);
    } else if (w.kind === "pad") {
      const p = mesh(new T.CylinderGeometry(w.w / 2, w.w / 2 + 3, 5, 20), mat(0x40e0ff, 0x1090c0), 0, 2.5, 0);
      const ring = mesh(new T.TorusGeometry(w.w / 2 - 4, 2.5, 6, 24), basic(0xbff8ff, 0.8), 0, 6, 0); ring.rotation.x = Math.PI / 2;
      const g = new T.Group(); g.add(p, ring); g.userData.ring = ring; at(g, cx, cy, 0); tgt.add(g);
      (level.userData.pads = level.userData.pads || []).push(g);
    } else if (w.kind === "stall") { // a market stall: a counter, crates of veg, posts and a striped awning
      tgt.add(at(box(w.w, w.h, hgt, mat(0x8a5a2a)), cx, cy, hgt / 2));
      tgt.add(at(box(w.w + 4, w.h + 4, 3, mat(0xa87a4a)), cx, cy, hgt + 1.5));
      const vc = [0xb35fd0, 0xc8a060, 0xe83a2a, 0xffd34d, 0xff8a20];
      for (let i = 0; i < 5; i++) { const x = w.x + 12 + i * (w.w - 24) / 4; tgt.add(at(box(18, 16, 8, mat(0x6b4520)), x, cy, hgt + 7)); for (let j = 0; j < 3; j++) tgt.add(at(mesh(new T.SphereGeometry(3.6, 8, 6), mat(vc[i])), x - 4 + j * 4, cy + (j % 2) * 3 - 1, hgt + 12)); }
      for (const [px, py] of [[w.x, w.y], [w.x + w.w, w.y], [w.x, w.y + w.h], [w.x + w.w, w.y + w.h]]) tgt.add(at(mesh(new T.CylinderGeometry(2, 2, 96, 6), mat(0x6b4520)), px, py, 48));
      for (let i = 0; i < 6; i++) { const sw = (w.w + 16) / 6; tgt.add(at(box(sw, w.h + 30, 3, mat(i % 2 ? 0xf4f0e0 : 0x3a9a4a)), w.x - 8 + sw * (i + 0.5), cy, 98)); }
      const sign = mesh(new T.BoxGeometry(70, 14, 2), mat(0xf4e0a0)); at(sign, cx, w.y + w.h + 16, 86); tgt.add(sign);
    } else if (w.kind === "shop" && w.sid === "casino") { // the Golden Slop: a purple box, gold trim, a big spinning wheel on the front
      tgt.add(at(box(w.w, w.h, hgt, mat(0x3a1640)), cx, cy, hgt / 2));
      tgt.add(at(box(w.w + 8, w.h + 8, 6, mat(0xffd34d, 0x806010)), cx, cy, hgt + 3));
      tgt.add(at(box(w.w + 2, w.h + 2, 4, mat(0xffd34d, 0x806010)), cx, cy, 2));
      const wheel = new T.Group(); wheel.add(mesh(new T.CylinderGeometry(34, 34, 4, 16), mat(0xffd34d, 0x604000)));
      for (let i = 0; i < 8; i++) { const sp = mesh(new T.BoxGeometry(3, 5, 62), mat(i % 2 ? 0xc03050 : 0xf4f0e0)); sp.rotation.y = i * Math.PI / 8; wheel.add(sp); }
      wheel.rotation.x = Math.PI / 2; at(wheel, cx, w.y + w.h + 3, hgt * 0.62); tgt.add(wheel); (level.userData.spin = level.userData.spin || []).push(wheel);
      tgt.add(at(box(50, 4, 70, mat(0x1a0a10)), cx, w.y + w.h + 1, 35)); // the door
      const sign = mesh(new T.BoxGeometry(w.w * 0.8, 3, 26), mat(0xff5080, 0xc02050)); at(sign, cx, w.y + w.h + 2, hgt + 22); tgt.add(sign);
    } else if (w.kind === "shop") { // a shopfront: the building behind, a counter at the front, a striped awning
      const arm = w.sid === "armoury", body = mat(arm ? 0x4a5236 : 0x8a6a42);
      tgt.add(at(box(w.w, w.h * 0.55, hgt + 40, body), cx, w.y + w.h * 0.275, (hgt + 40) / 2));
      tgt.add(at(box(w.w, w.h * 0.45, 34, mat(arm ? 0x3a3a32 : 0x6b4520)), cx, w.y + w.h * 0.775, 17)); // the counter
      tgt.add(at(box(w.w + 6, w.h * 0.6, 4, mat(arm ? 0x2a2a26 : 0x5a3a1e)), cx, w.y + w.h * 0.3, hgt + 42));
      for (let i = 0; i < 8; i++) { const sw = (w.w + 12) / 8; tgt.add(at(box(sw, 30, 3, mat(i % 2 ? 0xf4f0e0 : arm ? 0x5a6a3a : 0xd06a2a)), w.x - 6 + sw * (i + 0.5), w.y + w.h + 6, hgt + 10)); }
      if (arm) for (let i = 0; i < 6; i++) tgt.add(at(mesh(new T.CapsuleGeometry(6, 14, 3, 6), mat(0x8a7a52)), w.x + 14 + i * 24, w.y + w.h + 8, 6).rotateZ(Math.PI / 2));
      else for (let i = 0; i < 6; i++) tgt.add(at(box(12, 10, 14, mat([0xd0a040, 0xe83a2a, 0x7ab0e0, 0xf4f0e0, 0x8a5a2a, 0x40a060][i])), w.x + 16 + i * 23, w.y + w.h * 0.775, 41));
      const sign = mesh(new T.BoxGeometry(90, 3, 18), mat(0xf4e0a0)); at(sign, cx, w.y + w.h * 0.55 + 2, hgt + 22); tgt.add(sign);
    } else if (w.kind === "bunker") { // a squat concrete block with a hatch on top and a yellow sign
      const conc = mat(0x8a8a82), dk = mat(0x5a5a54);
      tgt.add(at(box(w.w, w.h, hgt, conc), cx, cy, hgt / 2));
      tgt.add(at(box(w.w + 6, w.h + 6, 4, dk), cx, cy, hgt + 2));
      const hatch = mesh(new T.CylinderGeometry(16, 16, 4, 16), mat(0x4a5a3a), 0, 0, 0); at(hatch, cx, cy, hgt + 5); tgt.add(hatch);
      const wheel = mesh(new T.TorusGeometry(9, 1.6, 6, 16), mat(0x2a2a2a)); wheel.rotation.x = Math.PI / 2; at(wheel, cx, cy, hgt + 9); tgt.add(wheel);
      const sign = mesh(new T.BoxGeometry(2, 26, 26), mat(0xffd34d, 0x403000)); at(sign, w.x + w.w + 1.5, cy, hgt * 0.6); tgt.add(sign);
      for (let i = 0; i < 3; i++) { const bl = mesh(new T.BoxGeometry(2.4, 2, 10), mat(0x111111)); bl.rotation.x = i * Math.PI * 2 / 3; at(bl, w.x + w.w + 2.8, cy, hgt * 0.6); bl.position.z += Math.cos(i * Math.PI * 2 / 3) * 0; tgt.add(bl); }
      tgt.add(at(mesh(new T.SphereGeometry(2.6, 8, 6), mat(0x111111)), w.x + w.w + 2.8, cy, hgt * 0.6));
      for (const [vx, vy] of [[w.x + 12, w.y + 12], [w.x + w.w - 12, w.y + w.h - 12]]) tgt.add(at(mesh(new T.CylinderGeometry(3, 3, 22, 8), dk), vx, vy, hgt + 11)); // air vents
    } else if (w.kind === "crate") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0xd8b860)), cx, cy, hgt / 2));
      for (const s of [-0.25, 0.25]) tgt.add(at(box(w.w + 1, 3, hgt + 1, mat(0x8a6a32)), cx, cy + s * w.h, hgt / 2));
    } else if (w.kind === "ruin") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0x8c867a)), cx, cy, z0 + hgt / 2));
      tgt.add(at(box(w.w * 0.6, w.h + 2, 6, mat(0x5f7a3a)), cx - w.w * 0.15, cy, z1 - 2)); // moss on top
    } else if (w.kind === "rock") {
      const r = mesh(new T.DodecahedronGeometry(1, 0), mat(w.stone ? 0x9a9690 : 0x7d7d80));
      if (w.stone) { tgt.add(at(box(w.w, w.h, hgt, mat(0x9a9690)), cx, cy, z0 + hgt / 2)); level.add(tgt); if (w.id !== undefined) wallObjs.set(w.id, tgt); tgt.userData.ck = w.ck ? [cx, cy] : null; return; }
      r.scale.set(w.w * 0.62, hgt * 0.95, w.h * 0.62); at(r, cx, cy, z0 + hgt * 0.45); r.rotation.y = (w.x * 7) % 3; tgt.add(r);
    } else if (w.kind === "tree") {
      tgt.add(at(mesh(new T.CylinderGeometry(6, 9, 120, 8), mat(0x5a3a1e)), cx, cy, 60));
      if (w.fruit) { // a squat apple tree
        tgt.add(at(mesh(new T.SphereGeometry(w.w * 0.75, 10, 8), mat(0x4a8a34)), cx, cy, 140));
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + (w.x % 7); tgt.add(at(mesh(new T.SphereGeometry(5, 6, 5), mat(0xd23a2a)), cx + Math.cos(a) * w.w * 0.6, cy + Math.sin(a) * w.w * 0.6, 125 + (i % 3) * 14)); }
      } else {
        tgt.add(at(mesh(new T.ConeGeometry(w.w * 0.9, 130, 9), mat(w.dark ? 0x1f4220 : 0x2f5e28)), cx, cy, 150));
        tgt.add(at(mesh(new T.ConeGeometry(w.w * 0.65, 100, 9), mat(w.dark ? 0x28512a : 0x3b7431)), cx, cy, 215));
      }
    } else if (w.kind === "fence") {
      tgt.add(at(box(w.w, w.h * 0.4, 8, mat(0x94693c)), cx, cy, 26));
      tgt.add(at(box(w.w, w.h * 0.4, 8, mat(0x94693c)), cx, cy, 12));
      const n = Math.max(2, Math.round(Math.max(w.w, w.h) / 40));
      for (let i = 0; i <= n; i++) { const k = i / n; tgt.add(at(box(6, 6, hgt, mat(0x7a5530)), w.w > w.h ? w.x + k * w.w : cx, w.w > w.h ? cy : w.y + k * w.h, hgt / 2)); }
    } else if (w.kind === "rubble") {
      tgt.add(at(box(w.w * 0.9, w.h * 0.9, hgt * 0.6, mat(0x6d5a4a)), cx, cy, hgt * 0.3));
      for (let i = 0; i < 9; i++) { const c = mesh(new T.BoxGeometry(18 + (i * 7) % 20, 10 + (i * 5) % 14, 16), mat(i % 3 ? 0x8b5a3a : ROOFS[w.roof || 0])); at(c, w.x + ((i * 37) % 97) / 97 * w.w, w.y + ((i * 61) % 89) / 89 * w.h, hgt * 0.6 + (i % 3) * 3); c.rotation.set(i, i * 2, i * 3); tgt.add(c); }
    } else if (w.kind === "post") {
      tgt.add(at(box(w.w, w.h, hgt, mat(0xf4f4f4)), cx, cy, (z0 + z1) / 2));
    } else {
      tgt.add(at(box(w.w, w.h, hgt, mat(0x8a8a8a)), cx, cy, (z0 + z1) / 2));
    }
    level.add(tgt); if (w.id !== undefined) wallObjs.set(w.id, tgt);
    tgt.userData.ck = w.ck ? [cx, cy] : null;
  }
  // walls can be destroyed (and rubble appears) without rebuilding the whole level
  function syncWalls(MAP) {
    const ids = new Set(MAP.walls.map((w) => w.id));
    for (const [id, o] of wallObjs) if (!ids.has(id)) { level.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); wallObjs.delete(id); }
    for (const w of MAP.walls) if (w.id !== undefined && !wallObjs.has(w.id)) addWall(w);
  }

  // ---------------------------------------------------------------- models
  const WEAPON_LEN = { laser: 46, pistol: 18, smg: 24, shotgun: 30, rifle: 34, sniper: 44, staff: 40, ak: 32, sword: 44, rocket: 42 };
  const RAR = [0xd8d8d8, 0x4da6ff, 0xc070ff, 0xffc030, 0xff4b4b];
  // paint jobs: [metal, furniture, emissive]
  const SKIN = { camo: [0x4a5a32, 0x8a7a50, 0], slop: [0x5aa03a, 0x3a7a24, 0x123a08], tiger: [0xd07020, 0x1c1c1c, 0x2a1000], pink: [0xff6ab0, 0xffd0e8, 0x3a0a20], gold: [0xd8b040, 0xb08a20, 0x403000] };
  function weaponMesh(type, rar, skin, att) {
    const g = weaponBody(type, rar, skin, att), len = WEAPON_LEN[type] || 24;
    const tip = GUN[type] ? GUN[type].rc + GUN[type].bl + 2 : len + 3;
    const flash = new T.Group(); // muzzle flash, shown for a blink when you fire
    flash.add(mesh(new T.SphereGeometry(3.2, 8, 6), new T.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.95, depthWrite: false })));
    for (let i = 0; i < 4; i++) { const sp = mesh(new T.ConeGeometry(1.6, 9, 5), new T.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, depthWrite: false })); sp.rotation.z = -Math.PI / 2; sp.rotation.x = i * Math.PI / 2; sp.position.x = 4; flash.add(sp); }
    flash.position.set(tip + 2, 1.2, 0); flash.visible = false; g.add(flash); g.userData.flash = flash;
    return g;
  }
  function weaponBody(type, rar, skin, att) {
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
    } else if (type === "laser") { // Spartan Laser: a long boxy shoulder cannon with a glowing red emitter and power cells
      const body = mat(0x9aa0a6), dark = mat(0x2a2d31), glow = mat(0xff2a2a, 0xff1010);
      g.add(mesh(new T.BoxGeometry(len * 0.75, 7, 6), body, len * 0.35, 1, 0)); // main body
      g.add(mesh(new T.BoxGeometry(len * 0.5, 3, 7.5), dark, len * 0.5, 5, 0)); // top housing
      const bar = mesh(new T.CylinderGeometry(2.6, 3.2, len * 0.3, 10), dark, len * 0.85, 1, 0); bar.rotation.z = Math.PI / 2; g.add(bar); // barrel shroud
      const em = mesh(new T.CylinderGeometry(2, 2, 1.5, 10), glow, len + 0.5, 1, 0); em.rotation.z = Math.PI / 2; g.add(em); // emitter
      for (let i = 0; i < 3; i++) g.add(mesh(new T.BoxGeometry(2.4, 2, 7.8), glow, len * 0.18 + i * 4, 1, 0)); // power cells
      const grip = mesh(new T.BoxGeometry(3.5, 8, 3.2), dark, 4, -5, 0); grip.rotation.z = -0.3; g.add(grip);
      g.add(mesh(new T.BoxGeometry(3, 6, 3), dark, len * 0.55, -4.5, 0)); // front grip
      g.add(mesh(new T.BoxGeometry(5, 3, 3), dark, len * 0.42, 8, 0)); // sight
      if (rar > 0) g.add(mesh(new T.BoxGeometry(len * 0.6, 1.2, 6.4), mat(RAR[rar], RAR[rar]), len * 0.35, -2.6, 0));
    } else gunParts(g, type, len, rar, skin, att);
    return g;
  }
  // a gun from parts: receiver, barrel, grip, magazine, stock and sights, all pointing along +x
  const GUN = { // receiver length, barrel length, mag, stock, sight, wood furniture
    pistol: { rc: 11, bl: 8, mag: 0, st: 0, sight: "iron", wood: 0 },
    smg: { rc: 13, bl: 10, mag: 12, st: 1, sight: "iron", wood: 0 },
    shotgun: { rc: 10, bl: 22, mag: 0, st: 2, sight: "bead", wood: 1, pump: 1 },
    rifle: { rc: 12, bl: 20, mag: 6, st: 2, sight: "iron", wood: 1 },
    sniper: { rc: 13, bl: 30, mag: 6, st: 2, sight: "scope", wood: 0, bipod: 1 },
    ak: { rc: 13, bl: 17, mag: 11, st: 2, sight: "iron", wood: 1, curve: 1 },
  };
  function gunParts(g, type, len, rar, skin, att) {
    const sk = SKIN[skin], a = (att || "").split(",");
    const d = GUN[type] || GUN.smg, metal = sk ? mat(sk[0], sk[2]) : mat(0x2e3034), dark = mat(0x1c1d20), wood = sk ? mat(sk[1], sk[2]) : mat(0x7a4a24), furn = d.wood || sk ? wood : dark;
    const tube = (r, l, m, x, y) => { const c = mesh(new T.CylinderGeometry(r, r, l, 10), m, x, y, 0); c.rotation.z = Math.PI / 2; g.add(c); return c; };
    g.add(mesh(new T.BoxGeometry(d.rc, 5.5, 4), metal, d.rc / 2, 0.5, 0)); // receiver
    g.add(mesh(new T.BoxGeometry(d.rc - 2, 1.2, 3.2), dark, d.rc / 2, 3.6, 0)); // top rail
    tube(1.3, d.bl, metal, d.rc + d.bl / 2, 1.2); // barrel
    tube(1.9, 2.5, dark, d.rc + d.bl, 1.2); // muzzle
    const grip = mesh(new T.BoxGeometry(3.5, 8, 3.2), furn, 2, -5, 0); grip.rotation.z = -0.3; g.add(grip);
    g.add(mesh(new T.BoxGeometry(4, 1, 1), dark, 5, -2.8, 0)); // trigger guard
    if (type !== "pistol") g.add(mesh(new T.BoxGeometry(Math.min(d.bl * 0.7, 14), 4, 4.6), furn, d.rc + Math.min(d.bl * 0.7, 14) / 2, -0.2, 0)); // handguard
    if (d.pump) g.add(mesh(new T.CylinderGeometry(2.2, 2.2, 9, 8), wood, d.rc + 8, -2.2, 0).rotateZ(Math.PI / 2));
    const ml = a.includes("mag") ? (d.mag || 6) * 1.6 : d.mag; // the extended mag hangs lower
    if (ml) { const m = mesh(new T.BoxGeometry(a.includes("mag") ? 4 : 3.4, ml, a.includes("mag") ? 3.4 : 2.8), dark, d.rc - 3, -2 - ml / 2, 0); if (d.curve) m.rotation.z = 0.35; g.add(m); }
    if (a.includes("dot") && d.sight !== "scope") { g.add(mesh(new T.BoxGeometry(5, 3.6, 3), dark, d.rc / 2 + 1, 5.6, 0)); g.add(mesh(new T.BoxGeometry(0.6, 2.4, 2.2), mat(0x88aacc, 0x102030), d.rc / 2 + 3.6, 5.8, 0)); g.add(mesh(new T.SphereGeometry(0.55, 6, 5), new T.MeshBasicMaterial({ color: 0xff2020 }), d.rc / 2 - 1.2, 5.8, 0)); }
    if (a.includes("comp")) { const c = mesh(new T.CylinderGeometry(2.4, 2.4, 5, 8), dark, d.rc + d.bl + 2.5, 1.2, 0); c.rotation.z = Math.PI / 2; g.add(c); for (const s2 of [-1, 1]) g.add(mesh(new T.BoxGeometry(3, 0.8, 0.6), mat(0x606468), d.rc + d.bl + 2.5, 1.2, s2 * 2.3)); }
    if (d.st === 1) { g.add(mesh(new T.BoxGeometry(9, 1.2, 1.2), metal, -4, 1.5, 0)); g.add(mesh(new T.BoxGeometry(1.4, 5, 3), metal, -8.5, -0.3, 0)); } // wire stock
    if (d.st === 2) { const s2 = mesh(new T.BoxGeometry(12, 5, 3.4), furn, -6, -1, 0); s2.rotation.z = 0.12; g.add(s2); g.add(mesh(new T.BoxGeometry(1.5, 7, 3.8), dark, -12, -1.6, 0)); }
    if (d.sight === "iron") { g.add(mesh(new T.BoxGeometry(1, 2.4, 1), dark, d.rc + d.bl - 1, 3.2, 0)); g.add(mesh(new T.BoxGeometry(1.5, 2, 2.6), dark, 2, 4.8, 0)); }
    if (d.sight === "bead") g.add(mesh(new T.SphereGeometry(0.8, 6, 5), mat(0xd8d8d8), d.rc + d.bl - 1, 2.8, 0));
    if (d.sight === "scope") { tube(1.8, 14, dark, d.rc / 2 + 1, 6.6); tube(2.4, 2, dark, d.rc / 2 + 8, 6.6); tube(2.2, 2, dark, d.rc / 2 - 6, 6.6); g.add(mesh(new T.BoxGeometry(2, 2.4, 1.4), dark, d.rc / 2 + 1, 4.6, 0)); }
    if (d.bipod) for (const s2 of [-1, 1]) { const l = mesh(new T.BoxGeometry(0.8, 9, 0.8), metal, d.rc + d.bl - 6, -3.5, s2 * 2); l.rotation.x = s2 * 0.35; g.add(l); }
    if (rar > 0) { g.add(mesh(new T.BoxGeometry(d.rc - 1, 1.2, 4.3), mat(RAR[rar], RAR[rar]), d.rc / 2, -1.2, 0)); if (rar >= 3) tube(1.6, 1.2, mat(RAR[rar], RAR[rar]), d.rc + d.bl - 4, 1.2); }
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
  // gear, worn on top of the body: head replaces the hat; body, hands and feet go over the clothes
  function gearMesh(g, gr) {
    const [head, bod, hands, feet] = gr || [];
    const body = g.userData.body;
    if (head) {
      const hg = new T.Group(); hg.position.y = 42; body.add(hg);
      if (head === "pot") { hg.add(mesh(new T.CylinderGeometry(13.5, 12.5, 9, 14), mat(0xb8bcc4), 0, 10, 0)); hg.add(mesh(new T.BoxGeometry(18, 2, 3), mat(0x222222), -20, 10, 0)); }
      else if (head === "helmet") { hg.add(mesh(new T.SphereGeometry(14.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4a5a32), 0, 4, 0)); hg.add(mesh(new T.CylinderGeometry(16, 16, 1.5, 14), mat(0x3e4c2a), 0, 4, 0)); }
      else if (head === "gasmask") { hg.add(mesh(new T.SphereGeometry(13.6, 14, 10), mat(0x2e3a2e))); for (const s2 of [-1, 1]) hg.add(mesh(new T.CylinderGeometry(3.6, 3.6, 2, 12), mat(0x9fd8ff, 0x204050), 12.6, 3, s2 * 5).rotateZ(Math.PI / 2)); const f = mesh(new T.CylinderGeometry(4.5, 5, 7, 10), mat(0x555555), 14, -6, 0); f.rotation.z = Math.PI / 2; hg.add(f); }
      g.userData.hat.visible = false;
    }
    if (bod) {
      const col = { vest: 0x2a3a4a, plate: 0x4a5a32, hazmat: 0xe8d020 }[bod] || 0x444444;
      body.add(mesh(new T.CylinderGeometry(bod === "hazmat" ? 12.2 : 11.8, bod === "hazmat" ? 13 : 12.4, bod === "plate" ? 15 : 13, 14), mat(col), 0, 23.5, 0));
      if (bod === "plate") for (let i = 0; i < 3; i++) body.add(mesh(new T.BoxGeometry(3, 4, 4.5), mat(0x3a4628), 12, 20 + 0, -7 + i * 7)); // pouches
      if (bod === "hazmat") { for (const s2 of [-1, 1]) body.add(mesh(new T.SphereGeometry(5.6, 10, 8), mat(col), 0, 30, s2 * 10.5)); for (const leg of g.userData.legs) leg.add(mesh(new T.CylinderGeometry(4.6, 4.1, 12, 8), mat(col), 0, -6, 0)); }
    }
    if (hands) {
      const col = hands === "tactical" ? 0x1e1e1e : 0xb08a50;
      g.userData.arm.add(mesh(new T.SphereGeometry(4.1, 8, 6), mat(col), 4, 0, 0));
      g.userData.off.add(mesh(new T.SphereGeometry(4.1, 8, 6), mat(col), 8.5, -6, 5));
    }
    if (feet) {
      const col = { wellies: 0x2a7a2a, trainers: 0xf0f0f0, boots: 0x2a2418, flippers: 0xffd020 }[feet] || 0x333333;
      for (const leg of g.userData.legs) {
        if (feet === "flippers") leg.add(mesh(new T.BoxGeometry(22, 1.5, 9), mat(col), 8, -14.5, 0));
        else if (feet === "wellies") leg.add(mesh(new T.CylinderGeometry(4.6, 4.6, 10, 8), mat(col), 0, -9, 0));
        else leg.add(mesh(new T.BoxGeometry(11, feet === "boots" ? 6 : 4.4, 7.2), mat(col), 1.8, feet === "boots" ? -12 : -13, 0));
        if (feet === "trainers") leg.add(mesh(new T.BoxGeometry(11.2, 1.2, 7.4), mat(0xff3030), 1.8, -11.6, 0));
      }
    }
    return g;
  }
  function personMesh(color, hat, eyes) {
    const g = new T.Group(), body = new T.Group();
    g.add(body);
    const c = new T.Color(color), shirt = mat(color), trousers = mat(c.clone().multiplyScalar(0.55).getHex()), boot = mat(0x3a2818), skin = mat(c.clone().lerp(new T.Color(0xf0c8a0), 0.55).getHex());
    const legs = [];
    for (const s of [-1, 1]) { // legs swing from the hip
      const leg = new T.Group(); leg.position.set(0, 15, s * 5.5); body.add(leg); legs.push(leg);
      leg.add(mesh(new T.CylinderGeometry(4.2, 3.6, 13, 8), trousers, 0, -6.5, 0));
      leg.add(mesh(new T.BoxGeometry(10, 4, 6.5), boot, 1.8, -13, 0));
    }
    body.add(mesh(new T.CylinderGeometry(10.5, 11.5, 17, 14), shirt, 0, 22.5, 0)); // torso
    body.add(mesh(new T.CylinderGeometry(11.8, 11.8, 3, 14), mat(0x3a2a1a), 0, 15.5, 0)); // belt
    body.add(mesh(new T.BoxGeometry(1, 2.6, 3.4), mat(0xd8b040), 11.8, 15.5, 0)); // buckle
    for (const s of [-1, 1]) body.add(mesh(new T.SphereGeometry(5, 10, 8), shirt, 0, 30, s * 10.5)); // shoulders
    body.add(mesh(new T.CylinderGeometry(4.5, 5, 4, 10), skin, 0, 32, 0)); // neck
    const off = new T.Group(); off.position.set(0, 30, -11); body.add(off); g.userData.off = off; // the other arm, reaching for the gun
    const up = mesh(new T.CylinderGeometry(3.4, 3, 12, 8), shirt, 3, -4, 1); up.rotation.set(0.5, 0, 0.9); off.add(up);
    off.add(mesh(new T.SphereGeometry(3.4, 8, 6), skin, 8.5, -6, 5));
    const head = mesh(new T.SphereGeometry(13, 16, 12), mat(color), 0, 42, 0); body.add(head);
    body.add(mesh(new T.SphereGeometry(2.4, 8, 6), skin, 12.6, 40, 0)); // nose
    body.add(mesh(new T.BoxGeometry(1, 1.4, 6), mat(0x3a1a1a), 12.2, 35.5, 0)); // mouth
    for (const s of [-1, 1]) body.add(mesh(new T.SphereGeometry(3, 8, 6), mat(color), 0, 42, s * 12.6)); // ears
    g.userData.legs = legs;
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
    const sleeve = mesh(new T.CylinderGeometry(3.6, 3.2, 10, 8), shirt, -3, 0, 0); sleeve.rotation.z = Math.PI / 2; arm.add(sleeve);
    arm.add(mesh(new T.SphereGeometry(3.6, 8, 6), skin, 4, 0, 0));
    g.userData.body = body;
    return g;
  }
  const ZCOL = { e: 0x3a6a8a, t: 0x3f6b3a, r: 0xa0d070, w: 0x6fa35a, c: 0x7a5a3a, f: 0x4a3a5a, x: 0x8aa04a, s: 0xd8d0c0, d: 0x7a8a3a, y: 0x5a6a2a };
  function zombieMesh(type, bk, glow) {
    const r = ZR[type] || 15;
    const bossCol = { leshen: 0x3a5a2a, drowned: 0x3a6a8a, golem: 0xb08a3a }[bk] || 0x3a5a2a;
    const col = type === "b" ? bossCol : ZCOL[type] || 0x6fa35a;
    const g = new T.Group(), k = r / 15;
    const skin = glow ? mat(col, 0x3a9a10) : mat(col);
    const eye = type === "b" ? (bk === "golem" ? 0xff8a20 : 0xff2020) : type === "e" || type === "s" ? 0xbfe8ff : type === "f" ? 0xff3030 : 0xffec40;
    const arms = [];
    if (type === "f") { // a flying thing: a body, a head and two big leathery wings
      g.add(mesh(new T.SphereGeometry(10 * k, 10, 8), skin, 0, 24 * k, 0));
      g.add(mesh(new T.SphereGeometry(7 * k, 10, 8), skin, 9 * k, 30 * k, 0));
      for (const s of [-1, 1]) g.add(mesh(new T.SphereGeometry(1.8 * k, 6, 5), mat(eye, eye), 15 * k, 31 * k, s * 3 * k));
      const wings = [];
      for (const s of [-1, 1]) { const piv = new T.Group(); piv.position.set(0, 26 * k, s * 6 * k); const w = mesh(new T.BoxGeometry(18 * k, 1.5, 30 * k), mat(0x2a2030), 0, 0, s * 15 * k); piv.add(w); g.add(piv); wings.push(piv); }
      g.userData.wings = wings;
    } else if (type === "d" || type === "y") { // a dinosaur: level body, long tail, big head, two strong legs, silly little arms
      const s = type === "y" ? 2.6 : 1, stripe = mat(type === "y" ? 0x3a4a1a : 0xc8702a);
      const body = mesh(new T.SphereGeometry(12 * s, 12, 10), skin, 0, 28 * s, 0); body.scale.set(1.6, 0.9, 0.8); g.add(body);
      const tail = mesh(new T.ConeGeometry(7 * s, 40 * s, 8), skin, -32 * s, 28 * s, 0); tail.rotation.z = Math.PI / 2 + 0.12; g.add(tail);
      const neck = mesh(new T.CylinderGeometry(5 * s, 6 * s, 14 * s, 8), skin, 16 * s, 36 * s, 0); neck.rotation.z = -0.7; g.add(neck);
      g.add(mesh(new T.BoxGeometry(22 * s, 11 * s, 11 * s), skin, 26 * s, 44 * s, 0));
      g.add(mesh(new T.BoxGeometry(18 * s, 3 * s, 9 * s), mat(0xe8e0c8), 28 * s, 38.5 * s, 0)); // teeth
      for (const z2 of [-1, 1]) g.add(mesh(new T.SphereGeometry(1.8 * s, 6, 5), mat(0xffc020, 0xff8000), 31 * s, 47 * s, z2 * 5.6 * s));
      for (let i = 0; i < 4; i++) g.add(mesh(new T.ConeGeometry(2.5 * s, 7 * s, 4), stripe, (8 - i * 8) * s, 40 * s - i * s, 0));
      const legs = [];
      for (const z2 of [-1, 1]) { const piv = new T.Group(); piv.position.set(0, 24 * s, z2 * 7 * s); piv.add(mesh(new T.BoxGeometry(7 * s, 24 * s, 7 * s), skin, 0, -12 * s, 0)); g.add(piv); legs.push(piv); }
      g.userData.legs = legs;
      for (const z2 of [-1, 1]) { const a = mesh(new T.BoxGeometry(8 * s, 2.5 * s, 2.5 * s), skin, 20 * s, 28 * s, z2 * 7 * s); g.add(a); arms.push(a); }
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
    const ice = mesh(new T.SphereGeometry(r * 1.4, 10, 8), new T.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45, depthWrite: false }), 0, r * 1.6, 0);
    ice.scale.y = 1.5; ice.visible = false; g.add(ice); g.userData.ice = ice;
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
    } else if (kind === "heli" || kind === "gunship") {
      const gun = kind === "gunship", col = mat(gun ? 0x4a5a3a : 0xe8c040), dk = mat(0x2a2a2a);
      const cab = mesh(new T.SphereGeometry(1, 16, 12), col, 0, 24, 0); cab.scale.set(gun ? 34 : 28, gun ? 20 : 18, gun ? 22 : 18); g.add(cab);
      const glass = mesh(new T.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9fd0e8, 0x102838, { transparent: true, opacity: 0.75 }), 12, 26, 0); glass.scale.set(gun ? 18 : 16, 14, gun ? 18 : 15); glass.rotation.z = -1.1; g.add(glass);
      const tail = mesh(new T.CylinderGeometry(3, 7, 56, 8), col, -50, 28, 0); tail.rotation.z = Math.PI / 2; g.add(tail);
      g.add(mesh(new T.BoxGeometry(14, 18, 2), col, -76, 36, 0)); // fin
      const tr = new T.Group(); tr.position.set(-76, 38, 3); g.add(tr); tr.add(mesh(new T.BoxGeometry(2, 22, 1), dk)); g.userData.tail = tr;
      for (const s of [-1, 1]) { // skids
        g.add(mesh(new T.BoxGeometry(56, 2.5, 2.5), dk, 0, 2, s * 15));
        for (const x of [-12, 12]) g.add(mesh(new T.BoxGeometry(2, 10, 2), dk, x, 7, s * 13));
      }
      g.add(mesh(new T.CylinderGeometry(3, 4, 10, 8), dk, 0, 44, 0)); // mast
      const rotor = new T.Group(); rotor.position.set(0, 49, 0); g.add(rotor); g.userData.rotor = rotor;
      for (let i = 0; i < (gun ? 4 : 2); i++) { const b = mesh(new T.BoxGeometry(gun ? 92 : 84, 1.2, 6), dk, 0, 0, 0); b.rotation.y = i * Math.PI / (gun ? 4 : 2) * (gun ? 2 : 1); rotor.add(b); }
      const disc = mesh(new T.CircleGeometry(gun ? 46 : 42, 24), basic(0x333333, 0.18)); disc.rotation.x = -Math.PI / 2; rotor.add(disc);
      if (gun) {
        for (const s of [-1, 1]) { // stub wings with rocket pods
          g.add(mesh(new T.BoxGeometry(12, 2.5, 22), col, -4, 18, s * 26));
          const pod = mesh(new T.CylinderGeometry(4.5, 4.5, 22, 10), dk, -2, 14, s * 34); pod.rotation.z = Math.PI / 2; g.add(pod);
          g.add(mesh(new T.ConeGeometry(4.5, 6, 10), mat(0xb03a2a), 12, 14, s * 34).rotateZ(-Math.PI / 2));
        }
        const cg = new T.Group(); cg.position.set(26, 10, 0); g.add(cg); // chin gun
        cg.add(mesh(new T.SphereGeometry(5, 10, 8), dk));
        for (const z of [-1.5, 1.5]) { const b = mesh(new T.CylinderGeometry(1, 1, 18, 6), dk, 10, 0, z); b.rotation.z = Math.PI / 2; cg.add(b); }
      } else g.add(mesh(new T.BoxGeometry(18, 6, 44), mat(0x8a7a5a), -6, 8, 0)); // a crop sprayer bar
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
  function cropMesh(stage, crop) {
    const g = new T.Group();
    if (stage === 3 && crop !== "turnip") {
      const leafM = mat(0x3f8a2a), ball = (r, col, x, y, z, em) => g.add(mesh(new T.SphereGeometry(r, 10, 8), mat(col, em), x, y, z));
      if (crop === "lettuce") for (let k = 0; k < 7; k++) { const l = mesh(new T.SphereGeometry(7, 8, 6), mat(k % 2 ? 0x8fe05a : 0x5aba3a), Math.cos(k) * 5, 6, Math.sin(k) * 5); l.scale.y = 0.7; g.add(l); }
      else if (crop === "potato") { for (let k = 0; k < 5; k++) { const l = mesh(new T.SphereGeometry(1, 6, 5), leafM, (k - 2) * 5, 14, Math.sin(k) * 4); l.scale.set(3, 10, 3); l.rotation.z = (k - 2) * 0.3; g.add(l); } ball(6, 0xc8a060, -8, 3, 6); ball(5, 0xb89050, 7, 2.5, -5); }
      else if (crop === "tomato" || crop === "strawberry") { const h = crop === "tomato" ? 26 : 10; const bush = mesh(new T.SphereGeometry(crop === "tomato" ? 11 : 10, 10, 8), leafM, 0, h * 0.6, 0); bush.scale.y = crop === "tomato" ? 1.4 : 0.6; g.add(bush); for (let k = 0; k < 5; k++) ball(crop === "tomato" ? 4 : 2.6, crop === "tomato" ? 0xe83a2a : 0xff4060, Math.cos(k * 1.3) * 9, h * 0.4 + (k % 3) * 4, Math.sin(k * 1.3) * 9); if (crop === "tomato") g.add(mesh(new T.CylinderGeometry(0.8, 0.8, 34, 5), mat(0x9a7a4a), 0, 17, 0)); }
      else if (crop === "corn") { for (const [x, z] of [[-6, 0], [6, 4], [0, -7]]) { g.add(mesh(new T.CylinderGeometry(1.5, 2, 46, 6), mat(0x6aaa3a), x, 23, z)); const c = mesh(new T.CylinderGeometry(3, 2.6, 12, 8), mat(0xffd34d), x + 3, 28, z); c.rotation.z = -0.3; g.add(c); const l = mesh(new T.SphereGeometry(1, 6, 5), leafM, x - 4, 20, z); l.scale.set(2, 14, 2); l.rotation.z = 0.6; g.add(l); } }
      else if (crop === "pumpkin") { const p = mesh(new T.SphereGeometry(18, 14, 10), mat(0xff8a20), 0, 13, 0); p.scale.y = 0.75; g.add(p); for (let k = 0; k < 6; k++) { const r = mesh(new T.TorusGeometry(17.5, 1.2, 4, 16, Math.PI), mat(0xc86010), 0, 13, 0); r.rotation.y = k * Math.PI / 6; r.scale.y = 0.75; g.add(r); } g.add(mesh(new T.CylinderGeometry(2, 2.5, 8, 6), mat(0x5a7a2a), 0, 29, 0)); }
      else if (crop === "melon") { const m = mesh(new T.SphereGeometry(17, 14, 10), mat(0x2a8a4a, 0x0a5a2a), 0, 14, 0); m.scale.set(1.25, 0.85, 1); g.add(m); for (let k = -2; k <= 2; k++) { const r = mesh(new T.TorusGeometry(17.2, 0.9, 4, 18, Math.PI), mat(0x7dffb0, 0x2aff9a), 0, 14, k * 6); r.scale.set(1.25, 0.85, 1); g.add(r); } }
      else ball(10, 0x88dd66, 0, 10, 0);
      return g;
    }
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
  // free the GPU buffers of meshes we drop (zombies, fires, crops, swapped guns); they were leaking all game
  const freeGeo = (o) => o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
  function sweep() {
    for (const [k, e] of pools) if (e.seen !== frameNo) { scene.remove(e.obj); freeGeo(e.obj); pools.delete(k); }
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
    const key = MAP.seed + ":" + (MAP.ver === undefined ? MAP.walls.length : "");
    if (key !== levelKey) { buildLevel(MAP); levelKey = key; levelVer = MAP.ver + ":" + (MAP.cv || 0); }
    else if (MAP.ver + ":" + (MAP.cv || 0) !== levelVer) { syncWalls(MAP); levelVer = MAP.ver + ":" + (MAP.cv || 0); }
    { // the wild: lose the hedge, keep grass under your feet, and only draw the chunks near you
      const open = S.g.mode !== "royale", ud = level.userData;
      if (ud.hedge) ud.hedge.visible = !open;
      if (ud.wild) ud.wild.visible = open;
      if (ud.wild && MAP.bio) for (const k in MAP.bio) { // each chunk of the wild gets its biome's ground
        if (ud.bio.has(k)) continue; ud.bio.add(k);
        const [cx, cy] = k.split(",").map(Number), CS = 1000, x0 = cx * CS, y0 = cy * CS, x1 = x0 + CS, y1 = y0 + CS;
        // leave the town (and its lake) alone: a chunk on the town's edge only paints the part outside it
        const tx0 = Math.max(x0, 0), tx1 = Math.min(x1, MAP.W), ty0 = Math.max(y0, 0), ty1 = Math.min(y1, MAP.H);
        const parts = tx0 >= tx1 || ty0 >= ty1 ? [[x0, y0, x1, y1]] : [[x0, y0, x1, ty0], [x0, ty1, x1, y1], [x0, ty0, tx0, ty1], [tx1, ty0, x1, ty1]];
        for (const [a0, b0, a1, b1] of parts) {
          const w = a1 - a0, h = b1 - b0; if (w <= 0 || h <= 0) continue;
          const geo = new T.PlaneGeometry(w, h), pos = geo.attributes.position, uv = geo.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (a0 + w / 2 + pos.getX(i)) / BIO_TILE, -(b0 + h / 2 - pos.getY(i)) / BIO_TILE);
          const m = mesh(geo, bioMat(MAP.bio[k]), a0 + w / 2, -0.6, b0 + h / 2); m.rotation.x = -Math.PI / 2; ud.wild.add(m);
        }
      }
      const pv = st.pred || (cam && { x: cam.position.x, y: cam.position.z });
      if (pv && frameNo % 20 === 0) for (const o of wallObjs.values()) { const c = o.userData.ck; if (c) o.visible = Math.abs(c[0] - pv.x) < 3600 && Math.abs(c[1] - pv.y) < 3600; }
    }
    // time of day
    let n = 0;
    if (S.g.ph === "night") n = 1;
    else if (S.g.ph === "day" && S.g.left >= 0 && S.g.left < 10) n = (10 - S.g.left) / 10 * 0.7;
    const sky = new T.Color(0x8fc4e8).lerp(new T.Color(0x070a18), n);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    scene.fog.near = lerp(1500, 120, n); scene.fog.far = lerp(4200, 1300, n);
    if (S.g.fog && n > 0) { sky.lerp(new T.Color(0x2a2636), n); scene.background.copy(sky); scene.fog.color.copy(sky); scene.fog.near = 20; scene.fog.far = lerp(1300, 480, n); }
    if (S.g.waste) { const wc = new T.Color(0x9a9a5a).lerp(new T.Color(0x14160a), n); scene.background.copy(wc); scene.fog.color.copy(wc); scene.fog.far = Math.min(scene.fog.far, lerp(2600, 1100, n)); }
    if (level.userData.gm) { const want = S.g.waste ? 0xb09060 : 0xffffff; if (level.userData.gmc !== want) { level.userData.gm.color.setHex(want); level.userData.gmc = want; } }
    L.hemi.intensity = lerp(1.7, 0.16, n); L.sun.intensity = lerp(2.2, 0.12, n);
    L.sun.color.setHex(n > 0.5 ? 0x8090ff : 0xfff2d8);
    const lk = level.userData.lake, c0 = st.cam;
    if (lk && c0.z < -1 && c0.x > lk.x && c0.x < lk.x + lk.w && c0.y > lk.y && c0.y < lk.y + lk.h) {
      const deep = Math.min(1, -c0.z / -lk.z0), uw = new T.Color(0x2a7a8a).lerp(new T.Color(0x06202a), deep * 0.7 + n * 0.3);
      scene.background.copy(uw); scene.fog.color.copy(uw); scene.fog.near = 10; scene.fog.far = lerp(620, 320, deep);
    }
    if (level.userData.water) level.userData.water.position.y = -2 + Math.sin(t * 1.3) * 0.6;
    if (level.userData.glyphs) {
      const sh = S.sh, lit = (g) => sh && (sh[5] || sh.slice(0, sh[4]).includes(g));
      for (const gp of level.userData.glyphs) { const on = lit(gp.userData.g); gp.userData.gem.material = mat(gp.userData.gc, on ? gp.userData.gc : 0x000000); gp.userData.gem.rotation.y = t * (on ? 2 : 0.4); }
      const sr = level.userData.shrine; if (sr) { sr.userData.seal.material = mat(sh && sh[5] ? 0xffd34d : 0x2a8a8a, sh && sh[5] ? 0xc08010 : 0x105050); sr.userData.seal.rotation.x = sh && sh[5] ? t : 0; }
    }
    for (const vt of level.userData.vents || []) { const v = vt.userData.vent; v.bub.forEach((b, i) => { const k = ((t * 0.35 + i / v.bub.length) % 1); b.position.set(v.x + Math.sin(t * 3 + i) * 6, v.z0 + 8 + k * -v.z0, v.y + Math.cos(t * 2 + i * 2) * 6); }); }
    // the roof comes off the house you're in, so the camera can see you
    if (MAP.walls && (frameNo % 6 === 0 || level.userData.inHouse === undefined)) {
      const pr = st.pred, h = pr && MAP.walls.find((w) => w.kind === "house" && pr.x > w.x && pr.x < w.x + w.w && pr.y > w.y && pr.y < w.y + w.h && pr.z < w.z0);
      const hid = h ? h.id : 0;
      if (hid !== level.userData.inHouse) {
        const prev = level.userData.inHouse; level.userData.inHouse = hid;
        const po = prev && wallObjs.get(prev), ho = hid && wallObjs.get(hid);
        if (po) po.children.forEach((ch) => { ch.visible = true; });
        if (ho) ho.children.forEach((ch) => { ch.visible = !!ch.userData.keep; });
      }
    }
    // the Hearth
    const hw = MAP.hearth, hflash = t - st.hearthHitT < 0.12;
    at(L.hearth, hw.x + hw.w / 2, hw.y + hw.h / 2, 150);
    L.hearth.intensity = (1 + n * 7) * (1 + Math.sin(t * 9) * 0.08);
    const hg = level.userData.hearth;
    if (hg) { const fl = 1 + Math.sin(t * 9) * 0.1; hg.userData.flames.forEach((f, i) => f.scale.set(fl, fl * (i ? 1.1 : 1), fl)); hg.children[0].material = mat(hflash ? 0xcc7777 : 0x9a8a70); }
    if (level.userData.spin) for (const w of level.userData.spin) w.rotation.y = t * 0.8;
    // the Hearth Dome: a pylon for each quarter paid, and a shimmering bubble once it's up
    if (S.g.dome && S.g.mode !== "royale" && MAP.hearth) {
      const h = MAP.hearth, hx = h.x + h.w / 2, hy = h.y + h.h / 2, k = S.g.dome[0] / S.g.dome[1], n = Math.min(4, Math.floor(k * 4 + 1e-9));
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
        if (i >= n) return;
        const e = pooled(`pylon:${i}`, () => { const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(5, 9, 110, 8), mat(0x6a7a8a), 0, 55, 0)); const orb = mesh(new T.SphereGeometry(9, 12, 8), mat(0x9fe0ff, 0x4da6ff), 0, 116, 0); g.add(orb); g.userData.orb = orb; return g; });
        at(e.obj, hx + sx * (h.w / 2 + 40), hy + sy * (h.h / 2 + 40), 0); e.obj.userData.orb.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 3 + i);
      });
      if (k >= 1) {
        const R = st.domeR || 1000, e = pooled("dome", () => { const g = new T.Group(); g.add(mesh(new T.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false }))); const ring = mesh(new T.TorusGeometry(1, 0.004, 4, 96), basic(0x9fe0ff, 0.5)); ring.rotation.x = Math.PI / 2; g.add(ring); return g; });
        at(e.obj, hx, hy, 0); e.obj.scale.set(R, R * 0.45, R); e.obj.children[0].material.opacity = (st.nukeFx && t - st.nukeFx.t < 3 ? 0.35 : 0.09) + 0.03 * Math.sin(t * 1.5);
      }
    }
    if (level.userData.well) { const s = level.userData.well.userData.slop; s.material.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.3; level.userData.well.visible = S.g.mode !== "royale"; }
    for (const bo of level.userData.boosts || []) bo.userData.arrows.forEach((a, i) => { a.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 9 - i * 1.2)); });
    for (const pd of level.userData.pads || []) { const k = (t * 1.5) % 1; pd.userData.ring.position.y = 6 + k * 40; pd.userData.ring.material.opacity = 0.8 * (1 - k); }

    // plots
    MAP.plots.forEach((pl, i) => {
      const e = pooled(`bed:${i}:${pl.x}:${pl.y}`, () => { const g = new T.Group(); g.add(mesh(new T.BoxGeometry(52, 3, 52), mat(0x5b3a1e), 0, 1.5, 0)); for (let r = -18; r <= 18; r += 12) g.add(mesh(new T.BoxGeometry(44, 3.4, 4), mat(0x6e4826), 0, 1.7, r)); return g; });
      at(e.obj, pl.x, pl.y, 0);
    });
    S.pl.forEach((v, i) => {
      const stage = v % 4, crop = st.cropKeys[v >> 2] || "turnip";
      if (!stage) return;
      const pl = MAP.plots[i];
      const e = pooled(`crop:${i}:${stage}:${crop}`, () => cropMesh(stage, crop));
      at(e.obj, pl.x, pl.y, 3);
      if (stage === 3 && crop !== "pumpkin" && crop !== "melon") e.obj.position.y = 3 + Math.sin(t * 3 + i) * 1.5;
    });
    // shopkeepers, home for the night when it's dark
    if (MAP.keepers) for (const k of MAP.keepers) {
      if (k.hours === "day" && S.g.ph === "night") continue;
      const e = pooled(`keeper:${k.id}`, () => personMesh(k.color, k.hat, "dot"));
      at(e.obj, k.x, k.y, 0); e.obj.rotation.y = -Math.PI / 2; // facing the customers, south
    }
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
    for (const [id, x, y, rar, grave, ck] of S.cr) {
      const e = pooled(`crate:${id}`, () => {
        const g = new T.Group();
        if (ck === 1) { g.add(mesh(new T.BoxGeometry(30, 20, 30), mat(0x3a4a3a), 0, 10, 0)); g.add(mesh(new T.BoxGeometry(31, 4, 31), mat(RAR[rar], RAR[rar]), 0, 18, 0)); g.add(mesh(new T.SphereGeometry(8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4a5a32), 0, 20, 0)); }
        else if (ck === 2) { g.add(mesh(new T.BoxGeometry(26, 18, 20), mat(0x8a6a3a), 0, 9, 0)); for (let i = 0; i < 3; i++) g.add(mesh(new T.CylinderGeometry(3.5, 3.5, 7, 10), mat(0xc8c8c0), -8 + i * 8, 21.5, 0)); }
        else if (grave) { g.add(mesh(new T.BoxGeometry(8, 30, 24), mat(0x888888), 0, 15, 0)); const top = mesh(new T.CylinderGeometry(12, 12, 8, 12, 1, false, 0, Math.PI), mat(0x888888), 0, 30, 0); top.rotation.set(0, Math.PI / 2, Math.PI / 2); g.add(top); }
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
    for (const [id, kind, vx, vy, va, , pilot, , spd, vz] of S.vh) {
      const e = pooled(`veh:${id}`, () => { const o = vehicleMesh(kind); o.rotation.order = "YZX"; return o; });
      const pa = e.a ?? va;
      smoothTo(e, vx, vy, vz || 0, dt); e.a = e.a === undefined ? va : angLerp(e.a, va, Math.min(1, dt * 14));
      at(e.obj, e.x, e.y, e.z);
      const air = kind === "heli" || kind === "gunship";
      if (air) { // nose down with speed, lean into turns, rotors spin when someone's at the stick
        const yawRate = dt > 0 ? Math.atan2(Math.sin(e.a - pa), Math.cos(e.a - pa)) / dt : 0;
        e.tilt = lerp(e.tilt || 0, -Math.min(0.3, (spd || 0) / 1400), Math.min(1, dt * 4));
        e.roll = lerp(e.roll || 0, Math.max(-0.4, Math.min(0.4, yawRate * 0.25)), Math.min(1, dt * 4));
        e.spin = lerp(e.spin || 0, pilot || (vz || 0) > 2 ? 30 : 0, Math.min(1, dt * 0.8));
        e.obj.userData.rotor.rotation.y += e.spin * dt; e.obj.userData.tail.rotation.z += e.spin * 1.6 * dt;
        e.obj.rotation.set(e.roll, -e.a, e.tilt);
      } else e.obj.rotation.set(0, -e.a, 0);
    }
    // townsfolk
    if (MAP.npcs && S.g.mode !== "royale") for (const n2 of MAP.npcs) {
      const e = pooled(`npc:${n2.id}`, () => personMesh(n2.color, n2.hat, "dot"));
      const px = e.x ?? n2.x, py = e.y ?? n2.y;
      smoothTo(e, n2.x, n2.y, 0, dt, 300);
      const mv = Math.hypot(e.x - px, e.y - py) / Math.max(dt, 0.001);
      const p = S.p.find((q) => q.id === me);
      const near = p && Math.hypot(p.x - e.x, p.y - e.y) < 140;
      const want = mv > 8 ? Math.atan2(e.y - py, e.x - px) : near ? Math.atan2(p.y - e.y, p.x - e.x) : n2.a ?? e.a ?? 0;
      e.a = angLerp(e.a ?? want, want, Math.min(1, dt * 8));
      at(e.obj, e.x, e.y, mv > 8 ? Math.abs(Math.sin(t * 10)) * 2 : 0); e.obj.rotation.y = -e.a;
      e.obj.userData.legs.forEach((l, i) => { l.rotation.z = mv > 8 ? Math.sin(t * 10 + i * Math.PI) * 0.6 : 0; });
      if (n2.guest && n2.ride) { const rk = n2.ride === "jeep" ? "buggy" : n2.ride; const l = pooled(`ride:${n2.id}`, () => vehicleMesh(rk)); at(l.obj, n2.x + 90, n2.y + 20, 0); l.obj.rotation.y = -0.2; }
    }
    // radioactive hot spots and the mushroom cloud
    for (const [hx, hy, hr, lk] of S.g.hot || []) {
      if (lk) continue;
      const e = pooled(`hot:${hx}:${hy}`, () => { const g = new T.Group(); const d = mesh(new T.CircleGeometry(1, 32), new T.MeshBasicMaterial({ color: 0x96ff3c, transparent: true, opacity: 0.28, depthWrite: false })); d.rotation.x = -Math.PI / 2; g.add(d); g.userData.d = d; for (let i = 0; i < 6; i++) { const m = mesh(new T.SphereGeometry(2.5, 6, 5), basic(0xc0ff80, 0.8)); g.add(m); } return g; });
      at(e.obj, hx, hy, 1.2); e.obj.userData.d.scale.set(hr, hr, 1); e.obj.userData.d.material.opacity = 0.2 + Math.sin(t * 2 + hx) * 0.08;
      e.obj.children.forEach((c, i) => { if (!i) return; const q = (t * 0.3 + i / 6) % 1, a = i * 1.7 + hx; c.position.set(Math.cos(a) * hr * 0.6, q * 80, Math.sin(a) * hr * 0.6); c.material.opacity = 0.8 * (1 - q); });
    }
    if (st.nukeFx && t - st.nukeFx.t < 30) {
      const k = (t - st.nukeFx.t) / 30, nf = st.nukeFx;
      const e = pooled("mushroom", () => { const g = new T.Group(), fire = new T.MeshLambertMaterial({ color: 0xffb060, emissive: 0x804020, transparent: true, depthWrite: false }); g.userData.m = fire;
        const stem = mesh(new T.CylinderGeometry(45, 90, 1, 16), fire); g.add(stem); g.userData.stem = stem;
        const cap = mesh(new T.SphereGeometry(1, 20, 14), fire); cap.scale.set(1, 0.6, 1); g.add(cap); g.userData.cap = cap;
        const ring = mesh(new T.TorusGeometry(1, 0.12, 8, 32), fire); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring; return g; });
      const grow = Math.min(1, k * 4), h = 200 + grow * 1300, cr = 150 + grow * 450;
      at(e.obj, nf.x ?? MAP.W / 2, nf.y ?? MAP.H / 2, 0);
      e.obj.userData.stem.scale.set(0.6 + grow, h, 0.6 + grow); e.obj.userData.stem.position.y = h / 2;
      e.obj.userData.cap.scale.set(cr, cr * 0.55, cr); e.obj.userData.cap.position.y = h + cr * 0.2;
      e.obj.userData.ring.scale.setScalar(cr * 0.9); e.obj.userData.ring.position.y = h * 0.6;
      e.obj.userData.m.color.setHex(k < 0.12 ? 0xfff0c0 : k < 0.35 ? 0xff9040 : 0x8a7a6a); e.obj.userData.m.emissive.setHex(k < 0.35 ? 0x804020 : 0x201a14);
      const near = Math.hypot(st.cam.x - (nf.x ?? 0), st.cam.y - (nf.y ?? 0)); // fade it out when you're standing in it
      e.obj.userData.m.opacity = Math.min(0.9, (1 - k) * 2) * Math.min(1, Math.max(0.08, (near - 200) / 900));
    }
    // the dead
    const bk = S.g.bk;
    for (const zz of S.z) {
      const [id, type, zx, zy, zhp, burn, zh, charging, frozen, glow, armd, kd] = zz;
      const e = pooled(`z:${id}:${type}:${type === "b" ? bk : ""}:${glow ? 1 : 0}`, () => zombieMesh(type, bk, glow));
      const px = e.x, py = e.y;
      smoothTo(e, zx, zy, zh || 0, dt);
      const mv = Math.hypot(e.x - (px ?? e.x), e.y - (py ?? e.y));
      if (mv > 0.05) e.a = angLerp(e.a ?? 0, Math.atan2(e.y - py, e.x - px), Math.min(1, dt * 8));
      at(e.obj, e.x, e.y, e.z); e.obj.rotation.y = -(e.a || 0);
      const sw = Math.sin(t * 8 + id) * 0.25;
      e.obj.userData.arms.forEach((a, i) => { a.rotation.y = i ? sw : -sw; });
      e.obj.userData.ice.visible = !!frozen;
      if (e.obj.userData.legs && mv > 0.05 && !frozen) e.obj.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 10 + id + i * Math.PI) * 0.6; });
      const fr = e.obj.userData.fire; fr.visible = !!burn; if (burn) { fr.scale.set(1, 0.8 + Math.sin(t * 20 + id) * 0.2, 1); fr.rotation.y = t * 3; }
      if (e.obj.userData.wings) e.obj.userData.wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.sin(t * 14 + id) * 0.7; });
      if (e.hp !== undefined && zhp < e.hp) e.hitT = t; // took a hit: rock back and squash for a moment
      e.hp = zhp;
      const fk = e.hitT ? Math.max(0, 1 - (t - e.hitT) / 0.18) : 0;
      if (charging) { e.obj.userData.arms.forEach((a) => { a.rotation.z = 0.5; }); e.obj.rotation.z = -0.25; } else e.obj.rotation.z = fk * 0.32;
      e.obj.scale.set(1 + fk * 0.08, 1 - fk * 0.1, 1 + fk * 0.08);
      e.kdK = lerp(e.kdK || 0, kd ? 1 : 0, Math.min(1, dt * (kd ? 14 : 4))); // slid into: flat on its back
      if (e.kdK > 0.01) e.obj.rotation.z = e.kdK * 1.45;
      // armour plates, and the weak spot that glows red (the head; on a charger, its back)
      if (armd && !e.obj.userData.plate) {
        const r = ZR[type] || 15, h = r * 3.7, g = new T.Group(), steel = mat(0x7a828a);
        g.add(mesh(new T.BoxGeometry(r * 1.5, h * 0.35, r * 1.7), steel, 0, h * 0.5, 0));
        g.add(mesh(new T.BoxGeometry(r * 1.1, h * 0.12, r * 1.9), steel, 0, h * 0.72, 0));
        const weak = mesh(new T.SphereGeometry(r * 0.38, 10, 8), new T.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, depthWrite: false }), type === "c" ? -r * 0.9 : 0, type === "c" ? h * 0.55 : h * 0.92, 0);
        g.add(weak); g.userData.weak = weak;
        e.obj.add(g); e.obj.userData.plate = g;
      }
      if (e.obj.userData.plate) { const pl = e.obj.userData.plate; pl.visible = !!armd; if (armd) pl.userData.weak.scale.setScalar(0.85 + Math.sin(t * 8 + id) * 0.2); }
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
    // Slop-Tech caches
    for (const [id, x, y, busy] of S.ca || []) {
      const e = pooled(`cache:${id}`, () => {
        const g = new T.Group();
        g.add(mesh(new T.BoxGeometry(36, 30, 28), mat(0x2a3440), 0, 15, 0));
        const scr = mesh(new T.BoxGeometry(2, 12, 22), mat(0x7dffb0, 0x2aff9a), 18.5, 20, 0); g.add(scr); g.userData.scr = scr;
        g.add(mesh(new T.CylinderGeometry(1, 1, 30, 5), mat(0x999999), -10, 45, 8));
        g.add(mesh(new T.SphereGeometry(3, 8, 6), mat(0xff3030, 0xff0000), -10, 60, 8));
        return g;
      });
      at(e.obj, x, y, 0); e.obj.rotation.y = id;
      e.obj.userData.scr.material.emissive.setHex(busy ? 0xffc020 : Math.floor(t * 2 + id) % 2 ? 0x2aff9a : 0x0a5030);
    }
    // the football
    if (S.ball) {
      const [bx, by, bz] = S.ball;
      const e = pooled("ball", () => { const g = new T.Group(); g.add(mesh(new T.SphereGeometry(9, 14, 10), mat(0xf4f4f4))); for (let i = 0; i < 6; i++) { const ph = mesh(new T.SphereGeometry(3.2, 6, 5), mat(0x222222)); const a = i * 1.05, b = (i % 3) * 1.2; ph.position.set(Math.cos(a) * Math.cos(b) * 7.6, Math.sin(b) * 7.6 * (i % 2 ? 1 : -1), Math.sin(a) * Math.cos(b) * 7.6); g.add(ph); } return g; });
      const px = e.x ?? bx, py = e.y ?? by;
      smoothTo(e, bx, by, bz, dt);
      at(e.obj, e.x, e.y, e.z + 9);
      const d = Math.hypot(e.x - px, e.y - py); if (d > 0.01) { e.obj.rotation.y = -Math.atan2(e.y - py, e.x - px); e.obj.rotation.z -= d / 9; }
    }
    // natural disasters
    const dis = S.g.dis;
    if (dis) {
      if (dis.k === "flood" && dis.w > 0.5) {
        const e = pooled("flood", () => { const m = mesh(new T.PlaneGeometry(MAP.W + 400, MAP.H + 400), new T.MeshLambertMaterial({ color: 0x2a6aa0, transparent: true, opacity: 0.6, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m; });
        at(e.obj, MAP.W / 2, MAP.H / 2, dis.w + Math.sin(t * 1.5) * 0.6);
      }
      if (dis.st) { // the control station that can stop it
        const [sx, sy, busy] = dis.st;
        const e = pooled(`station:${dis.k}`, () => {
          const g = new T.Group();
          g.add(mesh(new T.BoxGeometry(40, 34, 30), mat(0x2a3a4a), 0, 17, 0));
          const scr = mesh(new T.BoxGeometry(2, 14, 24), new T.MeshLambertMaterial({ color: 0x9fe0ff, emissive: 0x3a8ad0 }), 21, 24, 0); g.add(scr); g.userData.scr = scr;
          if (dis.k === "tornado") { const rk = mesh(new T.CylinderGeometry(5, 5, 50, 8), mat(0xdddddd), -8, 60, 0); rk.rotation.z = 0.4; g.add(rk); g.add(mesh(new T.ConeGeometry(5, 12, 8), mat(0xff4030), -18, 88, 0)); }
          else if (dis.k === "meteor") { const dish = mesh(new T.SphereGeometry(18, 12, 6, 0, Math.PI * 2, 0, 1.1), mat(0xcccccc), 0, 50, 0); dish.rotation.x = Math.PI; g.add(dish); g.userData.dish = dish; }
          else if (dis.k === "flood") { const wh = mesh(new T.TorusGeometry(12, 2.5, 6, 16), mat(0xc03030), 0, 50, 0); g.add(wh); g.userData.wheel = wh; }
          else { g.add(mesh(new T.CylinderGeometry(8, 8, 30, 10), mat(0x8a8a50), 0, 49, 0)); }
          const beacon = mesh(new T.SphereGeometry(5, 8, 6), new T.MeshLambertMaterial({ color: 0xffd34d, emissive: 0xffa000 }), 12, 44, 10); g.add(beacon); g.userData.beacon = beacon;
          return g;
        });
        at(e.obj, sx, sy, 0);
        e.obj.userData.scr.material.emissive.setHex(busy ? 0xffc020 : Math.floor(t * 3) % 2 ? 0x3a8ad0 : 0x0a2a40);
        e.obj.userData.beacon.material.emissive.setHex(Math.floor(t * 4) % 2 ? 0xffa000 : 0x302000);
        if (e.obj.userData.dish) e.obj.userData.dish.rotation.z = Math.sin(t) * 0.4;
        if (e.obj.userData.wheel) e.obj.userData.wheel.rotation.y = t * (busy ? 4 : 0.5);
      }
      if (dis.k === "tornado") {
        const e = pooled("tornado", () => { const g = new T.Group(); for (let i = 0; i < 3; i++) { const c = mesh(new T.ConeGeometry(170 - i * 45, 520 - i * 80, 20, 1, true), new T.MeshBasicMaterial({ color: [0x8a8078, 0x9a9088, 0x6a625a][i], transparent: true, opacity: 0.35 + i * 0.1, side: T.DoubleSide, depthWrite: false })); c.rotation.x = Math.PI; c.position.y = (520 - i * 80) / 2; g.add(c); } return g; });
        smoothTo(e, dis.x, dis.y, 0, dt, 1000);
        at(e.obj, e.x, e.y, 0); e.obj.children.forEach((c, i) => { c.rotation.y = t * (4 + i * 2); });
      }
      for (const [mx, my, left] of dis.m || []) {
        const e = pooled(`met:${mx}:${my}`, () => {
          const g = new T.Group();
          const ring = mesh(new T.RingGeometry(160, 172, 40), new T.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 2; g.add(ring);
          const rock = mesh(new T.DodecahedronGeometry(24, 0), mat(0x5a3020, 0xff6010)); g.add(rock); g.userData.rock = rock;
          const trail = mesh(new T.ConeGeometry(20, 160, 8, 1, true), new T.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.6, depthWrite: false })); rock.add(trail); trail.position.set(0, 80, 0);
          g.userData.ring = ring; return g;
        });
        const k = Math.max(0, Math.min(1, 1 - left / 1.8));
        at(e.obj, mx, my, 0);
        e.obj.userData.ring.material.opacity = 0.4 + k * 0.5 + Math.sin(t * 20) * 0.1;
        const rock = e.obj.userData.rock; rock.position.set(-(1 - k) * 300, (1 - k) * 1400 + 20, -(1 - k) * 500); rock.rotation.set(t * 3, t * 2, 0);
      }
    }
    // players
    let si = 0;
    const spotUse = [];
    for (const p of S.p) {
      if (p.d || p.air === 1 || p.air === 3) continue;
      const mine = p.id === me;
      const e = pooled(`p:${p.id}:${p.c}:${p.h}:${p.ey}:${(p.gr || []).join(",")}`, () => gearMesh(personMesh(p.c, p.h, p.ey), p.gr));
      if (mine) { e.x = st.pred.x; e.y = st.pred.y; e.z = st.pred.z; e.init = true; }
      else smoothTo(e, p.x, p.y, p.z || 0, dt);
      const yaw = mine ? st.aimYaw : p.a, pitch = mine ? st.aimPitch : (p.pt || 0);
      const sp = Math.hypot(e.x - (e.lx ?? e.x), e.y - (e.ly ?? e.y)) / Math.max(dt, 0.001); e.lx = e.x; e.ly = e.y;
      e.sp = lerp(e.sp || 0, sp, Math.min(1, dt * 10));
      at(e.obj, e.x, e.y, e.z); e.obj.rotation.y = -yaw;
      e.obj.visible = !(mine && st.fp) && !p.vh;
      const body = e.obj.userData.body;
      body.scale.y = p.go ? 0.72 : p.cro ? 0.7 : 1;
      body.rotation.z = lerp(body.rotation.z, p.sw ? -1.25 : p.sli ? 0.85 : p.sprt ? -0.28 : 0, Math.min(1, dt * (p.sw ? 6 : 10))); // swimming: flat out; sprinting leans in; sliding leans back
      body.position.y = p.sw ? 22 : 0;
      const walk = p.sw ? 1 : Math.min(1, e.sp / 120), wt = (e.wt = (e.wt || 0) + dt * (p.sw ? 7 : 4 + e.sp / 30));
      e.obj.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(wt + i * Math.PI) * 0.7 * walk; });
      if (e.obj.userData.hat.userData.spin) e.obj.userData.hat.userData.spin.rotation.y = t * 20;
      // weapon in hand
      const wk = p.w + ":" + p.wr + ":" + (p.wsk || "") + ":" + (p.wat || "");
      if (e.wk !== wk) { const arm = e.obj.userData.arm; while (arm.children.length > 2) { freeGeo(arm.children[2]); arm.remove(arm.children[2]); } const wm = weaponMesh(p.w, p.wr, p.wsk, p.wat); wm.position.set(2, 0, 0); arm.add(wm); e.wk = wk; }
      const arm = e.obj.userData.arm;
      const sl = st.slashT.get(p.id), sk = sl ? Math.min(1, (t - sl) / 0.25) : 1;
      arm.rotation.z = p.w === "sword" && sk < 1 ? pitch + 1.4 - sk * 2.6 : pitch;
      arm.rotation.y = p.w === "sword" && sk < 1 ? (sk - 0.5) * 1.6 : 0;
      // parachute
      if (p.air === 4) {
        if (!e.pod) { e.pod = new T.Group(); const shell = mesh(new T.CylinderGeometry(18, 24, 70, 10), mat(0x2a2a2a)); shell.position.y = 30; const tip = mesh(new T.ConeGeometry(24, 30, 10), mat(p.c)); tip.position.y = -20; tip.rotation.x = Math.PI; const fire = mesh(new T.ConeGeometry(30, 120, 10), new T.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.6, depthWrite: false })); fire.position.y = 140; e.pod.add(shell, tip, fire); e.obj.add(e.pod); }
        e.pod.visible = !mine; e.obj.userData.arm.visible = false; e.podOn = true; // your own pod would fill the camera; everyone else sees it come in
      } else if (e.podOn) { e.podOn = false; e.pod.visible = false; e.obj.userData.arm.visible = true; }
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
    { // muzzle flashes: the newest shots light up whatever's around them
      const shots = st.fx.filter((f) => f.kind === "tr" && f.c !== "rico" && f.c !== "staff" && t - f.t0 < 0.07).slice(-2);
      L.muzzle.forEach((pt, i) => { const f = shots[i]; if (!f) { pt.intensity = 0; return; } at(pt, f.x1, f.y1, (f.z1 ?? 36) + 4); pt.color.setHex(f.c === "laser" ? 0xff3030 : 0xffc070); pt.intensity = (2 + n * 6) * (1 - (t - f.t0) / 0.07); });
    }
    L.points.forEach((pt, i) => { const l = lamps[i]; if (!l || n < 0.05) { pt.intensity = 0; return; } at(pt, l[0], l[1], 76); pt.intensity = 4 * n; });
    { // the bulbs indoors: light the nearest few, so cellars and offices aren't black
      const bl = level.userData.bulbs || [], c0b = st.cam;
      if (bl.length) bl.sort((a, b) => ((a[0] - c0b.x) ** 2 + (a[1] - c0b.y) ** 2 + (a[2] - c0b.z) ** 2) - ((b[0] - c0b.x) ** 2 + (b[1] - c0b.y) ** 2 + (b[2] - c0b.z) ** 2));
      L.bulbs.forEach((pt, i) => { const b = bl[i]; if (!b || Math.hypot(b[0] - c0b.x, b[1] - c0b.y, b[2] - c0b.z) > 900) { pt.intensity = 0; return; } at(pt, b[0], b[1], b[2]); pt.intensity = 5; });
    }
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
        else if (f.kind === "zap") { // chain lightning: a jagged line through every target
          const v = [];
          f.pts.forEach(([x, y, z], i) => { if (i) { const [px, py, pz] = f.pts[i - 1]; for (let j = 1; j < 5; j++) { const q = j / 5; v.push(px + (x - px) * q + (Math.random() - 0.5) * 22, pz + (z - pz) * q + (Math.random() - 0.5) * 22, py + (y - py) * q + (Math.random() - 0.5) * 22); } } v.push(x, z, y); });
          const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
          o = new T.Line(g, new T.LineBasicMaterial({ color: 0xe8dcff, transparent: true }));
        }
        else continue;
        o.userData.fx = f; scene.add(o); fxObjs.set(f, o);
      }
      if (f.kind === "tr" || f.kind === "zap") o.material.opacity = 1 - k;
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
    if (c.roll) cam.rotateZ(c.roll); // wall-running tilts the world
    updateViewModel(st, t);
    R.render(scene, cam);
  }

  // the gun (or sword) in front of your face in first person
  function updateViewModel(st, t) {
    const vm = st.vm;
    const key = vm ? vm.type + ":" + vm.rar + ":" + (vm.sk || "") + ":" + (vm.at || "") : "";
    if (key !== vmKey) {
      if (viewModel) { cam.remove(viewModel); freeGeo(viewModel); }
      viewModel = null; vmKey = key;
      if (vm) { viewModel = new T.Group(); const w = weaponMesh(vm.type, vm.rar, vm.sk, vm.at); w.rotation.y = Math.PI / 2; w.scale.setScalar(0.55); viewModel.add(w); viewModel.userData.flash = w.userData.flash; cam.add(viewModel); }
    }
    if (!viewModel) return;
    viewModel.visible = !!(vm && vm.show);
    if (!vm) return;
    const bob = vm.bob || 0, kick = vm.kick || 0, ads = vm.ads || 0, spr = vm.spr || 0, sli = vm.sli || 0, man = vm.man || 0;
    // reloading: tip the gun over, drop the mag out, slap a new one in and bring it back up
    const rl = vm.rl || 0, rk = rl > 0 ? Math.sin(Math.min(1, rl) * Math.PI) : 0, slap = rl > 0.45 && rl < 0.6 ? Math.sin((rl - 0.45) / 0.15 * Math.PI) : 0;
    const low = Math.max(spr, man) * (1 - ads); // sprinting (or climbing) lowers the gun
    viewModel.position.set(lerp(7, 0, ads) + Math.cos(bob) * 0.5 + low * 2 - sli * 2, lerp(-6.5, -3.6, ads) + Math.abs(Math.sin(bob)) * 0.5 + kick * 0.8 - low * 4 - rk * 3 + slap * 1.2, -20 + kick * 3 + low * 2);
    viewModel.rotation.set(kick * 0.25 - low * 0.5 - rk * 0.25, low * 0.6, rk * 0.9 + sli * 0.35);
    const fl = viewModel.userData.flash; // a blink of fire at the muzzle
    if (fl) { fl.visible = kick > 0.55 && vm.type !== "sword" && vm.type !== "staff"; if (fl.visible) { fl.rotation.x = Math.random() * 6.3; fl.scale.setScalar(0.7 + Math.random() * 0.6); } }
    if (vm.type === "sword") { const s = vm.swing ?? 1; viewModel.rotation.set(0.2, s < 1 ? 1.2 - s * 2.4 : 0.3, s < 1 ? -0.8 + s * 1.2 : 0.35); }
  }

  function project(x, y, z) {
    const v = new T.Vector3(x, z, y).project(cam);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * vw, y: (1 - v.y) / 2 * vh, d: cam.position.distanceTo(new T.Vector3(x, z, y)) };
  }
  return { init, show, resize, frame, project, get ok() { return ok; } };
})();
