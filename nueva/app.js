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
  var toastT, toastAccion = null;
  /* Aviso discreto abajo. Con `accion` lleva un botón (Deshacer, Recuperar…)
   * y dura más; `alVencer` corre si nadie lo tocó. */
  function toast(msg, accion) {
    if (toastAccion && toastAccion.alVencer) toastAccion.alVencer();
    var t = $('#toast'), b = $('#toast-accion');
    $('#toast-txt').textContent = msg;
    toastAccion = accion || null;
    b.hidden = !accion; if (accion) b.textContent = accion.texto;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      t.classList.remove('on');
      var x = toastAccion; toastAccion = null;
      if (x && x.alVencer) x.alVencer();
    }, accion ? 5000 : 2600);
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
  /* Categorías de licencia en cadena: cada una incluye a las de abajo, así que
   * se elige solo la más alta de cada grupo (moto y carro) o "No tiene". */
  var CAT_MOTO = ['A1', 'A2'], CAT_CARRO = ['B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
  var INCLUYE = { A1: [], A2: ['A1'], B1: [], B2: ['B1'], B3: ['B1', 'B2'], C1: ['B1'], C2: ['B1', 'B2', 'C1'], C3: ['B1', 'B2', 'B3', 'C1', 'C2'] };
  /* De un texto guardado ("A2-B1", "SIN LICENCIA") a {moto, carro}. */
  function catDeTexto(texto) {
    var t = String(texto || '').toUpperCase().trim(), r = { moto: '', carro: '' };
    if (!t) return r;
    var toks = t.split(/[-,\s/]+/).filter(Boolean);
    function mayor(lista) {
      var m = '';
      toks.forEach(function (k) { if (lista.indexOf(k) > -1 && (!m || INCLUYE[k].length > INCLUYE[m].length)) m = k; });
      return m;
    }
    r.moto = mayor(CAT_MOTO) || 'NO';
    r.carro = mayor(CAT_CARRO) || 'NO';
    return r;
  }
  function textoCategorias(f) {
    var p = [];
    if (f.catMoto && f.catMoto !== 'NO') p.push(f.catMoto);
    if (f.catCarro && f.catCarro !== 'NO') p.push(f.catCarro);
    if (!p.length && f.catMoto === 'NO' && f.catCarro === 'NO') return 'SIN LICENCIA';
    return p.join('-');
  }
  /* Las multas llegan escritas de muchas formas ("NO", "-", vacío...). */
  function normMultas(v) {
    var s = normal(v).trim();
    if (!s || s === 'no' || s === '-' || s === 'ninguna') return 'No';
    if (s === 'si') return 'Sí';
    if (s.indexOf('acuerdo') > -1) return 'Acuerdo de pago';
    return v;
  }
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
      nombre: '', cedula: '', contacto: '', categorias: '', catMoto: '', catCarro: '',
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
      vigenciaA2: aISO(s.vigenciaA2), vigenciaB1: aISO(s.vigenciaB1), multas: normMultas(s.multas),
      catMoto: catDeTexto(s.categorias).moto, catCarro: catDeTexto(s.categorias).carro,
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
  /* Historial (el botón atrás del teléfono):
   *   [inicio] -> [pantalla de trabajo] -> [capa encima]
   * - Entre pantallas de trabajo se REEMPLAZA la entrada: atrás desde
   *   cualquiera de ellas vuelve SIEMPRE al inicio.
   * - Cada capa (buscador, menú +, hojas, diálogos, cámara) agrega una entrada:
   *   atrás la cierra, nunca saca de la app ni deja nada abierto. */
  var ORDEN = { inicio: 0, persona: 1, evaluar: 2, cierre: 3, informe: 4 };
  var rutaActual = 'inicio';
  var capa = null;      // { nombre, cerrar }
  var trasPop = null;   // qué hacer cuando termine de cerrarse la capa

  function ir(ruta) {
    if (!ORDEN.hasOwnProperty(ruta)) ruta = 'inicio';
    if (capa) { cerrarCapa(function () { ir(ruta); }); return; }
    if (ruta === rutaActual) { mostrar(ruta); return; }
    if (ruta === 'inicio') {
      if (history.state && history.state.r && history.state.r !== 'inicio') { history.back(); return; }
      history.replaceState({ r: 'inicio' }, '', '#/inicio');
      salirDeFicha(); mostrar('inicio'); return;
    }
    var st = { r: ruta };
    if (rutaActual === 'inicio') history.pushState(st, '', '#/' + ruta);
    else history.replaceState(st, '', '#/' + ruta);
    mostrar(ruta);
  }
  function abrirCapa(nombre, cerrarFn) {
    if (capa) { var c = capa; capa = null; c.cerrar(); history.replaceState({ r: rutaActual, capa: nombre }, ''); }
    else history.pushState({ r: rutaActual, capa: nombre }, '');
    capa = { nombre: nombre, cerrar: cerrarFn };
  }
  function soltarCapa() { if (capa) { var c = capa; capa = null; c.cerrar(); } }
  function cerrarCapa(luego) {
    if (!capa) { if (luego) luego(); return; }
    if (history.state && history.state.capa) { trasPop = luego || null; history.back(); }
    else { soltarCapa(); if (luego) luego(); }
  }
  window.addEventListener('popstate', function (e) {
    var st = e.state || { r: 'inicio' };
    if (capa && st.capa !== capa.nombre) soltarCapa();
    var r = st.r || 'inicio';
    if (r !== rutaActual) { if (r === 'inicio') salirDeFicha(); mostrar(r); }
    if (trasPop) { var f = trasPop; trasPop = null; f(); }
  });

  function mostrar(ruta) {
    if (!ORDEN.hasOwnProperty(ruta)) ruta = 'inicio';
    if (ruta !== 'inicio' && !F) ruta = 'inicio';
    var atras = ORDEN[ruta] < ORDEN[rutaActual];
    rutaActual = ruta;
    $$('.vista').forEach(function (v) {
      var on = v.dataset.vista === ruta;
      v.classList.toggle('activa', on);
      v.classList.toggle('volver', on && atras);
    });
    document.body.classList.toggle('con-fab', ruta === 'inicio');
    document.body.classList.toggle('con-ficha', !!F && ruta !== 'inicio');
    document.body.classList.toggle('ruta-informe', ruta === 'informe');
    window.scrollTo(0, 0);
    if (ruta === 'inicio' || matchMedia('(min-width: 1100px)').matches) pintarInicio();
    if (ruta === 'persona') pintarPersona();
    if (ruta === 'evaluar') pintarEvaluar();
    if (ruta === 'cierre') pintarCierre();
    if (ruta === 'informe' || document.body.classList.contains('con-ficha')) pintarInforme();
  }

  function abrirFicha(f, ruta, original) {
    revocarFotos();
    F = f;
    ORIGINAL = original || (f.base ? JSON.stringify(f) : null);
    $$('[data-guardado]').forEach(function (el) { el.textContent = f.base ? 'Editando N° ' + f.folio : ''; });
    cargarFotos().then(function () { ir(ruta || 'persona'); });
  }
  function cerrarFicha() { revocarFotos(); F = null; ORIGINAL = null; }
  /* Al volver al inicio: un borrador ya está guardado; los cambios a un informe
   * emitido que no se guardaron se descartan, pero se pueden recuperar. */
  function salirDeFicha() {
    if (!F) return;
    if (F.base && F.sucio && JSON.stringify(Object.assign({}, F, { sucio: undefined })) !== ORIGINAL) {
      var copia = F, orig = ORIGINAL, ruta = rutaActual === 'inicio' ? 'persona' : rutaActual;
      toast('Cambios del N° ' + F.folio + ' sin guardar', { texto: 'Recuperar', fn: function () { abrirFicha(copia, ruta, orig); } });
    }
    cerrarFicha();
  }

  // ------------------------------------------- fondo que se encoge (hojas)
  var encogidoY = null;
  function encoger() {
    if (matchMedia('(min-width: 1100px)').matches || encogidoY !== null) return;
    encogidoY = window.scrollY;
    var app = $('#app'), v = $('.vista.activa');
    // Se congela la app donde estaba: así las barras fijas no saltan al encoger
    app.style.position = 'fixed'; app.style.inset = '0'; app.style.overflow = 'hidden';
    if (v) v.style.marginTop = (-encogidoY) + 'px';
    void app.offsetWidth; // aplica el congelado antes de animar el encogimiento
    document.body.classList.add('encogido');
  }
  function desencoger() {
    if (encogidoY === null) return;
    var y = encogidoY; encogidoY = null;
    document.body.classList.remove('encogido');
    setTimeout(function () {
      if (encogidoY !== null) return; // se abrió otra hoja mientras tanto
      var app = $('#app');
      app.style.position = ''; app.style.inset = ''; app.style.overflow = '';
      $$('.vista').forEach(function (x) { x.style.marginTop = ''; });
      window.scrollTo(0, y);
    }, 380);
  }

  // ---------------------------------------------------- diálogo propio
  /* Reemplaza confirm(): mismo estilo de la app. Devuelve true/false.
   * Atrás o tocar fuera = la opción de "no". */
  function dialogo(o) {
    return new Promise(function (resolver) {
      var elegido = false;
      $('#dlg-titulo').textContent = o.titulo;
      $('#dlg-texto').textContent = o.texto || '';
      $('#dlg-si').textContent = o.si || 'Aceptar';
      $('#dlg-no').textContent = o.no || 'Cancelar';
      $('#dlg').classList.toggle('peligro', !!o.peligro);
      $('#dlg').hidden = false; $('#dlg-velo').hidden = false;
      encoger();
      abrirCapa('dialogo', function () {
        $('#dlg').hidden = true; $('#dlg-velo').hidden = true;
        desencoger(); resolver(elegido);
      });
      $('#dlg-si').onclick = function () { elegido = true; cerrarCapa(); };
      $('#dlg-no').onclick = function () { cerrarCapa(); };
      $('#dlg-velo').onclick = function () { cerrarCapa(); };
    });
  }

  // ------------------------------------------------- selectores de rueda
  var ALTO = 44;
  function crearRueda(ops, idx) {
    var el = document.createElement('div');
    el.className = 'rueda';
    el.innerHTML = '<div class="rueda-pad"></div>' + ops.map(function (o, i) {
      return '<button type="button" class="rueda-op" data-i="' + i + '">' + esc(o.t) + '</button>';
    }).join('') + '<div class="rueda-pad"></div>';
    var bs = $$('.rueda-op', el), sel = -1, raf = 0;
    /* Solo se tocan las ~9 opciones cercanas al centro y solo transform,
     * opacity y un blur pequeño: lo resuelve la GPU, no cuesta en gama media. */
    function pintar() {
      raf = 0;
      var c = el.scrollTop / ALTO;
      var desde = Math.max(0, Math.floor(c) - 4), hasta = Math.min(bs.length - 1, Math.ceil(c) + 4);
      for (var i = desde; i <= hasta; i++) {
        var d = Math.min(Math.abs(i - c), 3), b = bs[i];
        b.style.transform = 'scale(' + (1 - d * 0.11).toFixed(3) + ')';
        b.style.opacity = (1 - d * 0.3).toFixed(3);
        b.style.filter = d > 0.45 ? 'blur(' + (d * 0.9).toFixed(2) + 'px)' : 'none';
      }
      var n = Math.max(0, Math.min(bs.length - 1, Math.round(c)));
      if (n !== sel) { if (bs[sel]) bs[sel].classList.remove('sel'); sel = n; bs[n].classList.add('sel'); }
    }
    el.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(pintar); }, { passive: true });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.rueda-op');
      if (b) el.scrollTo({ top: Number(b.dataset.i) * ALTO, behavior: 'smooth' });
    });
    return {
      el: el,
      // Se lee de la posición real, no del último cuadro pintado
      valor: function () { return Math.max(0, Math.min(bs.length - 1, Math.round(el.scrollTop / ALTO))); },
      ir: function (i) { el.scrollTo({ top: i * ALTO, behavior: 'smooth' }); },
      iniciar: function () { el.scrollTop = Math.max(0, idx) * ALTO; pintar(); }
    };
  }
  /* Hoja con una o varias ruedas. Devuelve los índices elegidos, 'borrar' o null. */
  function abrirSelector(o) {
    return new Promise(function (resolver) {
      var elegido = null;
      abrirHoja('<div class="selector-cab"><h2>' + esc(o.titulo) + '</h2></div>' +
        (o.atajos ? '<div class="selector-atajos">' + o.atajos.map(function (a, i) {
          return '<button type="button" data-atajo="' + i + '">' + esc(a.t) + '</button>';
        }).join('') + '</div>' : '') +
        '<div class="ruedas"></div><div class="acciones"><button type="button" class="btn-tinta" id="sel-listo">Listo</button></div>',
        function () { resolver(elegido); });
      var cont = $('#hoja-cuerpo .ruedas');
      var ruedas = o.columnas.map(function (c) {
        var r = crearRueda(c.ops, c.idx);
        r.el.style.flex = c.flex || 1;
        cont.appendChild(r.el);
        return r;
      });
      ruedas.forEach(function (r) { r.iniciar(); }); // la hoja ya es visible: se coloca al instante
      $('#sel-listo').onclick = function () { elegido = ruedas.map(function (r) { return r.valor(); }); cerrarCapa(); };
      $$('[data-atajo]', $('#hoja-cuerpo')).forEach(function (b) {
        b.onclick = function () {
          var a = o.atajos[b.dataset.atajo];
          if (a.borrar) { elegido = 'borrar'; cerrarCapa(); } else a.fn(ruedas);
        };
      });
    });
  }
  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function elegirFecha(campo) {
    var titulos = { fecha: 'Fecha de prueba', vigenciaA2: 'Licencia moto (A2) · vence', vigenciaB1: 'Licencia carro (B1) · vence' };
    var hoy = hoyISO().split('-').map(Number);
    var base = (F[campo] || hoyISO()).split('-').map(Number);
    var a0 = campo === 'fecha' ? hoy[0] - 2 : hoy[0] - 3, a1 = campo === 'fecha' ? hoy[0] + 1 : hoy[0] + 15;
    a0 = Math.min(a0, base[0]); a1 = Math.max(a1, base[0]);
    var anios = [], dias = [];
    for (var a = a0; a <= a1; a++) anios.push({ t: String(a), v: a });
    for (var d = 1; d <= 31; d++) dias.push({ t: String(d) });
    var atajos = campo === 'fecha'
      ? [{ t: 'Hoy', fn: function (r) { r[0].ir(hoy[2] - 1); r[1].ir(hoy[1] - 1); r[2].ir(hoy[0] - a0); } }]
      : [{ t: 'Sin fecha', borrar: true }];
    abrirSelector({
      titulo: titulos[campo], atajos: atajos,
      columnas: [{ ops: dias, idx: base[2] - 1, flex: 0.8 }, { ops: MESES.map(function (m) { return { t: m }; }), idx: base[1] - 1 }, { ops: anios, idx: base[0] - a0 }]
    }).then(function (r) {
      if (!r || !F) return;
      if (r === 'borrar') F[campo] = '';
      else {
        if (!anios[r[2]]) return;
        var y = anios[r[2]].v, m = r[1] + 1, dd = Math.min(r[0] + 1, new Date(y, m, 0).getDate());
        F[campo] = y + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      }
      pintarPersona(); guardarBorrador();
    });
  }
  function elegirEmpresa() {
    var lista = empresas();
    if (!lista.length) { toast('No hay empresas: agrégalas en la hoja Empresas del Sheet'); return; }
    var idx = Math.max(0, lista.findIndex(function (e) { return e.empresa === F.empresa; }));
    abrirSelector({ titulo: 'Empresa', columnas: [{ ops: lista.map(function (e) { return { t: e.empresa }; }), idx: idx }] })
      .then(function (r) {
        if (!r || !F) return;
        var e = lista[r[0]];
        F.empresa = e.empresa; F.ciudad = e.ciudad || '';
        quitarFalta('empresa'); pintarPersona(); guardarBorrador();
      });
  }

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
  function fechaBoton(iso) {
    return iso ? fechaLocal(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha';
  }
  function pintarPersona() {
    $('#persona-titulo').textContent = F.base ? 'Informe N° ' + F.folio : 'Nueva evaluación';
    $('#f-nombre').value = F.nombre; $('#f-cedula').value = F.cedula; $('#f-contacto').value = F.contacto;
    var be = $('#f-empresa');
    be.textContent = F.empresa || 'Elegir…'; be.classList.toggle('vacio', !F.empresa);
    [['#f-fecha', 'fecha'], ['#f-vig-a2', 'vigenciaA2'], ['#f-vig-b1', 'vigenciaB1']].forEach(function (p) {
      var b = $(p[0]), v = F[p[1]];
      b.textContent = fechaBoton(v) + (p[1] !== 'fecha' && v && F.fecha && v < F.fecha ? ' · vencida' : '');
      b.classList.toggle('vacio', !v);
    });
    if (F.catMoto === undefined) { var c0 = catDeTexto(F.categorias); F.catMoto = c0.moto; F.catCarro = c0.carro; }
    pintarCategorias();
    $$('#f-multas button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === F.multas); });
    $('#f-vigencia').setAttribute('aria-pressed', F.conVigencia ? 'true' : 'false');
    $('#f-vigencia-ayuda').textContent = F.conVigencia ? 'Encendido: vence un año después de la prueba' : 'Apagado: el informe dice "Ingreso"';
    resumenMas();
    $('#persona-aviso').hidden = true;
    $('#eliminar-informe').hidden = !F.base;
    if (F.base) $('#eliminar-informe').textContent = 'Eliminar el informe N° ' + F.folio;
    pintarFotoPerfil();
  }
  function pintarCategorias() {
    [['moto', CAT_MOTO, 'catMoto', 'Moto'], ['carro', CAT_CARRO, 'catCarro', 'Carro']].forEach(function (g) {
      var el = $('#cat-' + g[0]), v = F[g[2]];
      if (v) {
        var inc = v === 'NO' ? [] : INCLUYE[v] || [];
        el.innerHTML = '<span class="cat-tit">' + g[3] + '</span><div class="cat-elegida">' +
          '<span class="chip-on' + (v === 'NO' ? ' ninguna' : '') + '">' + (v === 'NO' ? 'No tiene' : v) + '</span>' +
          '<small>' + (inc.length ? 'incluye ' + inc.join(', ') : '') + '</small>' +
          '<button type="button" class="x" data-cat-quitar="' + g[2] + '" aria-label="Cambiar categoría de ' + g[3].toLowerCase() + '">' +
          '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
      } else {
        el.innerHTML = '<span class="cat-tit">' + g[3] + '</span><div class="chips">' + g[1].map(function (c) {
          return '<button type="button" data-cat-g="' + g[2] + '" data-cat="' + c + '">' + c + '</button>';
        }).join('') + '<button type="button" class="ninguna" data-cat-g="' + g[2] + '" data-cat="NO">No tiene</button></div>';
      }
    });
    $('#lbl-vig-a2').textContent = 'Licencia ' + (F.catMoto && F.catMoto !== 'NO' ? F.catMoto : 'moto') + ' · vence';
    $('#lbl-vig-b1').textContent = 'Licencia ' + (F.catCarro && F.catCarro !== 'NO' ? F.catCarro : 'carro') + ' · vence';
    $('#campo-vig-a2').hidden = F.catMoto === 'NO';
    $('#campo-vig-b1').hidden = F.catCarro === 'NO';
  }
  function resumenMas() {
    var p = [];
    if (F.vigenciaA2 && F.catMoto !== 'NO') p.push((F.catMoto || 'Moto') + ' ' + ddmmaaaa(F.vigenciaA2));
    if (F.vigenciaB1 && F.catCarro !== 'NO') p.push((F.catCarro || 'Carro') + ' ' + ddmmaaaa(F.vigenciaB1));
    p.push('Multas: ' + (F.multas === 'Acuerdo de pago' ? 'acuerdo' : F.multas.toLowerCase()));
    p.push(F.conVigencia ? 'con vigencia' : 'ingreso');
    $('#resumen-mas').textContent = p.join(' · ');
  }
  function validarDatos() {
    var faltan = [];
    if (!F.nombre.trim()) faltan.push({ campo: 'nombre', etq: 'el nombre' });
    if (!F.cedula.trim()) faltan.push({ campo: 'cedula', etq: 'la cédula' });
    if (!F.empresa) faltan.push({ campo: 'empresa', etq: 'la empresa' });
    if (!F.catMoto || !F.catCarro) faltan.push({ campo: 'categorias', etq: 'las categorías (o "No tiene")' });
    return faltan;
  }
  function listaFaltan(f) {
    var t = f.map(function (x) { return x.etq; });
    return t.length > 1 ? t.slice(0, -1).join(', ') + ' y ' + t[t.length - 1] : t[0];
  }
  /* Señal sutil de lo que faltó: el campo se marca en rojo, tiembla una vez y
   * el primero queda a la vista y con el cursor listo. Se quita al llenarlo. */
  function marcarFaltantes(f) {
    f.forEach(function (x) {
      var c = $('[data-campo="' + x.campo + '"]');
      if (c) { c.classList.remove('falta'); void c.offsetWidth; c.classList.add('falta'); }
    });
    var p = f.length && $('[data-campo="' + f[0].campo + '"]');
    if (p) {
      p.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var inp = p.querySelector('input');
      if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 380);
    }
  }
  function quitarFalta(campo) { var c = $('[data-campo="' + campo + '"]'); if (c) c.classList.remove('falta'); }

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
  var FOTO = {}; // 'perfil' | 'ev1'..'ev4' -> objectURL
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
  function guardarFotoBlob(destino, blob) {
    if (!F) return Promise.resolve();
    var clave = F.uuid + (destino === 'perfil' ? ':perfil:1' : ':evidencia:' + destino.slice(2));
    return DB.guardarFoto(clave, blob).then(function () {
      if (FOTO[destino] && FOTO[destino].indexOf('blob:') === 0) URL.revokeObjectURL(FOTO[destino]);
      FOTO[destino] = URL.createObjectURL(blob);
      if (F.base) F.sucio = true; else guardarBorrador();
      refrescarFotos();
    });
  }

  /* Cámara con guía de encuadre (traída de la app clásica): un círculo para el
   * perfil y un marco 3:5 para las evidencias; lo de afuera se oscurece y la
   * foto sale EXACTAMENTE con lo que se ve dentro de la guía. */
  var DESTINO = { perfil: { w: 600, h: 600, q: 0.9, redondo: true }, ev: { w: 600, h: 1000, q: 0.85 } };
  var cam = { stream: null, capa: null, video: null, frontal: false, destino: null };
  /* Primero se elige: cámara (con guía) o galería (documentos y fotos ya
   * guardadas en el teléfono). */
  function pedirFoto(destino) {
    var hayCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    abrirHoja('<h2>' + (destino === 'perfil' ? 'Foto de perfil' : 'Evidencia ' + destino.slice(2)) + '</h2>' +
      '<div class="opciones-foto">' +
      (hayCam ? '<button type="button" class="opcion-foto" id="op-camara"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>' +
        '<span><b>Tomar foto</b><small>Con guía de encuadre</small></span></button>' : '') +
      '<button type="button" class="opcion-foto" id="op-galeria"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>' +
      '<span><b>Elegir de la galería</b><small>Documentos o fotos guardadas · recorte centrado</small></span></button></div>');
    if (hayCam) $('#op-camara').onclick = function () { cerrarCapa(function () { abrirCamara(destino); }); };
    // El selector de archivos se abre DENTRO del toque (iPhone lo exige); luego se cierra la hoja
    $('#op-galeria').onclick = function () { pedirArchivo(destino); cerrarCapa(); };
  }
  var fotoDestino = null;
  function pedirArchivo(destino) {
    fotoDestino = destino;
    var inp = $('#archivo-foto');
    inp.removeAttribute('capture'); // galería, no cámara
    inp.value = '';
    inp.click();
  }
  function abrirCamara(destino) {
    var d = destino === 'perfil' ? DESTINO.perfil : DESTINO.ev;
    cam.destino = destino;
    var el = document.createElement('div');
    el.className = 'cam-capa';
    el.innerHTML =
      '<div class="cam-marco ' + (d.redondo ? 'cam-marco-1-1' : 'cam-marco-3-5') + '">' +
      '<video class="cam-video" playsinline muted autoplay></video>' +
      '<div class="cam-mascara' + (d.redondo ? ' cam-mascara-redonda' : '') + '"></div>' +
      '<div class="cam-guia' + (d.redondo ? ' cam-guia-redonda' : '') + '"></div></div>' +
      '<div class="cam-ayuda">' + (d.redondo ? 'Encuadra el rostro dentro del círculo. Así queda en el informe.' : 'Lo que quede dentro del marco es lo que sale en el informe.') + '</div>' +
      '<div class="cam-barra">' +
      '<button type="button" class="cam-sec" data-cam="galeria" aria-label="Elegir de la galería"><svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg></button>' +
      '<button type="button" class="cam-disparo" data-cam="disparar" aria-label="Tomar foto"></button>' +
      '<button type="button" class="cam-sec" data-cam="girar" aria-label="Cambiar de cámara"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><path d="M9.5 13a2.5 2.5 0 0 1 4.3-1.7M14.5 13a2.5 2.5 0 0 1-4.3 1.7"/></svg></button>' +
      '</div>' +
      '<button type="button" class="cam-sec" data-cam="cerrar" aria-label="Cerrar cámara" style="position:absolute;top:calc(16px + env(safe-area-inset-top));left:16px"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    document.body.appendChild(el);
    cam.capa = el; cam.video = el.querySelector('video');
    abrirCapa('camara', apagarCamara);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cam]');
      if (!b) return;
      var a = b.dataset.cam;
      if (a === 'cerrar') cerrarCapa();
      else if (a === 'galeria') { pedirArchivo(destino); cerrarCapa(); }
      else if (a === 'disparar') capturar();
      else if (a === 'girar') {
        cam.frontal = !cam.frontal; pararStream();
        arrancarCamara().catch(function () { cam.frontal = !cam.frontal; arrancarCamara().catch(falloCamara); });
      }
    });
    arrancarCamara().catch(falloCamara);
  }
  function arrancarCamara() {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: cam.frontal ? 'user' : { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false
    }).then(function (s) {
      if (!cam.capa) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      cam.stream = s; cam.video.srcObject = s;
      cam.video.classList.toggle('cam-espejo', cam.frontal);
      return cam.video.play();
    });
  }
  function pararStream() { if (cam.stream) { cam.stream.getTracks().forEach(function (t) { t.stop(); }); cam.stream = null; } }
  function apagarCamara() { pararStream(); if (cam.capa) { cam.capa.remove(); cam.capa = null; } cam.video = null; }
  function falloCamara(err) {
    var destino = cam.destino;
    cerrarCapa(function () {
      var msg = err && err.name === 'NotAllowedError' ? 'Sin permiso para la cámara' : 'No se pudo abrir la cámara';
      toast(msg, { texto: 'Usar galería', fn: function () { pedirArchivo(destino); } });
    });
  }
  function capturar() {
    var d = cam.destino === 'perfil' ? DESTINO.perfil : DESTINO.ev;
    var v = cam.video, vw = v && v.videoWidth, vh = v && v.videoHeight;
    if (!vw || !vh) return;
    var marco = cam.capa.querySelector('.cam-guia').getBoundingClientRect();
    var rg = marco.width / marco.height, rv = vw / vh, sw, sh, sx, sy;
    if (rv > rg) { sh = vh; sw = vh * rg; sx = (vw - sw) / 2; sy = 0; } else { sw = vw; sh = vw / rg; sx = 0; sy = (vh - sh) / 2; }
    var c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    var ctx = c.getContext('2d');
    if (cam.frontal) { ctx.translate(d.w, 0); ctx.scale(-1, 1); } // la selfie se ve en espejo
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, d.w, d.h);
    var fl = document.createElement('div'); fl.className = 'cam-flash'; document.body.appendChild(fl);
    setTimeout(function () { fl.remove(); }, 400);
    var destino = cam.destino;
    c.toBlob(function (b) { cerrarCapa(function () { if (b) guardarFotoBlob(destino, b); }); }, 'image/jpeg', d.q);
  }
  /* Galería: recorte centrado con las mismas medidas. */
  function recortar(archivo, destino) {
    var d = destino === 'perfil' ? DESTINO.perfil : DESTINO.ev;
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(archivo), img = new Image();
      img.onload = function () {
        var escala = Math.max(d.w / img.width, d.h / img.height);
        var w = d.w / escala, h = d.h / escala;
        var c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
        c.getContext('2d').drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, d.w, d.h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('No se pudo procesar la foto')); }, 'image/jpeg', d.q);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto')); };
      img.src = url;
    });
  }
  $('#archivo-foto').addEventListener('change', function () {
    var a = this.files && this.files[0];
    if (!a || !F || !fotoDestino) return;
    var destino = fotoDestino;
    recortar(a, destino).then(function (blob) { return guardarFotoBlob(destino, blob); })
      .catch(function (e) { toast(e.message); });
  });

  // ----------------------------------------------------------------- emitir
  function emitir() {
    var faltan = validarDatos();
    if (faltan.length) {
      dialogo({
        titulo: 'Aún no se puede emitir',
        texto: 'Falta ' + listaFaltan(faltan) + '. Todo lo demás queda guardado en el borrador.',
        si: 'Completar', no: 'Ahora no'
      }).then(function (ok) {
        if (ok) { ir('persona'); setTimeout(function () { marcarFaltantes(faltan); }, 360); }
        else toast('Sigue como borrador · falta ' + listaFaltan(faltan));
      });
      return;
    }
    var p = pendientes(F);
    if (p) {
      var v = VEHICULOS.find(function (x) { return Object.keys(F.practica[x.id]).some(function (c) { return F.practica[x.id][c] == null; }); });
      if (v) abiertoVeh = v.id;
      toast('Faltan ' + p + ' maniobras por marcar');
      ir('evaluar');
      return;
    }
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
        categorias: textoCategorias(F), contacto: F.contacto.trim(), fecha: F.fecha,
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
          $$('[data-guardado]').forEach(function (el) { el.textContent = 'Editando N° ' + folio; });
          btn.disabled = false;
          toast(era ? 'Cambios guardados en el N° ' + folio : 'Informe N° ' + folio + ' emitido');
          Sync.sincronizar();
          ir('informe');
        });
      });
    }).catch(function (e) { btn.disabled = false; toast('No se pudo guardar: ' + e.message); });
  }

  /* Eliminar (traído de la app clásica). El número NO se recicla: el contador
   * 'folioTecho' se queda donde estaba, así nunca circulan dos informes
   * distintos con el mismo número. */
  function eliminarInforme() {
    var s = F && F.base ? SERV.find(function (x) { return x.uuid === F.base; }) : null;
    if (!s) return;
    var enNube = s.estado === 'sincronizado';
    var folio = F.folio, nombre = F.nombre;
    dialogo({
      titulo: 'Eliminar el informe N° ' + folio,
      texto: nombre + '. Se borra del teléfono' + (enNube ? ' y de la nube (sus fotos van a la papelera de Drive, se pueden recuperar)' : '') +
        '. El N° ' + folio + ' no se vuelve a usar.',
      si: 'Eliminar', no: 'Cancelar', peligro: true
    }).then(function (ok) {
      if (!ok) { toast('No se eliminó nada'); return; }
      var uuid = s.uuid;
      techo = Math.max(techo, folio);
      DB.setMeta('folioTecho', techo)
        .then(function () { return DB.fotosDe(uuid); })
        .then(function (fs) { return Promise.all(fs.map(function (f) { return DB.borrarFoto(f.clave); })); })
        .then(function () { return DB.borrarServicio(uuid); })
        .then(function () {
          if (!enNube) return 'ok';
          if (!(API.configurada() && navigator.onLine)) return 'sinSenal';
          return API.borrar(uuid).then(function () { return 'ok'; }, function () { return 'fallo'; });
        })
        .then(function (res) {
          F.sucio = false; cerrarFicha();
          return recargar().then(function () {
            ir('inicio');
            toast(res === 'sinSenal' ? 'Eliminado del teléfono. Con señal, elimínalo otra vez para quitarlo de la nube'
              : res === 'fallo' ? 'Eliminado del teléfono; la nube no respondió' : 'Informe N° ' + folio + ' eliminado');
          });
        })
        .catch(function (e) { toast('No se pudo eliminar: ' + e.message); });
    });
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
    /* Licencia: "No tiene" si no tiene esa categoría, "Vencida" si vence antes
     * de la fecha de la prueba; si no, la fecha. */
    [['prev-lic-moto', F.catMoto, F.vigenciaA2], ['prev-lic-carro', F.catCarro, F.vigenciaB1]].forEach(function (l) {
      var el = document.getElementById(l[0]), t = '—', cls = '';
      if (l[1] === 'NO') { t = 'No tiene'; cls = ' no-tiene'; }
      else if (l[2] && F.fecha && l[2] < F.fecha) { t = 'Vencida ' + ddmmaaaa(l[2]); cls = ' vencida'; }
      else if (l[2]) t = ddmmaaaa(l[2]);
      el.textContent = t; el.className = 'inf-lic-fecha' + cls;
    });
    var mp = document.getElementById('prev-multas-val'), mu = normMultas(F.multas);
    mp.textContent = mu;
    mp.className = mu === 'No' ? 'bg-blue-100' : mu === 'Sí' ? 'bg-red-100' : 'bg-amber-100';
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
    $('#busqueda').hidden = false;
    $('#buscar-input').value = '';
    buscar('');
    abrirCapa('busqueda', function () { $('#busqueda').hidden = true; $('#buscar-input').blur(); });
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
  var hojaTurno = 0;
  function abrirHoja(html, alCerrar) {
    var turno = ++hojaTurno, h = $('#hoja');
    abrirCapa('hoja', function () {
      h.style.transform = ''; h.classList.add('saliendo');
      $('#hoja-velo').hidden = true; desencoger();
      setTimeout(function () { if (turno === hojaTurno) { h.hidden = true; h.classList.remove('saliendo'); } }, 260);
      if (alCerrar) alCerrar();
    });
    h.classList.remove('saliendo', 'volviendo', 'arrastrando'); h.style.transform = '';
    $('#hoja-cuerpo').innerHTML = html; $('#hoja-cuerpo').scrollTop = 0;
    h.style.animation = 'none'; h.hidden = false; void h.offsetWidth; h.style.animation = '';
    $('#hoja-velo').hidden = false;
    encoger();
  }
  $('#hoja-velo').addEventListener('click', function () { cerrarCapa(); });
  /* Cerrar arrastrando SOLO desde la barrita de arriba: el contenido de la hoja
   * se desplaza libremente y nunca compite con el gesto de cerrar. */
  (function () {
    var asa = $('#hoja-asa'), h = $('#hoja'), y0 = null, dy = 0, t0 = 0;
    asa.addEventListener('pointerdown', function (e) {
      y0 = e.clientY; dy = 0; t0 = performance.now();
      h.classList.add('arrastrando'); asa.setPointerCapture(e.pointerId);
    });
    asa.addEventListener('pointermove', function (e) {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      h.style.transform = 'translateY(' + dy + 'px)';
    });
    function soltar() {
      if (y0 === null) return;
      y0 = null; h.classList.remove('arrastrando');
      var vel = dy / Math.max(1, performance.now() - t0);
      if (dy > 90 || (dy > 24 && vel > 0.6)) cerrarCapa();
      else { h.classList.add('volviendo'); h.style.transform = ''; setTimeout(function () { h.classList.remove('volviendo'); }, 300); }
    }
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  })();

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
      if (rutaActual === 'inicio') pintarInicio(); else pintarNube();
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
  function abrirFab() {
    $('#fab').classList.add('abierto'); $('#fab-velo').classList.add('on');
    $('#fab-main').setAttribute('aria-expanded', 'true');
    if (navigator.vibrate) navigator.vibrate(8);
    abrirCapa('fab', function () {
      $('#fab').classList.remove('abierto'); $('#fab-velo').classList.remove('on');
      $('#fab-main').setAttribute('aria-expanded', 'false');
    });
  }
  $('#fab-main').addEventListener('click', function () {
    if ($('#fab').classList.contains('abierto')) cerrarCapa(); else abrirFab();
  });
  $('#fab-velo').addEventListener('click', function () { cerrarCapa(); });
  $$('.fab-item').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.accion;
      if (a === 'tema') { cambiarTema(b.querySelector('.ico')); setTimeout(function () { cerrarCapa(); }, 420); return; }
      cerrarCapa(function () {
        if (a === 'nueva') nuevaEvaluacion();
        if (a === 'buscar') abrirBusqueda();
        if (a === 'ajustes') abrirAjustes();
      });
    });
  });

  function nuevaEvaluacion(base) {
    if (F) salirDeFicha();
    var f = fichaNueva(base);
    BORR[f.uuid] = f;
    abrirFicha(f, 'persona');
    guardarBorrador();
  }
  function abrirServicio(uuid) {
    var s = SERV.find(function (x) { return x.uuid === uuid; });
    if (!s) return;
    if (F) salirDeFicha();
    abrirFicha(fichaDeServicio(s), 'informe');
  }

  // ------------------------------------------------------------- eventos
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    var d = t.dataset;
    if (d.ir) { ir(d.ir); return; }
    if (d.abrir) { var u0 = d.abrir; cerrarCapa(function () { abrirServicio(u0); }); return; }
    if (d.borrador) { var b0 = BORR[d.borrador]; if (b0) abrirFicha(b0, b0.nombre ? 'evaluar' : 'persona'); return; }
    if (d.descartar) {
      /* Sin preguntar: se descarta y se puede deshacer unos segundos. Un
       * borrador no tiene número, así que no se pierde ningún consecutivo. */
      var u = d.descartar, b = BORR[u];
      delete BORR[u];
      DB.setMeta('borradoresNueva', BORR).then(pintarInicio);
      toast((b.nombre ? 'Borrador de ' + primerNombre(b.nombre) : 'Borrador sin nombre') + ' descartado', {
        texto: 'Deshacer',
        fn: function () { BORR[u] = b; DB.setMeta('borradoresNueva', BORR).then(pintarInicio); },
        alVencer: function () {
          DB.fotosDe(u).then(function (fs) { return Promise.all(fs.map(function (f) { return DB.borrarFoto(f.clave); })); });
        }
      });
      return;
    }
    if (d.enviar) { abrirEnvio(d.enviar); return; }
    if (d.otraEmpresa) {
      var muestra = SERV.find(function (x) { return x.empresa === d.otraEmpresa && aISO(x.fecha) === hoyISO(); });
      nuevaEvaluacion(muestra ? { empresa: muestra.empresa, ciudad: muestra.ciudad, fecha: hoyISO(), conVigencia: muestra.evaluacion && muestra.evaluacion.conVigencia } : null);
      return;
    }
    if (d.catG && F) {
      F[d.catG] = d.cat; F.categorias = textoCategorias(F);
      if (F.catMoto && F.catCarro) quitarFalta('categorias');
      pintarCategorias(); resumenMas(); guardarBorrador(); return;
    }
    if (d.catQuitar && F) {
      F[d.catQuitar] = ''; F.categorias = textoCategorias(F);
      pintarCategorias(); resumenMas(); guardarBorrador(); return;
    }
    if (d.fecha && F) { elegirFecha(d.fecha); return; }
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

  $('#foto-perfil').addEventListener('click', function () { pedirFoto('perfil'); });
  [['#f-nombre', 'nombre'], ['#f-cedula', 'cedula'], ['#f-contacto', 'contacto']].forEach(function (p) {
    $(p[0]).addEventListener('input', function () {
      if (p[1] === 'cedula') this.value = this.value.replace(/\D/g, '');
      F[p[1]] = this.value;
      if (this.value.trim()) quitarFalta(p[1]);
      guardarBorrador();
    });
  });
  $('#f-empresa').addEventListener('click', elegirEmpresa);
  $$('#f-multas button').forEach(function (b) {
    b.addEventListener('click', function () {
      F.multas = b.dataset.v; $$('#f-multas button').forEach(function (x) { x.classList.toggle('on', x === b); });
      resumenMas(); guardarBorrador();
    });
  });
  $('#f-vigencia').addEventListener('click', function () { F.conVigencia = !F.conVigencia; pintarPersona(); guardarBorrador(); });
  $$('#f-formato button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.classList.contains('pronto')) toast(b.firstChild.textContent.trim() + ': próximamente. Por ahora, CDA.');
    });
  });
  $('#ir-evaluar').addEventListener('click', function () {
    var faltan = validarDatos();
    if (!faltan.length) { ir('evaluar'); return; }
    dialogo({
      titulo: 'Faltan datos',
      texto: 'Falta ' + listaFaltan(faltan) + '. Puedes evaluar ya y completarlos antes de emitir.',
      si: 'Evaluar igual', no: 'Completar'
    }).then(function (ok) { if (ok) ir('evaluar'); else marcarFaltantes(faltan); });
  });
  $('#eliminar-informe').addEventListener('click', eliminarInforme);
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
    nuevaEvaluacion({ empresa: F.empresa, ciudad: F.ciudad, fecha: hoyISO(), conVigencia: F.conVigencia });
  });
  $('#abrir-busqueda').addEventListener('click', abrirBusqueda);
  $('#cerrar-busqueda').addEventListener('click', function () { cerrarCapa(); });
  $('#buscar-input').addEventListener('input', function () { buscar(this.value); });
  $('#estado-nube').addEventListener('click', function () {
    if (!API.configurada()) abrirAjustes(); else Sync.sincronizar();
  });
  $('#toast-accion').addEventListener('click', function () {
    var f = toastAccion && toastAccion.fn;
    toastAccion = null; clearTimeout(toastT); $('#toast').classList.remove('on');
    if (f) f();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!capa) abrirBusqueda(); }
    if (e.key === 'Escape' && capa) cerrarCapa();
  });

  // ---------------------------------------------------------------- arranque
  aplicarTema(document.documentElement.dataset.theme || 'light');
  history.replaceState({ r: 'inicio' }, '', '#/inicio');
  Promise.all([cargarCatalogos(), recargar()]).then(function () {
    mostrar('inicio');
    if (API.configurada() && navigator.onLine) Sync.sincronizar();
  }).catch(function (e) { toast('Error al abrir los datos: ' + e.message); console.error(e); });

  if ('serviceWorker' in navigator) {
    /* Cuando llega una versión nueva, se recarga UNA vez para estrenarla ya
     * (sin esto se veía a la segunda apertura). Solo si ya había una versión
     * controlando: la primera instalación no recarga. Los borradores están
     * guardados, no se pierde nada. */
    var habiaVersion = !!navigator.serviceWorker.controller, recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!habiaVersion || recargando) return;
      recargando = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})();
