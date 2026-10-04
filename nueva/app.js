/* Tesos Informes — app nueva (interfaz minimalista).
 *
 * Reutiliza SIN CAMBIOS la fontanería de la app clásica (../js): base local
 * (DB), nube (API), sincronización (Sync), motor de aprobación (Aprobacion) y
 * esquema por defecto. Las dos apps comparten los mismos datos del teléfono.
 *
 * Reglas propias de esta app:
 *  - Un borrador NO tiene número y NO entra a "servicios": vive en meta
 *    'borradoresNueva'. Se guarda solo, sin preguntar.
 *  - El consecutivo se asigna al EMITIR (mismo contador 'folioTecho' que la
 *    app clásica, así no se pisan).
 *  - La hoja del informe es la misma de la app clásica y se pinta con la misma
 *    lógica (updatePreviewData portado tal cual).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utilidades
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /* Acepta "2026-04-07" o "07/04/2026" (los migrados del Excel) y devuelve ISO. */
  function aISO(v) {
    if (!v) return '';
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return '';
  }
  function fechaLocal(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function ddmmaaaa(iso) { var p = aISO(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function fechaLarga(iso) {
    return fechaLocal(iso).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  function fechaCorta(iso) {
    if (!iso) return '';
    if (iso === hoyISO()) return 'hoy';
    return fechaLocal(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
  function normal(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function uuidNuevo() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function primerNombre(n) {
    var p = String(n || '').trim().split(/\s+/);
    return p.length > 2 ? p[0] + ' ' + p[p.length - 2] : (n || 'Sin nombre');
  }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  // ----------------------------------------------------------- textos fijos
  var PLANTILLAS = {
    obs: {
      1: 'Apto para el cargo en las categorias presentadas.',
      2: 'Apto con observaciones. Se recomienda realizar seguimiento periódico y capacitación de refuerzo en técnicas preventivas.'
    },
    concl: {
      // Igual al PDF de referencia (folio 28), incluida la última frase.
      1: 'En cumplimiento de lo establecido en la NTC-ISO -IEC 17020 numeral 6.1.1. y CEA- 3.0-01 numeral 6.1.1., se realizó prueba al personal que realiza movimiento de vehículos durante las actividades de inspección. Los resultados evidencian que el colaborador evaluado demuestra los conocimientos, habilidades técnicas y destrezas prácticas necesarias para la correcta y segura movilización de los vehículos, conforme a los tipos de vehículos asociados a la clase de servicio prestado por el CDA.',
      2: 'realizó la prueba teórica, la cual es un componente obligatorio dentro del proceso de evaluación. En consecuencia, no es posible emitir una calificación final, ya que dicha prueba es fundamental para verificar los conocimientos normativos, técnicos y de seguridad vial requeridos.'
    }
  };
  var CATEGORIAS = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
  var TEORIA = [
    { campo: 'tecnicas', etq: 'Técnicas de conducción', max: 10 },
    { campo: 'normatividad', etq: 'Normatividad', max: 10 },
    { campo: 'epp', etq: 'Elementos EPP', max: 5 },
    { campo: 'mecanica', etq: 'Mecánica básica', max: 5 }
  ];
  // Orden en pista (como la app clásica) y nombres cortos del informe (maneuversSpec.corto)
  var VEHICULOS = [
    { id: 'moto', etq: 'Moto' }, { id: 'motocarro', etq: 'Motocarro' },
    { id: 'cuatrimoto', etq: 'Cuatrimoto' }, { id: 'carro', etq: 'Automóvil' }
  ];
  var CORTO = {
    moto: { proyeccion: 'Proyeccion', equilibrio: 'Equilibrio', parqueo: 'Tecnica de parqueo', tecnicaApagado: 'Mover vehiculo apagado' },
    otro: { habilidades: 'Habilidades en pista', proyeccion: 'Proyeccion', parqueo: 'Tecnica de parqueo', velocidad: 'Manejo baja velocidad', visoespacial: 'Adaptacion visoespacial', espejos: 'Uso correcto retrovisores' }
  };
  function corto(mod, campo) { return (mod === 'moto' ? CORTO.moto : CORTO.otro)[campo] || campo; }

  // ----------------------------------------------------------------- estado
  var CAT = null;        // catálogos (config, formatos, modulos, esquemas, empresas)
  var SERV = [];         // servicios emitidos (de la base local compartida)
  var BORR = {};         // borradores de esta app: uuid -> ficha
  var F = null;          // ficha abierta
  var ORIGINAL = null;   // copia de la ficha emitida al empezar a editarla
  var techo = 0;         // folioTecho compartido con la app clásica
  var abiertoVeh = 'moto';
  var ultimaRuta = 'inicio';

  function activo(x) { return x !== false && String(x).toUpperCase() !== 'NO'; }

  function cargarCatalogos() {
    var nombres = ['config', 'formatos', 'modulos', 'esquemas', 'empresas'];
    return Promise.all(nombres.map(function (n) { return DB.obtenerCatalogo(n); })).then(function (vals) {
      var invalido = vals.some(function (v) { return !v; }) || !(vals[1] && vals[1][0] && vals[1][0].umbral);
      if (invalido) {
        var D = window.ESQUEMA_DEFAULT;
        CAT = { config: D.config, formatos: D.formatos, modulos: D.modulos, esquemas: D.esquemas, empresas: D.empresas };
        return Promise.all(nombres.map(function (n) { return DB.guardarCatalogo(n, CAT[n]); }));
      }
      CAT = {}; nombres.forEach(function (n, i) { CAT[n] = vals[i]; });
    });
  }
  function maniobras(mod) {
    return (CAT.esquemas || []).filter(function (e) { return e.modulo === mod && activo(e.activo); })
      .sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  }
  function empresas() {
    return (CAT.empresas || []).filter(function (e) { return activo(e.activo); });
  }

  // ------------------------------------------------------------------ folios
  function folioDe(s) {
    var m = /^excel-0*(\d+)$/.exec(String(s.uuid || ''));
    if (m) return parseInt(m[1], 10);
    var ev = s.evaluacion;
    return ev && ev.folio ? Number(ev.folio) : null;
  }
  function siguienteNumero() {
    var max = techo;
    SERV.forEach(function (s) { var f = folioDe(s); if (f && f > max) max = f; });
    return max + 1;
  }
  function tomarFolio() {
    return DB.getMeta('folioTecho').then(function (v) {
      techo = Math.max(techo, Number(v || 0));
      var n = siguienteNumero();
      techo = n;
      return DB.setMeta('folioTecho', n).then(function () { return n; });
    });
  }

  // --------------------------------------------------------- datos locales
  function recargar() {
    return Promise.all([DB.listarServicios(), DB.getMeta('borradoresNueva'), DB.getMeta('folioTecho')]).then(function (r) {
      SERV = r[0] || [];
      BORR = r[1] || {};
      techo = Math.max(techo, Number(r[2] || 0));
    });
  }
  var tGuardar;
  function guardarBorrador() {
    if (!F || F.base) { if (F && F.base) F.sucio = true; return; }
    F.actualizado = new Date().toISOString();
    BORR[F.uuid] = F;
    clearTimeout(tGuardar);
    tGuardar = setTimeout(function () {
      DB.setMeta('borradoresNueva', BORR).then(function () {
        $$('[data-guardado]').forEach(function (el) { el.textContent = 'Guardado'; });
      });
    }, 350);
  }
  function quitarBorrador(uuid) {
    delete BORR[uuid];
    return DB.setMeta('borradoresNueva', BORR);
  }

  // ------------------------------------------------------- fichas y snapshot
  function practicaVacia(valor) {
    var p = {};
    VEHICULOS.forEach(function (v) {
      p[v.id] = {};
      maniobras(v.id).forEach(function (m) { p[v.id][m.campo] = valor; });
    });
    return p;
  }
  function fichaNueva(base) {
    var ult = localStorage.getItem('ultimaEmpresa') || '';
    var emp = empresas().find(function (e) { return e.empresa === ult; });
    return {
      uuid: uuidNuevo(), formato: 'CDA COMPLETO',
      nombre: '', cedula: '', contacto: '', categorias: '',
      empresa: base ? base.empresa : (emp ? emp.empresa : ''),
      ciudad: base ? base.ciudad : (emp ? emp.ciudad : ''),
      fecha: base ? base.fecha : hoyISO(),
      conVigencia: base ? !!base.conVigencia : false,
      vigenciaA2: '', vigenciaB1: '', multas: 'No',
      observaciones: '', conclusiones: PLANTILLAS.concl[1],
      teoria: { tecnicas: 10, normatividad: 10, epp: 5, mecanica: 5 },
      practica: practicaVacia(1), todoOk: true,
      creado: new Date().toISOString(), actualizado: new Date().toISOString()
    };
  }
  function fichaDeServicio(s) {
    var ev = Aprobacion.normalizar(s.evaluacion || { modulos: {}, parametros: {} });
    var f = {
      uuid: s.uuid, base: s.uuid, formato: s.formato || 'CDA COMPLETO', folio: folioDe(s),
      nombre: s.nombre || '', cedula: s.cedula || '', contacto: s.contacto || '', categorias: s.categorias || '',
      empresa: s.empresa || '', ciudad: s.ciudad || '', fecha: aISO(s.fecha) || hoyISO(),
      // Los informes de antes no guardaban la casilla: se asume que llevaban vigencia
      conVigencia: s.evaluacion && s.evaluacion.conVigencia != null ? !!s.evaluacion.conVigencia : true,
      vigenciaA2: aISO(s.vigenciaA2), vigenciaB1: aISO(s.vigenciaB1), multas: s.multas || 'No',
      observaciones: s.observaciones || '', conclusiones: s.conclusiones || PLANTILLAS.concl[1],
      teoria: {}, practica: practicaVacia(0), todoOk: false
    };
    var teo = ev.modulos.teoria || {};
    TEORIA.forEach(function (t) { f.teoria[t.campo] = teo[t.campo] ? Number(teo[t.campo].nota) : 0; });
    VEHICULOS.forEach(function (v) {
      var mod = ev.modulos[v.id] || {};
      Object.keys(f.practica[v.id]).forEach(function (c) { f.practica[v.id][c] = mod[c] && Number(mod[c].nota) === 1 ? 1 : 0; });
    });
    f.todoOk = VEHICULOS.every(function (v) {
      return Object.keys(f.practica[v.id]).every(function (c) { return f.practica[v.id][c] === 1; });
    });
    return f;
  }
  /* Evaluación v2 desde la ficha. Si la ficha viene de un informe emitido se
   * parte de SU snapshot (no negociable #1: máximos y pesos de su momento). */
  function evaluacionDe(f) {
    var existente = f.base ? SERV.find(function (s) { return s.uuid === f.base; }) : null;
    var ev;
    if (existente && existente.evaluacion) {
      ev = Aprobacion.normalizar(JSON.parse(JSON.stringify(existente.evaluacion)));
      if (existente.evaluacion.folio) ev.folio = existente.evaluacion.folio;
    } else {
      var fm = (CAT.formatos || []).find(function (x) { return x.formato === 'CDA COMPLETO'; }) || CAT.formatos[0];
      ev = { modulos: {}, parametros: { umbral: Number(fm.umbral || 0.8), pesos: {}, eliminatorios: (fm.eliminatorios || []).slice() } };
      (fm.modulos || []).forEach(function (m) { ev.parametros.pesos[m.id] = Number(m.peso); ev.modulos[m.id] = {}; });
      (CAT.esquemas || []).forEach(function (e) {
        if (ev.modulos[e.modulo] && activo(e.activo)) {
          ev.modulos[e.modulo][e.campo] = { nota: 0, max: e.control === 'toggle' ? 1 : Number(e.max || 1) };
        }
      });
    }
    if (ev.modulos.teoria) TEORIA.forEach(function (t) {
      if (ev.modulos.teoria[t.campo]) ev.modulos.teoria[t.campo].nota = Number(f.teoria[t.campo]) || 0;
    });
    VEHICULOS.forEach(function (v) {
      if (!ev.modulos[v.id]) return;
      Object.keys(ev.modulos[v.id]).forEach(function (c) {
        ev.modulos[v.id][c] = { nota: f.practica[v.id] && f.practica[v.id][c] === 1 ? 1 : 0, max: 1 };
      });
    });
    ev.conVigencia = !!f.conVigencia;
    if (f.folio) ev.folio = f.folio;
    return ev;
  }
  function pendientes(f) {
    var n = 0;
    VEHICULOS.forEach(function (v) { Object.keys(f.practica[v.id] || {}).forEach(function (c) { if (f.practica[v.id][c] == null) n++; }); });
    return n;
  }
  function resultado(f) { return Aprobacion.calcularResultado(evaluacionDe(f)); }
  function pctMod(r, id) { var m = r.modulos.find(function (x) { return x.id === id; }); return m ? m.pct : 0; }

  // ------------------------------------------------------------------ rutas
  var ORDEN = { inicio: 0, persona: 1, evaluar: 2, cierre: 3, informe: 4 };
  function ir(ruta) {
    if (location.hash !== '#/' + ruta) location.hash = '#/' + ruta;
    else mostrar(ruta);
  }
  function mostrar(ruta) {
    if (!ORDEN.hasOwnProperty(ruta)) ruta = 'inicio';
    if (ruta !== 'inicio' && !F) ruta = 'inicio';
    var atras = ORDEN[ruta] < ORDEN[ultimaRuta];
    ultimaRuta = ruta;
    $$('.vista').forEach(function (v) {
      var on = v.dataset.vista === ruta;
      v.classList.toggle('activa', on);
      v.classList.toggle('volver', on && atras);
    });
    document.body.classList.toggle('con-fab', ruta === 'inicio');
    document.body.classList.toggle('con-ficha', !!F && ruta !== 'inicio');
    document.body.classList.toggle('ruta-informe', ruta === 'informe');
    cerrarFab();
    window.scrollTo(0, 0);
    if (ruta === 'inicio' || matchMedia('(min-width: 1100px)').matches) pintarInicio();
    if (ruta === 'persona') pintarPersona();
    if (ruta === 'evaluar') pintarEvaluar();
    if (ruta === 'cierre') pintarCierre();
    if (ruta === 'informe' || document.body.classList.contains('con-ficha')) pintarInforme();
  }
  window.addEventListener('hashchange', function () { mostrar(location.hash.replace(/^#\/?/, '') || 'inicio'); });

  function abrirFicha(f, ruta) {
    revocarFotos();
    F = f;
    ORIGINAL = f.base ? JSON.stringify(f) : null;
    $$('[data-guardado]').forEach(function (el) { el.textContent = f.base ? 'Editando N° ' + f.folio : ''; });
    cargarFotos().then(function () { ir(ruta || 'persona'); });
  }
  function cerrarFicha() { revocarFotos(); F = null; ORIGINAL = null; }

  // ------------------------------------------------------------------ inicio
  function filaServicio(s) {
    var f = folioDe(s);
    var ok = s.resultado === 'APROBADO';
    return '<button type="button" class="fila" data-abrir="' + esc(s.uuid) + '">' +
      '<span class="folio">' + (f || '—') + '</span>' +
      '<span class="nom"><b>' + esc(s.nombre || 'Sin nombre') + '</b><small>' + esc(s.empresa || '') + ' · ' + esc(fechaCorta(aISO(s.fecha))) + '</small></span>' +
      '<span class="est ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Aprobado' : 'Reprobado') + '</span></button>';
  }
  function pintarInicio() {
    $('#num-siguiente').textContent = 'N° ' + siguienteNumero();

    var borr = Object.keys(BORR).map(function (k) { return BORR[k]; })
      .sort(function (a, b) { return (b.actualizado || '').localeCompare(a.actualizado || ''); });
    $('#bloque-curso').hidden = !borr.length;
    $('#lista-curso').innerHTML = borr.map(function (b) {
      var falta = !b.nombre ? 'Faltan los datos' : (pendientes(b) ? 'Evaluando' : 'Listo para emitir');
      return '<div class="fila"><button type="button" class="nom" data-borrador="' + esc(b.uuid) + '" style="text-align:left">' +
        '<b>' + esc(b.nombre || 'Sin nombre') + '</b><small>' + esc(b.empresa || 'Sin empresa') + ' · ' + esc(falta) + '</small></button>' +
        '<span class="est amb">Borrador</span>' +
        '<button type="button" class="quitar" data-descartar="' + esc(b.uuid) + '" aria-label="Descartar borrador">' +
        '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }).join('');

    var hoy = hoyISO();
    var deHoy = SERV.filter(function (s) { return aISO(s.fecha) === hoy; });
    var grupos = {};
    deHoy.forEach(function (s) { (grupos[s.empresa || 'Sin empresa'] = grupos[s.empresa || 'Sin empresa'] || []).push(s); });
    var nombresG = Object.keys(grupos);
    $('#bloque-hoy').hidden = !nombresG.length;
    $('#lista-hoy').innerHTML = nombresG.map(function (g) {
      var lista = grupos[g].sort(function (a, b) { return (folioDe(a) || 0) - (folioDe(b) || 0); });
      return '<div class="bloque"><div class="grupo-cab"><span><span class="rotulo">Hoy</span><h3>' + esc(g) + '</h3></span>' +
        '<button type="button" class="enlace" data-enviar="' + esc(g) + '">Enviar</button></div>' +
        '<div class="lista">' + lista.map(filaServicio).join('') +
        '<button type="button" class="fila fila-mas" data-otra-empresa="' + esc(g) + '"><span class="folio">+</span><span class="nom"><b>Otra persona de ' + esc(g) + '</b></span></button>' +
        '</div></div>';
    }).join('');

    var recientes = SERV.filter(function (s) { return aISO(s.fecha) !== hoy; })
      .sort(function (a, b) { return (folioDe(b) || 0) - (folioDe(a) || 0); }).slice(0, 12);
    $('#bloque-recientes').hidden = !recientes.length;
    $('#lista-recientes').innerHTML = recientes.map(filaServicio).join('');
    $('#inicio-vacio').hidden = !!(borr.length || deHoy.length || recientes.length);
    pintarNube();
  }

  // ---------------------------------------------------------------- persona
  function pintarPersona() {
    $('#persona-titulo').textContent = F.base ? 'Informe N° ' + F.folio : 'Nueva evaluación';
    $('#f-nombre').value = F.nombre; $('#f-cedula').value = F.cedula; $('#f-contacto').value = F.contacto;
    $('#f-fecha').value = F.fecha; $('#f-vig-a2').value = F.vigenciaA2; $('#f-vig-b1').value = F.vigenciaB1;
    var sel = $('#f-empresa');
    var lista = empresas();
    if (F.empresa && !lista.some(function (e) { return e.empresa === F.empresa; })) lista = lista.concat([{ empresa: F.empresa, ciudad: F.ciudad }]);
    sel.innerHTML = '<option value="">Elegir…</option>' + lista.map(function (e) {
      return '<option value="' + esc(e.empresa) + '"' + (e.empresa === F.empresa ? ' selected' : '') + '>' + esc(e.empresa) + '</option>';
    }).join('');
    var cats = String(F.categorias || '').split(/[-,\s]+/).filter(Boolean);
    $('#f-categorias').innerHTML = CATEGORIAS.map(function (c) {
      return '<button type="button" data-cat="' + c + '" class="' + (cats.indexOf(c) > -1 ? 'on' : '') + '" aria-pressed="' + (cats.indexOf(c) > -1) + '">' + c + '</button>';
    }).join('');
    $$('#f-multas button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === F.multas); });
    $('#f-vigencia').setAttribute('aria-pressed', F.conVigencia ? 'true' : 'false');
    $('#f-vigencia-ayuda').textContent = F.conVigencia ? 'Encendido: vence un año después de la prueba' : 'Apagado: el informe dice "Ingreso"';
    resumenMas();
    $('#persona-aviso').hidden = true;
    pintarFotoPerfil();
  }
  function resumenMas() {
    var p = [];
    if (F.vigenciaA2) p.push('A2 ' + ddmmaaaa(F.vigenciaA2));
    if (F.vigenciaB1) p.push('B1 ' + ddmmaaaa(F.vigenciaB1));
    p.push('Multas: ' + (F.multas === 'Acuerdo de pago' ? 'acuerdo' : F.multas.toLowerCase()));
    p.push(F.conVigencia ? 'con vigencia' : 'ingreso');
    $('#resumen-mas').textContent = p.join(' · ');
  }
  function validarDatos() {
    var faltan = [];
    if (!F.nombre.trim()) faltan.push('nombre');
    if (!/^\d+$/.test(F.cedula.trim())) faltan.push('cédula (solo números)');
    if (!F.empresa) faltan.push('empresa');
    if (!F.categorias) faltan.push('categorías');
    return faltan;
  }

  // ---------------------------------------------------------------- evaluar
  function pintarEvaluar() {
    $('#eval-nombre').textContent = F.nombre || 'Sin nombre';
    $('#teoria-filas').innerHTML = TEORIA.map(function (t) {
      var v = F.teoria[t.campo];
      return '<div class="paso-fila"><span class="etq">' + t.etq + ' <small>/' + t.max + '</small></span>' +
        '<span class="paso"><button type="button" data-teo="' + t.campo + '" data-d="-1" aria-label="Restar"' + (v <= 0 ? ' disabled' : '') + '>−</button>' +
        '<output class="' + (v / t.max < 0.7 ? 'bajo' : '') + '">' + v + '</output>' +
        '<button type="button" data-teo="' + t.campo + '" data-d="1" aria-label="Sumar"' + (v >= t.max ? ' disabled' : '') + '>+</button></span></div>';
    }).join('');
    var suma = TEORIA.reduce(function (a, t) { return a + (Number(F.teoria[t.campo]) || 0); }, 0);
    $('#teoria-resumen').innerHTML = '<b>' + suma + '</b> de 30 · ' + Math.round(suma / 30 * 100) + '%';

    $('#todo-ok').setAttribute('aria-pressed', F.todoOk ? 'true' : 'false');
    $('#practica').innerHTML = VEHICULOS.map(function (v) {
      var ms = maniobras(v.id), si = 0, no = 0, pend = 0;
      var items = ms.map(function (m) {
        var e = F.practica[v.id][m.campo];
        if (e === 1) si++; else if (e === 0) no++; else pend++;
        var cls = e === 1 ? 'si' : e === 0 ? 'no' : 'pend';
        var txt = e === 1 ? 'Cumple' : e === 0 ? 'No cumple' : 'Marcar';
        return '<button type="button" class="item ' + cls + '" data-man="' + v.id + ':' + m.campo + '"><span class="t">' + esc(m.etiqueta) + '</span><span class="e">' + txt + '</span></button>';
      }).join('');
      var cuenta = pend ? pend + ' sin marcar' : (no ? si + '/' + ms.length + ' · ' + no + ' no cumple' : si + '/' + ms.length);
      var clsC = pend ? 'amb' : (no ? 'no' : '');
      return '<div class="veh' + (abiertoVeh === v.id ? ' abierto' : '') + '" data-veh="' + v.id + '">' +
        '<button type="button" class="veh-cab" data-abrir-veh="' + v.id + '"><b>' + v.etq + '</b><span class="cuenta ' + clsC + '">' + cuenta + '</span>' +
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>' +
        '<div class="veh-cuerpo"><div>' + items + '</div></div></div>';
    }).join('');
    pintarResultadoVivo();
  }
  function pintarResultadoVivo() {
    var el = $('#res-vivo'), det = $('#res-vivo-det');
    var p = pendientes(F);
    if (p) { el.textContent = 'Faltan ' + p; el.className = 'amb-t'; det.textContent = 'maniobras sin marcar'; return; }
    var r = resultado(F);
    var ok = r.resultado === 'APROBADO';
    el.textContent = (ok ? 'APROBADO ' : 'REPROBADO ') + Math.round(r.total * 100) + '%';
    el.className = ok ? 'ok-t' : 'no-t';
    var bajos = r.modulos.filter(function (m) { return !m.aprobado; }).map(function (m) {
      var v = VEHICULOS.find(function (x) { return x.id === m.id; });
      return (v ? v.etq : 'Teoría') + ' ' + Math.round(m.pct * 100) + '%';
    });
    det.textContent = bajos.length ? 'Por debajo del 80%: ' + bajos.join(', ') : 'Cumple todos los mínimos';
  }

  // ----------------------------------------------------------------- cierre
  function pintarCierre() {
    $('#cierre-nombre').textContent = F.nombre || '';
    if (!F.observaciones) { F.observaciones = PLANTILLAS.obs[1]; guardarBorrador(); }
    $('#f-observaciones').value = F.observaciones;
    $('#f-conclusiones').value = F.conclusiones;
    marcarPlantillas();
    var p = pendientes(F);
    var el = $('#cierre-res');
    if (p) { el.textContent = 'Faltan ' + p + ' maniobras'; el.className = 'grande amb-t'; $('#cierre-det').textContent = 'Vuelve a Práctica para marcarlas'; }
    else {
      var r = resultado(F), ok = r.resultado === 'APROBADO';
      el.textContent = (ok ? 'Aprobado ' : 'Reprobado ') + Math.round(r.total * 100) + '%';
      el.className = 'grande ' + (ok ? 'ok-t' : 'no-t');
      var suma = TEORIA.reduce(function (a, t) { return a + (Number(F.teoria[t.campo]) || 0); }, 0);
      $('#cierre-det').textContent = 'CDA · teoría ' + suma + '/30 · ' + VEHICULOS.map(function (v) { return v.etq + ' ' + Math.round(pctMod(r, v.id) * 100) + '%'; }).join(' · ');
    }
    $('#emitir').textContent = F.base ? 'Guardar cambios del N° ' + F.folio : 'Emitir informe N° ' + siguienteNumero();
    $('#emitir-ayuda').textContent = F.base ? 'El número no cambia.' : 'El número se asigna al emitir. Hasta entonces es un borrador.';
    $('#cierre-aviso').hidden = true;
    pintarEvidencias();
  }
  function marcarPlantillas() {
    $$('[data-plantilla]').forEach(function (b) {
      var campo = b.dataset.plantilla === 'obs' ? F.observaciones : F.conclusiones;
      b.classList.toggle('on', campo === PLANTILLAS[b.dataset.plantilla][b.dataset.n]);
    });
    var c = F.conclusiones === PLANTILLAS.concl[1] ? 'Estándar NTC-ISO/IEC 17020' : F.conclusiones === PLANTILLAS.concl[2] ? 'Falta teoría' : 'Personalizada';
    $('#resumen-concl').textContent = c;
  }

  // ------------------------------------------------------------------ fotos
  var FOTO = {}; // 'perfil' | 'ev1'..'ev4' -> objectURL o url remota
  function revocarFotos() {
    Object.keys(FOTO).forEach(function (k) { if (FOTO[k] && FOTO[k].indexOf('blob:') === 0) URL.revokeObjectURL(FOTO[k]); });
    FOTO = {};
  }
  function cargarFotos() {
    if (!F) return Promise.resolve();
    return DB.fotosDe(F.uuid).then(function (fotos) {
      fotos.forEach(function (f) {
        var p = f.clave.split(':');
        FOTO[p[1] === 'perfil' ? 'perfil' : 'ev' + p[2]] = URL.createObjectURL(f.blob);
      });
      var s = F.base ? SERV.find(function (x) { return x.uuid === F.base; }) : null;
      if (s && navigator.onLine && API.configurada()) {
        var falta = (s.fotoPerfilUrl && !FOTO.perfil) || (s.evidenciasUrls || []).some(function (u, i) { return u && !FOTO['ev' + (i + 1)]; });
        if (falta) Sync.bajarFotosDe(s).then(function (n) { if (n && F && F.uuid === s.uuid) cargarFotos().then(refrescarFotos); }).catch(function () {});
      }
    });
  }
  function refrescarFotos() { pintarFotoPerfil(); if ($('#v-cierre').classList.contains('activa')) pintarEvidencias(); pintarInforme(); }
  function pintarFotoPerfil() {
    var img = $('#foto-perfil-img');
    if (FOTO.perfil) { img.src = FOTO.perfil; img.hidden = false; $('#foto-perfil-vacia').hidden = true; $('#foto-perfil').classList.add('tiene'); }
    else { img.hidden = true; img.removeAttribute('src'); $('#foto-perfil-vacia').hidden = false; $('#foto-perfil').classList.remove('tiene'); }
  }
  function pintarEvidencias() {
    $('#evidencias').innerHTML = [1, 2, 3, 4].map(function (n) {
      var u = FOTO['ev' + n];
      return '<button type="button" class="ev' + (u ? ' tiene' : '') + '" data-foto="ev' + n + '" aria-label="Evidencia ' + n + '">' +
        (u ? '<img src="' + esc(u) + '" alt="">' : '+') + '</button>';
    }).join('');
  }
  var fotoDestino = null;
  function pedirFoto(destino) {
    fotoDestino = destino;
    var inp = $('#archivo-foto');
    inp.value = '';
    inp.click();
  }
  /* Recorte centrado, mismas medidas que la app clásica: perfil 600×600 y
   * evidencias 600×1000 (3:5). JPEG para cuidar la cuota de Drive. */
  function recortar(archivo, destino) {
    var perfil = destino === 'perfil';
    var W = 600, H = perfil ? 600 : 1000;
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(archivo), img = new Image();
      img.onload = function () {
        var escala = Math.max(W / img.width, H / img.height);
        var w = W / escala, h = H / escala;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, W, H);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('No se pudo procesar la foto')); }, 'image/jpeg', perfil ? 0.9 : 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto')); };
      img.src = url;
    });
  }
  $('#archivo-foto').addEventListener('change', function () {
    var a = this.files && this.files[0];
    if (!a || !F || !fotoDestino) return;
    var destino = fotoDestino;
    recortar(a, destino).then(function (blob) {
      var clave = F.uuid + (destino === 'perfil' ? ':perfil:1' : ':evidencia:' + destino.slice(2));
      return DB.guardarFoto(clave, blob).then(function () {
        if (FOTO[destino] && FOTO[destino].indexOf('blob:') === 0) URL.revokeObjectURL(FOTO[destino]);
        FOTO[destino] = URL.createObjectURL(blob);
        if (F.base) F.sucio = true; else guardarBorrador();
        refrescarFotos();
        // Tras la foto de perfil, el siguiente paso natural es escribir el nombre
        if (destino === 'perfil' && !F.nombre) setTimeout(function () { $('#f-nombre').focus(); }, 150);
      });
    }).catch(function (e) { toast(e.message); });
  });

  // ----------------------------------------------------------------- emitir
  function emitir() {
    var faltan = validarDatos();
    if (faltan.length) {
      $('#cierre-aviso').textContent = 'Falta: ' + faltan.join(', ') + '. Te llevo a los datos.';
      $('#cierre-aviso').hidden = false;
      setTimeout(function () { ir('persona'); var a = $('#persona-aviso'); a.textContent = 'Falta: ' + faltan.join(', '); a.hidden = false; }, 900);
      return;
    }
    if (pendientes(F)) { toast('Faltan maniobras por marcar'); ir('evaluar'); return; }
    var btn = $('#emitir'); btn.disabled = true;
    var paso = F.base ? Promise.resolve(F.folio) : tomarFolio();
    paso.then(function (folio) {
      F.folio = folio;
      var ev = evaluacionDe(F);
      ev.folio = folio;
      var r = Aprobacion.calcularResultado(ev);
      var existente = F.base ? SERV.find(function (s) { return s.uuid === F.base; }) : null;
      var s = Object.assign({}, existente || {}, {
        uuid: F.uuid, formato: 'CDA COMPLETO',
        nombre: F.nombre.trim(), cedula: F.cedula.trim(), empresa: F.empresa, ciudad: F.ciudad,
        categorias: F.categorias, contacto: F.contacto.trim(), fecha: F.fecha,
        vigenciaA2: F.vigenciaA2, vigenciaB1: F.vigenciaB1, multas: F.multas,
        observaciones: F.observaciones.trim(), conclusiones: F.conclusiones.trim(),
        evidenciasUrls: (existente && existente.evidenciasUrls) || [],
        evaluacion: ev, resultado: r.resultado, resultadoDetalle: r.detalle,
        updatedAt: new Date().toISOString(), estado: 'pendiente'
      });
      return DB.guardarServicio(s).then(function () { return F.base ? null : quitarBorrador(F.uuid); }).then(function () {
        var era = !!F.base;
        localStorage.setItem('ultimaEmpresa', F.empresa);
        return recargar().then(function () {
          F = fichaDeServicio(s); ORIGINAL = JSON.stringify(F);
          btn.disabled = false;
          toast(era ? 'Cambios guardados en el N° ' + folio : 'Informe N° ' + folio + ' emitido');
          Sync.sincronizar();
          ir('informe');
        });
      });
    }).catch(function (e) { btn.disabled = false; toast('No se pudo guardar: ' + e.message); });
  }

  // ---------------------------------------------------------------- informe
  /* Port de updatePreviewData() + renderPreviewManeuverCard() de la app
   * clásica. Mismo texto, mismas clases de estado, mismos cálculos. */
  function pintarInforme() {
    if (!F) return;
    var set = function (id, t) { var el = document.getElementById(id); if (el) el.textContent = t; };
    var folio = F.folio || siguienteNumero();
    set('prev-id', folio); set('prev-id-2', folio);
    set('prev-name', F.nombre || 'NOMBRE COMPLETO');
    set('prev-cedula', F.cedula ? 'C.C. ' + F.cedula : 'C.C. (CÉDULA)');
    set('prev-empresa', F.empresa || 'EMPRESA');
    set('prev-contacto', F.contacto || 'CONTACTO');
    set('prev-ciudad', F.ciudad || 'CIUDAD');
    set('prev-categorias', F.categorias || 'CATEGORÍAS');
    if (F.fecha) {
      var fl = fechaLarga(F.fecha);
      set('prev-date-top', fl); set('prev-date-top-2', fl);
      if (F.conVigencia) {
        var d = fechaLocal(F.fecha), v = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
        set('prev-vigencia', v.getDate() + '/' + String(v.getMonth() + 1).padStart(2, '0') + '/' + v.getFullYear());
      } else set('prev-vigencia', 'Ingreso');
    }
    set('prev-lic-moto', F.vigenciaA2 ? ddmmaaaa(F.vigenciaA2) : '—');
    set('prev-lic-carro', F.vigenciaB1 ? ddmmaaaa(F.vigenciaB1) : '—');
    var mp = document.getElementById('prev-multas-val');
    mp.textContent = F.multas;
    mp.className = F.multas === 'No' ? 'bg-blue-100' : F.multas === 'Sí' ? 'bg-red-100' : 'bg-amber-100';
    set('prev-observaciones-text', F.observaciones || PLANTILLAS.obs[1]);
    set('prev-conclusiones-text', F.conclusiones || PLANTILLAS.concl[1]);

    var t = F.teoria;
    TEORIA.forEach(function (x, i) {
      var n = i + 1, val = Number(t[x.campo]) || 0;
      set('prev-val-' + n, val);
      var bar = document.getElementById('prev-bar-' + n);
      bar.style.width = (val / x.max * 100) + '%';
      var s10 = val / x.max * 10;
      bar.className = s10 < 7 ? 'h-full bg-red-500' : s10 < 8.5 ? 'h-full bg-amber-500' : 'h-full bg-green-500';
    });
    var suma = TEORIA.reduce(function (a, x) { return a + (Number(t[x.campo]) || 0); }, 0);
    var ratio = suma / 30;
    set('prev-correctas', suma);
    set('prev-avg-score', Math.round(ratio * 100) + '%');
    var rt = document.getElementById('prev-res-teoria');
    rt.className = ratio >= 0.8 ? 'bg-green-100' : 'bg-red-100';
    rt.textContent = ratio >= 0.8 ? 'APROBADO' : 'REPROBADO';

    var r = resultado(F);
    [['carro', 'prev-man-list-carro', 'prev-res-carro'], ['motocarro', 'prev-man-list-motocarro', 'prev-res-motocarro'],
     ['cuatrimoto', 'prev-man-list-cuatrimoto', 'prev-res-cuatrimoto'], ['moto', 'prev-man-list-moto', 'prev-res-moto']].forEach(function (c) {
      var ul = document.getElementById(c[1]);
      ul.innerHTML = maniobras(c[0]).map(function (m) {
        var ok = F.practica[c[0]][m.campo] === 1;
        return '<li class="flex justify-between items-center"><span>' + esc(corto(c[0], m.campo)) + '</span>' +
          '<span class="' + (ok ? 'text-green-600 font-bold' : 'text-red-500 font-bold') + '">' + (ok ? '✅' : '❌') + '</span></li>';
      }).join('');
      var aprueba = pctMod(r, c[0]) >= 0.8 - 1e-9;
      var st = document.getElementById(c[2]);
      st.textContent = aprueba ? 'APROBADO' : 'REPROBADO';
      st.className = aprueba ? 'text-green-600' : 'text-red-600';
    });
    var g = document.getElementById('prev-res-general');
    var okG = r.resultado === 'APROBADO';
    g.className = okG ? 'bg-green-600' : 'bg-red-600';
    g.textContent = okG ? 'APROBADO' : 'REPROBADO';
    set('prev-pct-teoria', Math.round(r.total * 100) + '%');

    // fotos
    var pf = document.getElementById('prev-profile-photo'), pph = document.getElementById('prev-profile-photo-ph');
    if (FOTO.perfil) { pf.src = FOTO.perfil; pf.classList.remove('hidden'); pph.classList.add('hidden'); }
    else { pf.classList.add('hidden'); pph.classList.remove('hidden'); }
    [1, 2, 3, 4].forEach(function (n) {
      var im = document.getElementById('prev-img-ev' + n), ph = document.getElementById('prev-img-ev' + n + '-ph');
      if (FOTO['ev' + n]) { im.src = FOTO['ev' + n]; im.classList.remove('hidden'); ph.classList.add('hidden'); }
      else { im.classList.add('hidden'); ph.classList.remove('hidden'); }
    });

    // cabecera de la vista
    $('#informe-titulo').textContent = F.base ? 'Informe N° ' + F.folio : 'Vista previa';
    $('#informe-editar').hidden = !F.base;
    $('#informe-acciones').hidden = !F.base;
    $('#btn-otra').textContent = 'Otra persona';
    $('#btn-otra').setAttribute('aria-label', 'Otra persona de ' + (F.empresa || 'la misma empresa'));
    $('#informe-estado').innerHTML = F.base
      ? '<strong class="' + (okG ? 'ok-t' : 'no-t') + '">' + (okG ? 'Aprobado ' : 'Reprobado ') + Math.round(r.total * 100) + '%</strong><span class="sub">' + esc(F.nombre) + ' · ' + esc(F.empresa) + '</span>'
      : '<span class="sub">Así va quedando. Se emite desde Cierre.</span>';
    escalarHojas();
  }
  function escalarHojas() {
    var cont = $('#hojas');
    var ancho = cont.clientWidth;
    if (!ancho) return;
    var s = Math.min(1, ancho / 800);
    $$('.hoja-marco', cont).forEach(function (m) {
      var p = m.querySelector('.preview-page');
      p.style.transform = 'scale(' + s + ')';
      m.style.width = (800 * s) + 'px';
      m.style.height = (p.offsetHeight * s) + 'px';
    });
  }
  if (window.ResizeObserver) new ResizeObserver(function () { escalarHojas(); }).observe($('#hojas'));
  window.addEventListener('beforeprint', function () {
    $$('.hoja-marco .preview-page').forEach(function (p) { p.style.transform = 'none'; });
  });
  window.addEventListener('afterprint', escalarHojas);

  function imprimir() {
    var t = document.title;
    document.title = 'Informe ' + F.folio + ' - ' + F.nombre;
    window.print();
    setTimeout(function () { document.title = t; }, 1000);
  }
  function textoInforme(f) {
    var r = resultado(f);
    return 'Informe N° ' + f.folio + ' · ' + f.nombre + ' (C.C. ' + f.cedula + ')\n' +
      f.empresa + ' · ' + fechaLarga(f.fecha) + '\nResultado: ' + r.resultado + ' (' + Math.round(r.total * 100) + '%)';
  }
  function compartirTexto(texto) {
    if (navigator.share) return navigator.share({ text: texto }).catch(function () {});
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
  }

  // --------------------------------------------------- enviar tanda (correo)
  function abrirEnvio(empresa) {
    var hoy = hoyISO();
    var lista = SERV.filter(function (s) { return (s.empresa || 'Sin empresa') === empresa && aISO(s.fecha) === hoy; })
      .sort(function (a, b) { return (folioDe(a) || 0) - (folioDe(b) || 0); });
    var ap = lista.filter(function (s) { return s.resultado === 'APROBADO'; }).length;
    var ciudad = (lista[0] && lista[0].ciudad) || '';
    var fechaTxt = fechaLocal(hoy).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    var nums = lista.map(function (s) { return folioDe(s); });
    var asunto = 'Informes de evaluación práctica · ' + empresa + ' · ' + fechaTxt;
    var cuerpo = 'Buenas tardes, equipo de ' + empresa + ':\n\n' +
      'Adjuntamos ' + (lista.length === 1 ? 'el informe' : 'los informes') + ' de evaluación del conocimiento y habilidad para maniobra de vehículos realizad' + (lista.length === 1 ? 'o' : 'os') +
      ' el ' + fechaTxt + (ciudad ? ' en ' + ciudad : '') + ':\n\n' +
      lista.map(function (s) {
        return 'N° ' + folioDe(s) + ' · ' + s.nombre + ' · C.C. ' + s.cedula + ' · ' + (s.resultado === 'APROBADO' ? 'Aprobado' : 'No aprobado');
      }).join('\n') +
      '\n\nResultado: ' + ap + ' de ' + lista.length + (lista.length === 1 ? ' aprobado' : ' aprobados') + '. Quedamos atentos a cualquier inquietud.\n\n' +
      'Cordialmente,\nMario Alexander Córdoba Cruz\nInstructor de conducción técnico en seguridad vial';
    var wa = empresa + ' · ' + fechaTxt + '\n' + lista.map(function (s) {
      return 'N° ' + folioDe(s) + ' ' + s.nombre + ' — ' + (s.resultado === 'APROBADO' ? 'Aprobado' : 'No aprobado');
    }).join('\n');
    abrirHoja(
      '<h2>Enviar · ' + esc(empresa) + '</h2><p class="sub">' + lista.length + ' informe' + (lista.length === 1 ? '' : 's') + ' de hoy · N° ' + esc(nums.join(', ')) + '</p>' +
      '<div class="vista-correo"><b>' + esc(asunto) + '</b>\n\n' + esc(cuerpo) + '</div>' +
      '<p class="sub">Los PDF se adjuntan desde cada informe (botón PDF → Guardar como PDF).</p>' +
      '<div class="acciones"><button type="button" class="btn-tinta" id="env-correo">Abrir en el correo</button>' +
      '<button type="button" class="btn-borde" id="env-wa">WhatsApp</button></div>'
    );
    $('#env-correo').onclick = function () { location.href = 'mailto:?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo); };
    $('#env-wa').onclick = function () { compartirTexto(wa); };
  }

  // -------------------------------------------------------- búsqueda
  function abrirBusqueda() {
    cerrarFab();
    $('#busqueda').hidden = false;
    $('#buscar-input').value = '';
    buscar('');
    setTimeout(function () { $('#buscar-input').focus(); }, 60);
  }
  function buscar(q) {
    var n = normal(q).trim();
    var lista = SERV.slice().sort(function (a, b) { return (folioDe(b) || 0) - (folioDe(a) || 0); });
    if (n) lista = lista.filter(function (s) {
      return normal(s.nombre).indexOf(n) > -1 || String(s.cedula || '').indexOf(n) > -1 ||
        String(folioDe(s) || '') === n || normal(s.empresa).indexOf(n) > -1;
    });
    $('#buscar-resultados').innerHTML = lista.length
      ? lista.slice(0, 80).map(filaServicio).join('')
      : '<p class="sub" style="padding:20px 0">Nada con "' + esc(q) + '".</p>';
  }

  // ---------------------------------------------------------- hoja inferior
  function abrirHoja(html) {
    cerrarFab();
    $('#hoja-cuerpo').innerHTML = html;
    $('#hoja').hidden = false; $('#hoja-velo').hidden = false;
  }
  function cerrarHoja() { $('#hoja').hidden = true; $('#hoja-velo').hidden = true; }
  $('#hoja-velo').addEventListener('click', cerrarHoja);

  function abrirAjustes() {
    var url = localStorage.getItem('apiUrl') || '', tok = localStorage.getItem('apiToken') || '';
    abrirHoja('<h2>Nube y ajustes</h2><p class="sub">Los mismos datos de la app clásica. La conexión ya configurada allá sirve aquí.</p>' +
      '<label class="campo"><span>URL de la Web App</span><input id="aj-url" type="url" value="' + esc(url) + '" autocomplete="off"></label>' +
      '<label class="campo"><span>Token</span><input id="aj-tok" type="password" value="' + esc(tok) + '" autocomplete="off"></label>' +
      '<p class="sub" id="aj-msg"></p>' +
      '<div class="acciones"><button type="button" class="btn-tinta" id="aj-guardar">Guardar y sincronizar</button>' +
      '<button type="button" class="btn-borde" id="aj-rehacer">Traer todo de nuevo desde la nube</button>' +
      '<button type="button" class="btn-borde" id="aj-respaldo">Descargar respaldo .json</button>' +
      '<a class="btn-borde" href="../clasica.html" style="text-decoration:none">App clásica (respaldo)</a></div>');
    $('#aj-guardar').onclick = function () {
      API.guardarConfig($('#aj-url').value, $('#aj-tok').value);
      $('#aj-msg').textContent = 'Probando…';
      API.bootstrap().then(function () { $('#aj-msg').textContent = 'Conexión correcta.'; Sync.sincronizar(); })
        .catch(function (e) { $('#aj-msg').textContent = 'No conecta: ' + e.message; });
    };
    $('#aj-rehacer').onclick = function () {
      $('#aj-msg').textContent = 'Trayendo todo…';
      Sync.resincronizarTodo().then(function () { $('#aj-msg').textContent = 'Listo.'; });
    };
    $('#aj-respaldo').onclick = function () {
      Promise.all([DB.listarServicios(), DB.getMeta('borradoresNueva')]).then(function (r) {
        var blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), servicios: r[0], borradores: r[1] || {} }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'respaldo-informes-' + hoyISO() + '.json'; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      });
    };
  }

  // ------------------------------------------------------------------ nube
  function pintarNube() {
    var b = $('#estado-nube'), t = b.querySelector('.txt');
    if (!API.configurada()) { b.className = 'estado-nube'; t.textContent = 'Solo en el teléfono'; return; }
    if (!navigator.onLine) { b.className = 'estado-nube'; t.textContent = 'Sin señal'; return; }
    DB.pendientes().then(function (p) {
      b.className = 'estado-nube ' + (p.length ? 'pend' : 'ok');
      t.textContent = p.length ? p.length + ' por subir' : 'Al día';
    });
  }
  window.addEventListener('sync:inicio', function () { $('#estado-nube').classList.add('girando'); $('#estado-nube .txt').textContent = 'Sincronizando'; });
  window.addEventListener('sync:fin', function () {
    $('#estado-nube').classList.remove('girando');
    Promise.all([recargar(), cargarCatalogos()]).then(function () {
      if (ultimaRuta === 'inicio') pintarInicio(); else pintarNube();
    });
  });
  window.addEventListener('online', pintarNube);
  window.addEventListener('offline', pintarNube);

  // ------------------------------------------------------------------ tema
  function aplicarTema(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('tema-nueva', t); } catch (e) {}
    $('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#0D0E10' : '#F6F5F1');
    $('#fab-tema-lbl').textContent = t === 'dark' ? 'Tema día' : 'Tema noche';
  }
  /* Barrido circular desde el botón (skill tema-oscuro-barrido). */
  function cambiarTema(boton) {
    var nuevo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    var aplicar = function () { aplicarTema(nuevo); };
    if (!document.startViewTransition || !boton || matchMedia('(prefers-reduced-motion: reduce)').matches) return aplicar();
    var r = boton.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(aplicar).ready.then(function () {
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radio + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () {});
  }

  // -------------------------------------------------------------- menú +
  function cerrarFab() {
    $('#fab').classList.remove('abierto'); $('#fab-velo').classList.remove('on');
    $('#fab-main').setAttribute('aria-expanded', 'false');
  }
  $('#fab-main').addEventListener('click', function () {
    var abrir = !$('#fab').classList.contains('abierto');
    $('#fab').classList.toggle('abierto', abrir); $('#fab-velo').classList.toggle('on', abrir);
    this.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (navigator.vibrate) navigator.vibrate(8);
  });
  $('#fab-velo').addEventListener('click', cerrarFab);
  $$('.fab-item').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.accion;
      if (a === 'tema') { cambiarTema(b.querySelector('.ico')); setTimeout(cerrarFab, 420); return; }
      cerrarFab();
      if (a === 'nueva') nuevaEvaluacion();
      if (a === 'buscar') abrirBusqueda();
      if (a === 'ajustes') abrirAjustes();
    });
  });

  function nuevaEvaluacion(base) {
    if (F && F.base && F.sucio && !confirm('Hay cambios sin guardar en el N° ' + F.folio + '. ¿Descartarlos?')) return;
    var f = fichaNueva(base);
    BORR[f.uuid] = f;
    abrirFicha(f, 'persona');
    guardarBorrador();
    // Lo primero en pista es la foto: se abre la cámara directo
    setTimeout(function () { pedirFoto('perfil'); }, 380);
  }

  // ------------------------------------------------------------- eventos
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    var d = t.dataset;
    if (d.ir) { if (d.ir === 'inicio') salirAlInicio(); else ir(d.ir); return; }
    if (d.abrir) {
      $('#busqueda').hidden = true;
      var s = SERV.find(function (x) { return x.uuid === d.abrir; });
      if (s) abrirFicha(fichaDeServicio(s), 'informe');
      return;
    }
    if (d.borrador) { abrirFicha(BORR[d.borrador], BORR[d.borrador].nombre ? 'evaluar' : 'persona'); return; }
    if (d.descartar) {
      if (confirm('¿Descartar el borrador de ' + (BORR[d.descartar].nombre || 'esta persona') + '? No tiene número, no se pierde ningún consecutivo.')) {
        var u = d.descartar;
        DB.fotosDe(u).then(function (fs) { return Promise.all(fs.map(function (f) { return DB.borrarFoto(f.clave); })); })
          .then(function () { return quitarBorrador(u); }).then(pintarInicio);
      }
      return;
    }
    if (d.enviar) { abrirEnvio(d.enviar); return; }
    if (d.otraEmpresa) {
      var muestra = SERV.find(function (x) { return x.empresa === d.otraEmpresa && aISO(x.fecha) === hoyISO(); });
      nuevaEvaluacion(muestra ? { empresa: muestra.empresa, ciudad: muestra.ciudad, fecha: hoyISO(), conVigencia: muestra.evaluacion && muestra.evaluacion.conVigencia } : null);
      return;
    }
    if (d.cat && F) {
      var cats = String(F.categorias || '').split(/[-,\s]+/).filter(Boolean);
      var i = cats.indexOf(d.cat);
      if (i > -1) cats.splice(i, 1); else cats.push(d.cat);
      F.categorias = CATEGORIAS.filter(function (c) { return cats.indexOf(c) > -1; }).join('-');
      t.classList.toggle('on', i === -1); t.setAttribute('aria-pressed', i === -1);
      guardarBorrador(); return;
    }
    if (d.teo && F) {
      var x = TEORIA.find(function (q) { return q.campo === d.teo; });
      F.teoria[d.teo] = Math.max(0, Math.min(x.max, (Number(F.teoria[d.teo]) || 0) + Number(d.d)));
      guardarBorrador(); pintarEvaluar(); return;
    }
    if (d.abrirVeh) { abiertoVeh = abiertoVeh === d.abrirVeh ? null : d.abrirVeh; $$('.veh').forEach(function (v) { v.classList.toggle('abierto', v.dataset.veh === abiertoVeh); }); return; }
    if (d.man && F) {
      var p = d.man.split(':'), cur = F.practica[p[0]][p[1]];
      F.practica[p[0]][p[1]] = cur === 1 ? 0 : 1;
      if (F.practica[p[0]][p[1]] === 0 && navigator.vibrate) navigator.vibrate(12);
      guardarBorrador(); pintarEvaluar(); return;
    }
    if (d.foto && F) { pedirFoto(d.foto); return; }
    if (d.plantilla && F) {
      var txt = PLANTILLAS[d.plantilla][d.n];
      if (d.plantilla === 'obs') { F.observaciones = txt; $('#f-observaciones').value = txt; }
      else { F.conclusiones = txt; $('#f-conclusiones').value = txt; }
      marcarPlantillas(); guardarBorrador(); return;
    }
  });

  function salirAlInicio() {
    if (F && F.base && F.sucio && JSON.stringify(Object.assign({}, F, { sucio: undefined })) !== ORIGINAL) {
      if (!confirm('Hay cambios sin guardar en el N° ' + F.folio + '. ¿Salir sin guardarlos?')) return;
    }
    cerrarFicha();
    ir('inicio');
  }

  $('#foto-perfil').addEventListener('click', function () { pedirFoto('perfil'); });
  [['#f-nombre', 'nombre'], ['#f-cedula', 'cedula'], ['#f-contacto', 'contacto']].forEach(function (p) {
    $(p[0]).addEventListener('input', function () {
      if (p[1] === 'cedula') this.value = this.value.replace(/\D/g, '');
      F[p[1]] = this.value; guardarBorrador();
    });
  });
  $('#f-empresa').addEventListener('change', function () {
    F.empresa = this.value;
    var e = empresas().find(function (x) { return x.empresa === F.empresa; });
    F.ciudad = e ? e.ciudad : '';
    guardarBorrador();
  });
  [['#f-fecha', 'fecha'], ['#f-vig-a2', 'vigenciaA2'], ['#f-vig-b1', 'vigenciaB1']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { F[p[1]] = this.value; resumenMas(); guardarBorrador(); });
  });
  $$('#f-multas button').forEach(function (b) {
    b.addEventListener('click', function () {
      F.multas = b.dataset.v; $$('#f-multas button').forEach(function (x) { x.classList.toggle('on', x === b); });
      resumenMas(); guardarBorrador();
    });
  });
  $('#f-vigencia').addEventListener('click', function () {
    F.conVigencia = !F.conVigencia; pintarPersona(); guardarBorrador();
  });
  $$('#f-formato button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.classList.contains('pronto')) toast(b.firstChild.textContent.trim() + ': próximamente. Por ahora, CDA.');
    });
  });
  $('#ir-evaluar').addEventListener('click', function () {
    var faltan = validarDatos();
    if (faltan.length && !confirm('Falta: ' + faltan.join(', ') + '.\n¿Evaluar de todas formas? (Lo completas antes de emitir.)')) return;
    ir('evaluar');
  });
  $('#todo-ok').addEventListener('click', function () {
    F.todoOk = !F.todoOk;
    VEHICULOS.forEach(function (v) { Object.keys(F.practica[v.id]).forEach(function (c) { F.practica[v.id][c] = F.todoOk ? 1 : null; }); });
    guardarBorrador(); pintarEvaluar();
  });
  $('#ir-cierre').addEventListener('click', function () { ir('cierre'); });
  $('#f-observaciones').addEventListener('input', function () { F.observaciones = this.value; marcarPlantillas(); guardarBorrador(); });
  $('#f-conclusiones').addEventListener('input', function () { F.conclusiones = this.value; marcarPlantillas(); guardarBorrador(); });
  $('#emitir').addEventListener('click', emitir);
  $('#informe-editar').addEventListener('click', function () { ir('persona'); });
  $('#btn-pdf').addEventListener('click', imprimir);
  $('#btn-whatsapp').addEventListener('click', function () { compartirTexto(textoInforme(F)); });
  $('#btn-otra').addEventListener('click', function () {
    var base = { empresa: F.empresa, ciudad: F.ciudad, fecha: hoyISO(), conVigencia: F.conVigencia };
    cerrarFicha(); nuevaEvaluacion(base);
  });
  $('#abrir-busqueda').addEventListener('click', abrirBusqueda);
  $('#cerrar-busqueda').addEventListener('click', function () { $('#busqueda').hidden = true; });
  $('#buscar-input').addEventListener('input', function () { buscar(this.value); });
  $('#estado-nube').addEventListener('click', function () {
    if (!API.configurada()) abrirAjustes(); else { Sync.sincronizar(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBusqueda(); }
    if (e.key === 'Escape') { cerrarFab(); cerrarHoja(); $('#busqueda').hidden = true; }
  });

  // ---------------------------------------------------------------- arranque
  aplicarTema(document.documentElement.dataset.theme || 'light');
  Promise.all([cargarCatalogos(), recargar()]).then(function () {
    var ruta = location.hash.replace(/^#\/?/, '') || 'inicio';
    if (ruta !== 'inicio') history.replaceState(null, '', '#/inicio');
    mostrar('inicio');
    if (API.configurada() && navigator.onLine) Sync.sincronizar();
  }).catch(function (e) { toast('Error al abrir los datos: ' + e.message); console.error(e); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})();
