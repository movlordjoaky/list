const CACHE = 'list';
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
    if (!e.request.url.startsWith('http')) return;
    if (e.request.url.includes('api.github.com')) {
        e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    const url = new URL(e.request.url);
    const sameOrigin = url.origin === self.location.origin;

    if (sameOrigin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/list/')) {
        // stale-while-revalidate
        e.respondWith(
            caches.open(CACHE).then(async cache => {
                const cached = await cache.match(e.request);
                const fetchPromise = fetch(e.request).then(response => {
                    if (response.ok) cache.put(e.request, response.clone());
                    return response;
                }).catch(() => cached);
                return cached || fetchPromise;
            })
        );
        return;
    }

    // РѕСЃС‚Р°Р»СЊРЅРѕРµ вЂ” cache-first
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
            if (response.ok && e.request.url.startsWith('https://')) {
                const clone = response.clone();
                caches.open(CACHE).then(cache => cache.put(e.request, clone));
            }
            return response;
        }))
    );
});
