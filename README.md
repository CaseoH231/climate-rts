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

## Put it on itch.io (optional)

1. Zip the folder's contents (`index.html` must be at the top level of the zip — not inside another folder).
2. itch.io → **Upload new project** → Kind of project: **HTML** → upload the zip and tick **This file will be played in the browser**.
3. Viewport: 1366 × 768, tick **Fullscreen button**. Set visibility to **Restricted** or **Draft** if it's just for you.

## Menus & saving

- **Main menu:** New Game (choose **Easy / Normal / Hard**, a **random** or **classic** map, and **fog of war** on/off), Load Game, How to Play.
- **In game:** press **Esc** (with nothing selected), **F10** or the **Menu** button to pause. From there you can **save** to one of 3 slots, **load**, read the help, or quit to the main menu.
- Saves are kept in your browser's storage on this computer.
- **Settings** (main menu or in-game menu): master, sound-effects and ambience volume.

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
| I · Coal Age | Houses, farms, storage, barracks, towers, wind turbines, tree planting; basic upgrades at the Town Centre |
| II · Industrial Age | Workshop (advanced research), Coal Power Plant (lots of energy, lots of CO₂), Riflemen |
| III · Transition Age | Solar Farm, Carbon Capture, Armoured Cars, green research (Smart Grid, Reforestation, Electric Tools) |
| IV · Green Age | Climate Restoration Project (wonder), Climate Shields. Needs **clean** energy to reach. |

Research takes time and is shown by a purple bar. Hover any button to see what it costs and does.

- Your **Town Centre** trains workers and is where resources get dropped off.
- Select workers and **right-click trees, stone or berry bushes** to gather. They'll carry loads back automatically.
- With workers selected, press **1–4** (or click the buttons) to build: House, Farm, Storage Shed, Barracks.
- **Houses** raise your population limit. **Farms** give 300 food each. **Storage Sheds** are extra drop-off points — put them near forests and stone.
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
| Soldier | Riflemen, buildings | Archers, armoured cars |
| Archer | Soldiers, workers | Armoured cars, riflemen |
| Rifleman (Industrial) | Armoured cars | Soldiers |
| Armoured Car (Transition) | Archers, soldiers, buildings | Riflemen |

The enemy watches your army and trains whatever beats it (rarely on Easy, often on Hard).

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
- [ ] Phase 15 – Playtesting feedback
