import asyncio
from playwright.async_api import async_playwright
import os
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
ERRS=[]
ARGS=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]
async def start(pg, data):
    await pg.evaluate("window.__ready=false")
    await pg.evaluate("""(data) => setTimeout(() => { const cur = game.scene.getScenes(true)[0]; cur.scene.start('GameScene', data);
       const poll = () => { const g = game.scene.getScene('GameScene'); if (g && g.sys.isActive() && g.units && g.units.length) { g.paused = true; window.__ready = true; } else setTimeout(poll, 100); }; setTimeout(poll, 300); }, 0)""", data)
    try:
        await pg.wait_for_function("window.__ready === true", timeout=60000)
    except Exception:
        print("ERRS", ERRS[:3]); raise
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width":1366,"height":768})
        errs=ERRS; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_function("window.game && game.textures && game.textures.exists(\'atlas_done\')", timeout=120000)
        await pg.evaluate("localStorage.removeItem('age-of-emissions-practice')")
        s = await pg.evaluate("""async () => { const m = await import('./src/setup.js'); return m.seatsSetup(m.presetSeats('free'), 'free'); }""")
        await start(pg, {"seed": 77, "mapType": "river", "setup": s})
        r = await pg.evaluate("""() => { const g = game.scene.getScene('GameScene'); g.renderShots = false;
          const tc = g.buildings.find(b => b.type === 'town_centre');
          for (let i = 0; i < 20 * 60; i++) { g.tickOnce(); if (i % 200 === 0) g.issue({ k: 'train', b: tc.id, type: 'worker' }); }
          g.stats.teams[g.me].gathered.wood += 1200; // pretend
          for (let i = 0; i < 20 * 5; i++) g.tickOnce();
          g.issue({ k: 'finish' }); g.tickOnce();
          return { over: g.gameOver, reached: g.practice.reached, pb: JSON.parse(localStorage.getItem('age-of-emissions-practice')), note: g.endNote, rec: g.recording && g.recording.cmds.length };
        }""")
        print('game1', r)
        # replay it
        rep = await pg.evaluate("() => { const g = game.scene.getScene('GameScene'); return g.finishRecording(g.gameOver); }")
        await start(pg, {"replay": rep})
        r = await pg.evaluate("""() => { const g = game.scene.getScene('GameScene'); g.renderShots = false;
          for (let i = 0; i < 20 * 120 && !g.gameOver; i++) g.tickOnce();
          return { over: g.gameOver, desync: g.desync, checks: g.syncChecks, pbStill: JSON.parse(localStorage.getItem('age-of-emissions-practice')) }; }""")
        print('replay', r)
        # second game: best shown and compared
        await start(pg, {"seed": 78, "mapType": "river", "setup": s})
        r = await pg.evaluate("""() => { const g = game.scene.getScene('GameScene'); g.renderShots = false;
          g.stats.teams[g.me].gathered.food += 1500; for (let i = 0; i < 40; i++) g.tickOnce();
          return { reached: g.practice.reached, newBests: g.practice.newBests, up: g.practice.upcoming(2), pb: JSON.parse(localStorage.getItem('age-of-emissions-practice')) }; }""")
        print('game2', r)
        print("errors", errs[:5])
        await b.close()
asyncio.run(main())
