// The main game world: map, units, buildings, economy, camera and mouse/keyboard controls.
import { TILE, MAP_W, MAP_H, MAP_SEED, PLAYER_START, START_RESOURCES, POP_MAX, TEAM_COLORS } from '../config.js';
import { GameMap } from '../map.js';
import { Unit, UNIT_TYPES } from '../unit.js';
import { Building, BUILDING_TYPES, drawBuildingArt } from '../buildings.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // --- Map (drawn into a texture we can paint over when trees/stone run out) ---
    this.map = new GameMap(MAP_W, MAP_H, MAP_SEED);
    this.map.createTexture(this, 'terrain');
    this.terrain = this.add.renderTexture(0, 0, MAP_W * TILE, MAP_H * TILE).setOrigin(0).setDepth(-1);
    this.terrain.draw('terrain', 0, 0);
    this.map.onTileChanged = (x, y) => this.redrawTile(x, y);

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.home = this.map.tileCenter(PLAYER_START.x, PLAYER_START.y);
    cam.centerOn(this.home.x, this.home.y);

    // --- Economy ---
    this.resources = { ...START_RESOURCES };
    this.buildings = [];
    this.units = [];

    // --- Starting base ---
    const s = PLAYER_START;
    this.addBuilding('town_centre', s.x - 1, s.y - 1, true);
    const types = ['worker', 'worker', 'worker', 'worker', 'soldier', 'soldier', 'soldier'];
    const spots = this.map.tilesAround(s.x, s.y + 2, types.length);
    types.forEach((type, i) => this.units.push(new Unit(this, this.map, spots[i].x, spots[i].y, type)));

    // --- Selection & placement ---
    this.selected = new Set();
    this.selectedBuilding = null;
    this.drag = null;
    this.placing = null;
    this.selBox = this.add.graphics().setDepth(1e6);
    this.ghost = this.add.graphics().setDepth(1e6 - 1);

    // --- Input ---
    this.input.mouse.disableContextMenu();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,ESC,H,PERIOD');
    this.keys.ESC.on('down', () => (this.placing ? this.cancelPlacing() : this.clearSelection()));
    this.keys.H.on('down', () => cam.pan(this.home.x, this.home.y, 300, 'Sine.easeInOut'));
    this.keys.PERIOD.on('down', () => this.selectIdleWorker());

    this.pointerInGame = true;
    this.input.on('gameout', () => { this.pointerInGame = false; });
    this.input.on('gameover', () => { this.pointerInGame = true; });

    this.input.on('wheel', (pointer, objs, dx, dy) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 2));
    });

    this.input.on('pointerdown', (p) => {
      if (this.overUI(p)) return;
      const w = this.worldPoint(p);
      if (this.placing) {
        if (p.rightButtonDown()) this.cancelPlacing();
        else if (p.leftButtonDown()) this.tryPlace(w);
        return;
      }
      if (p.rightButtonDown()) this.commandAt(w.x, w.y);
      else if (p.leftButtonDown()) this.drag = { x: w.x, y: w.y, sx: p.x, sy: p.y, active: false };
    });

    this.input.on('pointermove', (p) => {
      if (this.placing) this.updateGhost();
      if (!this.drag) return;
      if (!this.drag.active && Phaser.Math.Distance.Between(p.x, p.y, this.drag.sx, this.drag.sy) > 6) {
        this.drag.active = true;
      }
      if (this.drag.active) this.drawSelBox(this.worldPoint(p));
    });

    this.input.on('pointerup', (p) => {
      if (!this.drag || p.button !== 0) return;
      const w = this.worldPoint(p);
      const additive = this.keys.SHIFT.isDown;
      if (this.drag.active) {
        const r = this.dragRect(w);
        this.selectWhere((u) => Phaser.Geom.Rectangle.Contains(r, u.x, u.y), additive);
      } else {
        const u = this.unitAt(w.x, w.y);
        if (u && additive && this.selected.has(u)) this.deselect(u);
        else if (u) this.selectWhere((x) => x === u, additive);
        else {
          const t = this.map.worldToTile(w.x, w.y);
          const b = this.map.buildingAt(t.x, t.y);
          if (b && b.team === 'player') this.selectBuilding(b);
          else if (!additive) this.clearSelection();
        }
      }
      this.drag = null;
      this.selBox.clear();
    });

    // UI (top bar, info panel, minimap) runs as its own scene on top.
    this.scene.launch('UIScene');
  }

  // ---------- Helpers ----------
  worldPoint(p) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  overUI(p) {
    const ui = this.scene.get('UIScene');
    return !!(ui && ui.isPointerOverUI && ui.isPointerOverUI(p));
  }

  toast(msg) {
    this.events.emit('toast', msg);
  }

  redrawTile(x, y) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    this.map.drawTile(g, x, y, 0, 0);
    this.terrain.draw(g, x * TILE, y * TILE);
    g.destroy();
    this.events.emit('tileChanged', x, y);
  }

  // ---------- Economy ----------
  get popUsed() {
    return this.units.filter((u) => u.team === 'player').length;
  }

  get popCap() {
    const total = this.buildings
      .filter((b) => b.team === 'player' && b.complete)
      .reduce((sum, b) => sum + (b.def.pop || 0), 0);
    return Math.min(POP_MAX, total);
  }

  canAfford(cost) {
    return Object.entries(cost).every(([k, v]) => this.resources[k] >= v);
  }

  missingText(cost) {
    return Object.entries(cost)
      .filter(([k, v]) => this.resources[k] < v)
      .map(([k, v]) => `${Math.ceil(v - this.resources[k])} ${k}`)
      .join(', ');
  }

  spend(cost) {
    for (const [k, v] of Object.entries(cost)) this.resources[k] -= v;
  }

  addResource(res, n) {
    this.resources[res] += n;
  }

  // ---------- Buildings ----------
  addBuilding(type, tx, ty, complete = false) {
    const b = new Building(this, this.map, type, tx, ty, 'player', complete);
    this.buildings.push(b);
    return b;
  }

  removeBuilding(b) {
    if (b.dead) return;
    b.dead = true;
    b.destroy();
    this.buildings = this.buildings.filter((x) => x !== b);
    if (this.selectedBuilding === b) {
      this.selectedBuilding = null;
      this.emitSelection();
    }
  }

  onBuildingComplete(b) {
    if (b.type !== 'farm') this.toast(`${b.def.name} complete`);
    if (this.selectedBuilding === b) this.emitSelection();
  }

  nearestDropOff(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.team !== 'player' || !b.complete || !b.def.dropOff) continue;
      const d = Phaser.Math.Distance.Between(x, y, b.cx, b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  nearestUnfinished(x, y, rangeTiles) {
    let best = null;
    let bestD = rangeTiles * TILE;
    for (const b of this.buildings) {
      if (b.team !== 'player' || b.complete) continue;
      const d = Phaser.Math.Distance.Between(x, y, b.cx, b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // ---------- Placing new buildings ----------
  selectedWorkers() {
    return [...this.selected].filter((u) => u.type === 'worker');
  }

  startPlacing(type) {
    if (!this.selectedWorkers().length) return;
    const def = BUILDING_TYPES[type];
    if (!this.canAfford(def.cost)) {
      this.toast(`Need ${this.missingText(def.cost)} more for a ${def.name}`);
      return;
    }
    this.placing = { type };
    this.updateGhost();
  }

  cancelPlacing() {
    this.placing = null;
    this.ghost.clear();
  }

  placementAt(w) {
    const def = BUILDING_TYPES[this.placing.type];
    const tx = Math.round(w.x / TILE - def.w / 2);
    const ty = Math.round(w.y / TILE - def.h / 2);
    let valid = this.map.canPlace(tx, ty, def.w, def.h);
    if (valid && !def.walkable) {
      valid = !this.units.some((u) => {
        const t = u.tile;
        return t.x >= tx && t.x < tx + def.w && t.y >= ty && t.y < ty + def.h;
      });
    }
    return { tx, ty, valid, def };
  }

  updateGhost() {
    if (!this.placing) return;
    const w = this.worldPoint(this.input.activePointer);
    const { tx, ty, valid, def } = this.placementAt(w);
    const g = this.ghost;
    g.clear();
    g.setPosition(tx * TILE, ty * TILE);
    drawBuildingArt(g, this.placing.type, TEAM_COLORS.player, { alpha: 0.65 });
    g.fillStyle(valid ? 0x00ff00 : 0xff0000, 0.25).fillRect(0, 0, def.w * TILE, def.h * TILE);
  }

  tryPlace(w) {
    const { tx, ty, valid, def } = this.placementAt(w);
    if (!valid) { this.toast("Can't build there"); return; }
    if (!this.canAfford(def.cost)) {
      this.toast(`Need ${this.missingText(def.cost)} more for a ${def.name}`);
      this.cancelPlacing();
      return;
    }
    this.spend(def.cost);
    const b = this.addBuilding(this.placing.type, tx, ty, false);
    for (const u of this.selectedWorkers()) u.orderBuild(b);
    this.showMarker(b.cx, b.cy, 0x7cfc00);
    if (!this.keys.SHIFT.isDown) this.cancelPlacing();
  }

  // ---------- Training units ----------
  train(type) {
    const b = this.selectedBuilding;
    if (!b || !b.complete || !(b.def.trains || []).includes(type)) return;
    if (b.queue.length >= 5) { this.toast('Queue is full (5 max)'); return; }
    const cost = UNIT_TYPES[type].cost;
    if (!this.canAfford(cost)) {
      this.toast(`Need ${this.missingText(cost)} more for a ${UNIT_TYPES[type].name}`);
      return;
    }
    this.spend(cost);
    b.queue.push(type);
    b.redraw();
  }

  updateTraining(dt) {
    for (const b of this.buildings) {
      if (!b.complete || !b.queue.length) continue;
      if (this.popUsed >= this.popCap) {
        if (!b.waitingForPop && b.team === 'player') this.toast('Population full — build a House!');
        b.waitingForPop = true;
        continue;
      }
      b.waitingForPop = false;
      b.trainTimer += dt / 1000;
      if (b.trainTimer >= UNIT_TYPES[b.queue[0]].trainTime) {
        this.spawnUnit(b, b.queue.shift());
        b.trainTimer = 0;
      }
      b.redraw();
    }
  }

  spawnUnit(b, type) {
    const bottom = { x: b.tx + Math.floor(b.w / 2), y: b.ty + b.h };
    const spots = this.map.standSpots(b.tx, b.ty, b.w, b.h, bottom);
    const free = spots.find((s) => !this.units.some((u) => u.tile.x === s.x && u.tile.y === s.y)) || spots[0];
    if (!free) return;
    this.units.push(new Unit(this, this.map, free.x, free.y, type));
  }

  // ---------- Selection ----------
  dragRect(w) {
    const x = Math.min(this.drag.x, w.x);
    const y = Math.min(this.drag.y, w.y);
    return new Phaser.Geom.Rectangle(x, y, Math.abs(w.x - this.drag.x), Math.abs(w.y - this.drag.y));
  }

  drawSelBox(w) {
    const r = this.dragRect(w);
    const z = this.cameras.main.zoom;
    this.selBox.clear();
    this.selBox.fillStyle(0x7cfc00, 0.12).fillRect(r.x, r.y, r.width, r.height);
    this.selBox.lineStyle(2 / z, 0x7cfc00, 1).strokeRect(r.x, r.y, r.width, r.height);
  }

  unitAt(wx, wy) {
    let best = null;
    let bestD = 16;
    for (const u of this.units) {
      const d = Phaser.Math.Distance.Between(wx, wy, u.x, u.y);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  selectWhere(pred, additive) {
    if (!additive) this.clearSelection(true);
    if (this.selectedBuilding) {
      this.selectedBuilding.setSelected(false);
      this.selectedBuilding = null;
    }
    for (const u of this.units) {
      if (u.team === 'player' && pred(u)) {
        this.selected.add(u);
        u.setSelected(true);
      }
    }
    this.emitSelection();
  }

  selectBuilding(b) {
    this.clearSelection(true);
    this.selectedBuilding = b;
    b.setSelected(true);
    this.emitSelection();
  }

  deselect(u) {
    this.selected.delete(u);
    u.setSelected(false);
    this.emitSelection();
  }

  clearSelection(silent = false) {
    if (this.placing) this.cancelPlacing();
    for (const u of this.selected) u.setSelected(false);
    this.selected.clear();
    if (this.selectedBuilding) {
      this.selectedBuilding.setSelected(false);
      this.selectedBuilding = null;
    }
    if (!silent) this.emitSelection();
  }

  emitSelection() {
    this.events.emit('selection', { units: [...this.selected], building: this.selectedBuilding });
  }

  selectIdleWorker() {
    const idle = this.units.filter((u) => u.type === 'worker' && u.team === 'player' && u.isIdle);
    if (!idle.length) { this.toast('No idle workers'); return; }
    this.idleIndex = ((this.idleIndex ?? -1) + 1) % idle.length;
    const u = idle[this.idleIndex];
    this.selectWhere((x) => x === u, false);
    this.cameras.main.pan(u.x, u.y, 250, 'Sine.easeInOut');
  }

  // ---------- Right-click orders ----------
  commandAt(wx, wy) {
    if (!this.selected.size) return;
    const t = this.map.worldToTile(wx, wy);
    const b = this.map.buildingAt(t.x, t.y);
    const res = this.map.resourceAt(t.x, t.y);
    const units = [...this.selected];
    const workers = units.filter((u) => u.type === 'worker');
    let movers = units.filter((u) => u.type !== 'worker');

    if (workers.length && b && b.team === 'player' && !b.complete) {
      workers.forEach((w) => w.orderBuild(b));
      this.showMarker(wx, wy, 0x7cfc00);
    } else if (workers.length && b && b.type === 'farm') {
      const [first, ...rest] = workers;
      const taken = b.farmer && b.farmer.order && b.farmer.order.farm === b && b.farmer !== first;
      if (!taken) first.orderFarm(b);
      else movers.push(first);
      movers.push(...rest);
      this.showMarker(wx, wy, 0x7cfc00);
    } else if (workers.length && res) {
      const tiles = this.map.resourceTilesNear(res, t.x, t.y, 4);
      if (tiles.length) workers.forEach((w, i) => w.orderGather(tiles[i % tiles.length]));
      this.showMarker(wx, wy, 0x7cfc00);
    } else {
      movers = units;
    }
    if (movers.length) this.moveGroup(movers, wx, wy);
  }

  moveGroup(units, wx, wy) {
    const t = this.map.worldToTile(wx, wy);
    const goals = this.map.tilesAround(t.x, t.y, units.length);
    if (!goals.length) return;
    // Closest units take the closest spots so the group doesn't cross over itself.
    units.sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, wx, wy) - Phaser.Math.Distance.Between(b.x, b.y, wx, wy));
    units.forEach((u, i) => u.moveTo(goals[Math.min(i, goals.length - 1)]));
    this.showMarker(wx, wy, 0xffffff);
  }

  showMarker(wx, wy, color) {
    const m = this.add.circle(wx, wy, 12).setStrokeStyle(2, color).setDepth(1e6);
    this.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 450, onComplete: () => m.destroy() });
  }

  // ---------- Every frame ----------
  update(time, delta) {
    const cam = this.cameras.main;
    const k = this.keys;
    const speed = (700 * delta) / 1000 / cam.zoom;
    let dx = 0;
    let dy = 0;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;

    // Scroll when the mouse is at the edge of the screen.
    const p = this.input.activePointer;
    const edge = 12;
    if (this.pointerInGame && !this.drag) {
      if (p.x < edge) dx -= 1;
      else if (p.x > this.scale.width - edge) dx += 1;
      if (p.y < edge) dy -= 1;
      else if (p.y > this.scale.height - edge) dy += 1;
    }
    if (dx || dy) {
      cam.scrollX += Math.sign(dx) * speed;
      cam.scrollY += Math.sign(dy) * speed;
      if (this.placing) this.updateGhost();
    }

    // Cap frame time so a lag spike doesn't teleport units.
    const dt = Math.min(delta, 100);
    for (const u of this.units) u.update(dt, this);
    this.updateTraining(dt);
  }
}
