/* Menú flotante "+" con efecto gooey (metaballs) y niveles.
 *
 * El efecto es el de la librería liquid-gooey de React, pero en CSS/JS puro:
 * esta app no usa React ni bundler, así que la librería no se puede importar.
 *
 * Dos decisiones importantes:
 *
 * 1) El filtro NO es `blur() + contrast()`. Ese truco sube el contraste del
 *    COLOR y destroza la paleta (el amarillo #f5ab1a saldría #ffff00). Aquí se
 *    usa un filtro SVG que sube el contraste solo del canal ALFA, así que los
 *    colores quedan intactos. El filtro vive en el HTML (#goo-filtro).
 *
 * 2) Cada botón lleva SU PROPIO círculo de fondo, además del blob que está
 *    detrás. Si el navegador no resuelve el filtro SVG, el menú sigue viéndose
 *    como botones redondos normales en vez de desaparecer. El goo es un extra,
 *    no un requisito.
 *
 * Estructura por niveles: el primer nivel son 3 categorías; al tocar una, los
 * satélites se transforman en las acciones de esa categoría y el botón central
 * pasa a ser "volver".
 */
(function () {
    'use strict';

    /* Un item con `hijos` baja de nivel; uno con `fn` ejecuta y cierra.
     * `etiquetaViva` permite que el texto cambie según el estado (el tema). */
    var MENU = {
        raiz: [
            { icono: 'edit_note',   etiqueta: 'Registro', hijos: 'registro' },
            { icono: 'search',      etiqueta: 'Buscar',   hijos: 'buscar' },
            { icono: 'description', etiqueta: 'Informe',  hijos: 'informe' },
            { icono: 'tune',        etiqueta: 'Ajustes',  hijos: 'ajustes' }
        ],
        registro: [
            { icono: 'note_add',    etiqueta: 'Nuevo',    fn: 'nuevoRegistro' },
            { icono: 'save',        etiqueta: 'Guardar',  fn: 'saveToDatabase' },
            { icono: 'mop',         etiqueta: 'Limpiar',  fn: 'resetForm' },
            { icono: 'delete',      etiqueta: 'Eliminar', fn: 'eliminarRegistro', soloEditando: true }
        ],
        buscar: [
            { icono: 'manage_search',  etiqueta: 'Buscar registro', fn: 'openSearch' },
            { icono: 'chevron_left',   etiqueta: 'Anterior',        fn: 'navigateRecords', arg: -1 },
            { icono: 'chevron_right',  etiqueta: 'Siguiente',       fn: 'navigateRecords', arg: 1 }
        ],
        informe: [
            { icono: 'visibility',  etiqueta: 'Vista previa', fn: 'switchView', arg: 'preview' },
            { icono: 'print',       etiqueta: 'Imprimir PDF', fn: 'printPreview' },
            { icono: 'qr_code_2',   etiqueta: 'Compartir',    fn: 'generateQR' }
        ],
        ajustes: [
            { fn: 'toggleTheme',
              icono: function () { return esOscuro() ? 'light_mode' : 'dark_mode'; },
              etiquetaViva: function () { return esOscuro() ? 'Modo claro' : 'Modo oscuro'; },
              mantenerAbierto: true },
            { icono: 'cloud',     etiqueta: 'Conexión a la nube', fn: 'abrirConfigNube' },
            { icono: 'qr_code_2', etiqueta: 'Conectar otro equipo', fn: 'generateQR' }
        ]
    };

    function esOscuro() { return document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'); }

    var SEPARACION = 64;   // px entre satélites apilados hacia arriba
    var abierto = false;
    var nivel = 'raiz';
    var raiz = null;

    function llamar(item) {
        var f = window[item.fn];
        if (typeof f !== 'function') { console.warn('[menu-gooey] falta la función', item.fn); return; }
        if (typeof item.arg !== 'undefined') f(item.arg); else f();
    }

    function pintarNivel() {
        var items = MENU[nivel] || MENU.raiz;
        var blobs = raiz.querySelectorAll('.goo-blob:not(.goo-blob-principal)');
        var btns = raiz.querySelectorAll('.goo-btn:not(.goo-principal)');

        var visibles = items.filter(function (it) {
            return !it.soloEditando || (window.editingId !== null && typeof window.editingId !== 'undefined');
        });

        for (var i = 0; i < btns.length; i++) {
            var it = visibles[i];
            var b = btns[i];
            if (!it) { b.style.display = 'none'; blobs[i].style.display = 'none'; continue; }
            b.style.display = ''; blobs[i].style.display = '';
            var ico = (typeof it.icono === 'function') ? it.icono() : it.icono;
            var txt = it.etiquetaViva ? it.etiquetaViva() : it.etiqueta;
            b.querySelector('.material-symbols-outlined').textContent = ico;
            b.querySelector('.goo-etiqueta').textContent = txt;
            b.setAttribute('aria-label', txt);
            b.__item = it;
        }

        var principal = raiz.querySelector('.goo-principal .material-symbols-outlined');
        principal.textContent = (nivel === 'raiz') ? 'add' : 'arrow_back';
        raiz.classList.toggle('goo-en-submenu', nivel !== 'raiz');
    }

    function alternar(forzar) {
        abierto = (typeof forzar === 'boolean') ? forzar : !abierto;
        if (!abierto) nivel = 'raiz';
        pintarNivel();
        raiz.classList.toggle('goo-abierto', abierto);
        var p = raiz.querySelector('.goo-principal');
        p.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    }

    /** Cierra un paso: del submenú vuelve a la raíz; de la raíz cierra el menú.
     *  Lo usa también el botón atrás del teléfono (js/salida.js). */
    function retroceder() {
        if (!abierto) return false;
        if (nivel !== 'raiz') { nivel = 'raiz'; pintarNivel(); return true; }
        alternar(false);
        return true;
    }

    function construir() {
        if (document.getElementById('goo-menu')) return;

        raiz = document.createElement('div');
        raiz.id = 'goo-menu';
        raiz.className = 'goo-menu';

        var capa = document.createElement('div');
        capa.className = 'goo-capa';
        capa.setAttribute('aria-hidden', 'true');

        var botones = document.createElement('div');
        botones.className = 'goo-botones';

        for (var i = 0; i < 4; i++) {
            var estilo = '--goo-y:' + (-(SEPARACION * (i + 1))) + 'px; --goo-retardo:' + (i * 45) + 'ms;';

            var blob = document.createElement('span');
            blob.className = 'goo-blob';
            blob.setAttribute('style', estilo);
            capa.appendChild(blob);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'goo-btn';
            btn.setAttribute('style', estilo);
            btn.innerHTML = '<span class="goo-etiqueta"></span><span class="material-symbols-outlined"></span>';
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var it = this.__item;
                if (!it) return;
                if (it.hijos) { nivel = it.hijos; pintarNivel(); }   // bajar de nivel
                else if (it.mantenerAbierto) { llamar(it); pintarNivel(); }  // p.ej. el tema: se ve el cambio al momento
                else { alternar(false); llamar(it); }
            });
            botones.appendChild(btn);
        }

        var blobP = document.createElement('span');
        blobP.className = 'goo-blob goo-blob-principal';
        capa.appendChild(blobP);

        var principal = document.createElement('button');
        principal.type = 'button';
        principal.className = 'goo-btn goo-principal';
        principal.setAttribute('aria-label', 'Acciones rápidas');
        principal.setAttribute('aria-expanded', 'false');
        principal.innerHTML = '<span class="material-symbols-outlined">add</span>';
        principal.addEventListener('click', function (e) {
            e.stopPropagation();
            if (abierto && nivel !== 'raiz') { nivel = 'raiz'; pintarNivel(); }  // volver
            else alternar();
        });
        botones.appendChild(principal);

        raiz.appendChild(capa);
        raiz.appendChild(botones);
        document.body.appendChild(raiz);
        pintarNivel();

        document.addEventListener('click', function () { if (abierto) alternar(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') retroceder(); });

        window.MenuGooey = { retroceder: retroceder, estaAbierto: function () { return abierto; } };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', construir);
    } else {
        construir();
    }
})();
