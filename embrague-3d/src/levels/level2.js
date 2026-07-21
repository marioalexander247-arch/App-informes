// ============================================================================
// level2.js — NIVEL 2: Relación de cambios (fuerza vs. velocidad).
// Concepto: para qué sirven las marchas. 1ª = engranaje grande = mucha fuerza,
// poca velocidad. Marchas altas = engranaje pequeño = poca fuerza, mucha
// velocidad. El alumno asocia marcha <-> situación en 3 rondas.
// ============================================================================

import * as THREE from 'three';
import { makeStandardScene, makeCamera } from '../scene.js';
import { GEARS, SCORING, ENGINE } from '../config.js';
import { store } from '../state.js';
import { disposeScene } from './level1.js';

// Situaciones de la ronda: qué marcha es correcta y por qué.
const SITUATIONS = [
  {
    prompt: 'Estás <b>detenido</b> y quieres <b>arrancar</b> el vehículo.',
    correct: [1],
    why: '1ª da la máxima fuerza para vencer la inercia y ponerte en marcha.',
  },
  {
    prompt: 'Subes una <b>cuesta muy empinada</b> y necesitas fuerza.',
    correct: [1, 2],
    why: 'Las marchas cortas (1ª/2ª) multiplican la fuerza para subir sin ahogarte.',
  },
  {
    prompt: 'Vas <b>rápido y en llano</b> por la autopista.',
    correct: [4, 5],
    why: 'Las marchas largas (4ª/5ª) dan velocidad con el motor tranquilo y ahorran combustible.',
  },
];

export class Level2 {
  constructor(ctx) {
    this.ctx = ctx;
    this.level = 2;
    this.done = false;
    this.roundIndex = 0;
    this.selectedGear = 1;
    this.spin = 0;
  }

  mount() {
    const { container, ui } = this.ctx;
    this.scene = makeStandardScene();
    this.camera = makeCamera(container, { z: 7, y: 0.6, fov: 45 });

    // Engranaje del motor (pequeño, fijo arriba-izquierda).
    this.engineGear = this._makeGear(0.7, 12, 0xf59e0b);
    this.engineGear.position.set(-1.7, 0.9, 0);
    this.scene.add(this.engineGear);

    // Engranaje conducido (tamaño variable según la marcha).
    this.drivenGear = null;
    this._buildDrivenGear(this.selectedGear);

    this.scene.add(this._label('MOTOR', -1.7, 2.0));

    ui.clearControls();
    this._renderRound();

    this.gearRow = ui.addButtonRow({
      id: 'gears',
      label: 'Elige la marcha',
      buttons: GEARS.filter((g) => g.gear >= 1).map((g) => ({ label: g.label, value: g.gear })),
      onSelect: (v) => this._onSelectGear(+v),
    });
    // Preselecciona 1ª visualmente.
    const first = this.gearRow.querySelector('.gbtn');
    if (first) first.classList.add('active');

    this.confirmBtn = ui.addButton({
      label: 'Confirmar elección',
      onClick: () => this._confirm(),
    });

    store.updateVehicle({ gear: this.selectedGear });
  }

  _renderRound() {
    const s = SITUATIONS[this.roundIndex];
    this.ctx.ui.setMicrocopy(
      `Nivel 2 · Ronda ${this.roundIndex + 1}/3`,
      `${s.prompt}<br><span class="mc-dim">Mira cómo cambian la fuerza y la velocidad, luego confirma.</span>`
    );
  }

  _onSelectGear(gear) {
    this.selectedGear = gear;
    this._buildDrivenGear(gear);
    store.updateVehicle({ gear });
    const g = GEARS[gear];
    // RPM ilustrativa: marchas cortas suben más de vueltas para la misma "situación".
    const rpm = ENGINE.IDLE_RPM + g.forcePct * 30;
    this.ctx.ui.updateHud({ rpm, speed: g.speedPct, gearLabel: g.label, forcePct: g.forcePct });
  }

  _confirm() {
    if (this.done) return;
    const s = SITUATIONS[this.roundIndex];
    const ok = s.correct.includes(this.selectedGear);
    if (ok) {
      this.ctx.scoring.addPoints(SCORING.L2_CORRECT_POINTS);
      this.ctx.ui.toast(`✅ ¡Correcto! ${s.why}`, 'good', 2600);
    } else {
      this.ctx.scoring.penalize(SCORING.L2_WRONG_PENALTY, this.level, 'wrong_gear');
      this.ctx.ui.toast(`❌ No ideal. ${s.why}`, 'bad', 2800);
    }

    this.roundIndex++;
    if (this.roundIndex >= SITUATIONS.length) {
      this._complete();
    } else {
      // reinicia selección a 1ª para la siguiente ronda
      this.selectedGear = 1;
      this._buildDrivenGear(1);
      this.gearRow.querySelectorAll('.gbtn').forEach((b, i) => b.classList.toggle('active', i === 0));
      this._renderRound();
    }
  }

  _complete() {
    this.done = true;
    // El bono por completar el nivel lo añade el orquestador (game.js) de forma
    // centralizada para todos los niveles; aquí sólo van los puntos propios.
    this.ctx.ui.toast('¡Entendiste las marchas! 🎉', 'good');
    this.ctx.onComplete();
  }

  update(dt) {
    if (!this.scene) return;
    const g = GEARS[this.selectedGear];
    this.spin += dt * 1.5;
    this.engineGear.rotation.z = -this.spin;
    if (this.drivenGear) {
      // velocidad inversa al tamaño (radio) -> ilustra fuerza vs. velocidad
      this.drivenGear.rotation.z = this.spin * (0.7 / this.drivenRadius);
    }
  }

  // Construye/reemplaza el engranaje conducido con radio según la marcha.
  _buildDrivenGear(gear) {
    if (this.drivenGear) {
      this.scene.remove(this.drivenGear);
      this.drivenGear.traverse((o) => o.geometry?.dispose());
    }
    const g = GEARS[gear];
    // 1ª -> radio grande (1.4), 5ª -> radio pequeño (0.55)
    const r = THREE.MathUtils.lerp(1.4, 0.55, (gear - 1) / 4);
    this.drivenRadius = r;
    const teeth = Math.max(10, Math.round(r * 16));
    const color = new THREE.Color().setHSL(0.58 - (gear - 1) * 0.04, 0.5, 0.55).getHex();
    this.drivenGear = this._makeGear(r, teeth, color);
    // se coloca engranando con el del motor (distancia entre centros = suma de radios)
    const cx = this.engineGear.position.x;
    const cy = this.engineGear.position.y;
    const d = 0.7 + r;
    this.drivenGear.position.set(cx + d * 0.62, cy - d * 0.78, 0);
    this.scene.add(this.drivenGear);
  }

  // Engranaje: cilindro + dientes (cajas) alrededor. Bajo poligonaje.
  _makeGear(radius, teeth, color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.35, 28),
      new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 })
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.28, radius * 0.28, 0.4, 16),
      new THREE.MeshStandardMaterial({ color: 0x1f2937 })
    );
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
    const toothGeo = new THREE.BoxGeometry(0.16, 0.22, 0.35);
    const toothMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const t = new THREE.Mesh(toothGeo, toothMat);
      t.position.set(Math.cos(a) * (radius + 0.08), Math.sin(a) * (radius + 0.08), 0);
      t.rotation.z = a;
      group.add(t);
    }
    return group;
  }

  _label(text, x, y) {
    const cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 64;
    const c = cvs.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.font = 'bold 34px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(text, 128, 44);
    const tex = new THREE.CanvasTexture(cvs);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    spr.position.set(x, y, 0);
    spr.scale.set(1.4, 0.35, 1);
    return spr;
  }

  teardown() {
    disposeScene(this.scene);
    this.scene = null;
  }
}
