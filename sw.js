// Service worker: lets the installed game run offline.
// Strategy: always try the network first (so updates show up straight away), fall back to the saved copy when offline.
// Bump CACHE when you want old offline copies thrown away.
const CACHE = 'age-of-emissions-v19';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'favicon.ico',
  'lib/phaser.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-32.png',
  'src/main.js',
  'src/config.js',
  'src/iso.js',
  'src/map.js',
  'src/pathfinding.js',
  'src/art.js',
  'src/unit.js',
  'src/buildings.js',
  'src/climate.js',
  'src/ai.js',
  'src/audio.js',
  'src/fog.js',
  'src/save.js',
  'src/ui.js',
  'src/help.js',
  'src/stats.js',
  'src/effects.js',
  'src/cursors.js',
  'src/wildlife.js',
  'src/rng.js',
  'src/replay.js',
  'src/net.js',
  'src/setup.js',
  'src/practice.js',
  'src/trees.js',
  'src/scenes/MenuScene.js',
  'src/scenes/GameScene.js',
  'src/scenes/UIScene.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Online play (/api/...) always goes straight to the server.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
