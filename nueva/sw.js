/* Service Worker de la app nueva (alcance: /nueva/).
 * - La página: primero la red (así las actualizaciones llegan al abrir con señal)
 *   y, sin señal, la copia guardada: la app abre siempre (no negociable #5).
 * - Archivos (js, css, íconos, firmas): copia guardada al instante y se
 *   refresca en segundo plano para la próxima vez.
 * - Fuentes de Google: guardadas en su propia caché tras la primera visita.
 * - La API de Apps Script nunca pasa por aquí (otro dominio). */
var VERSION = 'nueva-v11';
var SHELL = [
  './', 'index.html', 'app.css', 'informe.css', 'app.js', 'manifest.json',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  '../js/esquema-default.js', '../js/aprobacion.js', '../js/db.js', '../js/api.js', '../js/sync.js',
  '../img/firma-valentina-ochoa.png', '../img/firma-mario-cordoba.png',
  '../vendor/html2canvas.min.js', '../vendor/jspdf.umd.min.js' // PDF para WhatsApp, también sin señal
];
var FUENTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('nueva-') === 0 && k.indexOf(VERSION) !== 0; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);

  if (FUENTES.indexOf(url.origin) > -1) {
    e.respondWith(caches.open(VERSION + '-fuentes').then(function (c) {
      return c.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (r) { c.put(e.request, r.clone()); return r; });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  if (e.request.mode === 'navigate') {
    // Una petición de navegación no admite opciones: se pide por su URL
    e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      var copia = r.clone();
      caches.open(VERSION).then(function (c) { c.put('index.html', copia); });
      return r;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }

  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var red = fetch(e.request, { cache: 'no-cache' }).then(function (r) { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(function () { return hit; });
      return hit || red;
    });
  }));
});
