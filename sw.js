/* Service Worker de la raíz — RETIRADO (2026-10-04).
 *
 * La app principal ahora es /nueva/ (con su propio Service Worker). La clásica
 * quedó como respaldo en clasica.html. Este archivo reemplaza al SW viejo
 * (caché "appinf-v*"): borra esa caché, toma el control y recarga las pestañas
 * abiertas para que la raíz deje de servir la app clásica guardada y pase a
 * la redirección hacia /nueva/. No intercepta peticiones: todo va a la red. */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf('appinf-') === 0; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (ventanas) {
        ventanas.forEach(function (v) {
          var u = new URL(v.url);
          // Solo la raíz: la que antes mostraba la clásica desde caché
          if (/\/(index\.html)?$/.test(u.pathname) && u.pathname.indexOf('/nueva/') === -1) v.navigate(v.url);
        });
      })
  );
});
