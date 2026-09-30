// Vex's Casino. In-game gold only; nothing here touches real money.
// Golden Cases give spins on the big wheel; the wheel gives gold, guns, cosmetics, or a seat at a card table.

// ---------------------------------------------------------------- cosmetics
// slot: hat | trail | title. Rarity 0-4 like weapons. `bad` ones are jokes you probably won't equip. Probably.
export const COSMETICS = {
  // hats
  party:     { slot: "hat", name: "Party Hat", rarity: 0 },
  bucket:    { slot: "hat", name: "Bucket", rarity: 0, bad: true },
  cone:      { slot: "hat", name: "Traffic Cone", rarity: 0, bad: true },
  tinfoil:   { slot: "hat", name: "Tinfoil Hat", rarity: 1, bad: true },
  fish:      { slot: "hat", name: "A Fish", rarity: 1, bad: true },
  dunce:     { slot: "hat", name: "Dunce Cap", rarity: 1, bad: true },
  clown:     { slot: "hat", name: "Clown Wig", rarity: 1, bad: true },
  propeller: { slot: "hat", name: "Propeller Cap", rarity: 1 },
  pirate:    { slot: "hat", name: "Pirate Hat", rarity: 1 },
  sombrero:  { slot: "hat", name: "Sombrero", rarity: 1 },
  viking:    { slot: "hat", name: "Viking Helm", rarity: 2 },
  antlers:   { slot: "hat", name: "Leshen Antlers", rarity: 2 },
  toque:     { slot: "hat", name: "Celebrity Toque", rarity: 2 },
  halo:      { slot: "hat", name: "Golden Halo", rarity: 3 },
  dicecrown: { slot: "hat", name: "Gambler's Crown", rarity: 4 },
  // trails
  bubbles:   { slot: "trail", name: "Bubbles", rarity: 0 },
  slime:     { slot: "trail", name: "Slop Slime", rarity: 0 },
  flies:     { slot: "trail", name: "Flies", rarity: 0, bad: true },
  loo:       { slot: "trail", name: "Loo Roll", rarity: 1, bad: true },
  hearts:    { slot: "trail", name: "Hearts", rarity: 1 },
  sparkle:   { slot: "trail", name: "Sparkles", rarity: 2 },
  rainbow:   { slot: "trail", name: "Rainbow", rarity: 2 },
  fire:      { slot: "trail", name: "Fire", rarity: 3 },
  money:     { slot: "trail", name: "Money Trail", rarity: 4 },
  // titles
  lucky:     { slot: "title", name: "Lucky Idiot", rarity: 0 },
  downbad:   { slot: "title", name: "Down Bad", rarity: 0, bad: true },
  owesvex:   { slot: "title", name: "Owes Vex Money", rarity: 1, bad: true },
  househ:    { slot: "title", name: "The House Always Wins", rarity: 1, bad: true },
  certified: { slot: "title", name: "Certified Gambler", rarity: 1 },
  degen:     { slot: "title", name: "The Degenerate", rarity: 2, special: true },
  bandit:    { slot: "title", name: "Blackjack Bandit", rarity: 2, special: true },
  shark:     { slot: "title", name: "Card Shark", rarity: 3, special: true },
  whale:     { slot: "title", name: "Whale", rarity: 3 },
  roller:    { slot: "title", name: "High Roller", rarity: 4, special: true },
};
export const FREE_HATS = ["none", "crown", "cowboy", "wizard", "horns", "flower"];

export function rollCosmetic(owned, opts = {}) {
  const pool = Object.keys(COSMETICS).filter((id) => !COSMETICS[id].special && !owned.has(id) && (!opts.bad || COSMETICS[id].bad));
  if (!pool.length) return null;
  const w = [40, 28, 18, 9, 3]; // rarity weights
  let total = 0; for (const id of pool) total += w[COSMETICS[id].rarity];
  let r = Math.random() * total;
  for (const id of pool) { r -= w[COSMETICS[id].rarity]; if (r <= 0) return id; }
  return pool[pool.length - 1];
}

// ---------------------------------------------------------------- the wheel
export const WHEEL = [
  { id: "jackpot", label: "JACKPOT 1000g", color: "#ffd34d", w: 1 },
  { id: "g150", label: "+150g", color: "#3fbf6f", w: 6 },
  { id: "lose", label: "Nothing", color: "#444", w: 7 },
  { id: "cos", label: "Cosmetic", color: "#c070ff", w: 8 },
  { id: "bj", label: "Blackjack", color: "#1f6f3a", w: 5 },
  { id: "g50", label: "+50g", color: "#2f8f4f", w: 8 },
  { id: "bankrupt", label: "BANKRUPT", color: "#b02020", w: 3 },
  { id: "crate", label: "Weapon", color: "#4da6ff", w: 5 },
  { id: "poker", label: "Poker", color: "#1f4f6f", w: 5 },
  { id: "ak", label: "AK-Maybe", color: "#ff4b4b", w: 2 },
  { id: "again", label: "2 more spins", color: "#ff9d2e", w: 3 },
  { id: "skill", label: "Skill point", color: "#9fe0ff", w: 3 },
];
export function spinWheel() {
  const total = WHEEL.reduce((a, s) => a + s.w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL[i].w; if (r <= 0) return i; }
  return 0;
}

// ---------------------------------------------------------------- cards
const RANKS = "23456789TJQKA";
export function deck() {
  const d = [];
  for (const s of "SHDC") for (const r of RANKS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
export function bjValue(cards) {
  let v = 0, aces = 0;
  for (const c of cards) { const r = c[0]; if (r === "A") { v += 11; aces++; } else v += "TJQK".includes(r) ? 10 : +r; }
  while (v > 21 && aces) { v -= 10; aces--; }
  return v;
}
const HAND_NAMES = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];
export function pokerScore(cards) { // returns [category, ...tiebreakers]
  const vals = cards.map((c) => RANKS.indexOf(c[0])).sort((a, b) => b - a);
  const counts = {}; for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straightHi = -1;
  if (uniq.length === 5) { if (uniq[0] - uniq[4] === 4) straightHi = uniq[0]; else if (uniq.join() === "12,3,2,1,0") straightHi = 3; }
  const tb = groups.map((g) => g[1]);
  if (straightHi >= 0 && flush) return [8, straightHi];
  if (groups[0][0] === 4) return [7, ...tb];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...tb];
  if (flush) return [5, ...vals];
  if (straightHi >= 0) return [4, straightHi];
  if (groups[0][0] === 3) return [3, ...tb];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...tb];
  if (groups[0][0] === 2) return [1, ...tb];
  return [0, ...vals];
}
export const handName = (cards) => HAND_NAMES[pokerScore(cards)[0]];
export function compareHands(a, b) {
  const x = pokerScore(a), y = pokerScore(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return Math.sign(d); }
  return 0;
}
// the dealer keeps anything paired or better, otherwise its two highest cards
export function dealerHolds(cards) {
  const s = pokerScore(cards);
  if (s[0] >= 4) return cards.map(() => true);
  if (s[0] >= 1) { const counts = {}; for (const c of cards) counts[c[0]] = (counts[c[0]] || 0) + 1; return cards.map((c) => counts[c[0]] > 1); }
  const top = [...cards].sort((a, b) => RANKS.indexOf(b[0]) - RANKS.indexOf(a[0])).slice(0, 2);
  return cards.map((c) => top.includes(c));
}
