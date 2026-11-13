import asyncio, json
from playwright.async_api import async_playwright
import os
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
ARGS=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]
START = """(d) => { localStorage.clear(); window.__ready=false; setTimeout(() => { const s = game.scene.getScene('MenuScene'); s.scene.start('GameScene', d);
  const poll = () => { const g = game.scene.getScene('GameScene'); if (g && g.sys.isActive() && g.units && g.units.length && g.tick === 0) { g.paused = true; g.renderShots = false; window.__ready = true; } else setTimeout(poll, 100); }; setTimeout(poll, 200); }, 0) }"""
SCRIPT = """(N) => { const g = game.scene.getScene('GameScene');
  const P = (t) => g.units.filter(u => u.team === 'player' && u.type === t);
  const tc = g.buildings.find(b => b.team==='player' && b.type==='town_centre');
  const plan = {
    1: () => g.issue({k:'train', b: tc.id, type:'worker'}),
    2: () => g.issue({k:'train', b: tc.id, type:'worker'}),
    10: () => { const ws = P('worker').slice(0, 2); const r = g.map.nearestResource ? null : null;
      // nearest wood tile
      let best=null, bd=1e9; for (let y=0;y<g.map.h;y++) for (let x=0;x<g.map.w;x++) { if (g.map.resourceAt(x,y)==='wood') { const d=Math.hypot(x-tc.tx,y-tc.ty); if (d<bd){bd=d;best={x,y};} } }
      g.issue({k:'order', ids: ws.map(u=>u.id), x: best.x*32+16, y: best.y*32+16, at:null, deer:null}); },
    40: () => g.issue({k:'move', ids: P('soldier').map(u=>u.id), x: (tc.tx+8)*32, y: (tc.ty+6)*32}),
    100: () => { const w = P('worker')[2]; for (let r=3;r<12;r++) for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) { const x=tc.tx+dx, y=tc.ty+dy; if (g.canPlaceAt('house',x,y)) { g.issue({k:'place', type:'house', tx:x, ty:y, ids:[w.id]}); return; } } },
    150: () => g.issue({k:'rally', b: tc.id, x: tc.tx+6, y: tc.ty+3}),
    160: () => g.issue({k:'train', b: tc.id, type:'worker'}),
    300: () => g.issue({k:'trade', pay:'wood', buy:'food'}),
    500: () => g.issue({k:'amove', ids: P('soldier').map(u=>u.id), x: 51*32, y: 50*32}),
    900: () => g.issue({k:'bell'}),
    1000: () => g.issue({k:'allclear'}),
    1200: () => g.issue({k:'stop', ids: P('soldier').map(u=>u.id)}),
  };
  for (let i = 0; i < N && !g.gameOver; i++) { if (plan[g.tick]) plan[g.tick](); g.tickOnce(); }
  return { tick: g.tick, hash: g.stateHash(), units: g.units.length, res: {...g.resources}, cmds: g.recording ? g.recording.cmds.length : -1 };
}"""
async def start(pg, d):
    await pg.evaluate(START, d)
    await pg.wait_for_function("window.__ready === true", timeout=30000)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width":1280,"height":720})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_function("window.game && game.textures && game.textures.exists(\'atlas_done\')", timeout=120000)
        await start(pg, {"seed": 77, "mapType": "continental", "difficulty": "normal", "fog": True})
        r1 = await pg.evaluate(SCRIPT, 2400)
        print("run1", r1, flush=True)
        rec = await pg.evaluate("(() => { const g = game.scene.getScene('GameScene'); const r = g.finishRecording(); return JSON.parse(JSON.stringify(r)); })()")
        print("recorded: ticks", rec["ticks"], "cmds", len(rec["cmds"]), "hashes", len(rec["hashes"]), "size", len(json.dumps(rec)), flush=True)
        print("cmd kinds", sorted(set(c[1]["k"] for c in rec["cmds"])))
        # same seed + same commands again in the same page
        await start(pg, {"seed": 77, "mapType": "continental", "difficulty": "normal", "fog": True})
        r2 = await pg.evaluate(SCRIPT, 2400)
        print("run2", r2["hash"] == r1["hash"], r2, flush=True)
        # fresh page: play the replay back
        pg2 = await b.new_page(viewport={"width":1280,"height":720})
        pg2.on("pageerror", lambda e: errs.append("pg2 " + str(e)))
        await pg2.goto("http://localhost:8765/index.html"); await pg2.wait_for_function("window.game && game.textures && game.textures.exists(\'atlas_done\')", timeout=120000)
        await start(pg2, {"replay": rec})
        r3 = await pg2.evaluate("""(N) => { const g = game.scene.getScene('GameScene'); while (g.tick < N && !g.gameOver) g.tickOnce();
          return { tick: g.tick, hash: g.stateHash(), desync: g.desync, checks: g.syncChecks, units: g.units.length, fog: g.fog.enabled, res: {...g.resources} }; }""", rec["ticks"])
        print("replay", r3["hash"] == r1["hash"], r3, flush=True)
        # replay with a tampered command should desync
        bad = json.loads(json.dumps(rec)); bad["cmds"] = [c for c in bad["cmds"] if c[1]["k"] != "move"]
        await start(pg2, {"replay": bad})
        r4 = await pg2.evaluate("""(N) => { const g = game.scene.getScene('GameScene'); while (g.tick < N && !g.gameOver) g.tickOnce(); return { desync: g.desync, checks: g.syncChecks }; }""", rec["ticks"])
        print("tampered", r4, flush=True)
        await pg2.evaluate("(() => { const g = game.scene.getScene('GameScene'); g.paused = false; })()")
        await pg2.wait_for_timeout(2500)
        await pg2.screenshot(path="replay.png", timeout=90000)
        print("errors", errs[:8])
        await b.close()
asyncio.run(main())
