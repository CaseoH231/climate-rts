// Tutorial: guided lessons for new players, one per age, or all of them in one game ("full").
// A lesson is a list of steps. Each step has some text, an optional highlight (which button to press),
// a "Show me" target (where to look), and a check for when it's done. The tutorial watches the game and
// moves on by itself; a few steps just need you to press Next. Tutorials aren't recorded as replays.
import { TILE } from './config.js';
import { BUILDING_TYPES, ERAS } from './buildings.js';
import { Unit, UNIT_TYPES } from './unit.js';
import { cleanRules } from './setup.js';

// The data to start a tutorial game with: you plus a side of raiders (no town), on a small map you can see.
export function tutorialGameData(lesson, civ = 'random') {
  return {
    seed: Math.floor(Math.random() * 1e9), mapType: 'continental', difficulty: 'easy', tutorial: lesson,
    rules: cleanRules({ size: 'small', reveal: 'explored', climate: 'gentle', resources: 'high' }),
    setup: { mode: 'tutorial', teams: [
      { id: 'player', alliance: 0, ai: null, name: 'You', you: true, civ },
      { id: 'enemy', alliance: 1, ai: null, name: 'Raiders', raiders: true, civ: 'random' },
    ] },
  };
}

const DONE_KEY = 'age-of-emissions-tutorials';
export function tutorialsDone() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function markDone(id) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify({ ...tutorialsDone(), [id]: true })); } catch (e) { /* ignore */ }
}

// ---------- little helpers the steps use ----------
const own = (w) => (x) => x.team === w.self && !x.dead;
const count = (w, type, finished = true) => w.buildings.filter((b) => own(w)(b) && b.type === type && (!finished || b.complete)).length;
const units = (w, type) => w.units.filter((u) => own(w)(u) && u.type === type).length;
const gathering = (w, res) => w.units.some((u) => own(w)(u) && u.type === 'worker' && u.order && u.order.kind === 'gather' && u.order.res === res);
const tc = (w) => w.buildings.find((b) => own(w)(b) && b.type === 'town_centre' && b.complete);
const near = (w, res) => { const t = tc(w); const r = t && w.map.nearestResource(res, t.tx + 1, t.ty + 1, 30); return r ? { x: r.x * TILE + 16, y: r.y * TILE + 16 } : null; };
const firstOf = (w, type) => w.buildings.find((b) => own(w)(b) && b.type === type) || w.units.find((u) => own(w)(u) && u.type === type);
const at = (e) => (e ? (e.isBuilding ? { x: e.cx, y: e.cy } : { x: e.x, y: e.y }) : null);
const page = (type) => ['house', 'apartments', 'farm', 'mill', 'lumber_camp', 'mining_camp', 'fishing_dock', 'market', 'office', 'factory', 'town_centre'].includes(type)
  ? 'the first page' : ['barracks', 'tower', 'wall', 'gate', 'bridge', 'radar', 'workshop', 'restoration'].includes(type) ? 'the Military & science page (press N twice)' : 'the Energy & climate page (press N)';

// Press Next to go on.
const read = (title, text, focus) => ({ title, text, manual: true, focus });
const an = (name) => (/^[AEIOU]/.test(name) ? `an ${name}` : `a ${name}`);
const plural = (name) => (name.endsWith('man') ? `${name.slice(0, -3)}men` : `${name}s`);

// Build one more of something (counts once it's finished).
const build = (type, text, focus) => ({
  title: type === 'trees' ? 'Plant some trees' : `Build ${an(BUILDING_TYPES[type].name)}`,
  text: `${text}\n\nSelect a worker, find the ${BUILDING_TYPES[type].name} on ${page(type)} of the command grid (bottom left), click it, then click a free spot on the map.`,
  hl: `build:${type}`, gift: BUILDING_TYPES[type].cost,
  enter: (w, c) => { c.base = count(w, type); },
  done: (w, c) => count(w, type) > c.base,
  status: (w, c) => (count(w, type, false) > c.base ? 'Foundation placed — your workers are building it…' : ''),
  focus: focus || ((w) => at(firstOf(w, type)) || at(tc(w))),
});

// Train some units (counts once they've come out).
const train = (type, n, where, text) => ({
  title: n > 1 ? `Train ${n} ${plural(UNIT_TYPES[type].name)}` : `Train ${an(UNIT_TYPES[type].name)}`,
  text: `${text}\n\nSelect your ${where}, then click the unit in the command grid (or press its key).`,
  hl: `train:${type}`,
  enter: (w, c) => { c.base = units(w, type); },
  done: (w, c) => units(w, type) >= c.base + n,
  status: (w, c) => `${Math.max(0, units(w, type) - c.base)} / ${n}`,
  focus: (w) => at(w.buildings.find((b) => own(w)(b) && b.complete && (b.def.trains || []).includes(type))),
});

const research = (id, name, where, text) => ({
  title: `Research ${name}`,
  text: `${text}\n\nSelect the ${where} and click ${name} in its command grid.`,
  hl: `research:${id}`,
  done: (w) => w.teams[w.self].upgrades.has(id),
  status: (w) => (w.buildings.some((b) => own(w)(b) && b.research && b.research.id === id) ? 'Researching…' : ''),
  focus: (w) => at(w.buildings.find((b) => own(w)(b) && b.complete && (b.def.research || []).includes(id))),
});

const advance = (era, text) => ({
  title: `Advance to the ${ERAS[era].name}`,
  text: `${text}\n\nSelect your Town Centre and click "Advance to the ${ERAS[era].name}". It takes ${ERAS[era].time} seconds.`,
  hl: 'era', gift: ERAS[era].cost,
  done: (w) => w.eraOf(w.self) >= era,
  status: (w) => (w.buildings.some((b) => own(w)(b) && b.research && b.research.kind === 'era') ? 'Advancing…' : ''),
  focus: (w) => at(tc(w)),
});

// A few raiders march on your town. Done when they're all gone.
const raid = (types, text) => ({
  title: 'Raiders!', text: `${text}\n\nSelect your army (drag a box around it), then right-click a raider to attack. Or press A and click near them: your units fight everything on the way.`,
  enter: (w, c) => { c.raiders = spawnRaid(w, types); },
  done: (w, c) => c.raiders && c.raiders.every((u) => u.dead),
  status: (w, c) => `${c.raiders ? c.raiders.filter((u) => !u.dead).length : 0} raiders left`,
  focus: (w, c) => at(c.raiders && c.raiders.find((u) => !u.dead)),
});

// ---------- the lessons ----------
export const LESSONS = {
  coal: {
    name: 'Coal Age', age: 0, blurb: 'The basics: the camera, gathering, building, training and defending your town.',
    steps: [
      read('Welcome to Age of Emissions!', 'You lead a town from the age of coal to a green future. Grow your town, defend it — and try not to cook the planet.\n\nMove around with the arrow keys or by pushing the mouse to the screen edge. Scroll to zoom. Click the minimap (bottom right) to jump. Press H to come back home.'),
      { title: 'Select a worker', text: 'Click one of your workers (the people with tools beside the Town Centre). You can also drag a box around several.', done: (w) => [...w.selected].some((u) => u.type === 'worker'), focus: (w) => at(firstOf(w, 'worker')) },
      { title: 'Chop wood', text: 'With a worker selected, right-click a tree. They chop it and carry the wood to your Town Centre.', done: (w) => gathering(w, 'wood'), focus: (w) => near(w, 'wood') },
      { title: 'Gather food', text: 'Select another worker and right-click a berry bush (red dots) — or a deer, to hunt it.', done: (w) => gathering(w, 'food'), focus: (w) => near(w, 'food') },
      { title: 'Mine stone', text: 'Select a worker and right-click a grey rock to mine stone.', done: (w) => gathering(w, 'stone'), focus: (w) => near(w, 'stone') },
      { title: 'Train a worker', text: 'More workers, more of everything. Click your Town Centre and press Q (or click the worker in the command grid).', hl: 'train:worker',
        enter: (w, c) => { c.base = units(w, 'worker'); }, done: (w, c) => units(w, 'worker') > c.base, focus: (w) => at(tc(w)) },
      build('house', 'Every person needs a home: each House adds 5 to your population limit (top bar).'),
      build('lumber_camp', 'Workers carry wood to the nearest drop-off. A Lumber Camp right next to a forest saves them the long walk.', (w) => near(w, 'wood')),
      build('farm', 'Berries run out; farms don\'t. A finished farm gets a farmer from your idle workers, or right-click it with a worker.'),
      build('barracks', 'Time for an army. The Barracks trains soldiers and archers.'),
      train('soldier', 2, 'Barracks', 'Soldiers are tough close-range fighters.'),
      raid(['soldier', 'soldier'], 'Two raiders are coming for your town! Every unit is strong against some and weak against others: archers beat soldiers, soldiers beat riflemen, riflemen beat armoured cars, armoured cars beat archers.'),
      advance(1, 'Ages unlock new buildings and units — and change how your whole town looks. In the tutorial you won\'t run out of resources.'),
    ],
  },
  industrial: {
    name: 'Industrial Age', age: 1, blurb: 'Energy and coal power, research, riflemen — and the CO₂ it all puts in the air.',
    steps: [
      read('The Industrial Age', 'Factories need power. From now on many things cost energy (the lightning bolt in the top bar). You can get it from coal — fast and cheap, but it heats the planet — or from clean sources like wind.'),
      { title: 'Mine coal', text: 'Select a worker and right-click a dark coal heap. Mined coal becomes energy straight away… and CO₂.', done: (w) => gathering(w, 'fuel'), focus: (w) => near(w, 'fuel') },
      build('power_plant', 'A Coal Power Plant makes energy on its own, with no workers — and plenty of smoke.'),
      read('Watch the climate', 'Top right: CO₂ in parts per million, the temperature rise, and the planet\'s health. As it warms you get heatwaves, droughts, wildfires and rising seas. At +5 °C everyone loses.', (w) => at(tc(w))),
      build('wind_turbine', 'A Wind Turbine makes clean energy forever, with no pollution. Clean energy pays for anything that costs energy.'),
      build('workshop', 'The Workshop researches advanced technology.'),
      research('iron_weapons', 'Iron Weapons', 'Workshop', 'Upgrades make every unit stronger or every worker faster, for good.'),
      train('rifleman', 2, 'Barracks', 'Riflemen shoot from long range and are great against armoured cars.'),
      raid(['soldier', 'archer', 'archer'], 'More raiders — and this time they brought archers.'),
      advance(2, 'On to the Modern Age.'),
    ],
  },
  modern: {
    name: 'Modern Age', age: 2, blurb: 'Bigger towns, the Market, the town bell and armoured cars.',
    steps: [
      read('The Modern Age', 'Concrete and glass: bigger homes, factories, offices and machines.'),
      build('apartments', 'An Apartment Block houses 15 people.'),
      build('office', 'An Office Tower brings in a little food, wood and stone every second, with no workers.'),
      build('market', 'At the Market you can swap one resource for another.'),
      { title: 'Trade at the Market', text: 'Select the Market. Pick what to pay with on the bottom row, then buy 100 of something on the top row. Prices rise when people buy and fall when they sell.',
        hl: 'trade', enter: (w, c) => { c.base = w.trades || 0; }, done: (w, c) => (w.trades || 0) > c.base, focus: (w) => at(firstOf(w, 'market')) },
      { title: 'Ring the town bell', text: 'When raiders hit your workers, select your Town Centre and ring the bell: every worker runs inside, and the Town Centre shoots extra arrows.',
        hl: 'bell', done: (w) => w.bellRung, focus: (w) => at(tc(w)) },
      { title: 'All clear', text: 'Ring it again ("All clear") and everyone goes back to work.', hl: 'bell', done: (w) => !w.bellRung, focus: (w) => at(tc(w)) },
      train('armoured_car', 1, 'Barracks', 'Armoured Cars are fast and tough, and great against buildings and archers.'),
      raid(['rifleman', 'soldier', 'soldier'], 'Raiders again. Use your armoured car and your army.'),
      advance(3, 'The Transition Age is where you turn things around.'),
    ],
  },
  transition: {
    name: 'Transition Age', age: 3, blurb: 'Clean energy, planting forests and pulling CO₂ back out of the air.',
    steps: [
      read('The Transition Age', 'Now you can fight back against the heat: solar power, carbon capture and new forests.'),
      build('solar', 'A Solar Farm makes more clean energy than a wind turbine.'),
      build('trees', 'Plant Trees: the saplings grow into a forest that soaks up CO₂ (and gives wood later).'),
      research('smart_grid', 'Smart Grid', 'Workshop', 'Smart Grid makes every wind turbine and solar farm produce 50% more.'),
      build('carbon_capture', 'Carbon Capture uses clean energy to pull CO₂ out of the air.'),
      advance(4, 'The Green Age is the last one — and the way to a Green Victory.'),
    ],
  },
  green: {
    name: 'Green Age', age: 4, blurb: 'Geothermal power, electric tanks and the Climate Restoration Project.',
    steps: [
      read('The Green Age', 'The best clean power, the strongest unit — and a way to win by healing the planet.'),
      build('geothermal', 'A Geothermal Plant taps the heat of the earth: the most clean energy of all.'),
      train('e_tank', 1, 'Barracks', 'The Electric Tank is the strongest unit in the game. Riflemen are its only real counter.'),
      raid(['armoured_car', 'armoured_car', 'rifleman'], 'A last raid, with armoured cars.'),
      build('restoration', 'The Climate Restoration Project heals the planet. Keep it standing for 3 minutes in a real game and you win a Green Victory.'),
    ],
  },
};
export const LESSON_ORDER = ['coal', 'industrial', 'modern', 'transition', 'green'];
export const FULL_TUTORIAL = { name: 'Full tutorial', blurb: 'Every lesson, from the Coal Age to the Green Age, in one game.' };

// What a later-age lesson starts with: a small town already built.
const STARTER = [
  [1, ['house', 'house', 'house', 'lumber_camp', 'mining_camp', 'mill', 'farm', 'farm', 'barracks']],
  [2, ['house', 'workshop', 'power_plant', 'wind_turbine']],
  [3, ['apartments', 'market', 'office']],
  [4, ['solar', 'wind_turbine', 'apartments']],
];

export class Tutorial {
  constructor(world, lesson, saved = null) {
    this.world = world;
    this.lesson = (LESSONS[lesson] || lesson === 'full') ? lesson : 'coal';
    const ids = this.lesson === 'full' ? LESSON_ORDER : [this.lesson];
    this.steps = ids.flatMap((id) => LESSONS[id].steps.map((s) => ({ ...s, lessonName: LESSONS[id].name })));
    this.i = saved ? saved.i : 0;
    this.c = {}; // the current step's own notes (counts at its start, raiders…)
    this.timer = 0;
    this.topUp = 0;
    this.done = false;
    this.started = !!saved;
  }

  get name() { return this.lesson === 'full' ? FULL_TUTORIAL.name : LESSONS[this.lesson].name; }
  get step() { return this.steps[this.i] || null; }
  serialize() { return { lesson: this.lesson, i: this.i }; }

  // A new tutorial game: start in the lesson's age, with a ready-made town for the later ones.
  begin() {
    if (this.started) { this.enter(); return; }
    this.started = true;
    const w = this.world;
    const age = this.lesson === 'full' ? 0 : LESSONS[this.lesson].age;
    w.teams[w.self].era = age;
    const t = tc(w);
    if (age > 0 && t) {
      for (const [minAge, types] of STARTER) {
        if (age < minAge) continue;
        for (const type of types) this.placeNear(type, t);
      }
      const spots = w.map.tilesAround(t.tx + 1, t.ty + 4, 8);
      for (const s of spots) w.units.push(new Unit(w, w.map, s.x, s.y, 'worker', w.self));
    }
    w.restyleTeam(w.self);
    this.enter();
  }

  placeNear(type, t) {
    const w = this.world;
    const def = BUILDING_TYPES[type];
    for (let r = 4; r < 16; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = t.tx + 1 + dx;
          const y = t.ty + 1 + dy;
          if (w.map.canPlace(x - 1, y - 1, def.w + 2, def.h + 2) && w.canPlaceAt(type, x, y) && !w.unitsInRect(x, y, def.w, def.h)) {
            w.addBuilding(type, x, y, true, w.self);
            return;
          }
        }
      }
    }
  }

  enter() {
    this.c = {};
    const s = this.step;
    if (!s) return;
    const r = this.world.teams[this.world.self].resources;
    for (const [k, v] of Object.entries(s.gift || {})) {
      const key = k === 'energy' ? 'clean' : k;
      if (key in r) r[key] = Math.max(r[key], v + 50);
    }
    if (s.enter) s.enter(this.world, this.c);
    this.world.events.emit('tutorial');
  }

  next() {
    if (this.done) return;
    this.i++;
    if (this.i >= this.steps.length) { this.finish(); return; }
    this.enter();
  }

  // The player pressed Next (on a reading step) or Skip.
  press(skip = false) {
    const s = this.step;
    if (!s) return;
    if (s.manual || skip) {
      if (skip && this.c.raiders) for (const u of this.c.raiders) if (!u.dead) this.world.killUnit(u);
      this.next();
    }
  }

  finish() {
    this.done = true;
    markDone(this.lesson);
    if (this.lesson === 'full') for (const id of LESSON_ORDER) markDone(id);
    this.world.tutorialDone = true;
    this.world.checkGameOver();
  }

  status() {
    const s = this.step;
    return s && s.status ? s.status(this.world, this.c) : '';
  }

  focus() {
    const s = this.step;
    return s && s.focus ? s.focus(this.world, this.c) : null;
  }

  update(dt) {
    if (this.done || !this.step) return;
    const w = this.world;
    // you never run out in the tutorial
    this.topUp += dt;
    if (this.topUp >= 1000) {
      this.topUp = 0;
      const r = w.teams[w.self].resources;
      for (const k of ['food', 'wood', 'stone', 'fuel']) r[k] = Math.max(r[k], 400);
      r.clean = Math.max(r.clean, 150);
    }
    this.timer += dt;
    if (this.timer < 250) return;
    this.timer = 0;
    const s = this.step;
    if (!s.manual && s.done(w, this.c)) {
      w.toast(`Done: ${s.title}`, '#b8e08a');
      this.next();
    }
  }
}

// Raiders walk in from a few screens away and attack-move on the Town Centre.
function spawnRaid(w, types) {
  const t = tc(w);
  const foe = w.teamIds.find((id) => w.teams[id].raiders);
  if (!t || !foe) return [];
  const cx = t.tx + 1;
  const cy = t.ty + 1;
  const mid = w.map.w / 2;
  const dx = Math.sign(mid - cx) || 1;
  const dy = Math.sign(mid - cy) || 1;
  const from = w.map.nearestWalkable(cx + dx * 13, cy + dy * 13, 12) || { x: cx + dx * 6, y: cy + dy * 6 };
  const spots = w.map.tilesAround(from.x, from.y, types.length);
  return types.map((type, i) => {
    const s = spots[i] || from;
    const u = new Unit(w, w.map, s.x, s.y, type, foe);
    w.units.push(u);
    u.orderAttackMove({ x: cx, y: cy + 2 });
    return u;
  });
}
