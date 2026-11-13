# Roadmap

This is the to-do list for Age of Emissions. **If you are a Claude session asked to "do the next phase", do the first unchecked phase under "Next up"**, following [HANDOFF.md](HANDOFF.md). When it's done, tick it here *and* in the roadmap at the bottom of `README.md`, then commit and push.

## Done (short version — README.md has the full list)

- Phases 1–9: the game itself — map, economy, climate system, combat + AI, eras and tech tree, menus and saves, art and sound, hosting.
- Phases 10–15: polish, control groups, walls, unit counters, Market, four map types, disasters, new units and buildings, wildlife.
- Phase 16: the Modern Age (5 eras: Coal → Industrial → Modern → Transition → Green).
- Phases 17–19¾: deterministic lockstep simulation, replays, online play on a Cloudflare Durable Object (up to 4 sides, teams, spectating), AoE2-style game set-up and game settings, bridges.
- Phase 20 and its halves/quarters: better animations, tributes, Freeplay practice mode, animation overhaul (workers line up with what they work), visual overhaul, harvest stages, **every building and unit of all 5 eras rendered in 3D with Blender**, two performance passes.

Current version: `GAME_VERSION` in `src/config.js` (v27 at the time of writing).

## Next up

### [ ] Phase 21 – Gore update

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

### [ ] Phase 22 – Playtesting feedback

Ask the user what they noticed while playing and turn it into a list here before starting. Don't guess.

## Ideas for later (ask the user before doing any of these)

- Naval units (transport boats, warships) for the Lakes and Great River maps.
- Campaign / scenario mode with short historical-ish missions.
- More civilisations with a few unique units and bonuses each.
- Ranked online games or a simple ELO kept in the Durable Object.
- Map editor.
- Sound refresh for the 3D-rendered eras.
