// The Slop Valley Stock Exchange. Prices wander on their own and jump when things happen in the game.
// Gold only, like the casino.

export const STOCKS = {
  SLOP: { name: "Slop-Tech Industries", p: 50, vol: 0.012, desc: "Owns the caches. Hates hackers." },
  FARM: { name: "Valley Farmers Co-op", p: 20, vol: 0.008, desc: "Every harvest helps. Disasters don't." },
  BOOM: { name: "Haddock Munitions", p: 35, vol: 0.01, desc: "Up when the dead come. War is good for business." },
  VEX:  { name: "Vex's Emporium", p: 15, vol: 0.016, desc: "Rises with every sale and every spin." },
  BNKR: { name: "Bunkr & Sons Shelters", p: 8, vol: 0.012, desc: "Nobody buys bunkers. Until they do." },
  GRUB: { name: "Grubb Civic Holdings", p: 30, vol: 0.009, desc: "Moves with the mayor's fortunes." },
};
export const SYMS = Object.keys(STOCKS);
export const FEE = 0.02; // trading fee, waived under Mayor Vex
export const HIST = 120; // seconds of price history kept

export function newMarket() {
  const m = { px: {}, hist: {}, pend: {}, news: [] };
  for (const s of SYMS) { m.px[s] = STOCKS[s].p * (0.85 + Math.random() * 0.3); m.hist[s] = [m.px[s]]; m.pend[s] = 0; }
  return m;
}
// queue a jump (pct, e.g. 0.2 = +20%) that plays out over the next few seconds. Big ones make the news.
export function shock(m, sym, pct, why) {
  const list = sym === "*" ? SYMS : [sym];
  for (const s of list) m.pend[s] += pct;
  if (why && Math.abs(pct) >= 0.04) { m.news.unshift({ text: why, up: pct > 0, sym }); m.news.length = Math.min(m.news.length, 6); }
}
// once a second
export function marketTick(m) {
  for (const s of SYMS) {
    const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2 * STOCKS[s].vol; // roughly normal noise
    const rev = (STOCKS[s].p - m.px[s]) / STOCKS[s].p * 0.004; // drifts back towards fair value, slowly
    const take = m.pend[s] * 0.35; m.pend[s] -= take; // news priced in over a few seconds
    m.px[s] = Math.max(0.5, m.px[s] * Math.exp(g + rev + Math.log(1 + Math.max(-0.9, take))));
    m.hist[s].push(m.px[s]); if (m.hist[s].length > HIST) m.hist[s].shift();
  }
}
