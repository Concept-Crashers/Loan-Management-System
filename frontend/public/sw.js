const CACHE = 'trust-loans-shell-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg', '/icons/icon-192-maskable.svg', '/icons/icon-512-maskable.svg']
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('sync', (event) => {
  if (event.tag === 'lendflow-sync' || event.tag === 'trust-loans-sync') event.waitUntil(self.clients.matchAll().then((clients) => clients.forEach((client) => client.postMessage({ type: 'trust-loans:sync', legacyType: 'lendflow:sync' }))))
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return
  const request = event.request
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && request.destination !== 'document') {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
    }
    return response
  }).catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html'))))
})
