/* Motor de sincronización (no negociable #5): local-first, cola persistente,
 * último-updatedAt-gana. Se dispara al volver la señal, al abrir la app y con el botón manual. */
(function (global) {
  'use strict';
  var sincronizando = false;

  function blobABase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result.split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  /* Sube las fotos pendientes de un servicio y escribe sus URLs en la ficha. */
  function subirFotosDe(servicio) {
    return DB.fotosDe(servicio.uuid).then(function (fotos) {
      var pendientes = fotos.filter(function (f) { return !f.subida; });
      var cadena = Promise.resolve();
      pendientes.forEach(function (f) {
        cadena = cadena.then(function () {
          var partes = f.clave.split(':'); // uuid:tipo:n
          return blobABase64(f.blob).then(function (b64) {
            return API.upload({ uuid: partes[0], tipo: partes[1], n: partes[2], mime: f.blob.type || 'image/jpeg', base64: b64 });
          }).then(function (resp) {
            if (partes[1] === 'perfil') servicio.fotoPerfilUrl = resp.url;
            else {
              servicio.evidenciasUrls = servicio.evidenciasUrls || [];
              if (servicio.evidenciasUrls.indexOf(resp.url) === -1) servicio.evidenciasUrls.push(resp.url);
            }
            return DB.marcarFotoSubida(f.clave, resp.url);
          });
        });
      });
      return cadena.then(function () { return servicio; });
    });
  }

  function empujarPendientes() {
    return DB.pendientes().then(function (lista) {
      var cadena = Promise.resolve(0), subidos = 0;
      lista.forEach(function (s) {
        cadena = cadena.then(function () {
          return subirFotosDe(s)
            .then(function (s2) { return API.save(s2); })
            .then(function () {
              s.estado = 'sincronizado';
              subidos++;
              return DB.guardarServicio(s);
            });
        });
      });
      return cadena.then(function () { return subidos; });
    });
  }

  /* Trae cambios del servidor desde el último pull. Último updatedAt gana:
   * un registro remoto solo pisa al local si es más nuevo Y el local no está pendiente. */
  function traerCambios() {
    return DB.getMeta('ultimoPull').then(function (desde) {
      return API.pull(desde || '');
    }).then(function (resp) {
      var lista = resp.servicios || [], cadena = Promise.resolve(), max = '';
      lista.forEach(function (remoto) {
        if ((remoto.updatedAt || '') > max) max = remoto.updatedAt;
        cadena = cadena.then(function () {
          return DB.obtenerServicio(remoto.uuid).then(function (local) {
            if (local && local.estado === 'pendiente') return;                 // lo local pendiente manda
            if (local && (local.updatedAt || '') >= (remoto.updatedAt || '')) return;
            remoto.estado = 'sincronizado';
            return DB.guardarServicio(remoto);
          });
        });
      });
      return cadena.then(function () { if (max) return DB.setMeta('ultimoPull', max); });
    });
  }

  function refrescarCatalogos() {
    return API.bootstrap().then(function (b) {
      return Promise.all([
        DB.guardarCatalogo('config', b.config),
        DB.guardarCatalogo('formatos', b.formatos),
        DB.guardarCatalogo('modulos', b.modulos),
        DB.guardarCatalogo('esquemas', b.esquemas),
        DB.guardarCatalogo('empresas', b.empresas)
      ]);
    });
  }

  function sincronizar() {
    if (sincronizando || !API.configurada() || !navigator.onLine) return Promise.resolve(null);
    sincronizando = true;
    global.dispatchEvent(new CustomEvent('sync:inicio'));
    return empujarPendientes()
      .then(function (n) { return traerCambios().then(function () { return n; }); })
      .then(function (n) { return refrescarCatalogos().catch(function () {}).then(function () { return n; }); })
      .then(function (n) {
        sincronizando = false;
        global.dispatchEvent(new CustomEvent('sync:fin', { detail: { subidos: n, ok: true } }));
        return n;
      })
      .catch(function (err) {
        sincronizando = false;
        global.dispatchEvent(new CustomEvent('sync:fin', { detail: { ok: false, error: String(err && err.message || err) } }));
        return null;
      });
  }

  global.addEventListener('online', function () { sincronizar(); });
  global.Sync = { sincronizar: sincronizar, refrescarCatalogos: refrescarCatalogos };
})(window);
