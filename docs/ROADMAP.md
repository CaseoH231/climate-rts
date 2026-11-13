# Roadmap

This is the to-do list for Age of Emissions. **If you are a Claude session asked to "do the next phase", do the first unchecked phase under "Next up"**, following [HANDOFF.md](HANDOFF.md). When it's done, tick it here *and* in the roadmap at the bottom of `README.md`, then commit and push.

## Done (short version — README.md has the full list)

- Phases 1–9: the game itself — map, economy, climate system, combat + AI, eras and tech tree, menus and saves, art and sound, hosting.
- Phases 10–15: polish, control groups, walls, unit counters, Market, four map types, disasters, new units and buildings, wildlife.
- Phase 16: the Modern Age (5 eras: Coal → Industrial → Modern → Transition → Green).
- Phases 17–19¾: deterministic lockstep simulation, replays, online play on a Cloudflare Durable Object (up to 4 sides, teams, spectating), AoE2-style game set-up and game settings, bridges.
- Phase 22 (v29–v30): playtest fixes — no freezes in big games, bridges for stranded workers, UI size / small windows; greener computer players, Town Centres can be rebuilt, computers recover from raids.
- Phase 22 part 1 (v29): playtest fixes — no freezes in big games, bridges for stranded workers, UI size / small windows.
- Phase 21 (v28): optional Blood & gore setting — blood, lasting bodies, varied deaths, scorch marks. Visual only.
- Phase 20 and its halves/quarters: better animations, tributes, Freeplay practice mode, animation overhaul (workers line up with what they work), visual overhaul, harvest stages, **every building and unit of all 5 eras rendered in 3D with Blender**, two performance passes.

Current version: `GAME_VERSION` in `src/config.js` (v30 at the time of writing).

## Next up

### [x] Phase 21 – Gore update (done in v28)

An optional **"Blood & gore"** setting, **off by default**.

- Add a toggle on the menu's Settings page (`src/scenes/MenuScene.js`, the `view === 'settings'` branch). Store it with the other settings in `src/audio.js` (`SETTINGS_KEY` in localStorage) or a small key of its own, and read it in `src/effects.js`.
- **Blood spatter on hits** — small red particles and a few splats on the ground when a person (not a vehicle, not a building) is hit. Hits are drawn in `effects.js` (look for the flinch near "a small flinch").
- **Bodies stay on the battlefield longer** — `death(u)` in `effects.js` fades the fallen unit; with gore on, keep the body (and a blood pool under it) for ~60 s, then fade. Keep a cap (e.g. 120 bodies) and drop the oldest first, so long games stay fast.
- **More dramatic deaths** — a few varied falls (knocked back, spun, slumped), arrows/spears left in the body, horses falling with their rider.
- **Scorch marks from explosions** — cannon, tank and fire hits leave a dark scorch decal on the ground that fades over a minute or two (also capped).
- Animals (deer when hunted) can bleed too when the setting is on.

**Rules for this phase:**
- It must be **visual only**. Nothing here may change the simulation (no new commands, no use of the game's seeded RNG, no changes to unit state that affects gameplay). Use `Math.random` for looks only. The replay and online tests must still pass and old replays from v27 must still play back.
- With the setting off, the game must look exactly as before.
- Mention the new setting in `src/help.js` if there is a settings/help section that lists options.
- Check performance in a late game (see HANDOFF.md "Performance") — decals and bodies must be culled off-screen and capped.

### [x] Phase 22 – Playtesting feedback (v29: items 1, 2, 6 and some of 7; v30: items 3, 4, 5 as the user chose)

From a Claude playtest of **v28 on the live site (13 Nov 2026)**. Games played:
- a 1 v 1 against a Normal computer, started and played through the menus;
- a 4-way free-for-all, all computers on Hard, with fighting;
- a 4-way free-for-all, all computers on Normal, 20-minute peace time and the map revealed, run until it ended;
- a short 1 v 1 fight with Blood & gore on;
- Freeplay.

Screen sizes: 1366×768, 1024×600 and a ~750×630 window. There were no JavaScript errors in any game. If the user has notes of their own, add them here before starting. The list is in priority order.

**1. ✅ (v29) The game freezes in big games because units keep retrying paths they can't walk (biggest problem)**
- **Done:** `map.regionOf` labels connected areas (walls/gates count as open, recomputed lazily when the map changes); `findPath` returns null at once across areas. Results are identical to before (checked on all 6 map types), so replays still match. The "remember unreachable targets" part wasn't needed.
- **What happened:** in the 4-side game at ~21 min (~290 units, speed ×1) the game averaged ~44 FPS but froze for 0.1–0.25 s about once a second. The 99th-percentile frame took 196 ms; the worst took 227 ms.
- **Cause, soldiers:** a soldier sees an enemy it can't walk to (here, six Yellow attackers at tiles 5,37 and 7,40 looking at Blue across water). The loop goes:
  - `updateAttack` (`src/unit.js`, the `walkToAny` / `wallInTheWay` block) runs up to 4 `findPath` calls plus 1 more in `wallInTheWay`, and all of them fail;
  - the unit gives up (`stop()`);
  - 0.5 s later the idle-soldier scan (`findEnemyNear`) picks the same enemy again.

  A failed A* search explores the whole reachable area, ~34 ms on an 88×88 map. So each stuck soldier costs ~35 ms every second.
- **Cause, computer players:** the same thing happens in their economy. `assignWorker` (`src/ai.js`) re-orders stranded idle workers on every think. Each `orderGather` → `goToResource` fails in ~17 ms, and it tries all four resources. Measured `think()` at 66–100 ms when it had stranded workers.
- **Fix idea:**
  - Give the map a "which connected area is this tile in" label: flood-fill region ids, recomputed when tiles change (building placed or removed, trees cut, sea rise, bridge finished). `findPath` then returns `null` at once when start and goal are in different areas.
  - Also let a unit remember "can't reach target X" for a few seconds so it doesn't pick that target again straight away.
  - Region ids are sim state, so build them only from the map, in a fixed order. Don't use `Math.random`.
- **Check it:** run the AI-vs-AI test and a 4-side late game (HANDOFF.md "Performance").

**2. ✅ (v29) Sea-level rise can cut a base off, and nobody recovers**
- **Done:** after each flood the player is told how many workers are cut off (`warnCutOff`); computer players check every 15 s and lay a bridge (≤ 24 sections, over water/rock/forest) to their stranded workers (`bridgeToStranded` / `planBridge` in `ai.js`). Also fixed: workers started a bridge from the far bank when it had land at both ends. Flooding itself is unchanged.
- In the Normal 4-way game, sea stage 3 (by ~16 min) flooded 811 tiles. That cut Blue's corner off from the rest of the map, apart from a route through solid forest. Blue's workers and the camps/houses it had built in the south were stranded.
- The computer never builds a bridge or chops a way through, so it kept failing and made problem 1 worse.
- Ideas:
  - the computer builds a bridge (or clears trees) when its town is cut off from its workers or resources;
  - warn the player when a flood splits their land ("Workers cut off by the sea — build a Bridge");
  - possibly never flood the last land link between a Town Centre and the main land.

**3. ✅ (v30) The climate collapses before anyone can win a Green Victory in 3–4 side games**
- **User chose: computers go green** (not fewer emissions, not a countdown). Done in `ai.js`: `greenLevel` (0 coal ok / 1 from the Modern Age or +1 °C / 2 from the Transition Age); no new coal plants once green; wind turbines (1 early, up to 6), solar farms, Carbon Capture when hot, groves of trees every minute or so once above +1 °C, coal plants retired with enough clean power, coal mining cut to 7% / 3%, Smart Grid and Reforestation researched. Same 4-way Normal game (seed 11): +1.6 °C at 20 min instead of +3.35 °C.
- 4 computer sides, Normal climate:
  - 10 min: 431 ppm, +1.7 °C
  - 15 min: +3.1 °C
  - 20 min: +4.3 °C
  - 24:16: collapse (+5 °C, everyone loses)

  All four sides were still in the Modern Age and none had gathered any clean energy. The Hard 4-way game with fighting heated up at the same pace (+1.7 °C at 10 min).
- The computer only ever builds Coal Power Plants for energy: the single `power_plant` wish in `src/ai.js`. It never builds Wind Turbines, Solar Farms or Carbon Capture. So in 1 v 2 / 1 v 3 games the player can't stop the warming however green they play.
- Ideas:
  - computer players switch to clean power and plant trees in the Transition/Green Ages, and build Carbon Capture when it's hot (perhaps more on Easy, less on Hard);
  - scale emissions down with the number of sides, or default Climate to Gentle for 3–4 sides;
  - show a "collapse in about N min at this rate" line in the climate panel so players see it coming.

**4. ✅ (v30) Losing your one Town Centre ends the game at once**
- **User chose: rebuild only** (no grace period). Workers can build a Town Centre from the Industrial Age (`buildEra: 1`, 300 wood + 250 stone, 90 s; key B on the first page — Plant Trees moved to the Energy & climate page). Losing your last *finished* Town Centre still knocks you out at once; a foundation doesn't count.
- Workers can't build a Town Centre (it isn't in `WORKER_PAGES`, `src/buildings.js`), and `checkGameOver` knocks a side out the moment it has none, whatever army or buildings it still has. In the 1 v 1 my side's TC fell at 13:18 and the game ended right there.
- Ideas:
  - let workers build another Town Centre (Industrial Age or later, expensive);
  - and/or a grace period ("Rebuild a Town Centre within 2:00 or you're out");
  - at least a loud warning and a camera jump when the TC drops below half health.

**5. ✅ (v30) Computer players can be wiped out early and then sit there forever; the Normal computer gets big fast**
- **User chose: smarter recovery** (difficulty unchanged). Computers keep 50 food back for a worker when they have under 5, train workers even while saving for an age when they have under 4, build a Market (Industrial Age, 12+ workers) and buy food there when out, ring the town bell when raiders outnumber their guards (all clear 20 s after), and resign after 2 minutes with no workers, no army, no food and nothing to trade.
- Fixed on the way: a worker sheltering in a building could still be killed by whoever was attacking it, and then came back out dead at the all-clear (crash). Units inside buildings can't be hit now.
- 4-way Hard: by 10 min three of the four sides had 0 workers and under 50 food. They could never train another worker, but their TCs stood, so they weren't out either.
- Ideas:
  - the computer keeps 50 food back for a worker;
  - it uses a Market when it has no food;
  - it rings the town bell when raided.
- 1 v 1 Normal: the computer had 15 archers + 3 soldiers at 6:45, and its attack force at ~13 min was 18 units. That's probably a lot for a new player, so look at the difficulty curve (`DIFFICULTY` in `src/ai.js`).

**6. ✅ (v29) Small windows**
- **Done:** a UI size setting (`uiScale` in `ui.js`, applied in `main.js` by drawing at window ÷ k and stretching the canvas). "Auto" shrinks to fit windows under 1280×720 (1024×600 now draws at 1280×750), so the menu, bottom panel and help text fit. The age name is placed between the population and the speed and shrinks if needed (`placeEra`).
- **Top bar at 1024 px wide:** the population text runs into the age name ("0 / 10Coal Age"). `popText` is fixed at x≈560 and the age name is centred at `w/2 + 120` (`src/scenes/UIScene.js`). Longer names like "Transition Age (paused)" will collide on wider screens too. Fix: move or shrink the age label on narrow screens.
- **Bottom panel at 1024×600:** the "Your people" help text in the panel only just fits; its last line sits on the bottom edge of the screen.
- **Main menu in a ~750×630 window:** the button panel runs off the bottom (Settings is cut off). Scale the menu to fit the window height.
- **No UI size setting:** the bottom panel (`PANEL_H = 180`) takes 23% of a 1366×768 laptop screen. A "UI size" option in Settings would help.

**7. Smaller things**
- **How to Play:** it's one long scrolling wall of 37 tips. Split it into short pages (Basics, Economy, Army, Climate, Online), or add a first-game tutorial whose tips pop up as you play.
- **Sides panel:** it shows every enemy's exact army size (⚔ count) even under fog of war, which is free scouting. Maybe show it only when the map is revealed or you've spotted their army.
- ✅ (v29) **Mouse-wheel zoom:** it zooms on the screen centre, not on the mouse pointer (the `wheel` handler in `GameScene.js` only calls `setZoom`).
- **Colour at +4 °C:** the climate colour grading turns the whole map grey-brown. Check that units and team colours still stand out from the ground.
- ✅ (v29) **Freeplay set-up screen:** it still shows "All computers: Easy / Normal / Hard" although there are no computers.

**What worked well (keep it):**
- no console errors in ~1 hour across 5 games;
- 60 FPS in a 1 v 1;
- the 3D buildings look great up close;
- Blood & gore works (pools, arrows left in bodies, bodies that stay a while) and is off by default;
- drought / heatwave / wildfire / sea-rise warnings are clear;
- the end-of-game stats and charts;
- deleting the Town Centre asks twice.

**Rules for this phase:**
- Fix 1, 2 and 6 straight away; they are clear bugs.
- 3, 4 and 5 change how the game plays and how hard it is, so ask the user which direction they want before changing them.
- The pathfinding/region change (1) and computer-player changes are simulation changes. Keep them deterministic and run `bash tests/run_tests.sh`. Old replays may desync; that's fine, just mention it.

## Ideas for later (ask the user before doing any of these)

- Naval units (transport boats, warships) for the Lakes and Great River maps.
- Campaign / scenario mode with short historical-ish missions.
- More civilisations with a few unique units and bonuses each.
- Ranked online games or a simple ELO kept in the Durable Object.
- Map editor.
- Sound refresh for the 3D-rendered eras.
