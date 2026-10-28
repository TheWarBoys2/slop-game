// Browser client, 14-controls: rebindable keys, the Controls list in Options, and the F1 cheat sheet.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- key bindings
// Every action keeps its default key inside the game code. A rebind just translates the key you press into the
// default one (bindKey), so nothing else needs to know keys can move. Mouse buttons and Esc stay where they are.
const ACTIONS = [ // [id, default key, what it does, group]
  ["fwd", "w", "Move forward", "Move"], ["left", "a", "Move left", "Move"], ["back", "s", "Move back", "Move"], ["right", "d", "Move right", "Move"],
  ["jump", " ", "Jump, double jump, climb", "Move"], ["dodge", "shift", "Sprint (hold), dodge roll (tap)", "Move"], ["crouch", "control", "Crouch, slide, dive", "Move"],
  ["reload", "r", "Reload (tap again on the mark for a quick reload)", "Fight"], ["prim", "1", "Pistol", "Fight"], ["sec", "2", "Primary gun", "Fight"],
  ["gren", "3", "Throw a grenade", "Fight"], ["molo", "4", "Throw a molotov", "Fight"], ["shout", "q", "Thu'um shout", "Fight"], ["ping", "u", "Ping: mark a spot, enemy or loot for your mates", "Fight"], ["elem", "z", "Change shout element", "Fight"],
  ["use", "e", "Use, talk, pick up", "Do"], ["eat", "h", "Eat or drink what you need most", "Do"], ["hoe", "f", "Hoe: till and plant", "Do"], ["build", "c", "Build mode", "Do"],
  ["mech", "p", "Call your mech", "Do"], ["clean", "l", "Strip and clean your gun", "Do"], ["view", "t", "First / third person", "Do"],
  ["wheel", "g", "Screens wheel (hold)", "Screens"], ["wheel2", "x", "Actions wheel (hold)", "Screens"], ["bag", "i", "Bag", "Screens"], ["journal", "j", "Journal", "Screens"],
  ["skills", "k", "Skills", "Screens"], ["market", "m", "Stock market", "Screens"], ["cards", "y", "Slop Snap", "Screens"], ["ballot", "n", "Ballot", "Screens"],
  ["ward", "v", "Wardrobe", "Screens"], ["opts", "o", "Options", "Screens"], ["buy", "b", "Buy menu (Dust II)", "Screens"], ["scores", "tab", "Scoreboard (hold)", "Screens"], ["chat", "enter", "Chat", "Screens"],
];
const FIXED_KEYS = new Set(["escape", "f1", "f8", "meta", "0", "5", "6", "7", "8", "9"]); // Esc backs out, F1 and F8 are help and bugs, 0 and 5-9 pick menu choices
const ACT = Object.fromEntries(ACTIONS.map(([id, def]) => [id, def]));
let BINDS = {}, REMAP = {};
try { BINDS = JSON.parse(localStorage.getItem("slop-keys") || "{}") || {}; } catch {}
function rebuildRemap() {
  REMAP = {};
  const now = Object.fromEntries(ACTIONS.map(([id, def]) => [id, BINDS[id] || def]));
  const used = new Set(Object.values(now));
  for (const [id, def] of ACTIONS) {
    const k = now[id]; if (k === def) continue;
    REMAP[k] = def;
    if (!used.has(def) && !/^[0-9]$/.test(def)) REMAP[def] = ""; // the old key does nothing now (number keys still pick menu choices)
  }
}
rebuildRemap();
const bindKey = (k) => (k in REMAP ? REMAP[k] : k);
const keyName = (k) => ({ " ": "Space", control: "Ctrl", shift: "Shift", tab: "Tab", enter: "Enter", alt: "Alt", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", backspace: "Backspace", capslock: "Caps", insert: "Ins", delete: "Del" }[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)));
const keyFor = (id) => keyName(BINDS[id] || ACT[id] || id); // what to print in a hint, e.g. `[${keyFor("use")}]`
function setBind(id, k) {
  const mine = BINDS[id] || ACT[id];
  const other = ACTIONS.find(([o, def]) => o !== id && (BINDS[o] || def) === k);
  if (other) BINDS[other[0]] = mine; // that key was taken: swap, so every action keeps a key
  BINDS[id] = k;
  for (const [o, def] of ACTIONS) if (BINDS[o] === def) delete BINDS[o];
  try { localStorage.setItem("slop-keys", JSON.stringify(BINDS)); } catch {}
  rebuildRemap();
}
let rebinding = null; // the action waiting for its new key
addEventListener("keydown", (e) => {
  if (!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const k = e.key.toLowerCase();
  if (k !== "escape" && !(FIXED_KEYS.has(k) || (/^[0-9]$/.test(k) && !/^[0-9]$/.test(ACT[rebinding])))) setBind(rebinding, k);
  rebinding = null; renderControls();
}, true);
function renderControls() {
  const el = $("o-controls"); if (!el) return;
  let h = "", grp = "";
  for (const [id, , label, g] of ACTIONS) {
    if (g !== grp) { grp = g; h += `<div class="ctl-g">${g}</div>`; }
    h += `<div class="ctl"><span>${label}</span><button class="cbtn alt ctl-k${rebinding === id ? " wait" : ""}${BINDS[id] ? " moved" : ""}" data-act="${id}">${rebinding === id ? "Press a key..." : keyFor(id)}</button></div>`;
  }
  el.innerHTML = h + `<div class="ctl-x"><span>Click a key to change it, then press the new one (Esc to keep it). A key that's already used swaps over. Mouse: click to shoot, right-click to aim, wheel to swap guns.</span><button class="cbtn alt" id="o-ctl-reset">Reset all keys</button></div>`;
  for (const b of el.querySelectorAll("[data-act]")) b.onclick = (e) => { e.stopPropagation(); rebinding = b.dataset.act; renderControls(); };
  $("o-ctl-reset").onclick = () => { BINDS = {}; try { localStorage.removeItem("slop-keys"); } catch {} rebuildRemap(); renderControls(); };
}
// ---------------------------------------------------------------- F1: every key for what you're doing right now
const sheet = document.createElement("div");
sheet.id = "keysheet"; sheet.className = "hidden";
document.body.appendChild(sheet);
function showKeySheet(on) {
  sheet.classList.toggle("hidden", !on);
  if (!on) return;
  const mine = S && S.p.find((p) => p.id === me), k = (id) => `<kbd>${keyFor(id)}</kbd>`;
  let now = "";
  if (building) now = `Building: click to place, <kbd>1</kbd>-<kbd>4</kbd> pick a piece, right-click, ${k("build")} or <kbd>Esc</kbd> to stop.`;
  else if (mine && mine.vh && S.vh.some((v) => v[0] === mine.vh && v[1] === "mech")) now = `In your mech: ${k("fwd")}${k("left")}${k("back")}${k("right")} walk, click the right arm, right-click the left arm, ${k("jump")} jump jets, ${k("use")} to climb out.`;
  else if (mine && mine.vh && flying()) now = `Flying: ${k("fwd")}${k("back")} nose down and up, ${k("left")}${k("right")} bank, mouse turns, ${k("jump")} / ${k("build")} climb and descend, click the chain gun, right-click rockets, ${k("use")} to get out.`;
  else if (mine && mine.vh) now = `Driving: ${k("fwd")}${k("left")}${k("back")}${k("right")} drive, ${k("use")} to get out.`;
  else if (S && S.g.ph === "lobby") now = `Lobby: ${k("hoe")} to ready up. Nothing you do here earns gold or XP.`;
  const groups = {};
  for (const [id, , label, g] of ACTIONS) (groups[g] = groups[g] || []).push(`<div class="ks-r">${k(id)}<span>${label}</span></div>`);
  sheet.innerHTML = `<div class="ks-h">Controls <small>let go of F1 to close · change them in Options ${k("opts")}</small></div>${now ? `<div class="ks-now">${now}</div>` : ""}` +
    `<div class="ks-cols">${Object.entries(groups).map(([g, rows]) => `<div><div class="ctl-g">${g}</div>${rows.join("")}</div>`).join("")}` +
    `<div><div class="ctl-g">Mouse</div><div class="ks-r"><kbd>Click</kbd><span>Shoot, swing, place</span></div><div class="ks-r"><kbd>Right</kbd><span>Aim down sights</span></div><div class="ks-r"><kbd>Wheel</kbd><span>Swap guns</span></div><div class="ks-r"><kbd>Middle</kbd><span>Ping</span></div><div class="ctl-g">Always</div><div class="ks-r"><kbd>Esc</kbd><span>Back out of anything</span></div><div class="ks-r"><kbd>F8</kbd><span>Ideas and bugs</span></div></div></div>`;
}
