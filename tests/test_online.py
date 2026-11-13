import asyncio, json, urllib.request
from playwright.async_api import async_playwright
import os
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
ARGS=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]
URL="http://localhost:8790/index.html"
import random
CODE="T" + "".join(random.choice("ABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(4))
HOOK = """(() => { const g = game.scene.getScene('GameScene'); if (!g.__hooked) { g.__hooked = true; window.__h = window.__h || {};
  const ch = g.checkHash.bind(g); g.checkHash = () => { ch(); window.__h[g.tick] = g.stateHash(); }; } return true; })()"""
STATE = """(() => { const g = game.scene.getScene('GameScene'); const ui = game.scene.getScene('UIScene');
  return { active: g.sys.isActive(), me: g.me, tick: g.tick, limit: g.net ? (g.net.maxTurn+1)*2 : null, over: g.gameOver, desync: g.desync, ping: g.net && g.net.ping,
    chat: ui.chatLines ? ui.chatLines.map(l => l.text) : null, wait: !!g.netWait, banner: ui.netBanner && ui.netBanner.visible ? ui.netBanner.text : '',
    units: g.units.filter(u => u.team === g.me).length }; })()"""
async def page(b, errs, tag):
    ctx = await b.new_context(viewport={"width":960,"height":560})
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(f"{tag}: {e}"))
    pg.on("console", lambda m: errs.append(f"{tag} console: {m.text}") if m.type == "error" else None)
    print(tag, "loading", flush=True); await pg.goto(URL, timeout=120000); await pg.wait_for_function("window.game && game.scene.getScene('MenuScene') && game.scene.getScene('MenuScene').sys.isActive()", timeout=120000)
    return pg
async def ingame(pg):
    await pg.wait_for_function("(() => { const g = game.scene.getScene('GameScene'); return g && g.sys.isActive() && g.units && g.units.length > 0; })()", timeout=60000)
    await pg.evaluate(HOOK)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        errs=[]
        A = await page(b, errs, "A"); B = await page(b, errs, "B")
        await A.evaluate("localStorage.setItem('age-of-emissions-name','Adrian')"); await B.evaluate("localStorage.setItem('age-of-emissions-name','Sam')")
        await A.evaluate("game.scene.getScene('MenuScene').show('online')"); await A.wait_for_timeout(1200)
        await A.screenshot(path="mp_online.png", timeout=90000)
        await A.evaluate(f"game.scene.getScene('MenuScene').connectOnline('{CODE}','host')")
        await A.wait_for_timeout(800)
        await B.evaluate(f"game.scene.getScene('MenuScene').connectOnline('{CODE}','join')")
        await A.wait_for_function("game.scene.getScene('MenuScene').net.slots[1] && game.scene.getScene('MenuScene').net.slots[1].kind === 'human'", timeout=10000)
        await A.evaluate("game.scene.getScene('MenuScene').net.send({t:'settings', mapType:'lakes', fog:true})")
        await A.wait_for_timeout(800)
        await A.screenshot(path="mp_lobby_host.png", timeout=90000)
        await B.screenshot(path="mp_lobby_guest.png", timeout=90000)
        # a third person can't join
        C = await page(b, errs, "C")
        await C.evaluate(f"game.scene.getScene('MenuScene').connectOnline('{CODE}','join')"); await C.wait_for_timeout(1500)
        print("third player:", await C.evaluate("game.scene.getScene('MenuScene').netMsg"))
        await C.context.close()
        await A.evaluate("game.scene.getScene('MenuScene').net.send({t:'start'})")
        await ingame(A); await ingame(B)
        print("A", await A.evaluate(STATE)); print("B", await B.evaluate(STATE))
        # orders from both sides
        for pg in (A, B):
            await pg.evaluate("""(() => { const g = game.scene.getScene('GameScene');
              const tc = g.buildings.find(b => b.team === g.me && b.type === 'town_centre');
              g.issue({k:'train', b: tc.id, type:'worker'});
              const sol = g.units.filter(u => u.team === g.me && u.type === 'soldier').map(u => u.id);
              g.issue({k:'move', ids: sol, x: 50*32, y: 50*32});
              const ws = g.units.filter(u => u.team === g.me && u.type === 'worker').slice(0,2).map(u => u.id);
              let best=null, bd=1e9; for (let y=0;y<g.map.h;y++) for (let x=0;x<g.map.w;x++) if (g.map.resourceAt(x,y)==='wood') { const d=Math.hypot(x-tc.tx,y-tc.ty); if (d<bd){bd=d;best={x,y};} }
              g.issue({k:'order', ids: ws, x: best.x*32+16, y: best.y*32+16, at: null, deer: null});
              // try to order the other side's units: must be ignored
              const theirs = g.units.filter(u => u.team === g.foe).map(u => u.id);
              g.issue({k:'move', ids: theirs, p: g.foe, x: 10*32, y: 10*32});
            })()""")
        await A.evaluate("game.scene.getScene('UIScene').openChat(); game.scene.getScene('UIScene').chatInput.value = 'good luck!'; game.scene.getScene('UIScene').chatInput.el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter'}))")
        await A.wait_for_timeout(15000)
        sA = await A.evaluate(STATE); sB = await B.evaluate(STATE)
        print("A", sA); print("B", sB)
        await B.screenshot(path="mp_ingame_guest.png", timeout=90000)
        # connection drop for the guest
        urllib.request.urlopen(f"http://localhost:8790/__drop?code={CODE}&slot=1").read()
        await A.wait_for_timeout(400)
        print("after drop A", await A.evaluate(STATE))
        await A.wait_for_timeout(6000)
        print("after reconnect A", await A.evaluate(STATE)); print("after reconnect B", await B.evaluate(STATE))
        # guest refreshes the page and rejoins
        await B.reload(timeout=120000); await B.wait_for_function("window.game && game.scene.getScene('MenuScene') && game.scene.getScene('MenuScene').sys.isActive()", timeout=120000)
        last = await B.evaluate("JSON.parse(localStorage.getItem('age-of-emissions-last-online-game'))")
        print("rejoin info", last)
        await B.evaluate("(() => { const m = game.scene.getScene('MenuScene'); const l = JSON.parse(localStorage.getItem('age-of-emissions-last-online-game')); m.connectOnline(l.code, l.role); })()")
        await ingame(B)
        await B.wait_for_timeout(1500)
        print("rejoining B", await B.evaluate(STATE))
        await B.screenshot(path="mp_catchup.png", timeout=90000)
        for i in range(30):
            sB = await B.evaluate(STATE)
            if sB['limit'] - sB['tick'] < 20: break
            await B.wait_for_timeout(1000)
        print("caught up B", sB, "A", await A.evaluate(STATE))
        await A.wait_for_timeout(5000)
        hA = await A.evaluate("window.__h"); hB = await B.evaluate("window.__h")
        common = sorted(set(hA) & set(hB), key=int)
        diff = [t for t in common if hA[t] != hB[t]]
        print("hash ticks compared:", len(common), "first", common[:2], "last", common[-2:], "mismatches", diff[:5])
        # guest resigns
        await B.evaluate("game.scene.getScene('GameScene').resign()")
        await A.wait_for_function("game.scene.getScene('GameScene').gameOver", timeout=20000)
        await B.wait_for_function("game.scene.getScene('GameScene').gameOver", timeout=20000)
        print("results", await A.evaluate("[game.scene.getScene('GameScene').gameOver, game.scene.getScene('GameScene').endNote]"), await B.evaluate("[game.scene.getScene('GameScene').gameOver, game.scene.getScene('GameScene').endNote]"))
        await A.wait_for_timeout(1500)
        await A.screenshot(path="mp_gameover_host.png", timeout=90000)
        rep = await A.evaluate("(async () => { const { listReplays } = await import('./src/replay.js'); const r = listReplays()[0]; return r && { mp: r.mp, me: r.me, cmds: r.cmds.length, ticks: r.ticks, names: r.names }; })()")
        print("replay", rep)
        # play the online game's replay back on the host's computer
        await A.evaluate("(async () => { const { listReplays } = await import('./src/replay.js'); game.scene.getScene('GameScene').scene.start('GameScene', { replay: listReplays()[0] }); })()")
        await A.wait_for_function("(() => { const g = game.scene.getScene('GameScene'); return g && g.sys.isActive() && g.replay && g.units.length; })()", timeout=60000)
        r = await A.evaluate("(() => { const g = game.scene.getScene('GameScene'); g.paused = true; while (!g.gameOver && g.tick < g.replay.ticks) g.tickOnce(); return { tick: g.tick, over: g.gameOver, desync: g.desync, checks: g.syncChecks, ai: !!g.ai, me: g.me, kinds: g.replay.cmds.map(c => c[0] + ':' + c[1].k + ':' + c[1].p), resigned: g.resigned, mp: g.mp }; })()")
        print("mp replay", r)
        print("errors", errs[:10])
        await b.close()
asyncio.run(main())
