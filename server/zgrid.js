// A grid of the zombies by area, so "which zombies are near here?" looks at a few cells instead of every zombie.
// It's rebuilt at most once a tick, on first use; zombies move a little within a tick, so lookups pad by SLACK.
import { world } from "./world.js";

const CELL = 128, SLACK = 48;
let grid = new Map(), builtFor = null, builtLen = -1, stale = true;
export function zgridStale() { stale = true; } // the tick calls this once zombies have moved
function build() {
  grid = new Map(); builtFor = world.zombies; builtLen = world.zombies.length; stale = false;
  for (const z of world.zombies) {
    const k = Math.floor(z.x / CELL) * 100003 + Math.floor(z.y / CELL);
    let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(z);
  }
}
// every zombie that might be within r of (x, y): a superset, so callers still do their own distance test
export function zombiesNear(x, y, r) {
  if (stale || builtFor !== world.zombies || builtLen !== world.zombies.length) build();
  const R = r + SLACK + 60, out = []; // 60: more than the biggest zombie's radius
  const i0 = Math.floor((x - R) / CELL), i1 = Math.floor((x + R) / CELL), j0 = Math.floor((y - R) / CELL), j1 = Math.floor((y + R) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = grid.get(i * 100003 + j); if (c) for (const z of c) out.push(z); }
  return out;
}
