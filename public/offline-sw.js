// GitHub Pages offline shell. Bundled index is prefetched on service worker install;
// downloaded online puzzles themselves are stored explicitly in IndexedDB.
const CACHE = 'sudokupadx-offline-shell-v2';
const scope = self.registration.scope;
const shell = [
  'puzzles/online-index.json',
  'puzzles/catalog.json',
  'puzzles/locale-zh.json',
  'puzzles/digits-of-despair.scl',
  'puzzles/lineage-of-logic.scl',
  'puzzles/super-sudokoid-1.scl',
  'puzzles/super-sudokoid-2.scl',
  'wasm/sudokupadx_web.js',
  'wasm/sudokupadx_web_bg.wasm'
];
const local = path => new URL(path, scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let assets = shell.map(local);
    try {
      const response = await fetch(scope, {cache:'reload'});
      if (response.ok) {
        const html = await response.clone().text();
        await cache.put(scope, response);
        // Vite emits content-hashed JS/CSS links; prefetch them, including on
        // the first web visit (before the service worker controls the page).
        const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)];
        for (const match of urls) {
          const url = new URL(match[1], scope);
          if (url.origin === self.location.origin && url.href.startsWith(scope)) assets.push(url.href);
        }
      }
    } catch {}
    // Cache every catalog-listed puzzle, including all nested side quests.
    try {
      const response=await fetch(local('puzzles/catalog.json'),{cache:'reload'});
      if(response.ok){
        const catalog=await response.json();
        for(const entry of catalog.items||[]){
          if(typeof entry.file==='string'&&/^puzzles\/[a-z0-9-]+\.scl$/.test(entry.file))
            assets.push(local(entry.file));
        }
      }
    }catch {}
    await Promise.allSettled([...new Set(assets)].map(async url => {
      try {
        const response = await fetch(url, {cache:'reload'});
        if (response.ok && response.type !== 'opaque') await cache.put(url,response);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('sudokupadx-offline-shell-') && key!==CACHE)
      .map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) return;
  const preferNetwork = request.mode === 'navigate' ||
    url.pathname.endsWith('/puzzles/online-index.json');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (!preferNetwork) {
      const saved = await cache.match(request);
      if (saved) return saved;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque')
        await cache.put(request,response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(request);
      if (saved) return saved;
      if (request.mode === 'navigate') {
        const root = await cache.match(scope);
        if (root) return root;
      }
      throw error;
    }
  })());
});
