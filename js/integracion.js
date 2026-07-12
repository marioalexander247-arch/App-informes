/* ============================================================================
 * CAPA DE INTEGRACIÓN — conecta la UI de Mario (crear_servicio.html) con la
 * arquitectura local-first (IndexedDB + Sync + motor v2 + Apps Script).
 *
 * Estrategia: NO se modifica la lógica interna de la UI. Este archivo se carga
 * DESPUÉS del script principal y REDEFINE las funciones-frontera que antes
 * hablaban con el puente Python (/data, /save, /delete, /print, /foto):
 *   loadRecords · saveToDatabase · eliminarRegistro · cargarFotosDeDisco ·
 *   triggerPrintPDF · generateQR
 * Además: siembra catálogos, badge de sincronización, modal de configuración
 * de la API, respaldo .json y registro del Service Worker.
 *
 * La UI trabaja con el modelo plano del Excel (m_*, tecnicas, epp…); aquí se
 * traduce al snapshot modular v2 y viceversa (ver MAPEO_*). Los registros se
 * exponen con un id numérico de sesión (alias) para que toda la lógica de la
 * UI (navegación, "ID 28", nextId) siga funcionando; el uuid real vive aparte.
 * ========================================================================== */
(function () {
  'use strict';

  var INT = {
    catalogos: null,       // config, formatos, modulos, esquemas, empresas
    porUuid: {},           // uuid -> servicio v2
    uuidPorAlias: {},      // alias numérico de sesión -> uuid
    editingUuid: null
  };
  window.INT = INT;

  // ---------- mapeo campos v2 <-> claves planas de la UI ----------
  var MAPEO = {
    moto: { proyeccion: 'proyeccion_moto', equilibrio: 'equilibrio', parqueo: 'parqueo_moto', tecnicaApagado: 'tecnica_apagado' },
    motocarro: { habilidades: 'habilidades_motocarro', proyeccion: 'proyeccion_motocarro', parqueo: 'parqueo_motocarro', velocidad: 'velocidad_motocarro', visoespacial: 'visoespacial_motocarro', espejos: 'espejos_motocarro' },
    cuatrimoto: { habilidades: 'habilidades_cuatrimoto', proyeccion: 'proyeccion_cuatrimoto', parqueo: 'parqueo_cuatrimoto', velocidad: 'velocidad_cuatrimoto', visoespacial: 'visoespacial_cuatrimoto', espejos: 'espejos_cuatrimoto' },
    carro: { habilidades: 'habilidades_carro', proyeccion: 'proyeccion_carro', parqueo: 'parqueo_carro', velocidad: 'velocidad_carro', visoespacial: 'visoespacial_carro', espejos: 'espejos_carro' }
  };
  var TEORIA_CAMPOS = ['tecnicas', 'normatividad', 'epp', 'mecanica'];
  var SLOTS_EV = ['ev1', 'ev2', 'ev3', 'ev4'];

  function servicioARecord(s, alias) {
    var ev = Aprobacion.normalizar(s.evaluacion || { modulos: {}, parametros: {} });
    var rec = {
      id: alias, uuid: s.uuid,
      nombre: s.nombre, cedula: s.cedula, empresa: s.empresa, ciudad: s.ciudad,
      categorias: s.categorias, contacto: s.contacto, fecha: s.fecha,
      vigenciaA2: s.vigenciaA2, vigenciaB1: s.vigenciaB1, multas: s.multas,
      observaciones: s.observaciones, conclusiones: s.conclusiones
    };
    var teo = ev.modulos.teoria || {};
    TEORIA_CAMPOS.forEach(function (c) { rec[c] = teo[c] ? teo[c].nota : 0; });
    Object.keys(MAPEO).forEach(function (veh) {
      var mod = ev.modulos[veh] || {};
      Object.keys(MAPEO[veh]).forEach(function (campo) {
        rec['m_' + MAPEO[veh][campo]] = (mod[campo] && Number(mod[campo].nota) === 1) ? 'VERDADERO' : 'FALSO';
      });
    });
    return rec;
  }

  /* Construye la evaluación v2 desde el estado actual de la UI
   * (theoryScores / practicalScores), respetando el snapshot si se edita. */
  function evaluacionDesdeUI(existente) {
    var ev;
    if (existente && existente.evaluacion) {
      ev = Aprobacion.normalizar(JSON.parse(JSON.stringify(existente.evaluacion)));
    } else {
      var f = (INT.catalogos.formatos || []).find(function (x) { return x.formato === 'CDA COMPLETO'; }) || INT.catalogos.formatos[0];
      ev = { modulos: {}, parametros: { umbral: Number(f.umbral || 0.8), pesos: {}, eliminatorios: (f.eliminatorios || []).slice() } };
      (f.modulos || []).forEach(function (m) {
        ev.parametros.pesos[m.id] = Number(m.peso);
        ev.modulos[m.id] = {};
      });
      // teoría con máximos del esquema vigente
      (INT.catalogos.esquemas || []).forEach(function (e) {
        if (ev.modulos[e.modulo] && String(e.activo).toUpperCase() !== 'NO' && e.activo !== false) {
          ev.modulos[e.modulo][e.campo] = { nota: 0, max: e.control === 'toggle' ? 1 : Number(e.max || 1) };
        }
      });
    }
    // volcar los valores actuales de la UI en los módulos presentes del snapshot
    if (ev.modulos.teoria) {
      TEORIA_CAMPOS.forEach(function (c) {
        if (ev.modulos.teoria[c]) ev.modulos.teoria[c].nota = Number(window.theoryScores[c]) || 0;
      });
    }
    Object.keys(MAPEO).forEach(function (veh) {
      if (!ev.modulos[veh]) return;
      Object.keys(MAPEO[veh]).forEach(function (campo) {
        if (ev.modulos[veh][campo] !== undefined) {
          ev.modulos[veh][campo] = { nota: window.practicalScores[MAPEO[veh][campo]] === 1 ? 1 : 0, max: 1 };
        }
      });
    });
    return ev;
  }

  function uuidNuevo() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ---------- catálogos (siembra local-first, igual que la app base) ----------
  function cargarCatalogosDB() {
    var nombres = ['config', 'formatos', 'modulos', 'esquemas', 'empresas'];
    return Promise.all(nombres.map(function (n) { return DB.obtenerCatalogo(n); })).then(function (vals) {
      var invalido = vals.some(function (v) { return !v; }) || !(vals[1] && vals[1][0] && vals[1][0].umbral);
      if (invalido) {
        var D = window.ESQUEMA_DEFAULT;
        INT.catalogos = { config: D.config, formatos: D.formatos, modulos: D.modulos, esquemas: D.esquemas, empresas: D.empresas };
        return Promise.all(nombres.map(function (n) { return DB.guardarCatalogo(n, INT.catalogos[n]); }));
      }
      INT.catalogos = {};
      nombres.forEach(function (n, i) { INT.catalogos[n] = vals[i]; });
    });
  }

  // ============================================================
  // OVERRIDE: loadRecords — antes fetch("/data"), ahora IndexedDB
  // ============================================================
  window.loadRecords = function () {
    return DB.listarServicios().then(function (lista) {
      lista.sort(function (a, b) { return (a.updatedAt || '').localeCompare(b.updatedAt || ''); }); // alias cronológico
      INT.porUuid = {}; INT.uuidPorAlias = {};
      window.allRecords = lista.map(function (s, i) {
        var alias = i + 1;
        INT.porUuid[s.uuid] = s;
        INT.uuidPorAlias[alias] = s.uuid;
        return servicioARecord(s, alias);
      });
      var modal = document.getElementById('search-modal');
      if (modal && !modal.classList.contains('hidden')) window.filterRecords();
      return window.allRecords;
    }).catch(function () { window.allRecords = []; return window.allRecords; });
  };

  // ============================================================
  // WRAP: populateForm / nuevoRegistro — rastrear el uuid real
  // ============================================================
  var populateForm_orig = window.populateForm;
  window.populateForm = function (rec) {
    INT.editingUuid = rec && rec.uuid ? rec.uuid : null;
    populateForm_orig(rec);
  };
  var nuevoRegistro_orig = window.nuevoRegistro;
  window.nuevoRegistro = function () {
    INT.editingUuid = null;
    nuevoRegistro_orig();
  };

  // ============================================================
  // OVERRIDE: cargarFotosDeDisco — antes /foto, ahora IndexedDB
  // ============================================================
  window.cargarFotosDeDisco = function () {
    var tipos = ['profile', 'ev1', 'ev2', 'ev3', 'ev4'];
    var refs = {};
    tipos.forEach(function (t) {
      refs[t] = {
        formImg: document.getElementById('img-' + t + '-preview'),
        formPh: document.getElementById('img-' + t + '-placeholder'),
        repImg: t === 'profile' ? document.getElementById('prev-profile-photo') : document.getElementById('prev-img-' + t),
        repPh: t === 'profile' ? document.getElementById('prev-profile-photo-ph') : document.getElementById('prev-img-' + t + '-ph')
      };
      var r = refs[t];
      if (r.formImg && r.formPh) { r.formImg.classList.add('hidden'); r.formPh.classList.remove('hidden'); }
      if (r.repImg && r.repPh) { r.repImg.classList.add('hidden'); r.repPh.classList.remove('hidden'); }
    });
    if (!INT.editingUuid) return;
    var servicio = INT.porUuid[INT.editingUuid];
    DB.fotosDe(INT.editingUuid).then(function (fotos) {
      fotos.forEach(function (f) {
        var partes = f.clave.split(':'); // uuid:tipo:n
        var t = partes[1] === 'perfil' ? 'profile' : 'ev' + partes[2];
        var r = refs[t];
        if (!r) return;
        var url = URL.createObjectURL(f.blob);
        if (r.formImg && r.formPh) { r.formImg.src = url; r.formImg.classList.remove('hidden'); r.formPh.classList.add('hidden'); }
        if (r.repImg && r.repPh) { r.repImg.src = url; r.repImg.classList.remove('hidden'); r.repPh.classList.add('hidden'); }
      });
      // fallback: fotos ya subidas a Drive (otro dispositivo) sin blob local
      if (servicio) {
        if (servicio.fotoPerfilUrl && !fotos.some(function (f) { return f.clave.indexOf(':perfil:') > -1; })) {
          var r = refs.profile;
          if (r.formImg) { r.formImg.src = servicio.fotoPerfilUrl; r.formImg.classList.remove('hidden'); r.formPh.classList.add('hidden'); }
          if (r.repImg) { r.repImg.src = servicio.fotoPerfilUrl; r.repImg.classList.remove('hidden'); r.repPh.classList.add('hidden'); }
        }
        (servicio.evidenciasUrls || []).slice(0, 4).forEach(function (u, i) {
          var t = 'ev' + (i + 1);
          if (fotos.some(function (f) { return f.clave === servicio.uuid + ':evidencia:' + (i + 1); })) return;
          var r = refs[t];
          if (r.formImg) { r.formImg.src = u; r.formImg.classList.remove('hidden'); r.formPh.classList.add('hidden'); }
          if (r.repImg) { r.repImg.src = u; r.repImg.classList.remove('hidden'); r.repPh.classList.add('hidden'); }
        });
      }
    });
  };

  // ============================================================
  // OVERRIDE: saveToDatabase — antes /save al puente, ahora local-first
  // ============================================================
  window.saveToDatabase = function () {
    var nombre = document.getElementById('part-nombre').value.trim();
    var cedula = document.getElementById('part-cedula').value.trim();
    var empresa = document.getElementById('part-empresa').value;
    var categorias = document.getElementById('part-categorias').value.trim();
    var observaciones = document.getElementById('part-observaciones').value.trim();
    var conclusiones = document.getElementById('part-conclusiones').value.trim();

    if (!nombre || !cedula || !empresa || !categorias || !observaciones || !conclusiones) {
      alert('Por favor, complete los campos obligatorios del Participante, Observaciones y Conclusiones antes de guardar.');
      return;
    }
    if (!/^\d+$/.test(cedula)) { alert('La cédula debe contener solo números.'); return; }

    var changesText = window.getChangesSummary();
    if (!confirm('¿Está seguro de guardar los cambios?\n\n' + changesText)) return;

    var saveBtn = document.getElementById('save-db-btn');
    var spinner = document.getElementById('save-spinner');
    var saveIcon = document.getElementById('save-icon');
    saveBtn.disabled = true;
    spinner.classList.remove('hidden');
    saveIcon.classList.add('hidden');

    var esEdicion = INT.editingUuid !== null && INT.editingUuid !== undefined;
    var existente = esEdicion ? INT.porUuid[INT.editingUuid] : null;
    var uuid = esEdicion ? INT.editingUuid : uuidNuevo();

    var ev = evaluacionDesdeUI(existente);
    var r = Aprobacion.calcularResultado(ev);

    var servicio = Object.assign({}, existente || {}, {
      uuid: uuid,
      formato: (existente && existente.formato) || 'CDA COMPLETO',
      nombre: nombre, cedula: cedula, empresa: empresa,
      ciudad: document.getElementById('part-ciudad').value,
      categorias: categorias,
      contacto: document.getElementById('part-contacto').value.trim(),
      fecha: document.getElementById('part-fecha').value,
      vigenciaA2: document.getElementById('part-vigencia-a2').value,
      vigenciaB1: document.getElementById('part-vigencia-b1').value,
      multas: document.getElementById('part-multas').value,
      observaciones: observaciones, conclusiones: conclusiones,
      evidenciasUrls: (existente && existente.evidenciasUrls) || [],
      evaluacion: ev, resultado: r.resultado, resultadoDetalle: r.detalle,
      updatedAt: new Date().toISOString(), estado: 'pendiente'
    });

    // fotos nuevas de la sesión (base64 de cropImage) → blobs en IndexedDB
    var trabajosFotos = [];
    var imgs = window.uploadedImages || {};
    if (imgs.profile) trabajosFotos.push(guardarFotoB64(uuid + ':perfil:1', imgs.profile));
    SLOTS_EV.forEach(function (slot, i) {
      if (imgs[slot]) trabajosFotos.push(guardarFotoB64(uuid + ':evidencia:' + (i + 1), imgs[slot]));
    });

    Promise.all(trabajosFotos)
      .then(function () { return DB.guardarServicio(servicio); })
      .then(function () {
        saveBtn.disabled = false;
        spinner.classList.add('hidden');
        saveIcon.classList.remove('hidden');

        var online = navigator.onLine && API.configurada();
        alert((esEdicion ? '✅ Registro actualizado' : '✅ Servicio guardado') +
          (online ? ' — subiendo a la nube…' : ' — quedó en cola y subirá solo al recuperar señal.'));

        Sync.sincronizar();
        INT.editingUuid = null;
        window.editingId = null;
        window.setEditingUI();
        window.resetFormSilencioso();
        window.loadRecords().then(function () {
          if (typeof window.updateRecordNavIndicator === 'function') window.updateRecordNavIndicator();
          pintarBadge();
        });
      })
      .catch(function (err) {
        saveBtn.disabled = false;
        spinner.classList.add('hidden');
        saveIcon.classList.remove('hidden');
        alert('Error al guardar localmente: ' + err);
      });
  };

  function guardarFotoB64(clave, dataUrl) {
    var src = dataUrl.indexOf('data:') === 0 ? dataUrl : 'data:image/jpeg;base64,' + dataUrl;
    return fetch(src).then(function (r) { return r.blob(); })
      .then(function (blob) { return DB.guardarFoto(clave, blob); });
  }

  // ============================================================
  // OVERRIDE: eliminarRegistro — local + aviso sobre la nube
  // ============================================================
  window.eliminarRegistro = function () {
    if (!INT.editingUuid) return;
    var s = INT.porUuid[INT.editingUuid];
    var nombre = (document.getElementById('part-nombre').value || '').trim() || '(sin nombre)';
    var enNube = s && s.estado === 'sincronizado';

    if (!confirm('⚠️ ELIMINAR REGISTRO\n\n' + nombre + '\n\nSe borrará del teléfono (incluidas sus fotos locales).' +
      (enNube ? '\n\nOJO: ya está en la nube; para borrarlo de allá elimina su fila en la hoja "Servicios" del Google Sheet.' : '\n\nAún no se había subido a la nube.') +
      '\n\n¿Deseas continuar?')) return;
    if (!confirm('Esta acción no se puede deshacer en el teléfono.\n\n¿Eliminar definitivamente?')) return;

    var uuid = INT.editingUuid;
    DB.fotosDe(uuid).then(function (fotos) {
      return Promise.all(fotos.map(function (f) { return DB.borrarFoto(f.clave); }));
    }).then(function () { return DB.borrarServicio(uuid); })
      .then(function () {
        alert('🗑️ Registro eliminado del dispositivo.');
        INT.editingUuid = null;
        window.editingId = null;
        window.setEditingUI();
        window.resetFormSilencioso();
        return window.loadRecords();
      }).then(function () { pintarBadge(); });
  };

  // ============================================================
  // OVERRIDE: impresión y QR (sin servidor, sin APIs externas)
  // ============================================================
  window.triggerPrintPDF = function () { window.printPreview(); };

  window.generateQR = function () {
    var url = window.location.href;
    var img = document.getElementById('qr-image');
    if (img) { img.removeAttribute('src'); img.classList.add('hidden'); }
    var txt = document.getElementById('qr-url-text');
    if (txt) txt.textContent = url + '  —  abre esta dirección en el navegador del otro dispositivo.';
    document.getElementById('qr-modal').classList.remove('hidden');
  };

  // ============================================================
  // BADGE de sincronización + MODAL de configuración
  // ============================================================
  function pintarBadge() {
    DB.pendientes().then(function (p) {
      var b = document.getElementById('int-badge');
      if (!b) return;
      if (!navigator.onLine) { b.textContent = '✈ Sin conexión' + (p.length ? ' · ' + p.length : ''); b.style.background = '#64748b'; }
      else if (p.length) { b.textContent = '↑ ' + p.length + ' sin subir'; b.style.background = '#e09710'; }
      else if (!API.configurada()) { b.textContent = '⚙ Configurar nube'; b.style.background = '#64748b'; }
      else { b.textContent = '✓ Sincronizado'; b.style.background = '#0f9d58'; }
    });
  }

  function inyectarUI() {
    // badge flotante
    var b = document.createElement('button');
    b.id = 'int-badge';
    b.style.cssText = 'position:fixed;left:14px;bottom:88px;z-index:60;border:0;color:#fff;font:600 12px Inter,sans-serif;' +
      'padding:8px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;background:#64748b';
    b.textContent = '…';
    b.onclick = function () {
      if (API.configurada()) { Sync.sincronizar(); pintarBadge(); }
      else abrirConfig();
    };
    b.oncontextmenu = function (e) { e.preventDefault(); abrirConfig(); };
    b.ondblclick = abrirConfig;
    document.body.appendChild(b);

    // modal de configuración
    var m = document.createElement('div');
    m.id = 'int-config';
    m.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px';
    m.innerHTML =
      '<div style="background:var(--panel-bg,#1d1e20);color:var(--on-surface,#e2e8f0);border-radius:18px;padding:22px;max-width:420px;width:100%;font-family:Inter,sans-serif">' +
      '<h3 style="margin:0 0 4px;font-size:17px">☁️ Conexión a la nube</h3>' +
      '<p style="margin:0 0 12px;font-size:12.5px;opacity:.7">URL /exec de Apps Script y token (Setup → mostrarToken). Se guardan solo en este dispositivo.</p>' +
      '<input id="int-url" placeholder="https://script.google.com/macros/s/…/exec" style="width:100%;padding:11px;border-radius:10px;border:1px solid #444;background:rgba(0,0,0,.25);color:inherit;margin:4px 0">' +
      '<input id="int-token" type="password" placeholder="Token secreto" style="width:100%;padding:11px;border-radius:10px;border:1px solid #444;background:rgba(0,0,0,.25);color:inherit;margin:4px 0">' +
      '<p id="int-msg" style="font-size:12.5px;min-height:18px;margin:6px 0"></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="int-probar" style="flex:1;padding:10px;border-radius:10px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer">Probar</button>' +
      '<button id="int-guardar" style="flex:1;padding:10px;border-radius:10px;border:0;background:#f5ab1a;color:#131415;font-weight:700;cursor:pointer">Guardar</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
      '<button id="int-sync" style="flex:1;padding:10px;border-radius:10px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer">↻ Sincronizar</button>' +
      '<button id="int-backup" style="flex:1;padding:10px;border-radius:10px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer">📦 Respaldo .json</button>' +
      '<button id="int-cerrar" style="flex:1;padding:10px;border-radius:10px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer">Cerrar</button>' +
      '</div></div>';
    document.body.appendChild(m);

    document.getElementById('int-cerrar').onclick = function () { m.style.display = 'none'; };
    document.getElementById('int-guardar').onclick = function () {
      API.guardarConfig(document.getElementById('int-url').value, document.getElementById('int-token').value);
      document.getElementById('int-msg').textContent = 'Guardado ✓';
      pintarBadge();
      Sync.sincronizar();
    };
    document.getElementById('int-probar').onclick = function () {
      API.guardarConfig(document.getElementById('int-url').value, document.getElementById('int-token').value);
      document.getElementById('int-msg').textContent = 'Probando…';
      API.bootstrap().then(function () { document.getElementById('int-msg').textContent = '✅ Conexión OK'; })
        .catch(function (e) { document.getElementById('int-msg').textContent = '❌ ' + e.message; });
    };
    document.getElementById('int-sync').onclick = function () { Sync.sincronizar(); };
    document.getElementById('int-backup').onclick = function () {
      DB.listarServicios().then(function (lista) {
        var blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), servicios: lista }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'respaldo-informes-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
      });
    };
  }

  function abrirConfig() {
    document.getElementById('int-url').value = localStorage.getItem('apiUrl') || '';
    document.getElementById('int-token').value = localStorage.getItem('apiToken') || '';
    document.getElementById('int-config').style.display = 'flex';
  }
  window.abrirConfigNube = abrirConfig; // por si se quiere enlazar desde el menú FAB

  // ============================================================
  // ARRANQUE (corre después del init de la UI, mismo evento)
  // ============================================================
  window.addEventListener('DOMContentLoaded', function () {
    cargarCatalogosDB().then(function () {
      // empresas reales al selector (la UI puso un catálogo de muestra)
      window.cargarCatalogos(
        (INT.catalogos.empresas || [])
          .filter(function (e) { return e.activo !== false && String(e.activo).toUpperCase() !== 'NO'; })
          .map(function (e) { return { nombre: e.empresa, ciudad: e.ciudad }; })
      );
      inyectarUI();
      pintarBadge();
      // registros ya cargados por el init de la UI (con el override); refrescar por si acaso
      window.loadRecords().then(function () {
        if (typeof window.updateRecordNavIndicator === 'function') window.updateRecordNavIndicator();
      });
      if (API.configurada() && navigator.onLine) Sync.sincronizar();
    });

    window.addEventListener('online', pintarBadge);
    window.addEventListener('offline', pintarBadge);
    window.addEventListener('sync:fin', function (e) {
      pintarBadge();
      if (e.detail && e.detail.ok) {
        window.loadRecords(); // el pull pudo traer registros nuevos
        // catálogos frescos del Sheet → refrescar empresas del selector
        cargarCatalogosDB().then(function () {
          window.cargarCatalogos(
            (INT.catalogos.empresas || []).map(function (e2) { return { nombre: e2.empresa, ciudad: e2.ciudad }; })
          );
        });
      }
    });

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  });
})();
