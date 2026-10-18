// Automated playtest: boots a fresh server per scenario, lets the bots (tools/bots.js) play it, runs scripted probes
// for the things bots don't reach on their own, and fails if anything breaks.
//   bun tools/playtest.js              every scenario
//   bun tools/playtest.js story bugs   just those
// Writes a summary (tick time, bandwidth, what was seen) to playtest-report.json. Exits 1 on any failure.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ctSpawn } from "../dust2.js";

const ROOT = path.resolve(import.meta.dir, "..");
const BASE_PORT = Number(process.env.PLAYTEST_PORT || 7790);
const PARALLEL = Number(process.env.PLAYTEST_PARALLEL || 3);

// each scenario: env for the server and bots, how long to play, and what must have happened
const SCENARIOS = [
  { name: "story", secs: 70, probes: ["mech", "dust"],
    expect: (s) => [need(s.night >= 2, "reached night 2"), need(s.adv == null, "no Adventure state in Story")] },
  { name: "endless", secs: 55, env: { ENDLESS: "1" },
    expect: (s) => [need(s.night >= 2, "reached night 2")] },
  { name: "royale", secs: 45, env: { ROYALE: "1", AGAIN: "1" },
    expect: (s) => [need(s.phases.some((p) => p.startsWith("royale")), "a Royale round started"), need(s.zone != null || s.over, "the ring or the results showed")] },
  { name: "adventure", secs: 50, env: { ADVENTURE: "1" },
    expect: (s) => [need(s.adv && s.adv.towns >= 6, "home plus 5 Adventure towns"), need(s.adv && s.adv.found >= 1, "the home town counts as found")] },
  { name: "dino-day", secs: 55, env: { SLOP_DINO: "1" },
    expect: (s) => [need(/[dy]/.test(s.zt || ""), "raptors or a T. rex showed up")] },
  { name: "bug-night", secs: 50, env: { SLOP_BUGS: "1" },
    expect: (s) => [need(/[gpkq]/.test(s.zt || ""), "bugs came out of the holes")] },
  { name: "disasters", secs: 55, env: { SLOP_DISASTER: "any" },
    expect: (s) => [need(!!s.dis, "a disaster struck")] },
];

const need = (ok, what) => (ok ? null : what);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(port, proc, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (proc.exitCode !== null) return false;
    try { if ((await fetch(`http://localhost:${port}/`)).ok) return true; } catch {}
    await sleep(250);
  }
  return false;
}

async function lines(stream, onLine) {
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of stream) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  if (buf) onLine(buf);
}

// A scripted player: joins, readies up, measures what the server sends it, and runs probes once the game is on.
function probeClient(port, probes, mode) {
  const out = { bytes: 0, t0: 0, t1: 0, maxSnap: 0, results: {} };
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  let S = null, me = 0;
  const radios = [];
  const waitFor = async (check, ms) => { const until = Date.now() + ms; while (Date.now() < until) { const v = check(); if (v) return v; await sleep(200); } return null; };
  const send = (m) => { try { ws.send(JSON.stringify(m)); } catch {} };
  const mine = () => S && S.p.find((q) => q.id === me);
  const events = [], toasts = [];
  ws.onopen = () => send({ t: "join", name: "Probe", color: "#ffffff", hat: "crown", cls: "fighter", bg: "soldier", trait: "Lucky", eyes: "dot" });
  ws.onmessage = (ev) => {
    const raw = ev.data; if (out.t0) out.bytes += raw.length;
    const m = JSON.parse(raw);
    if (m.t === "ck") for (const w of m.walls || []) if (w.kind === "radio") radios.push(w);
    if (m.t !== "s") return;
    S = m; me = m.me;
    if (["day", "night", "royale"].includes(m.g.ph)) { if (!out.t0) out.t0 = Date.now(); out.t1 = Date.now(); out.maxSnap = Math.max(out.maxSnap, raw.length); }
    for (const e of m.e) events.push(e);
    for (const e of m.pe || []) if (e.k === "toast") toasts.push(e.text);
    if (events.length > 500) events.splice(0, events.length - 500);
    const p = mine();
    if (m.g.ph === "lobby" || m.g.ph === "over") { // the host (whoever joined first) picks the mode; the probe may be it
      if (m.g.mode !== mode) send({ t: "mode", m: mode }); else if (p && !p.rd) send({ t: "ready", v: true });
    }
    if (m.g.intro) send({ t: "skip" });
  };
  const playing = () => S && ["day", "night"].includes(S.g.ph) && mine() && !mine().d && !mine().air;
  const PROBES = {
    // build a mech from parts and call it down: it should land as a vehicle that's ours
    async mech() {
      if (!await waitFor(playing, 30000)) return "the game never started for the probe";
      send({ t: "tp", hp: 500, mechParts: 1, mechSet: { core: "reactor", legs: "strider", armR: "cannon", armL: "rockets", head: "sensor" } });
      if (!await waitFor(() => mine() && mine().mc && mine().mc[0], 5000)) return "mech parts didn't bolt on";
      await waitFor(playing, 10000);
      send({ t: "mech" }); // once: calling it again picks the landed mech back up and drops it anew
      const landed = await waitFor(() => S.vh.some((v) => v[12] === me && v[10]), 12000);
      return landed ? null : `the mech never landed (last message: ${toasts.at(-1) || "none"})`;
    },
    // walk into Dust II's CT spawn, find the radio and start a round
    async dust() {
      if (!await waitFor(playing, 30000)) return "the game never started for the probe";
      const ct = ctSpawn();
      send({ t: "tp", x: ct.x, y: ct.y, hp: 500 });
      const radio = await waitFor(() => radios[0], 10000);
      if (!radio) return "Dust II's radio never loaded";
      const started = await waitFor(() => {
        send({ t: "tp", x: radio.x + radio.w / 2, y: radio.y + radio.h / 2, hp: 500 });
        send({ t: "use" });
        return events.some((e) => e.k === "dust" && e.say === "go");
      }, 15000);
      return started ? null : "a Dust II round didn't start at the radio";
    },
  };
  out.run = (async () => {
    await waitFor(() => ws.readyState === 1, 5000);
    for (const name of probes) {
      try { out.results[name] = await PROBES[name](); } catch (err) { out.results[name] = String(err); }
    }
  })();
  out.close = () => { try { ws.close(); } catch {} };
  return out;
}

async function runScenario(sc, port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `slop-${sc.name}-`)); // the server writes bug-reports.txt here
  const env = { ...process.env, SLOP_FAST: "1", SLOP_TP: "1", ...(sc.env || {}) };
  const server = Bun.spawn(["bun", "--preload", path.join(ROOT, "tools/tickstats.js"), path.join(ROOT, "server.js"), String(port)], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  const log = [], ticks = [];
  lines(server.stdout, (l) => { if (l.startsWith("TICKSTATS ")) ticks.push(JSON.parse(l.slice(10))); else log.push(l); });
  lines(server.stderr, (l) => log.push(l));
  const fails = [];
  let seen = null, probe = null, bots = null;
  try {
    if (!await waitForServer(port, server)) throw new Error("the server didn't boot");
    const mode = env.ROYALE ? "royale" : env.ENDLESS ? "endless" : env.ADVENTURE ? "adventure" : "story";
    bots = Bun.spawn(["bun", path.join(ROOT, "tools/bots.js"), `ws://localhost:${port}/ws`, String(sc.bots || 3)], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    lines(bots.stdout, (l) => { try { seen = JSON.parse(l); } catch {} });
    lines(bots.stderr, (l) => log.push("[bots] " + l));
    probe = probeClient(port, sc.probes || [], mode);
    await sleep(sc.secs * 1000);
    await Promise.race([probe.run, sleep(1000)]);
    for (const [name, err] of Object.entries(probe.results)) if (err) fails.push(`${name} probe: ${err}`);
    for (const name of sc.probes || []) if (!(name in probe.results)) fails.push(`${name} probe didn't finish`);
    if (!seen) fails.push("the bots reported nothing");
    else {
      if (seen.errors) fails.push(`${seen.errors} bot connection errors`);
      for (const f of sc.expect(seen)) if (f) fails.push(`expected: ${f}`);
    }
  } catch (err) {
    fails.push(String(err.message || err));
  } finally {
    if (probe) probe.close();
    if (bots) bots.kill();
    server.kill();
    await server.exited;
  }
  const bugFile = path.join(dir, "bug-reports.txt");
  const reports = fs.existsSync(bugFile) ? fs.readFileSync(bugFile, "utf8") : "";
  const crashes = reports.split("==== ").filter((r) => r.includes("SERVER ERROR"));
  if (crashes.length) fails.push(`server errors:\n${crashes.slice(0, 3).join("\n").slice(0, 3000)}`);
  if (server.exitCode && server.exitCode !== 143 && server.signalCode == null) fails.push(`server exited with ${server.exitCode}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const secs = probe && probe.t1 > probe.t0 ? (probe.t1 - probe.t0) / 1000 : 0;
  return {
    name: sc.name, ok: fails.length === 0, fails,
    tick: ticks.length ? { avgMs: +(ticks.reduce((a, t) => a + t.avg * t.n, 0) / ticks.reduce((a, t) => a + t.n, 0)).toFixed(2), maxMs: Math.max(...ticks.map((t) => t.max)) } : null,
    net: secs ? { kbPerSec: +(probe.bytes / secs / 1024).toFixed(1), maxSnapKb: +(probe.maxSnap / 1024).toFixed(1) } : null,
    seen: seen && { phases: seen.phases, night: seen.night, maxZ: seen.maxZ, zt: seen.zt, dis: seen.dis, adv: seen.adv },
    log: fails.length ? log.slice(-40) : undefined,
  };
}

const want = process.argv.slice(2);
const todo = want.length ? SCENARIOS.filter((s) => want.includes(s.name)) : SCENARIOS;
if (!todo.length) { console.error(`No such scenario. Pick from: ${SCENARIOS.map((s) => s.name).join(", ")}`); process.exit(2); }
console.log(`Playtesting ${todo.map((s) => s.name).join(", ")} (${PARALLEL} at a time)...`);
const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, async (_, lane) => {
  while (next < todo.length) {
    const sc = todo[next++];
    const r = await runScenario(sc, BASE_PORT + lane);
    results.push(r);
    const stats = [r.tick && `tick ${r.tick.avgMs}ms avg / ${r.tick.maxMs}ms worst`, r.net && `${r.net.kbPerSec} KB/s per player`].filter(Boolean).join(", ");
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${stats ? `  (${stats})` : ""}`);
    for (const f of r.fails) console.log(`      - ${f}`);
    if (!r.ok && r.log) console.log(r.log.map((l) => "      | " + l).join("\n"));
  }
}));
fs.writeFileSync(path.join(ROOT, "playtest-report.json"), JSON.stringify(results.sort((a, b) => a.name.localeCompare(b.name)), null, 2));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} scenarios failed.` : `\nAll ${results.length} scenarios passed.`);
process.exit(failed.length ? 1 : 0);
