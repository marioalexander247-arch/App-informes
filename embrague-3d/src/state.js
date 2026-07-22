// ============================================================================
// state.js — gameState: objeto plano y observable, ÚNICA fuente de verdad.
// Diseñado para migrar fácilmente a un store tipo Zustand: la forma del estado
// es serializable y las mutaciones pasan por setState() / update().
// ============================================================================

import { VEHICLE, ENGINE, TOTAL_MAX_SCORE } from './config.js';

/** Crea el estado inicial del juego. */
function createInitialState() {
  return {
    vehicleType: VEHICLE.CAR,
    currentLevel: 1,
    user: null, // TesosUserContext (lo rellena la capa de integración)
    vehicle: {
      rpm: ENGINE.IDLE_RPM,
      gear: 0,
      clutchEngagement: 1, // arranca acoplado (motor libre en punto muerto)
      speed: 0,
      stalled: false,
    },
    score: {
      current: 0,
      max: TOTAL_MAX_SCORE,
      errors: 0,
      startedAt: null, // timestamp de inicio de la sesión
    },
    // resultados por nivel acumulados durante la sesión
    levelResults: [],
  };
}

class Store {
  constructor() {
    this._state = createInitialState();
    /** @type {Set<Function>} */
    this._subscribers = new Set();
  }

  /** Devuelve el estado actual (no mutar directamente; usar update/setState). */
  get() {
    return this._state;
  }

  /** Suscribe. Devuelve función para desuscribir. */
  subscribe(fn) {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  /** Aplica un parche superficial o una función productora y notifica. */
  update(patchOrFn) {
    const patch =
      typeof patchOrFn === 'function' ? patchOrFn(this._state) : patchOrFn;
    this._state = { ...this._state, ...patch };
    this._notify();
  }

  /** Muta el sub-objeto vehicle y notifica. */
  updateVehicle(patch) {
    this._state.vehicle = { ...this._state.vehicle, ...patch };
    this._notify();
  }

  /** Muta el sub-objeto score y notifica. */
  updateScore(patch) {
    this._state.score = { ...this._state.score, ...patch };
    this._notify();
  }

  /** Reinicia todo (nueva partida). */
  reset() {
    this._state = createInitialState();
    this._notify();
  }

  _notify() {
    this._subscribers.forEach((fn) => fn(this._state));
  }
}

export const store = new Store();
