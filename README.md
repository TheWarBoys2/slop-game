# Slop Valley

A top-down multiplayer party game for one evening with up to 5 friends. Farm by day, hold the Hearth against the dead by night, and blame your heir when it goes wrong.

Only the host installs anything. Everyone else just opens a link in their browser.

## What's in it (and who it's for)

| Bit | Nod to |
|---|---|
| Buy menu, reload, kill feed, Tab scoreboard, mystery case openings | CS:GO / CS2 |
| Loot crates with Common / Rare / Epic / Legendary weapons, dodge roll | Apex, PUBG |
| Enhance your gun to PRI, DUO, TRI, TET, PEN. Failing downgrades it. | Black Desert Online |
| Plant, grow and harvest crops on the farm plots for gold | Stardew Valley |
| Pick your colour and hat, a plumbob over your head, "Sul sul!" | The Sims 4 |
| **Q** = FUS RO DAH, plus Fire, Frost and Storm shouts (Z to switch) | Skyrim |
| Zombie nights, flashlights in the dark, "This is how you died" | Project Zomboid |
| When you die your heir takes over with a random trait and 50% inheritance tax | Crusader Kings 3, Kenshi |
| Post-match ratings out of 10 and Player of the Match; the Gaffer class | Football Manager |
| Classes (Fighter, Rogue, Wizard, Farmer, Gaffer) | Baldur's Gate 3 |
| Friendly fire earns wanted stars; kill a wanted player to collect the bounty. WASTED. | GTA V |
| Night 5 is a contract to kill a monster: the Slop Leshen | The Witcher 3 |

**How a match goes:** a short first day, then five nights with days in between. Zombies come from the map edges and go for players or straight for the Hearth. If the Hearth's health hits zero you lose. Kill the Leshen on night 5 to win. Winner winner, chicken dinner.

**Controls:** WASD move, mouse look and shoot (click the game to lock the mouse), right-click aim down sights, R reload (press it again at each stage: mag out, mag in, rack), L strip and clean your gun so it stops jamming, E plant / harvest / till new plots (with a hoe) / open crates / hack Slop-Tech caches / get in and out of things, Space jump (hold it to bunny hop), Shift dodge, T switches first person / third person / top-down, Q shout, Z switch the shout's element (Force, Fire, Frost, Storm; every monster is weak to one), 1/2 or mouse wheel swap weapons, 3 throw a grenade, 4 throw a molotov, B shop (daytime only), K skills, J journal, C build (or dive / descend while swimming or flying), G casino, V wardrobe, X relieve yourself, O options (volume, mouse sensitivity, field of view), Tab scoreboard, Enter chat. Helicopters fly with W/S (nose down/up), A/D (bank), the mouse (turn) and Space/C (climb/descend); the gunship fires its chain gun on click and rockets on right-click. A gamepad or flight stick (tested with the layout of a Thrustmaster T.16000M) works too: set its axes in Options. Talk to the townsfolk (E) to give them gifts; each has a favourite and something they can't stand, and enough hearts lead to a date and then a wedding. Townsfolk go home when night falls, and you can walk into any house. There's a lake to swim in, and something at the bottom of it. Stress builds at night; walk onto the football pitch and kick the ball about to calm down. In the lobby the host picks Story, Endless or Royale, and everyone presses F when they are ready; the game starts once all of you are. There is more to find than this README lets on.

## Hosting on Windows (the host only)

1. Download **SlopValley.bat** from the [latest release](https://github.com/TheWarBoys2/slop-game/releases/latest) and put it in its own folder, for example `Documents\SlopValley`.
2. Double-click it. It downloads the game the first time and updates itself on every launch after that.
   - If SmartScreen says "Windows protected your PC", click **More info** then **Run anyway** (the exe isn't code-signed).
   - If Windows Firewall asks, tick **both** Private and Public and click **Allow**.
3. The window prints the addresses to share. Open `http://localhost:7777` yourself.

### Letting friends in over the internet (port forward)

1. Give your PC a fixed local IP, or reserve it in your router (the window shows it, like `192.168.1.23`).
2. In your router's admin page (usually `http://192.168.1.1` or `http://192.168.0.1`), find **Port Forwarding** (sometimes under NAT, Virtual Servers or Advanced).
3. Add a rule: **TCP port 7777** → your PC's local IP, port **7777**.
4. The server window prints your public IP. Send friends `http://<public-ip>:7777`.
5. You (the host) should keep using `http://localhost:7777`, because many routers won't loop the public address back to you.

To use a different port, edit `set PORT=7777` in `SlopValley.bat` and forward that port instead.

If it doesn't work, check with a friend first (many port checker websites only work while the server is running). If your ISP uses CGNAT, port forwarding won't work at all. In that case install [Tailscale](https://tailscale.com) or ZeroTier on everyone's PC and use the host's Tailscale IP instead.

## Updating

Every push to `main` builds a new `SlopValley.exe` and publishes it as the latest GitHub release. The host just re-runs `SlopValley.bat`.

## Running from source / developing

Needs [Bun](https://bun.sh).

```sh
bun server.js            # port 7777
SLOP_FAST=1 bun server.js   # short days/nights and lots of gold, for testing
bun tools/bots.js ws://localhost:7777/ws 4   # 4 bots join and play
```

`server.js` runs the whole game and serves `public/`. The browser client is `public/game.js`. `story.js` is spoilers.

`SLOP_DMG=30` multiplies player damage, for testing the ending quickly.
