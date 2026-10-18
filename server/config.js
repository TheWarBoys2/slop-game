// Tunables, test switches and small helpers every system uses; the map's size and the Hearth, which everything measures from.
import moveJs from "../public/move.js" with { type: "text" };
import { world } from "./world.js";

export const MV = new Function(moveJs + "\nreturn MV;")(); // the same movement code the browser predicts with
export const PORT = Number(process.argv[2] || process.env.PORT || 7777);
export const TICK_RATE = 30;
export const SNAP_EVERY = 2; // 15 snapshots/sec
export const FAST = !!process.env.SLOP_FAST; // testing only: short phases
export const DAY_LEN = Number(process.env.SLOP_DAY) || (FAST ? 6 : 85);
export const NIGHT_LEN = FAST ? 8 : 100;
export const LAST_NIGHT = 5; // the war reaches the valley around here (the radio, the Dome)
export const UNMASK_AFTER = 7; // nobody solved it by day 8: the culprit cracks and the last night comes anyway
export const ENDLESS_BOSS_EVERY = 5;
export const FOG_NIGHT = process.env.SLOP_FOGNIGHT ? 1 : 0.3; // chance a night (from night 2) is a fog night
export const DINO_FORCE = !!process.env.SLOP_DINO; // every day is Dinosaur Day (for testing)
export const DISASTER = process.env.SLOP_DISASTER || ""; // testing only: force a disaster every phase
export const DISASTER_CHANCE = 0.18;
export const DROP_LEN = FAST ? 4 : 12; // seconds the balloon takes to cross the valley
export const ROYALE_ZONES = [ // [wait, shrink, radius]
  [60, 45, 1400], [40, 35, 900], [30, 25, 520], [25, 20, 240], [20, 20, 0],
].map(([w, s, r]) => [FAST ? w / 6 : w, FAST ? s / 4 : s, r]);
export const STORY_ZONE_R = [2300, 1850, 1450, 1180, 980, 820];
export const TEST_DMG = Number(process.env.SLOP_DMG || 1); // testing only
export const TEST_TP = !!process.env.SLOP_TP; // testing only: lets a test script move players about
export const NUKE_CHANCE = process.env.SLOP_NUKE ? 1 : 0.04; // chance, each dawn and dusk from night 5 (after the first, certain strike), that somebody presses the button
export const NUKE_WARN = FAST ? 12 : 20; // seconds to get to the bunker
export const GUESTS = ["chef", "bear", "boulder", "david", "warren"]; // one celebrity visits each story run
export const UNLUCKY = process.env.SLOP_UNLUCKY ? 1 : 0.00004; // 0.004% per level-up or upgrade. As requested.
export const INFECT = process.env.SLOP_INFECT ? 1 : 0.03; // chance a bite infects you
export const UAV_STREAK = 10, UAV_LEN = 30; // kills without dying, and how long the UAV lasts
export const HEARTH_HEAL = 3, HEARTH_HEAL_R = 190; // hp per second, and how close you need to be
export const ANTIDOTE_IMMUNE = 90; // seconds an antidote keeps you from being reinfected
export const FORCE_SYM = process.env.SLOP_SYM || ""; // testing only
export const INTRO_LEN = { story: FAST ? 3 : 25, royale: FAST ? 2 : 10, endless: FAST ? 3 : 25, adventure: FAST ? 2 : 10 };
export const COUNTDOWN = FAST ? 1 : 4;
// ---------------------------------------------------------------- helpers
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// client strings index these tables, so "constructor" or "__proto__" mustn't find Object's own props
export const own = (o, k) => (typeof k === "string" && Object.hasOwn(o, k) ? o[k] : undefined);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const ROMAN = ["", "", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const now = () => performance.now() / 1000;
export function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// ---------------------------------------------------------------- the map's size and the Hearth (the rest of the map is in map.js)
export const W = 3400, H = 2600; // the Hearth sits in the middle, the farm either side of it
export const HEARTH = { x: 1620, y: 1240, w: 160, h: 120, kind: "hearth", z0: 0, z1: 90 };
world.WALLS = [HEARTH];
world.MAP_SEED = 1;
world.VALLEY = "Slopholm";
