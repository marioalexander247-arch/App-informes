/* Zoom controlado: bloqueado en la app, disponible sobre el informe.
 *
 * El zoom del navegador se apaga en el <meta viewport> (user-scalable=no), que
 * es lo que evitaba que la interfaz se descuadrara al hacer pellizco por error.
 * A cambio, aquí se implementa pellizco y arrastre PROPIOS sobre las hojas del
 * informe, que es donde sí hace falta acercarse a verificar un dato.
 *
 * Convive con scalePreview() (index.html): esa función calcula la escala de
 * AJUSTE a pantalla; aquí se multiplica por el zoom del usuario. Por eso se
 * envuelve scalePreview: cada vez que recalcula, se vuelve a aplicar el zoom.
 *
 * Gestos: pellizco para acercar, un dedo para desplazar cuando está acercado,
 * doble toque para alternar 1x / 2.5x.
 */
(function () {
    'use strict';

    var MAX = 4, MIN = 1;
    var zoom = 1, tx = 0, ty = 0;
    var base = 1;                       // escala de ajuste que calcula scalePreview
    var wrapperActivo = null;

    function hojas() { return document.querySelectorAll('.preview-wrapper'); }

    function aplicar() {
        hojas().forEach(function (w) {
            var p = w.querySelector('.preview-page');
            if (!p) return;
            var b = parseFloat(w.dataset.base || '1') || 1;
            if (zoom === 1) { tx = 0; ty = 0; }
            p.style.transformOrigin = 'top center';
            p.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + (b * zoom) + ')';
        });
        document.body.classList.toggle('informe-ampliado', zoom > 1);
    }

    /** Guarda la escala de ajuste que acaba de calcular scalePreview y reaplica el zoom. */
    function tomarBase() {
        hojas().forEach(function (w) {
            var p = w.querySelector('.preview-page');
            if (!p) return;
            var m = /scale\(([\d.]+)\)/.exec(p.style.transform || '');
            w.dataset.base = m ? m[1] : '1';
        });
        aplicar();
    }

    function limitarDesplazamiento(w) {
        var p = w.querySelector('.preview-page');
        if (!p) return;
        var b = parseFloat(w.dataset.base || '1') || 1;
        var anchoVisible = w.clientWidth;
        var anchoHoja = p.offsetWidth * b * zoom;
        var altoVisible = w.clientHeight;
        var altoHoja = p.offsetHeight * b * zoom;
        var maxX = Math.max(0, (anchoHoja - anchoVisible) / 2);
        var maxY = Math.max(0, altoHoja - altoVisible);
        tx = Math.max(-maxX, Math.min(maxX, tx));
        ty = Math.max(-maxY, Math.min(0, ty));
    }

    // ---------------- gestos ----------------
    var dist0 = 0, zoom0 = 1, x0 = 0, y0 = 0, tx0 = 0, ty0 = 0, arrastrando = false;
    var ultimoToque = 0;

    function distancia(t) {
        var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function alTocar(e) {
        var w = e.target.closest ? e.target.closest('.preview-wrapper') : null;
        if (!w) return;
        wrapperActivo = w;

        if (e.touches.length === 2) {
            dist0 = distancia(e.touches); zoom0 = zoom; arrastrando = false;
            e.preventDefault();
        } else if (e.touches.length === 1) {
            var ahora = Date.now();
            if (ahora - ultimoToque < 300) {          // doble toque
                zoom = (zoom > 1) ? 1 : 2.5; tx = 0; ty = 0;
                limitarDesplazamiento(w); aplicar();
                e.preventDefault();
            }
            ultimoToque = ahora;
            if (zoom > 1) {
                arrastrando = true;
                x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; tx0 = tx; ty0 = ty;
            }
        }
    }

    function alMover(e) {
        if (!wrapperActivo) return;
        if (e.touches.length === 2 && dist0) {
            var f = distancia(e.touches) / dist0;
            zoom = Math.max(MIN, Math.min(MAX, zoom0 * f));
            limitarDesplazamiento(wrapperActivo);
            aplicar();
            e.preventDefault();
        } else if (arrastrando && e.touches.length === 1 && zoom > 1) {
            tx = tx0 + (e.touches[0].clientX - x0);
            ty = ty0 + (e.touches[0].clientY - y0);
            limitarDesplazamiento(wrapperActivo);
            aplicar();
            e.preventDefault();      // mientras está ampliado, el dedo desplaza la hoja
        }
    }

    function alSoltar(e) {
        if (e.touches.length === 0) { arrastrando = false; dist0 = 0; }
        if (zoom <= 1.02) { zoom = 1; tx = 0; ty = 0; aplicar(); }
    }

    /** Vuelve a 1x. Lo usa el botón atrás antes de plantear la salida. */
    function restablecer() {
        if (zoom === 1) return false;
        zoom = 1; tx = 0; ty = 0; aplicar();
        return true;
    }

    function iniciar() {
        var orig = window.scalePreview;
        if (typeof orig === 'function' && !orig.__conZoom) {
            var envuelta = function () {
                var r = orig.apply(this, arguments);
                tomarBase();
                return r;
            };
            envuelta.__conZoom = true;
            window.scalePreview = envuelta;
        }

        document.addEventListener('touchstart', alTocar, { passive: false });
        document.addEventListener('touchmove', alMover, { passive: false });
        document.addEventListener('touchend', alSoltar, { passive: false });
        document.addEventListener('touchcancel', alSoltar, { passive: false });

        window.ZoomInforme = {
            restablecer: restablecer,
            nivel: function () { return zoom; }
        };
        setTimeout(tomarBase, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
