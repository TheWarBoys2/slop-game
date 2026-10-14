// Bug Night and mech suits: the data. The rules live in server.js (search "Bug Night").
//
// Bug Night: holes open around the valley and alien bugs pour out of them. Seal a hole with an explosion
// (grenade, rocket, a mech landing on it) and it stops. Halfway through the night, or once enough holes are
// sealed, the Brain Bug crawls out of its hive. Kill it and every bug in the valley drops dead.
//
// Mech suits: each player builds one from parts. A core, legs and at least one arm and it walks.
// Parts go in your bag; use one [I] to bolt it on. P calls your mech down from the sky.

export const BUG_HOLE_HP = 150; // one grenade or rocket close to the middle seals it
export const BUG_HOLE_R = 46;
export const BRAIN_REWARD = 200; // each, when the Brain Bug dies

// slot: where it bolts on. Arms go on the right first (left click fires it), then the left (right click).
export const MECH_PARTS = {
  reactor: { slot: "core", name: "Reactor Core", icon: "🔋", desc: "The heart of a mech. Nothing moves without one." },
  fusion:  { slot: "core", name: "Slop Fusion Core", icon: "☢", hp: 1.25, dmg: 1.25, desc: "A core that runs on well water. 25% more armour and 25% more damage." },
  strider: { slot: "legs", name: "Strider Legs", icon: "🦿", speed: 230, desc: "Plain, fast mech legs." },
  jet:     { slot: "legs", name: "Jump-Jet Legs", icon: "🚀", speed: 200, jet: 1, desc: "SPACE fires the jets. Land on the dead (or a bug hole) to flatten them." },
  cannon:  { slot: "arm", name: "Autocannon Arm", icon: "🔫", desc: "A big belt-fed gun. Doesn't need reloading." },
  rockets: { slot: "arm", name: "Rocket Pod Arm", icon: "🎆", desc: "Fires a rocket every second. Seals bug holes." },
  flamer:  { slot: "arm", name: "Flamer Arm", icon: "🔥", desc: "Sets everything in front of you on fire, the ground included." },
  sword:   { slot: "arm", name: "Mech Sword Arm", icon: "🗡", desc: "A sword the size of a lamp post. Wide swings, huge knockback." },
  sensor:  { slot: "head", name: "Sensor Helm", icon: "📡", hp: 600, desc: "Extra armour, and every bug hole shows on your map." },
  ram:     { slot: "head", name: "Ram Helm", icon: "🐏", stomp: 2, desc: "Walking into the dead hurts them twice as much." },
};
export const MECH_KEYS = Object.keys(MECH_PARTS);
export const MECH_HP = 2200, MECH_REPAIR = 250, MECH_COOL = 30;
// how often each part turns up: the plain ones most
export const PART_WEIGHT = { reactor: 3, fusion: 1, strider: 3, jet: 2, cannon: 3, rockets: 2, flamer: 2, sword: 2, sensor: 2, ram: 2 };
export function rollPart(rnd = Math.random) {
  let r = rnd() * Object.values(PART_WEIGHT).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(PART_WEIGHT)) { r -= w; if (r <= 0) return k; }
  return "cannon";
}
// the whole build: what the parts add up to
export function mechStats(m) {
  const P = (k) => (m && m[k] ? MECH_PARTS[m[k]] : null);
  const core = P("core"), legs = P("legs"), head = P("head");
  return {
    ready: !!(core && legs && (m.armR || m.armL)),
    hp: Math.round(MECH_HP * ((core && core.hp) || 1) + ((head && head.hp) || 0)),
    speed: (legs && legs.speed) || 0,
    jet: !!(legs && legs.jet),
    dmg: (core && core.dmg) || 1,
    stomp: (head && head.stomp) || 1,
    sensor: !!(m && m.head === "sensor"),
  };
}
// the order a vehicle's parts travel in the snapshot: core,legs,armR,armL,head
export const MECH_SLOTS = ["core", "legs", "armR", "armL", "head"];
export function mechCode(m) { return MECH_SLOTS.map((k) => (m && m[k]) || "").join(","); }
