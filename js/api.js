/* Cliente de la API (Apps Script Web App).
 * Reglas anti-chicharrón (GUIA §5): POST con Content-Type text/plain (evita preflight CORS),
 * sin headers personalizados; el token SIEMPRE en el cuerpo/parámetros, nunca revisable en logs de URL
 * más allá de lo inevitable en GET (por eso los GET solo llevan token, nunca datos de personas). */
(function (global) {
  'use strict';

  function cfg() {
    return {
      url: localStorage.getItem('apiUrl') || '',
      token: localStorage.getItem('apiToken') || ''
    };
  }

  function configurada() { var c = cfg(); return !!(c.url && c.token); }

  function get(action, params) {
    var c = cfg();
    if (!c.url) return Promise.reject(new Error('API no configurada'));
    var q = new URLSearchParams(Object.assign({ action: action, token: c.token }, params || {}));
    return fetch(c.url + '?' + q.toString(), { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.error) throw new Error(j.error); return j; });
  }

  function post(action, body) {
    var c = cfg();
    if (!c.url) return Promise.reject(new Error('API no configurada'));
    var q = new URLSearchParams({ action: action, token: c.token });
    return fetch(c.url + '?' + q.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.error) throw new Error(j.error); return j; });
  }

  global.API = {
    configurada: configurada,
    guardarConfig: function (url, token) {
      localStorage.setItem('apiUrl', url.trim());
      localStorage.setItem('apiToken', token.trim());
    },
    bootstrap: function () { return get('bootstrap'); },
    pull: function (desde) { return get('pull', { desde: desde || '' }); },
    save: function (servicio) { return post('save', servicio); },
    upload: function (datos) { return post('upload', datos); } // {uuid, tipo, n, mime, base64}
  };
})(window);
