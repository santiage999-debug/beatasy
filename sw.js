// v3: shell con red primero (nunca se queda una versión vieja), sonidos con caché primero
const V = 'beatasy-v3', SND = 'beatasy-sounds-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'sf2.js', 'pitch.js', 'rec-worklet.js', 'manifest.webmanifest', 'sf/index.json', 'icons/icon-180.png', 'icons/icon-192.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== SND).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('.bin')) {
    e.respondWith(caches.open(SND).then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()).catch(() => {}); return res; }))));
    return;
  }
  e.respondWith(fetch(req).then(res => { if (res.ok) { const cl = res.clone(); caches.open(V).then(c => c.put(req, cl)).catch(() => {}); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
