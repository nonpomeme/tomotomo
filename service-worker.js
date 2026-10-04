/* TomoTomo — オフライン対応（service worker）
   アプリ本体はキャッシュからすぐ表示し、裏で最新版を取りに行く（次回起動時に反映）。
   AIサーバー（別ドメイン）や POST には一切さわらない。 */
const CACHE = 'tomotomo-v1';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'src/styles.css', 'src/data.js', 'src/core.js', 'src/learning.js', 'src/ai.js', 'src/partners.js',
  'src/views.js', 'src/map.js', 'src/lesson.js', 'src/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(staleWhileRevalidate(req, e));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(CACHE);
  // 画面の読み込み（URLに ?… が付いていても）は index.html として扱う
  const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req;
  const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
  const update = fetch(req).then(res => { if (res.ok) cache.put(key, res.clone()); return res; });
  if (hit) { e.waitUntil(update.catch(() => {})); return hit; }
  try { return await update; } catch (err) { return (await cache.match('index.html')) || Response.error(); }
}
