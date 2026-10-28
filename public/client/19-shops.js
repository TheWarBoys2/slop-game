// Browser client, 19-shops: every shop gets its game's look (RE4's Merchant, Stardew's shops, a Fallout terminal, a
// Yakuza casino) on one shared layout: the list on the left, a card for whatever you point at on the right, and
// Shift-click for five. Talking to people (Stardew Valley): a portrait, hearts, and text that types itself out.
// The files in public/client/ are joined in order into /game.js (see server/net.js), inside one shared function.
// ---------------------------------------------------------------- shops
const SHOP_SKIN = { armoury: "merchant", general: "stardew", produce: "stardew", hearth: "pipboy", casino: "yakuza", club: "yakuza" };
const SHOP_HELLO = { armoury: "What are ya buyin'?", general: "Pierre would be jealous.", hearth: "VAULT-TEC APPROVED HEARTH TERMINAL", casino: "Feeling lucky?", club: "Members only. You're a member now." };
const shopCard = document.createElement("div");
shopCard.id = "shopcard";
function shopCardHtml(id, mine) {
  const it = SHOP[id]; if (!it) return "";
  const price = Math.round(it.cost * (1 - 0.1 * ((mine && mine.sk.haggler) || 0)));
  const body = GEAR[id] || ITEMS[id] ? bagCardHtml({ id, n: 1, r: 0 }) : `<div class="bt-h"><b>${escH(it.name)}</b><small>${escH(it.cat || "weapon")}</small></div>${it.desc ? `<div class="bt-f"><em>${escH(it.desc)}</em></div>` : ""}`;
  const short = mine ? price - mine.g : 0;
  return body + `<div class="sc-p"><b>${price}g</b>${short > 0 ? `<span class="poor">${short}g short</span>` : `<span>you'll have ${mine ? mine.g - price : 0}g left</span>`}</div>` +
    (ITEMS[id] ? `<div class="sc-k">Click to buy one · <kbd>Shift</kbd>+click for five</div>` : `<div class="sc-k">Click or press its number to buy</div>`);
}
function shopDress(mine) { // called at the end of renderShop
  const box = $("shop"), panel = box.querySelector(".panel");
  box.dataset.skin = SHOP_SKIN[shopSid] || "stardew";
  $("shopname").dataset.hello = SHOP_HELLO[shopSid] || "";
  if (shopCard.parentNode !== panel) panel.appendChild(shopCard);
  const rows = [...$("shopitems").querySelectorAll(".item:not(.tables)")];
  const show = (i) => { shopCard.dataset.id = shopList[i]; shopCard.innerHTML = shopCardHtml(shopList[i], mine); };
  rows.forEach((d, i) => {
    d.onmouseenter = () => show(i);
    if (ITEMS[shopList[i]]) d.onclick = (e) => { for (let n = e.shiftKey ? 5 : 1; n > 0; n--) send({ t: "buy", item: shopList[i] }); };
  });
  const cur = shopList.indexOf(shopCard.dataset.id); // keep the card you were looking at (its prices and your gold may have changed)
  if (shopList.length) show(cur >= 0 ? cur : 0); else shopCard.innerHTML = "";
}
// ---------------------------------------------------------------- talking (Stardew Valley)
let dlgType = null;
const NPC_FACE = { vex: "🧑‍🍳", haddock: "💂", lou: "🎩", giles: "👴", grubb: "🎖", morwen: "🧙", pell: "🧓" };
function dlgDress(e) { // called at the end of showDlg
  const box = $("dlg"), t = box.querySelector(".dl-t"); if (!t) return;
  const key = String(e.npc || e.name || "").toLowerCase(), face = Object.entries(NPC_FACE).find(([k]) => key.includes(k));
  let h = 0; for (const c of String(e.name || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  const p = document.createElement("div"); p.className = "dl-p";
  p.innerHTML = `<div class="dl-pf" style="background:hsl(${h} 35% 55%)">${face ? face[1] : escH(String(e.name || "?").trim()[0] || "?")}</div><div class="dl-pn">${escH(e.name || "")}</div>`;
  box.prepend(p);
  clearInterval(dlgType);
  const full = String(e.text || ""); let n = 0; t.textContent = ""; t.classList.add("typing");
  const done = () => { clearInterval(dlgType); dlgType = null; t.textContent = full; t.classList.remove("typing"); };
  dlgType = setInterval(() => { n += 2; if (n >= full.length) done(); else t.textContent = full.slice(0, n); }, 18);
  t.onclick = done; t.title = "Click to finish";
}
