/* Botón atrás: cerrar por capas y confirmar antes de salir.
 *
 * Problema: en la PWA instalada, pulsar atrás cerraba la app de golpe y se
 * podía perder un formulario a medio llenar.
 *
 * Solución en dos partes:
 *  1. El botón atrás primero CIERRA lo que esté abierto (cámara, modales, menú
 *     flotante, zoom del informe) en vez de salir. Es lo que se espera en una app.
 *  2. Cuando ya no queda nada que cerrar, pide confirmación. Si hay cambios sin
 *     guardar, lo dice explícitamente.
 *
 * Cómo funciona el guardián: se mete una entrada extra en el historial. Al
 * pulsar atrás se consume esa entrada, se vuelve a poner y se muestra el aviso.
 * Solo si el usuario confirma se deja pasar el atrás de verdad.
 */
(function () {
    'use strict';

    var saliendo = false;
    var modalAbierto = false;

    /** Cierra la capa superior que esté abierta. Devuelve true si cerró algo. */
    function cerrarCapaSuperior() {
        var camara = document.querySelector('.cam-capa');
        if (camara) { var b = camara.querySelector('[data-accion="cerrar"]'); if (b) { b.click(); return true; } }

        var opciones = document.querySelector('.cam-opciones');
        if (opciones) { opciones.remove(); return true; }

        var qr = document.getElementById('qr-modal');
        if (qr && !qr.classList.contains('hidden')) { qr.classList.add('hidden'); return true; }

        var busqueda = document.getElementById('search-modal');
        if (busqueda && !busqueda.classList.contains('hidden')) { busqueda.classList.add('hidden'); return true; }

        var config = document.getElementById('int-config');
        if (config && config.style.display && config.style.display !== 'none') { config.style.display = 'none'; return true; }

        if (window.MenuGooey && window.MenuGooey.estaAbierto() && window.MenuGooey.retroceder()) return true;
        if (window.ZoomInforme && window.ZoomInforme.restablecer()) return true;

        // Estando en la vista previa, atrás devuelve al formulario
        if (window.activeView === 'preview' && typeof window.switchView === 'function') {
            window.switchView('form');
            return true;
        }
        return false;
    }

    /** ¿Hay trabajo sin guardar? Se mira el nombre, que es lo primero que se llena. */
    function hayTrabajoEnCurso() {
        var n = document.getElementById('part-nombre');
        if (n && n.value.trim()) return true;
        var imgs = window.uploadedImages || {};
        return Object.keys(imgs).some(function (k) { return !!imgs[k]; });
    }

    function preguntarSalida() {
        if (modalAbierto) return;
        modalAbierto = true;

        var conTrabajo = hayTrabajoEnCurso();
        var capa = document.createElement('div');
        capa.className = 'salir-capa';
        capa.innerHTML =
            '<div class="salir-caja" role="dialog" aria-modal="true" aria-labelledby="salir-tit">' +
            '  <div class="salir-icono"><span class="material-symbols-outlined">' +
            (conTrabajo ? 'warning' : 'logout') + '</span></div>' +
            '  <h3 id="salir-tit">¿Cerrar la aplicación?</h3>' +
            '  <p>' + (conTrabajo
                ? 'Tienes un registro en curso. Si sales ahora, lo que no hayas guardado se pierde.'
                : 'Vas a salir de App Informes.') + '</p>' +
            '  <div class="salir-botones">' +
            '    <button type="button" class="salir-no" data-op="quedarse">Seguir aquí</button>' +
            '    <button type="button" class="salir-si" data-op="salir">Salir</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(capa);

        capa.addEventListener('click', function (e) {
            var b = e.target.closest('[data-op]');
            if (!b) { if (e.target === capa) { capa.remove(); modalAbierto = false; } return; }
            capa.remove();
            modalAbierto = false;
            if (b.getAttribute('data-op') === 'salir') {
                saliendo = true;
                history.go(-2);           // atraviesa el guardián y sale de verdad
                setTimeout(function () { window.close(); }, 250);
            }
        });
    }

    function iniciar() {
        history.pushState({ guardian: 1 }, '');

        window.addEventListener('popstate', function () {
            if (saliendo) return;                 // el usuario ya confirmó: se deja pasar
            history.pushState({ guardian: 1 }, ''); // rearmar el guardián
            if (cerrarCapaSuperior()) return;     // había algo abierto: eso era lo que quería cerrar
            preguntarSalida();
        });

        // En navegador de escritorio (no PWA) el aviso nativo cubre el cierre de pestaña
        window.addEventListener('beforeunload', function (e) {
            if (saliendo || !hayTrabajoEnCurso()) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
