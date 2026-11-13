// Starts the game.
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import { uiScale } from './ui.js';

// UI size: the game is drawn at (window size ÷ k) and the canvas is stretched to fill the window
// (style.css), so k > 1 makes everything bigger and k < 1 smaller. Phaser's RESIZE mode reads the
// parent's size here, so this is the one place to change.
Phaser.Scale.ScaleManager.prototype.getParentBounds = function getParentBounds() {
  if (!this.parent) return false;
  const r = this.parent.getBoundingClientRect();
  const k = uiScale(r.width, r.height);
  const w = Math.round(r.width / k);
  const h = Math.round(r.height / k);
  if (this.parentSize.width !== w || this.parentSize.height !== h) {
    this.parentSize.setSize(w, h);
    return true;
  }
  if (this.canvas) {
    const b = this.canvasBounds;
    const c = this.canvas.getBoundingClientRect();
    if (c.x !== b.x || c.y !== b.y || c.width !== b.width) return true;
  }
  return false;
};

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  powerPreference: 'high-performance', // on laptops with two graphics chips, ask for the fast one
  backgroundColor: '#0b0c0d',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: Math.round(window.innerWidth / uiScale()),
    height: Math.round(window.innerHeight / uiScale()),
  },
  scene: [MenuScene, GameScene, UIScene],
};

window.game = new Phaser.Game(config);

// Remember the browser's "install this app" offer so the main menu can show an Install button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.installPrompt = e;
  window.dispatchEvent(new Event('install-available'));
});
window.addEventListener('appinstalled', () => {
  window.installPrompt = null;
  window.dispatchEvent(new Event('install-available'));
});
