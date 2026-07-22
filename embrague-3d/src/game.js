// ============================================================================
// game.js — Orquestador principal. Conecta integración, estado, escena, UI y
// niveles. Es el único módulo que conoce a todos los demás; el resto permanece
// desacoplado. Para pasar a producción basta cambiar la instancia del adaptador.
// ============================================================================

import { store } from './state.js';
import { Scoring } from './scoring.js';
import { SceneManager } from './scene.js';
import { UI } from './ui.js';
import { MODULE_ID, VEHICLE, NAMING, SCORING } from './config.js';
import { MockAdapter, PostMessageAdapter, TESOS_EVENT } from '../integration/adapter.js';
import { Level1 } from './levels/level1.js';
import { Level2 } from './levels/level2.js';
import { Level3 } from './levels/level3.js';

const LEVELS = [Level1, Level2, Level3];

class Game {
  constructor() {
    // --- Punto de intercambio de integración (ÚNICA línea que cambia) -----
    // Sandbox: MockAdapter. Producción: PostMessageAdapter(TESOS_ORIGIN).
    // El resto del juego sólo depende de la interfaz TesosAdapter, así que
    // esta elección no toca ninguna otra parte de la lógica.
    // El flag ?adapter=postmessage permite probar el modo embebido (ver
    // tesos-parent-demo.html).
    const usedPostMessage = new URLSearchParams(location.search).get('adapter') === 'postmessage';
    this.adapter = usedPostMessage ? new PostMessageAdapter('*') : new MockAdapter();
    this.scoring = new Scoring(this.adapter);
    this.ui = new UI();
    this.sceneManager = new SceneManager(this.ui.canvasWrap);

    this.currentLevel = null;
    this.selectedVehicle = VEHICLE.CAR;
  }

  async boot() {
    // 1) Identidad del usuario (postMessage TESOS_INIT / URL / mock).
    const user = await this.adapter.getUserContext();
    store.update({ user });
    this.ui.setUser(user.displayName);

    // 2) Aviso de "juego listo" por el contrato de eventos.
    this.adapter.ready();

    // 3) Listener local de demostración (NO es el mecanismo de emisión).
    document.addEventListener(TESOS_EVENT, (e) => {
      console.log('[TESOS_EVENT]', e.detail.type, e.detail.payload || '');
    });

    // 4) Pantalla de inicio: toggle carro/moto + botones.
    this._wireStartScreen();
  }

  _wireStartScreen() {
    const screen = this.ui.startScreen;
    screen.querySelectorAll('[data-vehicle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        screen.querySelectorAll('[data-vehicle]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedVehicle = btn.dataset.vehicle;
      });
    });
    // preselección carro
    screen.querySelector('[data-vehicle="car"]').classList.add('active');

    document.querySelector('#btn-start').addEventListener('click', () => this.start());
    document.querySelector('#btn-leaderboard-start').addEventListener('click', async () => {
      const rows = await this.adapter.getLeaderboard(MODULE_ID);
      this.ui.renderLeaderboard(rows, store.get().user);
    });
  }

  start() {
    const user = store.get().user; // se conserva a través del reset
    store.reset();
    store.update({ user, vehicleType: this.selectedVehicle });
    store.updateScore({ startedAt: Date.now() });
    this.ui.setUser(user?.displayName || 'Invitado');

    this.ui.hideStart();
    this.ui.showGame();
    this.sceneManager.start();
    this._startLevel(0);
  }

  _startLevel(index) {
    // Limpia el nivel anterior.
    if (this.currentLevel) this.currentLevel.teardown();

    const levelNum = index + 1;
    store.update({ currentLevel: levelNum });
    this.ui.setLevelProgress(levelNum);

    const naming = NAMING[store.get().vehicleType];

    // Captura de referencia para calcular el delta del nivel.
    this._levelStartScore = store.get().score.current;
    this._levelStartErrors = store.get().score.errors;
    this._levelStartTime = performance.now();

    const LevelClass = LEVELS[index];
    this.currentLevel = new LevelClass({
      container: this.ui.canvasWrap,
      scoring: this.scoring,
      ui: this.ui,
      naming,
      vehicleType: store.get().vehicleType,
      onComplete: () => this._finishLevel(index),
    });
    this.currentLevel.mount();
    this.sceneManager.setActive(this.currentLevel);
  }

  _finishLevel(index) {
    const levelNum = index + 1;

    // Bono genérico por completar el nivel (centralizado para todos).
    this.scoring.addPoints(SCORING.LEVEL_COMPLETE_BONUS);

    const s = store.get();
    const levelScore = s.score.current - this._levelStartScore;
    const levelErrors = s.score.errors - this._levelStartErrors;
    const durationMs = performance.now() - this._levelStartTime;

    const result = this.scoring.completeLevel({
      level: levelNum,
      levelScore,
      levelErrors,
      durationMs,
    });

    const isLast = index === LEVELS.length - 1;
    this.ui.showLevelResult(result, {
      isLast,
      onNext: () => {
        if (isLast) this._finishSession();
        else this._startLevel(index + 1);
      },
    });
  }

  async _finishSession() {
    this.sceneManager.stop();
    if (this.currentLevel) this.currentLevel.teardown();

    const session = this.scoring.completeSession();
    const leaderboard = await this.adapter.getLeaderboard(MODULE_ID);

    this.ui.showSessionResult(session, leaderboard, {
      onLeaderboard: () => {},
      onRestart: () => {
        // Reinicio limpio: vuelve a la pantalla de inicio.
        this.ui.startScreen.classList.remove('hidden');
        document.querySelector('#game').classList.add('hidden');
      },
    });
  }
}

// Arranque.
const game = new Game();
game.boot();

// Exponer para depuración manual en el sandbox (no es API pública).
window.__embragueGame = game;
