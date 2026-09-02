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
              /* Antes se hacía push: el orden del array dependía del orden en que
               * se subieran las fotos, y al reemplazar una evidencia se añadía otra
               * al final en vez de sustituirla. Como el otro dispositivo asigna las
               * fotos por POSICIÓN (evidenciasUrls[0] -> ev1), salían cambiadas de
               * sitio o se perdían al pasar de 4. Ahora cada una va a su hueco. */
              var n = parseInt(partes[2], 10) || 1;
              servicio.evidenciasUrls = servicio.evidenciasUrls || [];
              while (servicio.evidenciasUrls.length < n) servicio.evidenciasUrls.push('');
              servicio.evidenciasUrls[n - 1] = resp.url;
            }
            return DB.marcarFotoSubida(f.clave, resp.url);
          });
        });
      });
      return cadena.then(function () { return servicio; });
    });
  }

  /* Servicios a empujar: los marcados 'pendiente' MÁS los que tengan fotos sin
   * subir. Este segundo caso no se contemplaba y dejaba fotos huérfanas: si se
   * añadía una foto a un informe ya sincronizado y se cerraba el formulario sin
   * volver a guardar, el servicio seguía en 'sincronizado', nadie subía el blob
   * y esa foto no salía nunca de ese dispositivo. */
  function porEmpujar() {
    return Promise.all([DB.pendientes(), DB.uuidsConFotosSinSubir()]).then(function (r) {
      var lista = r[0], yaEstan = {};
      lista.forEach(function (s) { yaEstan[s.uuid] = true; });
      var faltan = r[1].filter(function (u) { return !yaEstan[u]; });
      return Promise.all(faltan.map(function (u) { return DB.obtenerServicio(u); }))
        .then(function (extra) {
          return lista.concat(extra.filter(function (s) { return !!s; }));
        });
    });
  }

  /* ---------- bajada de fotos ----------
   * Las URLs de Drive NO se pueden pintar en un <img> desde otro dominio (Drive
   * contesta 403 a la petición del navegador aunque el archivo sea público:
   * solo sirve al abrir el enlace a pelo). Por eso el dispositivo que no tomó
   * la foto veía la ficha completa pero sin ninguna imagen. La solución es
   * traer los bytes por la API y guardarlos en IndexedDB como cualquier otra
   * foto: se pintan siempre y además quedan disponibles sin conexión. */
  var TOPE_BAJADA = 12; // fotos por ronda de sincronización, para no ahogar los datos móviles

  function idDeUrl(u) {
    var m = /[?&]id=([^&]+)/.exec(u || '') || /\/d\/([^/=?&]+)/.exec(u || '');
    return m ? m[1] : null;
  }

  function base64ABlob(b64, mime) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'image/jpeg' });
  }

  /* Fotos que el servicio tiene en la nube: clave local <- URL remota. */
  function fotosRemotasDe(s) {
    var out = [];
    if (s.fotoPerfilUrl) out.push({ clave: s.uuid + ':perfil:1', url: s.fotoPerfilUrl });
    (s.evidenciasUrls || []).forEach(function (u, i) {
      if (u) out.push({ clave: s.uuid + ':evidencia:' + (i + 1), url: u });
    });
    return out;
  }

  /* Descarga a IndexedDB las fotos del servicio que aún no estén en local.
   * Devuelve cuántas trajo. Los fallos de una foto no tumban al resto. */
  function bajarFotosDe(servicio, tope) {
    if (!servicio || !API.configurada()) return Promise.resolve(0);
    return DB.fotosDe(servicio.uuid).then(function (locales) {
      var tengo = {};
      locales.forEach(function (f) { tengo[f.clave] = true; });
      var faltan = fotosRemotasDe(servicio).filter(function (r) { return !tengo[r.clave] && idDeUrl(r.url); });
      if (tope) faltan = faltan.slice(0, tope);
      var cadena = Promise.resolve(), n = 0;
      faltan.forEach(function (r) {
        cadena = cadena.then(function () {
          return API.foto(idDeUrl(r.url))
            .then(function (resp) {
              if (!resp || !resp.base64) return;
              return DB.guardarFotoRemota(r.clave, base64ABlob(resp.base64, resp.mime), r.url).then(function () { n++; });
            })
            .catch(function (e) { console.warn('[sync] no se pudo bajar la foto ' + r.clave + ':', e.message); });
        });
      });
      return cadena.then(function () { return n; });
    });
  }

  /* Pasada de fondo tras cada sincronización: completa las fotos que falten,
   * empezando por los servicios más recientes y con un tope por ronda. */
  function bajarFotosPendientes() {
    if (!API.configurada() || !navigator.onLine) return Promise.resolve(0);
    return DB.listarServicios().then(function (lista) {
      var restante = TOPE_BAJADA, total = 0;
      var cadena = Promise.resolve();
      lista.forEach(function (s) {
        cadena = cadena.then(function () {
          if (restante <= 0) return;
          return bajarFotosDe(s, restante).then(function (n) { restante -= n; total += n; });
        });
      });
      return cadena.then(function () { return total; });
    });
  }

  function empujarPendientes() {
    return porEmpujar().then(function (lista) {
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
  /* Margen de seguridad al retroceder la marca de agua: cubre relojes algo
   * desincronizados entre dispositivos y escrituras hechas mientras el pull viajaba. */
  var MARGEN_MS = 5 * 60 * 1000;

  /* Las URLs de las fotos SOLO las conoce el servidor: las genera Drive cuando el
   * dispositivo que tomó la foto la sube. Un equipo que ya tenía el registro en
   * local (y por tanto no lo vuelve a bajar, porque su updatedAt no es menor)
   * se quedaba para siempre con la ficha SIN fotoPerfilUrl ni evidenciasUrls, y
   * como tampoco tiene los blobs, el informe se veía sin ninguna foto.
   * Por eso, aunque el registro remoto no gane el pulso de updatedAt, se
   * rellenan los huecos de fotos que el local no tenga. Es una fusión aditiva:
   * nunca borra ni pisa una URL local existente, ni toca updatedAt ni estado
   * (no puede provocar un push ni resucitar nada). */
  function fusionarFotos(local, remoto) {
    var cambio = false;
    if (!local.fotoPerfilUrl && remoto.fotoPerfilUrl) { local.fotoPerfilUrl = remoto.fotoPerfilUrl; cambio = true; }
    var rem = remoto.evidenciasUrls || [];
    if (rem.length) {
      local.evidenciasUrls = local.evidenciasUrls || [];
      for (var i = 0; i < rem.length; i++) {
        if (rem[i] && !local.evidenciasUrls[i]) { local.evidenciasUrls[i] = rem[i]; cambio = true; }
      }
    }
    return cambio ? DB.guardarServicio(local) : null;
  }

  /* El pull incremental (solo lo cambiado desde la última vez) tiene un agujero
   * estructural: si un registro se actualiza en la nube y este dispositivo, por
   * lo que sea, no llega a recibir ese cambio, la marca de agua sigue avanzando
   * y ese registro NO VUELVE A BAJAR NUNCA. Fue lo que dejó fichas viejas sin
   * las URLs de sus fotos. Por eso el primer pull de cada arranque es completo:
   * son unas decenas de KB y el dispositivo se repara solo. Los siguientes
   * (botón, vuelta de la señal) siguen siendo incrementales. */
  var faltaPullCompleto = true;

  function traerCambios() {
    return DB.getMeta('ultimoPull').then(function (desde) {
      // Auto-reparación: si la marca guardada quedó en el futuro (ver más abajo),
      // este dispositivo estaba ciego. Se fuerza un pull completo una vez.
      if (desde && desde > new Date().toISOString()) desde = '';
      if (faltaPullCompleto) { desde = ''; faltaPullCompleto = false; }
      return API.pull(desde || '');
    }).then(function (resp) {
      var lista = resp.servicios || [], cadena = Promise.resolve(), max = '';
      lista.forEach(function (remoto) {
        if ((remoto.updatedAt || '') > max) max = remoto.updatedAt;
        cadena = cadena.then(function () {
          return DB.obtenerServicio(remoto.uuid).then(function (local) {
            if (local && local.estado === 'pendiente') return fusionarFotos(local, remoto); // lo local pendiente manda
            /* Lápida: el servidor avisa de que ese servicio se borró en otro
             * dispositivo. Sin esto, borrar en un equipo no servía de nada: el
             * siguiente pull lo devolvía y el registro resucitaba. */
            if (remoto.estado === 'eliminado') {
              if (!local) return;
              return DB.fotosDe(remoto.uuid)
                .then(function (fotos) { return Promise.all(fotos.map(function (f) { return DB.borrarFoto(f.clave); })); })
                .then(function () { return DB.borrarServicio(remoto.uuid); });
            }
            if (local && (local.updatedAt || '') >= (remoto.updatedAt || '')) return fusionarFotos(local, remoto);
            remoto.estado = 'sincronizado';
            return DB.guardarServicio(remoto);
          });
        });
      });
      return cadena.then(function () {
        if (!max) return;
        /* Aquí estaba el fallo que dejaba el móvil ciego. La marca de agua se
         * guardaba como el updatedAt MÁS ALTO del servidor, y en la hoja hay
         * registros migrados con fecha FUTURA (excel-0030 traía 2026-09-07).
         * El servidor filtra con `updatedAt > desde`, así que a partir de ese
         * momento nada de lo guardado hoy volvía a bajar: los informes nuevos
         * simplemente no existían para el otro dispositivo.
         * La marca nunca debe superar el momento actual, y se retrocede un
         * margen para no saltarse escrituras simultáneas. */
        var tope = new Date(Date.now() - MARGEN_MS).toISOString();
        var marca = max > tope ? tope : max;
        return DB.setMeta('ultimoPull', marca);
      });
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
      .then(function (n) { return bajarFotosPendientes().catch(function () {}).then(function () { return n; }); })
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

  /* Olvida la marca de agua y vuelve a bajar TODO el histórico. Es la salida
   * cuando un dispositivo se quedó desfasado (registros o fotos que sí están en
   * la nube pero él nunca llegó a recibir). No borra nada local: lo pendiente
   * sigue mandando y las fotos que aún no se han subido se empujan primero. */
  function resincronizarTodo() {
    return DB.setMeta('ultimoPull', '').then(function () { return sincronizar(); });
  }

  global.addEventListener('online', function () { sincronizar(); });
  global.Sync = {
    sincronizar: sincronizar, resincronizarTodo: resincronizarTodo,
    refrescarCatalogos: refrescarCatalogos,
    bajarFotosDe: bajarFotosDe, bajarFotosPendientes: bajarFotosPendientes
  };
})(window);
