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
      eliminatorios: [] },

    /* Formatos RIDEPRO 2025 (PDF "Formato de Calificación Práctica C1" y "A2 360").
     * INACTIVOS ("Próximamente") hasta que Mario confirme pesos, umbral y si llevan
     * teoría. Los pesos/umbral de abajo son una PROPUESTA, no una regla acordada.
     * Ítems: control 'sino' = Sí/No/NA (NA no cuenta: se guarda fuera del módulo);
     * 'escala3' = 1 Malo · 2 Regular · 3 Bueno; 'mm' = labrado de llanta (dato, no nota). */
    { formato: 'AUTOMOVIL C1', umbral: 0.80, activo: false, totalItems: 75,
      modulos: [ { id: 'c1_preop', peso: 25 }, { id: 'c1_hyd', peso: 40 }, { id: 'c1_conducta', peso: 35 } ],
      eliminatorios: ['c1_hyd', 'c1_conducta'] },

    { formato: 'MOTO A2 360', umbral: 0.80, activo: false, totalItems: 29,
      modulos: [ { id: 'a2_epp', peso: 20 }, { id: 'a2_moto', peso: 30 }, { id: 'a2_hyd', peso: 50 } ],
      eliminatorios: ['a2_hyd'] }
  ],

  modulos: {
    teoria:     { etiqueta: 'Evaluación Teórica' },
    moto:       { etiqueta: 'Moto' },
    motocarro:  { etiqueta: 'Motocarro' },
    cuatrimoto: { etiqueta: 'Cuatrimoto' },
    carro:      { etiqueta: 'Automóvil' },
    carro_seg1: { etiqueta: 'Carro · Segmento 1' },
    carro_seg2: { etiqueta: 'Carro · Segmento 2' },
    carro_seg3: { etiqueta: 'Carro · Segmento 3' },
    c1_preop:    { etiqueta: 'Inspección preoperacional' },
    c1_hyd:      { etiqueta: 'Habilidad y destreza' },
    c1_conducta: { etiqueta: 'Comportamiento y conducta' },
    a2_epp:      { etiqueta: 'Elementos de protección' },
    a2_moto:     { etiqueta: 'Motocicleta' },
    a2_hyd:      { etiqueta: 'Habilidad y destreza' }
  },

  /* Datos del vehículo que piden los formatos RIDEPRO. Van dentro del JSON
   * `evaluacion.datosVehiculo` (no negociable #3: cero columnas nuevas). */
  datosVehiculo: {
    'AUTOMOVIL C1': [
      { campo: 'codigoServicio', etiqueta: 'Código del servicio' },
      { campo: 'placa', etiqueta: 'Placa vehículo' },
      { campo: 'marcaModelo', etiqueta: 'Marca / modelo' }
    ],
    'MOTO A2 360': [
      { campo: 'codigoServicio', etiqueta: 'Código de servicio' },
      { campo: 'placa', etiqueta: 'Placa' },
      { campo: 'marcaMoto', etiqueta: 'Marca moto' },
      { campo: 'marcaCasco', etiqueta: 'Marca casco' },
      { campo: 'certificacionCasco', etiqueta: 'Certificación casco', opciones: ['NTC', 'DOT', 'ECE'] },
      { campo: 'motoAutomatica', etiqueta: 'Moto automática', opciones: ['Sí', 'No'] },
      { campo: 'tipoCasco', etiqueta: 'Tipo de casco', opciones: ['Modular', 'Integral', 'Tipo Jet', 'Multipropósito', 'Off road'] },
      { campo: 'labradoDelantera', etiqueta: 'Labrado llanta delantera (mm)' },
      { campo: 'labradoTrasera', etiqueta: 'Labrado llanta trasera (mm)' }
    ]
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
    /* RIDEPRO C1 (B1-C1): 75 ítems Sí/No/NA. `n` = número del ítem en el PDF,
     * `grupo` = subtítulo del PDF (el informe resume por grupo). */
    var C1 = {
      c1_preop: [
        ['Inspección mecánica', ['Inspección nivel de aceite', 'Inspección de nivel refrigerante', 'Inspección aceite hidráulico',
          'Revisión de la estructura del vehículo', 'Inspección sistema de suspensión', 'Verificación de llantas',
          'Inspección llanta de repuesto', 'Verificación de luces y bocina', 'Verificación del estado de la batería y sus conexiones',
          'Verificación equipo de prevención y seguridad (Art. 30 C.N.T.)', 'Tablero de instrumentos, controles y testigos',
          'Verificación de tipo de combustible y nivel', 'Tecnología del vehículo']],
        ['Alistamiento del conductor', ['Ajusta los espejos o solicita el ajuste de los espejos', 'Ajusta su postura frente a los comandos',
          'Ajusta la columna de dirección adecuadamente', 'Fija o elimina los elementos sueltos en la cabina', 'Verifica la documentación del vehículo',
          'Utiliza el cinturón de seguridad', 'Verifica el cinturón de seguridad de los acompañantes',
          'Señaliza su salida y verifica espejos al iniciar la marcha', 'Enciende el vehículo oprimiendo el embrague']]
      ],
      c1_hyd: [
        ['Curvas', ['Reduce la velocidad antes del ingreso a la curva', 'Mantiene una velocidad reducida en la curva',
          'Reconoce las dimensiones del vehículo', 'Reduce velocidad con apoyo de la transmisión (caja de cambios)']],
        ['Estacionamiento - maniobra de reversa', ['Realiza detención programada', 'Señaliza su intención', 'Elige un lugar permitido',
          'Realiza la maniobra con velocidad reducida', 'Ingresa adecuadamente en reversa al área de parqueo']],
        ['Rebases', ['Confirma si es legal la maniobra', 'Evalúa la necesidad del rebase', 'Mantiene adecuada distancia con el vehículo delantero']],
        ['Riesgo trasero', ['Observa los espejos frecuentemente', 'Observa los espejos al realizar frenado de emergencia']],
        ['Uso de comandos', ['Utiliza el timón con ambas manos', 'Realiza un adecuado giro al timón', 'Acelera con sensibilidad',
          'Frena con sensibilidad', 'Realiza los cambios de marcha a RPM adecuadas', 'Emplea correctamente el embrague',
          'Emplea el freno de estacionamiento', 'Emplea una técnica adecuada para arrancar el vehículo en terreno plano',
          'Emplea una técnica adecuada para arrancar el vehículo en ascenso', 'Utiliza adecuadamente el freno de ahogo']]
      ],
      c1_conducta: [
        ['Riesgo delantero', ['Observa a larga distancia', 'Identifica factores de riesgo', 'Anticipa el comportamiento de los demás actores viales',
          'Se detiene de manera anticipada y progresiva', 'Mantiene adecuada distancia de seguimiento', 'Mantiene adecuada distancia al detenerse',
          'Evalúa efecto cortina respecto a vehículos detenidos sobre la vía']],
        ['Velocidad', ['Adecuada a las señales de tránsito', 'Adecuada al medio ambiente', 'Adecuada en el ingreso a las vías',
          'Adecuada en la salida de las vías']],
        ['Cambios de carril', ['Evalúa previamente el espacio e identifica a otros vehículos', 'La necesidad de cambiarse de carril es anticipada',
          'Señaliza su intención de cambio', 'Considera los puntos ciegos antes de cambiarse de carril (usa espejos de manera correcta)',
          'Adecúa su velocidad ante el cambio de carril']],
        ['Intersecciones', ['Se aproxima con velocidad reducida', 'Detiene el vehículo completamente ante la señal de PARE',
          'Observa antes de cruzar', 'Revisa los espejos para identificar riesgos', 'Aplica preferencia de paso a peatones']],
        ['Hábitos seguros', ['Se muestra tranquilo y descansado durante la práctica', 'Manifiesta experiencia general frente a la conducción',
          'Evita el uso de dispositivos electrónicos mientras conduce', 'Se muestra tolerante y paciente', 'Usa con criterio la bocina',
          'Atiende la señalización de las vías', 'Transmite en general seguridad', 'No manifiesta exceso de confianza']]
      ]
    };
    var n = 0;
    ['c1_preop', 'c1_hyd', 'c1_conducta'].forEach(function (mod) {
      C1[mod].forEach(function (g) {
        g[1].forEach(function (etq) {
          n++;
          e.push({ modulo: mod, campo: 'i' + n, n: n, grupo: g[0], etiqueta: etq, control: 'sino', na: true, orden: n, activo: true });
        });
      });
    });

    /* RIDEPRO A2 360 motos: 29 ítems. Los ítems 3 y 15 del PDF están redactados en
     * negativo ("Tiene abolladuras", "Fugas"); aquí se redactan en positivo para que
     * "Sí" siempre signifique CUMPLE, igual que la convención del PDF. */
    var A2 = [
      ['a2_epp', 'Casco', 'sino', ['Estado del visor', 'Estado de correa y broche', 'Sin abolladuras', 'Estado de cojinería', 'Talla de casco adecuada']],
      ['a2_epp', 'Protección del cuerpo', 'sino', ['Airbag', 'Rodilleras', 'Coderas', 'Guantes', 'Botas']],
      ['a2_moto', 'Llantas', 'sino', ['Llanta delantera (labrado)', 'Llanta trasera (labrado)']],
      ['a2_moto', 'Frenos y fugas', 'sino', ['Freno delantero', 'Freno trasero', 'Sin fugas']],
      ['a2_moto', 'Mandos', 'sino', ['Kit de arrastre', 'Espejos', 'Dirección y suspensión', 'Maniguetas y guayas', 'Bocina']],
      ['a2_moto', 'Luces', 'sino', ['Luz alta', 'Luz baja', 'Direccional delantera', 'Direccional trasera', 'Stop']],
      ['a2_hyd', 'Habilidad y destreza', 'escala3', ['Slalom', 'Proyección de la mirada', 'Frenado de emergencia', 'Evasión de obstáculos']]
    ];
    var NA_A2 = { 11: true, 12: true, 16: true };   // el PDF solo permite NA en estos
    n = 0;
    A2.forEach(function (g) {
      g[3].forEach(function (etq) {
        n++;
        var it = { modulo: g[0], campo: 'i' + n, n: n, grupo: g[1], etiqueta: etq, control: g[2], orden: n, activo: true };
        if (g[2] === 'escala3') it.max = 3;
        if (NA_A2[n]) it.na = true;
        e.push(it);
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
