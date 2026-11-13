# Age of Emissions — notes for Claude

Isometric AoE2-style RTS about climate change (Phaser 3, plain ES modules, no build step). Personal project.

**If asked to "do the next phase": open `docs/ROADMAP.md`, do the first unchecked phase under "Next up", and follow `docs/HANDOFF.md`.**

Key rules (details in `docs/HANDOFF.md`):
- The simulation is deterministic lockstep. Sim code never uses `Math.random`, real time or screen state — only the seeded RNG in `src/rng.js`. Visual-only code may.
- Run `bash tests/run_tests.sh` before pushing; everything must PASS.
- Each release: bump `GAME_VERSION` (`src/config.js`) and the `sw.js` cache name, update the README roadmap and `docs/ROADMAP.md`, commit and push to `main` (that redeploys the site).
- Don't ask the user for permission to start; just do the work and push.
- After every phase or big update, summarise what changed in plain language and end with `Total lines of code: N` (command in HANDOFF.md).
- Breaking old saves/replays is fine — just mention it.
