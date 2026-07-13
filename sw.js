/* Service Worker — blindaje offline (no negociable #5).
 * App shell cache-first: la app abre SIEMPRE, con o sin señal.
 * Fuentes de Google: caché en tiempo de ejecución (para que los íconos y
 * tipografías también funcionen sin conexión tras la primera visita).
 * Las llamadas a la API de Apps Script van solo por red; Sync maneja la cola. */
var VERSION = 'appinf-v4';
var SHELL = [
  './', 'index.html', 'manifest.json', 'tailwind.js',
  'js/esquema-default.js', 'js/aprobacion.js', 'js/db.js', 'js/api.js',
  'js/sync.js', 'js/integracion.js',
  'icons/icon-192.png', 'icons/icon-512.png'
];
var FUENTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== VERSION + '-fuentes'; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return; // POSTs (API): red directa
  var url = new URL(e.request.url);

  // fuentes/íconos de Google → cache-first en caché aparte
  if (FUENTES.indexOf(url.origin) > -1) {
    e.respondWith(
      caches.open(VERSION + '-fuentes').then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (resp) {
            c.put(e.request, resp.clone());
            return resp;
          });
        });
      })
    );
    return;
  }

  if (url.origin !== location.origin) return; // API Apps Script: red directa

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (resp) {
        var copia = resp.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
        return resp;
      });
    })
  );
});
