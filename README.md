# Climate RTS

An Age of Empires–style real-time strategy game built around climate change, made with [Phaser](https://phaser.io).

## How to run it

1. Open this folder in VS Code.
2. Right-click `index.html` → **Open with Live Server**.
3. Make sure you're online (Phaser loads from the internet for now).

## How to play (so far)

- Your **Town Centre** trains workers and is where resources get dropped off.
- Select workers and **right-click trees, stone or berry bushes** to gather. They'll carry loads back automatically.
- With workers selected, press **1–4** (or click the buttons) to build: House, Farm, Storage Shed, Barracks.
- **Houses** raise your population limit. **Farms** give 300 food each. **Storage Sheds** are extra drop-off points — put them near forests and stone.
- Click a building to see it. Town Centre and Barracks have train buttons.

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

## Controls

| Action | Control |
| --- | --- |
| Select a unit / building | Left-click it |
| Select a group | Left-click and drag a box |
| Add/remove from selection | Hold Shift while clicking/dragging |
| Move | Right-click on the map (or on the minimap) |
| Gather | Right-click trees, stone, berries or coal with workers selected |
| Build | Select workers, press 1–6, left-click to place (Shift to place several, right-click/Esc to cancel) |
| Help build / farm | Right-click an unfinished building or a farm with workers |
| Train units / research | Select Town Centre or Barracks, press 1–4 |
| Find idle worker | . (full stop) |
| Pan camera | WASD, arrow keys, or move the mouse to the screen edge |
| Zoom | Mouse wheel |
| Jump camera | Click/drag on the minimap |
| Go home | H |
| Deselect | Esc |

## Project layout

```
index.html              page that loads the game
style.css               full-screen layout
src/main.js             starts Phaser
src/config.js           settings (map size, seed, starting resources, terrain…)
src/map.js              map generation, resources, drawing
src/pathfinding.js      A* pathfinding so units walk around obstacles
src/unit.js             workers and soldiers (gathering, building, walking)
src/buildings.js        building types, upgrades, costs and drawings
src/climate.js          CO₂, temperature, wildfires, droughts, storms, sea-level rise
src/scenes/GameScene.js the world, economy, placing buildings, orders
src/scenes/UIScene.js   top bar, selection panel + buttons, minimap, messages
```

## Roadmap

- [x] Phase 1 – Design idea
- [x] Phase 2 – Map, camera, select and move units, pathfinding, minimap
- [x] Phase 3 – Economy: gathering, buildings, training units, population
- [x] Phase 4 – Climate system: emissions, global temperature, disasters, sea-level rise
- [ ] Phase 5 – Combat and an AI opponent
- [ ] Phase 6 – Eras and tech tree
- [ ] Phase 7 – Menus, saving and loading
- [ ] Phase 8 – Art and sound
- [ ] Phase 9 – Hosting (Cloudflare Pages), installable app, itch.io
- [ ] Phase 10 – Playtesting and balance
