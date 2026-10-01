// Slop Snap: a quick card game you play against the townsfolk.
// Three lanes, six turns. Each turn you get as much energy as the turn number and play cards into lanes.
// Both sides play at once, then the cards are revealed (yours first). Win two of the three lanes.

// r = rarity (0 starter, 1 common, 2 rare, 3 epic, 4 legendary). txt is what the card says it does.
export const CARDS = {
  shambler:  { name: "Shambler", cost: 1, pow: 2, r: 0, txt: "" },
  farmhand:  { name: "Farmhand", cost: 1, pow: 1, r: 0, txt: "On reveal: +1 power to another of your cards here." },
  crow:      { name: "Crow", cost: 1, pow: 1, r: 0, txt: "On reveal: draw a card." },
  turnip:    { name: "Prize Turnip", cost: 2, pow: 3, r: 0, txt: "" },
  pitchfork: { name: "Pitchfork Mob", cost: 2, pow: 2, r: 0, txt: "Ongoing: +1 power for each other card you have here." },
  runner:    { name: "Runner", cost: 2, pow: 3, r: 0, txt: "" },
  scarecrow: { name: "Scarecrow", cost: 3, pow: 2, r: 0, txt: "Ongoing: enemy cards here have -1 power." },
  keeper:    { name: "Hearth Keeper", cost: 3, pow: 4, r: 0, txt: "" },
  boomer:    { name: "Boomer", cost: 3, pow: 3, r: 0, txt: "On reveal: -2 power to every enemy card here." },
  tank:      { name: "Tank", cost: 4, pow: 7, r: 0, txt: "" },
  screamer:  { name: "Screamer", cost: 2, pow: 2, r: 1, txt: "On reveal: -1 power to every enemy card here." },
  raptor:    { name: "Raptor", cost: 2, pow: 2, r: 1, txt: "On reveal: +3 power if it's your only card here." },
  pell:      { name: "Old Pell", cost: 1, pow: 0, r: 1, txt: "Ongoing: +2 power for every card destroyed this game." },
  vex:       { name: "Vex", cost: 2, pow: 1, r: 1, txt: "On reveal: +2 energy next turn." },
  sniper:    { name: "Sniper", cost: 3, pow: 3, r: 1, txt: "On reveal: -3 power to a random enemy card anywhere." },
  grubb:     { name: "Mayor Grubb", cost: 3, pow: 2, r: 2, txt: "On reveal: +2 power to your other cards here." },
  morwen:    { name: "Morwen", cost: 4, pow: 3, r: 2, txt: "Ongoing: your other cards here have +1 power." },
  haddock:   { name: "Sgt Haddock", cost: 4, pow: 4, r: 2, txt: "On reveal: destroy the weakest enemy card here." },
  aldous:    { name: "Brother Aldous", cost: 3, pow: 3, r: 2, txt: "Ongoing: your cards here can't be destroyed." },
  gordon:    { name: "Gordon Rampage", cost: 4, pow: 5, r: 2, txt: "On reveal: -4 power to the strongest enemy card here. IT'S RAW." },
  david:     { name: "Sir David", cost: 2, pow: 2, r: 2, txt: "On reveal: draw two cards." },
  bear:      { name: "Bear Gritts", cost: 3, pow: 3, r: 2, txt: "On reveal: +1 power for each card in your hand." },
  warren:    { name: "Warren Muffett", cost: 3, pow: 3, r: 2, txt: "Ongoing: +4 power if you have more cards here than your opponent." },
  boulder:   { name: "The Boulder", cost: 5, pow: 9, r: 2, txt: "" },
  drowned:   { name: "The Drowned Mayor", cost: 5, pow: 4, r: 3, txt: "On reveal: destroy your other cards here. +4 power for each." },
  gunship:   { name: "Slop Gunship", cost: 5, pow: 8, r: 3, txt: "On reveal: -1 power to every enemy card in every lane." },
  rex:       { name: "T-Rex", cost: 6, pow: 10, r: 3, txt: "On reveal: destroy every enemy card here with 3 or less power." },
  golem:     { name: "Slop Golem", cost: 6, pow: 13, r: 3, txt: "" },
  posad:     { name: "Comrade Posad", cost: 5, pow: 3, r: 4, txt: "On reveal: every card here, on both sides, becomes 3 power." },
  nuke:      { name: "Tactical Nuke", cost: 6, pow: 0, r: 4, txt: "On reveal: destroy every other card here. Both sides." },
  leshen:    { name: "The Leshen", cost: 6, pow: 12, r: 4, txt: "Ongoing: your other cards here have +2 power." },
};
export const LOCS = {
  well:   { name: "The Old Well", txt: "Every card here has -1 power." },
  hearth: { name: "The Hearth", txt: "Every card here has +1 power." },
  casino: { name: "Vex's Casino", txt: "Cards played here get a random -2 to +3 power." },
  grave:  { name: "Pell's Graveyard", txt: "Only 2 cards per side." },
  lake:   { name: "The Lake", txt: "1-cost cards here have +2 power." },
  bunker: { name: "The Bunker", txt: "Cards here can't be destroyed or weakened." },
  pitch:  { name: "The Pitch", txt: "Whoever has more cards here gets +3." },
  field:  { name: "Open Field", txt: "Nothing special. Just mud." },
};
export const STARTER = ["shambler", "shambler", "farmhand", "crow", "turnip", "pitchfork", "runner", "runner", "scarecrow", "keeper", "boomer", "tank"];
export const DECK_SIZE = 12;
export const TURNS = 6;
// what each townsperson plays, and the cards you can win from them
export const OPPONENTS = {
  grubb:   { deck: ["grubb", "grubb", "farmhand", "crow", "turnip", "pitchfork", "vex", "keeper", "warren", "scarecrow", "tank", "boomer"], prize: ["grubb", "vex", "warren", "pitchfork"] },
  aldous:  { deck: ["aldous", "aldous", "keeper", "keeper", "farmhand", "crow", "turnip", "morwen", "runner", "scarecrow", "tank", "pell"], prize: ["aldous", "morwen", "pell"] },
  morwen:  { deck: ["morwen", "pell", "crow", "crow", "screamer", "scarecrow", "raptor", "pitchfork", "boomer", "drowned", "david", "tank"], prize: ["morwen", "screamer", "drowned", "david"] },
  vex:     { deck: ["vex", "vex", "sniper", "crow", "runner", "raptor", "warren", "gordon", "boomer", "tank", "gunship", "posad"], prize: ["vex", "sniper", "gunship", "posad"] },
  pell:    { deck: ["pell", "pell", "shambler", "shambler", "crow", "screamer", "haddock", "boomer", "drowned", "nuke", "keeper", "tank"], prize: ["pell", "drowned", "nuke"] },
  haddock: { deck: ["haddock", "haddock", "sniper", "sniper", "runner", "runner", "raptor", "tank", "boulder", "gunship", "rex", "scarecrow"], prize: ["haddock", "sniper", "rex", "raptor"] },
  chef:    { deck: ["gordon", "gordon", "turnip", "turnip", "farmhand", "pitchfork", "boomer", "keeper", "tank", "boulder", "golem", "crow"], prize: ["gordon", "golem"] },
  bear:    { deck: ["bear", "bear", "crow", "crow", "raptor", "raptor", "screamer", "keeper", "tank", "rex", "david", "runner"], prize: ["bear", "rex"] },
  boulder: { deck: ["boulder", "boulder", "tank", "tank", "runner", "runner", "turnip", "keeper", "golem", "haddock", "boomer", "shambler"], prize: ["boulder", "golem"] },
  david:   { deck: ["david", "david", "crow", "raptor", "raptor", "screamer", "pell", "morwen", "rex", "leshen", "keeper", "farmhand"], prize: ["david", "leshen", "raptor"] },
  warren:  { deck: ["warren", "warren", "vex", "vex", "grubb", "pitchfork", "farmhand", "keeper", "sniper", "tank", "gunship", "crow"], prize: ["warren", "gunship"] },
};
const PACK_ODDS = [[0, 0.3], [1, 0.38], [2, 0.22], [3, 0.08], [4, 0.02]];
export function packCard(bonus = 0) {
  let x = Math.random() - bonus;
  let r = 0; for (const [rr, pr] of PACK_ODDS) { x -= pr; if (x < 0) { r = rr; break; } r = rr; }
  const ids = Object.keys(CARDS).filter((k) => CARDS[k].r === r);
  return ids[(Math.random() * ids.length) | 0];
}

// ---------------------------------------------------------------- the match
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function newMatch(deckA, deckB) {
  const locs = shuffle(Object.keys(LOCS)).slice(0, 3);
  let uid = 1;
  const side = (deck) => ({ deck: shuffle(deck.map((id) => ({ id, uid: uid++ }))), hand: [], bonus: 0 });
  const M = { turn: 0, locs, lanes: [[[], []], [[], []], [[], []]], s: [side(deckA), side(deckB)], destroyed: 0, log: [], over: false, uid: 1000 };
  for (let i = 0; i < 3; i++) { draw(M, 0); draw(M, 1); }
  nextTurn(M);
  return M;
}
function draw(M, s) { const S = M.s[s]; if (S.deck.length && S.hand.length < 7) S.hand.push(S.deck.pop()); }
function nextTurn(M) {
  M.turn++;
  for (const s of [0, 1]) { if (M.turn > 1) draw(M, s); M.s[s].energy = M.turn + M.s[s].bonus; M.s[s].bonus = 0; }
}
export const cap = (M, l) => (M.locs[l] === "grave" ? 2 : 4);
const safe = (M, l) => M.locs[l] === "bunker";
function canDie(M, l, s) { return !safe(M, l) && !M.lanes[l][s].some((c) => c.id === "aldous" && c.on); }
function weaken(M, l, c, n) { if (!safe(M, l)) c.mod -= n; }
function destroy(M, l, s, c) {
  if (!canDie(M, l, s)) return false;
  const a = M.lanes[l][s], i = a.indexOf(c); if (i < 0) return false;
  a.splice(i, 1); M.destroyed++; M.log.push(`${CARDS[c.id].name} was destroyed`); return true;
}
// a card's power right now, with everything ongoing counted
export function cardPow(M, l, s, c) {
  const mine = M.lanes[l][s].filter((x) => x.on), theirs = M.lanes[l][1 - s].filter((x) => x.on), loc = M.locs[l];
  let v = CARDS[c.id].pow + c.mod;
  if (c.fixed !== undefined) v = c.fixed + c.mod;
  if (loc === "well") v -= 1;
  if (loc === "hearth") v += 1;
  if (loc === "lake" && CARDS[c.id].cost === 1) v += 2;
  for (const o of mine) if (o !== c) { if (o.id === "morwen") v += 1; if (o.id === "leshen") v += 2; }
  if (!safe(M, l)) for (const o of theirs) if (o.id === "scarecrow") v -= 1;
  if (c.id === "pitchfork") v += mine.length - 1;
  if (c.id === "pell") v += 2 * M.destroyed;
  if (c.id === "warren" && mine.length > theirs.length) v += 4;
  return v;
}
export function laneTotal(M, l, s) {
  const mine = M.lanes[l][s].filter((x) => x.on);
  let t = mine.reduce((a, c) => a + cardPow(M, l, s, c), 0);
  if (M.locs[l] === "pitch" && mine.length > M.lanes[l][1 - s].filter((x) => x.on).length) t += 3;
  return t;
}
function reveal(M, l, s, c) {
  c.on = true;
  const mine = M.lanes[l][s], theirs = M.lanes[l][1 - s].filter((x) => x.on), S = M.s[s];
  if (M.locs[l] === "casino") c.mod += -2 + ((Math.random() * 6) | 0);
  switch (c.id) {
    case "farmhand": { const o = mine.filter((x) => x !== c && x.on).sort((a, b) => cardPow(M, l, s, b) - cardPow(M, l, s, a))[0]; if (o) o.mod += 1; break; }
    case "crow": draw(M, s); break;
    case "david": draw(M, s); draw(M, s); break;
    case "boomer": for (const o of theirs) weaken(M, l, o, 2); break;
    case "screamer": for (const o of theirs) weaken(M, l, o, 1); break;
    case "raptor": if (mine.filter((x) => x.on).length === 1) c.mod += 3; break;
    case "vex": S.bonus += 2; break;
    case "sniper": { const all = []; for (let k = 0; k < 3; k++) for (const o of M.lanes[k][1 - s]) if (o.on) all.push([k, o]); if (all.length) { const [k, o] = all[(Math.random() * all.length) | 0]; weaken(M, k, o, 3); } break; }
    case "grubb": for (const o of mine) if (o !== c && o.on) o.mod += 2; break;
    case "haddock": { const o = theirs.slice().sort((a, b) => cardPow(M, l, 1 - s, a) - cardPow(M, l, 1 - s, b))[0]; if (o) destroy(M, l, 1 - s, o); break; }
    case "gordon": { const o = theirs.slice().sort((a, b) => cardPow(M, l, 1 - s, b) - cardPow(M, l, 1 - s, a))[0]; if (o) weaken(M, l, o, 4); break; }
    case "bear": c.mod += S.hand.length; break;
    case "drowned": { for (const o of mine.filter((x) => x !== c && x.on)) if (destroy(M, l, s, o)) c.mod += 4; break; }
    case "gunship": for (let k = 0; k < 3; k++) for (const o of M.lanes[k][1 - s]) if (o.on) weaken(M, k, o, 1); break;
    case "rex": for (const o of theirs) if (cardPow(M, l, 1 - s, o) <= 3) destroy(M, l, 1 - s, o); break;
    case "posad": if (!safe(M, l)) for (const side of [0, 1]) for (const o of M.lanes[l][side]) if (o.on) { o.fixed = 3; o.mod = 0; } break;
    case "nuke": if (!safe(M, l)) for (const side of [0, 1]) for (const o of M.lanes[l][side].slice()) if (o !== c && o.on) { const a = M.lanes[l][side]; a.splice(a.indexOf(o), 1); M.destroyed++; } break;
  }
}
// plays: [[uid, lane], ...]. Returns an error string, or null if it was legal (and the cards leave the hand).
export function stage(M, s, plays) {
  const S = M.s[s]; let e = S.energy; const room = [0, 1, 2].map((l) => cap(M, l) - M.lanes[l][s].length);
  const out = [];
  for (const [uid, l] of plays) {
    const c = S.hand.find((x) => x.uid === uid); if (!c || !(l >= 0 && l < 3)) return "That card isn't in your hand.";
    if (out.some((o) => o[0] === c)) return "You can only play a card once.";
    if (CARDS[c.id].cost > e) return "Not enough energy."; if (room[l] <= 0) return "That lane is full.";
    e -= CARDS[c.id].cost; room[l]--; out.push([c, l]);
  }
  for (const [c, l] of out) { S.hand.splice(S.hand.indexOf(c), 1); M.lanes[l][s].push({ id: c.id, uid: c.uid, mod: 0, on: false }); }
  S.staged = out.map(([c, l]) => [c.uid, l]);
  return null;
}
// both sides have staged: reveal everything, then move to the next turn or end the game
export function resolveTurn(M) {
  // the player's cards are revealed first, then the townsperson's
  for (const s of [0, 1]) for (const [uid, l] of M.s[s].staged || []) { const c = M.lanes[l][s].find((x) => x.uid === uid); if (c) reveal(M, l, s, c); }
  M.s[0].staged = M.s[1].staged = null;
  if (M.turn >= TURNS) { M.over = true; M.result = winner(M); return; }
  nextTurn(M);
}
export function winner(M) {
  let a = 0, b = 0, ta = 0, tb = 0;
  for (let l = 0; l < 3; l++) { const x = laneTotal(M, l, 0), y = laneTotal(M, l, 1); ta += x; tb += y; if (x > y) a++; else if (y > x) b++; }
  if (a !== b) return a > b ? 0 : 1;
  if (ta !== tb) return ta > tb ? 0 : 1;
  return -1;
}
// the townsfolk's brain: play the strongest things it can afford where they help most
export function aiPlays(M, s) {
  const S = M.s[s]; let e = S.energy; const plays = [], room = [0, 1, 2].map((l) => cap(M, l) - M.lanes[l][s].length);
  const hand = S.hand.slice().sort((a, b) => CARDS[b.id].cost - CARDS[a.id].cost || CARDS[b.id].pow - CARDS[a.id].pow);
  for (const c of hand) {
    if (CARDS[c.id].cost > e) continue;
    let best = -1, bs = -1e9;
    for (let l = 0; l < 3; l++) {
      if (room[l] <= 0) continue;
      const diff = laneTotal(M, l, s) - laneTotal(M, l, 1 - s);
      let sc = -Math.abs(diff - 2) + Math.random() * 3; // favour close lanes it can tip
      if (c.id === "nuke" || c.id === "boomer" || c.id === "rex" || c.id === "haddock" || c.id === "gordon") sc += M.lanes[l][1 - s].length * 3;
      if (c.id === "drowned" || c.id === "grubb" || c.id === "morwen" || c.id === "leshen" || c.id === "pitchfork") sc += M.lanes[l][s].length * 2;
      if (c.id === "raptor") sc += M.lanes[l][s].length ? -6 : 4;
      if (M.locs[l] === "lake" && CARDS[c.id].cost === 1) sc += 3;
      if (sc > bs) { bs = sc; best = l; }
    }
    if (best < 0) continue;
    plays.push([c.uid, best]); e -= CARDS[c.id].cost; room[best]--;
  }
  return plays;
}
// what a player is allowed to see: their own hand, but not the opponent's, and not unrevealed enemy cards
export function view(M, s) {
  const lane = (l, side) => M.lanes[l][side].filter((c) => side === s || c.on).map((c) => [c.id, c.on ? cardPow(M, l, side, c) : CARDS[c.id].pow, c.uid, c.on ? 1 : 0]);
  return {
    turn: M.turn, turns: TURNS, locs: M.locs, energy: M.s[s].energy, hand: M.s[s].hand.map((c) => [c.id, c.uid]), opHand: M.s[1 - s].hand.length,
    deck: M.s[s].deck.length, lanes: [0, 1, 2].map((l) => [lane(l, s), lane(l, 1 - s), laneTotal(M, l, s), laneTotal(M, l, 1 - s)]),
    over: M.over, result: M.over ? (M.result === s ? "win" : M.result === -1 ? "draw" : "lose") : null, log: M.log.slice(-4),
  };
}
// the deck a player brings: their chosen 12, or the best of what they own
export function deckFor(coll, chosen) {
  const have = { ...coll }, out = [];
  for (const id of chosen || []) if (have[id] > 0 && CARDS[id] && out.length < DECK_SIZE) { have[id]--; out.push(id); }
  const rest = []; for (const [id, n] of Object.entries(have)) for (let i = 0; i < n; i++) if (CARDS[id]) rest.push(id);
  rest.sort((a, b) => CARDS[b].r - CARDS[a].r || CARDS[b].pow / Math.max(1, CARDS[b].cost) - CARDS[a].pow / Math.max(1, CARDS[a].cost));
  while (out.length < DECK_SIZE && rest.length) out.push(rest.shift());
  return out;
}
