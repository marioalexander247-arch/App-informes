// ============================================================================
// config.js — Fuente única de configuración del mini-juego "El Embrague".
// Todas las constantes ajustables (puntajes, penalizaciones, umbrales físicos,
// textos pedagógicos) viven aquí. No hay "números mágicos" repartidos por el
// código: si algo se quiere balancear, se toca sólo este archivo.
// ============================================================================

export const MODULE_ID = 'embrague-3d';

// --- Identidad del vehículo -------------------------------------------------
export const VEHICLE = {
  CAR: 'car',
  MOTORCYCLE: 'motorcycle',
};

// --- Física simplificada del embrague --------------------------------------
// clutchEngagement: 0 = totalmente desacoplado (pedal a fondo / maneta apretada)
//                   1 = totalmente acoplado (pedal/maneta suelto)
// El "punto de contacto" (biting point) es la banda donde los discos empiezan
// a rozar y transmitir movimiento gradual.
export const CLUTCH = {
  BITING_MIN: 0.35,     // inicio de la zona de contacto
  BITING_MAX: 0.60,     // fin de la zona de contacto
  BITING_SWEET: 0.475,  // centro ideal de la zona
  ABRUPT_DELTA: 0.14,   // cambio de acople por frame considerado "brusco"
};

// --- Motor ------------------------------------------------------------------
export const ENGINE = {
  IDLE_RPM: 800,
  MAX_RPM: 6000,
  STALL_RPM: 550,       // por debajo de esto en marcha acoplada -> se cala
  REDLINE_RPM: 5500,
};

// --- Relaciones de cambio (nivel 2 y 3) ------------------------------------
// ratio alto = mucha fuerza / poca velocidad. Índice 0 = punto muerto.
export const GEARS = [
  { gear: 0, label: 'N', ratio: 0,    forcePct: 0,   speedPct: 0   },
  { gear: 1, label: '1ª', ratio: 3.6, forcePct: 100, speedPct: 15  },
  { gear: 2, label: '2ª', ratio: 2.2, forcePct: 78,  speedPct: 35  },
  { gear: 3, label: '3ª', ratio: 1.5, forcePct: 58,  speedPct: 55  },
  { gear: 4, label: '4ª', ratio: 1.1, forcePct: 38,  speedPct: 78  },
  { gear: 5, label: '5ª', ratio: 0.8, forcePct: 22,  speedPct: 100 },
];

// --- Sistema de puntaje -----------------------------------------------------
export const SCORING = {
  LEVEL_COMPLETE_BONUS: 100,

  // Nivel 1: sostener el punto de contacto
  L1_HOLD_TARGET_S: 3.0,        // segundos que hay que sostener el biting point
  L1_HOLD_POINTS_PER_S: 20,     // puntos por segundo sostenido (hasta el target)
  L1_ABRUPT_PENALTY: 15,        // penalización por cruzar el biting de golpe

  // Nivel 2: asociar marcha <-> situación
  L2_CORRECT_POINTS: 50,
  L2_WRONG_PENALTY: 20,

  // Nivel 3: secuencia de transición
  L3_SEQUENCE_BONUS: 150,       // completar la secuencia sin errores
  L3_ERROR_PENALTY: 30,         // por cada error cometido en la secuencia
};

// maxScore por nivel — se reporta tal cual en LevelResult.maxScore.
export const MAX_SCORE = {
  1: SCORING.LEVEL_COMPLETE_BONUS + SCORING.L1_HOLD_TARGET_S * SCORING.L1_HOLD_POINTS_PER_S, // 160
  2: SCORING.LEVEL_COMPLETE_BONUS + SCORING.L2_CORRECT_POINTS * 3,                            // 250
  3: SCORING.LEVEL_COMPLETE_BONUS + SCORING.L3_SEQUENCE_BONUS,                                // 250
};

export const TOTAL_MAX_SCORE = MAX_SCORE[1] + MAX_SCORE[2] + MAX_SCORE[3];

// --- Códigos de error (para el evento ERROR_MADE) --------------------------
export const ERROR_CODES = {
  STALL: 'stall',                  // motor calado
  CLUTCH_SLIP: 'clutch_slip',      // patinado / desgaste prematuro
  NO_ENGINE_BRAKE: 'no_engine_brake', // rodar libre con embrague pisado
  ABRUPT_BITING: 'abrupt_biting',  // cruzar el punto de contacto de golpe
  WRONG_GEAR: 'wrong_gear',        // marcha equivocada para la situación
  WRONG_SEQUENCE: 'wrong_sequence',// paso de la secuencia fuera de orden
};

// --- Nomenclatura adaptada por vehículo (carro vs. moto) -------------------
// Nunca se mezclan mandos: el toggle inicial elige uno y todos los textos y
// controles se adaptan a partir de aquí.
export const NAMING = {
  [VEHICLE.CAR]: {
    vehicle: 'Carro',
    clutchControl: 'Pedal de embrague',
    clutchVerb: 'pisar',
    clutchShort: 'Embrague',
    accel: 'Acelerador',
    icon: '🚗',
  },
  [VEHICLE.MOTORCYCLE]: {
    vehicle: 'Moto',
    clutchControl: 'Maneta de embrague',
    clutchVerb: 'apretar',
    clutchShort: 'Maneta',
    accel: 'Acelerador (puño)',
    icon: '🏍️',
  },
};

// --- Rendimiento ------------------------------------------------------------
export const PERF = {
  MAX_PIXEL_RATIO: 2,
};
