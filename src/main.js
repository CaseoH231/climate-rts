// Starts the game.
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0c0d',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
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
