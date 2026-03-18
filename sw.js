const CACHE = 'list-v1';
const ASSETS = [
    '/list/',
    '/list/index.html',
    '/list/manifest.json',
    'https://fonts.googleapis.com/css2?family=Martian+Mono:wght@300;400;500&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // Для API GitHub — только сеть, без кэша
    if (e.request.url.includes('api.github.com')) {
        e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
        return;
    }
    // Для остального — сначала кэш, потом сеть
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE).then(cache => cache.put(e.request, clone));
            }
            return response;
        }))
    );
});