// Service Worker - Patio de Don Simón PWA
const CACHE_NAME = 'patio-don-simon-v1.0.0';
const RUNTIME_CACHE = 'patio-don-simon-runtime-v1';

// Recursos que se cachean en la instalación
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js'
];

// ============ INSTALACIÓN ============
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Cacheando recursos iniciales');
                return cache.addAll(PRECACHE_URLS.map(url => {
                    return new Request(url, { cache: 'reload' });
                })).catch(err => {
                    console.warn('⚠️ Algunos recursos no se pudieron cachear:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// ============ ACTIVACIÓN ============
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: activando...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                    .map((name) => {
                        console.log('🗑️ Eliminando caché antigua:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ============ FETCH ============
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // No interceptar Firestore ni llamadas a Google APIs (excepto gstatic de JS)
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com') && !url.hostname.includes('gstatic')) {
        return;
    }

    // Solo GET
    if (request.method !== 'GET') return;

    // Estrategia: Cache First para recursos estáticos, Network First para HTML
    if (request.mode === 'navigate' || request.destination === 'document') {
        // Network First con fallback a caché
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request).then((cached) => {
                        return cached || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // Cache First para el resto
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) {
                // Actualizar en segundo plano
                fetch(request).then((response) => {
                    if (response && response.status === 200) {
                        caches.open(RUNTIME_CACHE).then((cache) => {
                            cache.put(request, response);
                        });
                    }
                }).catch(() => {});
                return cached;
            }

            return fetch(request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => {
                    cache.put(request, responseClone);
                });
                return response;
            }).catch(() => {
                // Fallback offline
                if (request.destination === 'image') {
                    return caches.match('./icon-192.png');
                }
            });
        })
    );
});

// ============ MENSAJES ============
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
