// ============================================================================
// events.js — EventEmitter minimalista para desacoplar módulos.
// Se usa como bus interno del juego (UI <-> lógica <-> integración) sin que
// unos módulos importen a otros directamente.
// ============================================================================

export class EventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /** Suscribe un handler. Devuelve una función para desuscribir. */
  on(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this._listeners.get(type)?.delete(handler);
  }

  emit(type, payload) {
    this._listeners.get(type)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        // Un listener no debe romper a los demás.
        console.error(`[EventEmitter] listener de "${type}" falló:`, err);
      }
    });
  }
}

// Bus global del juego (una sola instancia compartida).
export const bus = new EventEmitter();
