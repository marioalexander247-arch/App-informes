/* Borradores y aviso de cambios sin guardar.
 *
 * Problema: si estabas editando un servicio y cambiabas a otro (buscador, flechas
 * anterior/siguiente, "nuevo"), lo escrito se perdía sin avisar.
 *
 * Dos redes de seguridad:
 *   1. AVISO: antes de cambiar de registro, si hay cambios sin guardar se
 *      pregunta qué hacer.
 *   2. BORRADOR: el formulario se guarda solo cada pocos segundos en este
 *      dispositivo. Aunque descartes o se cierre la app de golpe, al volver se
 *      ofrece recuperarlo. El borrador es local: no viaja a la nube.
 *
 * Puntos de entrada cubiertos (son todos los que cambian de registro):
 *   populateForm  · navigateRecords  · nuevoRegistro  · resetForm
 */
(function () {
    'use strict';

    var CLAVE = 'appinf:borradores';
    var GUARDA_CADA = 4000;
    var CAMPOS = ['part-nombre', 'part-cedula', 'part-empresa', 'part-ciudad', 'part-categorias',
        'part-contacto', 'part-fecha', 'part-vigencia-a2', 'part-vigencia-b1', 'part-multas',
        'part-observaciones', 'part-conclusiones'];

    var base = null;          // estado tal como se cargó (para saber si hay cambios)
    var aplicando = false;    // evita que un aviso dispare otro aviso anidado
    var temporizador = null;

    // ---------------- estado del formulario ----------------
    function estadoActual() {
        var e = { campos: {}, teoria: null, practica: null, fotos: [], vigencia: false };
        CAMPOS.forEach(function (id) {
            var el = document.getElementById(id);
            e.campos[id] = el ? String(el.value || '') : '';
        });
        var chk = document.getElementById('part-vigencia-check');
        e.vigencia = !!(chk && chk.checked);
        try { e.teoria = JSON.stringify(window.theoryScores || {}); } catch (x) { }
        try { e.practica = JSON.stringify(window.practicalScores || {}); } catch (x) { }
        var imgs = window.uploadedImages || {};
        e.fotos = Object.keys(imgs).filter(function (k) { return !!imgs[k]; }).sort();
        return e;
    }

    function huella(e) { return JSON.stringify(e); }

    function fijarBase() { base = huella(estadoActual()); }

    function hayCambios() {
        if (base === null) return false;
        return huella(estadoActual()) !== base;
    }

    /* ¿Merece la pena guardar? Basta con CUALQUIER dato: un nombre a medias, una
     * cédula, una foto, una nota teórica movida. Guardar exige el formulario
     * completo (nombre, cédula, empresa, categorías, observaciones y
     * conclusiones); el borrador no exige nada de eso, justo para que puedas
     * dejar algo a medias y volver luego. */
    function vacio(e) {
        var algunCampo = CAMPOS.some(function (id) {
            var v = e.campos[id];
            if (!v) return false;
            // la fecha viene rellenada sola al abrir: por sí sola no cuenta
            if (id === 'part-fecha') return false;
            return true;
        });
        if (algunCampo || e.fotos.length) return false;
        // también cuenta haber tocado las notas o las maniobras
        try {
            var t = JSON.parse(e.teoria || '{}');
            if (Object.keys(t).some(function (k) { return Number(t[k]) > 0; })) return false;
            var pr = JSON.parse(e.practica || '{}');
            if (Object.keys(pr).some(function (k) { return pr[k] === 1 || pr[k] === true; })) return false;
        } catch (x) { }
        return true;
    }

    // ---------------- almacén de borradores ----------------
    function leerTodos() {
        try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch (x) { return {}; }
    }
    function escribirTodos(o) {
        try { localStorage.setItem(CLAVE, JSON.stringify(o)); } catch (x) { /* sin espacio: no es crítico */ }
    }
    function claveActual() {
        var id = window.editingId;
        return (id === null || typeof id === 'undefined') ? 'nuevo' : ('reg-' + id);
    }

    function guardarBorrador() {
        if (!hayCambios()) return;
        var e = estadoActual();
        if (vacio(e)) return;
        var todos = leerTodos();
        todos[claveActual()] = {
            estado: e,
            nombre: e.campos['part-nombre'] || '(sin nombre)',
            editandoId: window.editingId === null ? null : window.editingId,
            cuando: Date.now()
        };
        // Se conservan solo los 5 más recientes: si no, el almacén crece sin fin.
        var claves = Object.keys(todos).sort(function (a, b) { return todos[b].cuando - todos[a].cuando; });
        claves.slice(5).forEach(function (k) { delete todos[k]; });
        escribirTodos(todos);
    }

    function borrarBorrador(clave) {
        var todos = leerTodos();
        delete todos[clave || claveActual()];
        escribirTodos(todos);
    }

    function restaurar(e) {
        CAMPOS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el && typeof e.campos[id] !== 'undefined') el.value = e.campos[id];
        });
        var chk = document.getElementById('part-vigencia-check');
        if (chk) chk.checked = !!e.vigencia;
        try { if (e.teoria) Object.assign(window.theoryScores, JSON.parse(e.teoria)); } catch (x) { }
        try { if (e.practica) Object.assign(window.practicalScores, JSON.parse(e.practica)); } catch (x) { }
        if (typeof window.renderManeuversList === 'function') window.renderManeuversList();
        if (typeof window.updatePreviewData === 'function') window.updatePreviewData();
        fijarBase();
    }

    // ---------------- diálogos ----------------
    function dialogo(html, acciones) {
        var capa = document.createElement('div');
        capa.className = 'salir-capa';
        capa.innerHTML = '<div class="salir-caja borrador-caja" role="dialog" aria-modal="true">' + html + '</div>';
        document.body.appendChild(capa);
        capa.addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-op]');
            if (!b) return;
            var op = b.getAttribute('data-op');
            capa.remove();
            if (acciones[op]) acciones[op]();
        });
        return capa;
    }

    function avisarCambios(continuar) {
        var nombre = (document.getElementById('part-nombre') || {}).value || 'este registro';
        dialogo(
            '<div class="salir-icono"><span class="material-symbols-outlined">edit_note</span></div>' +
            '<h3>Cambios sin guardar</h3>' +
            '<p>Lo que escribiste en <b>' + nombre + '</b> todavía no está guardado.<br>' +
            'Se conserva un borrador en este dispositivo por si acaso.</p>' +
            '<div class="salir-botones salir-botones-col">' +
            '  <button type="button" class="salir-si" data-op="guardar">Guardar y continuar</button>' +
            '  <button type="button" class="salir-no" data-op="descartar">Continuar sin guardar</button>' +
            '  <button type="button" class="salir-no" data-op="cancelar">Seguir editando</button>' +
            '</div>',
            {
                guardar: function () {
                    guardarBorrador();
                    if (typeof window.saveToDatabase === 'function') window.saveToDatabase();
                    // saveToDatabase es local-first: para cuando termine ya se puede seguir
                    setTimeout(function () { borrarBorrador(); continuar(); }, 600);
                },
                descartar: function () { guardarBorrador(); continuar(); },
                cancelar: function () { }
            });
    }

    function ofrecerRecuperacion() {
        var todos = leerTodos();
        var claves = Object.keys(todos);
        if (!claves.length) return;
        claves.sort(function (a, b) { return todos[b].cuando - todos[a].cuando; });
        var k = claves[0], d = todos[k];
        if (!d || !d.estado) return;

        var hace = Math.round((Date.now() - d.cuando) / 60000);
        var cuando = hace < 1 ? 'hace un momento' : (hace < 60 ? 'hace ' + hace + ' min' : 'hace ' + Math.round(hace / 60) + ' h');

        dialogo(
            '<div class="salir-icono"><span class="material-symbols-outlined">history</span></div>' +
            '<h3>Tienes un borrador</h3>' +
            '<p>Quedó sin guardar <b>' + d.nombre + '</b> (' + cuando + ').<br>¿Lo recuperamos?</p>' +
            '<div class="salir-botones salir-botones-col">' +
            '  <button type="button" class="salir-si" data-op="si">Recuperar</button>' +
            '  <button type="button" class="salir-no" data-op="no">Descartar borrador</button>' +
            '</div>',
            {
                si: function () { aplicando = true; restaurar(d.estado); aplicando = false; borrarBorrador(k); },
                no: function () { borrarBorrador(k); }
            });
    }

    // ---------------- intercepción de los puntos de entrada ----------------
    function envolver(nombre) {
        var orig = window[nombre];
        if (typeof orig !== 'function' || orig.__conBorrador) return;
        var envuelta = function () {
            var args = arguments, self = this;
            var ejecutar = function () {
                aplicando = true;
                try { orig.apply(self, args); }
                finally {
                    aplicando = false;
                    // Solo se refija la referencia de "sin cambios". El borrador NO se
                    // borra aquí: es justo la red de seguridad que se le prometió al
                    // usuario al elegir "continuar sin guardar". Se elimina cuando se
                    // guarda de verdad o cuando él lo descarta desde la recuperación.
                    setTimeout(fijarBase, 80);
                }
            };
            if (aplicando || !hayCambios()) { ejecutar(); return; }
            avisarCambios(ejecutar);
        };
        envuelta.__conBorrador = true;
        window[nombre] = envuelta;
    }

    function iniciar() {
        ['populateForm', 'navigateRecords', 'nuevoRegistro', 'resetForm'].forEach(envolver);
        setTimeout(fijarBase, 900);
        temporizador = setInterval(guardarBorrador, GUARDA_CADA);
        document.addEventListener('visibilitychange', function () { if (document.hidden) guardarBorrador(); });
        window.addEventListener('pagehide', guardarBorrador);
        setTimeout(ofrecerRecuperacion, 1600);

        window.Borrador = {
            hayCambios: hayCambios,
            guardar: guardarBorrador,
            fijarBase: fijarBase,
            listar: leerTodos
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
