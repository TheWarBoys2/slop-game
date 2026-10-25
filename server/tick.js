// The game loop: one tick of the whole world.
import { BOSSES } from "../story.js";
import { NPCS, QUESTS } from "../npcs.js";
import { COSMETICS } from "../casino.js";
import { LEGENDS, legendOf } from "../legend.js";
import { GEAR, SLOTS, gearSum, CROPS, CROP_KEYS } from "../items.js";
import { SYMS, marketTick } from "../market.js";
import { mechCode } from "../bugs.js";
import { WEAPONS, ZTYPES } from "../data.js";
import { boostZombies, elemsFor, moveTick, navGoal, till } from "./actions.js";
import { advTick, advView } from "./adventure.js";
import { bugAct, bugTick } from "./bugnight.js";
import { buildTick, hurtPiece, rectHitsCircle } from "./building.js";
import { DIRT, bile, fireTick, fires, hurtPlayer, hurtZombie, kick, killPlayer, podLand, projTick, reloadTick, respawnHeir, shoot, solved, startReload } from "./combat.js";
import { COUNTDOWN, FAST, H, HEARTH, INFECT, MV, NIGHT_LEN, SNAP_EVERY, STORY_ZONE_R, TICK_RATE, W, clamp, dist2, now, rand } from "./config.js";
import { disasterTick } from "./disasters.js";
import { dustTick, dustView } from "./dust.js";
import { clubTick, invMsg, questReady, resolveElection } from "./economy.js";
import { BH, BW, OPEN, mapMsg, near, npcTick } from "./geometry.js";
import { OFFICES } from "./hacking.js";
import { BALL, LAKE, LAKE_SOLID, PITCH, PLOTS, cropPrice, damageWall, seedCount, sendWallChanges } from "./map.js";
import { bugView, mechView } from "./mechs.js";
import { addRad, addStress, ballTick, cure, infect, needs, nextSymptom, stress } from "./needs.js";
import { spectators } from "./net.js";
import { nukeBlast } from "./nukes.js";
import { beginPlay, endGame, nightType, spawnZombie, startDay, startGame, startNight } from "./phases.js";
import { dropPos, endRoyale, jump, outsideZone, zoneTick } from "./royale.js";
import { clueText, mainQuest, npcApi, resolveVote, sendCards, sendDlg } from "./social.js";
import { PIECES, VEHICLES, attList, collide, crouched, freeSpot, fullName, game, magOf, maxHp, players, sk, speedOf, spreadOf, toast, wName, wading, xpNeed, zCode, zHeight } from "./state.js";
import { breathe, vehOf, vehicleTick } from "./vehicles.js";
import { ensureChunks, wildTick } from "./wild.js";
import { world } from "./world.js";
import { rules } from "./modes.js";

// ---------------------------------------------------------------- tick
world.lastT = now();
export let tickN = 0;
export function tick() {
  const t = now();
  const dt = Math.min(0.1, t - world.lastT);
  world.lastT = t;
  tickN++;

  // lobby: the game starts once everyone is ready
  if (game.phase === "lobby" || game.phase === "over") {
    const all = players.size > 0 && (game.force || [...players.values()].every((p) => p.ready)); // or the host said go
    if (!all) game.countdown = 0;
    else if (!game.countdown) { game.countdown = t + COUNTDOWN; world.events.push({ k: "cd" }); }
    else if (t >= game.countdown) startGame();
  }
  if (game.phase === "intro" && (t >= game.introEnds || (players.size && [...players.keys()].every((id) => game.skip.has(id))))) beginPlay();
  // phase clock + votes
  if (game.phase === "day" && t > game.ends) startNight();
  else if (game.phase === "night" && t > game.ends) startDay();
  if (game.vote && t > game.vote.ends + 1) resolveVote(); // normally counted at dusk (startNight)
  if (game.elec && t > game.elec.ends + 1) resolveElection();
  if (game.nuke && t >= game.nuke.at) nukeBlast();
  if (tickN % TICK_RATE === 0 && game.phase !== "royale") marketTick(game.market);
  if (game.story && t > game.story.until) game.story = null;
  zoneTick(t);
  if (tickN % 10 === 0) ensureChunks();
  if (tickN % 45 === 0) wildTick(t);
  if (tickN % 10 === 5 && game.mode === "adventure") advTick(t);
  if (tickN % 10 === 7 && game.bugs) bugTick(t);
  if (game.phase === "day" || game.phase === "night") dustTick(t, dt);
  if (OPEN() && game.phase === "day" && !game.duskWarned && game.ends - t < 25 && game.zone) { // the fog comes for the wild at night
    game.duskWarned = true;
    const R = STORY_ZONE_R[Math.min(game.night + 1, STORY_ZONE_R.length - 1)];
    for (const p of players.values()) if (!p.dead && (p.x - game.zone.cx) ** 2 + (p.y - game.zone.cy) ** 2 > R * R) { toast(p, "Night is coming. The slop fog will swallow the wild. Get back to town!", "#c080ff"); p.pe.push({ k: "dusk" }); }
  }
  if (game.phase === "royale") {
    const target = 16 + 4 * players.size;
    if (world.zombies.length < target && Math.random() < dt * 1.5) {
      const r = Math.random();
      const z = spawnZombie(r < 0.08 ? "tank" : r < 0.14 ? "charger" : r < 0.2 ? "flyer" : r < 0.25 ? "boomer" : r < 0.5 ? "runner" : "walker");
      const sp = freeSpot(30); z.x = sp.x; z.y = sp.y; z.arson = false;
      if ([...players.values()].some((p) => !p.dead && dist2(p, z) < 500 * 500)) z.hp = 0;
    }
    const left = [...players.values()].filter((p) => !p.out);
    if (((game.royaleN || players.size) > 1 && left.length <= 1) || left.length === 0) endRoyale(); // the last one standing wins even if the rest quit
  }
  if (tickN % 30 === 0) for (const p of players.values()) for (const [id, qs] of Object.entries(p.q)) {
    if (!qs.done && !qs.told && npcApi.progress(p, id) >= QUESTS[id].goal) { qs.told = true; toast(p, `Quest complete: ${QUESTS[id].title}. Go and see ${NPCS[QUESTS[id].npc].name}.`, "#e0c0ff"); }
  }
  if (game.phase === "night" && game.spawnLeft > 0 && t > game.spawnNext) {
    const kind = nightType(game.night, game.fog);
    if (kind === "raptor") { const z = spawnZombie("raptor"); spawnZombie("raptor", z); if (game.spawnLeft > 1) { spawnZombie("raptor", z); game.spawnLeft--; } game.spawnLeft--; } // packs
    else spawnZombie(kind);
    if (game.dino && !game.dinoRex && game.spawnLeft < game.spawnTotal * 0.5) { game.dinoRex = true; const rx = spawnZombie("rex"); const k = (0.6 + 0.4 * players.size) / 2.2; rx.hp *= k; rx.maxHp *= k; world.events.push({ k: "banner", text: "T. REX", sub: "It's coming for the Hearth. Storm is super effective." }); }
    game.spawnLeft--;
    const len = game.ends === Infinity ? 50 : NIGHT_LEN * 0.8;
    game.spawnNext = t + len / Math.max(10, game.spawnLeft + 10) * 0.9;
    if (game.ends === Infinity && game.spawnLeft === 0) game.spawnLeft = 12; // endless trickle while the boss lives
  }
  if (game.phase === "day" && game.dinoDay && t > game.dinoNext) { // dinosaur day: packs roam the valley in daylight (the sun doesn't bother them)
    game.dinoNext = t + (FAST ? 4 : 22);
    const cap = Math.min(15, 3 + 3 * players.size), live = world.zombies.filter((z) => z.type === "raptor" && !z.wild).length;
    if (live + 3 <= cap) { const z = spawnZombie("raptor"); spawnZombie("raptor", z); spawnZombie("raptor", z); }
  }
  if ((game.phase === "day" || game.phase === "night") && game.mods.hearthRegen) game.hearth = Math.min(game.hearthMax, game.hearth + game.mods.hearthRegen * dt);

  const playing = game.phase === "day" || game.phase === "night" || game.phase === "royale";
  if (playing) ballTick(t, dt);
  if (playing) { vehicleTick(t, dt); buildTick(t); projTick(t, dt); fireTick(t, dt); disasterTick(t, dt); }
  if (playing && world.NPC_POS.length) npcTick(t, dt);

  // players
  const alive = [...players.values()].filter((p) => !p.dead && !p.air);
  for (const p of players.values()) {
    if (p.dead) { if (game.phase !== "over" && game.phase !== "intro" && !p.out && rules().respawn && t > p.respawnAt) respawnHeir(p); continue; }
    if (p.air === "wait") continue;
    if (p.air === "bunker") { p.food = Math.max(10, p.food - dt * 0.05); continue; } // safe, and bored
    if (p.air === "plane") {
      const pos = dropPos(t); p.x = pos.x; p.y = pos.y; p.z = 700;
      if (pos.k >= 0.97) jump(p);
      continue;
    }
    if (p.air === "fall") {
      let fx = ((p.keys & 8) ? 1 : 0) - ((p.keys & 2) ? 1 : 0), fy = ((p.keys & 4) ? 1 : 0) - ((p.keys & 1) ? 1 : 0);
      if (fx && fy) { fx *= Math.SQRT1_2; fy *= Math.SQRT1_2; }
      if (OPEN()) { p.x += fx * 420 * dt; p.y += fy * 420 * dt; } else { p.x = clamp(p.x + fx * 420 * dt, 30, W - 30); p.y = clamp(p.y + fy * 420 * dt, 30, H - 30); }
      p.z = Math.max(0, (p.pod ? 900 : 700) * clamp((p.fallEnd - t) / (p.fallDur || 2.2), 0, 1));
      if (t > p.fallEnd) { p.air = null; p.fallDur = 0; collide(p, 16); p.z = MV.floorAt(p.x, p.y, 10, 2000, near(p)).h; p.vz = 0; p.vx = p.vy = 0; p.gr = true; world.events.push({ k: "land", x: p.x, y: p.y }); if (p.pod) podLand(p); }
      continue;
    }
    if (outsideZone(p) && (game.phase === "night" || game.phase === "royale")) {
      p.hp -= (game.mode === "royale" ? game.zone.dmg : 6) * dt; p.lastHurt = t;
      if (tickN % 15 === 0) p.pe.push({ k: "fog" });
      if (p.hp <= 0) killPlayer(p, null, "lost in the slop fog");
      if (p.dead) continue;
    }
    if (p.dlg && p.dlg.adv) { if (dist2(p.dlg.at, p) > 170 * 170) { p.dlg = null; sendDlg(p); } }
    else if (p.dlg) { const n = world.NPC_POS.find((q) => q.id === p.dlg.npc); if (!n || dist2(n, p) > 150 * 150) { p.dlg = null; sendDlg(p); } }
    if (!Number.isFinite(p.gold)) p.gold = 0; // backstop: NaN gold would make every price check pass
    if (p.cg && !world.NPC_POS.some((q) => q.id === p.cg.npc)) { toast(p, "Your opponent has left. The game's off; you get your stake back.", "#bbb"); if (!p.cg.M.over) p.gold += p.cg.stake; p.cg = null; sendCards(p); }
    if (playing) {
      needs(p, dt, t); stress(p, dt, t); clubTick(p, t, dt);
      if (p.inf) { if (t > p.inf.until) cure(p, "The infection passes. You feel almost normal."); else if (t > p.inf.next) nextSymptom(p); }
    }
    const veh = vehOf(p);
    if (p.veh && !veh) p.veh = 0;
    if (!veh) {
      if (p.stam === undefined) p.stam = 100;
      const ev = MV.step(p, { keys: p.keys, yaw: p.my ?? p.a }, dt, { sp: speedOf(p), boxes: near(p), W: BW(), H: BH(), frozen: t < p.going || !!p.dlg || !!p.cg || t < p.frozen || game.phase === "lobby", canSprint: !p.firing && !p.ads, stam: p.stam, wrLen: 0.9 + 0.2 * sk(p, "fleet"), airJumps: 1 });
      if (ev === "pad") world.events.push({ k: "pad", x: Math.round(p.x), y: Math.round(p.y) });
      else if (ev) world.events.push({ k: "mv", id: p.id, m: ev, x: Math.round(p.x), y: Math.round(p.y) }); // so everyone hears the slide, the boost, the wall jump
      moveTick(p, t, dt);
      breathe(p, t, dt);
      if (p.z > 1400) p.z = 1400;
    } else { p.z = (veh.z || 0) + (VEHICLES[veh.kind].mech ? (veh.seats[1] === p.id ? 72 : 0) : veh.seats[1] === p.id ? 8 : VEHICLES[veh.kind].air ? 4 : 0); p.vz = 0; p.vx = 0; p.vy = 0; p.gr = !VEHICLES[veh.kind].air || !veh.z; }
    p.heat = Math.max(0, p.heat - 1.6 * dt);
    const mh = maxHp(p);
    if (sk(p, "wind") && t - p.lastHurt > 3) p.hp = Math.min(mh, p.hp + 1.5 * sk(p, "wind") * dt);
    if (sk(p, "rally")) for (const q of alive) if (q !== p && dist2(q, p) < 220 * 220) q.hp = Math.min(maxHp(q), q.hp + 0.8 * sk(p, "rally") * dt);
    if (p.hp > mh) p.hp = mh;
    const w = p.weapons[p.active];
    w.bloom = Math.max(0, w.bloom - dt * 2.2);
    reloadTick(p, w, t);
    if (w.chargeAt && (!p.firing || w.ammo <= 0 || w.reloadUntil)) w.chargeAt = 0; // let go and the charge fizzles
    if (p.hoeOut && (!p.hoe || p.veh || p.swim)) p.hoeOut = false;
    if (p.firing && p.hoeOut && !p.dlg && t >= (p.tillAt || 0)) { p.tillAt = t + 0.5; till(p); } // the hoe's out: clicking digs, it doesn't shoot
    else if (p.firing && !p.sprint && !(t < (p.sprintAt || 0) + 0.12) && !p.dlg && !p.cg && !p.cleaning && !(t < p.going) && !(t < p.meltdown) && !(veh && veh.seats[0] === p.id) && playing && t >= w.nextShot) {
      if (w.reloadUntil) { /* busy reloading */ }
      else if (w.jam) { w.nextShot = t + 0.4; p.pe.push({ k: "click" }); }
      else if (w.ammo > 0 && WEAPONS[w.type].charge && !(w.chargeAt && t - w.chargeAt >= WEAPONS[w.type].charge)) {
        if (!w.chargeAt) { w.chargeAt = t; world.events.push({ k: "lcharge", id: p.id, x: Math.round(p.x), y: Math.round(p.y) }); }
      }
      else if (w.ammo > 0) {
        w.chargeAt = 0;
        shoot(p, w);
        w.dirt = Math.min(100, (w.dirt || 0) + (DIRT[w.type] || 0) * (game.phase === "lobby" ? 0 : 1) * (1 - Math.min(0.8, gearSum(p.gear, "dirt"))));
        const jam = w.dirt < 40 ? 0 : Math.min(0.1, ((w.dirt - 40) / 60) ** 2 * 0.1);
        if (w.ammo > 0 && Math.random() < jam) { w.jam = true; p.pe.push({ k: "jammed" }); }
      }
      else { startReload(p, w); p.pe.push({ k: "click" }); }
    }
  }

  // plots
  for (const pl of PLOTS) {
    if (pl.stage === 0 || pl.stage === 3) continue;
    pl.prog += dt * pl.rate / (13 * (CROPS[pl.crop || "turnip"].t));
    if (pl.prog >= 1) { pl.prog = 0; pl.stage++; }
  }

  // zombies
  const hc = { x: HEARTH.x + HEARTH.w / 2, y: HEARTH.y + HEARTH.h / 2 };
  const B = BOSSES[game.bossKind];
  boostZombies(t);
  for (const z of world.zombies) {
    const def = ZTYPES[z.type];
    if (z.burn) { z.hp -= z.maxHp * 0.35 * dt; if (Math.random() < dt * 3) world.events.push({ k: "burn", x: z.x, y: z.y }); continue; }
    // 'arson' zombies beeline for the Hearth and only get distracted by players right next to them
    let target = null, bd = (z.type === "boss" || z.type === "elite" || z.type === "flyer" || z.type === "brain" ? 700 : z.type === "bug" || z.type === "tanker" ? 1e5 : z.type === "spitter" ? 560 : z.arson ? 110 : 420) ** 2; // bugs hunt people, wherever they are
    // bile and screams make you the only thing worth eating
    for (const p of alive) { let d = dist2(p, z); if (p.bile > t || (z.aggro === p.id && t < z.aggroUntil)) d /= 25; if (d < bd) { bd = d; target = p; } }
    if (target) bd = dist2(target, z);
    if (!target && !rules().hearth) { if (!z.wander || dist2(z, z.wander) < 900 || Math.random() < dt * 0.1) z.wander = freeSpot(20); }
    if (!target && z.wild) { if (!z.wander || dist2(z, z.wander) < 900 || Math.random() < dt * 0.1) z.wander = { x: z.x + rand(-400, 400), y: z.y + rand(-400, 400) }; } // shambling about in the wild
    let goal = target || (!rules().hearth || z.wild ? z.wander : hc);
    if (z.route) { // Dust II's terrorists walk their route to the site; the one with the bomb never stops for you
      while (z.route.length > 1 && dist2(z, z.route[0]) < 70 * 70) z.route.shift();
      if (z.bomb || !target || bd > 300 * 300) { goal = z.route[0]; if (z.bomb) target = null; }
    }
    // indoors and underground: follow the stairs and tunnels instead of scraping at a wall
    if (target && rules().hearth && z.type !== "flyer") {
      if ((tickN + z.id) % 15 === 0) z.nav = navGoal(z, target);
      else if (z.nav && (z.nav.x - z.x) ** 2 + (z.nav.y - z.y) ** 2 < (z.r + 20) ** 2 && Math.abs(z.nav.z - (z.z || 0)) < 46) z.nav = navGoal(z, target); // on to the next waypoint straight away
    } else { z.nav = null; z.navI = -1; }
    if (z.nav) goal = z.nav;
    let dx = goal.x - z.x, dy = goal.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (z.steer) { const c = Math.cos(z.steer), s = Math.sin(z.steer); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
    let sp = (z.type === "boss" ? B.speed : def.speed) * (z.type === "runner" ? 1 : 1 + 0.03 * Math.min(game.night, 12));
    if (z.type !== "flyer" && wading(z)) sp *= 0.6;
    if ((z.type === "boss" || z.type === "elite") && t < z.charge) sp = 380;
    if (z.type === "charger") {
      // wind up, then a straight-line charge that sends people flying. Hitting a wall stuns it.
      if (!z.wind && !(t < z.charge) && target && bd < 420 * 420 && t > z.special && Math.abs(target.z - z.z) < 80) { z.wind = t + 0.7; world.events.push({ k: "roar", x: z.x, y: z.y, small: 1 }); }
      if (z.wind && t < z.wind) { sp = 0; if (target) z.chDir = Math.atan2(target.y - z.y, target.x - z.x); }
      else if (z.wind) { z.wind = 0; z.charge = t + 1.1; z.special = t + 6; }
      if (t < z.charge) { dx = Math.cos(z.chDir); dy = Math.sin(z.chDir); sp = 560; }
    }
    z.fx = dx; z.fy = dy; // which way it's facing, for shots in the back
    if (z.type === "screamer" && target && bd < 280 * 280) { dx = -dx; dy = -dy; sp *= 0.8; } // keeps its distance
    if (z.type === "raptor" && target && z.gr && t > z.special && bd < 190 * 190 && bd > 50 * 50 && !(t < z.stun)) {
      // pounce
      z.special = t + rand(2.5, 3.5); z.pounce = t + 1;
      const d = Math.sqrt(bd); z.vx = (target.x - z.x) / d * 480; z.vy = (target.y - z.y) / d * 480; z.vz = 360; z.gr = false;
      world.events.push({ k: "roar", x: z.x, y: z.y, small: 1 });
    }
    if (z.type === "raptor" && t < z.pounce) sp *= 0.3;
    if (z.type === "rex" && target && t > z.special && bd < 320 * 320) {
      // ROAR: everyone nearby freezes up for a moment
      z.special = t + 9; z.stun = t + 0.9;
      world.events.push({ k: "roar", x: z.x, y: z.y, rex: 1 });
      for (const q of alive) if (dist2(q, z) < 340 * 340) { q.frozen = t + 0.8; addStress(q, 12); q.pe.push({ k: "deaf" }); }
    }
    if (z.bug) { const act = bugAct(z, target, bd, t, alive, hc); if (act === 1) sp = 0; else if (act === -1) { dx = -dx; dy = -dy; } }
    if (t < z.stun) sp = 0;
    else if (t < (z.slowUntil || 0)) sp *= 0.5; // cryo rounds
    if (t < z.frozen) { z.atk = Math.max(z.atk, z.frozen); }
    const ox = z.x, oy = z.y;
    if (t < (z.kd || 0)) sp = 0; // knocked flat by a slide
    z.x += (dx * sp + z.vx) * dt; z.y += (dy * sp + z.vy) * dt;
    z.vx *= Math.pow(0.03, dt); z.vy *= Math.pow(0.03, dt);
    const touchingHearth = rules().hearth && z.z < HEARTH.z1 && z.x + z.r > HEARTH.x - 4 && z.x - z.r < HEARTH.x + HEARTH.w + 4 && z.y + z.r > HEARTH.y - 4 && z.y - z.r < HEARTH.y + HEARTH.h + 4;
    // the dead climb: walls, roofs, towers. Not trees, not the Hearth, not your barricades (those they chew).
    const hit = MV.pushOut(z, z.r, near(z), BW(), BH(), z.z, zHeight(z));
    if (z.type !== "flyer" && (z.z || 0) > -8 && LAKE_SOLID.length) MV.pushOut(z, z.r, LAKE_SOLID, BW(), BH(), 0, 10); // the dead don't swim
    if ((z.z || 0) < -60 && z.type !== "boss" && LAKE && MV.lakeAt([LAKE], z.x, z.y)) hurtZombie(z, z.maxHp * 0.04 * dt, null, ""); // ...but they do drown, slowly (in the lake; the tunnels are dry)
    if (hit && hit.kind === "glass") damageWall(hit, 5); // and they come through windows
    if ((z.type === "charger" || z.type === "boss" || z.type === "rex") && t < z.charge && hit && hit !== "edge") damageWall(hit, z.type === "charger" ? 90 : 220);
    if (z.type === "charger" && t < z.charge && hit && hit !== "edge") { z.charge = 0; z.stun = t + 1.6; world.events.push({ k: "boom", x: z.x, y: z.y, z: z.z, r: 40, dust: 1 }); }
    if (z.type === "flyer") {
      // flyers circle high, then dive on whoever they're after
      const hd = target ? Math.hypot(target.x - z.x, target.y - z.y) : Infinity;
      const floor = MV.floorAt(z.x, z.y, z.r, 2000, near(z)).h;
      const want = target ? (hd < 180 ? target.z + 16 : Math.max(floor + 110, target.z + 110)) : touchingHearth || Math.hypot(hc.x - z.x, hc.y - z.y) < 120 ? 50 : floor + 140;
      z.z += clamp(want - z.z, -300 * dt, 220 * dt); z.z = Math.max(z.z, floor);
      z.vz = 0; z.gr = false;
    } else {
      const climbable = hit && hit !== "edge" && hit.kind !== "tree" && hit.kind !== "hearth" && hit.kind !== "built" && !hit.noclimb; // they can't scale the offices or the big houses: those have doors and windows
      if (climbable && (!target || target.z > z.z + 10 || Math.random() < 0.6)) z.vz = Math.max(z.vz, z.type === "runner" ? 220 : z.type === "walker" || z.type === "screamer" ? 130 : 80);
      else if (hit && !touchingHearth) {
        const moved = Math.hypot(z.x - ox, z.y - oy);
        if (moved < sp * dt * 0.4) z.steer = z.steer ? z.steer : (Math.random() < 0.5 ? 1.2 : -1.2);
      } else if (z.steer && Math.random() < dt * 0.8) z.steer = 0;
      MV.vertical(z, dt, near(z), z.r * 0.8, zHeight(z));
    }
    if (t > z.atk && world.builds.length && !(target && Math.sqrt(bd) < z.r + 20 && Math.abs(target.z - z.z) < 60)) {
      const piece = world.builds.find((b) => PIECES[b.bk].solid && rectHitsCircle(b, z, z.r + 6));
      if (piece) { hurtPiece(piece, def.dmg * (z.type === "boss" ? 3 : 1)); z.atk = t + 0.8; }
    }
    if (z.type === "rex" && hit && hit !== "edge") damageWall(hit, 350 * dt); // it walks through things
    if (z.type === "raptor" && t < z.pounce && !z.gr) for (const q of alive) if (dist2(q, z) < (z.r + 22) ** 2 && Math.abs(q.z - z.z) < 60) {
      hurtPlayer(q, 14, null, "eaten by a velociraptor"); q.frozen = t + 0.3; z.pounce = 0; z.atk = t + 0.8;
    }
    if (z.type === "charger" && t < z.charge) {
      for (const q of alive) if (dist2(q, z) < (z.r + 22) ** 2 && Math.abs(q.z - z.z) < 60) {
        hurtPlayer(q, def.dmg * 1.3, null, "flattened by a charger");
        kick(q, Math.cos(z.chDir) * 620, Math.sin(z.chDir) * 620, 330);
        z.charge = 0; z.stun = t + 0.9; z.atk = t + 1;
      }
    }
    if (z.type === "boomer" && target && t > z.special && bd < 110 * 110 && Math.abs(target.z - z.z) < 60) { z.special = t + 7; bile(target.x, target.y, target.z, 60); z.atk = t + 1; }
    if (z.type === "screamer" && t > z.special && target && bd < 700 * 700) {
      // SCREAM: help arrives, and everything nearby goes for whoever it saw
      z.special = t + 16;
      world.events.push({ k: "scream", x: Math.round(z.x), y: Math.round(z.y), z: Math.round(z.z) });
      for (const o of world.zombies) if (o !== z && dist2(o, z) < 700 * 700) { o.aggro = target.id; o.aggroUntil = t + 8; }
      if (world.zombies.length < 120) for (let i = 0; i < Math.ceil(players.size / 2); i++) spawnZombie("runner", z);
      for (const q of alive) if (dist2(q, z) < 380 * 380) { q.pe.push({ k: "deaf" }); addStress(q, 8); }
    }
    if (t > z.atk) {
      const reach = z.r + 20 + (target && target.veh && VEHICLES[(vehOf(target) || {}).kind]?.mech ? 36 : 0); // a mech is wider than you
      if (target && Math.sqrt(bd) < reach && Math.abs(target.z - z.z) < 60) {
        if (z.glow) addRad(target, 5);
        hurtPlayer(target, def.dmg, null, z.type === "boss" ? `folded by ${B.name.toLowerCase().replace("the ", "the ")}` : z.type === "tank" ? "smashed by a tank" : z.bug ? "torn apart by bugs" : "eaten");
        z.atk = t + 0.8;
        if (z.type === "tank") { const d = Math.sqrt(bd) || 1; kick(target, (target.x - z.x) / d * 420, (target.y - z.y) / d * 420, 240); }
        if (target.id && Math.random() < INFECT) infect(target);
      }
      else if (!target && touchingHearth && game.phase !== "over") { game.hearth -= def.dmg * (z.type === "boss" ? 1.5 : z.bug ? 0.25 : 0.6); z.atk = t + 0.8; world.events.push({ k: "hhit" }); } // bugs would rather eat you than the Hearth
    }
    for (const pl of PLOTS) if (pl.stage > 0 && z.z < 10 && (pl.x - z.x) ** 2 + (pl.y - z.y) ** 2 < 22 * 22) { pl.stage = 0; pl.prog = 0; world.events.push({ k: "trample", x: pl.x, y: pl.y }); }
    if ((z.type === "boss" || z.type === "elite") && t > z.special && game.phase !== "over") {
      z.special = t + (z.type === "elite" ? 5 : B.summon);
      const charge = game.bossKind === "golem" && z.type === "boss" ? Math.random() < 0.75 : Math.random() < 0.5;
      if (charge && target) { z.charge = t + 0.7; world.events.push({ k: "roar", x: z.x, y: z.y }); }
      else {
        const kind = z.type === "elite" || game.bossKind === "drowned" ? "runner" : Math.random() < 0.3 ? "runner" : "walker";
        for (let i = 0; i < 3 + players.size; i++) spawnZombie(kind, z);
        world.events.push({ k: "roar", x: z.x, y: z.y });
      }
    }
  }
  // separation
  for (let i = 0; i < world.zombies.length; i++) for (let j = i + 1; j < world.zombies.length; j++) {
    const a = world.zombies[i], b = world.zombies[j];
    const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
  }
  const bossWasAlive = world.zombies.some((z) => z.id === game.bossId);
  world.zombies = world.zombies.filter((z) => z.hp > 0);
  if (game.phase === "night" && rules().waves && bossWasAlive && !world.zombies.some((z) => z.id === game.bossId)) {
    if (rules().bossWins) endGame(true);
    else { game.bossId = 0; game.ends = t + 8; world.events.push({ k: "banner", text: "BOSS DOWN", sub: "The sun is coming up. Enjoy it while it lasts." }); }
  }
  if ((game.phase === "night" || game.phase === "day") && game.hearth <= 0) { game.hearth = 0; endGame(false); }

  sendWallChanges();
  if (world.mapDirty && tickN % 6 === 0) { world.mapDirty = false; broadcastRaw(JSON.stringify(mapMsg())); }
  if (tickN % SNAP_EVERY === 0) broadcast();
}
function snapshot() {
  const r = Math.round, t = now();
  const v = game.vote;
  return {
    t: "s",
    g: { pp: CROP_KEYS.map((id) => cropPrice(null, id)), disc: game.mods.discount, mode: game.mode, cd: game.countdown ? Math.max(0, +(game.countdown - t).toFixed(1)) : -1, prev: game.prev,
      intro: game.phase === "intro" ? { at: +(t - game.introT0).toFixed(2), len: rules().intro, skip: game.skip.size, cast: game.cast } : null,
      deeds: rules().story ? Object.fromEntries(Object.keys(LEGENDS).map((k) => [k, Math.round(game.deeds[k])])) : null, legend: game.legend, now: rules().story ? legendOf(game.deeds) : null,
      alive: [...players.values()].filter((p) => !p.out && !p.dead).length,
      zone: game.zone && (!OPEN() || game.phase === "night") ? [r(game.zone.cx), r(game.zone.cy), r(game.zone.r), r(game.zone.tcx), r(game.zone.tcy), r(game.zone.tr), game.zone.t0 > t ? r(game.zone.t0 - t) : -1] : null,
      drop: game.drop && t - game.drop.t0 < game.drop.dur + 3 ? [r(game.drop.x0), r(game.drop.y0), r(game.drop.x1), r(game.drop.y1), +dropPos(t).k.toFixed(3)] : null,
      clues: [...game.clues].map(clueText), mq: mainQuest(),
      ph: game.phase, n: game.night, uav: game.uav && game.uav > t ? Math.ceil(game.uav - t) : 0, left: game.ends === Infinity ? -1 : Math.max(0, r(game.ends - t)), hh: r(game.hearth), hm: game.hearthMax, res: game.result, boss: game.bossId, bk: game.bossKind, valley: world.VALLEY, fog: game.fog ? 1 : 0, solved: solved() ? 1 : 0, dino: game.dino ? 1 : 0, dd: game.dinoDay ? 1 : 0,
      du: dustView(t), bug: bugView(), adv: game.mode === "adventure" ? advView() : null,
      mk: SYMS.map((s) => +game.market.px[s].toFixed(2)), news: game.market.news.map((n) => [n.text, n.up ? 1 : 0]),
      mayor: game.mayor, nuke: game.nuke ? [r(game.nuke.x), r(game.nuke.y), Math.max(0, +(game.nuke.at - t).toFixed(1))] : null, dome: game.dome && rules().nukes ? [game.dome.have, game.dome.cost] : null, waste: game.waste ? 1 : 0, hot: game.hot.map((h) => [r(h.x), r(h.y), r(h.r), h.lake ? 1 : 0]),
      elec: game.elec ? { c: game.elec.cands, v: Object.fromEntries(game.elec.votes), left: Math.max(0, r(game.elec.ends - t)) } : null,
      dis: game.disaster ? { k: game.disaster.kind, w: +game.disaster.water.toFixed(1), x: r(game.disaster.x || 0), y: r(game.disaster.y || 0), m: game.disaster.meteors.map((m) => [r(m.x), r(m.y), +(m.at - t).toFixed(2)]), left: r(game.disaster.until - t), st: game.disaster.st ? [r(game.disaster.st.x), r(game.disaster.st.y), game.disaster.st.busy ? 1 : 0] : null } : null },
    vote: v ? { title: v.ev.title, text: v.ev.text, ch: v.ev.choices.map((c) => [c.label, c.desc]), votes: Object.fromEntries(v.votes), left: Math.max(0, r(v.ends - t)) } : null,
    story: game.story ? { title: game.story.title, pick: game.story.pick, text: game.story.text } : null,
    p: [...players.values()].map((p) => {
      const w = p.weapons[p.active];
      return {
        id: p.id, n: fullName(p), x: r(p.x), y: r(p.y), z: r(p.z), mv: [r(p.vx), r(p.vy), r(p.vz), p.gr ? 1 : 0], pt: +p.pt.toFixed(2), a: +p.a.toFixed(2), hp: r(p.hp), mh: maxHp(p), ar: r(p.armor),
        c: p.color, h: p.hat, ey: p.eyes, cl: p.cls, bg: p.bg, d: p.dead ? 1 : 0, g: p.gold, sd: seedCount(p), st: Math.min(5, Math.floor(p.heat / 40)),
        w: w.type, wn: wName(w), wr: w.rarity, we: w.enh, am: w.ammo, mg: magOf(w), wmo: w.mode || "", wat: attList(w), wsk: w.skin || "", hot: w.hot ? 1 : 0, chg: w.chargeAt ? +Math.min(1, (t - w.chargeAt) / WEAPONS[w.type].charge).toFixed(2) : 0, sec: p.weapons.length > 1 ? 1 : 0,
        rl: w.reloadUntil ? +(w.reloadUntil - t).toFixed(2) : 0, rt: w.reloadUntil ? +(w.reloadUntil - w.reloadStart).toFixed(2) : 0, rtr: w.tried ? 1 : 0,
        jam: w.jam ? 1 : 0, dirt: Math.round(w.dirt || 0), cln: p.cleaning ? 1 : 0,
        spr: +spreadOf(p, w).toFixed(3), sc: Math.max(0, +(p.shoutCd - t).toFixed(1)), sp: r(speedOf(p)), tr: p.trait, gen: p.gen,
        lv: p.lvl, xp: p.xp, xn: xpNeed(p.lvl), pts: p.pts, sk: p.sk, ch: p.champion ? 1 : 0,
        air: p.air === "plane" || p.air === "wait" ? 1 : p.air === "fall" ? (p.pod ? 4 : 2) : p.air === "bunker" ? 3 : 0, gr: SLOTS.map((k) => (p.gear[k] ? p.gear[k].id : "")), fd: Math.round(p.food), wt: Math.round(p.water), rad: Math.round(p.rad), dr: p.drunk > 5 ? 1 : 0, cg: p.cg ? 1 : 0, rd: p.ready ? 1 : 0, vh: p.veh || 0, trl: p.trail, ttl: p.title ? COSMETICS[p.title].name : "", spn: p.spins, bl: r(p.bl), bw: r(p.bw), inf: p.inf ? p.inf.sym : "", imm: Math.max(0, Math.round((p.immune || 0) - t)), wm: p.warm ? 1 : 0, il: p.inf ? r(p.inf.until - t) : 0, go: t < p.going ? p.goKind : "", ads: p.ads ? 1 : 0, cro: crouched(p) ? 1 : 0, sprt: p.sprint ? 1 : 0, sli: p.slide > 0 ? 1 : 0, wrs: p.wr > 0 ? (p.wn[0] * Math.sin(p.a) - p.wn[1] * Math.cos(p.a) > 0 ? 1 : -1) : 0, sta: Math.round(p.stam ?? 100), out: p.out ? 1 : 0, pk: p.st.pk, ks: p.streak || 0, ss: r(p.stress || 0), br: Math.ceil(p.breath ?? 15), sw: p.swim ? 1 : 0, lo: p.love, ro: [p.dating || "", p.spouse || ""], el: p.elem || "force", els: elemsFor(p).join(","), fz: p.frozen > t ? 1 : 0, dl: p.dlg ? 1 : 0, md: p.meltdown > t ? 1 : 0, hoe: p.hoe || 0, ho: p.hoeOut ? 1 : 0, gn: p.gren, mo: p.molo, bi: p.bile > t ? 1 : 0, sh: p.shame > t ? 1 : 0, fr: p.fireUntil > t ? 1 : 0,
        mc: mechView(p), nt: [...p.talked], qr: questReady(p), q: Object.entries(p.q).map(([id, qs]) => [QUESTS[id].title, QUESTS[id].desc, Math.min(QUESTS[id].goal, npcApi.progress(p, id)), QUESTS[id].goal, qs.done ? 1 : 0, NPCS[QUESTS[id].npc].name]),
        k: p.st.kills, de: p.st.deaths, cr: p.st.crops, tk: p.st.tk, hs: p.st.hs, acc: p.st.shots ? Math.round(p.st.hits / p.st.shots * 100) : 0,
      };
    }),
    z: world.zombies.map((z) => [z.id, zCode(z), r(z.x), r(z.y), r((z.hp / z.maxHp) * 100), z.burn || z.fireUntil > t ? 1 : 0, r(z.z), z.wind > t || z.charge > t ? 1 : 0, z.frozen > t ? 1 : 0, z.glow ? 1 : 0, z.armHp > 0 ? 1 : 0, z.kd > t ? 1 : 0]),
    ball: PITCH && (BALL.x || BALL.y) ? [r(BALL.x), r(BALL.y), r(BALL.z)] : null,
    pr: world.projs.map((q) => [q.id, q.kind, r(q.x), r(q.y), r(q.z)]),
    fi: [...fires.values()].map((f) => [f.cx, f.cy, r(f.z)]),
    pl: PLOTS.map((q) => q.stage + 4 * Math.max(0, CROP_KEYS.indexOf(q.crop || "turnip"))),
    ca: world.caches.map((c) => [c.id, r(c.x), r(c.y), c.busy ? 1 : 0]),
    tm: OFFICES.flatMap((o) => o.open ? o.terms : [...o.hacked]), // hacked office terminals (all of them once the vault's open)
    np: world.NPC_POS.map((n) => [n.id, r(n.x), r(n.y), +(n.a || 0).toFixed(2)]),
    sh: game.shrine ? [...game.shrine.order, game.shrine.step, game.shrine.open ? 1 : 0] : null,
    cr: world.crates.map((c) => [c.id, r(c.x), r(c.y), c.w ? c.w.rarity : c.it.r || 0, c.grave ? 1 : 0, c.it ? (GEAR[c.it.id] ? 1 : 2) : 0]),
    vh: world.vehicles.map((v) => [v.id, v.kind, r(v.x), r(v.y), +v.a.toFixed(2), r((v.hp / (v.maxHp || VEHICLES[v.kind].hp)) * 100), v.seats[0], v.seats[1], r(v.v), r(v.z || 0), v.parts ? mechCode(v.parts) : "", v.jetting > t ? 1 : 0, v.owner || 0]),
    b: world.builds.map((b) => [b.id, b.bk, b.x, b.y, r((b.hp / b.maxHp) * 100), +b.a.toFixed(2), b.owner]),
    e: world.events,
    stats: game.phase === "over" ? game.stats : undefined,
    ending: game.phase === "over" ? game.ending : undefined,
    cut: game.phase === "over" && game.cutscene ? game.cutscene : undefined,
  };
}
export function broadcastRaw(s) {
  for (const p of players.values()) { try { p.ws.send(s, true); } catch {} }
  for (const ws of spectators) { try { ws.send(s, true); } catch {} }
}
function broadcast() {
  const base = JSON.stringify(snapshot()).slice(1);
  world.events = [];
  for (const p of players.values()) {
    if (p.invDirty || tickN % 30 === 0) { p.invDirty = false; p.pe.push(invMsg(p)); } // the bag, gear, needs and shares
    try { p.ws.send(`{"me":${p.id},"pe":${JSON.stringify(p.pe)},${base}`, true); } catch {}
    p.pe = [];
  }
  for (const ws of spectators) { try { ws.send(`{"me":0,"pe":[],${base}`, true); } catch {} }
}
