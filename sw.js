/* Service Worker — blindaje offline (no negociable #5).
 * App shell cache-first: la app abre SIEMPRE, con o sin señal.
 * Fuentes de Google: caché en tiempo de ejecución (para que los íconos y
 * tipografías también funcionen sin conexión tras la primera visita).
 * Las llamadas a la API de Apps Script van solo por red; Sync maneja la cola. */
var VERSION = 'appinf-v19';
var SHELL = [
  './', 'index.html', 'manifest.json', 'tailwind.js',
  'js/esquema-default.js', 'js/aprobacion.js', 'js/db.js', 'js/api.js',
  'js/sync.js', 'js/integracion.js', 'js/preview-fit.js',
  'js/menu-gooey.js', 'js/camara.js', 'js/zoom-informe.js', 'js/salida.js', 'js/borrador.js',
  'img/firma-valentina-ochoa.png', 'img/firma-mario-cordoba.png',
  'icons/icon-192.png', 'icons/icon-512.png'
];
var FUENTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  /* `cache: 'reload'` obliga a pedir cada archivo a la RED. Sin esto, el
   * Service Worker nuevo se instalaba pero rellenaba su caché con las copias
   * viejas guardadas por el navegador (HTTP cache), así que subir la versión
   * no servía de nada: el dispositivo seguía ejecutando el código anterior. */
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (resp) {
        if (resp && resp.ok) return c.put(u, resp);
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
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

  /* La página de rescate NUNCA se cachea: es la que se abre precisamente
   * cuando el caché tiene código viejo, así que tiene que llegar de la red. */
  if (url.pathname.indexOf('actualizar.html') > -1) return;
  if (url.pathname.indexOf('diagnostico.html') > -1) return;

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
