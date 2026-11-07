# Climate RTS

An Age of Empires–style real-time strategy game built around climate change, made with [Phaser](https://phaser.io).

## How to run it

1. Open this folder in VS Code.
2. Right-click `index.html` → **Open with Live Server**.
3. Make sure you're online (Phaser loads from the internet for now).

## Controls

| Action | Control |
| --- | --- |
| Select a unit | Left-click it |
| Select a group | Left-click and drag a box |
| Add/remove from selection | Hold Shift while clicking/dragging |
| Move | Right-click on the map (or on the minimap) |
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
src/config.js           settings (map size, seed, terrain colours…)
src/map.js              map generation + drawing
src/pathfinding.js      A* pathfinding so units walk around water/forest/stone
src/unit.js             workers and soldiers
src/scenes/GameScene.js the world, camera and controls
src/scenes/UIScene.js   top bar, selection panel, minimap
```

## Roadmap

- [x] Phase 1 – Design idea
- [x] Phase 2 – Map, camera, select and move units, pathfinding, minimap
- [ ] Phase 3 – Economy: gathering, buildings, training units
- [ ] Phase 4 – Climate system: emissions, global temperature, disasters, sea-level rise
- [ ] Phase 5 – Combat and an AI opponent
- [ ] Phase 6 – Eras and tech tree
- [ ] Phase 7 – Menus, saving and loading
- [ ] Phase 8 – Art and sound
- [ ] Phase 9 – Hosting (Cloudflare Pages), installable app, itch.io
- [ ] Phase 10 – Playtesting and balance
