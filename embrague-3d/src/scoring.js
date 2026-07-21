// ============================================================================
// scoring.js — Lógica de puntaje y construcción de los payloads del contrato.
// Es el único lugar donde se arman LevelResult / SessionResult, garantizando
// que el esquema de la sección 8.2 se cumpla siempre. También canaliza los
// errores hacia el adaptador (evento ERROR_MADE).
// ============================================================================

import { MODULE_ID, MAX_SCORE, TOTAL_MAX_SCORE } from './config.js';
import { store } from './state.js';

export class Scoring {
  /** @param {{reportLevelResult:Function, reportSessionResult:Function, reportError:Function}} adapter */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /** Suma puntos al marcador global (no baja de 0 el acumulado del nivel). */
  addPoints(n) {
    const { score } = store.get();
    store.updateScore({ current: Math.max(0, score.current + n) });
  }

  /**
   * Registra un error: penaliza, incrementa el contador y emite ERROR_MADE.
   * @param {number} points  puntos a restar (positivo)
   * @param {number} level   nivel actual
   * @param {string} errorCode  código de ERROR_CODES
   */
  penalize(points, level, errorCode) {
    const { score } = store.get();
    store.updateScore({
      current: Math.max(0, score.current - points),
      errors: score.errors + 1,
    });
    this.adapter.reportError(level, errorCode);
  }

  /**
   * Cierra un nivel: construye el LevelResult con el esquema exacto, lo guarda
   * en el estado y lo reporta por el adaptador.
   * @returns {object} LevelResult
   */
  completeLevel({ level, levelScore, levelErrors, durationMs }) {
    const user = store.get().user || { userId: 'demo-user', displayName: 'Invitado' };
    const result = {
      userId: user.userId,
      moduleId: MODULE_ID,
      level,
      score: Math.round(levelScore),
      maxScore: MAX_SCORE[level],
      errors: levelErrors,
      durationMs: Math.round(durationMs),
      completedAt: new Date().toISOString(),
    };
    store.update((s) => ({ levelResults: [...s.levelResults, result] }));
    this.adapter.reportLevelResult(result);
    return result;
  }

  /**
   * Cierra la sesión completa: suma los niveles y reporta SessionResult.
   * @returns {object} SessionResult
   */
  completeSession() {
    const s = store.get();
    const user = s.user || { userId: 'demo-user', displayName: 'Invitado' };
    const totalScore = s.levelResults.reduce((acc, r) => acc + r.score, 0);
    const result = {
      userId: user.userId,
      displayName: user.displayName, // usado por el MockAdapter para el ranking
      moduleId: MODULE_ID,
      totalScore,
      totalMaxScore: TOTAL_MAX_SCORE,
      levelsCompleted: s.levelResults.length,
      completedAt: new Date().toISOString(),
    };
    this.adapter.reportSessionResult(result);
    return result;
  }
}
