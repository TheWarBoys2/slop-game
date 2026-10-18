// SLOP VALLEY — the game's core tables, in one place. The server plays by these numbers, and it bundles this whole
// module into game.js as DATA (see CLIENT_DATA in server/net.js), so the browser shows the same names and text instead of its own copies.
// A description sits next to the numbers it describes: change one, change the other.

// ---------------------------------------------------------------- weapons
export const WEAPONS = {
  pistol:  { name: "Pistol",     dmg: 22,  rate: 3.5, spread: 0.05,  range: 700,  pellets: 1, mag: 12, reload: 1.2, bloom: 0.35 },
  smg:     { name: "SMG",        dmg: 14,  rate: 11,  spread: 0.10,  range: 600,  pellets: 1, mag: 30, reload: 2.0, bloom: 0.12 },
  shotgun: { name: "Shotgun",    dmg: 13,  rate: 1.1, spread: 0.22,  range: 380,  pellets: 8, mag: 6,  reload: 2.4, bloom: 0.2 },
  rifle:   { name: "Rifle",      dmg: 30,  rate: 7,   spread: 0.08,  range: 900,  pellets: 1, mag: 30, reload: 2.3, bloom: 0.2 },
  sniper:  { name: "Sniper",     dmg: 130, rate: 0.8, spread: 0.01,  range: 1600, pellets: 1, mag: 5,  reload: 3.0, bloom: 0, pierce: true },
  staff:   { name: "Fire Staff", dmg: 45,  rate: 1.5, spread: 0.03,  range: 700,  pellets: 1, mag: 10, reload: 2.0, bloom: 0.3, boom: 90 },
  ak:      { name: "AK-Maybe",   dmg: 26,  rate: 9,   spread: 0.09,  range: 820,  pellets: 1, mag: 30, reload: 2.2, bloom: 0.18, gamble: true }, // every shot re-rolls the ammo count
  sword:   { name: "Slop Sword", dmg: 70,  rate: 1.8, spread: 0,     range: 92,   pellets: 1, mag: 1,  reload: 0,   bloom: 0, melee: true, arc: 1.1 }, // no ammo, lunges, hits harder falling
  rocket:  { name: "Rocket Launcher", dmg: 120, rate: 1.1, spread: 0.01, range: 1600, pellets: 1, mag: 1, reload: 1.3, bloom: 0, proj: "rocket", boom: 125 }, // aim at your feet and jump
  laser:   { name: "Spartan Laser", dmg: 650, rate: 0.5, spread: 0, range: 2400, pellets: 1, mag: 4, reload: 4.0, bloom: 0, pierce: true, charge: 1.2 }, // hold to charge, then it cuts through everything in a line. Everything.
};
export const MYTHIC = {
  smg: "The Hive", shotgun: "Farmer's Wrath", rifle: "Kingmaker", sniper: "The Last Word", staff: "Morwen's Spite", pistol: "Grubb's Gavel", ak: "Lady Luck", sword: "Excalibutt", rocket: "The Moon Unit", laser: "The Final Word",
};
export const LOOT_TYPES = ["smg", "shotgun", "rifle", "sniper", "staff", "smg", "shotgun", "rifle", "sniper", "staff", "ak", "sword", "rocket"]; // the AK is rarer
export const GUN_TYPES = ["pistol", "smg", "shotgun", "rifle", "sniper", "ak"]; // the ones that take firing modes, attachments and skins
export const RARITY = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
export const RARITY_MULT = [1, 1.2, 1.4, 1.7, 2.0];
export const RARITY_COL = ["#d8d8d8", "#4da6ff", "#c070ff", "#ffc030", "#ff4b4b"];
export const ENH_NAMES = ["", "PRI", "DUO", "TRI", "TET", "PEN"];
export const ENH_COST = [40, 80, 140, 220, 320];
export const ENH_CHANCE = [0.9, 0.7, 0.5, 0.3, 0.15];
// Legendary and Mythic guns roll a firing mode. Enhancing to TET or PEN overcharges it.
export const MODES = {
  ricochet: { name: "Ricochet", desc: "bullets bounce on to the next zombie" },
  fire:     { name: "Incendiary", desc: "sets whatever it hits on fire" },
  frost:    { name: "Cryo", desc: "slows what it hits, and enough hits freeze it solid" },
  storm:    { name: "Shock", desc: "lightning arcs to two more zombies" },
  boom:     { name: "Explosive", desc: "every hit goes off with a small bang" },
};
// Haddock bolts these onto the gun in your hands. One of each kind per gun.
export const ATTACH = {
  dot:  { slot: "sight", name: "Red dot sight", cost: 120, desc: "Much tighter aim down sights." },
  mag:  { slot: "mag", name: "Extended mag", cost: 150, desc: "+50% rounds, but reloads take 15% longer." },
  comp: { slot: "muzzle", name: "Compensator", cost: 110, desc: "Less bloom and less kick when you spray." },
};
export const SKINS = {
  camo:  { name: "Camo", cost: 80 },
  slop:  { name: "Slop Green", cost: 120 },
  tiger: { name: "Tiger Stripe", cost: 160 },
  pink:  { name: "Hot Pink", cost: 160 },
  gold:  { name: "Gold", cost: 400 },
};

// ---------------------------------------------------------------- who you are
export const CLASSES = {
  fighter: { name: "Fighter", hp: 150, speed: 1.0,  start: "smg", desc: "150 HP. Starts with an SMG. Hits things until they stop moving." },
  rogue:   { name: "Rogue",   hp: 90,  speed: 1.2,  start: null, desc: "Fast and fragile. 25% crit chance for double damage. Quicker dodge." },
  wizard:  { name: "Wizard",  hp: 90,  speed: 1.0,  start: "staff", desc: "Fire Staff: explosive bolts. They singe you too (30%), and friends a little." },
  farmer:  { name: "Farmer",  hp: 110, speed: 1.0,  start: "shotgun", desc: "Shotgun, a hoe and 9 seeds. Crops grow nearly twice as fast and sell for 25% more." },
  gaffer:  { name: "Gaffer",  hp: 100, speed: 1.05, start: null, desc: "The Manager. Teammates near you deal +20% dmg and move 10% faster. You take a 10% agent fee on everyone's earnings." },
};
export const BACKGROUNDS = {
  soldier:   { name: "Soldier",   sk: { steady: 1 }, desc: "Starts with a rank of Steady Hands." },
  farmhand:  { name: "Farmhand",  sk: { green: 1 }, desc: "Starts with a rank of Green Thumb." },
  noble:     { name: "Noble",     gold: 100, desc: "Starts with +100 gold. Insufferable." },
  outlander: { name: "Outlander", sk: { fleet: 1 }, desc: "Starts with a rank of Fleet." },
  acolyte:   { name: "Acolyte",   sk: { thuum: 1 }, desc: "Starts with a rank of Thu'um." },
  urchin:    { name: "Urchin",    sk: { scavenger: 1 }, desc: "Starts with a rank of Scavenger." },
};
export const TRAITS = {
  Strong:   { epithet: "the Strong", hp: 25, desc: "+25 max HP" },
  Swift:    { epithet: "the Swift", speed: 0.12, desc: "+12% speed" },
  Greedy:   { epithet: "the Greedy", gold: 0.25, desc: "+25% gold" },
  Craven:   { epithet: "the Craven", speed: 0.2, dmg: -0.15, desc: "+20% speed, -15% damage" },
  Wrathful: { epithet: "the Wrathful", dmg: 0.2, hp: -15, desc: "+20% damage, -15 HP" },
  Bald:     { epithet: "the Bald", desc: "No effect. Just bald." },
  Genius:   { epithet: "the Wise", shout: 0.4, desc: "Shout recharges 40% faster" },
  Drunkard: { epithet: "the Drunk", hp: 20, spread: 0.6, desc: "+20 HP, terrible aim" },
  Inbred:   { epithet: "the Inbred", hp: -10, desc: "-10 HP" },
  Lucky:    { epithet: "the Lucky", luck: 1, desc: "Better crits, cases & enhancing" },
};
export const SKILL_TREES = ["Marksman", "Survivor", "Homesteader", "Voice"];
export const SKILLS = {
  deadeye:   { tree: 0, max: 3, name: "Deadeye", desc: "Headshots deal +25% more damage per rank." },
  steady:    { tree: 0, max: 3, name: "Steady Hands", desc: "Spray bloom -20% per rank." },
  quick:     { tree: 0, max: 3, name: "Quick Hands", desc: "Reload 15% faster per rank." },
  tough:     { tree: 1, max: 3, name: "Tough as Boots", desc: "+20 max HP per rank." },
  wind:      { tree: 1, max: 3, name: "Second Wind", desc: "Regenerate 1.5 HP/s per rank after 3s unhurt." },
  fleet:     { tree: 1, max: 3, name: "Fleet", desc: "+6% move speed per rank, less stamina spent sprinting, longer wall-runs." },
  green:     { tree: 2, max: 3, name: "Green Thumb", desc: "Crops you plant grow 25% faster per rank." },
  haggler:   { tree: 2, max: 3, name: "Haggler", desc: "Shop prices -10% per rank." },
  scavenger: { tree: 2, max: 3, name: "Scavenger", desc: "20% chance per rank to upgrade crate loot a tier." },
  thuum:     { tree: 3, max: 3, name: "Thu'um", desc: "Shout recharges 15% faster, reaches 15% further and hits 20% harder per rank." },
  rally:     { tree: 3, max: 3, name: "Rally", desc: "Allies near you regenerate 0.8 HP/s per rank." },
  bloodlust: { tree: 3, max: 3, name: "Bloodlust", desc: "Heal 3 HP per rank on every kill." },
};
// The Thu'um: four elements, unlocked as you level. Every kind of monster is weak to one and shrugs off another.
export const ELEMENTS = {
  force: { name: "Force", word: "FUS RO DAH", lvl: 1, color: "#c8e6ff" },
  fire:  { name: "Fire",  word: "YOL TOOR SHUL", lvl: 2, color: "#ff8a2a" },
  frost: { name: "Frost", word: "FO KRAH DIIN", lvl: 3, color: "#8fe0ff" },
  storm: { name: "Storm", word: "STRUN BAH QO", lvl: 4, color: "#e0d0ff" },
};
export const HOES = ["", "Hoe", "Steel Hoe", "Golden Hoe"];
export const HOE_COST = [40, 90, 160];

// ---------------------------------------------------------------- the dead (and worse)
// code: the letter the snapshot sends (the first letter of the name if not given). h: height in radii (3.7 if not given).
// The flags are the rules that used to be hand-written lists of types:
//   big        explosions and tornadoes can't throw it, cars bounce off it, and it shows big hit numbers
//   nukeProof  a nuke takes half its health instead of all of it
//   sunProof   doesn't burn at dawn
//   parts      chance it drops a mech part when it dies
export const ZTYPES = {
  walker: { r: 15, hp: 60,  speed: 70,  dmg: 10, gold: 10, xp: 8 },
  runner: { r: 12, hp: 35,  speed: 145, dmg: 7,  gold: 12, xp: 10 },
  tank:   { r: 26, hp: 350, speed: 50,  dmg: 25, gold: 35, xp: 25, big: true, parts: 0.04 },
  elite:  { r: 34, hp: 1400, speed: 75, dmg: 30, gold: 150, xp: 80, big: true, nukeProof: true, sunProof: true, parts: 1 },
  boss:   { r: 48, hp: 3000, speed: 58, dmg: 35, gold: 500, xp: 200, big: true, nukeProof: true, parts: 1 },
  charger:  { r: 20, hp: 170, speed: 80,  dmg: 26, gold: 25, xp: 18, code: "c" }, // winds up, then charges in a straight line
  flyer:    { r: 13, hp: 40,  speed: 150, dmg: 8,  gold: 14, xp: 12, code: "f" }, // circles overhead and dives
  boomer:   { r: 24, hp: 80,  speed: 55,  dmg: 6,  gold: 18, xp: 14, code: "x" }, // pops in a cloud of bile that makes the horde hunt you
  screamer: { r: 14, hp: 65,  speed: 105, dmg: 5,  gold: 20, xp: 16, code: "s" }, // keeps its distance and screams for help
  raptor:   { r: 16, hp: 90, speed: 172, dmg: 10, gold: 22, xp: 16, code: "d" }, // hunts in packs and pounces
  rex:      { r: 40, hp: 1100, speed: 78, dmg: 32, gold: 160, xp: 90, code: "y", big: true, parts: 1 }, // roars, stomps through fences
  // Bug Night (see server/bugnight.js)
  bug:      { r: 14, hp: 40,  speed: 175, dmg: 8,  gold: 5,  xp: 5,  code: "g", h: 3.2 }, // warrior bug: fast, comes in swarms
  spitter:  { r: 22, hp: 150, speed: 60,  dmg: 6,  gold: 20, xp: 16, code: "p", h: 3.0 }, // plants itself and lobs plasma
  tanker:   { r: 36, hp: 1000, speed: 55, dmg: 28, gold: 90, xp: 60, code: "k", h: 2.2, big: true, parts: 1 }, // armoured, sprays acid
  brain:    { r: 56, hp: 5000, speed: 18, dmg: 20, gold: 400, xp: 200, code: "q", h: 2.4, big: true, nukeProof: true }, // the Brain Bug: kill it and they all die
};
for (const [k, z] of Object.entries(ZTYPES)) { z.code = z.code || k[0]; z.h = z.h || 3.7; }
