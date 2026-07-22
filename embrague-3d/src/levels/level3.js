// ============================================================================
// level3.js — NIVEL 3: Práctica de transición y buenas prácticas.
// El alumno ejecuta la secuencia: soltar acelerador -> pisar/apretar embrague
// -> meter 1ª -> soltar embrague hasta el punto de contacto -> acelerar.
// Se detectan y penalizan los errores comunes con feedback visual:
//   · soltar embrague de golpe en 1ª  -> motor calado (stall)
//   · acelerar a fondo con embrague a mitad -> patinado / desgaste
//   · rodar con el embrague pisado -> pérdida de freno motor
// ============================================================================

import * as THREE from 'three';
import { makeStandardScene, makeCamera } from '../scene.js';
import { CLUTCH, ENGINE, SCORING } from '../config.js';
import { store } from '../state.js';
import { disposeScene } from './level1.js';

const STEPS = [
  { key: 'accel_off', hint: '1) Suelta el acelerador (déjalo en 0).' },
  { key: 'clutch_in', hint: '2) Pisa o aprieta el embrague a fondo (desacoplado).' },
  { key: 'gear_in',   hint: '3) Mete la <b>1ª</b> marcha.' },
  { key: 'biting',    hint: '4) Suelta el embrague <b>despacio</b> hasta la zona verde.' },
  { key: 'go',        hint: '5) Da gas y termina de soltar el embrague. ¡Avanza!' },
];

export class Level3 {
  constructor(ctx) {
    this.ctx = ctx;
    this.level = 3;
    this.done = false;
    this.stepIndex = 0;

    this.accel = 0;
    this.engagement = 0;    // embrague suelto=1, pisado=0
    this.lastEngagement = 0;
    this.gear = 0;          // 0 = N, 1 = 1ª
    this.speed = 0;
    this.rpm = ENGINE.IDLE_RPM;
    this.stalled = false;

    // temporizadores de detección de errores (debounce)
    this.slipTimer = 0;
    this.freeRollTimer = 0;
    this.wheelSpin = 0;
    this.shake = 0;
  }

  mount() {
    const { container, ui, naming } = this.ctx;
    this.scene = makeStandardScene();
    this.camera = makeCamera(container, { z: 7.5, y: 1.4, fov: 42 });
    this.camera.position.set(0, 1.4, 7.5);

    // Suelo con líneas que se desplazan (sensación de movimiento).
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    this.scene.add(ground);

    this.dashes = [];
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0x3a2c00 });
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.16), dashMat);
      d.position.set(-8 + i * 2.4, -0.88, 0);
      this.scene.add(d);
      this.dashes.push(d);
    }

    // Coche low-poly (caja + cabina + 4 ruedas). Sirve para carro y moto por igual
    // como "vehículo" ilustrativo; la nomenclatura del mando ya la fija el toggle.
    this.car = new THREE.Group();
    const bodyColor = this.ctx.vehicleType === 'motorcycle' ? 0xef4444 : 0x3b82f6;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.6, 1.1),
      new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.3, roughness: 0.5 })
    );
    body.position.y = 0.1;
    this.car.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.1, roughness: 0.3 })
    );
    cabin.position.set(-0.1, 0.55, 0);
    this.car.add(cabin);

    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 18);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.9 });
    [[-0.75, 0.62], [0.75, 0.62], [-0.75, -0.62], [0.75, -0.62]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, -0.28, z);
      this.car.add(w);
      this.wheels.push(w);
    });
    this.car.position.y = 0.1;
    this.scene.add(this.car);

    // Humo de motor calado (oculto hasta que se cala).
    this.smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x555, transparent: true, opacity: 0 })
    );
    this.smoke.position.set(-1.4, 0.4, 0.6);
    this.scene.add(this.smoke);

    // --- Controles -----------------------------------------------------------
    ui.clearControls();
    this._renderStep();

    this.gearRow = ui.addButtonRow({
      id: 'l3-gears',
      label: 'Caja de cambios',
      buttons: [{ label: 'N', value: 0 }, { label: '1ª', value: 1 }],
      onSelect: (v) => this._onGear(+v),
    });

    this.clutchSlider = ui.addSlider({
      id: 'l3-clutch',
      label: `${naming.clutchControl} · izq = a fondo`,
      min: 0, max: 1, step: 0.01, value: 0,
      valueFmt: (v) => (v < CLUTCH.BITING_MIN ? '🔵' : v <= CLUTCH.BITING_MAX ? '🟢' : '⚪'),
      onInput: (v) => this._onClutch(v),
    });

    this.accelSlider = ui.addSlider({
      id: 'l3-accel',
      label: naming.accel,
      min: 0, max: 1, step: 0.01, value: 0,
      valueFmt: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { this.accel = v; store.updateVehicle({ throttle: v }); },
    });

    store.updateVehicle({ gear: 0, clutchEngagement: 0, rpm: ENGINE.IDLE_RPM, speed: 0, stalled: false });
  }

  _renderStep() {
    const step = STEPS[Math.min(this.stepIndex, STEPS.length - 1)];
    this.ctx.ui.setMicrocopy(
      `Nivel 3 · Secuencia (${Math.min(this.stepIndex + 1, STEPS.length)}/${STEPS.length})`,
      step.hint
    );
  }

  _advanceIf(condition) {
    if (condition && this.stepIndex < STEPS.length - 1) {
      this.stepIndex++;
      this._renderStep();
    }
  }

  _onGear(v) {
    this.gear = v;
    store.updateVehicle({ gear: v });
    // paso 3: meter 1ª (sólo válido tras pisar embrague)
    if (v === 1 && this.stepIndex === 2 && this.engagement <= 0.15) {
      this._advanceIf(true);
    } else if (v === 1 && this.engagement > 0.3 && !this.stalled) {
      // meter cambio sin embrague: crujido / error de secuencia
      this.ctx.scoring.penalize(SCORING.L3_ERROR_PENALTY, this.level, 'wrong_sequence');
      this.ctx.ui.toast('¡Cranch! Mete el cambio con el embrague pisado', 'bad');
    }
  }

  _onClutch(v) {
    // Error: soltar el embrague de golpe en 1ª con poco gas -> se cala.
    const rising = v - this.lastEngagement;
    if (
      this.gear === 1 && !this.stalled &&
      rising > CLUTCH.ABRUPT_DELTA &&
      v > CLUTCH.BITING_MAX && this.accel < 0.2 && this.speed < 0.6
    ) {
      this._stall();
    }
    this.lastEngagement = v;
    this.engagement = v;
    store.updateVehicle({ clutchEngagement: v });

    // Recuperación tras calar: volver a pisar el embrague.
    if (this.stalled && v <= 0.1) {
      this.stalled = false;
      this.rpm = ENGINE.IDLE_RPM;
      store.updateVehicle({ stalled: false });
      this.ctx.ui.toast('Motor recuperado. Inténtalo de nuevo, más suave', 'info');
      this.stepIndex = 3; // vuelve al paso de soltar hasta el biting
      this._renderStep();
    }
  }

  _stall() {
    this.stalled = true;
    this.speed = 0;
    this.rpm = 0;
    this.shake = 0.35;
    store.updateVehicle({ stalled: true, speed: 0, rpm: 0 });
    this.ctx.scoring.penalize(SCORING.L3_ERROR_PENALTY, this.level, 'stall');
    this.ctx.ui.toast('💥 ¡Se caló el motor! Soltaste el embrague de golpe', 'bad', 2600);
  }

  update(dt) {
    if (!this.scene) return;

    // --- Avance de la secuencia ---
    if (this.stepIndex === 0) this._advanceIf(this.accel <= 0.1);
    else if (this.stepIndex === 1) this._advanceIf(this.engagement <= 0.1);
    // paso 2 (gear_in) se avanza en _onGear
    else if (this.stepIndex === 3) {
      const inBiting = this.engagement >= CLUTCH.BITING_MIN && this.engagement <= CLUTCH.BITING_MAX;
      this._advanceIf(inBiting);
    }

    const transfer = THREE.MathUtils.clamp(
      (this.engagement - CLUTCH.BITING_MIN) / (CLUTCH.BITING_MAX - CLUTCH.BITING_MIN), 0, 1
    );
    const inBiting = this.engagement >= CLUTCH.BITING_MIN && this.engagement <= CLUTCH.BITING_MAX;

    // --- Modelo simplificado de motor / velocidad ---
    if (!this.stalled) {
      const freeRpm = ENGINE.IDLE_RPM + this.accel * (ENGINE.MAX_RPM - ENGINE.IDLE_RPM);
      if (this.gear === 1 && transfer > 0) {
        // acoplado: el motor mueve el coche; RPM mezcla giro libre y arrastre de ruedas
        const wheelRpm = ENGINE.IDLE_RPM + this.speed * 60;
        this.rpm += ((freeRpm * (1 - transfer) + wheelRpm * transfer) - this.rpm) * Math.min(1, dt * 6);
        this.speed += (this.accel * transfer * 6 - this.speed * 0.6) * dt;
        // calado por arrastre: acoplado sin gas y sin inercia
        if (transfer > 0.6 && this.accel < 0.12 && this.speed < 0.4) this._stall();
      } else {
        // desacoplado o en N: motor gira libre, el coche rueda por inercia
        this.rpm += (freeRpm - this.rpm) * Math.min(1, dt * 6);
        this.speed = Math.max(0, this.speed - this.speed * 0.4 * dt);
      }
    }
    this.speed = Math.max(0, this.speed);

    // --- Detección de errores continuos ---
    // Patinado: acelerar fuerte con el embrague a mitad (en el biting).
    if (inBiting && this.accel > 0.7 && !this.stalled) {
      this.slipTimer += dt;
      if (this.slipTimer > 0.8) {
        this.slipTimer = -1.6; // debounce ~2.4s
        this.ctx.scoring.penalize(SCORING.L3_ERROR_PENALTY, this.level, 'clutch_slip');
        this.ctx.ui.toast('⚠️ Patinado del embrague: acabas de desgastarlo', 'bad', 2400);
      }
    } else if (this.slipTimer < 0) {
      this.slipTimer += dt; // recupera el debounce
    } else {
      this.slipTimer = 0;
    }

    // Pérdida de freno motor: rodar con el embrague pisado (desacoplado).
    if (this.speed > 1 && this.engagement < CLUTCH.BITING_MIN && !this.stalled) {
      this.freeRollTimer += dt;
      if (this.freeRollTimer > 1.5) {
        this.freeRollTimer = -2.5;
        this.ctx.scoring.penalize(SCORING.L3_ERROR_PENALTY, this.level, 'no_engine_brake');
        this.ctx.ui.toast('⚠️ Ruedas libres: pierdes el freno motor', 'bad', 2400);
      }
    } else if (this.freeRollTimer < 0) {
      this.freeRollTimer += dt;
    } else {
      this.freeRollTimer = 0;
    }

    // --- Animación 3D ---
    this.wheelSpin += this.speed * dt * 2;
    this.wheels.forEach((w) => (w.rotation.y = this.wheelSpin));
    // suelo desplazándose para dar sensación de avance
    this.dashes.forEach((d) => {
      d.position.x -= this.speed * dt * 2;
      if (d.position.x < -9) d.position.x += 19.2;
    });
    // sacudida al calar
    if (this.shake > 0) {
      this.car.position.x = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 0.8);
      this.smoke.material.opacity = Math.min(0.7, this.smoke.material.opacity + dt);
      this.smoke.position.y += dt * 0.4;
    } else {
      this.car.position.x = 0;
      if (this.smoke.material.opacity > 0) {
        this.smoke.material.opacity = Math.max(0, this.smoke.material.opacity - dt);
        if (this.smoke.material.opacity === 0) this.smoke.position.y = 0.4;
      }
    }

    const gearLabel = this.gear === 0 ? 'N' : '1ª';
    store.updateVehicle({ rpm: this.rpm, speed: this.speed });
    this.ctx.ui.updateHud({
      rpm: this.rpm, speed: this.speed * 6, gearLabel, forcePct: transfer * 100,
    });

    // --- Completar: coche en marcha con embrague ya soltado ---
    if (
      !this.done && this.stepIndex >= 4 &&
      this.gear === 1 && this.engagement > CLUTCH.BITING_MAX &&
      this.accel > 0.3 && this.speed > 1.2 && !this.stalled
    ) {
      this._complete();
    }
  }

  _complete() {
    this.done = true;
    // Bono propio del nivel (secuencia limpia). El bono genérico de "nivel
    // completado" lo añade game.js de forma centralizada.
    this.ctx.scoring.addPoints(SCORING.L3_SEQUENCE_BONUS);
    this.ctx.ui.toast('🏁 ¡Arrancaste sin calarlo! Secuencia dominada', 'good', 2600);
    this.ctx.onComplete();
  }

  teardown() {
    disposeScene(this.scene);
    this.scene = null;
  }
}
