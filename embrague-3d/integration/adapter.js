// ============================================================================
// integration/adapter.js — CAPA ADAPTADORA ÚNICA (contrato con Tesos Academy).
//
// El juego SÓLO depende de la interfaz TesosAdapter. Cambiar de MockAdapter
// (sandbox) a PostMessageAdapter (producción) NO requiere tocar la lógica del
// juego. Toda comunicación con el "exterior" pasa por aquí.
//
// Esquemas (documentados como JSDoc; equivalen a las interfaces TS del prompt):
//
//   TesosUserContext { userId, displayName, source: 'tesos-academy'|'sandbox' }
//
//   TesosEvent =
//     | { type: 'GAME_READY' }
//     | { type: 'LEVEL_COMPLETE',   payload: LevelResult }
//     | { type: 'SESSION_COMPLETE', payload: SessionResult }
//     | { type: 'ERROR_MADE',       payload: { level, errorCode } }
//
//   LevelResult   { userId, moduleId:'embrague-3d', level, score, maxScore,
//                   errors, durationMs, completedAt }
//   SessionResult { userId, moduleId:'embrague-3d', totalScore, totalMaxScore,
//                   levelsCompleted, completedAt }
//
//   interface TesosAdapter {
//     getUserContext(): Promise<TesosUserContext>;
//     reportLevelResult(result: LevelResult): void;
//     reportSessionResult(result: SessionResult): void;
//     getLeaderboard(moduleId): Promise<Array<{displayName, totalScore}>>;
//   }
// ============================================================================

import { MODULE_ID } from '../src/config.js';
import { bus } from '../src/events.js';

// Nombre del CustomEvent interno que se despacha en document para listeners
// locales (paneles, demos). NUNCA se usa console.log como mecanismo de emisión.
export const TESOS_EVENT = 'tesos:event';

const MOCK_USER = { userId: 'demo-user', displayName: 'Invitado' };
const LEADERBOARD_KEY = `tesos_leaderboard_${MODULE_ID}`;

// ----------------------------------------------------------------------------
// Utilidad compartida: emite un TesosEvent por los tres canales previstos.
//   1) window.parent.postMessage  -> la app padre (iframe)
//   2) CustomEvent en document    -> listeners locales del sandbox
//   3) bus.emit                   -> módulos internos del juego
// ----------------------------------------------------------------------------
function emitTesosEvent(evt) {
  // 1) hacia la app padre (si estamos embebidos). '*' por simplicidad de
  //    sandbox; en producción se restringe al origin de Tesos Academy.
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(evt, '*');
    }
  } catch (_) {
    /* cross-origin bloqueado: se ignora en sandbox */
  }
  // 2) hacia listeners locales
  document.dispatchEvent(new CustomEvent(TESOS_EVENT, { detail: evt }));
  // 3) hacia el bus interno
  bus.emit(evt.type, evt.payload);
}

// ----------------------------------------------------------------------------
// Resolución del usuario (orden de prioridad):
//   1) postMessage TESOS_INIT desde la app padre
//   2) parámetros de URL ?userId=&displayName=
//   3) usuario mock por defecto
// Se resuelve con una carrera corta: si en `waitMs` no llega TESOS_INIT, se
// cae al fallback de URL / mock.
// ----------------------------------------------------------------------------
function resolveUserContext({ waitMs = 400 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ctx) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve(ctx);
    };

    const onMessage = (e) => {
      const data = e.data;
      if (data && data.type === 'TESOS_INIT' && data.payload) {
        done({
          userId: data.payload.userId || MOCK_USER.userId,
          displayName: data.payload.displayName || MOCK_USER.displayName,
          source: 'tesos-academy',
        });
      }
    };

    window.addEventListener('message', onMessage);

    // Fallback tras la ventana de espera: URL params o mock.
    setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('userId');
      const displayName = params.get('displayName');
      if (userId) {
        done({
          userId,
          displayName: displayName || userId,
          source: 'tesos-academy',
        });
      } else {
        done({ ...MOCK_USER, source: 'sandbox' });
      }
    }, waitMs);
  });
}

// ============================================================================
// MockAdapter — implementación para el SANDBOX.
// Guarda/lee el leaderboard en localStorage (con semilla de datos mock) para
// poder ver y probar la UI de clasificación sin backend.
// ============================================================================
export class MockAdapter {
  constructor() {
    this._seedLeaderboard();
  }

  async getUserContext() {
    return resolveUserContext();
  }

  reportLevelResult(result) {
    emitTesosEvent({ type: 'LEVEL_COMPLETE', payload: result });
  }

  reportSessionResult(result) {
    // En el sandbox, además de emitir, guardamos la puntuación en el
    // leaderboard local para que la tabla refleje la partida recién jugada.
    this._pushToLeaderboard(result);
    emitTesosEvent({ type: 'SESSION_COMPLETE', payload: result });
  }

  reportError(level, errorCode) {
    emitTesosEvent({ type: 'ERROR_MADE', payload: { level, errorCode } });
  }

  ready() {
    emitTesosEvent({ type: 'GAME_READY' });
  }

  async getLeaderboard(moduleId) {
    const rows = this._readLeaderboard(moduleId);
    return rows
      .slice()
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
  }

  // --- helpers de leaderboard local ---------------------------------------
  _seedLeaderboard() {
    if (localStorage.getItem(LEADERBOARD_KEY)) return;
    const seed = [
      { displayName: 'Laura M.', totalScore: 540 },
      { displayName: 'Carlos R.', totalScore: 610 },
      { displayName: 'Ana P.', totalScore: 480 },
      { displayName: 'Diego S.', totalScore: 655 },
      { displayName: 'Sofía T.', totalScore: 520 },
    ];
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(seed));
  }

  _readLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
    } catch (_) {
      return [];
    }
  }

  _pushToLeaderboard(result) {
    const rows = this._readLeaderboard();
    const name = result.displayName || result.userId || 'Invitado';
    const existing = rows.find((r) => r.displayName === name);
    if (existing) {
      existing.totalScore = Math.max(existing.totalScore, result.totalScore);
    } else {
      rows.push({ displayName: name, totalScore: result.totalScore });
    }
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(rows));
  }
}

// ============================================================================
// PostMessageAdapter — STUB documentado para PRODUCCIÓN (embebido en Tesos).
//
// Misma interfaz que MockAdapter. En producción, Tesos Academy es la fuente de
// verdad del ranking: getLeaderboard hace un request al padre (postMessage
// con correlación por id) y espera la respuesta. reportLevelResult /
// reportSessionResult sólo emiten el evento hacia el padre; NO persisten nada
// localmente. Basta reemplazar la instancia del adaptador en game.js:
//
//     const adapter = new PostMessageAdapter(TESOS_ORIGIN);
//
// ...sin tocar el resto del juego.
// ============================================================================
export class PostMessageAdapter {
  /** @param {string} targetOrigin origin exacto de Tesos Academy. */
  constructor(targetOrigin = '*') {
    this.targetOrigin = targetOrigin;
    this._pending = new Map(); // correlación de respuestas del padre
    window.addEventListener('message', (e) => this._onMessage(e));
  }

  async getUserContext() {
    // Idéntica prioridad (postMessage TESOS_INIT / URL / mock).
    return resolveUserContext();
  }

  reportLevelResult(result) {
    this._post({ type: 'LEVEL_COMPLETE', payload: result });
  }

  reportSessionResult(result) {
    this._post({ type: 'SESSION_COMPLETE', payload: result });
  }

  reportError(level, errorCode) {
    this._post({ type: 'ERROR_MADE', payload: { level, errorCode } });
  }

  ready() {
    this._post({ type: 'GAME_READY' });
  }

  async getLeaderboard(moduleId) {
    // Solicita el ranking al padre y espera su respuesta correlacionada.
    const requestId = `lb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      this._pending.set(requestId, resolve);
      this._post({ type: 'GET_LEADERBOARD', payload: { moduleId, requestId } });
      // Timeout defensivo: si el padre no responde, devolvemos vacío.
      setTimeout(() => {
        if (this._pending.has(requestId)) {
          this._pending.delete(requestId);
          resolve([]);
        }
      }, 3000);
    });
  }

  _post(evt) {
    try {
      window.parent?.postMessage(evt, this.targetOrigin);
    } catch (err) {
      console.error('[PostMessageAdapter] postMessage falló:', err);
    }
    // También despachamos el CustomEvent interno para listeners locales.
    document.dispatchEvent(new CustomEvent(TESOS_EVENT, { detail: evt }));
    bus.emit(evt.type, evt.payload);
  }

  _onMessage(e) {
    if (this.targetOrigin !== '*' && e.origin !== this.targetOrigin) return;
    const data = e.data;
    if (data && data.type === 'LEADERBOARD_DATA' && data.payload?.requestId) {
      const resolve = this._pending.get(data.payload.requestId);
      if (resolve) {
        this._pending.delete(data.payload.requestId);
        resolve(data.payload.rows || []);
      }
    }
  }
}
