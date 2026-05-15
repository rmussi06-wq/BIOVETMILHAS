// ── Firebase Messaging SW — deve ser importado antes de qualquer outro código ─
// Habilita push notifications em background/app fechado
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCW2HG6ECzk6OD0cenYqY1R3rsJ1Oecgek",
  authDomain:        "biovet-parceiro-vet.firebaseapp.com",
  projectId:         "biovet-parceiro-vet",
  storageBucket:     "biovet-parceiro-vet.firebasestorage.app",
  messagingSenderId: "549792200166",
  appId:             "1:549792200166:web:0cf14a3895227b79031227"
});

const messaging = firebase.messaging();

// ── Background push — app fechado ou em background ────────────────────────────
messaging.onBackgroundMessage(payload => {
  const { title = 'Biovetfarma', body = '' } = payload.notification || {};
  self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data:  payload.data || {}
  });
});

// ── CACHE ─────────────────────────────────────────────────────────────────────
const CACHE_NAME = 'biovet-v10';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/assets/logo-biovetfarma.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', e => {
  self.clients.claim();
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase, FCM e APIs externas: sempre rede
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('fcm.googleapis.com') ||
    url.hostname.includes('wa.me')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML: network-first — garante que o usuário sempre receba versão atual
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Assets estáticos: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// Recebe sinal do app.js para ativar novo SW sem reabrir o browser
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
