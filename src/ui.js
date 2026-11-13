// Small helpers for classic-RTS-styled panels and buttons, shared by the menus and the in-game interface.
import { audio } from './audio.js';

export const FONT_SERIF = 'Georgia, "Palatino Linotype", "Times New Roman", serif';
export const FONT_SANS = '"Segoe UI", Arial, sans-serif';
export const UI_COL = {
  gold: '#e3c46f', text: '#efe6cc', dim: '#b4a98b', bad: '#e07a6a', good: '#a9d08a',
  bronze: 0xa5803f, bronzeDark: 0x5a4422, inset: 0x15120e,
};

// Stone panel with a bronze double border.
export function panel(scene, x, y, w, h, depth = 0) {
  const c = scene.add.container(x, y).setDepth(depth);
  const bg = scene.add.tileSprite(0, 0, w, h, 'ui_stone').setOrigin(0);
  const g = scene.add.graphics();
  bevelBorder(g, 0, 0, w, h);
  c.add([bg, g]);
  c.bg = bg;
  c.border = g;
  return c;
}

export function bevelBorder(g, x, y, w, h) {
  g.clear();
  g.lineStyle(3, UI_COL.bronzeDark, 1).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.lineStyle(1, UI_COL.bronze, 1).strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  g.lineStyle(1, 0x000000, 0.6).strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
}

// A dark recessed box (for portraits, minimap, resource counters).
export function inset(g, x, y, w, h) {
  g.fillStyle(UI_COL.inset, 0.92).fillRect(x, y, w, h);
  g.lineStyle(1, 0x000000, 1).lineBetween(x, y, x + w, y).lineBetween(x, y, x, y + h);
  g.lineStyle(1, 0x8a7a5a, 0.8).lineBetween(x, y + h, x + w, y + h).lineBetween(x + w, y, x + w, y + h);
}

// Text button. Returns a container with .setEnabled(bool) and .setLabel(text).
export function button(scene, x, y, w, h, label, onClick, opts = {}) {
  const c = scene.add.container(x, y).setDepth(opts.depth || 0);
  const g = scene.add.graphics();
  const t = scene.add.text(w / 2, h / 2, label, {
    fontFamily: FONT_SERIF, fontSize: opts.size || '17px', color: UI_COL.gold, stroke: '#000000', strokeThickness: 2,
  }).setOrigin(0.5);
  const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0).setInteractive({ useHandCursor: true });
  c.add([g, t, hit]);
  let enabled = true;
  let hover = false;
  let selected = false;
  const draw = () => {
    g.clear();
    const base = !enabled ? 0x2a2620 : selected ? 0x5b4626 : hover ? 0x4a3d2a : 0x332b20;
    g.fillStyle(base, 0.95).fillRect(0, 0, w, h);
    g.fillStyle(0xffffff, hover && enabled ? 0.08 : 0.04).fillRect(2, 2, w - 4, h / 2 - 2);
    g.lineStyle(2, UI_COL.bronzeDark, 1).strokeRect(1, 1, w - 2, h - 2);
    g.lineStyle(1, enabled ? UI_COL.bronze : 0x5a5040, 1).strokeRect(3, 3, w - 6, h - 6);
    t.setColor(enabled ? (selected ? '#fff2c0' : UI_COL.gold) : '#7a705c');
  };
  hit.on('pointerover', () => { hover = true; draw(); });
  hit.on('pointerout', () => { hover = false; draw(); });
  hit.on('pointerdown', (p) => {
    if (!enabled || !p.leftButtonDown()) return;
    audio.resume();
    audio.play('click');
    onClick();
  });
  c.setEnabled = (v) => { enabled = v; draw(); return c; };
  c.setSelected = (v) => { selected = v; draw(); return c; };
  c.setLabel = (s) => { t.setText(s); return c; };
  c.hit = hit;
  draw();
  return c;
}

// Three volume controls (master / effects / ambience) with − and + buttons. Returns the objects created.
// Screen effects (soft vignette + colour grading on the game view). On by default; slower computers can turn them off.
const FX_KEY = 'age-of-emissions-fx';
export function fxEnabled() {
  try { return localStorage.getItem(FX_KEY) !== 'off'; } catch (e) { return true; }
}
function setFx(on) {
  try { localStorage.setItem(FX_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
}

// Blood & gore (bodies stay, blood spatter, scorch marks). Purely visual. Off by default.
const GORE_KEY = 'age-of-emissions-gore';
export function goreEnabled() {
  try { return localStorage.getItem(GORE_KEY) === 'on'; } catch (e) { return false; }
}
function setGore(on) {
  try { localStorage.setItem(GORE_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
}

export function volumeRows(scene, x, y, width, depth) {
  const items = [];
  const rows = [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Sound effects'], ['ambience', 'Ambience']];
  rows.forEach(([key, label], i) => {
    const yy = y + i * 48;
    const txt = scene.add.text(x, yy + 10, '', {
      fontFamily: FONT_SERIF, fontSize: '17px', color: UI_COL.text, stroke: '#000', strokeThickness: 3,
    }).setDepth(depth);
    const refresh = () => txt.setText(`${label}: ${Math.round(audio.settings[key] * 100)}%`);
    refresh();
    const minus = button(scene, x + width - 100, yy, 44, 40, '−', () => { audio.setVolume(key, audio.settings[key] - 0.1); refresh(); }, { depth });
    const plus = button(scene, x + width - 48, yy, 44, 40, '+', () => { audio.setVolume(key, audio.settings[key] + 0.1); refresh(); }, { depth });
    items.push(txt, minus, plus);
  });
  const yy = y + rows.length * 48;
  const fxTxt = scene.add.text(x, yy + 10, '', { fontFamily: FONT_SERIF, fontSize: '17px', color: UI_COL.text, stroke: '#000', strokeThickness: 3 }).setDepth(depth);
  const fxBtn = button(scene, x + width - 100, yy, 96, 40, '', () => {
    setFx(!fxEnabled());
    refreshFx();
    scene.game.events.emit('fxChanged');
  }, { depth });
  const refreshFx = () => { fxTxt.setText('Screen effects'); fxBtn.setLabel ? fxBtn.setLabel(fxEnabled() ? 'On' : 'Off') : null; };
  refreshFx();
  items.push(fxTxt, fxBtn);
  const gy = yy + 48;
  const goreTxt = scene.add.text(x, gy + 10, 'Blood & gore', { fontFamily: FONT_SERIF, fontSize: '17px', color: UI_COL.text, stroke: '#000', strokeThickness: 3 }).setDepth(depth);
  const goreBtn = button(scene, x + width - 100, gy, 96, 40, '', () => {
    setGore(!goreEnabled());
    goreBtn.setLabel(goreEnabled() ? 'On' : 'Off');
  }, { depth });
  goreBtn.setLabel(goreEnabled() ? 'On' : 'Off');
  items.push(goreTxt, goreBtn);
  return items;
}

// A block of text in a fixed-size window that scrolls with the mouse wheel (or by dragging the bar).
// Returns a game object you can destroy() to remove everything.
export function scrollText(scene, x, y, w, h, text, style, depth) {
  const box = scene.add.container(0, 0).setDepth(depth);
  const t = scene.add.text(x, y, text, { ...style, wordWrap: { width: w - 16 } }).setDepth(depth);
  const maskG = scene.make.graphics({ add: false }).setScrollFactor(0);
  maskG.fillStyle(0xffffff).fillRect(x, y, w, h);
  t.setMask(maskG.createGeometryMask());
  const bar = scene.add.graphics().setDepth(depth);
  const max = Math.max(0, t.height - h);
  let off = 0;
  const draw = () => {
    t.setY(y - off);
    bar.clear();
    if (max <= 0) return;
    const th = Math.max(24, (h * h) / t.height);
    const ty = y + (h - th) * (off / max);
    bar.fillStyle(0x000000, 0.35).fillRect(x + w - 6, y, 5, h);
    bar.fillStyle(0xc9a227, 0.85).fillRect(x + w - 6, ty, 5, th);
  };
  const onWheel = (p, objs, dx, dy) => {
    if (p.x < x || p.x > x + w || p.y < y || p.y > y + h) return;
    off = Math.max(0, Math.min(max, off + dy * 0.6));
    draw();
  };
  scene.input.on('wheel', onWheel);
  draw();
  if (max > 0) {
    const hint = scene.add.text(x + w - 12, y + h + 4, 'scroll for more ▾', {
      fontFamily: FONT_SANS, fontSize: '11px', color: UI_COL.dim, stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(depth);
    box.add(hint);
  }
  box.add([t, bar]);
  box.once('destroy', () => { scene.input.off('wheel', onWheel); maskG.destroy(); });
  return box;
}

// A real text box (Phaser has none), laid over the game canvas at game coordinates (x, y).
// While it has focus the game's keyboard shortcuts are switched off, so typing "A" doesn't attack-move.
// Returns an object you can add to a Phaser scene's UI list: .value, .focus(), .setPosition(), .destroy().
export function htmlInput(scene, x, y, w, h, opts = {}) {
  const el = document.createElement('input');
  el.type = 'text';
  el.maxLength = opts.maxLength || 40;
  el.placeholder = opts.placeholder || '';
  el.value = opts.value || '';
  el.spellcheck = false;
  el.autocomplete = 'off';
  Object.assign(el.style, {
    position: 'absolute', boxSizing: 'border-box', width: `${w}px`, height: `${h}px`,
    font: `${opts.size || 18}px Georgia, 'Times New Roman', serif`, color: '#f3e7c4',
    background: 'rgba(20, 14, 8, 0.92)', border: '2px solid #a8873f', borderRadius: '3px',
    padding: '0 10px', outline: 'none', zIndex: 10, textAlign: opts.align || 'left',
    letterSpacing: opts.spacing || 'normal', textTransform: opts.upper ? 'uppercase' : 'none',
  });
  const keyboard = scene.input.keyboard;
  const mgr = keyboard && keyboard.manager;
  el.addEventListener('focus', () => { if (mgr) mgr.enabled = false; });
  el.addEventListener('blur', () => { if (mgr) { mgr.enabled = true; keyboard.resetKeys(); } });
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && opts.onEnter) opts.onEnter(el.value);
    if (e.key === 'Escape' && opts.onEscape) opts.onEscape();
  });
  if (opts.onInput) el.addEventListener('input', () => opts.onInput(el.value));
  document.body.appendChild(el);
  const place = (px, py) => {
    const r = scene.game.canvas.getBoundingClientRect();
    el.style.left = `${r.left + px}px`;
    el.style.top = `${r.top + py}px`;
  };
  place(x, y);
  return {
    el,
    get value() { return el.value; },
    set value(v) { el.value = v; },
    focus() { el.focus(); return this; },
    blur() { el.blur(); return this; },
    setPosition(px, py) { place(px, py); return this; },
    setVisible(v) { el.style.display = v ? 'block' : 'none'; return this; },
    setScrollFactor() { return this; },
    destroy() { if (el === document.activeElement) el.blur(); el.remove(); },
  };
}
