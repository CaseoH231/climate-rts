// Smoke test for the Bio Study Notes app in biology/: every card opens, the cell explorer works, pasted notes are sorted.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept('Test topic'));
  await p.goto('http://localhost:8765/biology/');
  await p.click('.topic >> text=Cell organelles');
  const ids = await p.$$eval('.card', (cs) => cs.map((c) => c.dataset.entry));
  let figs = 0;
  for (const id of ids) {
    await p.click(`.card[data-entry="${id}"]`);
    figs += await p.locator('#dlg svg.dg').count();
    await p.keyboard.press('Escape');
  }
  await p.click('[data-cell=bacteria]'); await p.click('.part[data-k=plasmid] circle >> nth=0');
  const opened = await p.textContent('#dlg h2'); await p.keyboard.press('Escape');
  await p.click('#btn-paste');
  await p.fill('#paste-text', 'Golgi apparatus: packages proteins\n- makes vesicles\nEnzyme - a biological catalyst\n\nActive site\nWhere the substrate binds');
  await p.selectOption('#paste-topic', '__new'); await p.click('#paste-go');
  const pasted = await p.$$eval('.card h3', (h) => h.map((x) => x.textContent));
  await p.click('#add-topic'); await p.click('.preset >> text=Enzymes');
  const preset = await p.$$eval('.card', (c) => c.length);
  await p.click('#add-topic'); await p.click('.preset >> text=Enzymes'); // adding again must not duplicate
  const preset2 = await p.$$eval('.card', (c) => c.length);
  await p.evaluate(() => localStorage.clear());
  console.log('cards', ids.length, 'diagrams', figs, 'explorer', opened, 'pasted', pasted.join('|'), 'preset', preset, preset2, 'errors', errs.length);
  const ok = ids.length === 12 && figs === 12 && opened === 'Plasmids' && pasted.length === 3 && pasted.includes('Active site') &&
    preset === 6 && preset2 === 6 && !errs.length;
  console.log(ok ? 'biology ok' : 'biology FAILED ' + errs.join('; '));
  await b.close();
})();
