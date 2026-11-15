const C = 'rakat-v1', A = ['./', 'index.html', 'app.js', 'salah.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(A))));
self.addEventListener('fetch', e => { if (new URL(e.request.url).origin === location.origin) e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });
