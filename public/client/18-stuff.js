// Browser client, 18-stuff: the bag's item cards and right-click menu (Resident Evil 4), what the next skill rank does
// (Skyrim), and tracking a quest from the journal (Majora's Mask's Bombers' Notebook) into the objective tracker.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- the bag: hover card and right-click menu
const bagTip = document.createElement("div");
bagTip.id = "bagtip"; bagTip.className = "hidden";
document.body.appendChild(bagTip);
const bagMenuEl = document.createElement("div");
bagMenuEl.id = "bagmenu"; bagMenuEl.className = "hidden";
document.body.appendChild(bagMenuEl);
const GEAR_STATS = [["def", "damage taken", -1], ["rad", "radiation", -1], ["speed", "speed", 1], ["swim", "swim speed", 1], ["reload", "reload speed", 1], ["spread", "aim steadiness", 1], ["dirt", "gun dirt", -1]];
function bagCardHtml(it) {
  const g = GEAR[it.id], d = ITEMS[it.id], r = it.r || 0;
  if (g) {
    const worn = INV.gear[g.slot], wd = worn && GEAR[worn.id], eff = (x, rr) => (x > 0 ? x * (GEAR_MULT[rr] || 1) : x); // as gearDesc: rarity boosts the good side only
    const rows = GEAR_STATS.filter(([k]) => g[k] || (wd && wd[k])).map(([k, label, sign]) => {
      const a = eff(g[k] || 0, r), b = wd ? eff(wd[k] || 0, worn.r || 0) : 0, diff = Math.round((a - b) * 100); // higher is better for every one of these
      const good = diff === 0 ? "" : diff > 0 ? "up" : "down";
      return `<div class="bt-r"><span>${label}</span><b>${(sign < 0) === (a > 0) ? "-" : "+"}${Math.round(Math.abs(a) * 100)}%</b>${wd ? `<i class="${good}">${diff === 0 ? "=" : diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}</i>` : ""}</div>`;
    }).join("");
    return `<div class="bt-h" style="border-color:${RAR_COL[r]}"><b style="color:${RAR_COL[r]}">${escH(g.name)}</b><small>${RAR_NAME[r]} · ${SLOT_NAME[g.slot]}</small></div>${rows}` +
      `<div class="bt-f">${wd ? `vs your ${escH(wd.name)}` : `Nothing on your ${SLOT_NAME[g.slot].toLowerCase()} yet`}${g.desc ? `<br><em>${escH(g.desc)}</em>` : ""}</div>`;
  }
  if (!d) return `<div class="bt-h"><b>${escH(it.id)}</b></div>`;
  const need = (v, cur) => v ? ` <span class="${cur + v > 100 ? "dim" : "up"}">(you're at ${cur})</span>` : "";
  return `<div class="bt-h"><b>${d.icon} ${escH(d.name)}</b><small>${escH(d.kind || "item")}${it.n > 1 ? ` · ×${it.n}` : ""}</small></div>` +
    (d.f ? `<div class="bt-r"><span>food</span><b>+${d.f}</b>${need(d.f, INV.food)}</div>` : "") + (d.d ? `<div class="bt-r"><span>drink</span><b>+${d.d}</b>${need(d.d, INV.water)}</div>` : "") +
    (d.hp ? `<div class="bt-r"><span>heals</span><b>${d.hp > 500 ? "fully" : d.hp}</b></div>` : "") + (d.desc ? `<div class="bt-f"><em>${escH(d.desc)}</em></div>` : "");
}
function bagHover(el, i, on) {
  if (!on || !INV || !INV.bag[i]) { bagTip.classList.add("hidden"); return; }
  bagTip.innerHTML = bagCardHtml(INV.bag[i]); bagTip.classList.remove("hidden");
  const r = el.getBoundingClientRect(), z = UIS || 1; // the card is zoomed like every panel, so place it in its own units
  bagTip.style.left = `${Math.min(innerWidth - 260 * z, r.right + 8) / z}px`; bagTip.style.top = `${Math.max(8, Math.min(innerHeight - bagTip.offsetHeight * z - 8, r.top)) / z}px`;
}
function bagMenu(e, i) {
  e.preventDefault(); bagTip.classList.add("hidden");
  const it = INV && INV.bag[i]; if (!it) return;
  const g = GEAR[it.id], d = ITEMS[it.id], mineP = S && S.p.find((q) => q.id === me);
  const mate = mineP && S.p.find((q) => q.id !== me && !q.d && !q.air && Math.hypot(q.x - mineP.x, q.y - mineP.y) < 150);
  const acts = [[g ? "Wear" : d && d.kind === "seed" ? "Plant these next" : "Use", "use"], ...(mate ? [[`Give to ${mate.n}`, "give"]] : []), ["Drop", "drop"]];
  bagMenuEl.innerHTML = acts.map(([lbl, a]) => `<button data-a="${a}">${escH(lbl)}</button>`).join("");
  const z = UIS || 1;
  bagMenuEl.style.left = `${e.clientX / z}px`; bagMenuEl.style.top = `${e.clientY / z}px`; bagMenuEl.classList.remove("hidden");
  for (const b of bagMenuEl.querySelectorAll("button")) b.onclick = (ev) => { ev.stopPropagation(); send({ t: "item", a: b.dataset.a, i }); bagMenuEl.classList.add("hidden"); };
}
addEventListener("mousedown", (e) => { if (!bagMenuEl.contains(e.target)) bagMenuEl.classList.add("hidden"); }, true);
setInterval(() => { if (!invOpen) { bagTip.classList.add("hidden"); bagMenuEl.classList.add("hidden"); } }, 200);
// ---------------------------------------------------------------- skills: what the next rank does
// Every skill says "... per rank", so the numbers before that times your rank is what you have now.
function skillAt(desc, n) {
  const i = desc.indexOf(" per rank"); if (i < 0) return null;
  return desc.slice(0, i).replace(/(\d+(?:\.\d+)?)/g, (x) => String(Math.round(Number(x) * n * 10) / 10)) + desc.slice(i + 9);
}
function skillNote(id, mine) {
  const info = SKILL_INFO[id]; if (!info) return "";
  const [name, , desc, max] = info, r = mine.sk[id] || 0;
  const now = r ? skillAt(desc, r) : null, next = r < max ? skillAt(desc, r + 1) : null;
  return `<b>${escH(name)}</b> · rank ${r}/${max}` + (now ? `<div>Now: ${escH(now)}</div>` : "") + (next ? `<div class="sn-next">Next rank: ${escH(next)}</div>` : r >= max ? `<div class="sn-next">Mastered.</div>` : "") +
    (r < max ? `<div class="sn-k">${mine.pts > 0 ? "Click to learn it." : "Earn a skill point by levelling up."}</div>` : "");
}
// ---------------------------------------------------------------- journal: track a quest
let trackedQuest = null; // the quest's title (or an Adventure job's id) the objective tracker follows
function trackedObjective(mine) {
  if (!trackedQuest || !mine) return null;
  if (S.g.adv) { const q = S.g.adv.q.find((x) => x[0] === trackedQuest); if (!q) { trackedQuest = null; return null; } return [advIcon(q), q[2], q[3], [q[4], q[5]], "#ffe9a0"]; }
  const q = (mine.q || []).find((x) => x[0] === trackedQuest);
  if (!q || q[4]) { trackedQuest = null; return null; }
  return ["📜", q[0], `${q[1]} (${q[2]}/${q[3]})`, null, "#e0c0ff"];
}
function hookJournal() { // after renderJournal: a "track" button on every open quest
  const mine = S && S.p.find((p) => p.id === me); if (!mine) return;
  const list = S.g.adv ? S.g.adv.q.map((q) => [q[0], q[2]]) : (mine.q || []).filter((q) => !q[4]).map((q) => [q[0], q[0]]);
  const rows = $("journalBody").querySelectorAll(".jq:not(.done)");
  list.forEach(([key, title], i) => {
    const el = [...rows].find((r) => r.querySelector("b") && r.querySelector("b").textContent.includes(title)) || rows[i]; if (!el || el.querySelector(".jtrack")) return;
    const b = document.createElement("button"); b.className = "jtrack" + (trackedQuest === key ? " on" : ""); b.textContent = trackedQuest === key ? "◆ Tracking" : "◇ Track";
    b.onclick = (e) => { e.stopPropagation(); trackedQuest = trackedQuest === key ? null : key; renderJournal(); };
    el.prepend(b);
  });
}
