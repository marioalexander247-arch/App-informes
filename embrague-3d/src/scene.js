// ============================================================================
// scene.js — SceneManager: dueño del renderer WebGL y del render loop.
// Cada nivel aporta su propia THREE.Scene + THREE.Camera y su update(dt); el
// SceneManager sólo se ocupa de renderizar el nivel activo, redimensionar,
// limitar el pixelRatio y pausar el loop cuando la pestaña no está visible.
// ============================================================================

import * as THREE from 'three';
import { PERF } from './config.js';

export class SceneManager {
  /** @param {HTMLElement} container elemento donde va el canvas 3D */
  constructor(container) {
    this.container = container;
    this.active = null;   // nivel activo con { scene, camera, update(dt) }
    this._running = false;
    this._lastT = 0;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERF.MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._tick = this._tick.bind(this);

    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._onResize();
  }

  /** Fija el nivel activo (objeto con scene, camera y opcional update). */
  setActive(level) {
    this.active = level;
    this._onResize(); // reajusta la cámara del nuevo nivel al tamaño actual
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastT = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _tick(now) {
    if (!this._running) return;
    const dt = Math.min((now - this._lastT) / 1000, 0.05); // clamp anti-saltos
    this._lastT = now;

    if (this.active) {
      this.active.update?.(dt);
      this.renderer.render(this.active.scene, this.active.camera);
    }
    this._rafId = requestAnimationFrame(this._tick);
  }

  _onResize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const cam = this.active?.camera;
    if (cam && cam.isPerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  // Pausa el loop cuando la pestaña se oculta (ahorro de batería / GPU).
  _onVisibility() {
    if (document.hidden) this.stop();
    else this.start();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.renderer.dispose();
  }
}

// ----------------------------------------------------------------------------
// Helpers de escena compartidos por los niveles (iluminación estándar, etc.).
// ----------------------------------------------------------------------------
export function makeStandardScene() {
  const scene = new THREE.Scene();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2d33, 0.9);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 6, 5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x66aaff, 0.4);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  return scene;
}

export function makeCamera(container, { z = 8, y = 1.5, fov = 45 } = {}) {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 100);
  cam.position.set(0, y, z);
  cam.lookAt(0, 0, 0);
  return cam;
}
