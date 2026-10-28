# Feature checklist

Every feature the game has, and what checks it still works. V2 (Restructure and Cohesion) removes no feature, so every refactor PR ticks this list: the **Auto** rows are covered by `bun tools/playtest.js` (and CI on every PR); the **Manual** rows need a quick look in a browser before merging a PR that touches them.

Auto = a playtest scenario fails if it breaks. Bots = the bots exercise it, and a crash would fail the run, but nothing asserts the result.

## Modes and special days

| Feature | Check |
| --- | --- |
| Lobby, mode pick, ready up, countdown, intro | Auto: every scenario |
| Opening cutscene (3D camera shots per mode), pre-join fly-around, WebGL-missing message | Manual (headless screenshot) |
| Story: days, nights, the Hearth, story votes | Auto: story (reaches night 2+) |
| Endless | Auto: endless |
| Royale: drop, ring, last one standing | Auto: royale |
| Adventure: towns, boards, signposts | Auto: adventure (home + 5 towns) |
| Adventure jobs: contracts, gigs, breaches, deliveries, Legendary Contract | Manual |
| Dinosaur Day | Auto: dino-day |
| Bug Night, holes, Brain Bug | Auto: bug-night (bugs appear) · Manual: sealing holes, Brain Bug death |
| Disasters and their control-station minigames | Auto: disasters (strikes) · Bots: minigames |
| Moonfall: the moon, title cards, four Giants' shrines, moon rocks, the landing | Auto: moon-saved (Oath at a shrine wakes a Giant; all four save the valley), moon-lands (it lands, game lost) · Manual: the moon and Giants in 3D, the HUD line (`SLOP_MOON=1`, tp `moon: "now" / "wake" / "night" / "fall"`) |
| Nukes, siren, Hearth Dome, bunker | Auto: bug-night nuke probe (goes off, kills go through the normal death path) · Manual: Dome, bunker (`SLOP_NUKE=1`) |
| Mystery: clues, accusation, Last Night boss, ending cutscene | Manual (tp `clues`, `killBoss`) |
| Elections, daily ballot, mayor policies | Bots |
| Town meetings | Bots |

## Combat and movement

| Feature | Check |
| --- | --- |
| Guns, rarities, enhancing, firing modes, attachments, skins | Bots (buy, enhance) · Manual: modes, attachments |
| Active reload, jams, gun cleaning | Bots |
| Sword, grenades, molotovs, rockets | Bots |
| Thu'um shouts and elements | Bots |
| Dodge, crouch, sprint, slide, double jump, wall-run, ledge climb, boost pads | Bots (jumps) · Manual: the rest |
| Friendly fire, wanted stars, bounties | Manual |
| UAV killstreak | Manual (tp `streak`) |
| Hellpod respawn, heirs, traits, inheritance tax | Bots (deaths) |
| Mechs: parts, building, call-in | Auto: story mech probe |
| Vehicles, helicopters, gunship, call-ins | Manual (tp `heli`) |
| Building pieces (walls, spikes, turrets, lamps) | Bots |
| Zombie types incl. charger, flyer, boomer, screamer | Auto: story/endless (types seen) |

## Town, economy and social

| Feature | Check |
| --- | --- |
| Walk-in shops: Vex, Haddock (range, attachments), Giles's stall | Bots (buying) · Manual: walking in |
| Crops, hoe, tilling, fertiliser | Bots |
| Casino: wheel, slots, blackjack, poker, cases, cosmetics | Bots |
| Stock market | Manual |
| Office blocks, vault hacking, caches | Bots (hacking) |
| Dust II rounds | Auto: story Dust II probe |
| Club Slop | Manual |
| Houses, cellars, tunnels, shelters, zombie pathing indoors | Manual |
| Lake, swimming, sunken shrine | Manual |
| The wild: chunks, biomes | Bots (chunks load as they wander) |
| NPC dialogue, quests, celebrity cameos | Bots (dialogue) |
| Romance, gifts, dates, weddings | Manual (tp `love`) |
| Slop Snap card game | Manual |
| Hunger, thirst, bladder, radiation, stress, football | Bots |
| Infection symptoms and antidote | Manual (`SLOP_INFECT=1`, `SLOP_SYM`) |
| F8 bug reports to bug-reports.txt | Auto: every scenario (bots file one) |
| Host kick and force start | Manual |

## Client (browser)

| Feature | Check |
| --- | --- |
| First and third person 3D view, HUD, minimap, compass | Manual (headless screenshot, see the memory note on the camera rig) |
| Radial menus, every screen (bag, skills, journal, cards, market, wardrobe, options) | Manual |
| Interface size and HUD opacity (Options), rebindable keys (Options > Controls), hold F1 cheat sheet | Manual (headless screenshot at 75% and 140%) |
| HUD helpers: objective tracker (top right), pings (middle click / U, in world, compass and radar), damage direction arcs, red "!" alert boxes, level-up achievement, message log while chatting | Manual (headless screenshot with faked events; ping relay checked over a socket) |
| Esc menu (Persona 5): Esc or losing the mouse opens it, every screen is a tab, Q/E or the wheel flip tabs, Esc backs out one level | Manual (headless: Esc, pick Bag, E to Skills, Esc back to menu, Esc to game) |
| Positional audio, music, NPC voices | Manual |
| Gamepad and flight stick | Manual |
| Windows and Linux builds | Auto: the release workflow smoke-tests both |
