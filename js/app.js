/* App principal — SPA con router por hash.
 * Vistas: inicio (buscador) · detalle · nuevo/editar (formulario por esquema) · config.
 * TODO se dibuja genéricamente desde los catálogos (formatos/módulos/esquemas):
 * un formato nuevo en el Sheet aparece aquí sin tocar código (no negociable #11).
 * Toda escritura va primero a IndexedDB (local-first, no negociable #5). */
(function () {
  'use strict';

  var CAT = {};            // catálogos: config, formatos, modulos, esquemas, empresas
  var vista = document.getElementById('vista');

  // ---------- utilidades ----------
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function ahora() { return new Date().toISOString(); }
  function ir(hash) { location.hash = hash; }
  function activo(x) { return x !== false && String(x).toUpperCase() !== 'NO'; }
  function etiquetaModulo(id) {
    return (CAT.modulos && CAT.modulos[id] && CAT.modulos[id].etiqueta) ||
      id.charAt(0).toUpperCase() + id.slice(1);
  }
  function etiquetaCampo(modulo, campo) {
    var e = (CAT.esquemas || []).find(function (x) { return x.modulo === modulo && x.campo === campo; });
    return e ? e.etiqueta : campo;
  }

  // ---------- catálogos ----------
  function cargarCatalogos() {
    var nombres = ['config', 'formatos', 'modulos', 'esquemas', 'empresas'];
    return Promise.all(nombres.map(function (n) { return DB.obtenerCatalogo(n); })).then(function (vals) {
      // si falta alguno o los formatos son del modelo viejo (sin umbral), resembrar
      var invalido = vals.some(function (v) { return !v; }) ||
        !(vals[1] && vals[1][0] && vals[1][0].umbral);
      if (invalido) {
        var D = window.ESQUEMA_DEFAULT;
        CAT = { config: D.config, formatos: D.formatos, modulos: D.modulos, esquemas: D.esquemas, empresas: D.empresas };
        return Promise.all(nombres.map(function (n) { return DB.guardarCatalogo(n, CAT[n]); }));
      }
      nombres.forEach(function (n, i) { CAT[n] = vals[i]; });
    });
  }
  function esquemaDe(modulo) {
    return CAT.esquemas
      .filter(function (e) { return e.modulo === modulo && activo(e.activo); })
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  }
  function formatosActivos() {
    return CAT.formatos.filter(function (f) { return activo(f.activo); });
  }

  // ---------- chip de estado ----------
  function pintarChip() {
    DB.pendientes().then(function (p) {
      var chip = document.getElementById('chip');
      if (!navigator.onLine) { chip.className = 'chip off'; chip.textContent = '✈ Sin conexión' + (p.length ? ' · ' + p.length + ' sin subir' : ''); }
      else if (p.length) { chip.className = 'chip warn'; chip.textContent = '↑ ' + p.length + ' sin subir'; }
      else if (!API.configurada()) { chip.className = 'chip off'; chip.textContent = '⚙ API sin configurar'; }
      else { chip.className = 'chip ok'; chip.textContent = '✓ Sincronizado'; }
    });
  }
  window.addEventListener('sync:fin', pintarChip);
  window.addEventListener('online', pintarChip);
  window.addEventListener('offline', pintarChip);
  document.getElementById('chip').addEventListener('click', function () {
    Sync.sincronizar(); pintarChip();
  });

  // ---------- vista: INICIO ----------
  function vistaInicio() {
    DB.listarServicios().then(function (lista) {
      vista.innerHTML = '' +
        '<div class="fila-top">' +
        '  <input id="buscar" class="input" type="search" placeholder="Buscar por nombre o cédula…">' +
        '  <a class="btn primario" href="#/nuevo">+ Nuevo</a>' +
        '</div><div id="lista" class="lista"></div>';
      var cont = document.getElementById('lista');

      function pintar(filtro) {
        var f = (filtro || '').toLowerCase();
        var visibles = lista.filter(function (s) {
          return !f || (s.nombre || '').toLowerCase().indexOf(f) > -1 || String(s.cedula || '').indexOf(f) > -1;
        });
        cont.innerHTML = visibles.length ? visibles.map(function (s) {
          return '<a class="item" href="#/servicio/' + s.uuid + '">' +
            '<div class="item-main"><b>' + esc(s.nombre) + '</b>' +
            '<small>' + esc(s.cedula) + ' · ' + esc(s.empresa) + ' · ' + esc(s.formato) + '</small></div>' +
            '<div class="item-side"><span class="tag ' + (s.resultado === 'APROBADO' ? 'ok' : 'bad') + '">' + esc(s.resultado || '—') + '</span>' +
            (s.estado === 'pendiente' ? '<span class="dot" title="Sin subir"></span>' : '') + '</div></a>';
        }).join('') : '<p class="vacio">No hay servicios' + (f ? ' que coincidan con "' + esc(filtro) + '"' : ' todavía. Crea el primero con "+ Nuevo".') + '</p>';
      }
      pintar('');
      document.getElementById('buscar').addEventListener('input', function (e) { pintar(e.target.value); });
    });
  }

  // ---------- vista: DETALLE ----------
  function vistaDetalle(id) {
    Promise.all([DB.obtenerServicio(id), DB.fotosDe(id)]).then(function (rs) {
      var s = rs[0], fotos = rs[1];
      if (!s) { vista.innerHTML = '<p class="vacio">Servicio no encontrado.</p>'; return; }
      var ev = Aprobacion.normalizar(s.evaluacion);
      var r = Aprobacion.calcularResultado(ev);
      var perfil = fotos.find(function (f) { return f.clave.indexOf(':perfil:') > -1; });
      var urlPerfil = perfil ? Fotos.urlDeFoto(perfil) : s.fotoPerfilUrl;
      var evidencias = fotos.filter(function (f) { return f.clave.indexOf(':evidencia:') > -1; });

      var modulosHTML = r.modulos.map(function (m) {
        var items = ev.modulos[m.id];
        var filas = Object.keys(items).map(function (campo) {
          var it = items[campo];
          var etq = etiquetaCampo(m.id, campo);
          var retirado = !esquemaDe(m.id).some(function (e) { return e.campo === campo; });
          if (Number(it.max) === 1) { // ítem tipo ✅/✖️
            return '<div class="man' + (retirado ? ' retirado' : '') + '"><span>' + esc(etq) +
              (retirado ? ' <small>(retirado)</small>' : '') + '</span><b class="' + (it.nota ? 'ok' : 'bad') + '">' + (it.nota ? '✔' : '✘') + '</b></div>';
          }
          var pct = Math.round((it.nota / it.max) * 100); // ítem con puntaje
          return '<div class="barra-row' + (retirado ? ' retirado' : '') + '"><span>' + esc(etq) +
            (retirado ? ' <small>(retirado)</small>' : '') + '</span>' +
            '<div class="barra"><i style="width:' + pct + '%"></i></div><b>' + it.nota + '/' + it.max + '</b></div>';
        }).join('');
        return '<div class="card"><div class="card-head"><b>' + esc(etiquetaModulo(m.id)) +
          (m.eliminatorio ? ' <small class="ayuda">· eliminatorio</small>' : '') + '</b>' +
          '<span class="tag ' + (m.aprobado ? 'ok' : 'bad') + '">' + Math.round(m.pct * 100) + '% · peso ' + m.peso + '</span></div>' + filas + '</div>';
      }).join('');

      vista.innerHTML = '' +
        '<div class="detalle-head">' +
        (urlPerfil ? '<img class="avatar" src="' + urlPerfil + '">' : '<div class="avatar sin">📷</div>') +
        '<div><h2>' + esc(s.nombre) + '</h2><small>' + esc(s.cedula) + ' · ' + esc(s.empresa) + ' · ' + esc(s.ciudad) + '</small>' +
        '<small>' + esc(s.formato) + ' · ' + esc(s.fecha) + (s.estado === 'pendiente' ? ' · <span class="dot"></span> sin subir' : '') + '</small></div></div>' +
        '<div class="resultado-big ' + (r.resultado === 'APROBADO' ? 'ok' : 'bad') + '"><b>' + r.resultado + '</b>' +
        '<span>Final: ' + Math.round(r.total * 100) + '% · Umbral: ' + Math.round(r.umbral * 100) + '%</span></div>' +
        '<p class="veredicto">' + esc(r.detalle) + '</p>' +
        modulosHTML +
        (evidencias.length || (s.evidenciasUrls || []).length ?
          '<div class="card"><div class="card-head"><b>Evidencias</b></div><div class="galeria">' +
          evidencias.map(function (f) { return '<img src="' + Fotos.urlDeFoto(f) + '">'; }).join('') +
          '</div></div>' : '') +
        (s.observaciones ? '<div class="card"><div class="card-head"><b>Observaciones</b></div><p>' + esc(s.observaciones) + '</p></div>' : '') +
        (s.conclusiones ? '<div class="card"><div class="card-head"><b>Conclusiones</b></div><p>' + esc(s.conclusiones) + '</p></div>' : '') +
        '<div class="acciones">' +
        '  <button class="btn" id="btn-editar">✏️ Editar</button>' +
        '  <button class="btn primario" id="btn-pdf">📄 Informe PDF</button></div>';

      document.getElementById('btn-editar').onclick = function () { ir('#/editar/' + s.uuid); };
      document.getElementById('btn-pdf').onclick = function () { PDF.imprimir(s, CAT); };
    });
  }

  // ---------- vista: FORMULARIO (nuevo / editar) ----------
  function vistaForm(idExistente) {
    var prep = idExistente ? DB.obtenerServicio(idExistente) : Promise.resolve(null);
    prep.then(function (existente) {
      var s = existente || {
        uuid: uuid(), formato: formatosActivos()[0].formato,
        nombre: '', cedula: '', empresa: '', categorias: '', contacto: '', ciudad: '',
        fecha: new Date().toISOString().slice(0, 10), vigenciaA2: '', vigenciaB1: '', multas: 'No',
        observaciones: '', conclusiones: '', evidenciasUrls: [], evaluacion: null
      };
      var esNuevo = !existente;

      /* evaluación editable: si es nuevo (o cambió el formato) se construye desde el
       * esquema ACTUAL con el snapshot de pesos/umbral del formato; si se edita, se
       * parte del snapshot guardado (no se pierde nada, no negociable #1). */
      function evaluacionBase() {
        if (s.evaluacion) return Aprobacion.normalizar(JSON.parse(JSON.stringify(s.evaluacion)));
        var f = CAT.formatos.find(function (x) { return x.formato === s.formato; });
        var ev = { modulos: {}, parametros: { umbral: Number(f.umbral || CAT.config.umbralAprob || 0.8), pesos: {}, eliminatorios: (f.eliminatorios || []).slice() } };
        (f.modulos || []).forEach(function (m) {
          ev.parametros.pesos[m.id] = Number(m.peso);
          ev.modulos[m.id] = {};
          esquemaDe(m.id).forEach(function (e) {
            var max = e.control === 'toggle' ? 1 : Number(e.max || 1);
            ev.modulos[m.id][e.campo] = { nota: max, max: max }; // arranca en máximo (como el flujo del Excel)
          });
        });
        return ev;
      }
      var ev = evaluacionBase();

      function render() {
        var modulosHTML = Object.keys(ev.modulos).map(function (mod) {
          var items = ev.modulos[mod];
          var filas = Object.keys(items).map(function (campo) {
            var it = items[campo];
            var etq = etiquetaCampo(mod, campo);
            if (Number(it.max) === 1) { // toggle ✅/✖️
              return '<label class="toggle-row"><span>' + esc(etq) + '</span>' +
                '<input type="checkbox" data-item="' + mod + ':' + campo + '"' + (it.nota ? ' checked' : '') + '><i></i></label>';
            }
            return '<div class="slider-row"><label>' + esc(etq) +
              ' <output id="out-' + mod + '-' + campo + '">' + it.nota + '</output>/' + it.max + '</label>' +
              '<input type="range" min="0" max="' + it.max + '" step="1" value="' + it.nota + '" data-slider="' + mod + ':' + campo + '"></div>';
          }).join('');
          var elim = (ev.parametros.eliminatorios || []).indexOf(mod) > -1;
          return '<div class="card"><div class="card-head"><b>' + esc(etiquetaModulo(mod)) +
            (elim ? ' <small class="ayuda">· eliminatorio</small>' : '') + '</b>' +
            '<span class="tag neutro" id="pct-' + mod + '">peso ' + ev.parametros.pesos[mod] + '</span></div>' + filas + '</div>';
        }).join('');

        vista.innerHTML = '' +
          '<h2>' + (esNuevo ? 'Nuevo servicio' : 'Editar servicio') + '</h2>' +
          '<div class="card"><div class="card-head"><b>Formato</b><span class="tag neutro">umbral ' +
          Math.round(ev.parametros.umbral * 100) + '%</span></div>' +
          '<select id="f-formato" class="input"' + (esNuevo ? '' : ' disabled') + '>' +
          formatosActivos().map(function (f) {
            return '<option' + (f.formato === s.formato ? ' selected' : '') + '>' + esc(f.formato) + '</option>';
          }).join('') + '</select>' +
          (esNuevo ? '' : '<small class="ayuda">El formato no se cambia al editar (snapshot inmutable).</small>') + '</div>' +

          '<div class="card"><div class="card-head"><b>Participante</b></div>' +
          '<input class="input" id="f-nombre" placeholder="Nombre completo *" value="' + esc(s.nombre) + '">' +
          '<input class="input" id="f-cedula" placeholder="Cédula *" inputmode="numeric" value="' + esc(s.cedula) + '">' +
          '<input class="input" id="f-empresa" list="dl-empresas" placeholder="Empresa *" value="' + esc(s.empresa) + '">' +
          '<datalist id="dl-empresas">' + CAT.empresas.filter(function (e) { return activo(e.activo); })
            .map(function (e) { return '<option value="' + esc(e.empresa) + '">'; }).join('') + '</datalist>' +
          '<input class="input" id="f-ciudad" placeholder="Ciudad" value="' + esc(s.ciudad) + '">' +
          '<input class="input" id="f-categorias" placeholder="Categorías (ej. A2-C1)" value="' + esc(s.categorias) + '">' +
          '<input class="input" id="f-contacto" placeholder="Contacto" inputmode="numeric" value="' + esc(s.contacto) + '">' +
          '<input class="input" id="f-fecha" type="date" value="' + esc(s.fecha) + '">' +
          '<input class="input" id="f-vigenciaA2" placeholder="Vigencia A2 (fecha o NO TIENE)" value="' + esc(s.vigenciaA2) + '">' +
          '<input class="input" id="f-vigenciaB1" placeholder="Vigencia B1 (fecha o NO TIENE)" value="' + esc(s.vigenciaB1) + '">' +
          '<select id="f-multas" class="input"><option' + (s.multas === 'No' ? ' selected' : '') + '>No</option><option' + (s.multas === 'Si' ? ' selected' : '') + '>Si</option></select></div>' +

          '<div class="card"><div class="card-head"><b>Fotos</b></div>' +
          '<div class="foto-fila"><div id="prev-perfil" class="avatar sin">📷</div>' +
          '<label class="btn">Foto de perfil (1:1)<input type="file" accept="image/*" capture="environment" id="f-foto-perfil" hidden></label></div>' +
          '<div class="foto-fila"><div id="prev-evidencias" class="galeria mini"></div>' +
          '<label class="btn">+ Evidencia (3:5)<input type="file" accept="image/*" capture="environment" id="f-foto-evidencia" hidden></label></div></div>' +

          modulosHTML +

          '<div class="card"><div class="card-head"><b>Textos del informe</b></div>' +
          '<textarea class="input" id="f-observaciones" placeholder="Observaciones" rows="2">' + esc(s.observaciones) + '</textarea>' +
          '<textarea class="input" id="f-conclusiones" placeholder="Conclusiones" rows="3">' + esc(s.conclusiones) + '</textarea></div>' +

          '<div class="resultado-big" id="preview-resultado"></div>' +
          '<div class="acciones"><button class="btn" id="btn-cancelar">Cancelar</button>' +
          '<button class="btn primario" id="btn-guardar">💾 Guardar</button></div>';

        // --- listeners
        document.getElementById('f-formato').addEventListener('change', function (e) {
          s.formato = e.target.value; s.evaluacion = null; ev = evaluacionBase(); render();
        });
        document.getElementById('f-empresa').addEventListener('change', function (e) {
          var emp = CAT.empresas.find(function (x) { return x.empresa === e.target.value; });
          if (emp && emp.ciudad) document.getElementById('f-ciudad').value = emp.ciudad; // autocompletar ciudad
        });
        vista.querySelectorAll('input[data-slider]').forEach(function (inp) {
          inp.addEventListener('input', function () {
            var p = inp.getAttribute('data-slider').split(':');
            ev.modulos[p[0]][p[1]].nota = Number(inp.value);
            document.getElementById('out-' + p[0] + '-' + p[1]).textContent = inp.value;
            previewResultado();
          });
        });
        vista.querySelectorAll('input[data-item]').forEach(function (inp) {
          inp.addEventListener('change', function () {
            var p = inp.getAttribute('data-item').split(':');
            ev.modulos[p[0]][p[1]].nota = inp.checked ? 1 : 0;
            previewResultado();
          });
        });
        document.getElementById('f-foto-perfil').addEventListener('change', function (e) {
          if (!e.target.files[0]) return;
          Fotos.guardarPerfil(s.uuid, e.target.files[0]).then(function (blob) {
            var img = document.createElement('img');
            img.className = 'avatar'; img.src = URL.createObjectURL(blob);
            document.getElementById('prev-perfil').replaceWith(img); img.id = 'prev-perfil';
          });
        });
        document.getElementById('f-foto-evidencia').addEventListener('change', function (e) {
          if (!e.target.files[0]) return;
          Fotos.agregarEvidencia(s.uuid, e.target.files[0]).then(pintarEvidencias);
        });
        document.getElementById('btn-cancelar').onclick = function () { history.back(); };
        document.getElementById('btn-guardar').onclick = guardar;

        pintarEvidencias(); previewResultado();
      }

      function pintarEvidencias() {
        DB.fotosDe(s.uuid).then(function (fotos) {
          var evs = fotos.filter(function (f) { return f.clave.indexOf(':evidencia:') > -1; });
          var cont = document.getElementById('prev-evidencias');
          if (cont) cont.innerHTML = evs.map(function (f) { return '<img src="' + Fotos.urlDeFoto(f) + '">'; }).join('');
        });
      }

      function previewResultado() {
        var r = Aprobacion.calcularResultado(ev);
        var el = document.getElementById('preview-resultado');
        el.className = 'resultado-big ' + (r.resultado === 'APROBADO' ? 'ok' : 'bad');
        el.innerHTML = '<b>' + r.resultado + '</b><span>Final: ' + Math.round(r.total * 100) +
          '% · Umbral: ' + Math.round(r.umbral * 100) + '%</span>';
        r.modulos.forEach(function (m) {
          var t = document.getElementById('pct-' + m.id);
          if (t) { t.textContent = Math.round(m.pct * 100) + '% · peso ' + m.peso; t.className = 'tag ' + (m.aprobado ? 'ok' : 'bad'); }
        });
      }

      function guardar() {
        var nombre = document.getElementById('f-nombre').value.trim();
        var cedula = document.getElementById('f-cedula').value.trim();
        var empresa = document.getElementById('f-empresa').value.trim();
        if (!nombre || !cedula || !empresa) { alert('Nombre, cédula y empresa son obligatorios.'); return; }
        if (!/^\d+$/.test(cedula)) { alert('La cédula debe tener solo números.'); return; }

        var r = Aprobacion.calcularResultado(ev);
        Object.assign(s, {
          nombre: nombre, cedula: cedula, empresa: empresa,
          ciudad: document.getElementById('f-ciudad').value.trim(),
          categorias: document.getElementById('f-categorias').value.trim(),
          contacto: document.getElementById('f-contacto').value.trim(),
          fecha: document.getElementById('f-fecha').value,
          vigenciaA2: document.getElementById('f-vigenciaA2').value.trim(),
          vigenciaB1: document.getElementById('f-vigenciaB1').value.trim(),
          multas: document.getElementById('f-multas').value,
          observaciones: document.getElementById('f-observaciones').value.trim(),
          conclusiones: document.getElementById('f-conclusiones').value.trim(),
          evaluacion: ev, resultado: r.resultado, resultadoDetalle: r.detalle,
          updatedAt: ahora(), estado: 'pendiente'
        });
        DB.guardarServicio(s).then(function () {
          pintarChip();
          Sync.sincronizar(); // fire-and-forget: si no hay señal queda en cola
          ir('#/servicio/' + s.uuid);
        });
      }

      render();
    });
  }

  // ---------- vista: CONFIG ----------
  function vistaConfig() {
    vista.innerHTML = '' +
      '<h2>Configuración</h2>' +
      '<div class="card"><div class="card-head"><b>Conexión a la nube (Apps Script)</b></div>' +
      '<input class="input" id="c-url" placeholder="URL de la Web App (…/exec)" value="' + esc(localStorage.getItem('apiUrl') || '') + '">' +
      '<input class="input" id="c-token" type="password" placeholder="Token secreto" value="' + esc(localStorage.getItem('apiToken') || '') + '">' +
      '<div class="acciones"><button class="btn" id="c-probar">Probar conexión</button>' +
      '<button class="btn primario" id="c-guardar">Guardar</button></div>' +
      '<p class="ayuda" id="c-msg"></p></div>' +
      '<div class="card"><div class="card-head"><b>Sincronización</b></div>' +
      '<div class="acciones"><button class="btn" id="c-sync">↻ Sincronizar ahora</button>' +
      '<button class="btn" id="c-recargar">⬇ Recargar catálogos</button></div></div>' +
      '<div class="card"><div class="card-head"><b>Respaldo (no negociable #9)</b></div>' +
      '<p class="ayuda">Descarga un .json con TODOS los servicios locales, incluidos los pendientes de subir.</p>' +
      '<button class="btn" id="c-respaldo">📦 Exportar respaldo .json</button></div>';

    var msg = document.getElementById('c-msg');
    document.getElementById('c-guardar').onclick = function () {
      API.guardarConfig(document.getElementById('c-url').value, document.getElementById('c-token').value);
      msg.textContent = 'Guardado.'; pintarChip();
    };
    document.getElementById('c-probar').onclick = function () {
      API.guardarConfig(document.getElementById('c-url').value, document.getElementById('c-token').value);
      msg.textContent = 'Probando…';
      API.bootstrap().then(function () { msg.textContent = '✅ Conexión OK — catálogos disponibles.'; })
        .catch(function (e) { msg.textContent = '❌ ' + e.message; });
    };
    document.getElementById('c-sync').onclick = function () { Sync.sincronizar(); };
    document.getElementById('c-recargar').onclick = function () {
      Sync.refrescarCatalogos().then(function () { return cargarCatalogos(); })
        .then(function () { alert('Catálogos actualizados.'); });
    };
    document.getElementById('c-respaldo').onclick = function () {
      DB.listarServicios().then(function (lista) {
        var blob = new Blob([JSON.stringify({ exportado: ahora(), servicios: lista }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'respaldo-informes-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
      });
    };
  }

  // ---------- router ----------
  function enrutar() {
    var h = location.hash || '#/';
    document.getElementById('btn-atras').style.visibility = (h === '#/' || h === '') ? 'hidden' : 'visible';
    var m;
    if ((m = h.match(/^#\/servicio\/(.+)$/))) vistaDetalle(m[1]);
    else if ((m = h.match(/^#\/editar\/(.+)$/))) vistaForm(m[1]);
    else if (h === '#/nuevo') vistaForm(null);
    else if (h === '#/config') vistaConfig();
    else vistaInicio();
    pintarChip();
  }
  window.addEventListener('hashchange', enrutar);
  document.getElementById('btn-atras').onclick = function () { history.back(); };

  // ---------- arranque ----------
  cargarCatalogos().then(function () {
    enrutar();
    if (API.configurada() && navigator.onLine) Sync.sincronizar();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  });
})();
