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
| **Q** = FUS RO DAH (knocks back zombies and friends) | Skyrim |
| Zombie nights, flashlights in the dark, "This is how you died" | Project Zomboid |
| When you die your heir takes over with a random trait and 50% inheritance tax | Crusader Kings 3, Kenshi |
| Post-match ratings out of 10 and Player of the Match; the Gaffer class | Football Manager |
| Classes (Fighter, Rogue, Wizard, Farmer, Gaffer) | Baldur's Gate 3 |
| Friendly fire earns wanted stars; kill a wanted player to collect the bounty. WASTED. | GTA V |
| Night 5 is a contract to kill a monster: the Slop Leshen | The Witcher 3 |

**How a match goes:** a short first day, then five nights with days in between. Zombies come from the map edges and go for players or straight for the Hearth. If the Hearth's health hits zero you lose. Kill the Leshen on night 5 to win. Winner winner, chicken dinner.

**Controls:** WASD move, mouse aim and shoot, R reload, E plant / harvest / open crates, Space dodge, Q shout, 1/2 or mouse wheel swap weapons, B shop (daytime only), K skills, J journal, Tab scoreboard, Enter chat. The host picks Story or Royale in the lobby. There is more to find than this README lets on.

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
