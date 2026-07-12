/* Fotos: captura desde cámara/galería, recorte centrado a proporción fija
 * (perfil 1:1, evidencias 3:5 — mismas proporciones de las macros IMAGEN2 y
 * GUARDAR_EVIDENCIA_PRACTICA del Excel), compresión agresiva (no negociable #8)
 * y guardado local-first en IndexedDB. */
(function (global) {
  'use strict';
  var LADO_MAX = 1280, CALIDAD = 0.72;

  function leerArchivo(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () { res({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  /* Recorte centrado a la proporción pedida + reescalado + JPEG comprimido. */
  function procesar(file, proporcion) { // proporcion = ancho/alto (1 para 1:1, 0.6 para 3:5)
    return leerArchivo(file).then(function (r) {
      var img = r.img, w = img.naturalWidth, h = img.naturalHeight;
      var propActual = w / h, sx = 0, sy = 0, sw = w, sh = h;
      if (propActual > proporcion) { sw = Math.round(h * proporcion); sx = Math.round((w - sw) / 2); }
      else { sh = Math.round(w / proporcion); sy = Math.round((h - sh) / 2); }

      var escala = Math.min(1, LADO_MAX / Math.max(sw, sh));
      var dw = Math.round(sw * escala), dh = Math.round(sh * escala);

      var canvas = document.createElement('canvas');
      canvas.width = dw; canvas.height = dh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      URL.revokeObjectURL(r.url);

      return new Promise(function (res) {
        canvas.toBlob(function (blob) { res(blob); }, 'image/jpeg', CALIDAD);
      });
    });
  }

  var Fotos = {
    /* Guarda la foto de perfil (1:1) de un servicio. */
    guardarPerfil: function (uuid, file) {
      return procesar(file, 1).then(function (blob) {
        return DB.guardarFoto(uuid + ':perfil:1', blob).then(function () { return blob; });
      });
    },
    /* Agrega una evidencia (3:5). Devuelve el número asignado. */
    agregarEvidencia: function (uuid, file) {
      return DB.fotosDe(uuid).then(function (fotos) {
        var nums = fotos
          .filter(function (f) { return f.clave.indexOf(uuid + ':evidencia:') === 0; })
          .map(function (f) { return parseInt(f.clave.split(':')[2], 10) || 0; });
        var n = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
        return procesar(file, 3 / 5).then(function (blob) {
          return DB.guardarFoto(uuid + ':evidencia:' + n, blob).then(function () { return n; });
        });
      });
    },
    urlDeFoto: function (registro) { // registro de DB.fotosDe / DB.obtenerFoto
      return registro && registro.blob ? URL.createObjectURL(registro.blob) : (registro && registro.url) || null;
    }
  };

  global.Fotos = Fotos;
})(window);
