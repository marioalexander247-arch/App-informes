/* Motor de aprobación GENERALIZADO — espejo exacto de apps-script/Aprobacion.gs (no negociable #6).
 *
 * Modelo: un servicio evalúa N módulos (segmentos). Cada módulo tiene ítems con
 * {nota, max} (un toggle es nota 0/1 con max 1). El % del módulo es Σnotas/Σmax.
 *
 *   - Módulos ELIMINATORIOS: si su % < umbral ⇒ REPROBADO directo (regla M11 del CDA).
 *   - Ponderado final = Σ(%módulo × peso) / Σpesos.  Cada formato define sus pesos.
 *   - Umbral POR FORMATO (80%, 90%, …), guardado en el snapshot del servicio.
 *
 * SIEMPRE calcula con los parámetros/máximos guardados dentro de `evaluacion`
 * (snapshot inmutable, no negociable #1), nunca con la config actual. */
(function (global) {
  'use strict';

  var EPS = 1e-9;

  /* Compatibilidad: convierte snapshots v1 (teoria/practica) al modelo de módulos,
   * garantizando que un informe viejo calcule idéntico para siempre. */
  function normalizar(evaluacion) {
    if (evaluacion.modulos) return evaluacion;
    var p1 = evaluacion.parametros || { umbralAprob: 0.8, pesoTeoria: 0.4, pesoPractica: 0.6 };
    var mods = {}, pesos = {}, eliminatorios = [];
    if (evaluacion.teoria) {
      mods.teoria = {};
      for (var c in evaluacion.teoria) mods.teoria[c] = { nota: Number(evaluacion.teoria[c].nota), max: Number(evaluacion.teoria[c].max) };
      pesos.teoria = Number(p1.pesoTeoria) * 100;
    }
    var vehs = Object.keys(evaluacion.practica || {});
    vehs.forEach(function (v) {
      mods[v] = {};
      for (var m in evaluacion.practica[v]) mods[v][m] = { nota: evaluacion.practica[v][m] === true ? 1 : 0, max: 1 };
      pesos[v] = (Number(p1.pesoPractica) * 100) / vehs.length;
      eliminatorios.push(v);
    });
    return { modulos: mods, parametros: { umbral: Number(p1.umbralAprob), pesos: pesos, eliminatorios: eliminatorios } };
  }

  function calcularResultado(evaluacionRaw) {
    var evaluacion = normalizar(evaluacionRaw);
    var p = evaluacion.parametros || {};
    var umbral = Number(p.umbral || 0.8);
    var pesos = p.pesos || {};
    var eliminatorios = p.eliminatorios || [];

    var modulos = [], sumaPonderada = 0, sumaPesos = 0;
    for (var id in evaluacion.modulos) {
      var items = evaluacion.modulos[id], sn = 0, sm = 0, n = 0;
      for (var campo in items) { sn += Number(items[campo].nota) || 0; sm += Number(items[campo].max) || 0; n++; }
      if (!n) continue;
      var pct = sm > 0 ? sn / sm : 1;
      var peso = pesos[id] != null ? Number(pesos[id]) : 1;
      var esElim = eliminatorios.indexOf(id) > -1;
      modulos.push({
        id: id, pct: pct, peso: peso, eliminatorio: esElim,
        aprobado: pct >= umbral - EPS, notas: sn, maximo: sm, items: n
      });
      sumaPonderada += pct * peso;
      sumaPesos += peso;
    }
    var total = sumaPesos > 0 ? sumaPonderada / sumaPesos : 1;

    var elimReprobados = modulos.filter(function (m) { return m.eliminatorio && !m.aprobado; });
    var aprobado = elimReprobados.length === 0 && total >= umbral - EPS;

    var detalle, pctStr = Math.round(total * 100) + '%', umbStr = Math.round(umbral * 100) + '%';
    if (elimReprobados.length) {
      detalle = 'REPROBADO – No alcanzó el ' + umbStr + ' requerido en: ' +
        elimReprobados.map(function (m) { return m.id.toUpperCase() + ' (' + Math.round(m.pct * 100) + '%)'; }).join(', ') + '.';
    } else if (!aprobado) {
      var bajos = modulos.filter(function (m) { return !m.aprobado; })
        .map(function (m) { return m.id.toUpperCase() + ' (' + Math.round(m.pct * 100) + '%)'; });
      detalle = 'REPROBADO – La calificación ponderada final (' + pctStr + ') no alcanzó el ' + umbStr + ' requerido' +
        (bajos.length ? '. Segmentos por debajo del umbral: ' + bajos.join(', ') : '') + '.';
    } else {
      detalle = 'APROBADO – Cumple los criterios de evaluación con una calificación final de ' + pctStr + '.';
    }

    return { resultado: aprobado ? 'APROBADO' : 'REPROBADO', detalle: detalle, total: total, umbral: umbral, modulos: modulos };
  }

  global.Aprobacion = { calcularResultado: calcularResultado, normalizar: normalizar };
})(typeof window !== 'undefined' ? window : this);
