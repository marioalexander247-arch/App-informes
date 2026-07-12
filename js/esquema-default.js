/* Esquema por defecto embebido — permite que la app funcione en el PRIMER arranque,
 * incluso sin haber configurado la API (local-first, no negociable #5).
 * Cuando la API responde `bootstrap`, estos datos se reemplazan por los del Sheet.
 *
 * MODELO MODULAR:
 *  - Un FORMATO define: qué módulos evalúa, el PESO de cada uno, su UMBRAL de
 *    aprobación (0.80, 0.90…) y qué módulos son ELIMINATORIOS.
 *  - Crear una prueba nueva (camión, carro 32 ítems, etc.) = filas de config, cero código. */
window.ESQUEMA_DEFAULT = {
  config: { umbralAprob: 0.80 },

  formatos: [
    { formato: 'CDA COMPLETO', umbral: 0.80, activo: true,
      modulos: [ { id: 'teoria', peso: 40 }, { id: 'moto', peso: 15 }, { id: 'motocarro', peso: 15 },
                 { id: 'cuatrimoto', peso: 15 }, { id: 'carro', peso: 15 } ],
      eliminatorios: ['moto', 'motocarro', 'cuatrimoto', 'carro'] },

    { formato: 'SOLO MOTO', umbral: 0.80, activo: true,
      modulos: [ { id: 'teoria', peso: 40 }, { id: 'moto', peso: 60 } ],
      eliminatorios: ['moto'] },

    { formato: 'SOLO CARRO', umbral: 0.80, activo: true,
      modulos: [ { id: 'teoria', peso: 40 }, { id: 'carro', peso: 60 } ],
      eliminatorios: ['carro'] },

    /* Plantilla del caso "solo carro corporativo": 32 ítems en 3 segmentos con pesos
     * 30/30/40 y umbral 90%. Está INACTIVA: renombra los ítems y ponla activo=true. */
    { formato: 'PLANTILLA CARRO 32', umbral: 0.90, activo: false,
      modulos: [ { id: 'carro_seg1', peso: 30 }, { id: 'carro_seg2', peso: 30 }, { id: 'carro_seg3', peso: 40 } ],
      eliminatorios: [] }
  ],

  modulos: {
    teoria:     { etiqueta: 'Evaluación Teórica' },
    moto:       { etiqueta: 'Moto' },
    motocarro:  { etiqueta: 'Motocarro' },
    cuatrimoto: { etiqueta: 'Cuatrimoto' },
    carro:      { etiqueta: 'Automóvil' },
    carro_seg1: { etiqueta: 'Carro · Segmento 1' },
    carro_seg2: { etiqueta: 'Carro · Segmento 2' },
    carro_seg3: { etiqueta: 'Carro · Segmento 3' }
  },

  esquemas: (function () {
    var e = [
      { modulo: 'teoria', campo: 'tecnicas',     etiqueta: 'Técnicas de Conducción', control: 'slider', max: 10, orden: 1, activo: true },
      { modulo: 'teoria', campo: 'normatividad', etiqueta: 'Normatividad',           control: 'slider', max: 10, orden: 2, activo: true },
      { modulo: 'teoria', campo: 'epp',          etiqueta: 'Elementos EPP',          control: 'slider', max: 5,  orden: 3, activo: true },
      { modulo: 'teoria', campo: 'mecanica',     etiqueta: 'Mecánica Básica',        control: 'slider', max: 5,  orden: 4, activo: true },

      { modulo: 'moto', campo: 'proyeccion',     etiqueta: 'Proyección',                           control: 'toggle', orden: 1, activo: true },
      { modulo: 'moto', campo: 'equilibrio',     etiqueta: 'Equilibrio',                           control: 'toggle', orden: 2, activo: true },
      { modulo: 'moto', campo: 'parqueo',        etiqueta: 'Parqueo',                              control: 'toggle', orden: 3, activo: true },
      { modulo: 'moto', campo: 'tecnicaApagado', etiqueta: 'Técnica moviendo el vehículo apagado', control: 'toggle', orden: 4, activo: true }
    ];
    ['motocarro', 'cuatrimoto', 'carro'].forEach(function (mod) {
      [['habilidades', 'Habilidades en pista'], ['proyeccion', 'Proyección'],
       ['parqueo', mod === 'carro' ? 'Técnica de parqueo' : 'Parqueo'],
       ['velocidad', 'Manejo a baja velocidad'], ['visoespacial', 'Adaptación visoespacial'],
       ['espejos', 'Uso correcto de espejos']].forEach(function (c, i) {
        e.push({ modulo: mod, campo: c[0], etiqueta: c[1], control: 'toggle', orden: i + 1, activo: true });
      });
    });
    // plantilla 32 ítems: 11 + 11 + 10 (renombra las etiquetas con tus ítems reales)
    [['carro_seg1', 11], ['carro_seg2', 11], ['carro_seg3', 10]].forEach(function (seg, si) {
      for (var i = 1; i <= seg[1]; i++) {
        e.push({ modulo: seg[0], campo: 'item' + i, etiqueta: 'Ítem ' + (si + 1) + '.' + i,
                 control: 'toggle', orden: i, activo: true });
      }
    });
    return e;
  })(),

  empresas: [
    { empresa: 'CDA LA LUNA',       logoUrl: '', ciudad: 'Santiago de Cali', activo: true },
    { empresa: 'CDA LA PLAYA S.A.', logoUrl: '', ciudad: 'Santiago de Cali', activo: true },
    { empresa: 'CDA YUMBO',         logoUrl: '', ciudad: 'Yumbo',            activo: true },
    { empresa: 'Tu Empresa SAS',    logoUrl: '', ciudad: 'Santiago de Cali', activo: true }
  ]
};
