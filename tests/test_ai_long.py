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
        await pg.evaluate("""() => setTimeout(async () => { const { soloSetup } = await import('./src/setup.js'); const setup = soloSetup('1v1', 'normal'); setup.teams.forEach(t => t.ai = 'normal');
           game.scene.getScene('MenuScene').scene.start('GameScene', {seed: 4242, setup, fog: false});
           const poll = () => { const g = game.scene.getScene('GameScene'); if (g && g.sys.isActive() && g.units && g.units.length && g.tick === 0) { g.paused = true; g.renderShots = false; window.__ready = true; } else setTimeout(poll, 100); }; setTimeout(poll, 200); }, 0)""")
        await pg.wait_for_function("window.__ready === true", timeout=60000)
        last = None
        for m in [4, 8, 12, 16]:
            r = await pg.evaluate("""(() => { const g = game.scene.getScene('GameScene'); for (let i=0;i<4800 && !g.gameOver;i++) g.tickOnce();
              const cnt = (t) => { const o = {}; for (const b of g.buildings.filter(b => b.team === t)) o[b.type] = (o[b.type]||0)+1; return o; };
              const gathered = (t) => g.stats.teams[t].gathered;
              return { min: Math.round(g.gameTime/60), over: g.gameOver, blue: cnt('player'), red: cnt('enemy'), gB: gathered('player'), w: g.units.filter(u=>u.type==='worker').length }; })()""")
            print(r, flush=True)
            last = r
            if r['over']: break
        print("errors", errs[:5])
        # Passes if the game ran 16 minutes, or one side really won after at least 12 (no errors either way).
        ok = not errs and last and (last['min'] >= 16 or (last['over'] == 'victory' and last['min'] >= 12))
        print("LONG_OK" if ok else "LONG_FAIL", flush=True)
        await b.close()
asyncio.run(main())
