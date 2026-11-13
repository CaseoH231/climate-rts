# Handoff notes for Claude sessions

Read this before changing anything. The roadmap with the next phase is in [ROADMAP.md](ROADMAP.md).

## The user

- This is a personal project (not published). The user isn't a programmer and doesn't know how the tooling works: explain things simply and just do the work — don't ask for permission to start, and commit + push to `main` yourself when a phase is done.
- **After every phase or big update, write a short summary of what changed and end the message with `Total lines of code: N`** (see "Counting lines" below). This is a standing request.
- Saves don't matter — it's fine for a change to break old saves (old replays desyncing after a sim change is fine too, just mention it).
- Pushing to `main` redeploys the game to Cloudflare (Worker "climate-rts", https://climate-rts.adrian11jonker.workers.dev). The user pulls the repo into VS Code on Windows.

## What it is

Age of Emissions — an Age of Empires 2–style isometric RTS about climate change, made with Phaser 3.80.1 (`lib/phaser.min.js`). Plain ES modules, no build step: `index.html` loads `src/main.js`. Serve the repo root with any static server (`python3 -m http.server 8765`) and open `http://localhost:8765`.

## File map

| Path | What's in it |
|---|---|
| `src/main.js` | starts Phaser (MenuScene → GameScene + UIScene) |
| `src/config.js` | constants, unit/building/tech definitions, `GAME_VERSION` |
| `src/scenes/MenuScene.js` | menus, game set-up, online lobby, settings; preloads the 3D atlases |
| `src/scenes/GameScene.js` | the game: tick loop, commands, camera, input, culling |
| `src/scenes/UIScene.js` | HUD, panels, minimap, economy panel |
| `src/unit.js`, `src/buildings.js` | unit/building logic + their drawing |
| `src/art.js` | textures: installs the rendered atlases, falls back to procedural art |
| `src/effects.js` | visual effects: smoke, hits, flinches, deaths, ruins, floating text, birds |
| `src/map.js`, `src/trees.js`, `src/fog.js`, `src/iso.js` | map generation and ground texture, trees (chunk-culled), fog of war, iso maths |
| `src/pathfinding.js` | A* with stamp-based scratch arrays |
| `src/climate.js`, `src/ai.js`, `src/wildlife.js`, `src/practice.js`, `src/stats.js` | climate/disasters, computer player, deer/fish, Freeplay mode, end-of-game stats |
| `src/rng.js`, `src/replay.js`, `src/net.js`, `src/save.js` | seeded RNG, replays, online client, saves |
| `src/civs.js` | civilisations: bonuses, unique units, Random (settled from the seed) |
| `src/setup.js`, `src/help.js`, `src/audio.js`, `src/cursors.js`, `src/ui.js` | game set-up model, help text, sound + settings storage, cursors, UI helpers |
| `worker/index.js`, `worker/room-core.js` | Cloudflare Worker + Durable Object that relays online games |
| `tools/*.py` | Blender render scripts and atlas packer (see below) |
| `assets/atlas/` | packed WebP sprite sheets + `atlas.json` (the 3D art the game uses) |
| `tests/` | automated tests — `bash tests/run_tests.sh` |
| `sw.js` | service worker (offline cache) |

## Determinism — the most important rule

The simulation is deterministic lockstep (`TICK_MS = 50`). Every player action is a command (`issue()` → `execute` on a later tick). Replays and online games only work if every machine computes exactly the same thing.

- **Simulation code must never use `Math.random()`, `Date.now()`, `performance.now()`, frame time, or anything that depends on what's on screen.** Use the seeded RNG from `src/rng.js`. Iterate in a stable order (ids), never over Sets/Maps whose order could differ.
- Drawing/effects code (anything that only changes what's on screen) may use `Math.random` and real time freely.
- A state fingerprint (`stateHash`) is compared every 40 ticks. The replay and online tests check it. If you change simulation behaviour on purpose, old replays will desync — that's OK, tell the user.

## Testing

```bash
pip install playwright && playwright install chromium   # once, if not installed
bash tests/run_tests.sh          # everything (~6–8 min)
bash tests/run_tests.sh quick    # skips the 16-minute AI game
```

It starts a static server on :8765 and the local multiplayer server (`tests/mpserver.mjs`, uses `worker/room-core.js`) on :8790, then prints PASS/FAIL for: room logic, replay sync, online 1v1 (lockstep, drop, rejoin), Freeplay, bridges, and a 16-minute computer-vs-computer game (it also passes if one side genuinely wins after 12+ minutes). Run it before every push. The Python tests use headless Chromium with SwiftShader WebGL; they wait for `game.textures.exists('atlas_done')` before starting.

Also look at the game yourself when you change visuals: take a screenshot with Playwright and Read the PNG.

## 3D art pipeline

All buildings and units are modelled in Python with Blender (`bpy`) and rendered to sprites. Renders go to `tools/renders/` (gitignored); only the packed atlases are committed.

```bash
# one-time: Blender as a Python module needs Python 3.11
uv venv -p 3.11 ~/bl311 && VIRTUAL_ENV=~/bl311 uv pip install bpy pillow numpy
source ~/bl311/bin/activate

python tools/render_buildings.py --style 0        # one era (0 Coal … 4 Green), all teams
python tools/render_buildings.py --shared         # crop stages, saplings, wind rotor overlays
python tools/render_units.py --team 0             # units for one team colour (omit for all)
python tools/pack_atlases.py                      # -> assets/atlas/*.webp + atlas.json
python tools/pack_atlases.py --append civunits    # only NEW unit renders onto new sheets; existing sheets untouched
```

Check each script's argparse for the full options (single building/unit, quick previews).

Gotchas:
- **A fresh clone has no `tools/renders/`.** A plain `pack_atlases.py` would rebuild the sheets from only what you just rendered and wipe the rest. To add a few sprites, render them and use `--append NAME`.
- New person units: add the look in `render_units.py` (`hat`, `extras`, `SPECS`), plus a drawn fallback in `UNIT_ART` (art.js).
- **The camera sees the +x and −y faces of a Blender model.** Every model is mirrored (`ROOT_OBJ.scale.y = -1`, `location.y = -h`) so the front (door, windows) faces the viewer. Put details on the faces the camera sees.
- Limbs pointing *up* (necks, antlers): use `up_limb`, not `limb()` with a flipped rotation — that doesn't flip about the joint.
- Canvas presets in `render_units.py`: PERSON, RIDER, VEHICLE (ground point 0.72, not 0.86), DEER. Wrong canvas = units float or sink.
- Each unit frame records where its feet/tool touch (`contacts.json` → `atlas.json`) — the game uses those so workers stand at the tree/rock they work. Smoke/steam points are recorded by `emit_at` in the building script (→ `points`).
- `ensureBuildingTex` falls back to the newest rendered era ≤ the current one, and procedural art if nothing is rendered.
- Textures are cut from the sheets lazily on first use (`installRenderedTextures` in `art.js`) — don't eagerly slice everything, it costs ~1 GB and slow loads.
- Iso maths: `P(x,y,z) = [x − y, (x+y)/2 − z]`. A building container sits at its footprint's top corner; its image goes at `(-tex.ox, -tex.oy)`, origin 0, scale `1/ART_RES` (`ART_RES = 2`).

## Performance

The game must stay smooth in late games with 4 sides. Things already in place — don't undo them:
- Trees are in 8×8-tile chunks that are hidden off-screen; depth is quantised (`depthQ`) so sorting only happens when something changes row.
- `cullObjects` sets `cameraFilter` every 3 frames for off-screen units/buildings.
- Fog redraws only the changed patch (`uploadPatch`); the ground uploads only changed patches (`repaintGround` / `uploadGround`).
- Smoke is culled to camera + fog and capped at 260 puffs.
- `findPath` checks `map.regionOf` first, so a search between two unconnected areas costs nothing (a failed A* used to cost ~30 ms). Keep every map change going through `map.js` methods (or set `map.regionsDirty = true`).
- `aheadBlocked` only re-plans when the blocker is more than 1.5 tiles ahead (otherwise units froze re-planning every tick).

Anything new that draws many objects (decals, corpses, particles) needs a cap and off-screen culling.

## Screen size

The game draws at (window size ÷ k) and the canvas is stretched to the window (`uiScale` in `src/ui.js`, patched into Phaser in `src/main.js`). Lay things out from `this.scale.width/height` as before; pointer coordinates are already in game pixels. HTML inputs (`htmlInput`) scale themselves.

## Releasing a change

1. Bump `GAME_VERSION` in `src/config.js` and the cache name in `sw.js` (`age-of-emissions-vNN`) so players get the new files.
2. Update `README.md` (the roadmap at the bottom, and any section that describes what you changed) and tick the phase in `docs/ROADMAP.md`.
3. `bash tests/run_tests.sh` — all PASS.
4. Commit with a clear message and push to `main`.

## Counting lines

```bash
find src worker tools tests sw.js index.html style.css -type f \
  \( -name '*.js' -o -name '*.py' -o -name '*.html' -o -name '*.css' -o -name '*.mjs' -o -name '*.sh' \) \
  -not -path '*/renders/*' | xargs cat | wc -l
```

End the summary with `Total lines of code: N`.
