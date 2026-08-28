// Service worker mínimo de TallerGo — hecho a mano (sin vite-plugin-pwa,
// que no es dependencia del proyecto) solo para que la app cumpla el
// requisito de "instalable" de un PWA (manifest + service worker
// registrado). NO cachea nada de forma agresiva a propósito: esta es una
// app que vive de datos siempre frescos de Supabase (stock, órdenes,
// solicitudes en tiempo real...), así que servir contenido cacheado y
// obsoleto sería peor que no tener caché — cada petición va a la red, y
// solo se cae al caché si la red falla de verdad (por ejemplo, sin
// conexión), y solo para lo que ya se sirvió antes en esta sesión.
const CACHE_NAME = 'tallergo-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((clave) => clave !== CACHE_NAME).map((clave) => caches.delete(clave))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Solo peticiones GET de este mismo origen — nunca intercepta llamadas a
  // Supabase (API/Storage/Realtime), que son de otro origen y deben ir
  // siempre a la red.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request)),
  );
});
