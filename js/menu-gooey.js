/* Menú flotante "+" con efecto gooey (metaballs) para la barra inferior móvil.
 *
 * La idea del efecto es la misma que usa la librería liquid-gooey de React
 * (blur + contraste alto para que dos círculos se fundan al acercarse), pero
 * escrita en CSS/JS puro: esta app no usa React ni bundler, así que la
 * librería no se puede importar.
 *
 * Diferencia importante con el truco de `filter: blur() contrast()`:
 * ese contraste se aplica también al COLOR y destruye la paleta (el amarillo
 * #f5ab1a saldría amarillo puro). Aquí se usa un filtro SVG que sube el
 * contraste SOLO del canal alfa (la fila `0 0 0 18 -7` de feColorMatrix), así
 * que los colores de la app se respetan tal cual.
 *
 * Los íconos van en una capa aparte SIN filtrar: si estuvieran dentro del
 * filtro saldrían borrosos.
 */
(function () {
    'use strict';

    // x, y en píxeles respecto al botón principal; retardo del rebote en ms
    var ACCIONES = [
        { icono: 'search',      etiqueta: 'Buscar',  x: -66, y: 0,   retardo: 0,  fn: 'openSearch' },
        { icono: 'add',         etiqueta: 'Nuevo',   x: -47, y: -47, retardo: 45, fn: 'nuevoRegistro' },
        { icono: 'save',        etiqueta: 'Guardar', x: 0,   y: -66, retardo: 90, fn: 'saveToDatabase' }
    ];

    var abierto = false;
    var raiz = null;

    function llamar(nombre) {
        var f = window[nombre];
        if (typeof f === 'function') { f(); return true; }
        console.warn('[menu-gooey] no existe la función', nombre);
        return false;
    }

    function alternar(forzar) {
        abierto = (typeof forzar === 'boolean') ? forzar : !abierto;
        raiz.classList.toggle('goo-abierto', abierto);
        var principal = raiz.querySelector('.goo-principal');
        principal.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        principal.setAttribute('aria-label', abierto ? 'Cerrar acciones' : 'Acciones rápidas');
    }

    function construir() {
        if (document.getElementById('goo-menu')) return;

        // Filtro SVG (invisible) que produce la fusión entre círculos
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'goo-svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML =
            '<defs><filter id="goo-filtro">' +
            '<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="difuminado"/>' +
            '<feColorMatrix in="difuminado" mode="matrix" ' +
            'values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>' +
            '<feComposite in="SourceGraphic" in2="goo" operator="atop"/>' +
            '</filter></defs>';
        document.body.appendChild(svg);

        raiz = document.createElement('div');
        raiz.id = 'goo-menu';
        raiz.className = 'goo-menu';

        var capaBlobs = document.createElement('div');
        capaBlobs.className = 'goo-capa';
        capaBlobs.setAttribute('aria-hidden', 'true');

        var capaBotones = document.createElement('div');
        capaBotones.className = 'goo-botones';

        ACCIONES.forEach(function (a) {
            var estilo = '--goo-x:' + a.x + 'px; --goo-y:' + a.y + 'px; --goo-retardo:' + a.retardo + 'ms;';

            var blob = document.createElement('span');
            blob.className = 'goo-blob';
            blob.setAttribute('style', estilo);
            capaBlobs.appendChild(blob);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'goo-btn';
            btn.setAttribute('style', estilo);
            btn.setAttribute('aria-label', a.etiqueta);
            btn.title = a.etiqueta;
            btn.innerHTML = '<span class="material-symbols-outlined">' + a.icono + '</span>';
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                alternar(false);
                llamar(a.fn);
            });
            capaBotones.appendChild(btn);
        });

        // Blob y botón principal (siempre visibles)
        var blobP = document.createElement('span');
        blobP.className = 'goo-blob goo-blob-principal';
        capaBlobs.appendChild(blobP);

        var principal = document.createElement('button');
        principal.type = 'button';
        principal.className = 'goo-btn goo-principal';
        principal.setAttribute('aria-label', 'Acciones rápidas');
        principal.setAttribute('aria-expanded', 'false');
        principal.innerHTML = '<span class="material-symbols-outlined">add</span>';
        principal.addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
        capaBotones.appendChild(principal);

        raiz.appendChild(capaBlobs);
        raiz.appendChild(capaBotones);
        document.body.appendChild(raiz);

        // Cerrar al tocar fuera o con Escape
        document.addEventListener('click', function () { if (abierto) alternar(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && abierto) alternar(false); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', construir);
    } else {
        construir();
    }
})();
