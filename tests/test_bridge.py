import asyncio
from playwright.async_api import async_playwright
import os
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
ARGS=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width":1366,"height":768})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_function("window.game && game.textures && game.textures.exists(\'atlas_done\')", timeout=120000)
        await pg.evaluate("""() => setTimeout(() => { game.scene.getScene('MenuScene').scene.start('GameScene', {seed: 31, mapType: 'river', rules: { reveal: 'visible', peace: 20 }});
           const poll = () => { const g = game.scene.getScene('GameScene'); if (g && g.sys.isActive() && g.units && g.units.length) { g.paused = true; g.renderShots = false; window.__ready = true; } else setTimeout(poll, 100); }; setTimeout(poll, 200); }, 0)""")
        await pg.wait_for_function("window.__ready === true", timeout=60000)
        r = await pg.evaluate("""async () => { const g = game.scene.getScene('GameScene'); const { findPath } = await import('./src/pathfinding.js');
          const m = g.map; const T = (x, y) => m.get(x, y);
          // find a straight crossing: land, then 2–7 water tiles in a row, then land again
          let tiles = null, A = null, B = null;
          for (let r = 4; r < 40 && !tiles; r++) for (let y = 12 - r; y <= 12 + r && !tiles; y++) for (let x = 12 - r; x <= 12 + r && !tiles; x++) {
            if (!m.inBounds(x, y) || !m.isWalkable(x, y)) continue;
            for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
              const run = []; let k = 1;
              while (k < 9 && m.inBounds(x+dx*k, y+dy*k) && T(x+dx*k, y+dy*k) === 1) { run.push([x+dx*k, y+dy*k]); k++; }
              if (run.length >= 2 && run.length <= 7 && m.isWalkable(x+dx*k, y+dy*k)) { tiles = run; A = {x, y}; B = {x: x+dx*k, y: y+dy*k}; break; }
            }
          }
          if (!tiles) return { error: 'no crossing found' };
          const before = findPath(m, A.x, A.y, B.x, B.y, 'player');
          g.resources.wood = 1000;
          const ws = g.units.filter(u => u.team === 'player' && u.type === 'worker');
          g.issue({ k: 'wall', type: 'bridge', tiles, ids: ws.map(u => u.id) }); g.tickOnce();
          const bridges = () => g.buildings.filter(b => b.type === 'bridge');
          const placed = bridges().length;
          for (let i = 0; i < 20 * 150 && bridges().some(b => !b.complete); i++) g.tickOnce();
          const after = findPath(m, A.x, A.y, B.x, B.y, 'player');
          const overBridge = (after || []).some(n => m.get(n.x, n.y) === 1);
          // a worker walks across
          const w0 = ws[0]; w0.moveTo(B); for (let i = 0; i < 20 * 40 && w0.path.length; i++) g.tickOnce();
          const cam = g.cameras.main; const c = g.map.tileCenter(tiles[0][0], tiles[0][1]); const { toIso } = await import('./src/iso.js'); const iso = toIso(c.x, c.y); cam.setZoom(2); cam.centerOn(iso.x, iso.y);
          return { A, B, tiles: tiles.length, placed, complete: bridges().filter(b => b.complete).length, secs: Math.round(g.gameTime), pathBefore: before ? before.length : null, pathAfter: after ? after.length : null, overBridge, workerAt: w0.tile, reachedB: Math.abs(w0.tile.x - B.x) + Math.abs(w0.tile.y - B.y) <= 1 };
        }""")
        print(r)
        # smoothing: how many waypoints for a long walk
        r2 = await pg.evaluate("""async () => { const g = game.scene.getScene('GameScene'); const { findPath } = await import('./src/pathfinding.js');
          const u = g.units.find(u => u.team === 'player' && u.type === 'soldier'); const t = u.tile;
          const raw = findPath(g.map, t.x, t.y, t.x + 12, t.y + 3, 'player'); u.moveTo({ x: t.x + 12, y: t.y + 3 });
          return { rawSteps: raw && raw.length, smoothWaypoints: u.path.length }; }""")
        print(r2)
        await pg.evaluate("(() => { const g = game.scene.getScene('GameScene'); g.paused = false; })()")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="bridge.png", timeout=90000)
        print("errors", errs[:5])
        await b.close()
asyncio.run(main())
