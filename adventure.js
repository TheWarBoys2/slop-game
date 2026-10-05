// SLOP VALLEY — Adventure mode: an open world of towns past the hedge, each with a notice board of work.
// No Hearth to defend and no waves. You pick up contracts, gigs, deliveries and breaches, travel between towns,
// get paid, level up, and build renown until the valley's worst beast comes out of hiding.
// This file is the pure part (making towns, rolling quests, the words); server.js runs it.

export const TOWN_HALF = 700; // a town's patch, from its middle to its palisade and a bit beyond
export const RENOWN_GOAL = 8; // quests the party finishes before the Legendary Contract goes up

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hitR = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

const A = ["Ash", "Black", "Bram", "Crow", "Dun", "Fen", "Gal", "Hollow", "Kil", "Lark", "Marl", "Nettle", "Oak", "Pike", "Rook", "Salt", "Thorn", "Wold", "Yarrow", "Stoat"];
const B = ["ford", "wick", "by", "stead", "mere", "holt", "cross", "gate", "ham", "well", "moor", "barrow", "field", "brook"];
const FOLK = {
  merchant: { role: "Merchant. Food, drink, medicine, gifts.", hats: ["flatcap", "beret", "bonnet"], cols: ["#8a6a3a", "#6a8a4a", "#a0603a"], names: ["Old Maud", "Pell the Pedlar", "Widow Fenn", "Barnaby", "Tilly Crumb"] },
  smith: { role: "Smith. Guns, ammo, gear and enhancing.", hats: ["helmet", "hood", "flatcap"], cols: ["#4a4a52", "#6a3a2a", "#3a4a5a"], names: ["Gorm", "Hilde Anvil", "Brakk", "Ironside Jo", "Swarf"] },
  keeper: { role: "Innkeeper. A meal and a bed: full health, fed and watered.", hats: ["bonnet", "tophat", "beret"], cols: ["#a04060", "#7a4a8a", "#3a7a6a"], names: ["Mother Hobb", "Fat Ned", "Rosalind", "Gus the Tap", "Dorrie"] },
};

// the towns: one per direction, further out = harder work (and better pay). `avoid` is a list of rectangles to keep clear of.
export function makeTowns(seed, home, avoid, n = 5, i0 = 0) {
  const rng = mulberry(seed ^ 0x5eed7);
  const R = (a, b) => a + rng() * (b - a), pick = (arr) => arr[(rng() * arr.length) | 0];
  const towns = [], used = new Set();
  const a0 = rng() * Math.PI * 2;
  const dists = [3300, 4600, 6000, 7400, 9000];
  for (let i = 0; i < n; i++) {
    let spot = null;
    for (let tries = 0; tries < 200 && !spot; tries++) {
      const a = a0 + i * 2.39996 + R(-0.4, 0.4) + tries * 0.37, d = dists[i] + R(-300, 300) + (tries > 100 ? 800 : 0);
      const cx = Math.round(home.x + Math.cos(a) * d), cy = Math.round(home.y + Math.sin(a) * d);
      const box = { x: cx - TOWN_HALF, y: cy - TOWN_HALF, w: TOWN_HALF * 2, h: TOWN_HALF * 2 };
      if (avoid.some((r) => hitR(box, r, 400)) || towns.some((t) => Math.hypot(t.cx - cx, t.cy - cy) < 3000)) continue;
      spot = { cx, cy, box };
    }
    if (!spot) continue;
    let name; do name = pick(A) + pick(B); while (used.has(name)); used.add(name);
    const t = { i: i0 + towns.length, name, cx: spot.cx, cy: spot.cy, box: spot.box, tier: i + 1, walls: [], folk: [] };
    buildTown(t, rng, R, pick);
    towns.push(t);
  }
  return towns;
}

function buildTown(t, rng, R, pick) {
  const { cx, cy } = t, walls = t.walls;
  // the square: a notice board, a signpost, and the three people who matter
  t.board = { x: cx - 70, y: cy - 150, w: 90, h: 14, kind: "board", town: t.i, z0: 0, z1: 70 };
  t.sign = { x: cx + 70, y: cy - 150, w: 14, h: 14, kind: "sign", town: t.i, z0: 0, z1: 96 };
  walls.push(t.board, t.sign);
  const spots = { merchant: [cx - 190, cy + 10], smith: [cx + 190, cy + 10], keeper: [cx, cy + 150] };
  for (const [k, F] of Object.entries(FOLK)) {
    const [x, y] = spots[k];
    t.folk.push({ id: `adv${t.i}_${k}`, job: k, town: t.i, name: pick(F.names), role: F.role, color: pick(F.cols), hat: pick(F.hats), x, y, a: Math.atan2(cy - y, cx - x) });
  }
  // a ring of cottages round the square, doors facing in
  const homes = [];
  for (let i = 0, tries = 0; i < 7 && tries < 300; tries++) {
    const a = R(0, Math.PI * 2), d = R(330, 520), w = Math.round(R(170, 230)), h = Math.round(R(120, 160));
    const x = Math.round(cx + Math.cos(a) * d - w / 2), y = Math.round(cy + Math.sin(a) * d - h / 2);
    const r = { x, y, w, h };
    if (homes.some((o) => hitR(r, o, 60)) || hitR(r, { x: cx - 260, y: cy - 220, w: 520, h: 440 }, 0)) continue; // keep the square open
    homes.push(r); i++;
    cottage(walls, { ...r, kind: "house", roof: (rng() * 4) | 0, z0: 0, z1: Math.round(R(100, 125)), door: y + h / 2 > cy ? "n" : "s" });
  }
  // a low palisade, with a gap on each side for the roads
  const P = TOWN_HALF - 80, G = 110;
  for (const s of [-1, 1]) {
    walls.push({ x: cx - P, y: cy + s * P - 9, w: P - G, h: 18, kind: "fence", z0: 0, z1: 34 }, { x: cx + G, y: cy + s * P - 9, w: P - G, h: 18, kind: "fence", z0: 0, z1: 34 });
    walls.push({ x: cx + s * P - 9, y: cy - P, w: 18, h: P - G, kind: "fence", z0: 0, z1: 34 }, { x: cx + s * P - 9, y: cy + G, w: 18, h: P - G, kind: "fence", z0: 0, z1: 34 });
  }
  for (const w of walls) { w.x = Math.round(w.x); w.y = Math.round(w.y); w.w = Math.round(w.w); w.h = Math.round(w.h); }
}
// a hollow one-storey cottage, built the same way as the ones in the valley's own town
function cottage(walls, h) {
  const T = 10, dw = 48, cx = h.x + h.w / 2, top = h.z1 - 10, north = h.door === "n";
  h.z0 = top; walls.push(h);
  const wall = (x, y, w, hh, z0 = 0, z1 = top) => walls.push({ x, y, w, h: hh, kind: "hwall", house: h, roof: h.roof, z0, z1 });
  const front = (y) => { wall(h.x, y, (h.w - dw) / 2, T); wall(cx + dw / 2, y, (h.w - dw) / 2, T); wall(cx - dw / 2, y, dw, T, 66, top); };
  if (north) { front(h.y); wall(h.x, h.y + h.h - T, h.w, T); } else { wall(h.x, h.y, h.w, T); front(h.y + h.h - T); }
  wall(h.x, h.y + T, T, h.h - 2 * T); wall(h.x + h.w - T, h.y + T, T, h.h - 2 * T);
  const fn = (f, x, y, w2, h2, z1) => walls.push({ x, y, w: w2, h: h2, kind: "furn", f, house: h, z0: 0, z1 });
  fn("bed", h.x + T + 6, north ? h.y + h.h - T - 84 : h.y + T + 4, 52, 80, 18);
  fn("table", h.x + h.w - T - 58, h.y + h.h / 2 - 18, 48, 36, 28);
}

// ---------------------------------------------------------------- the work
// Witcher-style monster contracts: investigate three signs, then the beast shows itself. Some only come out at night.
export const BEASTS = [
  { name: "the Gristle Hound", base: "charger", weak: "frost", night: false, signs: ["Paw prints the size of dinner plates, all going in a straight line. It charges.", "Fur caught on a fence post, frozen stiff. It hates the cold: Frost hits it twice as hard.", "A trampled sheep pen. It came this way and it'll come back."] },
  { name: "the Bog Wight", base: "tank", weak: "fire", night: true, signs: ["Footprints that fill up with black water as you watch.", "A scorched patch where it backed off from somebody's torch. Fire hits it twice as hard.", "It only walks after dark. Come back at night."] },
  { name: "the Carrion Wyvern", base: "flyer", weak: "storm", night: false, signs: ["Bones dropped from a height, picked clean.", "A tree split by lightning, and it nests nowhere near those. Storm hits it twice as hard.", "Droppings. Fresh ones. Its roost is close."] },
  { name: "the Moor Howler", base: "screamer", weak: "force", night: true, signs: ["Every dog in town is hiding under a bed.", "A shepherd says a good hard shove sent it running. Force hits it twice as hard.", "It screams for its pack at night. Bring friends."] },
  { name: "the Old Tusker", base: "rex", weak: "storm", night: false, signs: ["A hedge flattened in a line, a cart's width.", "Teeth marks on an iron gate. Storm hits it twice as hard.", "It's slow to turn. Get round the side of it."] },
  { name: "the Pale Lady", base: "runner", weak: "fire", night: true, signs: ["A woman's footprints, barefoot, no way in and no way out.", "Candle wax everywhere. She can't stand the flame: Fire hits her twice as hard.", "She's only ever seen after dark."] },
  { name: "the Rot Mother", base: "boomer", weak: "frost", night: false, signs: ["Bile on the grass, still steaming.", "A frozen puddle with something dead in it. Frost hits it twice as hard.", "Don't fight it up close. When it bursts, everything nearby comes for you."] },
];
const GIGS = [ // Cyberpunk-style gigs: a fixer wants somewhere cleared, pays on the spot
  ["Clear the Nest", "A nest of the dead in {place}. Clear the lot. Payment on completion."],
  ["Bandit Camp", "The dead have taken over the old camp at {place}. Get it back."],
  ["Hold the Crossing", "Something's blocking the road at {place}. Clear it so the carts can run."],
];
const PLACES = ["the old mill", "the drowned barn", "Gallows Hill", "the gravel pit", "the burnt orchard", "the stone circle", "Dead Man's Ditch", "the lime kilns", "the sunken lane", "the toll bridge"];
const GOODS = ["a crate of turnip wine", "the town's post", "a sealed letter", "medicine for a sick child", "a barrel of slop", "a very angry goose", "a wedding cake", "spare parts for a tractor"];
const RELAYS = ["Slop-Tech relay", "a survey drone wreck", "Slop-Tech data spike", "a crashed delivery bot"];

const pickR = (rng, arr) => arr[(rng() * arr.length) | 0];
// a quest for town `t`. `spot(minD, maxD)` finds open ground at that distance from the town; `other` is another town (for deliveries)
export function rollQuest(rng, t, kind, spot, other, nextId) {
  const tier = t.tier, pay = (base) => Math.round(base * (0.8 + 0.4 * tier) / 5) * 5;
  const place = pickR(rng, PLACES);
  if (kind === "contract") {
    const b = BEASTS[(rng() * BEASTS.length) | 0], at = spot(1300, 2600);
    return { id: nextId(), kind, town: t.i, tier, title: `Contract: ${cap(b.name)}`, desc: `Something has been killing livestock near ${t.name}. Search the area (🔍), find three signs, and the beast will show itself.${b.night ? " Word is it only comes out at night." : ""}`,
      beast: b.name, base: b.base, weak: b.weak, night: b.night, signs: b.signs, at, r: 380, gold: pay(220), xp: 60 + 25 * tier, item: true, step: "search", found: 0 };
  }
  if (kind === "gig") {
    const [title, txt] = pickR(rng, GIGS), at = spot(1100, 2400);
    return { id: nextId(), kind, town: t.i, tier, title: `Gig: ${title}`, desc: txt.replace("{place}", place) + " (⚔ on your compass)", place, at, r: 260, gold: pay(160), xp: 40 + 20 * tier, step: "go" };
  }
  if (kind === "delivery" && other) {
    const goods = pickR(rng, GOODS);
    return { id: nextId(), kind, town: t.i, tier, title: `Delivery to ${other.name}`, desc: `Take ${goods} to the notice board in ${other.name}. Get there before nightfall for a bonus.`, goods, to: other.i, at: { x: other.cx, y: other.cy }, r: 200, gold: pay(90) + Math.round(Math.hypot(other.cx - t.cx, other.cy - t.cy) / 60), xp: 30 + 12 * tier, step: "carry" };
  }
  const what = pickR(rng, RELAYS), at = spot(1000, 2200);
  return { id: nextId(), kind: "hack", town: t.i, tier, title: `Breach: ${cap(what)}`, desc: `A fixer wants into ${what} near ${place}. Breach it (the hacking minigame) and the data's theirs. Expect security.`, what, place, at, r: 200, gold: pay(150), xp: 45 + 18 * tier, step: "go" };
}
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

// the end of it all: once the party has done enough work, the worst thing in the valley gets a price on its head
export const LEGEND = { title: "The Legendary Contract", gold: 600, xp: 400 };
export function legendText(beastName, town) { return `Every notice board in the valley has the same poster now. ${beastName} has come out of hiding near ${town}. Kill it and you'll never pay for a drink again.`; }
