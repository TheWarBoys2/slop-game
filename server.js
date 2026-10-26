// SLOP VALLEY — game server. Run with `bun server.js [port]`.
// Serves the browser client and runs the whole game authoritatively. The game itself is in server/, one file per system;
// this file loads them all and builds the first valley.
import { placeNpcs } from "./server/geometry.js";
import { generateMap } from "./server/map.js";
import { world } from "./server/world.js";
import "./server/config.js";
import "./server/modes.js";
import "./server/zgrid.js";
import "./server/map.js";
import "./server/geometry.js";
import "./server/state.js";
import "./server/needs.js";
import "./server/combat.js";
import "./server/actions.js";
import "./server/economy.js";
import "./server/social.js";
import "./server/nukes.js";
import "./server/royale.js";
import "./server/vehicles.js";
import "./server/building.js";
import "./server/phases.js";
import "./server/hacking.js";
import "./server/wild.js";
import "./server/dust.js";
import "./server/adventure.js";
import "./server/bugnight.js";
import "./server/mechs.js";
import "./server/disasters.js";
import "./server/tick.js";
import "./server/net.js";

// boot: build the first valley now that every module is loaded
generateMap((Math.random() * 1e9) | 0);
placeNpcs();
world.gameReady = true;
