/* Informe imprimible. Estrategia $0 y 100% offline: se arma una vista HTML tamaño carta
 * y se abre el diálogo de impresión del sistema — en Android/iPhone "Guardar como PDF"
 * está integrado y de ahí se comparte por WhatsApp/correo.
 * Renderiza GENÉRICAMENTE los módulos del snapshot: sirve para cualquier formato. */
(function (global) {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function generarHTML(servicio, catalogos, urls) {
    var ev = Aprobacion.normalizar(servicio.evaluacion || {});
    var r = Aprobacion.calcularResultado(ev);
    var esquemas = catalogos.esquemas || [];
    var modulos = catalogos.modulos || {};

    function etiquetaModulo(id) {
      return (modulos[id] && modulos[id].etiqueta) || id.charAt(0).toUpperCase() + id.slice(1);
    }
    function etiquetaCampo(mod, campo) {
      var e = esquemas.find(function (x) { return x.modulo === mod && x.campo === campo; });
      return e ? e.etiqueta : campo;
    }

    var modulosHTML = r.modulos.map(function (m) {
      var items = ev.modulos[m.id];
      var filas = Object.keys(items).map(function (campo) {
        var it = items[campo];
        var valor = Number(it.max) === 1
          ? (it.nota ? '✔' : '✘')
          : it.nota + ' / ' + it.max;
        return '<tr><td>' + esc(etiquetaCampo(m.id, campo)) + '</td><td class="num">' + valor + '</td></tr>';
      }).join('');
      return '<div class="veh"><h3>' + esc(etiquetaModulo(m.id)) +
        (m.eliminatorio ? ' <small>(eliminatorio)</small>' : '') +
        ' <span class="' + (m.aprobado ? 'ok' : 'bad') + '">' + Math.round(m.pct * 100) + '% · peso ' + m.peso + '</span></h3>' +
        '<table>' + filas + '</table></div>';
    }).join('');

    var evidenciasHTML = (urls.evidencias || []).map(function (u) {
      return '<img class="evidencia" src="' + u + '" alt="Evidencia">';
    }).join('');

    return '' +
      '<div class="hoja">' +
      '  <header>' +
      '    <div><h1>Informe de Evaluación</h1>' +
      '      <p class="sub">' + esc(servicio.formato || '') + ' · ' + esc(servicio.fecha || '') +
      ' · Umbral de aprobación: ' + Math.round(r.umbral * 100) + '%</p></div>' +
      (urls.perfil ? '<img class="perfil" src="' + urls.perfil + '" alt="Foto">' : '') +
      '  </header>' +
      '  <section class="datos"><table>' +
      '    <tr><td class="lbl">Nombre</td><td>' + esc(servicio.nombre) + '</td><td class="lbl">Cédula</td><td>' + esc(servicio.cedula) + '</td></tr>' +
      '    <tr><td class="lbl">Empresa</td><td>' + esc(servicio.empresa) + '</td><td class="lbl">Ciudad</td><td>' + esc(servicio.ciudad) + '</td></tr>' +
      '    <tr><td class="lbl">Categorías</td><td>' + esc(servicio.categorias) + '</td><td class="lbl">Contacto</td><td>' + esc(servicio.contacto) + '</td></tr>' +
      '    <tr><td class="lbl">Vigencia A2</td><td>' + esc(servicio.vigenciaA2) + '</td><td class="lbl">Vigencia B1</td><td>' + esc(servicio.vigenciaB1) + '</td></tr>' +
      '  </table></section>' +
      '  <div class="resultado ' + (r.resultado === 'APROBADO' ? 'ok' : 'bad') + '">' +
      '    <b>' + r.resultado + '</b><span>Calificación final: ' + Math.round(r.total * 100) + '%</span></div>' +
      '  <div class="cols">' + modulosHTML + '</div>' +
      '  <section><h2>Veredicto</h2><p>' + esc(r.detalle) + '</p></section>' +
      (servicio.observaciones ? '<section><h2>Observaciones</h2><p>' + esc(servicio.observaciones) + '</p></section>' : '') +
      (servicio.conclusiones ? '<section><h2>Conclusiones</h2><p>' + esc(servicio.conclusiones) + '</p></section>' : '') +
      (evidenciasHTML ? '<section class="pb"><h2>Evidencias</h2><div class="evs">' + evidenciasHTML + '</div></section>' : '') +
      '</div>';
  }

  /* Abre la vista de informe y lanza el diálogo de impresión (→ Guardar como PDF). */
  function imprimir(servicio, catalogos) {
    return DB.fotosDe(servicio.uuid).then(function (fotos) {
      var urls = { perfil: null, evidencias: [] };
      fotos.forEach(function (f) {
        var u = Fotos.urlDeFoto(f);
        if (f.clave.indexOf(':perfil:') > -1) urls.perfil = u;
        else if (u) urls.evidencias.push(u);
      });
      if (!urls.perfil && servicio.fotoPerfilUrl) urls.perfil = servicio.fotoPerfilUrl;
      (servicio.evidenciasUrls || []).forEach(function (u) {
        if (urls.evidencias.length < 6 && urls.evidencias.indexOf(u) === -1) urls.evidencias.push(u);
      });

      var cont = document.getElementById('print-area');
      cont.innerHTML = generarHTML(servicio, catalogos, urls);
      document.body.classList.add('imprimiendo');
      setTimeout(function () {
        window.print();
        document.body.classList.remove('imprimiendo');
      }, 150);
    });
  }

  global.PDF = { imprimir: imprimir, generarHTML: generarHTML };
})(window);
