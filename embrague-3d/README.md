# El Embrague — Mini-juego educativo 3D

Prototipo **standalone (sandbox)** de un mini-juego en 3D que enseña cómo
funcionan el **embrague** y la **caja de cambios** en carros y motos, para
alumnos principiantes. Está construido desde el inicio para **embeberse dentro
de Tesos Academy** mediante un contrato de integración claro (una única capa
adaptadora), pero corre de forma autónoma sin backend.

> Enfoque 100% en previsualización visual, intuición e interacción. No toca
> bases de datos, Supabase ni backend: todo pasa por `integration/adapter.js`.

---

## Cómo ejecutarlo

Es HTML/JS/Three.js sin build. Sólo necesita servirse por HTTP (los módulos ES
no cargan desde `file://`):

```bash
# desde la raíz del repo
python3 -m http.server 8000
# luego abrir:
#   http://localhost:8000/embrague-3d/index.html            (sandbox, MockAdapter)
#   http://localhost:8000/embrague-3d/tesos-parent-demo.html (embebido en un host, PostMessageAdapter)
```

- **Mobile-first**: diseñado primero para móvil vertical (~380px). El canvas 3D
  va arriba y los controles (sliders/botones) abajo, cómodos con el pulgar.
- **Offline / autónomo**: Three.js está vendorizado en `vendor/three.module.js`
  (r160). No hay peticiones a CDNs ni assets externos (Fase 1 = geometrías
  nativas de Three.js).
- **Rendimiento**: `pixelRatio` limitado a 2, geometrías de bajo poligonaje, y
  el render loop se **pausa** cuando la pestaña no está visible.

---

## Los 3 niveles

| Nivel | Concepto | Interacción | Puntaje |
|------|----------|-------------|---------|
| **1 · Punto de contacto** | Acoplar vs. desacoplar la fuerza del motor. | Slider (pedal/maneta). Discos que se juntan/separan; zona **verde** = biting point. | Puntos por **localizar y sostener** el punto de contacto; penaliza cruzarlo de golpe. |
| **2 · Relación de cambios** | Fuerza (torque) vs. velocidad. | Engranajes de tamaño variable + selector de marcha, en 3 situaciones. | Puntos por asociar **marcha ↔ situación** (1ª para arrancar, 5ª en autopista…). |
| **3 · Transición** | Secuencia correcta para cambiar sin calar ni desgastar. | Acelerador + embrague + caja. Guía paso a paso. | Máximo si completa la secuencia limpia; penaliza cada error. |

**Errores comunes detectados en el Nivel 3** (con feedback visual + penalización
y evento `ERROR_MADE`): calar el motor (`stall`), patinar el embrague
(`clutch_slip`) y rodar con el embrague pisado sin freno motor
(`no_engine_brake`).

Al terminar los 3 niveles se dispara `SESSION_COMPLETE` y se muestra el
**leaderboard**.

---

## Arquitectura (responsabilidad única)

```
embrague-3d/
├── index.html                # sandbox (entry). importmap -> vendor/three
├── tesos-parent-demo.html    # host de ejemplo que embebe el juego en un iframe
├── vendor/three.module.js    # Three.js r160 (ESM, local)
├── css/game.css              # estilos mobile-first
├── integration/
│   └── adapter.js            # (e) CAPA DE INTEGRACIÓN: interfaz + MockAdapter + PostMessageAdapter
└── src/
    ├── config.js             # constantes ÚNICAS (puntajes, umbrales, textos, nomenclatura)
    ├── events.js             # EventEmitter (bus interno)
    ├── state.js              # (b) gameState: store plano y observable, única fuente de verdad
    ├── scoring.js            # (c) lógica de puntaje + construcción de los payloads del contrato
    ├── scene.js              # (a) SceneManager: renderer, resize, pixelRatio, pausa, render loop
    ├── ui.js                 # (d) UI: sliders, botones, tacómetro, microcopy, leaderboard, overlays
    ├── game.js               # orquestador (único módulo que conoce a todos)
    └── levels/
        ├── level1.js         # punto de contacto
        ├── level2.js         # relación de cambios
        └── level3.js         # secuencia de transición + detección de errores
```

El juego **sólo depende de la interfaz `TesosAdapter`**. La selección de
implementación ocurre en **una sola línea** de `game.js`.

---

## Contrato de integración con Tesos Academy

### Entrada — identidad del usuario (orden de prioridad)

1. `window.postMessage` `{ type: 'TESOS_INIT', payload: { userId, displayName } }`
   desde la app padre (iframe).
2. Parámetros de URL: `?userId=...&displayName=...`.
3. Usuario **mock** por defecto: `{ userId: 'demo-user', displayName: 'Invitado' }`.

```ts
interface TesosUserContext { userId: string; displayName: string; source: 'tesos-academy' | 'sandbox'; }
```

### Salida — eventos (esquema fijo)

Se emiten por `window.parent.postMessage` **y** por un `CustomEvent` interno
(`tesos:event`). Nunca por `console.log` (que sólo se usa como *listener* de
demostración).

```ts
type TesosEvent =
  | { type: 'GAME_READY' }
  | { type: 'LEVEL_COMPLETE';   payload: LevelResult }
  | { type: 'SESSION_COMPLETE'; payload: SessionResult }
  | { type: 'ERROR_MADE';       payload: { level: number; errorCode: string } };

interface LevelResult   { userId; moduleId:'embrague-3d'; level; score; maxScore; errors; durationMs; completedAt; }
interface SessionResult { userId; moduleId:'embrague-3d'; totalScore; totalMaxScore; levelsCompleted; completedAt; }
```

### La interfaz (única superficie de integración)

```ts
interface TesosAdapter {
  getUserContext(): Promise<TesosUserContext>;
  reportLevelResult(result: LevelResult): void;
  reportSessionResult(result: SessionResult): void;
  getLeaderboard(moduleId: string): Promise<Array<{ displayName: string; totalScore: number }>>;
}
```

- **`MockAdapter`** (sandbox): resuelve el usuario, emite los eventos y guarda /
  siembra el leaderboard en `localStorage`.
- **`PostMessageAdapter`** (producción): emite los eventos hacia el host y le
  **pide** el leaderboard (Tesos Academy es la fuente de verdad). No persiste
  nada localmente.

Cambiar de uno a otro **no toca la lógica del juego**:

```js
// src/game.js — única línea de intercambio:
this.adapter = new MockAdapter();
// producción:
// this.adapter = new PostMessageAdapter('https://app.tesos-academy.com');
```

---

## Cómo embeberlo en Tesos Academy (`<iframe>` + `postMessage`)

1. **Insertar el iframe** apuntando al juego (con el flag para el adaptador de
   producción):

   ```html
   <iframe
     src="https://tu-cdn/embrague-3d/index.html?adapter=postmessage"
     width="400" height="820" style="border:0;border-radius:20px"
     title="Mini-juego El Embrague"></iframe>
   ```

2. **Inyectar el usuario** cuando el iframe cargue:

   ```js
   iframe.addEventListener('load', () => {
     iframe.contentWindow.postMessage({
       type: 'TESOS_INIT',
       payload: { userId: alumno.id, displayName: alumno.nombre },
     }, 'https://tu-cdn'); // usa el origin exacto en producción
   });
   ```

3. **Escuchar los resultados** y persistirlos en el backend de Tesos:

   ```js
   window.addEventListener('message', (e) => {
     // if (e.origin !== 'https://tu-cdn') return;   // valida el origin
     const { type, payload } = e.data || {};
     if (type === 'LEVEL_COMPLETE')   guardarNivel(payload);
     if (type === 'SESSION_COMPLETE') guardarSesion(payload);   // fuente de verdad del ranking
     if (type === 'ERROR_MADE')       registrarError(payload);
   });
   ```

4. **Responder al pedido de leaderboard** del juego:

   ```js
   window.addEventListener('message', (e) => {
     if (e.data?.type === 'GET_LEADERBOARD') {
       const rows = await tesos.rankingDe(e.data.payload.moduleId); // [{displayName, totalScore}]
       iframe.contentWindow.postMessage({
         type: 'LEADERBOARD_DATA',
         payload: { requestId: e.data.payload.requestId, rows },
       }, 'https://tu-cdn');
     }
   });
   ```

`tesos-parent-demo.html` es una implementación funcional de estos 4 pasos que
sirve como referencia.

---

## Balanceo del juego

Todo el balance (puntos, penalizaciones, zona del biting point, RPM, relaciones
de cambio, textos y nomenclatura carro/moto) vive en **`src/config.js`**. No hay
números mágicos repartidos por el código.

## Fase 2 (opcional)

Sustituir las geometrías nativas por modelos **GLTF/GLB** ligeros desde una
carpeta `/assets`, sin cambiar la arquitectura ni el contrato de integración.
