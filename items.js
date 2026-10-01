// Everything that goes in your bag: food, drink, medicine, gifts, card packs and gear.
// Food and drink: f = hunger filled, d = thirst quenched, hp = healed, bw/bl = how much it fills your bowels/bladder.

export const BAG_SIZE = 16; // slots; food and drink stack, gear doesn't

// Crops. t = how long each growth stage takes (turnip = 1), sell = base price at the produce stall,
// seed = price of one seed (they come in packets of 3), regrow = goes back to flowering after you pick it,
// yield = how many you pick. Everything you grow is food too.
export const CROPS = {
  lettuce:    { name: "Lettuce", icon: "🥬", t: 0.5, seed: 2, sell: 10, f: 12, d: 10, col: "#7fd34d", desc: "Ready in no time. Worth next to nothing." },
  turnip:     { name: "Turnip", icon: "🥕", t: 1, seed: 5, sell: 25, f: 20, d: 6, col: "#b35fd0", desc: "The valley's pride. Two make a stew at the Hearth." },
  potato:     { name: "Potato", icon: "🥔", t: 1.5, seed: 8, sell: 42, f: 30, col: "#c8a060", desc: "Slow and steady. Two make a stew at the Hearth." },
  tomato:     { name: "Tomato", icon: "🍅", t: 1.2, seed: 10, sell: 20, f: 10, d: 12, regrow: true, col: "#e83a2a", desc: "Keeps fruiting after you pick it." },
  strawberry: { name: "Strawberry", icon: "🍓", t: 1, seed: 14, sell: 28, f: 8, d: 8, regrow: true, col: "#ff4060", desc: "Keeps fruiting after you pick it. Somebody loves these." },
  corn:       { name: "Corn", icon: "🌽", t: 2, seed: 12, sell: 34, f: 22, yield: 2, col: "#ffd34d", desc: "Takes a while, gives two cobs." },
  pumpkin:    { name: "Pumpkin", icon: "🎃", t: 3, seed: 30, sell: 150, f: 45, col: "#ff8a20", desc: "Huge, slow and valuable. Zombies love stepping on them." },
  melon:      { name: "Slop Melon", icon: "🍉", t: 4.5, seed: 70, sell: 340, f: 50, d: 40, col: "#2aff9a", desc: "Grown from the well's own seeds. Glows faintly. Sells for a fortune." },
};
export const CROP_KEYS = Object.keys(CROPS);
export const SEED_PACK = 3;

export const ITEMS = {
  bread:   { name: "Loaf of bread", kind: "food", f: 35, bw: 12, cost: 12, icon: "🍞", desc: "Fills you up. Mostly air." },
  beans:   { name: "Tin of beans", kind: "food", f: 45, bw: 25, cost: 18, icon: "🥫", tinned: true, desc: "Safe from radiation. Not safe for your bowels." },
  stew:    { name: "Hearth stew", kind: "food", f: 70, d: 15, hp: 40, bw: 20, icon: "🍲", grown: true, desc: "Two turnips cooked in the Hearth. Heals you too." },
  pie:     { name: "Slop pie", kind: "food", f: 40, bw: 18, cost: 20, icon: "🥧", gift: "pie", desc: "Brother Aldous loves these." },
  ration:  { name: "Army ration", kind: "food", f: 60, d: 10, bw: 15, cost: 30, icon: "🎖", tinned: true, desc: "Sergeant Haddock swears by them." },
  water:   { name: "Bottle of water", kind: "drink", d: 45, bl: 20, cost: 8, icon: "💧", desc: "Clean, for now." },
  grog:    { name: "Grog", kind: "drink", d: 25, bl: 28, stress: -30, drunk: 40, cost: 25, icon: "🍺", gift: "grog", desc: "Calms the nerves. Ruins the aim." },
  cola:    { name: "Slop Cola", kind: "drink", d: 35, bl: 18, fizz: 20, cost: 15, icon: "🥤", desc: "Run 20% faster for 20 seconds. Probably fine." },
  lakewater: { name: "Lake water", kind: "drink", d: 40, bl: 20, sick: 0.3, icon: "🫗", desc: "Fill up at the lake (E at the water's edge). Might give you the runs." },
  pee:     { name: "Bottle of your own pee", kind: "drink", d: 30, bl: 10, stress: 15, icon: "🧪", desc: "Bear Gritts says it's fine." },
  bandage: { name: "Bandage", kind: "med", hp: 35, cost: 15, icon: "🩹", desc: "Heals 35." },
  medkit:  { name: "Medkit", kind: "med", hp: 999, cost: 40, icon: "⛑", desc: "Heals you fully." },
  antidote: { name: "Antidote", kind: "med", cure: true, cost: 40, icon: "💉", desc: "Cures a zombie infection." },
  iodine:  { name: "Iodine pills", kind: "med", radRes: 90, cost: 30, icon: "💊", desc: "Halves the radiation you take for 90 seconds." },
  radaway: { name: "Rad-Away", kind: "med", rad: -60, cost: 45, icon: "☢", desc: "Flushes out 60 rads. Tastes of batteries." },
  flowers: { name: "Wildflowers", kind: "gift", gift: "flowers", cost: 10, icon: "💐", desc: "A gift. Someone in town loves these." },
  trinket: { name: "Shiny trinket", kind: "gift", gift: "trinket", cost: 40, icon: "💍", desc: "A gift. Mayor Grubb can't resist shiny things." },
  ...Object.fromEntries(Object.entries(CROPS).flatMap(([id, c]) => [
    [id, { name: c.name, kind: "food", f: c.f, d: c.d, bw: Math.round(c.f / 2.5), icon: c.icon, grown: true, crop: id, veg: id === "turnip" || id === "potato", desc: c.desc }],
    ["s_" + id, { name: `${c.name} seeds`, kind: "seed", crop: id, icon: "🌱", desc: `Plant at any plot [E]. ${c.desc}` }],
  ])),
  pack:    { name: "Slop Snap card pack", kind: "pack", cost: 60, icon: "🃏", desc: "Four cards for your collection. Open it from your bag." },
};

// Gear: one of each slot. def = share of damage it soaks, rad = share of radiation it blocks,
// speed / swim = movement bonuses, reload = faster reloads, spread = tighter aim, dirt = guns get dirty slower.
export const SLOTS = ["head", "body", "hands", "feet"];
export const GEAR = {
  pot:      { name: "Saucepan", slot: "head", def: 0.05, cost: 30, desc: "It's a saucepan. On your head." },
  helmet:   { name: "Army Helmet", slot: "head", def: 0.1, cost: 90 },
  gasmask:  { name: "Gas Mask", slot: "head", def: 0.03, rad: 0.45, cost: 80, desc: "Blocks radiation. Makes you sound like a villain." },
  vest:     { name: "Kevlar Vest", slot: "body", def: 0.14, cost: 110 },
  plate:    { name: "Plate Carrier", slot: "body", def: 0.24, speed: -0.06, cost: 180, desc: "Heavy. Very safe." },
  hazmat:   { name: "Hazmat Suit", slot: "body", def: 0.04, rad: 0.45, cost: 120, desc: "Blocks radiation. Very yellow." },
  gloves:   { name: "Work Gloves", slot: "hands", reload: 0.08, dirt: 0.3, cost: 30 },
  tactical: { name: "Tactical Gloves", slot: "hands", reload: 0.1, spread: 0.12, cost: 90 },
  wellies:  { name: "Wellies", slot: "feet", def: 0.02, swim: 0.15, cost: 25 },
  trainers: { name: "Trainers", slot: "feet", speed: 0.08, cost: 60 },
  boots:    { name: "Combat Boots", slot: "feet", def: 0.05, speed: 0.04, cost: 100 },
  flippers: { name: "Flippers", slot: "feet", swim: 0.6, speed: -0.12, cost: 50, desc: "Superb underwater. Ridiculous on land." },
};
export const GEAR_RAR = [1, 1.25, 1.5, 1.8, 2.2]; // how much each rarity multiplies a piece's bonuses
export const GEAR_KEYS = Object.keys(GEAR);

// a gear piece's stats at its rarity
export function gearStat(g, k) { if (!g) return 0; const d = GEAR[g.id]; if (!d || !d[k]) return 0; return d[k] < 0 ? d[k] : d[k] * GEAR_RAR[g.r || 0]; }
export function gearSum(gear, k) { let s = 0; for (const slot of SLOTS) s += gearStat(gear[slot], k); return s; }

// the bag: [{ id, n }] for stackables, [{ id, r, gear: 1 }] for gear
export function bagAdd(bag, id, n = 1, r = 0) {
  if (GEAR[id]) { if (bag.length >= BAG_SIZE) return false; bag.push({ id, r, gear: 1 }); return true; }
  const s = bag.find((b) => b.id === id && !b.gear);
  if (s) { s.n += n; return true; }
  if (bag.length >= BAG_SIZE) return false;
  bag.push({ id, n }); return true;
}
export function bagCount(bag, id) { return bag.filter((b) => b.id === id).reduce((a, b) => a + (b.n || 1), 0); }
export function bagTake(bag, id, n = 1) {
  const i = bag.findIndex((b) => b.id === id && !b.gear);
  if (i < 0 || bag[i].n < n) return false;
  bag[i].n -= n; if (bag[i].n <= 0) bag.splice(i, 1);
  return true;
}
export function itemName(it) { return GEAR[it.id] ? GEAR[it.id].name : ITEMS[it.id] ? ITEMS[it.id].name : it.id; }
