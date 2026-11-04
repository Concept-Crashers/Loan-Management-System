const CACHE = 'lendflow-shell-v1'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/','/index.html'])))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))))
})
