/* Capa local IndexedDB — sin dependencias externas (costo $0, no negociable #8).
 * Stores:
 *   servicios  → keyPath 'uuid'   (toda la ficha, incl. evaluacion JSON)
 *   fotos      → keyPath 'clave'  ('uuid:tipo:n' → {blob, subida:bool})
 *   catalogos  → keyPath 'nombre' (bootstrap: esquemas, formatos, empresas, config)
 *   meta       → keyPath 'clave'  (ultimoPull, etc.) */
(function (global) {
  'use strict';
  var DB_NAME = 'informes-cda', DB_VER = 1, _db = null;

  function abrir() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('servicios')) {
          var s = d.createObjectStore('servicios', { keyPath: 'uuid' });
          s.createIndex('updatedAt', 'updatedAt');
          s.createIndex('estado', 'estado');
        }
        if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', { keyPath: 'clave' });
        if (!d.objectStoreNames.contains('catalogos')) d.createObjectStore('catalogos', { keyPath: 'nombre' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'clave' });
      };
      req.onsuccess = function () { _db = req.result; res(_db); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function tx(store, modo, fn) {
    return abrir().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, modo), st = t.objectStore(store), out = fn(st);
        t.oncomplete = function () { res(out && out._r !== undefined ? out._r : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  function pedir(req) { // envuelve un IDBRequest para leer su resultado al completar la tx
    var o = {};
    req.onsuccess = function () { o._r = req.result; };
    return o;
  }

  var DB = {
    guardarServicio: function (s) { return tx('servicios', 'readwrite', function (st) { st.put(s); }); },
    obtenerServicio: function (uuid) { return tx('servicios', 'readonly', function (st) { return pedir(st.get(uuid)); }); },
    borrarServicio: function (uuid) { return tx('servicios', 'readwrite', function (st) { st.delete(uuid); }); },
    listarServicios: function () {
      return tx('servicios', 'readonly', function (st) { return pedir(st.getAll()); })
        .then(function (arr) {
          return (arr || []).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
        });
    },
    pendientes: function () {
      return DB.listarServicios().then(function (arr) {
        return arr.filter(function (s) { return s.estado === 'pendiente'; });
      });
    },

    guardarFoto: function (clave, blob) {
      return tx('fotos', 'readwrite', function (st) { st.put({ clave: clave, blob: blob, subida: false }); });
    },
    marcarFotoSubida: function (clave, url) {
      return tx('fotos', 'readonly', function (st) { return pedir(st.get(clave)); }).then(function (f) {
        if (!f) return;
        f.subida = true; f.url = url;
        return tx('fotos', 'readwrite', function (st) { st.put(f); });
      });
    },
    obtenerFoto: function (clave) { return tx('fotos', 'readonly', function (st) { return pedir(st.get(clave)); }); },
    fotosDe: function (uuid) {
      return tx('fotos', 'readonly', function (st) { return pedir(st.getAll()); }).then(function (todas) {
        return (todas || []).filter(function (f) { return f.clave.indexOf(uuid + ':') === 0; });
      });
    },
    borrarFoto: function (clave) { return tx('fotos', 'readwrite', function (st) { st.delete(clave); }); },

    guardarCatalogo: function (nombre, datos) {
      return tx('catalogos', 'readwrite', function (st) { st.put({ nombre: nombre, datos: datos }); });
    },
    obtenerCatalogo: function (nombre) {
      return tx('catalogos', 'readonly', function (st) { return pedir(st.get(nombre)); })
        .then(function (r) { return r ? r.datos : null; });
    },

    setMeta: function (clave, valor) { return tx('meta', 'readwrite', function (st) { st.put({ clave: clave, valor: valor }); }); },
    getMeta: function (clave) {
      return tx('meta', 'readonly', function (st) { return pedir(st.get(clave)); })
        .then(function (r) { return r ? r.valor : null; });
    }
  };

  global.DB = DB;
})(window);
