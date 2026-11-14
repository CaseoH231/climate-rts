# Plays the whole tutorial: does what each step asks and checks it moves on, up to "Tutorial complete".
import asyncio, json, sys, os
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
from playwright.async_api import async_playwright
LESSON = sys.argv[1] if len(sys.argv) > 1 else 'full'
DRIVE = """() => { const w = game.scene.getScene('GameScene'); const t = w.tutorial; const s = t.step; if (!s) return { end: true, over: w.gameOver };
  const me = w.self; const tc = w.buildings.find(b => b.team===me && b.type==='town_centre');
  const U = w.units.find(u => u.team===me && u.type==='worker').constructor;
  const title = s.title; const before = t.i;
  const worker = () => w.units.find(u => u.team===me && u.type==='worker' && !(u.order && u.order.kind==='gather'));
  const gather = (res) => { const r = w.map.nearestResource(res, tc.tx+1, tc.ty+1, 40); worker().orderGather(r); };
  if (s.manual) t.press();
  else if (title === 'Select a worker') { const u = w.units.find(u => u.team===me && u.type==='worker'); w.selected.add(u); }
  else if (title === 'Chop wood') gather('wood');
  else if (title === 'Gather food') gather('food');
  else if (title === 'Mine stone') gather('stone');
  else if (title === 'Mine coal') gather('fuel');
  else if (s.hl && s.hl.startsWith('build:')) { t.placeNear(s.hl.slice(6), tc); }
  else if (s.hl && s.hl.startsWith('train:')) { const ty = s.hl.slice(6); for (let i=0;i<3;i++) w.units.push(new U(w, w.map, tc.tx+1, tc.ty+4+i, ty, me)); }
  else if (s.hl && s.hl.startsWith('research:')) w.teams[me].upgrades.add(s.hl.slice(9));
  else if (s.hl === 'era') { w.teams[me].era++; w.restyleTeam(me); }
  else if (s.hl === 'trade') w.trade('wood', 'food', me);
  else if (title === 'Ring the town bell') w.ringBell(me);
  else if (title === 'All clear') w.allClear(me);
  else if (title === 'Raiders!') { for (const u of t.c.raiders) w.killUnit(u); }
  for (let i=0;i<30;i++) w.tickOnce();
  return { step: before, title, now: t.i, status: t.status(), over: w.gameOver }; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":1366,"height":768})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function("window.game && game.textures && game.textures.exists('atlas_done')", timeout=120000)
        await pg.evaluate("(l) => import('./src/tutorial.js').then(m => game.scene.getScenes(true)[0].scene.start('GameScene', m.tutorialGameData(l)))", LESSON)
        await pg.wait_for_function("(() => { const g = game.scene.getScene('GameScene'); return g && g.sys.isActive() && g.tutorial && game.scene.getScene('UIScene').sys.isActive(); })()", timeout=60000)
        await pg.wait_for_timeout(1500)
        print(await pg.evaluate("(() => { const w = game.scene.getScene('GameScene'); return { era: w.eraOf(w.self), steps: w.tutorial.steps.length, buildings: w.buildings.map(b=>b.type).join(','), raiders: w.teams.enemy.raiders, rec: !!w.recording }; })()"))
        stuck = 0
        for k in range(120):
            r = await pg.evaluate(DRIVE)
            if r.get('end') or r.get('over'): print('END', r); print('TUTORIAL_OK' if r.get('over') == 'tutorial' and not errs else 'TUTORIAL_FAIL'); break
            if r['now'] == r['step']:
                stuck += 1
                if stuck > 40: print('STUCK', r); break
            else:
                stuck = 0; print(r['step'], r['title'], '->', r['now'])
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="tutorial.png")
        print('errors', errs[:5])
        await b.close()
asyncio.run(main())
