/* Cámara con guía de encuadre.
 *
 * Antes, tocar una foto abría directamente el selector de archivos y el recorte
 * se hacía a ciegas (centrado automático). Ahora se ofrece "Tomar foto", que
 * abre la cámara mostrando EXACTAMENTE el área que va a quedar en el informe:
 * un círculo para la foto de perfil y un marco 3:5 para las evidencias.
 * Lo que queda fuera de la guía se ve oscurecido, así que no hay sorpresas.
 *
 * No toca la lógica existente: al final escribe en `uploadedImages[tipo]` y
 * actualiza las mismas previsualizaciones que `selectImage`, que es lo que
 * `integracion.js` lee al guardar (window.uploadedImages).
 *
 * La galería sigue disponible y usa el camino original intacto.
 */
(function () {
    'use strict';

    // Mismas medidas que cropImage() en index.html: no cambiar sin cambiar aquella
    var DESTINO = {
        profile: { w: 600, h: 600, formato: 'image/jpeg', calidad: 0.9, redondo: true },
        evid: { w: 600, h: 1000, formato: 'image/jpeg', calidad: 0.85, redondo: false }
    };

    var stream = null, capa = null, video = null, camaraFrontal = false, tipoActual = null;

    // Marcador de versión: sirve para comprobar desde consola qué copia del
    // archivo está sirviendo el Service Worker cuando algo no cuadra.
    window.CamaraInfo = { formatoPerfil: DESTINO.profile.formato, calidadPerfil: DESTINO.profile.calidad };

    function destinoDe(tipo) { return tipo === 'profile' ? DESTINO.profile : DESTINO.evid; }

    function hayCamara() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    // ---------- aplicar la foto ya recortada (mismo camino que selectImage) ----------
    function aplicarFoto(tipo, base64) {
        window.uploadedImages = window.uploadedImages || {};
        window.uploadedImages[tipo] = base64;

        var formImg = document.getElementById('img-' + tipo + '-preview');
        var formPh = document.getElementById('img-' + tipo + '-placeholder');
        if (formImg && formPh) {
            formImg.src = base64;
            formImg.classList.remove('hidden');
            formPh.classList.add('hidden');
        }
        if (tipo === 'profile') {
            var pImg = document.getElementById('prev-profile-photo');
            var pPh = document.getElementById('prev-profile-photo-ph');
            if (pImg && pPh) { pImg.src = base64; pImg.classList.remove('hidden'); pPh.classList.add('hidden'); }
        } else {
            var rImg = document.getElementById('prev-img-' + tipo);
            var rPh = document.getElementById('prev-img-' + tipo + '-ph');
            if (rImg && rPh) { rImg.src = base64; rImg.classList.remove('hidden'); rPh.classList.add('hidden'); }
        }
        if (typeof window.updatePreviewData === 'function') {
            try { window.updatePreviewData(); } catch (e) { /* la vista previa se refresca sola después */ }
        }
    }

    // ---------- recorte exacto de lo que muestra la guía ----------
    function capturar() {
        var d = destinoDe(tipoActual);
        var vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;

        // El vídeo se muestra con object-fit: cover dentro del marco de la guía.
        // Reproducimos ese mismo encuadre para que la foto salga igual a la guía.
        var marco = capa.querySelector('.cam-guia').getBoundingClientRect();
        var razonGuia = marco.width / marco.height;
        var razonVideo = vw / vh;
        var sw, sh, sx, sy;
        if (razonVideo > razonGuia) {
            sh = vh; sw = vh * razonGuia; sx = (vw - sw) / 2; sy = 0;
        } else {
            sw = vw; sh = vw / razonGuia; sx = 0; sy = (vh - sh) / 2;
        }

        var lienzo = document.createElement('canvas');
        lienzo.width = d.w; lienzo.height = d.h;
        var ctx = lienzo.getContext('2d');
        if (camaraFrontal) { // la selfie se ve en espejo: se corrige al guardar
            ctx.translate(d.w, 0); ctx.scale(-1, 1);
        }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, d.w, d.h);

        var base64 = d.calidad ? lienzo.toDataURL(d.formato, d.calidad) : lienzo.toDataURL(d.formato);
        cerrar();
        aplicarFoto(tipoActual, base64);
    }

    function cerrar() {
        if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
        if (capa) { capa.remove(); capa = null; }
        video = null;
        document.body.style.overflow = '';
    }

    function arrancarStream() {
        var restr = {
            video: {
                facingMode: camaraFrontal ? 'user' : { ideal: 'environment' },
                width: { ideal: 1920 }, height: { ideal: 1920 }
            },
            audio: false
        };
        return navigator.mediaDevices.getUserMedia(restr).then(function (s) {
            stream = s;
            video.srcObject = s;
            video.classList.toggle('cam-espejo', camaraFrontal);
            return video.play();
        });
    }

    function abrirCamara(tipo) {
        tipoActual = tipo;
        var d = destinoDe(tipo);

        capa = document.createElement('div');
        capa.className = 'cam-capa';
        capa.innerHTML =
            '<div class="cam-marco ' + (d.redondo ? 'cam-marco-1-1' : 'cam-marco-3-5') + '">' +
            '  <video class="cam-video" playsinline muted autoplay></video>' +
            '  <div class="cam-mascara' + (d.redondo ? ' cam-mascara-redonda' : '') + '"></div>' +
            '  <div class="cam-guia' + (d.redondo ? ' cam-guia-redonda' : '') + '"></div>' +
            '</div>' +
            '<div class="cam-ayuda">' + (d.redondo
                ? 'Encuadra el rostro dentro del círculo. Así queda en el informe.'
                : 'Lo que quede dentro del marco es lo que sale en el informe.') +
            '</div>' +
            '<div class="cam-barra">' +
            '  <button type="button" class="cam-sec" data-accion="cerrar" aria-label="Cancelar">' +
            '    <span class="material-symbols-outlined">close</span></button>' +
            '  <button type="button" class="cam-disparo" data-accion="disparar" aria-label="Tomar foto"></button>' +
            '  <button type="button" class="cam-sec" data-accion="girar" aria-label="Cambiar de cámara">' +
            '    <span class="material-symbols-outlined">cameraswitch</span></button>' +
            '</div>';

        document.body.appendChild(capa);
        document.body.style.overflow = 'hidden';
        video = capa.querySelector('.cam-video');

        capa.addEventListener('click', function (e) {
            var b = e.target.closest('[data-accion]');
            if (!b) return;
            var a = b.getAttribute('data-accion');
            if (a === 'cerrar') cerrar();
            else if (a === 'disparar') capturar();
            else if (a === 'girar') {
                camaraFrontal = !camaraFrontal;
                if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
                arrancarStream().catch(function () {
                    camaraFrontal = !camaraFrontal;   // esa cámara no existe: volvemos
                    arrancarStream().catch(fallo);
                });
            }
        });

        arrancarStream().catch(fallo);
    }

    function fallo(err) {
        cerrar();
        var msg = 'No se pudo abrir la cámara.';
        if (err && err.name === 'NotAllowedError') msg = 'Diste "bloquear" al permiso de cámara. Actívalo en los ajustes del sitio y vuelve a intentar.';
        else if (err && err.name === 'NotFoundError') msg = 'Este dispositivo no reporta ninguna cámara.';
        else if (location.protocol !== 'https:' && location.hostname !== 'localhost') msg = 'La cámara solo funciona sobre HTTPS.';
        alert(msg + '\n\nPuedes usar "Elegir de la galería".');
    }

    // ---------- hoja de opciones: Cámara o Galería ----------
    function preguntar(tipo, alElegirGaleria) {
        var hoja = document.createElement('div');
        hoja.className = 'cam-opciones';
        hoja.innerHTML =
            '<div class="cam-opciones-caja">' +
            '  <div class="cam-opciones-tit">' + (tipo === 'profile' ? 'Foto de perfil' : 'Evidencia') + '</div>' +
            '  <button type="button" class="cam-opcion" data-op="camara">' +
            '    <span class="material-symbols-outlined">photo_camera</span>' +
            '    <span><b>Tomar foto</b><small>Con guía de encuadre</small></span></button>' +
            '  <button type="button" class="cam-opcion" data-op="galeria">' +
            '    <span class="material-symbols-outlined">image</span>' +
            '    <span><b>Elegir de la galería</b><small>Recorte automático centrado</small></span></button>' +
            '  <button type="button" class="cam-opcion cam-opcion-cancelar" data-op="cancelar">Cancelar</button>' +
            '</div>';
        document.body.appendChild(hoja);

        hoja.addEventListener('click', function (e) {
            var b = e.target.closest('[data-op]');
            if (!b) { if (e.target === hoja) hoja.remove(); return; }
            var op = b.getAttribute('data-op');
            hoja.remove();
            if (op === 'camara') abrirCamara(tipo);
            else if (op === 'galeria') alElegirGaleria();
        });
    }

    // ---------- enganche con la app ----------
    function iniciar() {
        var original = window.selectImage;
        if (typeof original !== 'function' || original.__conCamara) return;

        var envuelta = function (tipo) {
            if (!hayCamara()) return original(tipo);           // sin cámara: como siempre
            preguntar(tipo, function () { original(tipo); });
        };
        envuelta.__conCamara = true;
        window.selectImage = envuelta;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
