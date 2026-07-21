// ============================================================================
// ui.js — Capa de UI (DOM). Sliders, botones, tacómetro, velocímetro, panel de
// microcopy, toasts de feedback, overlays de fin de nivel y leaderboard.
// No conoce Three.js ni la lógica de puntaje: sólo pinta y expone controles.
// Los niveles construyen sus controles llamando a los factories de aquí.
// ============================================================================

import { ENGINE } from './config.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor() {
    this.startScreen = $('#start-screen');
    this.topbar = $('#topbar');
    this.hud = $('#hud');
    this.controls = $('#controls');
    this.microcopy = $('#microcopy');
    this.levelOverlay = $('#level-overlay');
    this.leaderboardOverlay = $('#leaderboard-overlay');
    this.canvasWrap = $('#canvas-wrap');

    // Referencias de HUD
    this.elLevel = $('#level-progress');
    this.elUser = $('#hud-user');
    this.elRpmBar = $('#rpm-bar');
    this.elRpmVal = $('#rpm-val');
    this.elSpeedVal = $('#speed-val');
    this.elGearVal = $('#gear-val');
    this.elForceBar = $('#force-bar');

    this._toastTimer = null;
  }

  // --- Pantallas / overlays -------------------------------------------------
  hideStart() { this.startScreen.classList.add('hidden'); }
  showGame() { $('#game').classList.remove('hidden'); }

  setUser(displayName) { this.elUser.textContent = displayName; }
  setLevelProgress(n, total = 3) { this.elLevel.textContent = `Nivel ${n}/${total}`; }

  // --- Panel de microcopy pedagógico ---------------------------------------
  setMicrocopy(title, text) {
    this.microcopy.innerHTML = `
      <div class="mc-title">${title}</div>
      <div class="mc-text">${text}</div>`;
  }

  // --- HUD: tacómetro, velocidad, marcha, fuerza ---------------------------
  updateHud({ rpm = 0, speed = 0, gearLabel = 'N', forcePct = 0 } = {}) {
    if (this.elRpmVal) this.elRpmVal.textContent = Math.round(rpm);
    if (this.elRpmBar) {
      const pct = Math.max(0, Math.min(100, (rpm / ENGINE.MAX_RPM) * 100));
      this.elRpmBar.style.width = pct + '%';
      this.elRpmBar.classList.toggle('redline', rpm >= ENGINE.REDLINE_RPM);
    }
    if (this.elSpeedVal) this.elSpeedVal.textContent = Math.round(speed);
    if (this.elGearVal) this.elGearVal.textContent = gearLabel;
    if (this.elForceBar) {
      this.elForceBar.style.width = Math.max(0, Math.min(100, forcePct)) + '%';
    }
  }

  // --- Toast de feedback ----------------------------------------------------
  toast(msg, kind = 'info', ms = 1800) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `toast show ${kind}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (t.className = 'toast'), ms);
  }

  // --- Zona de controles (factories) ---------------------------------------
  clearControls() { this.controls.innerHTML = ''; }

  /** Slider táctil. onInput(value:number). Devuelve el <input>. */
  addSlider({ id, label, min = 0, max = 1, step = 0.01, value = 0, onInput, valueFmt }) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl slider-ctrl';
    wrap.innerHTML = `
      <div class="ctrl-label"><span>${label}</span><output id="${id}-out"></output></div>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">`;
    this.controls.appendChild(wrap);
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    const render = (v) => { out.textContent = valueFmt ? valueFmt(+v) : ''; };
    input.addEventListener('input', () => { render(input.value); onInput?.(+input.value); });
    render(value);
    return input;
  }

  /** Fila de botones (p.ej. selector de marcha). onSelect(value). */
  addButtonRow({ id, label, buttons, onSelect }) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl button-row-ctrl';
    wrap.innerHTML = `<div class="ctrl-label"><span>${label}</span></div>`;
    const row = document.createElement('div');
    row.className = 'button-row';
    if (id) row.id = id;
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'gbtn';
      btn.textContent = b.label;
      btn.dataset.value = b.value;
      btn.addEventListener('click', () => {
        row.querySelectorAll('.gbtn').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        onSelect?.(b.value, btn);
      });
      row.appendChild(btn);
    });
    wrap.appendChild(row);
    this.controls.appendChild(wrap);
    return row;
  }

  /** Botón de acción suelto. */
  addButton({ label, onClick, variant = 'primary' }) {
    const btn = document.createElement('button');
    btn.className = `action-btn ${variant}`;
    btn.textContent = label;
    btn.addEventListener('click', () => onClick?.(btn));
    this.controls.appendChild(btn);
    return btn;
  }

  // --- Overlay de fin de nivel ---------------------------------------------
  showLevelResult(result, { isLast, onNext }) {
    const secs = (result.durationMs / 1000).toFixed(1);
    this.levelOverlay.innerHTML = `
      <div class="overlay-card">
        <div class="ov-emoji">${result.errors === 0 ? '🌟' : '✅'}</div>
        <h2>Nivel ${result.level} completado</h2>
        <div class="stat-grid">
          <div><b>${result.score}</b><span>puntos</span></div>
          <div><b>${result.maxScore}</b><span>máximo</span></div>
          <div><b>${result.errors}</b><span>errores</span></div>
          <div><b>${secs}s</b><span>tiempo</span></div>
        </div>
        <button class="action-btn primary" id="ov-next">
          ${isLast ? 'Ver resultados' : 'Siguiente nivel →'}
        </button>
      </div>`;
    this.levelOverlay.classList.remove('hidden');
    $('#ov-next').addEventListener('click', () => {
      this.levelOverlay.classList.add('hidden');
      onNext?.();
    }, { once: true });
  }

  // --- Overlay de fin de sesión + leaderboard ------------------------------
  showSessionResult(session, leaderboard, { onLeaderboard, onRestart }) {
    const pct = Math.round((session.totalScore / session.totalMaxScore) * 100);
    this.levelOverlay.innerHTML = `
      <div class="overlay-card">
        <div class="ov-emoji">🏁</div>
        <h2>¡Sesión completa!</h2>
        <p class="ov-big">${session.totalScore} <small>/ ${session.totalMaxScore}</small></p>
        <div class="ring" style="--pct:${pct}"><span>${pct}%</span></div>
        <p class="ov-sub">${session.levelsCompleted} niveles completados</p>
        <button class="action-btn primary" id="ov-lb">Ver clasificación</button>
        <button class="action-btn ghost" id="ov-restart">Jugar de nuevo</button>
      </div>`;
    this.levelOverlay.classList.remove('hidden');
    $('#ov-lb').addEventListener('click', () => {
      this.renderLeaderboard(leaderboard, session);
      onLeaderboard?.();
    });
    $('#ov-restart').addEventListener('click', () => {
      this.levelOverlay.classList.add('hidden');
      onRestart?.();
    });
  }

  renderLeaderboard(rows, session) {
    // Ordena por puntaje sólo para PRESENTACIÓN (medallas/posición); el juego
    // no calcula ni persiste el ranking, sólo lo muestra de forma consistente
    // sea cual sea el adaptador que entregue las filas.
    const list = [...rows]
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((r, i) => {
        const me = session && r.displayName === session.displayName ? ' me' : '';
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        return `<li class="lb-row${me}"><span class="lb-pos">${medal}</span>
          <span class="lb-name">${r.displayName}</span>
          <span class="lb-score">${r.totalScore}</span></li>`;
      })
      .join('');
    this.leaderboardOverlay.innerHTML = `
      <div class="overlay-card">
        <div class="ov-emoji">🏆</div>
        <h2>Clasificación</h2>
        <ol class="lb-list">${list || '<li>Sin datos aún</li>'}</ol>
        <button class="action-btn primary" id="lb-close">Cerrar</button>
      </div>`;
    this.leaderboardOverlay.classList.remove('hidden');
    $('#lb-close').addEventListener('click', () => {
      this.leaderboardOverlay.classList.add('hidden');
    }, { once: true });
  }
}
