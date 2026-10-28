// What each mode has: one row per mode, so a system asks `rules().town` instead of listing modes by name.
// A new mode is a new row here (plus its setup); a new rule is a new column, filled in for every mode.
import { DAY_LEN, DINO_FORCE, FAST, NIGHT_LEN } from "./config.js";
import { game } from "./state.js";

const ADV_DAY = FAST ? 6 : 240, ADV_NIGHT = FAST ? 8 : 150; // longer days in Adventure: there's walking to do

export const MODE_RULES = {
  story: {
    intro: FAST ? 3 : 25, day: DAY_LEN, night: NIGHT_LEN,
    town: true,       // the town works: shops, the stall, the casino, the club, the bunker, farming, Dust II, the Hearth's warmth
    townsfolk: true,  // the valley's own NPCs stand about town
    story: true,      // the mystery, deeds and legends, the Reckoning, celebrity cameos, story events
    pvp: false,       // friendly fire is softened and earns wanted stars; in a free-for-all it's the point
    respawn: true, uav: true, mechs: true,
    open: true,       // the wild past the hedge (the Royale keeps to the valley)
    hearth: true,     // the dead walk to the Hearth and chew on it; the Dome protects it
    waves: true,      // nights send waves at the Hearth (Adventure's dead just roam)
    politics: true,   // town meetings, the daily ballot, elections and the mayor
    nukes: true, disasters: true, rates: true,
    dinoDay: (day) => day === 4,
    bugNight: (n) => n === 3,
    bossWins: true,   // killing the last night's boss ends the game
    moonFrom: 5,      // Moonfall (moonfall.js) can start on any dawn from this day; 0 = never
  },
  endless: {
    intro: FAST ? 3 : 25, day: DAY_LEN, night: NIGHT_LEN,
    open: true, town: true, townsfolk: false, story: false, pvp: false, respawn: true, uav: true, mechs: true, hearth: true, waves: true,
    politics: true, nukes: true, disasters: true, rates: true,
    dinoDay: (day) => day >= 4 && (day - 4) % 7 === 0,
    bugNight: (n) => n === 3 || (n > 3 && (n - 3) % 6 === 0),
    bossWins: false,  // a boss every fifth night; killing it just brings the sun up
    moonFrom: 6,
  },
  adventure: {
    intro: FAST ? 2 : 10, day: ADV_DAY, night: ADV_NIGHT,
    open: true, town: true, townsfolk: false, story: false, pvp: false, respawn: true, uav: true, mechs: true, hearth: true, waves: false,
    politics: false, nukes: false, disasters: false, rates: true, // the towns run themselves, far from the valley's bombs and storms
    dinoDay: () => false, bugNight: () => false, bossWins: false, moonFrom: 0,
  },
  royale: {
    intro: FAST ? 2 : 10, day: DAY_LEN, night: NIGHT_LEN,
    open: false, town: false, townsfolk: false, story: false, pvp: true, respawn: false, uav: false, mechs: false, hearth: false, waves: false,
    politics: false, nukes: false, disasters: false, rates: false,
    dinoDay: () => false, bugNight: () => false, bossWins: false, moonFrom: 0,
  },
};
export const rules = () => MODE_RULES[game.mode] || MODE_RULES.story;

// Dinosaurs only come on DINOSAUR DAY: day 4 of the story, and in endless day 4 and every 7th day after.
// That day (and its night) nothing but dinosaurs crawls out of the well, and fewer of them than a normal night.
export function isDinoDay(day) { const R = rules(); if (!R.waves) return false; return DINO_FORCE ? day >= 2 : R.dinoDay(day); }
