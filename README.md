# Age of Emissions

An isometric, Age of Empires–style real-time strategy game built around climate change, made with [Phaser](https://phaser.io).
All the art is drawn with code when the game starts, and all the sound is synthesised live — there are no image or audio files.

## How to run it

1. Open this folder in VS Code.
2. Right-click `index.html` → **Open with Live Server**.
3. Phaser lives in `lib/phaser.min.js`, so the game works offline. **Make sure `lib/` is committed** — the online version needs it.

## Install it as an app

The game is a Progressive Web App. Open it in Chrome or Edge (from Live Server or the online version) and either:
- click **Install Game** on the main menu, or
- click the install icon at the right of the address bar.

You get a desktop / Start-menu icon and it runs in its own window — even with no internet.

## Put it online (Cloudflare)

Live at **https://climate-rts.adrian11jonker.workers.dev** — every push to `main` rebuilds it automatically (watch it under Workers & Pages → climate-rts → Deployments).

If pushes ever stop showing up:
1. Cloudflare → **climate-rts → Settings → Builds** should show this repository connected to branch `main`.
2. If it says the project is disconnected, check that the **Cloudflare Workers and Pages** GitHub app is allowed to see `climate-rts`:
   https://github.com/apps/cloudflare-workers-and-pages/installations/new → Configure → add the repository.
3. Then reconnect it in Cloudflare (Build command empty, deploy command `npx wrangler deploy`).

The `_headers` file tells Cloudflare not to cache the game code too hard, so updates show up straight away.

`wrangler.jsonc` is Cloudflare's settings file. It says: serve the folder as the website, and run `worker/index.js` for anything under `/api/` (that's the online-play server). `.assetsignore` keeps the server code and this README off the website. Online play uses **Durable Objects**, which are included in Cloudflare's free Workers plan.

## Play online (up to 4 players)

1. Main menu → **Play Online**, type your name.
2. One of you presses **Host a Game** and sends the others the 5-letter code.
3. Friends type the code and press **Join** to take a seat, or **Watch** to spectate without playing.
4. The host sets up the four seats (Blue, Red, Green, Yellow), using a **quick set-up** button (1 v 1, 1 v 2, 1 v 3, 2 v 1, 2 v 2, 3 v 1, 1v1v1, 1v1v1v1) or seat by seat. Each seat can be **open** for a person, a **computer player** (Easy / Normal / Hard) or **closed**, with a **team** (1–4, or – for on its own). Some examples:
   - **1 v 1**: two people, the other seats closed.
   - **2 v 2**: Blue + Green on Team 1, Red + Yellow on Team 2. Any seat can be a person or the computer.
   - **Co-op**: two or three people on one team against computer players.
   - **Free-for-all**: everyone on a different team.
5. On the **Map & settings** tab pick the map and the game settings (same as single player), then **Start Game**. Everyone sees the settings.

In game: **Enter** opens chat. The number at the top right is your connection's round trip to the server. The list under the climate panel shows every side, who's an ally, and who's been knocked out. The **Menu** doesn't pause an online game. Use it to **Resign**, or to **Leave** (leaving counts as resigning). If your side is knocked out you can keep watching. Spectators can click a side in the list to follow it.

If someone's internet drops, the game pauses for everyone and waits up to 90 seconds for them to come back. If they don't, their side resigns and the game carries on. If someone refreshes or closes the page, **Play Online → Rejoin game** puts them back in. Their game quickly replays everything they missed. Online games are saved as replays too.

Online play only works on the Cloudflare site. It won't work when you run the game with Live Server, because there's no game server there.

## Put it on itch.io (optional)

1. Zip the folder's contents (`index.html` must be at the top level of the zip — not inside another folder).
2. itch.io → **Upload new project** → Kind of project: **HTML** → upload the zip and tick **This file will be played in the browser**.
3. Viewport: 1366 × 768, tick **Fullscreen button**. Set visibility to **Restricted** or **Draft** if it's just for you.

## Menus & saving

- **Main menu:** New Game sets up a game like the Age of Empires II lobby:
  - **Quick set-ups:** 1 v 1, 1 v 2, 1 v 3, 2 v 1, 2 v 2, 3 v 1, 1v1v1 and 1v1v1v1.
  - **Or set each seat yourself.** Blue, Red, Green and Yellow can each be **You**, a **Computer** (Easy / Normal / Hard, set per seat or all at once) or **Closed**. Click a colour to play as that colour.
  - **Teams:** give each seat a team: **Team 1–4**, or **–** for on its own. Same number = allies. Allies start in neighbouring corners.
  - On the **Map & settings** tab, pick the **map** (each has a description) and the game settings. Highlighted settings are different from normal:
    - **Map size:** Auto, Tiny 48, Small 64, Medium 76, Large 88 or Huge 100 tiles square. Auto is Small for 2 sides and Large for 3–4.
    - **Resources:** Low, Standard, High or Very high at the start.
    - **Starting age:** Coal, Industrial or Modern.
    - **Population limit:** 50–300.
    - **Reveal map:** Normal fog, Explored (you know the land but not where armies are), or All visible.
    - **Peace time:** None, or 5, 10 or 20 minutes in which nobody can attack anybody.
    - **Victory:** Standard, or Conquest (only knocking out every rival wins; no Climate Restoration win).
    - **Climate:** Gentle, Normal or Harsh (how hard pollution heats the planet).
  - The main menu also has **Freeplay (practice)**, Play Online, Load Game, Replays, How to Play and Settings.
- **Freeplay:** a practice game with no enemies (the **Freeplay** quick set-up, or close every other seat). An **economy panel** on the right shows your workers (and how many are idle), what you gather per minute of each resource, and the total. **Milestones** (10 / 20 / 30 / 50 / 75 workers, each new age, 1 000 to 50 000 gathered) pop up with your time and your **personal best** for the same starting resources and age — bests are kept in this browser. Choose **Finish Practice** in the game menu to end with a summary. The climate still counts: pass +5°C and the practice is over.
- **Tribute:** in any game with other sides, press **Give** next to a side in the sides panel (top right) to send it 100 or 500 food, wood, stone or coal. Each gift costs 10% extra as a fee. Computer allies send you their spare resources when you run short. The end-of-game table shows tribute sent and received.
- Games with 3–4 sides use a bigger map (88 × 88 tiles instead of 64 × 64), with a town in each corner. With more sides the planet warms faster, but not twice as fast: each side's pollution counts a bit less.
- **In game:** press **Esc** (with nothing selected), **F10** or the **Menu** button to pause. From there you can **save** to one of 3 slots, **load**, read the help, or quit to the main menu.
- Saves are kept in your browser's storage on this computer.
- **Replays:** every new game is recorded. When it ends, press **Watch Replay**, or open **Replays** on the main menu to watch your last 6 games. A replay is tiny: just the map settings and the orders you gave, with the time each one happened. The banner shows whether playback is still "in sync" (a replay recorded with an older version of the game may drift). Games continued from a save aren't recorded.
- **Settings** (main menu or in-game menu): master, music, sound-effects and ambience volume, and **Screen effects** (the soft vignette and colour grading; turn them off on slower computers).
- **Bridges:** with workers selected, open the Military & science build page and drag a **Bridge** across water, rock, coal or trees (15 wood per section). Workers build from the bank outwards, and each section opens up as it's finished. Anyone can cross a bridge, enemies too, and bridges survive rising seas.
- **Getting around:** people walk in straight lines where they can, instead of zig-zagging tile by tile. They squeeze diagonally past a corner (between a house and a tree, say) wherever there's visibly room.
- **Delete:** select your own units or a building and press **Delete** (or the **✕ Delete** button under the portrait). A foundation nobody has started building gives its cost back. Your Town Centre asks you to press twice.
- Saves from before v13 can't be loaded (games can now have up to four sides).
- **Animations:** people walk with a smoother stride, wind up before a sword blow, flinch when hit, breathe while standing about, and stagger before they fall. Rifles kick back, and buildings settle with a puff of dust when finished.
- **Workers use the right tool for the job** (like AoE2 villagers): an **axe** for wood, a **pick** for stone and coal, a **hammer** for building, a **hoe** on farms, a **knife** to butcher a deer, a **spear** for hunting (they throw it), and **bare hands and a basket** for berries. With Electric Tools the axe becomes a chainsaw and the pick and hammer a power drill.
- **Blows land on the thing being worked.** A worker takes a short step to stand right beside the nearest tree trunk, rock, bush or building wall, so the axe bites the trunk, the pick hits the rock and the hand reaches into the bush. Workers sharing a tree spread out around it, and farmers work their way along the rows. Each blow has its own effect: wood chips and falling leaves, rock chips and sparks, coal dust, a berry dropped into the basket, clods of soil, sawdust.
- **Loads are carried home on the shoulder:** a bundle of logs, a stone block, a sack of coal, a basket of berries, a haunch of venison or a sheaf of wheat.
- **Things run down as they're gathered:** trees fall one at a time (away from the axe, with a thump of dust and leaves) and leave stumps; berry bushes lose their berries, shrink and end as bare stems; stone and coal rocks are mined away one by one, the last one shrinking; a deer carcass goes from whole to half-butchered to bones. Workers only ever stand on open ground beside what they're working, never in among other trees or rocks.
- All of this is just for show: it never changes the game, so replays and online games stay in sync.
- **Look (v18 visual overhaul):** closer to AoE2 than a cartoon. People are smaller next to buildings, with realistic proportions (slimmer build, longer legs, smaller heads) and soft edges instead of thick black outlines, and the team colour shows clearly on their clothes. **Trees are proper sprites**: tall, detailed oaks and pines lit from the upper left, which people walk behind, which shake when chopped, and which thin out tree by tree as a forest is cut. The grass is a deeper, earthier green with blade-level texture and bare patches. Stone deposits are faceted rocks with loose gravel, coal lies in dusty scattered heaps, buildings stand on trodden earth, and the whole screen has a slightly muted, warm colour grade (turn it off with Screen effects in Settings).

## Fog of war

Unexplored land is black; places you've explored but can't currently see are dimmed. Enemy units only show up when one of your units or buildings can see them. Towers and the Town Centre see furthest. Turn it off in New Game if you prefer.

## Sound

- Work sounds (chopping, mining, foraging, hammering), combat (arrows, swords, rifles, cannons), interface clicks.
- A war horn when you're attacked, a fanfare when you reach a new age, a chime when something finishes.
- Wildfires crackle, storms bring thunder, rising seas roar.
- Background wind and birdsong — the birds go quiet and the wind gets harsher as the planet heats up.
- Sounds only play for things on screen, quieter towards the edges.

## How to play (so far)

**Goal:** destroy the red enemy's Town Centre before they destroy yours — and don't let the planet reach **+5°C**, or everyone loses.
Or win a **Green Victory**: reach the Green Age, build the Climate Restoration Project and keep it standing for 3 minutes.

### Eras & technology
Advance at the Town Centre. Each age unlocks new buildings (shown with a roman numeral on the build grid until unlocked):

| Age | Unlocks |
| --- | --- |
| I · Coal Age | Houses, farms, mills, lumber camps, mining camps, docks, market, barracks, towers, walls, wind turbines, tree planting; scouts; basic upgrades at the Town Centre |
| II · Industrial Age | Workshop, Coal Power Plant (lots of energy, lots of CO₂), Riflemen, Medics, Cannons. Buildings turn to brick with slate roofs and chimneys |
| III · Modern Age | Apartment Blocks (+15 pop), Office Towers (steady income), Factories (wood + stone, but CO₂), Radar Stations (see through fog), Armoured Cars, Electric Tools, Body Armour, Automation. Concrete, glass and flat roofs |
| IV · Transition Age | Solar Farm, Hydro Dam, Carbon Capture, Smart Grid, Reforestation, Cool Roofs. White buildings with solar panels on every roof |
| V · Green Age | Geothermal Plant, Electric Tank, Climate Restoration Project (wonder), Climate Shields. Needs **clean** energy to reach. Timber, ivy and grass roofs |

When you advance, **every building you own changes to the new era's look**. Units change too when you research their upgrades: Iron Weapons puts soldiers in steel armour and plumed helmets, Body Armour gives them modern helmets and camouflage; Steel Axes / Mining Carts / Wheelbarrow give workers better tools, Electric Tools gives them hard hats and hi-vis vests.

Research takes time and is shown by a purple bar. Hover any button to see what it costs and does.

- Your **Town Centre** trains workers and is where resources get dropped off.
- Select workers and **right-click trees, stone or berry bushes** to gather. They'll carry loads back automatically.
- With workers selected, use the build grid to build houses, farms, drop-off camps, barracks and more.
- **Houses** raise your population limit. **Farms** give 300 food each.
- **Drop-off camps** save long walks. Workers carry **wood** to a **Lumber Camp**, **stone and coal** to a **Mining Camp**, and **food** to a **Mill** (or anything to the Town Centre). Camps are small (one tile) and cheap, so build them right next to the forest or quarry. The Mill (2 × 2) goes among your farms or near berries.
- Click a building to see it. Town Centre and Barracks have train buttons.

### Fighting
- **Barracks** train **Soldiers** (tough, close range) and **Archers** (fragile, long range).
- **Right-click an enemy** unit or building to attack it. Idle soldiers fight anything that comes near.
- Your **Town Centre** and **Watch Towers** shoot arrows at enemies in range.
- The enemy builds its own town in the far corner and sends **attack waves** (the first at about 7 minutes) that get bigger each time. It also mines coal — its pollution heats your planet too.
- Enemy difficulty can be tweaked in `src/ai.js` (`AI_SETTINGS`).

### The climate
- **Coal** (black rocks) gives **fossil fuel** fast — but burning it adds CO₂ to the air.
- **Wind Turbines** make **clean energy** slowly, with no pollution.
- Energy (either kind) pays for **Town Centre upgrades**: Steel Axes, Mining Carts, Plough.
- **Forests soak up CO₂.** Chopping them down makes things worse; workers can **Plant Trees** (they grow into forest).
- More CO₂ → higher **global temperature** (meter, top right). As it heats up you get:
  - 🔥 **Wildfires** that spread through forests, damage buildings and release more CO₂
  - ☀️ **Droughts** that halve food gathering
  - 🌪️ **Storms** that smash buildings
  - 🌊 **Sea-level rise** at +1.5°C, +2.5°C and +3.5°C — low coastal land floods and anything on it is lost
- Climate numbers can be tweaked in `src/config.js` (the `CLIMATE` section).

## Unit counters

| Unit | Strong against | Weak against |
|---|---|---|
| Soldier | Riflemen, scouts, cannons, buildings | Archers, armoured cars |
| Archer | Soldiers, workers | Scouts, armoured cars, riflemen |
| Scout Rider | Archers, workers, cannons | Soldiers |
| Rifleman (Industrial) | Armoured cars, electric tanks | Soldiers |
| Field Cannon (Industrial) | Buildings and walls (from long range) | Everything that reaches it |
| Field Medic (Industrial) | — heals nearby units | Anything (can't fight) |
| Armoured Car (Transition) | Archers, soldiers, buildings | Riflemen |
| Electric Tank (Green) | Almost everything | Riflemen |

The enemy watches your army and trains whatever beats it (rarely on Easy, often on Hard).

## Hunting and fishing

- **Deer** roam in herds (one near each base). Right-click one with workers: they chase it, bring it down, then butcher it — the fastest food in the game, but deer bolt if you get close.
- **Fishing Docks** must touch the shore and catch food on their own, no workers needed.
- **Hydro Dams** also need water and are the best clean power before geothermal.

## Controls

| Action | Control |
| --- | --- |
| Select a unit / building | Left-click it |
| Select a group | Left-click and drag a box |
| Select all of one type on screen | Double-click a unit (or Ctrl+click) |
| Add/remove from selection | Hold Shift while clicking/dragging |
| Move | Right-click on the map (or on the minimap) |
| Gather | Right-click trees, stone, berries or coal with workers selected |
| Attack | Right-click an enemy unit or building |
| Build | Select workers, press Q W E R T Y / Z X C V B N (or click the grid), left-click to place (Shift to place several, right-click/Esc to cancel). N switches between economy and military buildings |
| Build a wall | Military buildings → Stone Wall, then click and drag a line |
| Control groups | Ctrl+1–9 (or Alt+1–9) saves the selection, Shift+number adds to it, the number selects it, press twice to jump there |
| Rally point | Select a Town Centre or Barracks and right-click the ground (or a resource / farm for workers) |
| Stop | Q with units selected |
| Attack-move | A (or W) with soldiers selected, then left-click the map: they march there and fight everything on the way |
| Town bell | Select the Town Centre (or a tower) → bell button (Y): workers shelter inside, extra arrows. Press again for all clear |
| Market | Select a Market: top row buys 100 of a resource, bottom row picks what you pay with |
| Look at the last attack | Space |
| Pick one unit from a group | Click its portrait in the info panel (Shift-click removes it) |
| Cancel training | Click the unit in the building's queue (you get the cost back) |
| Game speed | + and − keys, or click the ×1 in the top bar (right-click to slow down) |
| Help build / farm | Right-click an unfinished building or a farm with workers |
| Train / research / advance | Select a Town Centre, Barracks or Workshop and use its buttons |
| Find idle worker | . (full stop) or the worker button above the command panel |
| Pan camera | Arrow keys, or move the mouse to the screen edge |
| Zoom | Mouse wheel |
| Jump camera | Click/drag on the minimap |
| Go home | H |
| Deselect / cancel | Esc |
| Game menu (pause, save, load) | Esc with nothing selected, F10, or the Menu button |

## Project layout

```
index.html              page that loads the game
style.css               full-screen layout
lib/phaser.min.js       the Phaser game framework
manifest.webmanifest    app name, icons and window style (for installing)
sw.js                   service worker — lets the game run offline
_headers                caching rules for Cloudflare Pages
icons/, favicon.ico     the game icon (drawn from the Town Centre art)
src/main.js             starts Phaser (menu → game + interface)
src/iso.js              isometric maths (grid ↔ screen)
src/ui.js               stone panels and buttons used by the menus
src/save.js             saving / loading to browser storage
src/rng.js              seeded random numbers + the state fingerprint (hash)
src/replay.js           storing and listing replays
src/net.js              the connection to an online game (reconnects by itself)
src/setup.js            who is in a game: sides, alliances, computer players (1 v 1, 2 v 2, free-for-all, freeplay)
src/practice.js         Freeplay: gather rates, milestones and personal bests
tools/render_buildings.py  3D models of the buildings, rendered with Blender (see below)
tools/render_units.py   3D people (posed for every walking, working and fighting frame) and the scout's horse
tools/pack_atlases.py   packs the renders into a few sheets
assets/atlas/           the packed sheets (one for people and one for buildings per team colour) and atlas.json
src/trees.js            tree sprites: drawing the oaks and pines, and keeping them in step with the forests
worker/index.js         the Cloudflare Worker: serves the game, opens online rooms
worker/room-core.js     an online room: game codes, 4 seats, spectators, the turn clock, relaying orders, sync checks, chat
wrangler.jsonc          Cloudflare settings (website + Worker + Durable Object)
src/fog.js              fog of war
src/audio.js            all sound effects and ambience (Web Audio synthesis)
src/help.js             the How to Play text
src/scenes/MenuScene.js title screen, new game options, load game
src/art.js              all the art (buildings, units, icons) drawn with code at start-up
src/config.js           settings (map size, seed, starting resources, terrain…)
src/map.js              map generation, resources, painted terrain
src/pathfinding.js      A* pathfinding so units walk around obstacles
src/unit.js             workers and soldiers (gathering, building, walking)
src/buildings.js        eras, building types, research and building behaviour
src/climate.js          CO₂, temperature, wildfires, droughts, storms, sea-level rise
src/ai.js               the enemy computer player
src/scenes/GameScene.js the world, economy, placing buildings, orders
src/scenes/UIScene.js   resource bar, command panel, diamond minimap, climate panel, game menu
```

## Roadmap

- [x] Phase 1 – Design idea
- [x] Phase 2 – Map, camera, select and move units, pathfinding, minimap
- [x] Phase 3 – Economy: gathering, buildings, training units, population
- [x] Phase 4 – Climate system: emissions, global temperature, disasters, sea-level rise
- [x] Phase 5 – Combat and an AI opponent
- [x] Phase 6 – Eras and tech tree
- [x] Phase 7 – Menus, saving and loading
- [x] Phase 8 – Art and sound
- [x] Phase 9 – Hosting (Cloudflare Pages), installable app, itch.io
- [x] Phase 10 – Polish: double-click select, fog of war, sharper art, walk animation, clouds and water glints
- [x] Phase 11 – Command & control: control groups, rally points, idle-worker button, walls and gates
- [x] Phase 12 – Battle & balance: unit counters, attack-move, game speed, end-of-game stats and charts, AI that counters your army
- [x] Phase 13 – Town life: Market trading, town bell and shelter, four map types (Continental, Lakes, Highlands, Great River)
- [x] Phase 14 – The big polish: climate colour grading, burning buildings and ruins, combat effects, birds, rain and dust storms, worker counts, unit portraits, clickable training queue, custom cursors, Continue button, generative music
- [x] Phase 15 – New frontiers: Scout Rider, Field Medic, Field Cannon, Electric Tank; Fishing Dock, Hydro Dam, Geothermal Plant; deer herds and hunting; Wheelbarrow, Fish Farming, Field Medicine and Cool Roofs research; heatwaves
- [x] Phase 16 – Modern Age: a fifth era (Coal → Industrial → Modern → Transition → Green) with Apartment Blocks, Office Towers, Factories and Radar Stations; every building changes look each era; units change look with their upgrades
- [x] Phase 17 – Multiplayer groundwork: the game is deterministic (seeded random numbers, fixed 50 ms ticks with smooth drawing in between, every unit and building has an id) and every player action is a "command" that runs on the next tick. Replays record those commands plus a state fingerprint every 2 seconds, and playback checks the fingerprints match
- [x] Phase 18 – Online 1v1: a lobby with a short invite code, a free Cloudflare Worker + Durable Object relaying commands between players, lockstep networking (both games run the same commands on the same tick), sync checks, reconnecting / rejoining after a refresh, resigning, chat and ping display
- [x] Phase 19 – Bigger matches: up to 4 sides (1 v 1, 2 v 2, 3- and 4-way free-for-all, co-op against the computer), alliances with shared vision, a bigger 4-corner map, online lobby with 4 seats (person / computer / closed) and team picks, spectating, a sides panel. Also: Lumber Camp / Mining Camp / Mill instead of the Storage Shed, deleting units and buildings, better unit art (faces, tabards, outlines), richer ground (flowers, tufts, colour patches) and screen effects
- [x] Phase 19½ – AoE2-style game set-up: quick set-ups (1v1, 1v2, 1v3, 2v1, 2v2, 3v1, 1v1v1, 1v1v1v1), every seat set to you / a computer (own level) / closed, team numbers 1–4 or "–", play as any colour, allies start in neighbouring corners — the same in the online lobby
- [x] Phase 19¾ – Game settings (map size, resources, starting age, population, reveal map, peace time, victory, climate) for single player and online, bridges, smoother movement that squeezes through visible gaps
- [x] Phase 20 – Polish: better animations (smoother walking, tool swings, sword wind-ups, flinches, falls, building completion), tributes between sides, and a Freeplay practice mode with an economy panel, milestones and personal bests
- [x] Phase 20½ – Animation overhaul: a tool and working poses for each job, workers lining up with the exact tree / rock / bush / wall they're working, per-job hit effects, carried loads, spear throws
- [x] Phase 20¾ – Visual overhaul: AoE2-style proportions and colours, tree sprites, textured ground, rocks, earth under buildings
- [x] Phase 20⅞ – Harvest stages: trees fall (away from the axe) and leave stumps, berry bushes are stripped and shrink, rocks are mined away one by one, carcasses go down to bones; workers only stand on open ground to work
- [x] Phase 20⁹⁄₁₀ – 3D-rendered Coal Age: every Coal Age building (except the farm, tree plot, bridge and wind pump) and every Coal Age unit (worker with all seven tools and its upgraded look, soldier, archer, scout on horseback), modelled and rendered in Blender
- [ ] 3D-rendered Industrial Age, then Modern, Transition and Green Ages (one age at a time)
- [x] Phase 20¹⁵⁄₁₆ – Performance: off-screen trees leave the scene in blocks, the scene is only re-sorted when something moves to a new row, fog redraws only when sight changes, and ground changes upload only the changed patch of the texture
- [ ] Phase 21 – Gore update: an optional blood & gore setting (off by default) — blood spatter on hits, bodies that stay on the battlefield longer, more dramatic deaths, scorch marks from explosions
- [ ] Phase 22 – Playtesting feedback

## How the simulation works (for multiplayer)

- **Ticks:** the game world moves in fixed steps of 50 ms (20 per second). Faster game speeds just run more ticks per second. Units are drawn part-way between their last two positions so movement still looks smooth.
- **Random numbers:** anything that changes the game (the AI's choices, wildfires, deer, arrows) uses one seeded random number generator (`src/rng.js`). `Math.random` is only used for looks (smoke, sounds, clouds).
- **Commands:** clicking a button or right-clicking doesn't change the game directly. It creates a small command like `{ k: 'train', b: 12, type: 'worker' }`, which runs at the start of the next tick. Units and buildings are named by their id number.
- **Fingerprints:** every 40 ticks the game turns the important state (positions, health, resources, CO₂, the random-number state) into one number. Two computers running the same game must get the same numbers. If not, they've "desynced".
- **Online (lockstep):** commands go to the room on the Cloudflare server instead of straight into the game. Every 100 ms the room sends both players a numbered *turn* holding everyone's commands. A turn covers 2 ticks, and a game may not run a tick until its turn has arrived. Both games therefore run the same commands on the same tick, and the room compares their fingerprints. The room keeps every turn, so a player who rejoins replays the whole game in a few seconds and carries on.

## Performance

Big maps hold thousands of tree sprites, so trees are culled in 8×8-tile blocks: a block far off screen
leaves the display list entirely until the camera comes back. The scene is only re-sorted when a unit
actually moves to a new screen row. The fog picture is redrawn only when what you can see has changed, and
when the ground changes (a bush picked bare, a flood) only that patch of the big ground texture is sent to
the graphics card instead of all of it. On laptops with two graphics chips the game asks for the fast one.

## 3D-rendered art

Buildings and people are modelled in 3D and rendered into sprites, the way AoE2's art was made: real
materials (plaster, timber, stonework, roof tiles, slate, thatch, mail, leather), sunlight from the upper left
and soft shadows. The camera matches the game's projection exactly, so buildings sit on their footprints, and
the people are posed for every frame the game uses (standing, four walking steps, the wind-up and the blow for
each tool). Where the renders say a tool's blow lands is saved too, so workers still line up with trees and rocks.
The game uses a rendered sprite whenever there is one, and the hand-drawn art otherwise (later ages, for now).

To re-render (needs Blender's Python module: `pip install bpy`, with Python 3.11):

    python tools/render_buildings.py                      # all buildings, in all four team colours
    python tools/render_units.py worker worker1 soldier archer scout
    python tools/pack_atlases.py                          # pack them into assets/atlas
