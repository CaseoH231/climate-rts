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
  return items;
}
