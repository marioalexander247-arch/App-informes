/* Ajuste a pantalla de la hoja del informe — red de seguridad.
 *
 * La hoja del informe mide 800px fijos (.preview-page). En pantallas menores
 * hay que escalarla con transform para que quepa completa; index.html ya trae
 * scalePreview() para eso, pero en móvil solo se disparaba con el evento
 * "resize": por eso al entrar a la vista previa la hoja se veía cortada y solo
 * se acomodaba al bloquear/desbloquear el teléfono (eso sí dispara "resize").
 *
 * El arreglo de fondo está en adjustLayout() (index.html). Este archivo cubre
 * lo que ese arreglo no ve: rotación de pantalla, teclado que aparece/se va,
 * volver de segundo plano, y contenido que cambia de tamaño después de pintar
 * (fotos, listas rellenadas por JS, fuentes que terminan de cargar).
 * Vive aparte para sobrevivir a rediseños de index.html.
 */
(function () {
    'use strict';

    function ajustar() {
        if (typeof window.scalePreview === 'function') window.scalePreview();
    }

    // La hoja crece cuando terminan de cargar fotos y fuentes: reintentamos.
    function ajustarPronto() {
        requestAnimationFrame(ajustar);
        setTimeout(ajustar, 150);
        setTimeout(ajustar, 500);
    }

    function iniciar() {
        var wrappers = document.querySelectorAll('.preview-wrapper');

        if (window.ResizeObserver) {
            // El disparador real es el ANCHO del contenedor: si cambia, la
            // escala que calculamos quedó obsoleta. Solo miramos el ancho
            // porque scalePreview() modifica el alto del wrapper, y observar
            // el alto nos metería en un bucle.
            var anchos = new WeakMap();
            var obsAncho = new ResizeObserver(function (entradas) {
                var cambio = false;
                for (var i = 0; i < entradas.length; i++) {
                    var el = entradas[i].target;
                    var w = Math.round(entradas[i].contentRect.width);
                    if (anchos.get(el) !== w) { anchos.set(el, w); cambio = true; }
                }
                if (cambio) ajustar();
            });
            for (var i = 0; i < wrappers.length; i++) obsAncho.observe(wrappers[i]);

            // Y el contenido de la hoja cambia de alto por su cuenta (fotos,
            // listas). El transform no altera el content-box, así que
            // reescalar no vuelve a disparar este observador.
            var obsHoja = new ResizeObserver(ajustar);
            var hojas = document.querySelectorAll('.preview-page');
            for (var j = 0; j < hojas.length; j++) obsHoja.observe(hojas[j]);
        } else {
            window.addEventListener('resize', ajustar);
        }

        window.addEventListener('orientationchange', ajustarPronto);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', ajustar);
        }
        // Al volver de segundo plano (el caso que se "curaba" bloqueando el cel)
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) ajustarPronto();
        });

        ajustarPronto();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
