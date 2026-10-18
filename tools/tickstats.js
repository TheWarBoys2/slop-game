// Preloaded by tools/playtest.js (`bun --preload tools/tickstats.js server.js`): times every game tick
// without touching server.js, and prints a TICKSTATS line every 5 seconds.
const realSetInterval = globalThis.setInterval;
let n = 0, total = 0, worst = 0;
globalThis.setInterval = (fn, ms, ...args) => {
  if (ms >= 50) return realSetInterval(fn, ms, ...args); // only the 30-a-second game tick is timed
  return realSetInterval(() => {
    const t0 = performance.now();
    try { fn(); } finally { const d = performance.now() - t0; n++; total += d; if (d > worst) worst = d; }
  }, ms, ...args);
};
realSetInterval(() => {
  if (!n) return;
  console.log(`TICKSTATS ${JSON.stringify({ n, avg: +(total / n).toFixed(3), max: +worst.toFixed(1) })}`);
  n = 0; total = 0; worst = 0;
}, 5000);
