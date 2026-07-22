// ============================================================================
// level1.js — NIVEL 1: Fundamentos y punto de contacto (biting point).
// Concepto: acoplar vs. desacoplar la fuerza del motor hacia las ruedas.
// Interacción: un slider (pedal / maneta). El alumno debe encontrar y SOSTENER
// el punto de contacto (zona resaltada en verde con leve vibración).
// ============================================================================

import * as THREE from 'three';
import { makeStandardScene, makeCamera } from '../scene.js';
import { CLUTCH, ENGINE, SCORING } from '../config.js';
import { store } from '../state.js';

const COLORS = {
  flywheel: 0x9aa4b2,
  disc: 0x6b7280,
  bitingEmissive: 0x22c55e, // verde = punto de contacto
  shaft: 0x4b5563,
  wheel: 0x1f2937,
};

export class Level1 {
  constructor(ctx) {
    this.ctx = ctx;              // { container, scoring, ui, naming, vehicleType, onComplete }
    this.level = 1;
    this.done = false;
    this.holdTime = 0;
    this.engagement = 0;        // 0 = desacoplado
    this.lastEngagement = 0;
    this.wasInBiting = false;
    this.flyAngle = 0;
    this.transAngle = 0;
  }

  mount() {
    const { container, ui, naming } = this.ctx;
    this.scene = makeStandardScene();
    this.camera = makeCamera(container, { z: 6.5, y: 1.2, fov: 45 });

    // Volante de inercia / disco de motor (siempre gira)
    const flyGeo = new THREE.CylinderGeometry(1, 1, 0.3, 40);
    this.flywheel = new THREE.Mesh(
      flyGeo,
      new THREE.MeshStandardMaterial({ color: COLORS.flywheel, metalness: 0.6, roughness: 0.4 })
    );
    this.flywheel.rotation.z = Math.PI / 2; // eje a lo largo de X
    this.flywheel.position.x = -1.5;
    this._addSpokes(this.flywheel, 1, 0x3b424d);
    this.scene.add(this.flywheel);

    // Disco de embrague (se acerca/aleja según el acople)
    const discGeo = new THREE.CylinderGeometry(0.82, 0.82, 0.22, 36);
    this.disc = new THREE.Mesh(
      discGeo,
      new THREE.MeshStandardMaterial({
        color: COLORS.disc, metalness: 0.5, roughness: 0.5,
        emissive: COLORS.bitingEmissive, emissiveIntensity: 0,
      })
    );
    this.disc.rotation.z = Math.PI / 2;
    this._addSpokes(this.disc, 0.82, 0x2b313a);
    this.scene.add(this.disc);

    // Eje de transmisión + rueda a la derecha
    const shaftGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 20);
    this.shaft = new THREE.Mesh(
      shaftGeo,
      new THREE.MeshStandardMaterial({ color: COLORS.shaft, metalness: 0.6, roughness: 0.4 })
    );
    this.shaft.rotation.z = Math.PI / 2;
    this.shaft.position.x = 0.8;
    this.scene.add(this.shaft);

    const wheelGeo = new THREE.TorusGeometry(0.7, 0.22, 12, 30);
    this.wheel = new THREE.Mesh(
      wheelGeo,
      new THREE.MeshStandardMaterial({ color: COLORS.wheel, metalness: 0.2, roughness: 0.8 })
    );
    this.wheel.position.x = 2.0;
    this.scene.add(this.wheel);

    // Etiquetas flotantes (motor / ruedas) como sprites de texto
    this.scene.add(this._label('MOTOR', -1.5, -1.4));
    this.scene.add(this._label('RUEDAS', 2.0, -1.4));

    // --- Controles: un solo slider adaptado al vehículo --------------------
    ui.clearControls();
    ui.setMicrocopy(
      `Nivel 1 · Punto de contacto`,
      `Mueve el ${naming.clutchControl.toLowerCase()}. Al ${naming.clutchVerb}lo, los discos se separan y el motor gira libre. Súltalo despacio hasta la <b>zona verde</b>: ahí empieza a moverse el carro. ¡Sostén ahí!`
    );

    this.slider = ui.addSlider({
      id: 'clutch',
      label: `${naming.clutchControl} — súltalo despacio`,
      min: 0, max: 1, step: 0.01, value: 0,
      valueFmt: (v) => this._engagementLabel(v),
      onInput: (v) => this._onClutch(v),
    });

    // arranca desacoplado
    store.updateVehicle({ clutchEngagement: 0, gear: 1, rpm: ENGINE.IDLE_RPM, speed: 0 });
  }

  _onClutch(v) {
    // Detección de cruce brusco del punto de contacto (penaliza una vez).
    const delta = Math.abs(v - this.lastEngagement);
    const crossedBiting =
      (this.lastEngagement < CLUTCH.BITING_MIN && v > CLUTCH.BITING_MAX) ||
      (this.lastEngagement > CLUTCH.BITING_MAX && v < CLUTCH.BITING_MIN);
    if (delta > CLUTCH.ABRUPT_DELTA && crossedBiting && !this.done) {
      this.ctx.scoring.penalize(SCORING.L1_ABRUPT_PENALTY, this.level, 'abrupt_biting');
      this.ctx.ui.toast('¡Muy brusco! Suelta más despacio', 'bad');
    }
    this.lastEngagement = v;
    this.engagement = v;
    store.updateVehicle({ clutchEngagement: v });
  }

  update(dt) {
    if (!this.scene) return;
    const e = this.engagement;

    // Motor siempre gira (idle). El disco de embrague se acerca al girar acoplado.
    const flySpeed = 3.2;
    this.flyAngle += flySpeed * dt;
    this.flywheel.rotation.x = this.flyAngle;

    // Transferencia de movimiento (0 fuera del biting, 1 acoplado).
    const transfer = THREE.MathUtils.clamp(
      (e - CLUTCH.BITING_MIN) / (CLUTCH.BITING_MAX - CLUTCH.BITING_MIN), 0, 1
    );
    this.transAngle += flySpeed * transfer * dt;
    this.disc.rotation.x = this.transAngle;
    this.shaft.rotation.x = this.transAngle;
    this.wheel.rotation.z = this.transAngle;

    // Posición del disco: acoplado (e=1) -> pegado al volante; suelto (e=0) -> separado.
    const gap = (1 - e) * 0.7;
    this.disc.position.x = -0.9 + gap;

    // Punto de contacto: resaltado verde + leve vibración.
    const inBiting = e >= CLUTCH.BITING_MIN && e <= CLUTCH.BITING_MAX;
    if (inBiting) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
      this.disc.material.emissiveIntensity = 0.35 + 0.5 * pulse;
      this.disc.position.y = (Math.random() - 0.5) * 0.03; // vibración sutil
      this.flywheel.position.y = (Math.random() - 0.5) * 0.02;

      // Puntaje: sostener el punto de contacto.
      if (!this.done) {
        const remaining = SCORING.L1_HOLD_TARGET_S - this.holdTime;
        if (remaining > 0) {
          const add = Math.min(dt, remaining);
          this.holdTime += add;
          this.ctx.scoring.addPoints(add * SCORING.L1_HOLD_POINTS_PER_S);
        }
      }
      if (!this.wasInBiting) this.ctx.ui.toast('🟢 ¡Punto de contacto! Sostén aquí', 'good');
    } else {
      this.disc.material.emissiveIntensity = 0;
      this.disc.position.y = 0;
      this.flywheel.position.y = 0;
    }
    this.wasInBiting = inBiting;

    // HUD: rpm baja un poco al transmitir fuerza (carga del motor).
    const rpm = ENGINE.IDLE_RPM + (1 - transfer) * 200 + (inBiting ? 0 : 0);
    const speed = transfer * 6;
    store.updateVehicle({ rpm, speed });
    this.ctx.ui.updateHud({ rpm, speed, gearLabel: '1ª', forcePct: transfer * 100 });

    // Completar nivel al sostener lo suficiente.
    if (!this.done && this.holdTime >= SCORING.L1_HOLD_TARGET_S) {
      this._complete();
    }
  }

  _complete() {
    this.done = true;
    this.ctx.ui.toast('¡Dominaste el punto de contacto! 🎉', 'good');
    this.ctx.onComplete();
  }

  _engagementLabel(v) {
    if (v < CLUTCH.BITING_MIN) return '🔵 desacoplado';
    if (v <= CLUTCH.BITING_MAX) return '🟢 punto de contacto';
    return '⚪ acoplado';
  }

  // --- helpers de geometría ------------------------------------------------
  _addSpokes(disc, radius, color) {
    const g = new THREE.BoxGeometry(0.06, radius * 1.6, 0.24);
    const m = new THREE.MeshStandardMaterial({ color });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(g, m);
      s.rotation.x = (i * Math.PI) / 3;
      disc.add(s);
    }
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
    spr.scale.set(1.6, 0.4, 1);
    return spr;
  }

  teardown() {
    disposeScene(this.scene);
    this.scene = null;
  }
}

// Libera geometrías/materiales para no fugar memoria entre niveles.
export function disposeScene(scene) {
  if (!scene) return;
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}
